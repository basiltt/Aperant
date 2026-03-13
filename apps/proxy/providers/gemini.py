"""
Google Gemini provider.

Supports two authentication modes:
  1. **Antigravity OAuth** (no API key required) — uses Google's IDE companion
     OAuth flow via cloudcode-pa.googleapis.com endpoints. Activated when
     ANTIGRAVITY_TOKEN is set (injected from the Electron profile service).
  2. **API key** — uses generativelanguage.googleapis.com with ?key= param.
     Activated when GEMINI_API_KEY or GOOGLE_API_KEY is set.

Translates between Anthropic Messages API and Gemini's generateContent.

Key differences from Anthropic/OpenAI:
  - Uses `contents` with `parts` (not `messages` with `content`)
  - Tool calls in `functionCall` parts (not `tool_use` blocks)
  - Streaming via SSE with `candidates[].content.parts[]` deltas
  - Supports thinkingConfig for extended reasoning
  - System prompt is a separate `systemInstruction` field
"""

import http.client
import json
import logging
import os
import ssl
import uuid
from typing import Any, Generator
from urllib.parse import quote

from .base import BaseProvider, ProviderError

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from translators.thinking import convert_thinking_for_gemini
from translators.messages import _sanitize_schema


_SSL_CTX = ssl.create_default_context()

logger = logging.getLogger("proxy.gemini")

# Antigravity (Google IDE companion) API endpoints — tried in order
_ANTIGRAVITY_HOSTS = [
    "cloudcode-pa.googleapis.com",
    "autopush-cloudcode-pa.sandbox.googleapis.com",
    "daily-cloudcode-pa.sandbox.googleapis.com",
]

_ANTIGRAVITY_HEADERS = {
    "User-Agent": "antigravity/1.18.3 windows/amd64",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Content-Type": "application/json",
}


class GeminiProvider(BaseProvider):
    """Google Gemini provider with Antigravity OAuth and API key support."""

    def _is_antigravity(self) -> bool:
        """Return True if Antigravity OAuth mode is active."""
        return bool(os.environ.get("ANTIGRAVITY_TOKEN"))

    def _get_antigravity_token(self) -> str:
        token = os.environ.get("ANTIGRAVITY_TOKEN", "")
        if not token:
            raise ProviderError(401, "authentication_error", "ANTIGRAVITY_TOKEN not set")
        return token

    def _get_antigravity_project(self) -> str:
        return os.environ.get("ANTIGRAVITY_PROJECT_ID", "rising-fact-p41fc")

    def get_api_key(self) -> str:
        """Get API key for direct Gemini API mode (non-Antigravity)."""
        for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
            key = os.environ.get(var, "")
            if key:
                return key
        raise ProviderError(
            401, "authentication_error",
            "No Gemini API key found. Set GEMINI_API_KEY or connect a Google account."
        )

    # ------------------------------------------------------------------
    # Model listing
    # ------------------------------------------------------------------

    def list_models(self) -> list[dict[str, str]]:
        """Fetch available models — dispatches to Antigravity or API key path."""
        if self._is_antigravity():
            return self._list_models_antigravity()
        return self._list_models_apikey()

    def _list_models_antigravity(self) -> list[dict[str, str]]:
        """Fetch models via Antigravity POST /v1internal:fetchAvailableModels."""
        token = self._get_antigravity_token()
        project_id = self._get_antigravity_project()
        body = json.dumps({"project": project_id}).encode("utf-8")

        for host in _ANTIGRAVITY_HOSTS:
            conn = http.client.HTTPSConnection(host, context=_SSL_CTX, timeout=15)
            try:
                headers = {
                    **_ANTIGRAVITY_HEADERS,
                    "Authorization": f"Bearer {token}",
                    "Content-Length": str(len(body)),
                }
                conn.request("POST", "/v1internal:fetchAvailableModels",
                             body=body, headers=headers)
                resp = conn.getresponse()
                raw = resp.read().decode("utf-8")
                if resp.status != 200:
                    logger.debug("Antigravity models %s returned %d: %s",
                                 host, resp.status, raw[:200])
                    continue

                data = json.loads(raw)
                models_obj = data.get("models", {})
                if not isinstance(models_obj, dict):
                    continue

                models: list[dict[str, str]] = []
                for model_id, info in models_obj.items():
                    display = info.get("displayName", model_id) if isinstance(info, dict) else model_id
                    is_internal = info.get("isInternal", False) if isinstance(info, dict) else False
                    if is_internal:
                        continue
                    models.append({"id": model_id, "name": display})

                logger.info("Antigravity: discovered %d models from %s", len(models), host)
                return models
            except Exception as e:
                logger.debug("Antigravity models error at %s: %s", host, e)
            finally:
                conn.close()

        logger.warning("All Antigravity endpoints failed for model listing")
        return []

    def _list_models_apikey(self) -> list[dict[str, str]]:
        """Fetch models via standard Gemini API GET /v1beta/models?key=..."""
        api_key = self.get_api_key()
        conn = self.get_connection()
        try:
            conn.request("GET", "/v1beta/models", headers={
                "Accept": "application/json",
                "x-goog-api-key": api_key,
            })
            resp = conn.getresponse()
            body = resp.read().decode("utf-8")
            if resp.status != 200:
                logger.warning("Gemini list models failed (%d): %s", resp.status, body[:300])
                return []
            data = json.loads(body)
            models: list[dict[str, str]] = []
            for m in data.get("models", []):
                model_id = m.get("name", "").removeprefix("models/")
                display = m.get("displayName", model_id)
                methods = m.get("supportedGenerationMethods", [])
                if "generateContent" not in methods:
                    continue
                models.append({"id": model_id, "name": display})
            return models
        except Exception as e:
            logger.warning("Gemini list models error: %s", e)
            return []
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Request translation
    # ------------------------------------------------------------------

    def translate_request(
        self, anthropic_body: dict[str, Any]
    ) -> tuple[str, str, dict[str, str], bytes, bool]:
        model = anthropic_body.get("model", self.default_model)

        # Build Gemini request
        gemini_body: dict[str, Any] = {
            "contents": self._translate_messages(anthropic_body.get("messages", [])),
        }

        # System instruction
        system = anthropic_body.get("system")
        if system:
            if isinstance(system, str):
                gemini_body["systemInstruction"] = {
                    "parts": [{"text": system}]
                }
            elif isinstance(system, list):
                text = "\n".join(
                    b["text"] for b in system if b.get("type") == "text"
                )
                gemini_body["systemInstruction"] = {
                    "parts": [{"text": text}]
                }

        # Generation config
        gen_config: dict[str, Any] = {}

        max_tokens = anthropic_body.get("max_tokens")
        if max_tokens:
            gen_config["maxOutputTokens"] = max_tokens

        temperature = anthropic_body.get("temperature")
        if temperature is not None:
            gen_config["temperature"] = temperature

        top_p = anthropic_body.get("top_p")
        if top_p is not None:
            gen_config["topP"] = top_p

        # Thinking support
        thinking_config = convert_thinking_for_gemini(anthropic_body)
        if thinking_config:
            gen_config["thinkingConfig"] = thinking_config

        if gen_config:
            gemini_body["generationConfig"] = gen_config

        # Tools
        tools = anthropic_body.get("tools")
        if tools:
            gemini_body["tools"] = [{"functionDeclarations": [
                {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": _sanitize_schema(t.get("input_schema", {})),
                }
                for t in tools
            ]}]

        if self._is_antigravity():
            method, path, headers, body_bytes = self._build_antigravity_request(model, gemini_body)
            return (method, path, headers, body_bytes, False)
        method, path, headers, body_bytes = self._build_apikey_request(model, gemini_body)
        return (method, path, headers, body_bytes, False)

    def _build_antigravity_request(
        self, model: str, gemini_body: dict[str, Any]
    ) -> tuple[str, str, dict[str, str], bytes]:
        """Wrap the Gemini body in Antigravity envelope."""
        token = self._get_antigravity_token()
        project_id = self._get_antigravity_project()

        envelope: dict[str, Any] = {
            "project": project_id,
            "model": model,
            "request": gemini_body,
            "userAgent": "antigravity",
            "requestId": str(uuid.uuid4()),
        }

        path = "/v1internal:streamGenerateContent?alt=sse"
        headers = {
            **_ANTIGRAVITY_HEADERS,
            "Authorization": f"Bearer {token}",
            "Accept": "text/event-stream",
        }
        body_bytes = json.dumps(envelope).encode("utf-8")
        return ("POST", path, headers, body_bytes)

    def _build_apikey_request(
        self, model: str, gemini_body: dict[str, Any]
    ) -> tuple[str, str, dict[str, str], bytes]:
        """Standard Gemini API with header-based auth."""
        api_key = self.get_api_key()
        path = (
            f"/v1beta/models/{quote(model, safe='')}:streamGenerateContent"
            f"?alt=sse"
        )
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        }
        body_bytes = json.dumps(gemini_body).encode("utf-8")
        return ("POST", path, headers, body_bytes)

    def get_connection(self) -> http.client.HTTPSConnection:
        if self._is_antigravity():
            # Try each Antigravity host in order; return first reachable.
            # Use a short timeout for the connection probe, then raise it
            # for streaming reads (server may pause >30s between SSE chunks).
            last_error: Exception | None = None
            for host in _ANTIGRAVITY_HOSTS:
                try:
                    conn = http.client.HTTPSConnection(
                        host, context=_SSL_CTX, timeout=30,
                    )
                    conn.connect()
                    logger.debug("Antigravity connected to %s", host)
                    conn.timeout = 300
                    if conn.sock is not None:
                        conn.sock.settimeout(300)
                    return conn
                except OSError as e:
                    logger.debug("Antigravity host %s unreachable: %s", host, e)
                    last_error = e
                    continue
            raise ProviderError(
                502, "connection_failed",
                f"All Antigravity hosts unreachable: {last_error}",
            )
        return http.client.HTTPSConnection(
            "generativelanguage.googleapis.com",
            context=_SSL_CTX,
            timeout=300,
        )

    def _translate_messages(
        self, messages: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Convert Anthropic messages to Gemini contents format."""
        contents: list[dict[str, Any]] = []
        # Map tool_use ID → function name for tool_result resolution
        tool_id_to_name: dict[str, str] = {}

        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            content = msg.get("content", "")

            if isinstance(content, str):
                contents.append({
                    "role": role,
                    "parts": [{"text": content}],
                })
                continue

            parts: list[dict[str, Any]] = []
            for block in content:
                block_type = block.get("type")

                if block_type == "text":
                    parts.append({"text": block["text"]})
                elif block_type == "tool_use":
                    tool_id = block.get("id", "")
                    tool_id_to_name[tool_id] = block["name"]

                    fc_part: dict[str, Any] = {
                        "functionCall": {
                            "name": block["name"],
                            "args": block.get("input", {}),
                        }
                    }
                    # Extract thoughtSignature from encoded ID
                    if "||" in tool_id:
                        _, thought_sig = tool_id.split("||", 1)
                        fc_part["thoughtSignature"] = thought_sig
                    parts.append(fc_part)
                elif block_type == "tool_result":
                    result = block.get("content", "")
                    if isinstance(result, list):
                        result = "\n".join(
                            b.get("text", "") for b in result
                            if b.get("type") == "text"
                        )
                    # Look up function name from matching tool_use block
                    tu_id = block.get("tool_use_id", "")
                    fname = tool_id_to_name.get(tu_id, block.get("name", "tool"))
                    parts.append({
                        "functionResponse": {
                            "name": fname,
                            "response": {"result": str(result)},
                        }
                    })
                elif block_type == "thinking":
                    # Gemini handles thinking internally
                    pass

            if parts:
                contents.append({"role": role, "parts": parts})

        return contents

    def translate_stream(
        self, response: http.client.HTTPResponse, *, use_responses_api: bool = False
    ) -> Generator[str, None, None]:
        """Translate Gemini SSE stream to Anthropic format.

        Handles both standard Gemini (candidates at top level) and
        Antigravity (candidates nested under response.candidates).
        """
        model = self.config.get("default_model", "gemini")
        is_ag = self._is_antigravity()

        # Emit message_start
        # SSE spec: event + data must be in the same message block
        # (separated by \n, terminated by \n\n which the proxy server appends)
        yield "event: message_start\ndata: " + json.dumps({
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

        text_block_started = False
        text_block_index = 0
        thinking_block_started = False
        thinking_block_index = 0
        next_block_index = 0
        tool_blocks: dict[str, int] = {}  # tool name → block index
        stop_reason = "end_turn"

        line_count = 0
        data_count = 0
        for raw_line in response:
            line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
            line_count += 1

            if not line.startswith("data: "):
                if line.strip():
                    logger.debug("SSE non-data line: %s", line[:200])
                continue

            data_count += 1
            try:
                chunk = json.loads(line[6:])
            except json.JSONDecodeError:
                logger.debug("SSE JSON decode error: %s", line[:200])
                continue

            logger.debug("SSE chunk keys: %s", list(chunk.keys()))

            # Antigravity wraps response: data.response.candidates
            # Standard Gemini: data.candidates
            if is_ag and "response" in chunk:
                chunk = chunk["response"]
                logger.debug("Unwrapped AG response keys: %s", list(chunk.keys()))

            candidates = chunk.get("candidates", [])
            if not candidates:
                logger.debug("No candidates in chunk, keys: %s", list(chunk.keys()))
                continue

            candidate = candidates[0]
            content = candidate.get("content", {})
            parts = content.get("parts", [])
            finish_reason = candidate.get("finishReason")

            logger.debug("Candidate parts=%d, finishReason=%s, part_keys=%s",
                        len(parts), finish_reason,
                        [list(p.keys()) for p in parts])

            for part in parts:
                if "thought" in part:
                    thought_text = part.get("thought", "")
                    logger.debug("Thinking part found (length: %d)", len(thought_text))
                    if thought_text:
                        if not thinking_block_started:
                            thinking_block_index = next_block_index
                            next_block_index += 1
                            thinking_block_started = True
                            yield "event: content_block_start\ndata: " + json.dumps({
                                "type": "content_block_start",
                                "index": thinking_block_index,
                                "content_block": {"type": "thinking", "thinking": ""},
                            })

                        yield "event: content_block_delta\ndata: " + json.dumps({
                            "type": "content_block_delta",
                            "index": thinking_block_index,
                            "delta": {"type": "thinking_delta", "thinking": thought_text},
                        })
                if "text" in part:
                    logger.debug("Text part found: %s", part["text"][:200])
                    # Close thinking block before text starts
                    if thinking_block_started:
                        yield "event: content_block_stop\ndata: " + json.dumps({
                            "type": "content_block_stop",
                            "index": thinking_block_index,
                        })
                        thinking_block_started = False
                    if not text_block_started:
                        text_block_index = next_block_index
                        next_block_index += 1
                        text_block_started = True
                        yield "event: content_block_start\ndata: " + json.dumps({
                            "type": "content_block_start",
                            "index": text_block_index,
                            "content_block": {"type": "text", "text": ""},
                        })

                    yield "event: content_block_delta\ndata: " + json.dumps({
                        "type": "content_block_delta",
                        "index": text_block_index,
                        "delta": {"type": "text_delta", "text": part["text"]},
                    })

                elif "functionCall" in part:
                    fc = part["functionCall"]
                    fname = fc.get("name", "")
                    thought_sig = part.get("thoughtSignature", "")

                    if text_block_started:
                        yield "event: content_block_stop\ndata: " + json.dumps({
                            "type": "content_block_stop",
                            "index": text_block_index,
                        })
                        text_block_started = False

                    block_idx = next_block_index
                    next_block_index += 1
                    tool_blocks[fname] = block_idx

                    # Embed thoughtSignature in tool ID for stateless
                    # round-tripping — Gemini requires it when the
                    # conversation history is sent back with functionCall parts.
                    tool_id = f"toolu_gemini_{block_idx}"
                    if thought_sig:
                        tool_id = f"toolu_gemini_{block_idx}||{thought_sig}"

                    yield "event: content_block_start\ndata: " + json.dumps({
                        "type": "content_block_start",
                        "index": block_idx,
                        "content_block": {
                            "type": "tool_use",
                            "id": tool_id,
                            "name": fname,
                            "input": {},
                        },
                    })

                    # Emit full args as one delta
                    args_json = json.dumps(fc.get("args", {}))
                    yield "event: content_block_delta\ndata: " + json.dumps({
                        "type": "content_block_delta",
                        "index": block_idx,
                        "delta": {
                            "type": "input_json_delta",
                            "partial_json": args_json,
                        },
                    })

                    yield "event: content_block_stop\ndata: " + json.dumps({
                        "type": "content_block_stop",
                        "index": block_idx,
                    })

                    stop_reason = "tool_use"

            if finish_reason:
                if finish_reason == "STOP":
                    stop_reason = "end_turn"
                elif finish_reason == "MAX_TOKENS":
                    stop_reason = "max_tokens"

        # Close open thinking block
        if thinking_block_started:
            yield "event: content_block_stop\ndata: " + json.dumps({
                "type": "content_block_stop",
                "index": thinking_block_index,
            })

        # Close open text block
        if text_block_started:
            yield "event: content_block_stop\ndata: " + json.dumps({
                "type": "content_block_stop",
                "index": text_block_index,
            })

        logger.info("SSE stream done: %d lines, %d data chunks, text_started=%s",
                     line_count, data_count, text_block_started)

        # message_delta + message_stop
        yield "event: message_delta\ndata: " + json.dumps({
            "type": "message_delta",
            "delta": {"stop_reason": stop_reason, "stop_sequence": None},
            "usage": {"output_tokens": 0},
        })

        yield "event: message_stop\ndata: " + json.dumps({"type": "message_stop"})
