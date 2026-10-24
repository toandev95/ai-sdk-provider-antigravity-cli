# Models

Model IDs are forwarded unchanged to the installed Antigravity CLI. Use `agy models` or
`await provider.listModels()` to check availability for your current account. Known IDs below are
TypeScript autocomplete suggestions, not an allowlist; arbitrary nonblank IDs remain supported.

| Family            | Low                     | Medium                     | High                     |
| ----------------- | ----------------------- | -------------------------- | ------------------------ |
| Gemini 3.8 Flash  | `gemini-3.8-flash-low`  | `gemini-3.8-flash-medium`  | `gemini-3.8-flash-high`  |
| Gemini 4 Argon    | `gemini-4-argon-low`    | `gemini-4-argon-medium`    | `gemini-4-argon-high`    |
| Claude Opus 5.5   | `claude-opus-5-5-low`   | `claude-opus-5-5-medium`   | `claude-opus-5-5-high`   |
| Claude Sonnet 5.5 | `claude-sonnet-5-5-low` | `claude-sonnet-5-5-medium` | `claude-sonnet-5-5-high` |

Use `antigravity()` or `antigravity('default')` to omit `--model` and keep the CLI's configured model.

## Claude with AI SDK

```ts
import { generateText } from 'ai';
import { createAntigravity } from 'ai-sdk-provider-antigravity-cli';

const provider = createAntigravity({
  maxConcurrentRequests: 2,
  defaultSettings: { permissionMode: 'sandbox', timeoutMs: 60_000 },
});

const result = await generateText({
  model: provider('claude-sonnet-5-5-medium'),
  prompt: 'Summarize this task in one sentence.',
});
console.log(result.text);

const opus = provider('claude-opus-5-5-high');
const availableModels = await provider.listModels();
```

Model selection and tool permissions are independent. Selecting a High model does not enable turbo.
The optional `effort` setting is forwarded separately as `--effort`; the CLI/model decides which
values it supports. The smoke results below used the exact model IDs without an effort override.

## Authenticated smoke coverage

Verified on 2026-10-24 (Asia/Bangkok) with Antigravity CLI 1.4.6 through this AI SDK provider:

| Model ID                   | Passed cases |
| -------------------------- | ------------ |
| `gemini-3.8-flash-medium`  | 5/5          |
| `gemini-4-argon-medium`    | 5/5          |
| `claude-opus-5-5-low`      | 5/5          |
| `claude-opus-5-5-medium`   | 5/5          |
| `claude-opus-5-5-high`     | 5/5          |
| `claude-sonnet-5-5-low`    | 5/5          |
| `claude-sonnet-5-5-medium` | 5/5          |
| `claude-sonnet-5-5-high`   | 5/5          |

Each model passed a multi-message transcript with system instruction, native-tool streaming,
nested JSON schema output, resume by conversation ID, and a long prompt through stdin. Gemini
Low/High variants were listed by the CLI but were not included in these authenticated runs.
The Claude run passed 30/30 tests and took approximately 280 seconds, including CLI process time.
These are compatibility checks, not quality or performance benchmarks or guarantees of future
availability. They do not verify turbo, host-callback MCP execution, or media support for each model.

See the [testing guide](./testing.md#claude-matrix) to reproduce the Claude matrix, and
[protocol limits](../README.md#current-protocol-limits) for transport capabilities. Account terms
remain separate from model compatibility; see [Google policy notes](./google-policy.md).
