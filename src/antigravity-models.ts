import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeCliError } from './antigravity-errors.js';
import type { AntigravitySettings } from './types-antigravity.js';

export interface AntigravityModelInfo {
  id: string;
  name: string;
}

export async function discoverModels(
  settings: AntigravitySettings = {},
  signal?: AbortSignal,
): Promise<AntigravityModelInfo[]> {
  try {
    const { stdout } = await promisify(execFile)(
      settings.agyPath ?? 'agy',
      [...(settings.agyArgs ?? []), 'models'],
      {
        cwd: settings.cwd,
        env: { ...process.env, ...settings.env },
        signal,
        timeout: settings.timeoutMs ?? 30_000,
        maxBuffer: 1_048_576,
        windowsHide: true,
      },
    );
    const models = new Map<string, AntigravityModelInfo>();
    for (const line of stdout.split(/\r?\n/)) {
      const match = /^([a-zA-Z0-9][\w.:/-]*)\t(.+)$/.exec(line.trim());
      if (match?.[1] && match[2]) models.set(match[1], { id: match[1], name: match[2].trim() });
    }
    if (models.size === 0) throw new Error('agy models returned no recognizable model entries.');
    return [...models.values()];
  } catch (error) {
    throw normalizeCliError(error);
  }
}
