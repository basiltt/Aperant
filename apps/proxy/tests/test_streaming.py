"""
Tests for SSE stream translation.

Verifies that OpenAI-format streaming chunks are correctly
translated into Anthropic-format SSE events.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from translators.streaming import openai_stream_to_anthropic, responses_stream_to_anthropic


class FakeHTTPResponse:
    """Simulate an HTTP response that yields SSE lines."""

    def __init__(self, lines: list[str]):
        self._lines = [f"{line}\n".encode() for line in lines]

    def __iter__(self):
        return iter(self._lines)


def _extract_data_payloads(events: list[str]) -> list[dict]:
    """Parse the data payload from 'event: ...\ndata: {...}' formatted events."""
    parsed = []
    for e in events:
        # Each event is "event: <type>\ndata: <json>"
        for line in e.split("\n"):
            if line.startswith("data: "):
                try:
                    parsed.append(json.loads(line[6:]))
                except json.JSONDecodeError:
                    pass
    return parsed


def test_simple_text_stream():
    """Text deltas produce content_block_start + deltas + stop."""
    openai_chunks = [
        'data: {"choices": [{"delta": {"content": "Hello"}, "index": 0}]}',
        'data: {"choices": [{"delta": {"content": " world"}, "index": 0}]}',
        'data: {"choices": [{"finish_reason": "stop", "delta": {}}]}',
        "data: [DONE]",
    ]
    resp = FakeHTTPResponse(openai_chunks)
    events = list(openai_stream_to_anthropic(resp, model="gpt-4o"))

    # Should contain message_start, content_block_start, deltas, block_stop,
    # message_delta, message_stop
    parsed = _extract_data_payloads(events)

    types = [p["type"] for p in parsed]
    assert "message_start" in types
    assert "content_block_start" in types
    assert "content_block_delta" in types
    assert "content_block_stop" in types
    assert "message_delta" in types
    assert "message_stop" in types

    # Verify text deltas
    text_deltas = [
        p for p in parsed
        if p["type"] == "content_block_delta"
        and p["delta"]["type"] == "text_delta"
    ]
    assert len(text_deltas) == 2
    assert text_deltas[0]["delta"]["text"] == "Hello"
    assert text_deltas[1]["delta"]["text"] == " world"


def test_tool_call_stream():
    """Tool call deltas produce tool_use content blocks."""
    openai_chunks = [
        'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "call_1", "type": "function", "function": {"name": "read_file", "arguments": ""}}]}}]}',
        'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": "{\\"path\\""}}]}}]}',
        'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": ": \\"test.py\\"}"}}]}}]}',
        'data: {"choices": [{"finish_reason": "tool_calls", "delta": {}}]}',
        "data: [DONE]",
    ]
    resp = FakeHTTPResponse(openai_chunks)
    events = list(openai_stream_to_anthropic(resp, model="gpt-4o"))

    parsed = _extract_data_payloads(events)

    # Should have a tool_use content_block_start
    tool_starts = [
        p for p in parsed
        if p["type"] == "content_block_start"
        and p.get("content_block", {}).get("type") == "tool_use"
    ]
    assert len(tool_starts) == 1
    assert tool_starts[0]["content_block"]["name"] == "read_file"

    # Should have input_json_delta events
    json_deltas = [
        p for p in parsed
        if p["type"] == "content_block_delta"
        and p["delta"]["type"] == "input_json_delta"
    ]
    assert len(json_deltas) >= 1

    # Stop reason should be tool_use
    msg_delta = [p for p in parsed if p["type"] == "message_delta"][0]
    assert msg_delta["delta"]["stop_reason"] == "tool_use"


def test_stop_reason_mapping():
    """finish_reason values map to correct Anthropic stop_reasons."""
    for openai_reason, expected_anthropic in [
        ("stop", "end_turn"),
        ("tool_calls", "tool_use"),
        ("length", "max_tokens"),
    ]:
        chunks = [
            f'data: {{"choices": [{{"delta": {{"content": "x"}}, "finish_reason": "{openai_reason}"}}]}}',
            "data: [DONE]",
        ]
        resp = FakeHTTPResponse(chunks)
        events = list(openai_stream_to_anthropic(resp))
        parsed = _extract_data_payloads(events)
        msg_delta = [p for p in parsed if p["type"] == "message_delta"][0]
        assert msg_delta["delta"]["stop_reason"] == expected_anthropic


def test_reasoning_delta_streamed_as_thinking_block():
    """Reasoning payload variants should produce Anthropic thinking deltas."""
    openai_chunks = [
        'data: {"choices": [{"delta": {"reasoning": {"text": "Analyzing..."}}, "index": 0}]}',
        'data: {"choices": [{"delta": {"content": "Final answer"}, "index": 0}]}',
        'data: {"choices": [{"finish_reason": "stop", "delta": {}}]}',
        "data: [DONE]",
    ]
    resp = FakeHTTPResponse(openai_chunks)
    events = list(openai_stream_to_anthropic(resp, model="claude-sonnet-4.6"))
    parsed = _extract_data_payloads(events)

    thinking_starts = [
        p for p in parsed
        if p.get("type") == "content_block_start"
        and p.get("content_block", {}).get("type") == "thinking"
    ]
    assert len(thinking_starts) == 1

    thinking_deltas = [
        p for p in parsed
        if p.get("type") == "content_block_delta"
        and p.get("delta", {}).get("type") == "thinking_delta"
    ]
    assert len(thinking_deltas) >= 1
    assert any("Analyzing" in d["delta"].get("thinking", "") for d in thinking_deltas)


def test_reasoning_signature_streamed_as_signature_delta():
    openai_chunks = [
        'data: {"choices": [{"delta": {"reasoning": "Plan..."}, "index": 0}]}',
        'data: {"choices": [{"delta": {"reasoning_signature": "sig_abc123"}, "index": 0}]}',
        'data: {"choices": [{"finish_reason": "stop", "delta": {}}]}',
        'data: [DONE]',
    ]
    resp = FakeHTTPResponse(openai_chunks)
    events = list(openai_stream_to_anthropic(resp, model="claude-sonnet-4.6"))
    parsed = _extract_data_payloads(events)

    signature_deltas = [
        p for p in parsed
        if p.get("type") == "content_block_delta"
        and p.get("delta", {}).get("type") == "signature_delta"
    ]
    assert len(signature_deltas) == 1
    assert signature_deltas[0]["delta"]["signature"] == "sig_abc123"


def test_responses_reasoning_delta_streamed_as_thinking_block():
    """Responses API reasoning events should be mapped to thinking blocks."""
    responses_chunks = [
        'data: {"type": "response.reasoning.delta", "delta": "Thinking about constraints"}',
        'data: {"type": "response.reasoning.done"}',
        'data: {"type": "response.output_text.delta", "delta": "Answer text"}',
        'data: {"type": "response.output_text.done"}',
        'data: {"type": "response.completed", "response": {"status": "completed", "usage": {"input_tokens": 11, "output_tokens": 22}}}',
        'data: [DONE]',
    ]
    resp = FakeHTTPResponse(responses_chunks)
    events = list(responses_stream_to_anthropic(resp, model="gpt-5"))
    parsed = _extract_data_payloads(events)

    thinking_deltas = [
        p for p in parsed
        if p.get("type") == "content_block_delta"
        and p.get("delta", {}).get("type") == "thinking_delta"
    ]
    assert len(thinking_deltas) >= 1
    assert any("Thinking about constraints" in d["delta"].get("thinking", "") for d in thinking_deltas)

    text_deltas = [
        p for p in parsed
        if p.get("type") == "content_block_delta"
        and p.get("delta", {}).get("type") == "text_delta"
    ]
    assert len(text_deltas) >= 1
    assert any("Answer text" in d["delta"].get("text", "") for d in text_deltas)


def test_usage_passthrough_fields_in_message_delta():
    openai_chunks = [
        'data: {"choices": [{"delta": {"content": "Hello"}, "index": 0}], "usage": {"prompt_tokens": 7, "completion_tokens": 9, "cache_creation_input_tokens": 3, "cache_read_input_tokens": 2}}',
        'data: {"choices": [{"finish_reason": "stop", "delta": {}}]}',
        'data: [DONE]',
    ]
    resp = FakeHTTPResponse(openai_chunks)
    events = list(openai_stream_to_anthropic(resp, model="claude-sonnet-4.6"))
    parsed = _extract_data_payloads(events)

    msg_delta = [p for p in parsed if p.get("type") == "message_delta"][0]
    usage = msg_delta.get("usage", {})
    assert usage.get("input_tokens") == 7
    assert usage.get("output_tokens") == 9
    assert usage.get("cache_creation_input_tokens") == 3
    assert usage.get("cache_read_input_tokens") == 2


def test_duplicate_text_delta_is_deduplicated_for_openai_stream():
    """Repeated long deltas should not be emitted twice."""
    duplicate = "Now I have all the data from every investigation agent."
    openai_chunks = [
        f'data: {{"choices": [{{"delta": {{"content": {json.dumps(duplicate)}}}, "index": 0}}]}}',
        f'data: {{"choices": [{{"delta": {{"content": {json.dumps(duplicate)}}}, "index": 0}}]}}',
        'data: {"choices": [{"finish_reason": "stop", "delta": {}}]}',
        'data: [DONE]',
    ]
    resp = FakeHTTPResponse(openai_chunks)
    events = list(openai_stream_to_anthropic(resp, model="claude-sonnet-4.6"))
    parsed = _extract_data_payloads(events)

    text_deltas = [
        p for p in parsed
        if p.get("type") == "content_block_delta"
        and p.get("delta", {}).get("type") == "text_delta"
    ]
    assert len(text_deltas) == 1
    assert text_deltas[0]["delta"]["text"] == duplicate


def test_cumulative_text_delta_only_emits_suffix_for_openai_stream():
    """Cumulative snapshots should be compacted into new suffix chunks."""
    openai_chunks = [
        'data: {"choices": [{"delta": {"content": "Hello"}, "index": 0}]}',
        'data: {"choices": [{"delta": {"content": "Hello world"}, "index": 0}]}',
        'data: {"choices": [{"delta": {"content": "Hello world!"}, "index": 0}]}',
        'data: {"choices": [{"finish_reason": "stop", "delta": {}}]}',
        'data: [DONE]',
    ]
    resp = FakeHTTPResponse(openai_chunks)
    events = list(openai_stream_to_anthropic(resp, model="claude-sonnet-4.6"))
    parsed = _extract_data_payloads(events)

    text_deltas = [
        p["delta"]["text"] for p in parsed
        if p.get("type") == "content_block_delta"
        and p.get("delta", {}).get("type") == "text_delta"
    ]
    assert text_deltas == ["Hello", " world", "!"]
