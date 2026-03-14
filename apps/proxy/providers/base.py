"""
Base provider interface.

Every provider must translate:
  1. Anthropic Messages API request → provider-native request
  2. Provider-native SSE stream → Anthropic SSE stream

The proxy calls `translate_request()` to build the upstream HTTP request,
then `translate_stream()` to yield Anthropic-format SSE lines from the
provider's response stream.
"""

import abc
import http.client
import json
import ssl
from typing import Any, Generator
from urllib.parse import urlparse


class ProviderError(Exception):
    """Raised when a provider encounters a non-recoverable error."""

    def __init__(self, status_code: int, error_type: str, message: str):
        self.status_code = status_code
        self.error_type = error_type
        self.message = message
        super().__init__(message)


class BaseProvider(abc.ABC):
    """Abstract base for all upstream LLM providers."""

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.base_url = config.get("base_url", "")
        self.default_model = config.get("default_model", "")

    @abc.abstractmethod
    def get_api_key(self) -> str:
        """Return the API key/token for this provider."""
        ...

    @abc.abstractmethod
    def translate_request(
        self, anthropic_body: dict[str, Any]
    ) -> tuple[str, str, dict[str, str], bytes, bool]:
        """Translate Anthropic request to provider format.

        Returns:
            (method, path, headers, body_bytes, use_responses_api) — 5-tuple.
            The 5th element signals which stream translator to use.
        """
        ...

    @abc.abstractmethod
    def translate_stream(
        self, response: http.client.HTTPResponse, *, use_responses_api: bool = False
    ) -> Generator[str, None, None]:
        """Translate provider SSE stream to Anthropic format.

        Args:
            response: The upstream HTTP response to translate.
            use_responses_api: If True, use the responses-API stream translator
                instead of the default chat/completions translator.
        """
        ...

    def get_connection(self) -> http.client.HTTPSConnection | http.client.HTTPConnection:
        """Create an HTTP(S) connection to the provider's base URL."""
        if not self.base_url:
            provider_name = self.config.get("_provider_name", type(self).__name__)
            raise ProviderError(
                500, "config_error",
                f"Provider {provider_name} missing base_url configuration",
            )
        parsed = urlparse(self.base_url)
        if parsed.scheme == "https":
            ctx = ssl.create_default_context()
            return http.client.HTTPSConnection(
                parsed.hostname,
                parsed.port or 443,
                context=ctx,
                timeout=300,
            )
        return http.client.HTTPConnection(
            parsed.hostname,
            parsed.port or 80,
            timeout=300,
        )

    def map_model(
        self, anthropic_model: str, model_map: dict[str, dict[str, str]]
    ) -> str:
        """Map an Anthropic model name to this provider's equivalent.

        If the model is in model_map, return the provider-specific mapping.
        If it's an unmapped Anthropic full-date model ID (e.g.,
        ``claude-sonnet-4-20250514``), fall back to the provider's default_model.
        Otherwise treat it as a provider-native model ID and pass through
        (e.g., Copilot-native ``claude-opus-4.6``).
        """
        provider_name = self.config.get("_provider_name", "")
        if anthropic_model in model_map:
            mapped = model_map[anthropic_model].get(provider_name)
            if mapped:
                return mapped
        # Only fall back to default_model for full Anthropic date-versioned IDs
        # (e.g. "claude-sonnet-4-20250514") that are NOT in the explicit model_map.
        # Copilot-native short model IDs (e.g. "claude-opus-4.6") should pass through.
        import re
        if anthropic_model.startswith("claude-") and re.search(r"-\d{8}$", anthropic_model):
            return self.default_model or anthropic_model
        # Provider-native model ID → pass through as-is
        return anthropic_model

    def list_models(self) -> list[dict[str, str]]:
        """Return available models from this provider.

        Each entry: ``{"id": "<model_id>", "name": "<display_name>"}``.
        Default implementation returns an empty list; providers override as needed.
        """
        return []

    def make_error_response(self, error: ProviderError) -> dict[str, Any]:
        """Format a provider error as an Anthropic-compatible error response."""
        return {
            "type": "error",
            "error": {
                "type": error.error_type,
                "message": error.message,
            },
        }
