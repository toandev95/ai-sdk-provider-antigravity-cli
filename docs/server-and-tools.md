# AI SDK server integration

The package is a Node.js AI SDK v7 language-model provider. Any framework that uses `generateText`
or `streamText` can call it; no OpenCode dependency or application-specific adapter is required.
It starts the official `agy` executable and uses its documented stdin/stdout protocol. It does not
implement Google's internal HTTP endpoints, change client identity, or extract authentication tokens.

The permission and local MCP patterns were informed by
[ai-sdk-provider-codex-cli](https://github.com/ben-vargas/ai-sdk-provider-codex-cli).
The actual transport and flags follow [Antigravity's headless protocol](https://www.antigravity.google/docs/cli/headless/).
Authentication rights remain separate from technical compatibility; see [Google policy notes](./google-policy.md).

## Per-user permissions

```ts
import { createAntigravity } from 'ai-sdk-provider-antigravity-cli';

const provider = createAntigravity({
  maxConcurrentRequests: 2,
  defaultSettings: {
    permissionMode: 'sandbox',
    unsupportedFeatures: 'error',
    timeoutMs: 60_000,
  },
});

// Read this selection from a user setting that your application controls.
const model = provider('gemini-3.8-flash-medium', { permissionMode: 'turbo' });
```

| Preset         | CLI flags                        | Meaning                                                                     |
| -------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `sandbox`      | `--sandbox`                      | Keep terminal sandbox restrictions; CLI approval rules still apply.         |
| `accept-edits` | `--sandbox --mode accept-edits`  | Approve workspace edits; terminal commands still follow CLI rules.          |
| `auto`         | `--sandbox --mode auto`          | CLI evaluates commands automatically where supported.                       |
| `plan`         | `--sandbox --mode plan`          | Ask CLI to plan; this is not an enforced read-only filesystem policy.       |
| `turbo`        | `--dangerously-skip-permissions` | Explicit opt-in to bypass CLI approval prompts; provider omits `--sandbox`. |
| `inherit`      | none                             | Leave execution permissions to the user's saved CLI settings.               |

With no preset, existing `sandbox` and `dangerouslySkipPermissions` settings keep their behavior;
the provider adds `--sandbox` by default. An explicit preset takes precedence over those legacy
settings. Model settings override provider defaults, and call-level `providerOptions['antigravity-cli']`
override both. To revoke a default turbo selection, explicitly select another preset for that call.
Permission flags in `agyArgs` cannot be combined with a preset.

Turbo does not grant administrator/root access, override OS restrictions, or change the account's
service permissions. It also does not override approval checks in your MCP callbacks.
`auto` availability and fallback behavior are owned by the CLI and depend on platform/account.
See [official execution-mode documentation](https://www.antigravity.google/docs/cli/modes/).

## Host callback tools through MCP

An AI SDK language-model provider receives tool definitions, not the JavaScript `execute` callbacks.
This CLI protocol cannot accept those definitions directly. Consequently, passing `tools` to
`generateText` is still unsupported. Register the actual tools with `createSdkMcpServer` instead:

```ts
import { generateText, tool } from 'ai';
import { z } from 'zod';
import {
  createAntigravity,
  createSdkMcpServer,
  createMcpWorkspace,
} from 'ai-sdk-provider-antigravity-cli';

const server = await createSdkMcpServer({
  tools: {
    lookupOrder: tool({
      description: 'Look up an order by ID.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => ({ id, status: 'shipped' }),
    }),
  },
});
const workspace = await createMcpWorkspace({ app: server.config });

try {
  const provider = createAntigravity({
    defaultSettings: {
      cwd: workspace.cwd,
      permissionMode: 'sandbox',
      timeoutMs: 60_000,
      unsupportedFeatures: 'error',
    },
  });
  const result = await generateText({
    model: provider('gemini-3.8-flash-medium'),
    prompt: 'Use the app MCP server to look up order A42 and report its status.',
  });
  console.log(result.text);
} finally {
  await server.close();
  await workspace.dispose();
}
```

The CLI discovers the server, invokes MCP, and the server executes the callback in your Node.js
process. Tool events remain `providerExecuted: true`, because the CLI owns orchestration; they are
not function calls awaiting execution by the outer AI SDK loop. CLI event tool names may describe
its generic MCP invocation tool rather than the callback name. Reuse `streamText(...).fullStream`
to observe the CLI's tool events and final response.

The generated workspace contains `.agents/mcp_config.json`, following the
[official workspace MCP configuration](https://www.antigravity.google/docs/mcp/). Its `cwd` is a new
temporary directory. For project work, pass absolute project directories through `includeDirectories`
and make the intended project path explicit in the prompt. The helper does not move or copy a project.
It never edits existing project or global configuration. Global CLI settings, credentials, plugins,
and MCP definitions can still be inherited; a temporary workspace is not a per-user security sandbox.

If the CLI denies an MCP call before it reaches the server, configure the CLI's permission rules or
explicitly select the appropriate permission preset. The helper itself does not change those rules.

The workspace helper also accepts existing HTTP and stdio MCP servers:

```ts
const workspace = await createMcpWorkspace({
  app: server.config,
  docs: { serverUrl: 'https://example.com/mcp', headers: { Authorization: 'Bearer ...' } },
  local: { command: 'node', args: ['/absolute/path/to/mcp-server.mjs'] },
});
```

## Callback approvals and lifecycle

`createSdkMcpServer({ tools, onApproval, toolContext, maxConcurrentToolCalls })`:

- Binds only to `127.0.0.1` on an automatically allocated port.
- Generates a random bearer token, validates the HTTP Host, and rejects browser Origin requests.
- Supports stateless Streamable HTTP with JSON responses; SSE-only servers are not used.
- Validates tool names, JSON input, optional output schemas, and optional per-tool context.
- Calls `onApproval({ toolName, input, toolCallId, signal })` for every invocation when supplied.
- Denies `needsApproval` tools when no approval callback is supplied. The callback is an
  application decision, not an AI SDK UI approval event.
- Converts callback errors and denials to MCP error results.
- Supports async-generator callbacks, returning their final yielded value. Intermediate values
  are not streamed through MCP as separate tool results.
- Supplies `execute` with an abort signal and validated tool-specific context; `messages` is empty
  because MCP does not provide the originating model transcript. Callback cancellation is cooperative.

Only executable host tools are accepted; provider-defined tools are rejected. AI SDK input hooks,
tool search/deferred loading, SDK UI approval round trips, and automatic MCP resource/prompt injection
are not implemented by this helper. A tool's MCP callback can use other services explicitly.

`server.config` contains a credential: do not log it. `createMcpWorkspace` writes the credential to a
temporary file with restrictive file mode where supported. Always close the server and dispose the
workspace in `finally`; Windows cleanup retries transient file locks. Close the CLI request before
disposing its workspace. Process crashes may leave temporary files for the application to clean up.

## Server behavior and capability checks

`maxConcurrentRequests` defaults to 4 and is shared by all model instances from one provider.
Queued requests can be aborted; `timeoutMs` includes queue time and process execution. Stream
cancellation terminates the CLI child and releases the slot when it exits. Each call starts a new
CLI process; persistent process pooling is not implemented. CLI failures are not automatically retried
by the provider, avoiding accidental re-execution of side effects.

`unsupportedFeatures: 'error'` rejects unsupported requests before launching the CLI. The default
`'warn'` preserves compatibility and returns AI SDK warnings. Use `antigravityCapabilities` to
inspect the static transport capabilities and `await provider.listModels()` for the current CLI model
catalog. Any nonblank model ID can still be passed directly, including future or non-Gemini models.

This remains a language-model provider: multimodal input, sampling controls, embeddings, image/audio
generation, streamed reasoning text, and incremental structured-object output are not implemented.
For multiple users, isolate OS accounts/containers and credentials as appropriate; a provider instance's
concurrency limit does not coordinate with other instances, processes, or machines.
