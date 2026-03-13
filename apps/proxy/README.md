# Claude Code Multi-Provider Proxy

Make the Claude Code VS Code extension work with **any LLM provider** —
GitHub Copilot, Google Gemini, OpenAI, OpenRouter, Groq, Mistral, and more.

## How It Works

A lightweight Python server runs on `localhost:8765` and acts as a transparent
proxy. Claude Code thinks it's talking to Anthropic, but the proxy translates
requests to your chosen provider's API format and streams responses back in
Anthropic format.

```
Claude Code Extension
    │ POST /v1/messages (Anthropic format)
    ▼
Local Proxy (localhost:8765)
    │ Translates format
    ▼
Any Provider (Copilot, Gemini, OpenAI, etc.)
```

## Quick Start

### 1. Configure Claude Code

Add to your VS Code `settings.json`:

```json
{
  "claudeCode.environmentVariables": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:8765"
  }
}
```

Or in your project's `.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:8765"
  }
}
```

### 2. Set Provider API Key

```bash
# For GitHub Copilot:
export GITHUB_TOKEN=$(gh auth token)

# For OpenAI:
export OPENAI_API_KEY=sk-...

# For Gemini:
export GEMINI_API_KEY=...

# For OpenRouter:
export OPENROUTER_API_KEY=...
```

### 3. Start the Proxy

```bash
# Default (Anthropic passthrough):
python apps/proxy/proxy_server.py

# With GitHub Copilot:
python apps/proxy/proxy_server.py --provider copilot

# With Gemini:
python apps/proxy/proxy_server.py --provider gemini

# With OpenAI:
python apps/proxy/proxy_server.py --provider openai
```

### 4. Use Claude Code Normally

Open Claude Code in VS Code — it works exactly as before, but
requests go through your chosen provider.

## Switch Providers at Runtime

No need to restart — switch on the fly:

```bash
# Via CLI
python apps/proxy/launcher.py switch copilot
python apps/proxy/launcher.py switch gemini
python apps/proxy/launcher.py switch openai

# Via API
curl -X POST http://localhost:8765/_proxy/switch \
  -H "Content-Type: application/json" \
  -d '{"provider": "copilot"}'
```

## Supported Providers

| Provider | Type | Auth Env Var | Notes |
|----------|------|-------------|-------|
| **Anthropic** | Passthrough | `ANTHROPIC_API_KEY` | Direct, no translation |
| **GitHub Copilot** | OpenAI-compat | `GITHUB_TOKEN` | Auto JWT exchange |
| **OpenAI** | OpenAI-compat | `OPENAI_API_KEY` | GPT-4o, o1, etc. |
| **Google Gemini** | Gemini native | `GEMINI_API_KEY` | With thinking support |
| **OpenRouter** | OpenAI-compat | `OPENROUTER_API_KEY` | 100+ models |
| **Groq** | OpenAI-compat | `GROQ_API_KEY` | Ultra-fast inference |
| **Mistral** | OpenAI-compat | `MISTRAL_API_KEY` | Mistral models |
| **Together** | OpenAI-compat | `TOGETHER_API_KEY` | Open-source models |
| **DeepInfra** | OpenAI-compat | `DEEPINFRA_API_KEY` | GPU inference |

## Configuration

Edit `apps/proxy/config.json` to:
- Add new providers
- Set model mappings (which model to use when Claude Code requests `claude-sonnet-4`)
- Change default port
- Set log level

### Optional Performance Tuning

These environment variables are optional and default to backward-compatible behavior:

- `PROXY_CONCURRENCY_LIMIT` (default `0`): max in-flight `/v1/messages` requests. `0` means unlimited.
- `PROXY_CONCURRENCY_WAIT_SECONDS` (default `30`): max wait time for a capacity slot when limit is enabled.
- `PROXY_STREAM_FLUSH_LINES` (default `1`): flush SSE output every N events. `1` matches old behavior.

Example:

```bash
PROXY_CONCURRENCY_LIMIT=24 \
PROXY_CONCURRENCY_WAIT_SECONDS=15 \
PROXY_STREAM_FLUSH_LINES=4 \
python apps/proxy/proxy_server.py --provider copilot
```

`GET /_proxy/status` now also includes:

- `performance`: active tuning values
- `metrics`: request/stream counters, in-flight gauges, and average latency

## Model Mapping

When Claude Code requests `claude-sonnet-4-20250514`, the proxy maps it
to the equivalent model for your provider:

| Claude Code Requests | Copilot Uses | OpenAI Uses | Gemini Uses |
|---------------------|-------------|-------------|-------------|
| claude-sonnet-4-*   | claude-sonnet-4 | gpt-4o | gemini-2.5-pro |
| claude-opus-4-*     | claude-opus-4 | gpt-4o | gemini-2.5-pro |

Customize mappings in `config.json` → `model_map`.

## Architecture

Zero external dependencies — uses only Python stdlib:
- `http.server` for the local proxy
- `http.client` for upstream connections
- `json` for format translation
- `ssl` for HTTPS to providers
- `threading` for concurrent requests

## Limitations

- **Extended thinking:** Anthropic thinking blocks are forwarded to providers
  that support it (Gemini). For OpenAI/Copilot, thinking is stripped from
  requests since those models reason internally.
- **Vision/images:** Basic support. Complex multimodal content may need
  provider-specific handling.
- **Streaming overhead:** Adds ~1-5ms latency per chunk for translation.
  Negligible for interactive use.
