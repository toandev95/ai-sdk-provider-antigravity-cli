import type { JSONObject, LanguageModelV4Usage } from '@ai-sdk/provider';

export interface AntigravityUsage {
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
}

export interface AntigravityStepUpdate {
  conversation_id?: string;
  step_index?: number;
  state?: string;
  step_type?: string;
  text_delta?: string;
  tool_name?: string;
  duration_seconds?: number;
  usage?: AntigravityUsage;
  tool_info?: {
    name?: string;
    parameters?: unknown;
    output?: unknown;
    error?: unknown;
  };
}

export interface AntigravityResult {
  conversation_id?: string;
  status?: string;
  response?: string;
  error?: string;
  duration_seconds?: number;
  num_turns?: number;
  structured_output?: unknown;
  json_schema?: unknown;
  usage?: AntigravityUsage;
}

export interface AntigravityEvent {
  event?: string;
  conversation_id?: string;
  init?: JSONObject;
  step_update?: AntigravityStepUpdate;
  result?: AntigravityResult;
}

export function parseEvent(line: string): AntigravityEvent | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as AntigravityEvent)
      : undefined;
  } catch {
    return undefined;
  }
}

export function mapUsage(usage?: AntigravityUsage): LanguageModelV4Usage {
  const input = usage?.input_tokens;
  const cacheRead = usage?.cache_read_tokens;
  return {
    inputTokens: {
      total: input,
      noCache: input === undefined ? undefined : Math.max(0, input - (cacheRead ?? 0)),
      cacheRead,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage?.output_tokens,
      text:
        usage?.output_tokens === undefined
          ? undefined
          : Math.max(0, usage.output_tokens - (usage.thinking_tokens ?? 0)),
      reasoning: usage?.thinking_tokens,
    },
    raw: usage as JSONObject | undefined,
  };
}
