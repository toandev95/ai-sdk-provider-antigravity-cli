import type {
  LanguageModelV4Message,
  LanguageModelV4ToolResultOutput,
  SharedV4Warning,
} from '@ai-sdk/provider';

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatToolOutput(output: LanguageModelV4ToolResultOutput): string {
  if (output.type === 'text') return output.value;
  if (output.type === 'json' || output.type === 'error-json') return stringify(output.value);
  if (output.type === 'error-text') return output.value;
  return `[${output.type}]`;
}

export function mapPrompt(prompt: readonly LanguageModelV4Message[]): {
  text: string;
  warnings: SharedV4Warning[];
} {
  const transcript: string[] = [];
  const warnings: SharedV4Warning[] = [];

  for (const message of prompt) {
    const parts: string[] = [];
    if (typeof message.content === 'string') {
      if (message.content) transcript.push(`${message.role.toUpperCase()}:\n${message.content}`);
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'text') {
        parts.push(part.text);
      } else if (part.type === 'reasoning') {
        parts.push(`[reasoning]\n${part.text}`);
      } else if (part.type === 'tool-call') {
        parts.push(`[tool call: ${part.toolName}]\n${stringify(part.input)}`);
      } else if (part.type === 'tool-result') {
        parts.push(`[tool result: ${part.toolName}]\n${formatToolOutput(part.output)}`);
      } else if (part.type === 'tool-approval-response') {
        parts.push(
          `[tool approval: ${part.approvalId}] ${part.approved ? 'approved' : 'denied'}${part.reason ? `: ${part.reason}` : ''}`,
        );
      } else {
        warnings.push({
          type: 'unsupported',
          feature: `prompt.${message.role}.${part.type}`,
          details:
            'Antigravity CLI stream input currently accepts text content only; this part was omitted.',
        });
      }
    }

    if (parts.length > 0) {
      transcript.push(`${message.role.toUpperCase()}:\n${parts.join('\n\n')}`);
    }
  }

  return { text: transcript.join('\n\n'), warnings };
}
