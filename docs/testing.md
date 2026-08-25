# Testing guide

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

The fixture is configured through `agyPath: process.execPath` and `agyArgs`, so production code does
not contain a test-only transport.

## Authenticated smoke suite

```bash
npm run test:smoke
```

This suite invokes the real `agy` executable and consumes model quota. Authenticate interactively
before running it. It covers:

- a system instruction plus multi-turn AI SDK transcript
- native provider tool events
- nested structured output
- resume by `conversation_id`
- a prompt larger than common command-line limits

The smoke suite is excluded from `npm test` so package validation remains deterministic and does not
depend on credentials, quota, network access, or the user's Antigravity configuration.

## Full validation

```bash
npm run validate
npm audit --omit=dev
npm pack --dry-run
```

`validate` builds declarations and JavaScript, runs TypeScript, checks formatting and linting, then
runs the deterministic test suite. `npm pack --dry-run` verifies that only distributable files are
published.
