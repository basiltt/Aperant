"""
OpenAI-compatible provider.

Handles any provider that implements the OpenAI Chat Completions API:
  - OpenAI (api.openai.com)
  - OpenRouter (openrouter.ai)
  - Groq (api.groq.com)
  - Together (api.together.xyz)
  - Mistral (api.mistral.ai)
  - DeepInfra, Fireworks, etc.

All use the same request/response format:
  POST /v1/chat/completions (or /chat/completions)
  Authorization: Bearer <api_key>
"""

import http.client
import json
import logging
import os
from typing import Any, Generator
from urllib.parse import urlparse

from .base import BaseProvider, ProviderError

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from translators.messages import (
    anthropic_to_openai_messages,
    anthropic_to_openai_tools,
    anthropic_tool_choice_to_openai,
)
from translators.streaming import openai_stream_to_anthropic
from translators.thinking import strip_thinking_for_openai

logger = logging.getLogger("proxy.openai_compat")


class OpenAICompatProvider(BaseProvider):
    """Provider for any OpenAI-compatible Chat Completions API."""

    def get_api_key(self) -> str:
        env_var = self.config.get("api_key_env", "OPENAI_API_KEY")
        key = os.environ.get(env_var, "")
        if not key:
            raise ProviderError(401, "authentication_error", f"{env_var} not set")
        return key

    def list_models(self) -> list[dict[str, str]]:
        """Fetch available models via GET /v1/models (or /models)."""
        api_key = self.get_api_key()
        conn = self.get_connection()
        parsed = urlparse(self.base_url)
        base_path = parsed.path.rstrip("/")
        # Try /v1/models then /models
        candidates = [f"{base_path}/models"]
        if "/v1" not in base_path:
            candidates.insert(0, f"{base_path}/v1/models")
        try:
            for path in candidates:
                conn.request("GET", path, headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                })
                resp = conn.getresponse()
                body = resp.read().decode("utf-8")
                if resp.status == 200:
                    data = json.loads(body)
                    models: list[dict[str, str]] = []
                    for m in data.get("data", []):
                        model_id = m.get("id", "")
                        display = m.get("name", model_id) or model_id
                        models.append({"id": model_id, "name": display})
                    return models
                # Try next candidate
                conn.close()
                conn = self.get_connection()
            logger.warning("OpenAI-compat list models: no successful endpoint")
            return []
        except Exception as e:
            logger.warning("OpenAI-compat list models error: %s", e)
            return []
        finally:
            conn.close()

    def translate_request(
        self, anthropic_body: dict[str, Any]
    ) -> tuple[str, str, dict[str, str], bytes, bool]:
        # Strip thinking (OpenAI doesn't support it)
        body = strip_thinking_for_openai(anthropic_body)

        # Build OpenAI request
        openai_body: dict[str, Any] = {
            "model": body.get("model", self.default_model),
            "messages": anthropic_to_openai_messages(body),
            "stream": True,
            "stream_options": {"include_usage": True},
        }

        # Max tokens
        max_tokens = body.get("max_tokens")
        if max_tokens:
            openai_body["max_tokens"] = max_tokens

        # Temperature
        temperature = body.get("temperature")
        if temperature is not None:
            openai_body["temperature"] = temperature

        # Top-p
        top_p = body.get("top_p")
        if top_p is not None:
            openai_body["top_p"] = top_p

        # Tools
        tools = body.get("tools")
        if tools:
            openai_body["tools"] = anthropic_to_openai_tools(tools)

        tool_choice, parallel_tool_calls = anthropic_tool_choice_to_openai(body.get("tool_choice"))
        if tool_choice is not None:
            openai_body["tool_choice"] = tool_choice
        if parallel_tool_calls is not None:
            openai_body["parallel_tool_calls"] = parallel_tool_calls

        # Stop sequences
        stop = body.get("stop_sequences")
        if stop:
            openai_body["stop"] = stop

        # Build path
        parsed = urlparse(self.base_url)
        path = parsed.path.rstrip("/")
        if not path.endswith("/chat/completions"):
            path = f"{path}/chat/completions"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.get_api_key()}",
        }

        # Provider-specific headers
        provider_name = self.config.get("_provider_name", "")
        if provider_name == "openrouter":
            headers["HTTP-Referer"] = "https://auto-claude.app"
            headers["X-Title"] = "Auto Claude"

        body_bytes = json.dumps(openai_body).encode("utf-8")
        return ("POST", path, headers, body_bytes, False)

    def translate_stream(
        self, response: http.client.HTTPResponse, *, use_responses_api: bool = False
    ) -> Generator[str, None, None]:
        model = self.config.get("default_model", "proxy")
        yield from openai_stream_to_anthropic(response, model=model)
