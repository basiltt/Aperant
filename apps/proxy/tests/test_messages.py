"""
Tests for message format translation.

Covers:
  - Simple text messages
  - Tool use / tool result roundtrip
  - System prompt handling
  - Thinking block stripping
  - Image block handling
  - Multi-turn conversation
"""

import json
import sys
from pathlib import Path

# Add proxy root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from translators.messages import (
    anthropic_to_openai_messages,
    anthropic_to_openai_tools,
    anthropic_tool_choice_to_openai,
    openai_to_anthropic_content_blocks,
)


def test_simple_text_message():
    body = {
        "messages": [
            {"role": "user", "content": "Hello"},
        ]
    }
    result = anthropic_to_openai_messages(body)
    assert len(result) == 1
    assert result[0]["role"] == "user"
    assert result[0]["content"] == "Hello"


def test_system_prompt_becomes_system_message():
    body = {
        "system": "You are a helpful assistant.",
        "messages": [
            {"role": "user", "content": "Hi"},
        ],
    }
    result = anthropic_to_openai_messages(body)
    assert len(result) == 2
    assert result[0]["role"] == "system"
    assert result[0]["content"] == "You are a helpful assistant."
    assert result[1]["role"] == "user"


def test_tool_use_translation():
    body = {
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu_123",
                        "name": "read_file",
                        "input": {"path": "test.py"},
                    }
                ],
            }
        ]
    }
    result = anthropic_to_openai_messages(body)
    assert len(result) == 1
    msg = result[0]
    assert msg["role"] == "assistant"
    assert msg["content"] == ""
    assert len(msg["tool_calls"]) == 1
    tc = msg["tool_calls"][0]
    assert tc["id"] == "toolu_123"
    assert tc["function"]["name"] == "read_file"
    assert json.loads(tc["function"]["arguments"]) == {"path": "test.py"}


def test_tool_result_becomes_tool_message():
    body = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": "toolu_123",
                        "content": "file contents here",
                    }
                ],
            }
        ]
    }
    result = anthropic_to_openai_messages(body)
    assert any(m["role"] == "tool" for m in result)
    tool_msg = [m for m in result if m["role"] == "tool"][0]
    assert tool_msg["tool_call_id"] == "toolu_123"
    assert tool_msg["content"] == "file contents here"


def test_user_tool_result_then_text_preserves_order():
    body = {
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu_abc",
                        "name": "read_file",
                        "input": {"path": "x.py"},
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": "toolu_abc",
                        "content": "ok",
                    },
                    {"type": "text", "text": "continue"},
                ],
            },
        ]
    }

    result = anthropic_to_openai_messages(body)
    assert [m["role"] for m in result] == ["assistant", "tool", "user"]
    assert result[0]["content"] == ""
    assert result[1]["tool_call_id"] == "toolu_abc"
    assert result[2]["content"] == "continue"


def test_skips_empty_assistant_message_without_text_or_tools():
    body = {
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {"type": "thinking", "thinking": "hidden"},
                ],
            }
        ]
    }

    result = anthropic_to_openai_messages(body)
    assert result == []


def test_thinking_blocks_stripped():
    body = {
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {"type": "thinking", "thinking": "Let me think..."},
                    {"type": "text", "text": "Here's my answer"},
                ],
            }
        ]
    }
    result = anthropic_to_openai_messages(body)
    assert len(result) == 1
    assert result[0]["content"] == "Here's my answer"


def test_tool_definitions_translation():
    tools = [
        {
            "name": "read_file",
            "description": "Read a file",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                },
                "required": ["path"],
            },
        }
    ]
    result = anthropic_to_openai_tools(tools)
    assert len(result) == 1
    assert result[0]["type"] == "function"
    assert result[0]["function"]["name"] == "read_file"
    assert result[0]["function"]["parameters"]["type"] == "object"


def test_tool_definitions_translation_preserves_strict_flag():
    tools = [
        {
            "name": "read_file",
            "description": "Read a file",
            "strict": True,
            "input_schema": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        }
    ]
    result = anthropic_to_openai_tools(tools)
    assert result[0]["function"]["strict"] is True


def test_tool_choice_mapping_any_auto_none_tool():
    assert anthropic_tool_choice_to_openai({"type": "any"}) == ("required", None)
    assert anthropic_tool_choice_to_openai({"type": "auto"}) == ("auto", None)
    assert anthropic_tool_choice_to_openai({"type": "none"}) == ("none", None)

    choice, parallel = anthropic_tool_choice_to_openai(
        {"type": "tool", "name": "read_file", "disable_parallel_tool_use": True}
    )
    assert choice == {"type": "function", "function": {"name": "read_file"}}
    assert parallel is False


def test_multi_turn_conversation():
    body = {
        "system": "Be concise.",
        "messages": [
            {"role": "user", "content": "What is 2+2?"},
            {
                "role": "assistant",
                "content": [{"type": "text", "text": "4"}],
            },
            {"role": "user", "content": "And 3+3?"},
        ],
    }
    result = anthropic_to_openai_messages(body)
    assert len(result) == 4  # system + user + assistant + user
    assert result[0]["role"] == "system"
    assert result[1]["content"] == "What is 2+2?"
    assert result[2]["content"] == "4"
    assert result[3]["content"] == "And 3+3?"


def test_user_text_before_tool_result_preserves_order():
    """Complementary test: user text block BEFORE tool_result in same message.

    Verifies that the flush logic preserves block ordering in the inverse
    interleaving case (text then tool_result).
    """
    body = {
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu_xyz",
                        "name": "write_file",
                        "input": {"path": "f.py"},
                    }
                ],
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Here is context"},
                    {
                        "type": "tool_result",
                        "tool_use_id": "toolu_xyz",
                        "content": "file written",
                    },
                ],
            },
        ]
    }
    result = anthropic_to_openai_messages(body)
    # Expected order: assistant (tool_use), user (text flushed before tool), tool (result)
    assert [m["role"] for m in result] == ["assistant", "user", "tool"]
    assert result[1]["content"] == "Here is context"
    assert result[2]["tool_call_id"] == "toolu_xyz"
    assert result[2]["content"] == "file written"


def test_skips_empty_assistant_with_empty_content_list():
    """Assistant with empty content list should be skipped."""
    body = {
        "messages": [
            {
                "role": "assistant",
                "content": [],
            }
        ]
    }
    result = anthropic_to_openai_messages(body)
    assert result == []


def test_assistant_tool_use_only_not_skipped():
    """Assistant with only tool_use blocks should NOT be skipped."""
    body = {
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu_456",
                        "name": "list_files",
                        "input": {"dir": "/"},
                    }
                ],
            }
        ]
    }
    result = anthropic_to_openai_messages(body)
    assert len(result) == 1
    msg = result[0]
    assert msg["role"] == "assistant"
    assert msg["content"] == ""
    assert len(msg["tool_calls"]) == 1
    assert msg["tool_calls"][0]["id"] == "toolu_456"


def test_assistant_text_only_not_skipped():
    """Assistant with only text blocks should NOT be skipped."""
    body = {
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Hello"},
                ],
            }
        ]
    }
    result = anthropic_to_openai_messages(body)
    assert len(result) == 1
    assert result[0]["role"] == "assistant"
    assert result[0]["content"] == "Hello"


def test_assistant_with_text_and_tool_use_preserves_both():
    """Assistant with both text and tool_use blocks preserves text content
    and includes tool_calls. This is a key mixed-path behavior.
    """
    body = {
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Let me read that file."},
                    {
                        "type": "tool_use",
                        "id": "toolu_mixed",
                        "name": "read_file",
                        "input": {"path": "test.py"},
                    },
                ],
            }
        ]
    }
    result = anthropic_to_openai_messages(body)
    assert len(result) == 1
    msg = result[0]
    assert msg["role"] == "assistant"
    # Text content MUST be preserved (non-empty string)
    assert msg["content"] == "Let me read that file."
    # Tool calls MUST also be present
    assert len(msg["tool_calls"]) == 1
    assert msg["tool_calls"][0]["id"] == "toolu_mixed"
    assert msg["tool_calls"][0]["function"]["name"] == "read_file"
