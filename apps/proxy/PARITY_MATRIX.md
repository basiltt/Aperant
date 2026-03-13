# Proxy Parity Matrix (Claude Code)

Last updated: 2026-03-03
Scope: `apps/proxy` compatibility when Claude Code is pointed to `ANTHROPIC_BASE_URL=http://127.0.0.1:8765`.

## How To Re-Run

```powershell
cd C:\Users\ttbasil\Desktop\Projects\PublicProjects\Auto-Claude
apps\backend\.venv\Scripts\python.exe apps\proxy\scripts\proxy_parity_probe.py
```

Optional env overrides:
- `PROXY_PROVIDER` (`copilot`, `anthropic`, `openai`, `gemini`, `openrouter`, `groq`)
- `PROXY_MODEL` (default `claude-sonnet-4.6`)
- `PROXY_HOST` / `PROXY_PORT`

## Matrix

| Feature | Status | Notes |
|---|---|---|
| Basic SSE flow (`message_start -> content_block_* -> message_delta -> message_stop`) | Supported | Verified via live probe and tests. |
| Text streaming (`text_delta`) | Supported | Verified live. |
| Tool use streaming (`tool_use` + `input_json_delta`) | Supported | Verified live; stop reason mapped to `tool_use`. |
| Follow-up turns with tool history | Supported | Regression fixed in message translator ordering/null handling. |
| `tool_choice` mapping (`auto/any/none/tool`) | Supported | `any -> required`, named tool mapping supported. |
| `disable_parallel_tool_use` behavior | Supported | Mapped to OpenAI-compatible `parallel_tool_calls=false`. |
| Strict tool schema (`strict: true`) passthrough | Supported | Forwarded in converted tool definitions. |
| Thinking deltas (`thinking_delta`) | Emulated / Upstream-dependent | Proxy supports translation, but provider must emit reasoning payloads. |
| Thinking signature (`signature_delta`) | Emulated / Upstream-dependent | Emitted when upstream provides signature fields. |
| Usage passthrough (`input/output`, cache fields, `server_tool_use`) | Supported when available | Proxy forwards known usage extras if present upstream. |
| Ping events | Not guaranteed | Anthropic-native ping is not generally emitted by OpenAI-compatible upstreams. |
| Anthropic server tool loop (`server_tool_use`, `web_search_tool_result`, `pause_turn`) | Not possible on non-Anthropic providers | Provider-native behavior, cannot be fully recreated through Copilot/OpenAI-compat layers. |

## Practical Expectation

- With `provider=copilot`, tool calls and normal streaming behave closely to Claude Code expectations.
- Missing visible thinking in some runs is usually due to upstream model/provider not emitting explicit reasoning events.
- For maximum parity on thinking + server tools semantics, use `provider=anthropic` with valid Anthropic credentials.

## Targeted Compatibility Checklist

1. Confirm provider and auth:
   - `GET /_proxy/status` should show expected `active_provider`.
2. Run parity probe script and review:
   - `basic_stream.http == 200`
   - `tool_stream` includes `tool_use` and `input_json_delta`
   - `thinking_stream` includes `thinking_delta` if upstream emits reasoning
3. If thinking is absent:
   - keep proxy debug logs on and check upstream chunks for `reasoning*` fields.
4. Re-run proxy tests after upgrades:

```powershell
cd C:\Users\ttbasil\Desktop\Projects\PublicProjects\Auto-Claude\apps\proxy
..\backend\.venv\Scripts\python.exe -m pytest tests -q
```
