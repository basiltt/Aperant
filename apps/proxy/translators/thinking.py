"""
Extended thinking / reasoning translation.

Anthropic: Explicit thinking blocks in request and response.
  Request:  {"thinking": {"type": "enabled", "budget_tokens": 10000}}
  Response: {"type": "thinking", "thinking": "step-by-step reasoning..."}

OpenAI: Models like o1/o3 reason internally. Not exposed via API.
  The thinking budget is ignored.

Gemini: Thinking is supported via `thinkingConfig`.
  Request:  {"generationConfig": {"thinkingConfig": {"thinkingBudget": 10000}}}

This module handles stripping/injecting thinking params per provider.
"""

from typing import Any


def strip_thinking_for_openai(anthropic_body: dict[str, Any]) -> dict[str, Any]:
    """
    Remove thinking configuration from request body.
    OpenAI models don't accept thinking params.
    """
    body = dict(anthropic_body)
    body.pop("thinking", None)

    # Also remove thinking blocks from message history
    if "messages" in body:
        body["messages"] = _strip_thinking_blocks(body["messages"])

    return body


def convert_thinking_for_gemini(anthropic_body: dict[str, Any]) -> dict[str, Any] | None:
    """
    Convert Anthropic thinking config to Gemini's thinkingConfig format.
    Returns None if thinking is not enabled.
    """
    thinking = anthropic_body.get("thinking", {})
    if thinking.get("type") != "enabled":
        return None

    budget = thinking.get("budget_tokens", 0)
    if budget > 0:
        return {"thinkingBudget": budget}
    return None


def _strip_thinking_blocks(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove thinking content blocks from message history."""
    cleaned = []
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, list):
            filtered = [
                block for block in content
                if block.get("type") != "thinking"
            ]
            if filtered:
                cleaned.append({**msg, "content": filtered})
            elif msg.get("role") == "assistant":
                cleaned.append({**msg, "content": ""})
        else:
            cleaned.append(msg)
    return cleaned
