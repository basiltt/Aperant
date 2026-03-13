"""Repeatable proxy parity probe for Claude Code compatibility.

Usage:
  python apps/proxy/scripts/proxy_parity_probe.py

Optional env:
  PROXY_HOST=127.0.0.1
  PROXY_PORT=8765
  PROXY_MODEL=claude-sonnet-4.6
  PROXY_PROVIDER=copilot
"""

from __future__ import annotations

import json
import os
import http.client
from typing import Any


HOST = os.environ.get("PROXY_HOST", "127.0.0.1")
PORT = int(os.environ.get("PROXY_PORT", "8765"))
MODEL = os.environ.get("PROXY_MODEL", "claude-sonnet-4.6")
PROVIDER = os.environ.get("PROXY_PROVIDER", "copilot")


def request_json(method: str, path: str, body: dict[str, Any] | None = None, timeout: int = 120) -> tuple[int, str]:
    conn = http.client.HTTPConnection(HOST, PORT, timeout=timeout)
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    conn.request(method, path, body=payload, headers={"Content-Type": "application/json"})
    resp = conn.getresponse()
    text = resp.read().decode("utf-8", errors="replace")
    status = resp.status
    conn.close()
    return status, text


def request_sse(path: str, body: dict[str, Any], timeout: int = 180) -> tuple[int, list[dict[str, Any]]]:
    conn = http.client.HTTPConnection(HOST, PORT, timeout=timeout)
    conn.request("POST", path, body=json.dumps(body).encode("utf-8"), headers={"Content-Type": "application/json"})
    resp = conn.getresponse()
    status = resp.status

    events: list[dict[str, Any]] = []
    current: dict[str, Any] = {}

    while True:
        raw = resp.readline()
        if not raw:
            break
        line = raw.decode("utf-8", errors="replace").rstrip("\r\n")

        if line.startswith("event: "):
            current["event"] = line[7:]
        elif line.startswith("data: "):
            payload = line[6:]
            try:
                current["data"] = json.loads(payload)
            except json.JSONDecodeError:
                current["data_raw"] = payload
        elif line == "":
            if current:
                events.append(current)
                if current.get("event") == "message_stop":
                    break
                current = {}

    conn.close()
    return status, events


def summarize(events: list[dict[str, Any]]) -> dict[str, Any]:
    event_names: list[str] = []
    block_start_types: list[str] = []
    delta_types: list[str] = []
    stop_reason: str | None = None
    usage: dict[str, Any] = {}

    for event in events:
        name = event.get("event")
        if isinstance(name, str):
            event_names.append(name)

        data = event.get("data")
        if not isinstance(data, dict):
            continue

        if data.get("type") == "content_block_start":
            block = data.get("content_block")
            if isinstance(block, dict):
                bt = block.get("type")
                if isinstance(bt, str):
                    block_start_types.append(bt)

        if data.get("type") == "content_block_delta":
            delta = data.get("delta")
            if isinstance(delta, dict):
                dt = delta.get("type")
                if isinstance(dt, str):
                    delta_types.append(dt)

        if data.get("type") == "message_delta":
            delta = data.get("delta")
            if isinstance(delta, dict):
                sr = delta.get("stop_reason")
                if isinstance(sr, str):
                    stop_reason = sr
            u = data.get("usage")
            if isinstance(u, dict):
                usage = u

    return {
        "event_names": event_names,
        "block_start_types": block_start_types,
        "delta_types": delta_types,
        "stop_reason": stop_reason,
        "usage": usage,
    }


def main() -> None:
    output: dict[str, Any] = {}

    # Ensure provider is set for parity tests
    request_json("POST", "/_proxy/switch", {"provider": PROVIDER})

    status, body = request_json("GET", "/_proxy/status")
    output["proxy_status"] = {"http": status, "body": json.loads(body) if body.startswith("{") else body}

    basic_req = {
        "model": MODEL,
        "max_tokens": 256,
        "stream": True,
        "messages": [{"role": "user", "content": "Reply with exactly: PARITY_OK"}],
    }
    s, events = request_sse("/v1/messages", basic_req)
    output["basic_stream"] = {"http": s, **summarize(events)}

    thinking_req = {
        "model": MODEL,
        "max_tokens": 512,
        "stream": True,
        "thinking": {"type": "enabled", "budget_tokens": 256},
        "messages": [{"role": "user", "content": "Think briefly, then answer in one sentence."}],
    }
    s, events = request_sse("/v1/messages", thinking_req)
    output["thinking_stream"] = {"http": s, **summarize(events)}

    tool_req = {
        "model": MODEL,
        "max_tokens": 512,
        "stream": True,
        "tool_choice": {"type": "any", "disable_parallel_tool_use": False},
        "tools": [
            {
                "name": "echo_tool",
                "description": "Echo input text",
                "strict": True,
                "input_schema": {
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                    "required": ["text"],
                },
            }
        ],
        "messages": [{"role": "user", "content": "Use a tool to echo: proxy parity"}],
    }
    s, events = request_sse("/v1/messages", tool_req)
    output["tool_stream"] = {"http": s, **summarize(events)}

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
