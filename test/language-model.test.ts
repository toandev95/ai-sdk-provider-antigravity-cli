import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createAntigravity } from '../src/index.js';

const fixture = fileURLToPath(new URL('./fixtures/mock-agy.mjs', import.meta.url));
const provider = createAntigravity({
  defaultSettings: {
    agyArgs: [fixture],
    agyPath: process.execPath,
    cwd: process.cwd(),
    logger: false,
  },
});

const prompt = (text: string) => [
  { role: 'user' as const, content: [{ type: 'text' as const, text }] },
];

describe('Antigravity language model', () => {
  it('preserves text and provider-executed tool ordering', async () => {
    const result = await provider().doGenerate({ prompt: prompt('RUN_NORMAL') });

    expect(result.content.map((part) => part.type)).toEqual([
      'text',
      'tool-call',
      'tool-result',
      'text',
    ]);
    expect(result.content.filter((part) => part.type === 'text').map((part) => part.text)).toEqual([
      'hello ',
      'world',
    ]);
    expect(result.providerMetadata?.['antigravity-cli']).toMatchObject({
      conversationId: 'mock-conversation',
      status: 'SUCCESS',
    });
    expect(result.usage).toMatchObject({
      inputTokens: { cacheRead: 3, noCache: 7, total: 10 },
      outputTokens: { reasoning: 2, text: 3, total: 5 },
    });
  });

  it('merges call options into CLI arguments without a shell', async () => {
    const model = provider('custom-model', { sandbox: false });
    const { stream } = await model.doStream({
      prompt: prompt('INSPECT_ARGUMENTS'),
      providerOptions: {
        'antigravity-cli': {
          agent: 'designer',
          conversationId: 'conversation-42',
          effort: 'high',
          includeDirectories: ['/shared/assets'],
          printTimeout: '9m',
          rawEvents: true,
        },
      },
    });
    let argv: string[] = [];

    for await (const part of stream) {
      if (part.type !== 'raw') continue;
      const event = part.rawValue as { event?: string; init?: { argv?: string[] } };
      if (event.event === 'init') argv = event.init?.argv ?? [];
    }

    expect(argv).toEqual(
      expect.arrayContaining([
        '--agent',
        'designer',
        '--conversation',
        'conversation-42',
        '--effort',
        'high',
        '--add-dir',
        '/shared/assets',
        '--model',
        'custom-model',
        '--print-timeout',
        '9m',
      ]),
    );
    expect(argv).not.toContain('--sandbox');
  });

  it('rejects mutually exclusive conversation settings', async () => {
    await expect(
      provider('default', { continue: true, conversationId: 'conversation-42' }).doGenerate({
        prompt: prompt('INVALID_SETTINGS'),
      }),
    ).rejects.toThrow('mutually exclusive');
  });

  it.each(['xhigh', 'max'] as const)('forwards the new %s reasoning effort', async (effort) => {
    const result = await provider('default', { rawEvents: true }).doStream({
      prompt: prompt('INSPECT_ARGUMENTS'),
      providerOptions: { 'antigravity-cli': { effort } },
    });
    let argv: string[] = [];
    for await (const part of result.stream) {
      if (part.type !== 'raw') continue;
      const event = part.rawValue as { event?: string; init?: { argv?: string[] } };
      if (event.event === 'init') argv = event.init?.argv ?? [];
    }
    expect(argv.slice(argv.indexOf('--effort'), argv.indexOf('--effort') + 2)).toEqual([
      '--effort',
      effort,
    ]);
  });

  it('converts terminal CLI failures into AI SDK errors', async () => {
    await expect(provider().doGenerate({ prompt: prompt('FAIL_REQUEST') })).rejects.toThrow(
      'mock failure',
    );
  });

  it('reassembles NDJSON split across stdout chunks', async () => {
    const result = await provider().doGenerate({ prompt: prompt('SPLIT_NDJSON') });
    const text = result.content.find((part) => part.type === 'text');

    expect(text?.text).toBe('split stream');
  });

  it('reports a missing CLI as an AI SDK call error', async () => {
    await expect(
      createAntigravity({
        defaultSettings: { agyPath: '/missing/agy-executable', logger: false },
      })().doGenerate({ prompt: prompt('RUN_NORMAL') }),
    ).rejects.toThrow('ENOENT');
  });

  it('terminates the child process when aborted', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('expected abort')), 50);

    await expect(
      provider().doGenerate({ abortSignal: controller.signal, prompt: prompt('ABORT_FOREVER') }),
    ).rejects.toThrow('expected abort');
  });
});
