export type AntigravityModelId = 'default' | (string & {});

export type AntigravityEffort = 'low' | 'medium' | 'high';

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
}

export interface AntigravityProviderOptions {
  effort?: AntigravityEffort;
  agent?: string;
  conversationId?: string;
  continue?: boolean;
  sandbox?: boolean;
  dangerouslySkipPermissions?: boolean;
  printTimeout?: string;
  includeDirectories?: string[];
  rawEvents?: boolean;
}
