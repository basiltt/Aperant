"""
Tool call format translation utilities.

Handles the structural differences in how Anthropic and OpenAI
represent tool calls and tool results:

  Anthropic: tool_use content blocks with `input` as JSON object
  OpenAI:    tool_calls array with `arguments` as JSON string

Also handles tool call ID normalization — some providers generate
different ID formats that need to be tracked for result correlation.
"""

import json
import uuid
from typing import Any


def generate_tool_call_id() -> str:
    """Generate an Anthropic-style tool call ID."""
    return f"toolu_{uuid.uuid4().hex[:24]}"


def normalize_tool_call_id(provider_id: str) -> str:
    """
    Normalize a provider's tool call ID to work with Anthropic format.
    Anthropic expects IDs starting with 'toolu_'.
    """
    if provider_id.startswith("toolu_"):
        return provider_id
    if provider_id.startswith("call_"):
        # OpenAI format — keep as-is, Claude Code handles it
        return provider_id
    # Unknown format — wrap it
    return f"toolu_{provider_id}"


def parse_partial_tool_arguments(accumulated: str) -> dict[str, Any] | None:
    """
    Attempt to parse accumulated tool arguments JSON.
    Returns None if the JSON is incomplete (streaming in progress).
    """
    try:
        return json.loads(accumulated)
    except json.JSONDecodeError:
        return None
