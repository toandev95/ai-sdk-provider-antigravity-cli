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

## Settings

| Setting                      | Type                     | Default     | Behavior                                                                       |
| ---------------------------- | ------------------------ | ----------- | ------------------------------------------------------------------------------ |
| `agyPath`                    | `string`                 | `agy`       | Executable or wrapper command.                                                 |
| `agyArgs`                    | `string[]`               | `[]`        | Arguments inserted before provider-managed flags. Useful for wrappers.         |
| `cwd`                        | `string`                 | inherited   | Agent workspace and child-process working directory.                           |
| `env`                        | `Record<string, string>` | inherited   | Values merged over `process.env`.                                              |
| `effort`                     | `low \| medium \| high`  | CLI default | Forwarded as `--effort`.                                                       |
| `agent`                      | `string`                 | CLI default | Forwarded as `--agent`.                                                        |
| `conversationId`             | `string`                 | none        | Resume one conversation with `--conversation`.                                 |
| `continue`                   | `boolean`                | `false`     | Resume the most recent conversation. Mutually exclusive with `conversationId`. |
| `sandbox`                    | `boolean`                | `true`      | Adds `--sandbox` unless dangerous permission bypass is enabled.                |
| `dangerouslySkipPermissions` | `boolean`                | `false`     | Adds `--dangerously-skip-permissions` and suppresses `--sandbox`.              |
| `disableSlashCommands`       | `boolean`                | `true`      | Adds `--disable-slash-commands`.                                               |
| `printTimeout`               | `string`                 | CLI default | Headless timeout such as `30s`, `2m`, or `15m`.                                |
| `includeDirectories`         | `string[]`               | `[]`        | Repeated `--include-directories` values.                                       |
| `rawEvents`                  | `boolean`                | `false`     | Emits native NDJSON objects as AI SDK `raw` stream parts.                      |
| `verbose`                    | `boolean`                | `false`     | Enables debug and informational logger calls.                                  |
| `logger`                     | `Logger \| false`        | console     | Custom logger or `false` for no provider logging.                              |

Settings passed to a model override provider defaults. Call-level provider options override both.

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
`sandbox`. Unknown keys are rejected by the provider-options schema.

The AI SDK top-level `reasoning` option maps to Antigravity effort when its value is `low`,
`medium`, or `high`. A provider-specific `effort` takes precedence.

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
