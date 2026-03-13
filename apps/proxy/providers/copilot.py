"""
GitHub Copilot provider.

Requires a GitHub OAuth token (from `gh auth` or device flow).
Exchanges it for a short-lived Copilot API JWT, then uses
the OpenAI-compatible Chat Completions API at api.githubcopilot.com.

Auth flow:
  1. Read GITHUB_TOKEN from env
  2. GET https://api.github.com/copilot_internal/v2/token → JWT
  3. POST https://api.githubcopilot.com/chat/completions with Bearer JWT

The JWT expires every ~30 minutes and is auto-refreshed.
"""

import http.client
import json
import logging
import os
import ssl
import threading
import time
from typing import Any, Generator

from .base import BaseProvider, ProviderError

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from translators.messages import (
    anthropic_to_openai_messages,
    anthropic_to_openai_tools,
    anthropic_tool_choice_to_openai,
    anthropic_to_responses_input,
    anthropic_to_responses_tools,
)
from translators.streaming import openai_stream_to_anthropic, responses_stream_to_anthropic
from translators.thinking import strip_thinking_for_openai


_SSL_CTX = ssl.create_default_context()

logger = logging.getLogger("proxy.copilot")


class CopilotProvider(BaseProvider):
    """GitHub Copilot provider with automatic JWT exchange."""

    # Models that require the /responses endpoint instead of /chat/completions
    _RESPONSES_API_MODELS = {"o3", "o4", "o3-mini", "o4-mini"}
    _RESPONSES_API_PREFIXES = ("codex-", "o3-", "o4-", "gpt-5")

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._jwt: str = ""
        self._jwt_expires_at: float = 0.0
        self._jwt_lock = threading.Lock()
        self._editor_version = config.get("editor_version", "vscode/1.99.0")
        self._plugin_version = config.get("plugin_version", "copilot-chat/0.26.7")

    def get_api_key(self) -> str:
        """Return a valid Copilot JWT, refreshing if expired (thread-safe)."""
        if time.time() < self._jwt_expires_at - 60:
            return self._jwt
        with self._jwt_lock:
            # Double-check after acquiring lock
            if time.time() < self._jwt_expires_at - 60:
                return self._jwt
            return self._exchange_token()

    def _get_github_token(self) -> str:
        """Get the GitHub OAuth token from environment."""
        env_var = self.config.get("github_token_env", "GITHUB_TOKEN")
        token = os.environ.get(env_var, "")
        if not token:
            raise ProviderError(
                401, "authentication_error",
                f"{env_var} not set. Run 'gh auth login' or set it manually."
            )
        return token

    def _exchange_token(self) -> str:
        """Exchange GitHub token for Copilot API JWT."""
        github_token = self._get_github_token()

        conn = http.client.HTTPSConnection(
            "api.github.com", context=_SSL_CTX, timeout=30
        )
        headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/json",
            "User-Agent": "Auto-Claude-Proxy/1.0",
            "Editor-Version": self._editor_version,
            "Editor-Plugin-Version": self._plugin_version,
        }

        try:
            conn.request("GET", "/copilot_internal/v2/token", headers=headers)
            resp = conn.getresponse()
            body = resp.read().decode("utf-8")
        except (http.client.HTTPException, OSError, ConnectionError) as e:
            raise ProviderError(
                502, "token_exchange_failed",
                f"Copilot token exchange failed: {e}"
            ) from e
        finally:
            conn.close()

        if resp.status != 200:
            raise ProviderError(
                resp.status, "authentication_error",
                f"Copilot token exchange failed ({resp.status}): {body[:300]}"
            )

        try:
            data = json.loads(body)
        except json.JSONDecodeError as e:
            raise ProviderError(
                502, "authentication_error",
                f"Copilot token exchange returned invalid JSON: {e}"
            )

        self._jwt = data.get("token", "")
        raw_expiry = data.get("expires_at")
        self._jwt_expires_at = (
            float(raw_expiry)
            if isinstance(raw_expiry, (int, float)) and raw_expiry > 0
            else time.time() + 1800
        )

        if not self._jwt:
            raise ProviderError(
                401, "authentication_error",
                "Copilot token exchange returned empty token"
            )

        return self._jwt

    def list_models(self) -> list[dict[str, str]]:
        """Fetch available models from Copilot API."""
        jwt = self.get_api_key()
        conn = self.get_connection()
        try:
            conn.request("GET", "/models", headers={
                "Authorization": f"Bearer {jwt}",
                "Accept": "application/json",
                "Editor-Version": self._editor_version,
                "Editor-Plugin-Version": self._plugin_version,
                "Copilot-Integration-Id": "vscode-chat",
            })
            resp = conn.getresponse()
            body = resp.read().decode("utf-8")
            if resp.status != 200:
                logger.warning("Copilot list models failed (%d): %s", resp.status, body[:300])
                return []
            data = json.loads(body)
            models: list[dict[str, str]] = []
            skip_types = {"embeddings", "image", "audio", "speech", "tts"}
            for m in data.get("data", []):
                if not isinstance(m, dict):
                    continue
                model_id = m.get("id", "")
                # Filter out non-chat models
                raw_limits = m.get("capabilities", {}).get("limits", []) if isinstance(m.get("capabilities"), dict) else []
                caps: set[str] = set()
                for c in raw_limits:
                    if isinstance(c, dict):
                        caps.add(c.get("type", ""))
                    elif isinstance(c, str):
                        caps.add(c)
                model_type = m.get("model_picker_enabled")
                # Simple heuristic: skip embedding/image/audio models
                if any(t in model_id.lower() for t in skip_types):
                    continue
                display = m.get("name", model_id)
                models.append({"id": model_id, "name": display})
            return models
        except Exception as e:
            logger.warning("Copilot list models error: %s", e)
            return []
        finally:
            conn.close()

    def _needs_responses_api(self, model: str) -> bool:
        """Check if a model requires the /responses endpoint."""
        model_lower = model.lower()
        if model_lower in self._RESPONSES_API_MODELS:
            return True
        return any(model_lower.startswith(p) for p in self._RESPONSES_API_PREFIXES)

    def translate_request(
        self, anthropic_body: dict[str, Any]
    ) -> tuple[str, str, dict[str, str], bytes, bool]:
        # Preserve thinking config before stripping — we re-inject it for
        # Claude models on the /chat/completions path so the upstream
        # Copilot API can forward it to Anthropic if supported.
        thinking_config = anthropic_body.get("thinking")
        body = strip_thinking_for_openai(anthropic_body)
        model = body.get("model", self.default_model)

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.get_api_key()}",
            "Accept": "text/event-stream",
            "Editor-Version": self._editor_version,
            "Editor-Plugin-Version": self._plugin_version,
            "Copilot-Integration-Id": "vscode-chat",
            "OpenAI-Intent": "conversation-panel",
        }

        use_responses_api = self._needs_responses_api(model)
        if use_responses_api:
            method, path, hdrs, body_bytes = self._build_responses_request(body, model, headers)
            return (method, path, hdrs, body_bytes, True)

        method, path, hdrs, body_bytes = self._build_completions_request(body, model, headers, thinking_config)
        return (method, path, hdrs, body_bytes, False)

    def _build_completions_request(
        self, body: dict[str, Any], model: str, headers: dict[str, str],
        thinking_config: dict[str, Any] | None = None,
    ) -> tuple[str, str, dict[str, str], bytes]:
        """Build a /chat/completions request."""
        openai_body: dict[str, Any] = {
            "model": model,
            "messages": anthropic_to_openai_messages(body),
            "stream": True,
            "stream_options": {"include_usage": True},
        }

        max_tokens = body.get("max_tokens")
        if max_tokens:
            openai_body["max_tokens"] = max_tokens

        temperature = body.get("temperature")
        if temperature is not None:
            openai_body["temperature"] = temperature

        tools = body.get("tools")
        if tools:
            openai_body["tools"] = anthropic_to_openai_tools(tools)

        tool_choice, parallel_tool_calls = anthropic_tool_choice_to_openai(body.get("tool_choice"))
        if tool_choice is not None:
            openai_body["tool_choice"] = tool_choice
        if parallel_tool_calls is not None:
            openai_body["parallel_tool_calls"] = parallel_tool_calls

        # Pass thinking config through ONLY for Claude models — the Copilot API
        # forwards it to Anthropic's backend.  Non-Claude models reject this field.
        if thinking_config and "claude" in model.lower():
            openai_body["thinking"] = thinking_config
            logger.info("Including thinking config in Copilot request: %s", thinking_config)

        body_bytes = json.dumps(openai_body).encode("utf-8")
        return ("POST", "/chat/completions", headers, body_bytes)

    def _build_responses_request(
        self, body: dict[str, Any], model: str, headers: dict[str, str]
    ) -> tuple[str, str, dict[str, str], bytes]:
        """Build a /responses request for Codex and reasoning models."""
        responses_body: dict[str, Any] = {
            "model": model,
            "input": anthropic_to_responses_input(body),
            "stream": True,
        }

        max_tokens = body.get("max_tokens")
        if max_tokens:
            responses_body["max_output_tokens"] = max_tokens

        tools = body.get("tools")
        if tools:
            responses_body["tools"] = anthropic_to_responses_tools(tools)

        body_bytes = json.dumps(responses_body).encode("utf-8")
        logger.info("Using /responses endpoint for model: %s", model)
        return ("POST", "/responses", headers, body_bytes)

    def get_connection(self) -> http.client.HTTPSConnection:
        return http.client.HTTPSConnection(
            "api.githubcopilot.com",
            context=_SSL_CTX,
            timeout=300,
        )

    def translate_stream(
        self, response: http.client.HTTPResponse, *, use_responses_api: bool = False
    ) -> Generator[str, None, None]:
        model = self.config.get("default_model", "copilot")
        if use_responses_api:
            yield from responses_stream_to_anthropic(response, model=model)
        else:
            yield from openai_stream_to_anthropic(response, model=model)
