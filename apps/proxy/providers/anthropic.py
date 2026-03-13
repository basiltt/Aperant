"""
Anthropic passthrough provider.

Forwards requests directly to api.anthropic.com with no translation.
Used to validate the proxy infrastructure before adding format translation.
"""

import http.client
import json
import os
from typing import Any, Generator

from .base import BaseProvider, ProviderError


class AnthropicProvider(BaseProvider):
    """Passthrough to the real Anthropic Messages API."""

    def get_api_key(self) -> str:
        env_var = self.config.get("api_key_env", "ANTHROPIC_API_KEY")
        key = os.environ.get(env_var, "")
        if not key:
            raise ProviderError(401, "authentication_error", f"{env_var} not set")
        return key

    def translate_request(
        self, anthropic_body: dict[str, Any]
    ) -> tuple[str, str, dict[str, str], bytes, bool]:
        body_bytes = json.dumps(anthropic_body).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.get_api_key(),
            "anthropic-version": "2023-06-01",
        }
        return ("POST", "/v1/messages", headers, body_bytes, False)

    def translate_stream(
        self, response: http.client.HTTPResponse, *, use_responses_api: bool = False
    ) -> Generator[str, None, None]:
        """Passthrough — yield combined event+data SSE messages from Anthropic."""
        pending_event: str | None = None
        for raw_line in response:
            line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
            if line.startswith("event: "):
                pending_event = line
            elif line.startswith("data: "):
                if pending_event:
                    yield f"{pending_event}\n{line}"
                    pending_event = None
                else:
                    yield line
            # Skip empty lines (SSE separators)
