export type AntigravityModelId =
  | 'default'
  | 'gemini-3.8-flash-low'
  | 'gemini-3.8-flash-medium'
  | 'gemini-3.8-flash-high'
  | 'gemini-4-argon-low'
  | 'gemini-4-argon-medium'
  | 'gemini-4-argon-high'
  | 'claude-opus-5-5-low'
  | 'claude-opus-5-5-medium'
  | 'claude-opus-5-5-high'
  | 'claude-sonnet-5-5-low'
  | 'claude-sonnet-5-5-medium'
  | 'claude-sonnet-5-5-high'
  | (string & {});

export type AntigravityEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type AntigravityPermissionMode =
  'inherit' | 'sandbox' | 'accept-edits' | 'auto' | 'plan' | 'turbo';

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface AntigravitySettings {
  /** Path to the `agy` executable. Defaults to resolving `agy` from PATH. */
  agyPath?: string;
  /** Arguments inserted before the provider-managed CLI arguments. */
  agyArgs?: string[];
  /** Working directory exposed to the Antigravity agent. */
  cwd?: string;
  /** Extra environment variables. They are merged over process.env. */
  env?: Record<string, string>;
  effort?: AntigravityEffort;
  agent?: string;
  /** Canonical permission preset. Takes precedence over legacy sandbox/bypass settings. */
  permissionMode?: AntigravityPermissionMode;
  /** Throw instead of omitting unsupported AI SDK features. Defaults to warn. */
  unsupportedFeatures?: 'warn' | 'error';
  /** End-to-end deadline, including time waiting for a provider concurrency slot. */
  timeoutMs?: number;
  /** Resume a specific Antigravity conversation. */
  conversationId?: string;
  /** Resume the most recent Antigravity conversation. */
  continue?: boolean;
  /** Enable Antigravity's sandbox mode. Enabled by default. */
  sandbox?: boolean;
  /** Explicit opt-in to automatic approval of every Antigravity tool. */
  dangerouslySkipPermissions?: boolean;
  /** Disable slash commands in prompts. Enabled by default. */
  disableSlashCommands?: boolean;
  /** CLI print timeout such as `2m` or `30s`. */
  printTimeout?: string;
  includeDirectories?: string[];
  /** Forward native NDJSON events as AI SDK raw stream parts. */
  rawEvents?: boolean;
  verbose?: boolean;
  logger?: Logger | false;
}

export interface AntigravityProviderSettings {
  defaultSettings?: AntigravitySettings;
  /** Shared across every model created by this provider. Defaults to 4. */
  maxConcurrentRequests?: number;
}

export interface AntigravityProviderOptions {
  effort?: AntigravityEffort;
  agent?: string;
  permissionMode?: AntigravityPermissionMode;
  unsupportedFeatures?: 'warn' | 'error';
  timeoutMs?: number;
  conversationId?: string;
  continue?: boolean;
  sandbox?: boolean;
  dangerouslySkipPermissions?: boolean;
  printTimeout?: string;
  includeDirectories?: string[];
  rawEvents?: boolean;
}
