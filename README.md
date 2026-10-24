# AI SDK Provider for Antigravity CLI

[![npm](https://img.shields.io/npm/v/ai-sdk-provider-antigravity-cli)](https://www.npmjs.com/package/ai-sdk-provider-antigravity-cli)
[![license](https://img.shields.io/npm/l/ai-sdk-provider-antigravity-cli)](./LICENSE)

Use Google Antigravity CLI as a Vercel AI SDK v7 language model provider. The adapter runs
`agy` in official headless `stream-json` mode and uses the CLI's cached authentication.

> This is an independent community package. It is not affiliated with or endorsed by Google.

## Requirements

- Node.js 22 or newer
- Vercel AI SDK 7
- Antigravity CLI available as `agy`
- An authenticated CLI session (`agy` once interactively)

The provider targets the AI SDK v7 `LanguageModelV4` contract and has been smoke-tested with
Antigravity CLI 1.4.6. New Antigravity event fields are preserved when `rawEvents` is enabled.

## Install

```bash
npm install ai ai-sdk-provider-antigravity-cli
```

## Generate text

```ts
import { generateText } from 'ai';
import { antigravity } from 'ai-sdk-provider-antigravity-cli';

const result = await generateText({
  model: antigravity('gemini-3.8-flash-medium'),
  prompt: 'Explain this repository in one sentence.',
});

console.log(result.text);
```

Use `antigravity()` or `antigravity('default')` to keep the model selected by the CLI.
Use `antigravity('gemini-4-argon-medium')` to select Gemini 4 Argon. Run `agy models` to
check the model IDs available to your account; both families also offer `-low` and `-high` variants.

Claude Opus 5.5 and Sonnet 5.5 are also supported, with `-low`, `-medium`, and `-high` variants:

```ts
const sonnet = antigravity('claude-sonnet-5-5-medium');
const opus = antigravity('claude-opus-5-5-high');
```

All six Claude variants passed the five-case authenticated smoke suite on 2026-10-24 with CLI 1.4.6
(30/30 tests). See [model IDs and smoke coverage](./docs/models.md). TypeScript suggestions include
these models, while arbitrary model IDs remain accepted for future CLI releases.

## Stream text

```ts
import { streamText } from 'ai';
import { antigravity } from 'ai-sdk-provider-antigravity-cli';

const result = streamText({
  model: antigravity('default'),
  prompt: 'Write a short release note.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Configuration

```ts
import { createAntigravity } from 'ai-sdk-provider-antigravity-cli';

const agy = createAntigravity({
  defaultSettings: {
    cwd: '/path/to/workspace',
    effort: 'high',
    printTimeout: '5m',
    sandbox: true,
  },
});

const model = agy('default', {
  agent: 'designer',
  includeDirectories: ['/path/to/shared-assets'],
});
```

See [API reference](./docs/api.md) for every setting and provider option.

Settings can also be overridden per call:

```ts
await generateText({
  model: agy('default'),
  prompt: 'Continue the previous task.',
  providerOptions: {
    'antigravity-cli': {
      conversationId: 'conversation-id',
      effort: 'medium',
    },
  },
});
```

`continue` and `conversationId` are mutually exclusive. The provider sends the complete AI SDK
message transcript for stateless calls; Antigravity-native conversations are opt-in.

## Structured output

AI SDK JSON response schemas are forwarded to `agy --json-schema`. The CLI performs the schema
enforcement, and the provider serializes the validated `structured_output` as the AI SDK model
text. The native value is also available at
`providerMetadata['antigravity-cli'].structuredOutput`.

## Agent tools and permissions

Use `permissionMode` to expose a permission selector in your application:

```ts
const model = antigravity('gemini-3.8-flash-medium', {
  permissionMode: 'turbo', // Explicit full CLI approval bypass; opt in only for trusted tasks.
});
```

Available presets are `sandbox`, `accept-edits`, `auto`, `plan`, `turbo`, and `inherit`.
The provider keeps sandbox mode on by default. Presets can also be overridden per call through
`providerOptions['antigravity-cli']`.

Antigravity's own tool calls are emitted as AI SDK dynamic tool calls with
`providerExecuted: true`. AI SDK function tools passed to `generateText` are not sent to the CLI,
because the current Antigravity stream-input protocol accepts text messages only.
To execute host callbacks, use `createSdkMcpServer({ tools })` and `createMcpWorkspace(...)` to
expose them through the CLI's supported MCP protocol. See the
[server, permissions, and MCP guide](./docs/server-and-tools.md) and
[runnable example](./examples/server-mcp.mjs).

Sandbox mode is on by default. Headless Antigravity respects the user's permission rules and may
soft-deny a tool that requires interactive approval. Only set `dangerouslySkipPermissions: true`
after the host application has obtained explicit user approval; it disables the provider's default
sandbox flag and asks the CLI to auto-approve every tool.

See [architecture and protocol mapping](./docs/architecture.md) for the distinction between AI SDK
function tools and Antigravity provider-executed tools.

For AI servers, `createAntigravity({ maxConcurrentRequests: 2, defaultSettings: { timeoutMs: 60000,
unsupportedFeatures: 'error' } })` limits parallel CLI processes and rejects unsupported inputs.
`await provider.listModels()` discovers available models dynamically; `antigravityCapabilities`
describes what this transport supports. Model IDs remain open-ended.

## Current protocol limits

- Stream input accepts text content only. Image and file message parts produce AI SDK warnings and
  are omitted rather than being silently encoded into the prompt.
- Antigravity reports thinking-token usage but does not expose reasoning text in its headless event
  stream.
- Resumed conversations report cumulative CLI usage, as defined by Antigravity's protocol.
- The package exposes a language model only. Antigravity-created images and other artifacts remain
  agent workspace outputs; this package does not pretend they are AI SDK image-model responses.

## Development

```bash
npm install
npm run validate
npm run test:smoke
```

Unit and AI SDK integration tests use a deterministic CLI fixture. The smoke suite invokes the
authenticated `agy` binary and consumes real model quota. See [testing guide](./docs/testing.md).

## Maintainer

[`toandev95`](https://github.com/toandev95)

## License

MIT
