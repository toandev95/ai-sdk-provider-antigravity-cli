import { fileURLToPath } from 'node:url';
import { generateText, Output, streamText, tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAntigravity } from '../src/index.js';

Object.assign(globalThis, { AI_SDK_LOG_WARNINGS: false });

const fixture = fileURLToPath(new URL('./fixtures/mock-agy.mjs', import.meta.url));
const antigravity = createAntigravity({
  defaultSettings: {
    agyArgs: [fixture],
    agyPath: process.execPath,
    cwd: process.cwd(),
    logger: false,
  },
});

describe('AI SDK integration', () => {
  it('works with generateText and dynamic provider tools', async () => {
    const result = await generateText({ model: antigravity(), prompt: 'RUN_NORMAL' });

    expect(result.text).toBe('hello world');
    expect(result.dynamicToolCalls).toHaveLength(1);
    expect(result.dynamicToolResults).toHaveLength(1);
    expect(result.providerMetadata?.['antigravity-cli']).toMatchObject({
      conversationId: 'mock-conversation',
    });
  });

  it('works with streamText full and text streams', async () => {
    const result = streamText({ model: antigravity(), prompt: 'RUN_NORMAL' });
    const eventTypes: string[] = [];
    let text = '';

    for await (const part of result.fullStream) {
      eventTypes.push(part.type);
      if (part.type === 'text-delta') text += part.text;
    }

    expect(text).toBe('hello world');
    expect(eventTypes).toEqual(expect.arrayContaining(['tool-call', 'tool-result', 'finish']));
    await expect(result.usage).resolves.toMatchObject({ inputTokens: 10, outputTokens: 5 });
  });

  it('uses the native structured output instead of wrapper text', async () => {
    const schema = z.object({
      profile: z.object({ name: z.literal('Agy'), tags: z.array(z.string()) }),
    });
    const result = await generateText({
      model: antigravity(),
      output: Output.object({ schema }),
      prompt: 'RETURN_STRUCTURED_PROFILE',
    });

    expect(result.output).toEqual({ profile: { name: 'Agy', tags: ['agent', 'cli'] } });
  });

  it('supports structured output through streamText', async () => {
    const result = streamText({
      model: antigravity(),
      output: Output.object({
        schema: z.object({
          profile: z.object({ name: z.literal('Agy'), tags: z.array(z.string()) }),
        }),
      }),
      prompt: 'RETURN_STRUCTURED_PROFILE',
    });

    await expect(result.output).resolves.toEqual({
      profile: { name: 'Agy', tags: ['agent', 'cli'] },
    });
  });

  it('warns when AI SDK callback tools cannot be forwarded', async () => {
    const result = await generateText({
      model: antigravity(),
      prompt: 'RUN_NORMAL',
      tools: {
        localLookup: tool({
          description: 'A host-owned callback tool',
          inputSchema: z.object({ query: z.string() }),
          execute: ({ query }) => query,
        }),
      },
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ feature: 'tools', type: 'unsupported' })]),
    );
  });

  it('passes large prompts through stdin instead of command arguments', async () => {
    const payload = `RUN_NORMAL\n${'x'.repeat(250_000)}`;
    const result = await generateText({ model: antigravity(), prompt: payload });

    expect(result.text).toBe('hello world');
  });
});
