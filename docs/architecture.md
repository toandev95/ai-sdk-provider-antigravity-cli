# Architecture and protocol mapping

## Process boundary

Each AI SDK call starts one `agy` process in headless mode:

```text
AI SDK messages
  → role-preserving text transcript
  → stdin user event
  → agy --input-format stream-json --output-format stream-json
  → NDJSON parser
  → AI SDK LanguageModelV4 stream parts
```

The prompt is written to stdin, never appended to command arguments. This avoids shell quoting,
shell injection, platform command-length limits, and accidental prompt exposure in process lists.
The child is started with `shell: false`.

## Event mapping

| Antigravity event                | AI SDK output                          |
| -------------------------------- | -------------------------------------- |
| `init`                           | `response-metadata`                    |
| agent `step_update.text_delta`   | `text-start`, `text-delta`, `text-end` |
| tool `ACTIVE`                    | dynamic provider-executed `tool-call`  |
| tool `DONE` or `ERROR`           | dynamic `tool-result`                  |
| `result.usage`                   | normalized AI SDK usage                |
| successful `result`              | `finish` plus provider metadata        |
| failed `result` or non-zero exit | `APICallError`                         |

Text blocks are closed at tool boundaries. This preserves the order of assistant text, tool calls,
tool results, and later assistant text for both streaming and non-streaming APIs.

Unknown event fields remain present in opt-in raw events but receive no executable meaning.

## Structured output

For AI SDK JSON output, the JSON Schema is forwarded through `--json-schema`. Antigravity may emit
human-facing wrapper text in agent-response steps while placing the schema-validated value in
`result.structured_output`. The provider suppresses wrapper deltas and serializes only the native
validated value, allowing `generateText` or `streamText` with `Output.object` to validate the
correct payload.

## Tool ownership

Antigravity tools and AI SDK function tools have different owners:

- Antigravity chooses and executes its installed tools, MCP servers, skills, and artifact
  capabilities. These are surfaced with `providerExecuted: true`.
- AI SDK function tools are callbacks owned by the host JavaScript process. The current
  Antigravity stream-input schema cannot receive their definitions, so the provider warns and does
  not forward them.

Conflating these paths would make the host believe it controls execution that already happened in
the CLI. The explicit distinction keeps approvals and audit trails accurate.

## Permissions

Sandbox mode is a provider safety default even though it is not the CLI default. Tool permission
rules remain owned by Antigravity. `dangerouslySkipPermissions` is deliberately verbose and must be
enabled explicitly; when selected it takes precedence over the sandbox flag.

## Lifecycle and errors

- `AbortSignal` sends `SIGTERM` to the child and rejects with the original abort reason.
- stdout is buffered by line so NDJSON objects split across OS chunks remain valid.
- stderr is bounded to the last 64 KiB before being attached to an error.
- Authentication failures become AI SDK `LoadAPIKeyError` values.
- Prompts and model responses are not logged by the provider.
