import type { LanguageModelV4Message } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { mapPrompt } from '../src/antigravity-prompt.js';

describe('prompt mapping', () => {
  it('keeps roles, reasoning, tool calls, and tool results in the transcript', () => {
    const prompt: LanguageModelV4Message[] = [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: [{ type: 'text', text: 'Inspect this.' }] },
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'I should inspect it.' },
          {
            type: 'tool-call',
            input: '{"path":"README.md"}',
            toolCallId: 'call-1',
            toolName: 'read',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            output: { type: 'json', value: { title: 'Provider' } },
            toolCallId: 'call-1',
            toolName: 'read',
            type: 'tool-result',
          },
        ],
      },
    ];

    const mapped = mapPrompt(prompt);

    expect(mapped.text).toContain('SYSTEM:\nBe concise.');
    expect(mapped.text).toContain('[tool call: read]');
    expect(mapped.text).toContain('[tool result: read]');
    expect(mapped.warnings).toEqual([]);
  });

  it('warns and omits non-text file input', () => {
    const prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the attachment.' },
          { type: 'file', data: 'ZGF0YQ==', mediaType: 'image/png' },
        ],
      },
    ] as LanguageModelV4Message[];

    const mapped = mapPrompt(prompt);

    expect(mapped.text).not.toContain('ZGF0YQ==');
    expect(mapped.warnings).toHaveLength(1);
    expect(mapped.warnings[0]).toMatchObject({ type: 'unsupported' });
  });
});
