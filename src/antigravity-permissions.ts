import type { AntigravitySettings } from './types-antigravity.js';

/** Uses only public CLI flags; never changes the user's saved permission rules. */
export function permissionArgs(settings: AntigravitySettings): string[] {
  switch (settings.permissionMode) {
    case 'turbo':
      return ['--dangerously-skip-permissions'];
    case 'inherit':
      return [];
    case 'sandbox':
      return ['--sandbox'];
    case 'accept-edits':
    case 'auto':
    case 'plan':
      return ['--sandbox', '--mode', settings.permissionMode];
    case undefined:
      if (settings.dangerouslySkipPermissions) return ['--dangerously-skip-permissions'];
      return settings.sandbox === false ? [] : ['--sandbox'];
    default:
      throw new Error(`Unknown Antigravity permission mode: ${String(settings.permissionMode)}`);
  }
}
