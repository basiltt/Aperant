"""
Multi-provider proxy server for Claude Code VS Code extension.

Usage:
    python -m apps.proxy.proxy_server [--config path/to/config.json] [--port 8765]

Or directly:
    python apps/proxy/proxy_server.py

Configure Claude Code to use this proxy:
    In .claude/settings.json:
    {
      "env": {
        "ANTHROPIC_BASE_URL": "http://localhost:8765"
      }
    }
"""

import argparse
import http.server
import json
import logging
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any

# Add project root to path for imports
_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))

from providers.base import BaseProvider, ProviderError

logger = logging.getLogger("proxy")


def load_config(config_path: str) -> dict[str, Any]:
    """Load proxy configuration from JSON file."""
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def create_provider(provider_name: str, config: dict[str, Any]) -> BaseProvider:
    """Factory: create a provider instance from config."""
    providers_cfg = config.get("providers", {})
    if provider_name not in providers_cfg:
        raise ValueError(f"Unknown provider: {provider_name}")

    pcfg = providers_cfg[provider_name]
    pcfg["_provider_name"] = provider_name
    provider_type = pcfg.get("type", provider_name)

    if provider_type == "anthropic":
        from providers.anthropic import AnthropicProvider
        return AnthropicProvider(pcfg)
    elif provider_type == "openai_compat":
        from providers.openai_compat import OpenAICompatProvider
        return OpenAICompatProvider(pcfg)
    elif provider_type == "copilot":
        from providers.copilot import CopilotProvider
        return CopilotProvider(pcfg)
    elif provider_type == "gemini":
        from providers.gemini import GeminiProvider
        return GeminiProvider(pcfg)
    else:
        raise ValueError(f"Unknown provider type: {provider_type}")


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    """HTTP request handler that proxies Anthropic API calls to any provider."""

    # Class-level state (set by server setup)
    provider: BaseProvider = None  # type: ignore
    config: dict[str, Any] = {}
    model_map: dict[str, dict[str, str]] = {}
    _active_model_override: str = ""
    _state_lock = threading.Lock()
    # Performance controls (configured at startup)
    _concurrency_limit: int = 0
    _concurrency_acquire_timeout_s: float = 30.0
    _stream_flush_lines: int = 1
    _concurrency_semaphore: threading.BoundedSemaphore | None = None
    _metrics_lock = threading.Lock()
    _metrics: dict[str, Any] = {
        "requests_total": 0,
        "requests_errors": 0,
        "requests_upstream_4xx": 0,
        "requests_upstream_5xx": 0,
        "requests_rejected_capacity": 0,
        "requests_timeout_capacity": 0,
        "streams_total": 0,
        "stream_events_total": 0,
        "stream_flushes_total": 0,
        "inflight": 0,
        "max_inflight": 0,
        "latency_ms_total": 0.0,
        "started_at_unix": 0,
    }

    @classmethod
    def _metrics_inc(cls, key: str, value: int = 1) -> None:
        with cls._metrics_lock:
            cls._metrics[key] = int(cls._metrics.get(key, 0)) + value

    @classmethod
    def _metrics_add_float(cls, key: str, value: float) -> None:
        with cls._metrics_lock:
            cls._metrics[key] = float(cls._metrics.get(key, 0.0)) + value

    @classmethod
    def _metrics_set(cls, key: str, value: Any) -> None:
        with cls._metrics_lock:
            cls._metrics[key] = value

    @classmethod
    def _metrics_inflight_delta(cls, delta: int) -> None:
        with cls._metrics_lock:
            current = int(cls._metrics.get("inflight", 0)) + delta
            if current < 0:
                current = 0
            cls._metrics["inflight"] = current
            if current > int(cls._metrics.get("max_inflight", 0)):
                cls._metrics["max_inflight"] = current

    @classmethod
    def _metrics_snapshot(cls) -> dict[str, Any]:
        with cls._metrics_lock:
            return dict(cls._metrics)

    def log_message(self, format: str, *args: Any) -> None:
        logger.info(format, *args)

    # Allowlist of env vars that can be set via /_proxy/set-token
    _ALLOWED_TOKEN_VARS = frozenset({
        "GITHUB_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY",
        "ANTIGRAVITY_TOKEN", "ANTIGRAVITY_PROJECT_ID", "GOOGLE_API_KEY",
        "OPENROUTER_API_KEY", "GROQ_API_KEY", "ANTHROPIC_API_KEY",
    })

    def do_POST(self) -> None:
        """Handle POST requests — the main proxy path."""
        # Strip query parameters for path matching (CLI may send ?beta=true etc.)
        path = self.path.split("?")[0]
        if path == "/v1/messages":
            self._handle_messages()
        elif path == "/v1/messages/count_tokens":
            self._handle_count_tokens()
        elif path == "/_proxy/switch":
            self._handle_switch_provider()
        elif path == "/_proxy/set-token":
            self._handle_set_token()
        elif path == "/_proxy/set-model":
            self._handle_set_model()
        elif path == "/_proxy/status":
            self._handle_status()
        else:
            self._send_error(404, "not_found", f"Unknown path: {self.path}")

    def do_GET(self) -> None:
        """Handle GET requests — status and health checks."""
        path = self.path.split("?")[0]
        if path == "/_proxy/status":
            self._handle_status()
        elif path == "/_proxy/models":
            self._handle_list_models()
        elif path == "/_proxy/copilot-jwt":
            self._handle_copilot_jwt()
        elif path == "/":
            self._send_json(200, {
                "status": "ok",
                "proxy": "claude-code-multi-provider",
                "active_provider": self.config.get("active_provider", "unknown"),
            })
        else:
            self._send_error(404, "not_found", f"Unknown path: {self.path}")

    # Maximum number of tools to forward upstream.  Claude CLI sends 70+
    # (built-ins + every MCP tool) and many upstream APIs reject payloads
    # that large.  We keep all non-MCP (built-in) tools and fill the
    # remaining budget with MCP tools.
    MAX_TOOLS_UPSTREAM = 64

    @classmethod
    def _limit_tools(cls, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Cap the number of tools forwarded upstream.

        Prioritises built-in Claude Code tools (no ``mcp__`` prefix) and
        fills remaining slots with MCP tools, preserving their original
        order.
        """
        if len(tools) <= cls.MAX_TOOLS_UPSTREAM:
            return tools

        builtin: list[dict[str, Any]] = []
        mcp: list[dict[str, Any]] = []
        for t in tools:
            name = t.get("name", "")
            if name.startswith("mcp__"):
                mcp.append(t)
            else:
                builtin.append(t)

        # If built-ins alone exceed the limit, cap them too
        builtin = builtin[:cls.MAX_TOOLS_UPSTREAM]
        remaining = max(0, cls.MAX_TOOLS_UPSTREAM - len(builtin))
        limited = builtin + mcp[:remaining]
        logger.info(
            "Tool budget: %d built-in + %d/%d MCP kept (limit %d, total %d dropped)",
            len(builtin), min(remaining, len(mcp)), len(mcp),
            cls.MAX_TOOLS_UPSTREAM, len(tools) - len(limited),
        )
        return limited

    def _handle_messages(self) -> None:
        """Proxy a /v1/messages request to the active provider."""
        acquired_capacity_slot = False
        counted_inflight = False
        req_started = time.perf_counter()
        try:
            self.__class__._metrics_inc("requests_total", 1)

            # Optional backpressure: disabled by default (limit=0)
            semaphore = self.__class__._concurrency_semaphore
            if semaphore is not None:
                timeout_s = self.__class__._concurrency_acquire_timeout_s
                if timeout_s <= 0:
                    acquired_capacity_slot = semaphore.acquire(blocking=False)
                    if not acquired_capacity_slot:
                        self.__class__._metrics_inc("requests_rejected_capacity", 1)
                        self._send_error(429, "proxy_over_capacity", "Proxy concurrency limit reached")
                        return
                else:
                    acquired_capacity_slot = semaphore.acquire(timeout=timeout_s)
                    if not acquired_capacity_slot:
                        self.__class__._metrics_inc("requests_timeout_capacity", 1)
                        self._send_error(503, "proxy_capacity_timeout", "Timed out waiting for proxy capacity")
                        return

            self.__class__._metrics_inflight_delta(1)
            counted_inflight = True

            # Snapshot mutable class-level state under lock for thread safety
            with self.__class__._state_lock:
                provider = self.__class__.provider
                model_override = self.__class__._active_model_override

            # Read request body
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self._send_error(400, "invalid_request", "Empty request body")
                return
            raw_body = self.rfile.read(content_length)
            body = json.loads(raw_body)

            # Map model name to provider equivalent
            if "model" in body:
                original_model = body["model"]
                body["model"] = provider.map_model(original_model, self.model_map)
                logger.info(
                    "Model mapped: %s → %s", original_model, body["model"]
                )

            # If the frontend set an explicit target model via /_proxy/set-model,
            # override the mapped model so the provider always gets the user's pick.
            if model_override:
                body["model"] = model_override
                logger.info("Model overridden to: %s", model_override)

            # Cap tool count before forwarding — many upstream APIs
            # (Copilot, Gemini, OpenRouter) reject huge tool payloads.
            if "tools" in body:
                body["tools"] = self._limit_tools(body["tools"])

            is_streaming = body.get("stream", True)  # Claude Code always streams

            # Translate request to provider format (always a 5-tuple).
            method, path, headers, req_body, use_responses_api = provider.translate_request(body)

            # Debug: log upstream request details
            try:
                req_parsed = json.loads(req_body)
                tool_count = len(req_parsed.get("tools", []))
                msg_count = len(req_parsed.get("messages", []))
                req_model = req_parsed.get("model", "?")
                logger.info(
                    "Upstream request: model=%s, messages=%d, tools=%d, body_size=%d",
                    req_model, msg_count, tool_count, len(req_body)
                )
            except Exception:
                logger.info("Upstream request: body_size=%d", len(req_body))

            # Connect to upstream provider
            conn = provider.get_connection()
            try:
                conn.request(method, path, body=req_body, headers=headers)
                upstream_resp = conn.getresponse()

                # Some Copilot/OpenAI-compatible requests fail intermittently with
                # HTTP 400 when the tool payload is large. Retry once with fewer
                # tools rather than failing the whole role invocation.
                if upstream_resp.status == 400 and "tools" in body and isinstance(body.get("tools"), list):
                    error_body = upstream_resp.read().decode("utf-8", errors="replace")
                    original_tools = body["tools"]
                    reduced_count = max(1, len(original_tools) // 2)
                    body["tools"] = original_tools[:reduced_count]
                    logger.warning(
                        "Upstream 400; retrying once with reduced tools (%d -> %d). Error: %s",
                        len(original_tools), reduced_count, error_body[:300]
                    )

                    method, path, headers, req_body, use_responses_api = provider.translate_request(body)
                    conn.close()
                    conn = provider.get_connection()
                    conn.request(method, path, body=req_body, headers=headers)
                    upstream_resp = conn.getresponse()

                if upstream_resp.status >= 400:
                    if 400 <= upstream_resp.status < 500:
                        self.__class__._metrics_inc("requests_upstream_4xx", 1)
                    elif upstream_resp.status >= 500:
                        self.__class__._metrics_inc("requests_upstream_5xx", 1)
                    error_body = upstream_resp.read().decode("utf-8", errors="replace")
                    logger.error(
                        "Upstream error %d: %s", upstream_resp.status, error_body[:500]
                    )
                    self._send_error(
                        upstream_resp.status,
                        "api_error",
                        f"Upstream provider error: {error_body[:500]}",
                    )
                    return

                if is_streaming:
                    self.__class__._metrics_inc("streams_total", 1)
                    # Stream SSE response back
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Connection", "close")
                    self.end_headers()

                    try:
                        flush_every = max(1, int(self.__class__._stream_flush_lines))
                        pending_lines = 0
                        for sse_line in provider.translate_stream(upstream_resp, use_responses_api=use_responses_api):
                            self.wfile.write(f"{sse_line}\n\n".encode("utf-8"))
                            pending_lines += 1
                            self.__class__._metrics_inc("stream_events_total", 1)
                            if pending_lines >= flush_every:
                                self.wfile.flush()
                                self.__class__._metrics_inc("stream_flushes_total", 1)
                                pending_lines = 0
                        if pending_lines > 0:
                            self.wfile.flush()
                            self.__class__._metrics_inc("stream_flushes_total", 1)
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        # Client disconnected — nothing to send, just log
                        logger.warning("Client disconnected during streaming")
                    except Exception as e:
                        logger.error("Streaming error: %s", e)
                        # Attempt to send an Anthropic-format error event so the SDK
                        # recognizes the failure instead of hanging on incomplete stream
                        try:
                            error_event = (
                                f"event: error\n"
                                f"data: {json.dumps({'type': 'error', 'error': {'type': 'stream_error', 'message': str(e)}})}"
                            )
                            self.wfile.write(f"{error_event}\n\n".encode("utf-8"))
                            self.wfile.flush()
                        except Exception:
                            pass  # Client already gone, nothing we can do

                    # Signal end of response so the client's stream terminates
                    self.close_connection = True
                else:
                    # Non-streaming (rare for Claude Code, but handle it)
                    resp_body = upstream_resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(resp_body)
            finally:
                conn.close()

        except ProviderError as e:
            self.__class__._metrics_inc("requests_errors", 1)
            logger.error("Provider error: %s", e.message)
            self._send_error(e.status_code, e.error_type, e.message)
        except json.JSONDecodeError as e:
            self.__class__._metrics_inc("requests_errors", 1)
            self._send_error(400, "invalid_request", f"Invalid JSON: {e}")
        except Exception as e:
            self.__class__._metrics_inc("requests_errors", 1)
            logger.exception("Unexpected proxy error")
            self._send_error(500, "internal_error", str(e))
        finally:
            if counted_inflight:
                self.__class__._metrics_inflight_delta(-1)
            self.__class__._metrics_add_float("latency_ms_total", (time.perf_counter() - req_started) * 1000.0)
            if acquired_capacity_slot and self.__class__._concurrency_semaphore is not None:
                self.__class__._concurrency_semaphore.release()

    def _handle_count_tokens(self) -> None:
        """Best-effort Anthropic count_tokens compatibility endpoint.

        Copilot/OpenAI-compatible providers often do not expose a direct
        token-count endpoint. Returning a stable approximation avoids hard
        404 failures in clients that probe this path.
        """
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            body = json.loads(raw_body or b"{}")

            messages = body.get("messages", []) if isinstance(body, dict) else []
            text_parts: list[str] = []
            for msg in messages if isinstance(messages, list) else []:
                if not isinstance(msg, dict):
                    continue
                content = msg.get("content")
                if isinstance(content, str):
                    text_parts.append(content)
                    continue
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and isinstance(part.get("text"), str):
                            text_parts.append(part["text"])

            joined = "\n".join(text_parts)
            # Rough estimate: ~4 chars/token baseline, clamp to >=1 for non-empty payloads.
            estimated_tokens = max(1, len(joined) // 4) if joined else 0
            self._send_json(200, {"input_tokens": estimated_tokens})
        except Exception as e:
            logger.warning("count_tokens fallback failed: %s", e)
            self._send_json(200, {"input_tokens": 0})

    def _handle_switch_provider(self) -> None:
        """Switch the active provider at runtime via POST /_proxy/switch."""
        content_length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(content_length)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            self._send_error(400, "invalid_request", f"Invalid JSON: {e}")
            return
        new_provider = data.get("provider", "")

        if new_provider not in self.config.get("providers", {}):
            self._send_error(
                400, "invalid_request",
                f"Unknown provider: {new_provider}. "
                f"Available: {list(self.config['providers'].keys())}"
            )
            return

        try:
            new_prov = create_provider(new_provider, self.config)
            with ProxyHandler._state_lock:
                ProxyHandler.provider = new_prov
                self.config["active_provider"] = new_provider
            logger.info("Switched to provider: %s", new_provider)
            self._send_json(200, {
                "status": "ok",
                "active_provider": new_provider,
            })
        except Exception as e:
            self._send_error(500, "internal_error", f"Failed to switch: {e}")

    def _handle_set_token(self) -> None:
        """Set a provider auth token in the process environment."""
        content_length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(content_length)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            self._send_error(400, "invalid_request", f"Invalid JSON: {e}")
            return
        env_var = data.get("env_var", "GITHUB_TOKEN")
        token = data.get("token", "")

        if env_var not in self._ALLOWED_TOKEN_VARS:
            self._send_error(
                400, "invalid_request",
                f"Unknown env var: {env_var}. "
                f"Allowed: {sorted(self._ALLOWED_TOKEN_VARS)}"
            )
            return

        if not token:
            self._send_error(400, "invalid_request", "Token value required")
            return

        os.environ[env_var] = token
        logger.info("Token set for %s (length: %d)", env_var, len(token))
        self._send_json(200, {"status": "ok", "env_var": env_var})

    # Model-name patterns → provider name mapping for auto-switch
    # Only used to switch AWAY from an incompatible provider.
    # Copilot supports all model families so we never auto-switch away from it.
    _MODEL_PROVIDER_HINTS: list[tuple[tuple[str, ...], str]] = [
        (("claude-",), "anthropic"),
        # All non-Claude models default to copilot (widest model support)
    ]

    def _infer_provider_from_model(self, model: str) -> str | None:
        """Return the provider that should handle this model, or None if current is fine."""
        current = self.config.get("active_provider", "")
        ml = model.lower()

        # Copilot supports all model families — never auto-switch away from it
        if current == "copilot":
            return None

        # Claude models → anthropic is ideal, but copilot also works
        if ml.startswith("claude-"):
            return "anthropic" if current != "anthropic" else None

        # Everything else (gpt-*, gemini-*, o3-*, codex, etc.) → copilot
        if current != "copilot":
            return "copilot"

        return None

    def _handle_set_model(self) -> None:
        """Set the active model override, auto-switching provider if needed."""
        content_length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(content_length)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            self._send_error(400, "invalid_request", f"Invalid JSON: {e}")
            return
        model = data.get("model", "")
        with ProxyHandler._state_lock:
            ProxyHandler._active_model_override = model
        logger.info("Active model override set to: %s", model or "(cleared)")

        # Auto-switch provider when the model implies a different one
        if model:
            implied = self._infer_provider_from_model(model)
            current = self.config.get("active_provider", "")
            if implied and implied != current and implied in self.config.get("providers", {}):
                try:
                    new_prov = create_provider(implied, self.config)
                    with ProxyHandler._state_lock:
                        ProxyHandler.provider = new_prov
                        self.config["active_provider"] = implied
                    logger.info("Auto-switched provider: %s → %s (model: %s)", current, implied, model)
                except Exception as e:
                    logger.warning("Auto-switch to %s failed: %s", implied, e)

        self._send_json(200, {"status": "ok", "model": model, "active_provider": self.config.get("active_provider", "")})

    def _handle_status(self) -> None:
        """Return proxy status."""
        metrics = self.__class__._metrics_snapshot()
        requests_total = int(metrics.get("requests_total", 0))
        avg_latency_ms = (
            round(float(metrics.get("latency_ms_total", 0.0)) / requests_total, 2)
            if requests_total > 0 else 0.0
        )
        self._send_json(200, {
            "status": "ok",
            "active_provider": self.config.get("active_provider", "unknown"),
            "available_providers": list(self.config.get("providers", {}).keys()),
            "listen_port": self.config.get("listen_port", 8765),
            "performance": {
                "concurrency_limit": self.__class__._concurrency_limit,
                "concurrency_timeout_seconds": self.__class__._concurrency_acquire_timeout_s,
                "stream_flush_lines": self.__class__._stream_flush_lines,
            },
            "metrics": {
                "requests_total": requests_total,
                "requests_errors": int(metrics.get("requests_errors", 0)),
                "requests_upstream_4xx": int(metrics.get("requests_upstream_4xx", 0)),
                "requests_upstream_5xx": int(metrics.get("requests_upstream_5xx", 0)),
                "requests_rejected_capacity": int(metrics.get("requests_rejected_capacity", 0)),
                "requests_timeout_capacity": int(metrics.get("requests_timeout_capacity", 0)),
                "streams_total": int(metrics.get("streams_total", 0)),
                "stream_events_total": int(metrics.get("stream_events_total", 0)),
                "stream_flushes_total": int(metrics.get("stream_flushes_total", 0)),
                "inflight": int(metrics.get("inflight", 0)),
                "max_inflight": int(metrics.get("max_inflight", 0)),
                "avg_latency_ms": avg_latency_ms,
                "started_at_unix": int(metrics.get("started_at_unix", 0)),
            },
        })

    def _handle_list_models(self) -> None:
        """Return available models from the active provider."""
        try:
            models = self.provider.list_models()
            self._send_json(200, {
                "provider": self.config.get("active_provider", "unknown"),
                "models": models,
            })
        except ProviderError as e:
            self._send_error(e.status_code, e.error_type, e.message)
        except Exception as e:
            logger.exception("Error listing models")
            self._send_error(500, "internal_error", str(e))

    def _handle_copilot_jwt(self) -> None:
        """Return a valid Copilot JWT for direct API access.

        Only works when the active provider is 'copilot'. Backend agents
        call this to get a JWT so they can connect to api.githubcopilot.com
        directly without needing GITHUB_TOKEN themselves.
        """
        from providers.copilot import CopilotProvider

        if not isinstance(self.provider, CopilotProvider):
            self._send_error(
                400, "invalid_request",
                "copilot-jwt endpoint requires active provider to be 'copilot'",
            )
            return
        try:
            jwt = self.provider.get_api_key()
            self._send_json(200, {"token": jwt})
        except ProviderError as e:
            self._send_error(e.status_code, e.error_type, e.message)
        except Exception as e:
            logger.exception("Error fetching Copilot JWT")
            self._send_error(500, "internal_error", str(e))

    def _send_json(self, status: int, data: dict[str, Any]) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: int, error_type: str, message: str) -> None:
        self._send_json(status, {
            "type": "error",
            "error": {"type": error_type, "message": message},
        })


class ThreadedHTTPServer(http.server.ThreadingHTTPServer):
    """Threaded HTTP server with reuse_address."""
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    parser = argparse.ArgumentParser(description="Claude Code Multi-Provider Proxy")
    parser.add_argument(
        "--config",
        default=str(_SCRIPT_DIR / "config.json"),
        help="Path to config.json",
    )
    parser.add_argument("--port", type=int, default=None, help="Override listen port")
    parser.add_argument(
        "--provider", default=None, help="Override active provider"
    )
    parser.add_argument(
        "--log-level", default=None, help="Log level (debug/info/warning/error)"
    )
    args = parser.parse_args()

    config = load_config(args.config)

    log_level = args.log_level or config.get("log_level", "info")
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    port = args.port or config.get("listen_port", 8765)
    host = config.get("listen_host", "127.0.0.1")
    active = args.provider or config.get("active_provider", "anthropic")

    # Create provider
    provider = create_provider(active, config)
    config["active_provider"] = active

    # Set class-level state
    ProxyHandler.provider = provider
    ProxyHandler.config = config
    ProxyHandler.model_map = config.get("model_map", {})
    # Optional performance controls (safe defaults preserve old behavior)
    # PROXY_CONCURRENCY_LIMIT: 0 => unlimited (default)
    # PROXY_CONCURRENCY_WAIT_SECONDS: wait time for capacity slot (default 30)
    # PROXY_STREAM_FLUSH_LINES: flush every N SSE events (default 1 = old behavior)
    try:
        concurrency_limit = max(0, int(os.getenv("PROXY_CONCURRENCY_LIMIT", "0")))
    except ValueError:
        concurrency_limit = 0
    try:
        concurrency_wait_s = float(os.getenv("PROXY_CONCURRENCY_WAIT_SECONDS", "30"))
        if concurrency_wait_s < 0:
            concurrency_wait_s = 0.0
    except ValueError:
        concurrency_wait_s = 30.0
    try:
        stream_flush_lines = max(1, int(os.getenv("PROXY_STREAM_FLUSH_LINES", "1")))
    except ValueError:
        stream_flush_lines = 1

    ProxyHandler._concurrency_limit = concurrency_limit
    ProxyHandler._concurrency_acquire_timeout_s = concurrency_wait_s
    ProxyHandler._stream_flush_lines = stream_flush_lines
    ProxyHandler._concurrency_semaphore = (
        threading.BoundedSemaphore(concurrency_limit) if concurrency_limit > 0 else None
    )
    ProxyHandler._metrics_set("started_at_unix", int(time.time()))

    # Security: ensure proxy only binds to loopback to prevent network exposure
    assert host in ("127.0.0.1", "localhost", "::1"), (
        f"Proxy must bind to loopback, not {host}"
    )

    server = ThreadedHTTPServer((host, port), ProxyHandler)
    logger.info("Proxy listening on http://%s:%d", host, port)
    logger.info("Active provider: %s", active)
    logger.info(
        "Performance controls: concurrency_limit=%d, wait_timeout_s=%s, stream_flush_lines=%d",
        concurrency_limit,
        concurrency_wait_s,
        stream_flush_lines,
    )
    logger.info(
        "Configure Claude Code: ANTHROPIC_BASE_URL=http://%s:%d", host, port
    )

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down proxy")
        server.shutdown()


if __name__ == "__main__":
    main()
