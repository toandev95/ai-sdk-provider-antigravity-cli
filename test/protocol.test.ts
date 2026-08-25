import { describe, expect, it } from 'vitest';
import { mapUsage, parseEvent } from '../src/antigravity-protocol.js';

describe('Antigravity protocol', () => {
  it('parses known events while preserving extension fields', () => {
    const event = parseEvent(
      JSON.stringify({ event: 'future_event', extension: { enabled: true }, sequence: 7 }),
    );

    expect(event).toMatchObject({
      event: 'future_event',
      extension: { enabled: true },
      sequence: 7,
    });
  });

  it('rejects malformed and non-object lines', () => {
    expect(parseEvent('{broken')).toBeUndefined();
    expect(parseEvent('[]')).toBeUndefined();
  });

  it('maps cached, reasoning, and text token usage', () => {
    expect(
      mapUsage({
        cache_read_tokens: 30,
        input_tokens: 100,
        output_tokens: 40,
        thinking_tokens: 15,
        total_tokens: 140,
      }),
    ).toMatchObject({
      inputTokens: { cacheRead: 30, noCache: 70, total: 100 },
      outputTokens: { reasoning: 15, text: 25, total: 40 },
    });
  });
});
