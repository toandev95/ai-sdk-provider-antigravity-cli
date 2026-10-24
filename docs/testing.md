# Testing guide

Development uses tsup 9 and Vitest 5. Use Node.js 22.18+ (22.x), 24.11+ (24.x), or 26+.
This toolchain requirement is separate from the published provider's Node.js 22+ runtime support.

## Deterministic suite

```bash
npm test
```

The regular suite starts a deterministic Node.js fixture through the same child-process boundary as
the real CLI. It covers:

- protocol parsing and unknown extension preservation
- token accounting
- multi-role prompt conversion and unsupported files
- text/tool/text ordering
- provider settings and call-level option precedence
- structured output selection
- CLI errors and cancellation
- fragmented NDJSON reassembly
- AI SDK `generateText`, `streamText`, and typed `Output.object`
- explicit warnings for host-owned AI SDK tools
- a 250 KB stdin prompt
- permission presets and per-call revocation of turbo mode
- request concurrency, queued cancellation, and deadlines
- model discovery through the CLI process boundary
- authenticated local MCP calls with real SDK clients and executable callbacks
- input validation, callback approvals, errors, context, streaming callback final values, and cleanup
- AI SDK → mock CLI child → workspace MCP config → HTTP MCP → host callback → AI SDK tool results

The fixture is configured through `agyPath: process.execPath` and `agyArgs`, so production code does
not contain a test-only transport.
The MCP suite uses loopback HTTP and a fake CLI; it makes no Google model requests. A passing local
suite does not assert that every model/account can use a new MCP server without CLI permission setup.

## Authenticated smoke suite

```bash
npm run test:smoke
```

This suite invokes the real `agy` executable and consumes model quota. Authenticate interactively
before running it. By default, all five tests run for both `gemini-3.8-flash-medium` and
`gemini-4-argon-medium`. Set `AGY_SMOKE_MODELS` to a comma-separated list to override this matrix,
for example in PowerShell:

```powershell
$env:AGY_SMOKE_MODELS = 'gemini-3.8-flash-high,gemini-4-argon-high'
npm run test:smoke
```

Every invocation also exercises the current `--add-dir` flag. The suite covers:

- a system instruction plus multi-turn AI SDK transcript
- native provider tool events
- nested structured output
- resume by `conversation_id`
- a prompt larger than common command-line limits

The smoke suite is excluded from `npm test` so package validation remains deterministic and does not
depend on credentials, quota, network access, or the user's Antigravity configuration.

### Claude matrix

To run all five cases against every Claude Opus 5.5 and Sonnet 5.5 variant:

```powershell
$previousModels = $env:AGY_SMOKE_MODELS
try {
  $env:AGY_SMOKE_MODELS = @(
    'claude-opus-5-5-low'
    'claude-opus-5-5-medium'
    'claude-opus-5-5-high'
    'claude-sonnet-5-5-low'
    'claude-sonnet-5-5-medium'
    'claude-sonnet-5-5-high'
  ) -join ','
  npm run test:smoke
} finally {
  $env:AGY_SMOKE_MODELS = $previousModels
}
```

This matrix passed 30/30 authenticated tests on 2026-10-24 using CLI 1.4.6, in approximately
280 seconds. Each model passed the transcript, native-tool streaming, nested JSON schema,
conversation resume, and large-stdin cases. Resume uses two calls, so the matrix makes 36 model
requests. It does not cover turbo, the host-callback MCP bridge, or multimodal input. See
[model coverage](./models.md) for the per-model results. The default smoke matrix remains the two
Gemini Medium models unless `AGY_SMOKE_MODELS` is set.

## Full validation

```bash
npm run validate
npm audit --omit=dev
npm pack --dry-run
```

`validate` builds declarations and JavaScript, runs TypeScript, checks formatting and linting, then
runs the deterministic test suite. `npm pack --dry-run` verifies that only distributable files are
published.
