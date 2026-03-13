"""
SSE stream translation: OpenAI streaming → Anthropic SSE format.

OpenAI streams chunks like:
  data: {"choices": [{"delta": {"content": "Hello"}, "index": 0}]}
  data: {"choices": [{"delta": {"tool_calls": [{"index": 0, ...}]}}]}
  data: [DONE]

Anthropic expects:
  event: message_start
  data: {"type": "message_start", "message": {...}}

  event: content_block_start
  data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}

  event: content_block_delta
  data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}}

  event: content_block_stop
  data: {"type": "content_block_stop", "index": 0}

  event: message_delta
  data: {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {...}}

  event: message_stop
  data: {"type": "message_stop"}
"""

import http.client
import json
import logging
from typing import Any, Generator

logger = logging.getLogger(__name__)


def _normalize_stream_text_delta(fragment: str, state: dict[str, Any]) -> str:
    """Normalize upstream text deltas to avoid repeated output.

    Some OpenAI-compatible providers intermittently resend:
    - identical deltas (same fragment repeated), or
    - cumulative snapshots (full text-so-far each chunk).

    This helper returns only the new suffix that should be emitted.
    """
    if not fragment:
        return ""

    emitted = str(state.get("emitted", ""))
    last_raw = str(state.get("last_raw", ""))

    # Drop repeated long snapshots/deltas that are commonly provider retransmits.
    # Keep tiny repeats to avoid harming legitimate token repetition.
    if fragment == last_raw and len(fragment) >= 16:
        return ""

    # Cumulative snapshot mode: provider sends full text-so-far each event.
    if emitted and fragment.startswith(emitted):
        suffix = fragment[len(emitted):]
        state["last_raw"] = fragment
        if suffix:
            state["emitted"] = emitted + suffix
        return suffix

    # Duplicate full snapshot (exact text-so-far) – nothing new.
    if emitted and fragment == emitted:
        state["last_raw"] = fragment
        return ""

    # Default incremental mode.
    state["last_raw"] = fragment
    state["emitted"] = emitted + fragment
    return fragment


def _extract_text_fragments(value: Any) -> list[str]:
    """Normalize upstream text/reasoning payloads into text fragments.

    Providers may stream deltas as plain strings, dicts, or typed lists.
    We coerce common variants to keep Anthropic event emission stable.
    """
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        fragments: list[str] = []
        for key in ("text", "thinking", "content", "reasoning", "delta", "value"):
            raw = value.get(key)
            if isinstance(raw, str) and raw:
                fragments.append(raw)
            elif isinstance(raw, (dict, list)):
                fragments.extend(_extract_text_fragments(raw))
        return fragments
    if isinstance(value, list):
        fragments: list[str] = []
        for item in value:
            if isinstance(item, str):
                if item:
                    fragments.append(item)
                continue
            if isinstance(item, dict):
                item_type = str(item.get("type", "")).lower()
                # Typed chunks from newer OpenAI-compatible streams.
                if item_type in {"text", "output_text", "reasoning", "thinking"}:
                    fragments.extend(_extract_text_fragments(item))
                    continue
                fragments.extend(_extract_text_fragments(item.get("text")))
                fragments.extend(_extract_text_fragments(item.get("content")))
                fragments.extend(_extract_text_fragments(item.get("reasoning")))
                fragments.extend(_extract_text_fragments(item.get("thinking")))
                continue
            fragments.extend(_extract_text_fragments(item))
        return fragments
    return []


def _make_message_start(model: str) -> str:
    """Emit the Anthropic message_start event."""
    return json.dumps({
        "type": "message_start",
        "message": {
            "id": "msg_proxy",
            "type": "message",
            "role": "assistant",
            "content": [],
            "model": model,
            "stop_reason": None,
            "stop_sequence": None,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        },
    })


def _make_content_block_start(index: int, block_type: str, **kwargs: Any) -> str:
    block: dict[str, Any] = {"type": block_type}
    if block_type == "text":
        block["text"] = ""
    elif block_type == "tool_use":
        block["id"] = kwargs.get("id", "")
        block["name"] = kwargs.get("name", "")
        block["input"] = {}
    elif block_type == "thinking":
        block["thinking"] = ""
    return json.dumps({
        "type": "content_block_start",
        "index": index,
        "content_block": block,
    })


def _make_content_block_delta(index: int, delta_type: str, **kwargs: Any) -> str:
    delta: dict[str, Any] = {"type": delta_type}
    if delta_type == "text_delta":
        delta["text"] = kwargs.get("text", "")
    elif delta_type == "input_json_delta":
        delta["partial_json"] = kwargs.get("partial_json", "")
    elif delta_type == "thinking_delta":
        delta["thinking"] = kwargs.get("thinking", "")
    elif delta_type == "signature_delta":
        delta["signature"] = kwargs.get("signature", "")
    return json.dumps({
        "type": "content_block_delta",
        "index": index,
        "delta": delta,
    })


def _make_content_block_stop(index: int) -> str:
    return json.dumps({"type": "content_block_stop", "index": index})


def _make_message_delta(
    stop_reason: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    extra_usage: dict[str, Any] | None = None,
) -> str:
    usage: dict[str, int] = {"output_tokens": output_tokens}
    if input_tokens > 0:
        usage["input_tokens"] = input_tokens
    if extra_usage:
        for key, value in extra_usage.items():
            if value is not None:
                usage[key] = value
    return json.dumps({
        "type": "message_delta",
        "delta": {"stop_reason": stop_reason, "stop_sequence": None},
        "usage": usage,
    })


def _make_message_stop() -> str:
    return json.dumps({"type": "message_stop"})


def openai_stream_to_anthropic(
    response: http.client.HTTPResponse,
    model: str = "proxy",
) -> Generator[str, None, None]:
    """
    Translate an OpenAI-format SSE stream into Anthropic-format SSE events.

    This handles:
    - Text deltas → content_block_start + content_block_delta + content_block_stop
    - Tool call deltas → tool_use content blocks with input_json_delta
    - [DONE] → message_delta + message_stop
    """
    # Emit message_start
    yield f"event: message_start\ndata: {_make_message_start(model)}"

    # State tracking
    text_block_started = False
    text_block_index = 0
    thinking_block_started = False
    thinking_block_index = 0
    tool_blocks: dict[int, dict[str, Any]] = {}  # openai tool index → state
    next_block_index = 0
    stop_reason = "end_turn"
    total_output_tokens = 0
    total_input_tokens = 0
    extra_usage: dict[str, Any] = {}
    text_delta_state: dict[str, Any] = {"emitted": "", "last_raw": ""}
    thinking_delta_state: dict[str, Any] = {"emitted": "", "last_raw": ""}

    chunk_count = 0
    try:
        for raw_line in response:
            line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
            # Log first few chunks and any chunks containing tool_calls or reasoning
            chunk_count += 1
            if chunk_count <= 5 or "tool_call" in line or "reasoning" in line or "thinking" in line:
                logger.debug("SSE chunk #%d: %s", chunk_count, line[:500])

            if not line.startswith("data: "):
                continue

            data_str = line[6:]  # Strip "data: "

            if data_str.strip() == "[DONE]":
                break

            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                logger.debug("Malformed SSE data chunk, skipping: %s", data_str[:200])
                continue

            # Check for error response
            if "error" in chunk:
                error_msg = chunk["error"].get("message", "Unknown upstream error") if isinstance(chunk["error"], dict) else str(chunk["error"])
                # Close any open blocks
                if thinking_block_started:
                    yield f"event: content_block_stop\ndata: {_make_content_block_stop(thinking_block_index)}"
                if text_block_started:
                    yield f"event: content_block_stop\ndata: {_make_content_block_stop(text_block_index)}"
                for tc_state in tool_blocks.values():
                    if tc_state.get("started", False):
                        yield f"event: content_block_stop\ndata: {_make_content_block_stop(tc_state['block_index'])}"
                yield f"event: error\ndata: {json.dumps({'type': 'error', 'error': {'type': 'api_error', 'message': error_msg}})}"
                yield f"event: message_delta\ndata: {_make_message_delta('end_turn', output_tokens=total_output_tokens)}"
                yield f"event: message_stop\ndata: {_make_message_stop()}"
                return

            # Track usage if provided
            usage = chunk.get("usage", {})
            if usage.get("completion_tokens"):
                total_output_tokens = usage["completion_tokens"]
            if usage.get("prompt_tokens"):
                total_input_tokens = usage["prompt_tokens"]
            for key in (
                "cache_creation_input_tokens",
                "cache_read_input_tokens",
                "cache_creation",
                "server_tool_use",
            ):
                if key in usage:
                    extra_usage[key] = usage.get(key)

            choices = chunk.get("choices", [])
            if not choices:
                continue

            choice = choices[0]
            delta = choice.get("delta", {})
            finish_reason = choice.get("finish_reason")

            # Handle reasoning/thinking content deltas.
            reasoning_fragments: list[str] = []
            for key in ("reasoning_content", "reasoning", "thinking", "reasoning_text"):
                reasoning_fragments.extend(_extract_text_fragments(delta.get(key)))
            signature_fragments = _extract_text_fragments(
                delta.get("signature") or delta.get("reasoning_signature")
            )

            if reasoning_fragments:
                if not thinking_block_started:
                    thinking_block_index = next_block_index
                    next_block_index += 1
                    thinking_block_started = True
                    yield f"event: content_block_start\ndata: {_make_content_block_start(thinking_block_index, 'thinking')}"

                for fragment in reasoning_fragments:
                    normalized = _normalize_stream_text_delta(fragment, thinking_delta_state)
                    if normalized:
                        yield f"event: content_block_delta\ndata: {_make_content_block_delta(thinking_block_index, 'thinking_delta', thinking=normalized)}"

            if signature_fragments and thinking_block_started:
                for signature in signature_fragments:
                    yield f"event: content_block_delta\ndata: {_make_content_block_delta(thinking_block_index, 'signature_delta', signature=signature)}"

            # Handle text content deltas
            content = delta.get("content")
            if content is not None:
                content_fragments = _extract_text_fragments(content)
                if not content_fragments:
                    continue
                # Close thinking block before starting text block
                if thinking_block_started:
                    yield f"event: content_block_stop\ndata: {_make_content_block_stop(thinking_block_index)}"
                    thinking_block_started = False
                if not text_block_started:
                    text_block_index = next_block_index
                    next_block_index += 1
                    text_block_started = True
                    yield f"event: content_block_start\ndata: {_make_content_block_start(text_block_index, 'text')}"

                for fragment in content_fragments:
                    normalized = _normalize_stream_text_delta(fragment, text_delta_state)
                    if normalized:
                        yield f"event: content_block_delta\ndata: {_make_content_block_delta(text_block_index, 'text_delta', text=normalized)}"

            # Handle tool call deltas
            tool_calls = delta.get("tool_calls", [])
            if tool_calls:
                logger.debug("Tool calls detected in delta: %s", tool_calls)
            for tc in tool_calls:
                tc_index = tc.get("index", 0)

                if tc_index not in tool_blocks:
                    # Close thinking block if open (must close before tool_use)
                    if thinking_block_started:
                        yield f"event: content_block_stop\ndata: {_make_content_block_stop(thinking_block_index)}"
                        thinking_block_started = False

                    # Close text block if open
                    if text_block_started:
                        yield f"event: content_block_stop\ndata: {_make_content_block_stop(text_block_index)}"
                        text_block_started = False

                    # New tool call block
                    block_index = next_block_index
                    next_block_index += 1
                    tool_blocks[tc_index] = {
                        "block_index": block_index,
                        "id": tc.get("id", f"call_{tc_index}"),
                        "name": tc.get("function", {}).get("name", ""),
                        "started": False,
                        "buffered_args": "",
                    }

                # Update name if received later
                func = tc.get("function", {})
                if func.get("name") and not tool_blocks[tc_index]["name"]:
                    tool_blocks[tc_index]["name"] = func["name"]

                # Emit start event once we have a name
                state = tool_blocks[tc_index]
                if not state["started"] and state["name"]:
                    yield f"event: content_block_start\ndata: {_make_content_block_start(state['block_index'], 'tool_use', id=state['id'], name=state['name'])}"
                    state["started"] = True
                    # Flush buffered args
                    if state["buffered_args"]:
                        yield f"event: content_block_delta\ndata: {_make_content_block_delta(state['block_index'], 'input_json_delta', partial_json=state['buffered_args'])}"
                        state["buffered_args"] = ""

                # Handle argument deltas
                arg_delta = func.get("arguments", "")
                if arg_delta:
                    if state["started"]:
                        yield f"event: content_block_delta\ndata: {_make_content_block_delta(state['block_index'], 'input_json_delta', partial_json=arg_delta)}"
                    else:
                        state["buffered_args"] += arg_delta

            # Handle finish
            if finish_reason:
                logger.debug("Finish reason: %s", finish_reason)
                if finish_reason == "tool_calls":
                    stop_reason = "tool_use"
                elif finish_reason == "stop":
                    stop_reason = "end_turn"
                elif finish_reason == "length":
                    stop_reason = "max_tokens"
                else:
                    stop_reason = "end_turn"
    except Exception:
        logger.warning("[openai_stream_to_anthropic] Stream interrupted by exception", exc_info=True)
        # Set stop_reason to indicate truncation
        stop_reason = "max_tokens"
    finally:
        # Close any open blocks — always runs, even on stream exceptions
        if thinking_block_started:
            yield f"event: content_block_stop\ndata: {_make_content_block_stop(thinking_block_index)}"

        if text_block_started:
            yield f"event: content_block_stop\ndata: {_make_content_block_stop(text_block_index)}"

        for tc_state in tool_blocks.values():
            if tc_state.get("started", False):
                yield f"event: content_block_stop\ndata: {_make_content_block_stop(tc_state['block_index'])}"

        # Emit message_delta and message_stop
        yield (
            "event: message_delta\ndata: "
            f"{_make_message_delta(stop_reason, input_tokens=total_input_tokens, output_tokens=total_output_tokens, extra_usage=extra_usage)}"
        )

        yield f"event: message_stop\ndata: {_make_message_stop()}"


def responses_stream_to_anthropic(
    response: http.client.HTTPResponse,
    model: str = "proxy",
) -> Generator[str, None, None]:
    """Translate an OpenAI Responses API SSE stream into Anthropic SSE events.

    The Responses API emits events like:
      - response.output_text.delta → text content
      - response.function_call_arguments.delta → tool call args
      - response.output_item.added → new output item (message or function_call)
      - response.output_item.done → output item completed
      - response.completed → done
    """
    yield f"event: message_start\ndata: {_make_message_start(model)}"

    text_block_started = False
    text_block_index = 0
    thinking_block_started = False
    thinking_block_index = 0
    next_block_index = 0
    # Track function_call items by their output_index
    tool_blocks: dict[int, dict[str, Any]] = {}
    stop_reason = "end_turn"
    total_output_tokens = 0
    total_input_tokens = 0
    extra_usage: dict[str, Any] = {}
    text_delta_state: dict[str, Any] = {"emitted": "", "last_raw": ""}
    thinking_delta_state: dict[str, Any] = {"emitted": "", "last_raw": ""}

    chunk_count = 0
    try:
        for raw_line in response:
            line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
            chunk_count += 1

            if not line.startswith("data: "):
                continue

            data_str = line[6:]
            if data_str.strip() == "[DONE]":
                break

            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                logger.debug("Malformed SSE data chunk, skipping: %s", data_str[:200])
                continue

            event_type = chunk.get("type", "")
            if chunk_count <= 10:
                logger.debug("Responses SSE #%d: type=%s data=%s", chunk_count, event_type, data_str[:500])

            # Log all function-call related events at INFO level for debugging
            if "function_call" in event_type or "output_item" in event_type:
                logger.info("Responses tool event #%d: type=%s data=%s", chunk_count, event_type, data_str[:500])

            if event_type == "response.output_text.delta":
                text = chunk.get("delta", "")
                if text:
                    normalized = _normalize_stream_text_delta(str(text), text_delta_state)
                    if not normalized:
                        continue
                    if thinking_block_started:
                        yield f"event: content_block_stop\ndata: {_make_content_block_stop(thinking_block_index)}"
                        thinking_block_started = False
                    if not text_block_started:
                        text_block_index = next_block_index
                        next_block_index += 1
                        text_block_started = True
                        yield f"event: content_block_start\ndata: {_make_content_block_start(text_block_index, 'text')}"
                    yield f"event: content_block_delta\ndata: {_make_content_block_delta(text_block_index, 'text_delta', text=normalized)}"

            elif "reasoning" in event_type and event_type.endswith(".delta"):
                fragments = _extract_text_fragments(chunk.get("delta"))
                if not fragments:
                    fragments = _extract_text_fragments(chunk.get("item"))
                if fragments:
                    if text_block_started:
                        yield f"event: content_block_stop\ndata: {_make_content_block_stop(text_block_index)}"
                        text_block_started = False
                    if not thinking_block_started:
                        thinking_block_index = next_block_index
                        next_block_index += 1
                        thinking_block_started = True
                        yield f"event: content_block_start\ndata: {_make_content_block_start(thinking_block_index, 'thinking')}"
                    for fragment in fragments:
                        normalized = _normalize_stream_text_delta(fragment, thinking_delta_state)
                        if normalized:
                            yield f"event: content_block_delta\ndata: {_make_content_block_delta(thinking_block_index, 'thinking_delta', thinking=normalized)}"

            elif event_type == "response.output_item.added":
                item = chunk.get("item", {})
                item_type = item.get("type", "")
                output_index = chunk.get("output_index", 0)

                if item_type == "function_call":
                    if text_block_started:
                        yield f"event: content_block_stop\ndata: {_make_content_block_stop(text_block_index)}"
                        text_block_started = False

                    block_idx = next_block_index
                    next_block_index += 1
                    call_id = item.get("call_id", f"call_{output_index}")
                    name = item.get("name", "")
                    tool_blocks[output_index] = {
                        "block_index": block_idx,
                        "id": call_id,
                        "name": name,
                    }
                    yield f"event: content_block_start\ndata: {_make_content_block_start(block_idx, 'tool_use', id=call_id, name=name)}"

            elif event_type == "response.function_call_arguments.delta":
                output_index = chunk.get("output_index", 0)
                delta = chunk.get("delta", "")
                if output_index in tool_blocks and delta:
                    block_idx = tool_blocks[output_index]["block_index"]
                    yield f"event: content_block_delta\ndata: {_make_content_block_delta(block_idx, 'input_json_delta', partial_json=delta)}"

            elif event_type == "response.function_call_arguments.done":
                output_index = chunk.get("output_index", 0)
                if output_index in tool_blocks:
                    block_idx = tool_blocks[output_index]["block_index"]
                    yield f"event: content_block_stop\ndata: {_make_content_block_stop(block_idx)}"
                    tool_blocks[output_index]["closed"] = True

            elif event_type == "response.output_text.done":
                if text_block_started:
                    yield f"event: content_block_stop\ndata: {_make_content_block_stop(text_block_index)}"
                    text_block_started = False

            elif "reasoning" in event_type and event_type.endswith(".done"):
                if thinking_block_started:
                    yield f"event: content_block_stop\ndata: {_make_content_block_stop(thinking_block_index)}"
                    thinking_block_started = False

            elif event_type == "response.completed":
                resp_obj = chunk.get("response", {})
                usage = resp_obj.get("usage", {})
                total_output_tokens = usage.get("output_tokens", 0)
                total_input_tokens = usage.get("input_tokens", 0)
                for key in (
                    "cache_creation_input_tokens",
                    "cache_read_input_tokens",
                    "cache_creation",
                    "server_tool_use",
                ):
                    if key in usage:
                        extra_usage[key] = usage.get(key)
                status = resp_obj.get("status", "completed")
                if status == "incomplete":
                    stop_reason = "max_tokens"

            elif event_type == "error":
                logger.error("Responses API error: %s", chunk)
                error_msg = chunk.get("message", "Unknown upstream error")
                if isinstance(error_msg, dict):
                    error_msg = error_msg.get("message", str(error_msg))
                # Close any open blocks
                if text_block_started:
                    yield f"event: content_block_stop\ndata: {_make_content_block_stop(text_block_index)}"
                    text_block_started = False
                for tb in tool_blocks.values():
                    if not tb.get("closed"):
                        yield f"event: content_block_stop\ndata: {_make_content_block_stop(tb['block_index'])}"
                yield f"event: error\ndata: {json.dumps({'type': 'error', 'error': {'type': 'api_error', 'message': str(error_msg)}})}"
                yield f"event: message_delta\ndata: {_make_message_delta('end_turn', output_tokens=total_output_tokens)}"
                yield f"event: message_stop\ndata: {_make_message_stop()}"
                return
    except Exception:
        logger.warning("[responses_stream_to_anthropic] Stream interrupted by exception", exc_info=True)
        stop_reason = "max_tokens"
    finally:
        # Close any remaining open blocks — always runs, even on stream exceptions
        if text_block_started:
            yield f"event: content_block_stop\ndata: {_make_content_block_stop(text_block_index)}"

        if thinking_block_started:
            yield f"event: content_block_stop\ndata: {_make_content_block_stop(thinking_block_index)}"

        for tb in tool_blocks.values():
            if not tb.get("closed"):
                yield f"event: content_block_stop\ndata: {_make_content_block_stop(tb['block_index'])}"

        # Only set tool_use if no explicit stop_reason received
        if tool_blocks and stop_reason == "end_turn":
            stop_reason = "tool_use"

        yield (
            "event: message_delta\ndata: "
            f"{_make_message_delta(stop_reason, input_tokens=total_input_tokens, output_tokens=total_output_tokens, extra_usage=extra_usage)}"
        )
        yield f"event: message_stop\ndata: {_make_message_stop()}"
