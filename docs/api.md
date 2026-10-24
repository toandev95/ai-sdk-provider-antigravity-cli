# API reference

## Exports

```ts
import {
  antigravity,
  AntigravityLanguageModel,
  createAntigravity,
} from 'ai-sdk-provider-antigravity-cli';
```

- `antigravity(modelId?, settings?)` is the default provider instance.
- `createAntigravity({ defaultSettings })` creates an independently configured provider.
- `AntigravityLanguageModel` is exported for hosts that need direct access to the AI SDK
  `LanguageModelV4` implementation.

`modelId` defaults to `default`. That sentinel omits `--model`, allowing Antigravity to use its own
configured model. Any other string is forwarded unchanged and validated by `agy`.
`AntigravityModelId` includes autocomplete suggestions for Gemini 3.8 Flash, Gemini 4 Argon,
Claude Opus 5.5, and Claude Sonnet 5.5 in Low/Medium/High variants. These suggestions are not an
allowlist; see [model IDs](./models.md) and use `provider.listModels()` for the live CLI catalog.

## Settings

| Setting                      | Type                                    | Default     | Behavior                                                                       |
| ---------------------------- | --------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| `agyPath`                    | `string`                                | `agy`       | Executable or wrapper command.                                                 |
| `agyArgs`                    | `string[]`                              | `[]`        | Arguments inserted before provider-managed flags. Useful for wrappers.         |
| `cwd`                        | `string`                                | inherited   | Agent workspace and child-process working directory.                           |
| `env`                        | `Record<string, string>`                | inherited   | Values merged over `process.env`.                                              |
| `effort`                     | `low \| medium \| high \| xhigh \| max` | CLI default | Forwarded as `--effort`.                                                       |
| `agent`                      | `string`                                | CLI default | Forwarded as `--agent`.                                                        |
| `conversationId`             | `string`                                | none        | Resume one conversation with `--conversation`.                                 |
| `continue`                   | `boolean`                               | `false`     | Resume the most recent conversation. Mutually exclusive with `conversationId`. |
| `sandbox`                    | `boolean`                               | `true`      | Adds `--sandbox` unless dangerous permission bypass is enabled.                |
| `dangerouslySkipPermissions` | `boolean`                               | `false`     | Adds `--dangerously-skip-permissions` and suppresses `--sandbox`.              |
| `disableSlashCommands`       | `boolean`                               | `true`      | Adds `--disable-slash-commands`.                                               |
| `printTimeout`               | `string`                                | CLI default | Headless timeout such as `30s`, `2m`, or `15m`.                                |
| `includeDirectories`         | `string[]`                              | `[]`        | Repeated `--add-dir` values.                                                   |
| `rawEvents`                  | `boolean`                               | `false`     | Emits native NDJSON objects as AI SDK `raw` stream parts.                      |
| `verbose`                    | `boolean`                               | `false`     | Enables debug and informational logger calls.                                  |
| `logger`                     | `Logger \| false`                       | console     | Custom logger or `false` for no provider logging.                              |

Settings passed to a model override provider defaults. Call-level provider options override both.
`permissionMode`, `unsupportedFeatures`, and `timeoutMs` are also supported as settings and call-level
options. See the [server and tools guide](./server-and-tools.md) for preset mappings, precedence,
MCP helper types, and lifecycle behavior. `createAntigravity` additionally accepts
`maxConcurrentRequests` (default 4), shared across its model instances.

## Provider options

```ts
const result = await generateText({
  model: antigravity(),
  prompt: 'Continue the task.',
  providerOptions: {
    'antigravity-cli': {
      conversationId: 'conversation-id',
      effort: 'high',
      rawEvents: true,
    },
  },
});
```

Supported call-level keys are `agent`, `continue`, `conversationId`,
`dangerouslySkipPermissions`, `effort`, `includeDirectories`, `printTimeout`, `rawEvents`, and
`sandbox`, `permissionMode`, `unsupportedFeatures`, and `timeoutMs`. Unknown keys are rejected by the provider-options schema.

The AI SDK top-level `reasoning` option maps to Antigravity effort when its value is `low`,
`medium`, `high`, or `xhigh`. A call-level provider-specific `effort` takes precedence.
Use provider-specific `effort: 'max'` for the CLI's additional maximum setting.
The CLI accepts these effort values; their availability and effect depend on the selected model.

## Result metadata

Successful calls include:

```ts
result.providerMetadata?.['antigravity-cli'];
// {
//   conversationId?: string
//   durationSeconds?: number
//   numTurns?: number
//   status?: string
//   structuredOutput?: unknown
// }
```

Token usage maps as follows:

- `input_tokens` → input total
- `cache_read_tokens` → input cache read
- input total minus cache read → non-cached input
- `output_tokens` → output total
- `thinking_tokens` → reasoning output
- output total minus thinking → text output

For resumed native conversations, Antigravity reports cumulative usage for the conversation.

## Unsupported AI SDK inputs

Antigravity's current stream-input protocol accepts text blocks only. File, image, and custom
message parts are omitted with an AI SDK warning. Sampling controls and AI SDK function-tool
definitions are also reported as unsupported instead of being silently approximated.
