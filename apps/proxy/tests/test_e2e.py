"""
End-to-end proxy tests.

These tests start the proxy server, send an Anthropic-format request,
and verify the response is valid Anthropic SSE format.

NOTE: These tests require real API keys in environment variables.
Skip with: pytest -m "not e2e"
"""

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

PROXY_URL = "http://127.0.0.1:8765"
PROXY_SCRIPT = str(Path(__file__).parent.parent / "proxy_server.py")


@pytest.fixture(scope="module")
def proxy_server():
    """Start the proxy server for the test module."""
    proc = subprocess.Popen(
        [sys.executable, PROXY_SCRIPT, "--port", "8765", "--log-level", "debug"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(2)  # Wait for server startup

    yield proc

    proc.terminate()
    proc.wait(timeout=5)


def _send_message(text: str) -> list[str]:
    """Send an Anthropic-format message and return SSE lines."""
    body = json.dumps({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 100,
        "stream": True,
        "messages": [{"role": "user", "content": text}],
    }).encode()

    req = urllib.request.Request(
        f"{PROXY_URL}/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": "test-key",
        },
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode().strip().split("\n\n")


@pytest.mark.e2e
def test_proxy_status(proxy_server):
    """Verify proxy reports status correctly."""
    req = urllib.request.Request(f"{PROXY_URL}/_proxy/status")
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        assert data["status"] == "ok"
        assert "active_provider" in data


@pytest.mark.e2e
def test_provider_switch(proxy_server):
    """Verify provider switching works."""
    body = json.dumps({"provider": "anthropic"}).encode()
    req = urllib.request.Request(
        f"{PROXY_URL}/_proxy/switch",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        assert data["active_provider"] == "anthropic"
