"""
Bidirectional message format translation: Anthropic ↔ OpenAI.

Anthropic Messages API uses content blocks:
  {"role": "user", "content": [{"type": "text", "text": "..."}]}

OpenAI Chat Completions uses flat strings or structured content:
  {"role": "user", "content": "..."}

Key differences handled:
  - Anthropic tool_use content blocks → OpenAI tool_calls array
  - Anthropic tool_result content blocks → OpenAI role:"tool" messages
  - Anthropic thinking blocks → dropped (OpenAI models reason internally)
  - Anthropic system as top-level field → OpenAI system message at index 0
  - Anthropic input: {object} → OpenAI arguments: "json string"
"""

import json
import uuid
from typing import Any


# =============================================================================
# Stage 1 Helpers: Normalize Anthropic blocks into intermediate events
# =============================================================================

def _normalize_text_block(block: dict[str, Any]) -> dict[str, Any]:
    """Normalize an Anthropic text block to an intermediate event."""
    return {"event": "text", "text": block.get("text", "")}


def _normalize_tool_use_block(block: dict[str, Any]) -> dict[str, Any]:
    """Normalize an Anthropic tool_use block to an intermediate event."""
    return {
        "event": "tool_use",
        "id": block.get("id", f"toolu_{uuid.uuid4().hex[:24]}"),
        "name": block.get("name", "unknown_tool"),
        "input": block.get("input", {}),
    }


def _normalize_tool_result_block(block: dict[str, Any]) -> dict[str, Any]:
    """Normalize an Anthropic tool_result block to an intermediate event."""
    result_content = block.get("content", "")
    if isinstance(result_content, list):
        result_content = "\n".join(
            b.get("text", "") for b in result_content
            if b.get("type") == "text"
        )
    return {
        "event": "tool_result",
        "tool_use_id": block.get("tool_use_id", ""),
        "content": str(result_content),
    }


def _normalize_image_block(block: dict[str, Any]) -> dict[str, Any]:
    """Normalize an Anthropic image block to an intermediate event."""
    source = block.get("source", {})
    media_type = source.get("media_type", "image")
    return {"event": "text", "text": f"[Image: {media_type}]"}


# Map block types to their normalizer functions
_BLOCK_NORMALIZERS: dict[str, Any] = {
    "text": _normalize_text_block,
    "tool_use": _normalize_tool_use_block,
    "tool_result": _normalize_tool_result_block,
    "image": _normalize_image_block,
    # "thinking" is intentionally omitted — these blocks are dropped
}


def _normalize_content_blocks(
    content: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Stage 1: Normalize a list of Anthropic content blocks into
    an intermediate event stream that preserves original ordering.

    Each event has an "event" key: "text", "tool_use", or "tool_result".
    Unknown/unsupported block types (e.g. "thinking") are dropped.
    """
    events: list[dict[str, Any]] = []
    for block in content:
        normalizer = _BLOCK_NORMALIZERS.get(block.get("type", ""))
        if normalizer:
            events.append(normalizer(block))
    return events


# =============================================================================
# Stage 2 Helpers: Map intermediate events to OpenAI messages by role
# =============================================================================

def _emit_assistant_messages(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Map normalized events for an assistant turn to OpenAI messages.

    Collects text and tool_use events. Skips empty assistant messages
    (e.g. thinking-only blocks that were dropped in Stage 1).
    """
    text_parts: list[str] = []
    tool_calls: list[dict[str, Any]] = []

    for evt in events:
        if evt["event"] == "text":
            text_parts.append(evt["text"])
        elif evt["event"] == "tool_use":
            tool_calls.append({
                "id": evt["id"],
                "type": "function",
                "function": {
                    "name": evt["name"],
                    "arguments": json.dumps(evt["input"]),
                },
            })

    if not text_parts and not tool_calls:
        return []

    msg: dict[str, Any] = {"role": "assistant"}
    msg["content"] = "\n".join(text_parts) if text_parts else ""
    if tool_calls:
        msg["tool_calls"] = tool_calls
    return [msg]


def _emit_user_messages(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Map normalized events for a user turn to OpenAI messages.

    Preserves Anthropic block ordering: when text and tool_result blocks
    are interleaved, text is flushed as a user message before each
    tool_result becomes a tool message. This keeps the OpenAI sequence valid.
    """
    messages: list[dict[str, Any]] = []
    pending_text: list[str] = []

    for evt in events:
        if evt["event"] == "text":
            pending_text.append(evt["text"])
        elif evt["event"] == "tool_result":
            # Flush pending text before the tool message
            if pending_text:
                messages.append({
                    "role": "user",
                    "content": "\n".join(pending_text),
                })
                pending_text = []
            messages.append({
                "role": "tool",
                "tool_call_id": evt["tool_use_id"],
                "content": evt["content"],
            })

    # Emit any remaining text
    if pending_text:
        messages.append({
            "role": "user",
            "content": "\n".join(pending_text),
        })

    return messages


# Role-specific emission mappers
_ROLE_EMITTERS = {
    "assistant": _emit_assistant_messages,
    "user": _emit_user_messages,
}


def anthropic_to_openai_messages(
    anthropic_body: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Convert Anthropic-format messages array + system prompt
    into OpenAI-format messages array.

    Uses a two-stage architecture:
      Stage 1: Normalize Anthropic content blocks into intermediate events
      Stage 2: Map events to OpenAI messages via role-specific emitters
    """
    openai_messages: list[dict[str, Any]] = []

    # System prompt → system message
    system = anthropic_body.get("system")
    if system:
        if isinstance(system, str):
            openai_messages.append({"role": "system", "content": system})
        elif isinstance(system, list):
            # Anthropic allows system as list of content blocks
            text_parts = [
                b.get("text", "") for b in system if b.get("type") == "text"
            ]
            openai_messages.append({"role": "system", "content": "\n".join(text_parts)})

    for msg in anthropic_body.get("messages", []):
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if isinstance(content, str):
            openai_messages.append({"role": role, "content": content})
            continue

        # Stage 1: Normalize blocks to intermediate events
        events = _normalize_content_blocks(content)

        # Stage 2: Map events to OpenAI messages via role-specific emitter
        emitter = _ROLE_EMITTERS.get(role)
        if emitter:
            openai_messages.extend(emitter(events))
        elif events:
            # Fallback for unknown roles: emit text parts as-is
            text = "\n".join(e["text"] for e in events if e["event"] == "text")
            if text:
                openai_messages.append({"role": role, "content": text})

    return openai_messages


def _sanitize_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Sanitize a JSON Schema for maximum provider compatibility.

    Strips features unsupported by upstream model APIs (Gemini, some
    OpenAI-compatible endpoints):
    - ``$schema``, ``$id``, ``$comment``, ``$defs``/``definitions`` meta fields
    - ``anyOf`` / ``oneOf`` / ``allOf`` (replaced with first alternative)
    - ``const`` keyword
    - draft-2020 ``exclusiveMinimum``/``exclusiveMaximum`` as values
    - ``pattern`` (not universally supported)
    - ``propertyNames``, ``patternProperties`` (unsupported by Gemini)
    - ``if``/``then``/``else``, ``dependencies``/``dependentRequired``/``dependentSchemas``
    - ``prefixItems``, ``unevaluatedProperties``, ``unevaluatedItems``
    - ``uniqueItems``, ``minProperties``, ``maxProperties``
    - ``contentEncoding``, ``contentMediaType``
    """
    if not isinstance(schema, dict):
        return schema

    # Keywords unsupported by Gemini's function declaration schema
    _STRIP_KEYS = frozenset((
        "$schema", "$id", "$comment", "$defs", "definitions",
        "const", "pattern", "default", "examples",
        "propertyNames", "patternProperties",
        "if", "then", "else",
        "dependencies", "dependentRequired", "dependentSchemas",
        "prefixItems", "unevaluatedProperties", "unevaluatedItems",
        "uniqueItems", "minProperties", "maxProperties",
        "contentEncoding", "contentMediaType",
    ))

    out: dict[str, Any] = {}
    for key, value in schema.items():
        # Drop unsupported keywords
        if key in _STRIP_KEYS:
            continue

        # anyOf / oneOf / allOf → flatten to first variant
        if key in ("anyOf", "oneOf", "allOf") and isinstance(value, list) and value:
            # Pick the first non-null type
            found = False
            for variant in value:
                if isinstance(variant, dict) and variant.get("type") != "null":
                    sanitized = _sanitize_schema(variant)
                    for k, v in sanitized.items():
                        out.setdefault(k, v)  # Don't overwrite existing keys
                    found = True
                    break
            if not found:
                # All variants are null or empty — default to string
                out.setdefault("type", "string")
            continue

        # Convert draft-2020 exclusiveMinimum/Maximum (value) to minimum/maximum
        # For integers: exclusive → inclusive by shifting ±1
        # For floats: keep the value as-is (no safe integer shift)
        if key == "exclusiveMinimum" and isinstance(value, (int, float)):
            out["minimum"] = value + 1 if isinstance(value, int) else value
            continue
        if key == "exclusiveMaximum" and isinstance(value, (int, float)):
            out["maximum"] = value - 1 if isinstance(value, int) else value
            continue

        # Recurse into nested schemas
        if key == "properties" and isinstance(value, dict):
            out[key] = {k: _sanitize_schema(v) for k, v in value.items()}
        elif key == "items" and isinstance(value, dict):
            out[key] = _sanitize_schema(value)
        elif key == "additionalProperties" and isinstance(value, dict):
            out[key] = _sanitize_schema(value)
        else:
            out[key] = value

    return out


def anthropic_to_openai_tools(
    anthropic_tools: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Convert Anthropic tool definitions to OpenAI function format."""
    openai_tools = []
    for tool in anthropic_tools:
        function_obj: dict[str, Any] = {
            "name": tool.get("name", "unknown_tool"),
            "description": tool.get("description", ""),
            "parameters": _sanitize_schema(tool.get("input_schema", {})),
        }
        # Preserve strict tool-mode when provided by client.
        if isinstance(tool.get("strict"), bool):
            function_obj["strict"] = tool["strict"]

        openai_tools.append({
            "type": "function",
            "function": function_obj,
        })
    return openai_tools


def anthropic_tool_choice_to_openai(
    anthropic_tool_choice: dict[str, Any] | None,
) -> tuple[Any | None, bool | None]:
    """Map Anthropic tool_choice to OpenAI-compatible tool controls.

    Returns:
      (tool_choice, parallel_tool_calls)
    """
    if not isinstance(anthropic_tool_choice, dict):
        return (None, None)

    choice_type = str(anthropic_tool_choice.get("type", "")).lower()
    disable_parallel = anthropic_tool_choice.get("disable_parallel_tool_use")
    parallel_tool_calls: bool | None = None
    if isinstance(disable_parallel, bool):
        parallel_tool_calls = not disable_parallel

    if choice_type == "none":
        return ("none", parallel_tool_calls)
    if choice_type == "auto":
        return ("auto", parallel_tool_calls)
    if choice_type == "any":
        # Anthropic "any" means model must use one of available tools.
        return ("required", parallel_tool_calls)
    if choice_type == "tool":
        name = anthropic_tool_choice.get("name")
        if isinstance(name, str) and name:
            return (
                {
                    "type": "function",
                    "function": {"name": name},
                },
                parallel_tool_calls,
            )
    return (None, parallel_tool_calls)


def anthropic_to_responses_input(
    anthropic_body: dict[str, Any],
) -> list[dict[str, Any]]:
    """Convert Anthropic messages to OpenAI Responses API input items.

    Responses API uses typed items instead of Chat Completions messages:
      - ``{"role": "user", "content": "text"}`` — user message
      - ``{"role": "assistant", "content": "text"}`` — assistant text
      - ``{"type": "function_call", "call_id", "name", "arguments"}`` — tool call
      - ``{"type": "function_call_output", "call_id", "output"}`` — tool result
    """
    items: list[dict[str, Any]] = []

    # System prompt → instructions (handled at caller level, but also add
    # as a developer message for compatibility)
    system = anthropic_body.get("system")
    if system:
        text = system
        if isinstance(system, list):
            text = "\n".join(
                b.get("text", "") for b in system if b.get("type") == "text"
            )
        items.append({"role": "developer", "content": text})

    for msg in anthropic_body.get("messages", []):
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if isinstance(content, str):
            items.append({"role": role, "content": content})
            continue

        # Collect text, tool calls, and tool results from content blocks
        text_parts: list[str] = []
        for block in content:
            block_type = block.get("type")

            if block_type == "text":
                text_parts.append(block.get("text", ""))
            elif block_type == "tool_use":
                # Emit any accumulated text first
                if text_parts:
                    items.append({"role": role, "content": "\n".join(text_parts)})
                    text_parts = []
                items.append({
                    "type": "function_call",
                    "call_id": block.get("id", f"toolu_{uuid.uuid4().hex[:24]}"),
                    "name": block.get("name", "unknown_tool"),
                    "arguments": json.dumps(block.get("input", {})),
                })
            elif block_type == "tool_result":
                result_content = block.get("content", "")
                if isinstance(result_content, list):
                    result_content = "\n".join(
                        b.get("text", "") for b in result_content
                        if b.get("type") == "text"
                    )
                items.append({
                    "type": "function_call_output",
                    "call_id": block.get("tool_use_id", ""),
                    "output": str(result_content),
                })
            elif block_type == "thinking":
                pass

        if text_parts:
            items.append({"role": role, "content": "\n".join(text_parts)})

    return items


def anthropic_to_responses_tools(
    anthropic_tools: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Convert Anthropic tools to Responses API flat tool format.

    Responses API uses a flat structure (no nested ``function`` key)::

        {"type": "function", "name": "...", "description": "...", "parameters": {...}}
    """
    tools = []
    for tool in anthropic_tools:
        tools.append({
            "type": "function",
            "name": tool.get("name", "unknown_tool"),
            "description": tool.get("description", ""),
            "parameters": _sanitize_schema(tool.get("input_schema", {})),
        })
    return tools


def openai_to_anthropic_content_blocks(
    openai_choice: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Convert an OpenAI response choice into Anthropic content blocks.
    Used for non-streaming responses.
    """
    message = openai_choice.get("message", {})
    blocks: list[dict[str, Any]] = []

    # Text content
    content = message.get("content")
    if content:
        blocks.append({"type": "text", "text": content})

    # Tool calls
    for tc in message.get("tool_calls", []):
        func = tc.get("function", {})
        try:
            input_obj = json.loads(func.get("arguments", "{}"))
        except json.JSONDecodeError:
            input_obj = {"raw": func.get("arguments", "")}

        blocks.append({
            "type": "tool_use",
            "id": tc.get("id", f"toolu_{uuid.uuid4().hex[:24]}"),
            "name": func.get("name", "unknown_tool"),
            "input": input_obj,
        })

    return blocks
