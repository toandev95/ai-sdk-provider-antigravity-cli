import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createAntigravity, type AntigravityPermissionMode } from '../src/index.js';

const fixture = fileURLToPath(new URL('./fixtures/mock-agy.mjs', import.meta.url));
const makeProvider = (permissionMode?: AntigravityPermissionMode) =>
  createAntigravity({
    maxConcurrentRequests: 1,
    defaultSettings: {
      agyPath: process.execPath,
      agyArgs: [fixture],
      logger: false,
      permissionMode,
    },
  });
const prompt = (text: string) => [
  { role: 'user' as const, content: [{ type: 'text' as const, text }] },
];

describe('server configuration', () => {
  it.each([
    ['sandbox', ['--sandbox']],
    ['accept-edits', ['--sandbox', '--mode', 'accept-edits']],
    ['auto', ['--sandbox', '--mode', 'auto']],
    ['plan', ['--sandbox', '--mode', 'plan']],
    ['turbo', ['--dangerously-skip-permissions']],
    ['inherit', []],
  ] as const)('forwards the %s permission preset', async (mode, expected) => {
    const { stream } = await makeProvider()(undefined, { rawEvents: true }).doStream({
      prompt: prompt('INSPECT_ARGUMENTS'),
      providerOptions: { 'antigravity-cli': { permissionMode: mode } },
    });
    let argv: string[] = [];
    for await (const part of stream) {
      if (part.type !== 'raw') continue;
      const event = part.rawValue as { init?: { argv?: string[] } };
      if (event.init) argv = event.init.argv ?? [];
    }
    expect(argv).toEqual(expect.arrayContaining([...expected]));
    if (mode !== 'turbo') expect(argv).not.toContain('--dangerously-skip-permissions');
    if (mode === 'turbo' || mode === 'inherit') expect(argv).not.toContain('--sandbox');
  });

  it('allows a call to revoke inherited turbo mode', async () => {
    const model = makeProvider('turbo')('default', { rawEvents: true });
    const { stream } = await model.doStream({
      prompt: prompt('INSPECT_ARGUMENTS'),
      providerOptions: { 'antigravity-cli': { permissionMode: 'sandbox' } },
    });
    for await (const part of stream) {
      if (part.type !== 'raw') continue;
      const event = part.rawValue as { init?: { argv: string[] } };
      if (event.init) {
        expect(event.init.argv).toContain('--sandbox');
        expect(event.init.argv).not.toContain('--dangerously-skip-permissions');
      }
    }
  });

  it('rejects unsupported features before trying to launch a CLI', async () => {
    const model = createAntigravity({
      defaultSettings: {
        agyPath: '/this-binary-must-never-run',
        unsupportedFeatures: 'error',
        logger: false,
      },
    })();
    await expect(model.doGenerate({ prompt: prompt('hello'), temperature: 0.5 })).rejects.toThrow(
      'temperature',
    );
  });

  it('does not let raw wrapper arguments silently override a permission preset', async () => {
    const provider = createAntigravity({
      defaultSettings: {
        agyArgs: ['--dangerously-skip-permissions'],
        permissionMode: 'sandbox',
        logger: false,
      },
    });
    await expect(provider().doGenerate({ prompt: prompt('hello') })).rejects.toThrow(
      'permissionMode',
    );
  });

  it('enforces a deadline and frees the process slot', async () => {
    const provider = makeProvider();
    await expect(
      provider('default', { timeoutMs: 100 }).doGenerate({
        prompt: prompt('ABORT_FOREVER'),
      }),
    ).rejects.toThrow(/timeout/i);
    const result = await provider().doGenerate({ prompt: prompt('RUN_NORMAL') });
    expect(result.content.some((p) => p.type === 'text')).toBe(true);
  });

  it('cancels queued requests without starting them', async () => {
    const provider = makeProvider();
    const first = await provider().doStream({ prompt: prompt('ABORT_FOREVER') });
    const blocked = provider('default', { timeoutMs: 50 }).doGenerate({
      prompt: prompt('RUN_NORMAL'),
    });
    await expect(blocked).rejects.toThrow(/timeout/i);
    await first.stream.cancel();
    const next = await provider().doGenerate({ prompt: prompt('RUN_NORMAL') });
    expect(next.content.some((p) => p.type === 'text')).toBe(true);
  });

  it('shares its concurrency limit across different model instances', async () => {
    const provider = makeProvider();
    const first = await provider('model-a').doStream({ prompt: prompt('ABORT_FOREVER') });
    const controller = new AbortController();
    const second = provider('model-b').doGenerate({
      prompt: prompt('RUN_NORMAL'),
      abortSignal: controller.signal,
    });
    controller.abort(new Error('queue cancelled'));
    await expect(second).rejects.toThrow('queue cancelled');
    await first.stream.cancel();
  });

  it('discovers models dynamically without limiting callers to known Gemini IDs', async () => {
    expect(await makeProvider().listModels()).toEqual([
      { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)' },
      { id: 'future-model-v9', name: 'Future Model' },
    ]);
  });

  it.each([0, -1, 1.5])('rejects invalid concurrency %s', (limit) => {
    expect(() => createAntigravity({ maxConcurrentRequests: limit })).toThrow('positive integer');
  });
});
