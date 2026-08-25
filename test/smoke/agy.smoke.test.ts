import { generateText, Output, streamText } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { antigravity } from '../../src/index.js';

const model = () =>
  antigravity('default', {
    cwd: process.cwd(),
    logger: false,
    printTimeout: '2m',
  });

describe('real Antigravity CLI smoke', () => {
  it('handles a multi-message AI SDK transcript', async () => {
    const result = await generateText({
      model: model(),
      system: 'Follow the latest user request exactly.',
      messages: [
        { role: 'user', content: 'The old marker is WRONG.' },
        { role: 'assistant', content: 'Understood.' },
        { role: 'user', content: 'Reply with exactly AGY_COMPLEX_MESSAGES_SMOKE' },
      ],
    });

    expect(result.text.trim()).toBe('AGY_COMPLEX_MESSAGES_SMOKE');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('streams native tools and final text through fullStream', async () => {
    const result = streamText({
      model: model(),
      prompt: 'Use an Antigravity tool to inspect the current directory, then name one entry.',
    });
    const types: string[] = [];

    for await (const part of result.fullStream) types.push(part.type);

    expect(types).toContain('tool-call');
    expect(types).toContain('tool-result');
    expect(types).toContain('finish');
  });

  it('generates and validates a nested structured object', async () => {
    const schema = z.object({
      release: z.object({
        name: z.literal('antigravity-provider'),
        stable: z.boolean(),
        tags: z.array(z.string()).min(2),
      }),
    });
    const result = await generateText({
      model: model(),
      output: Output.object({ schema }),
      prompt: 'Return release name antigravity-provider, stable true, and tags ai-sdk plus cli.',
    });

    expect(result.output.release).toMatchObject({
      name: 'antigravity-provider',
      stable: true,
    });
    expect(result.output.release.tags).toEqual(expect.arrayContaining(['ai-sdk', 'cli']));
  });

  it('resumes an Antigravity-native conversation by id', async () => {
    const first = await generateText({
      model: model(),
      prompt: 'Remember passphrase NEBULA_742. Reply with exactly SAVED.',
    });
    const conversationId = first.providerMetadata?.['antigravity-cli']?.conversationId;
    expect(typeof conversationId).toBe('string');

    const second = await generateText({
      model: model(),
      prompt: 'Reply with only the passphrase I asked you to remember.',
      providerOptions: {
        'antigravity-cli': { conversationId },
      },
    });

    expect(second.text.trim()).toBe('NEBULA_742');
  });

  it('accepts a prompt larger than common command-line limits', async () => {
    const result = await generateText({
      model: model(),
      prompt: `${'context '.repeat(8_000)}\nReply with exactly AGY_LARGE_STDIN_SMOKE`,
    });

    expect(result.text.trim()).toBe('AGY_LARGE_STDIN_SMOKE');
  });
});
