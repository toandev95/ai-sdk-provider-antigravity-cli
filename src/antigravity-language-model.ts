import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ReadableStream } from 'node:stream/web';
import type {
  JSONValue,
  LanguageModelV4,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Text,
  LanguageModelV4Usage,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { NoSuchModelError } from '@ai-sdk/provider';
import { parseProviderOptions } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { normalizeCliError, createCliError } from './antigravity-errors.js';
import { mapPrompt } from './antigravity-prompt.js';
import {
  mapUsage,
  parseEvent,
  type AntigravityEvent,
  type AntigravityResult,
  type AntigravityStepUpdate,
} from './antigravity-protocol.js';
import { resolveLogger } from './logger-antigravity.js';
import type {
  AntigravityModelId,
  AntigravityProviderOptions,
  AntigravitySettings,
  Logger,
} from './types-antigravity.js';

const providerOptionsSchema: z.ZodType<AntigravityProviderOptions> = z
  .object({
    agent: z.string().min(1).optional(),
    continue: z.boolean().optional(),
    conversationId: z.string().min(1).optional(),
    dangerouslySkipPermissions: z.boolean().optional(),
    effort: z.enum(['low', 'medium', 'high']).optional(),
    includeDirectories: z.array(z.string().min(1)).optional(),
    printTimeout: z.string().min(1).optional(),
    rawEvents: z.boolean().optional(),
    sandbox: z.boolean().optional(),
  })
  .strict();

const emptyUsage = (): LanguageModelV4Usage => ({
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: undefined,
    total: undefined,
  },
  outputTokens: { reasoning: undefined, text: undefined, total: undefined },
});

function toJsonValue(value: unknown): NonNullable<JSONValue> {
  if (value === undefined || value === null) return {};
  try {
    const parsed = JSON.parse(JSON.stringify(value)) as JSONValue;
    return parsed === null ? {} : parsed;
  } catch {
    return String(value);
  }
}

function unsupportedWarnings(
  options: Parameters<LanguageModelV4['doStream']>[0],
): SharedV4Warning[] {
  const warnings: SharedV4Warning[] = [];
  const unsupported: Array<[string, unknown]> = [
    ['temperature', options.temperature],
    ['topP', options.topP],
    ['topK', options.topK],
    ['maxOutputTokens', options.maxOutputTokens],
    ['presencePenalty', options.presencePenalty],
    ['frequencyPenalty', options.frequencyPenalty],
    ['stopSequences', options.stopSequences],
    ['seed', options.seed],
    ['tools', options.tools?.length ? options.tools : undefined],
    ['toolChoice', options.tools?.length ? options.toolChoice : undefined],
  ];
  for (const [feature, value] of unsupported) {
    if (value !== undefined) {
      warnings.push({
        type: 'unsupported',
        feature,
        details: `${feature} is not accepted by the Antigravity headless protocol and was ignored.`,
      });
    }
  }
  return warnings;
}

interface ToolState {
  id: string;
  name: string;
  callEmitted: boolean;
}

export class AntigravityLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'antigravity-cli';
  readonly supportedUrls = {};
  readonly modelId: string;

  private readonly settings: AntigravitySettings;
  private readonly logger: Logger;

  constructor(modelId: AntigravityModelId, settings: AntigravitySettings = {}) {
    if (!modelId.trim()) {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    }
    this.modelId = modelId;
    this.settings = settings;
    this.logger = resolveLogger(settings.logger, settings.verbose ?? false);
  }

  private mergeSettings(options?: AntigravityProviderOptions): AntigravitySettings {
    const settings = {
      ...this.settings,
      ...options,
      includeDirectories: options?.includeDirectories ?? this.settings.includeDirectories,
    };
    if (settings.continue && settings.conversationId) {
      throw new Error('`continue` and `conversationId` are mutually exclusive.');
    }
    if (settings.dangerouslySkipPermissions && settings.sandbox) {
      this.logger.warn(
        '`dangerouslySkipPermissions` takes precedence over `sandbox`; sandbox mode was not passed.',
      );
    }
    return settings;
  }

  private buildCommand(
    settings: AntigravitySettings,
    responseFormat: Parameters<LanguageModelV4['doStream']>[0]['responseFormat'],
  ): { command: string; args: string[] } {
    const args = [
      ...(settings.agyArgs ?? []),
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
    ];
    if (settings.disableSlashCommands !== false) args.push('--disable-slash-commands');
    if (this.modelId !== 'default') args.push('--model', this.modelId);
    if (settings.effort) args.push('--effort', settings.effort);
    if (settings.agent) args.push('--agent', settings.agent);
    if (settings.continue) args.push('--continue');
    if (settings.conversationId) args.push('--conversation', settings.conversationId);
    if (settings.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    } else if (settings.sandbox !== false) {
      args.push('--sandbox');
    }
    if (settings.printTimeout) args.push('--print-timeout', settings.printTimeout);
    for (const directory of settings.includeDirectories ?? []) {
      args.push('--include-directories', directory);
    }
    if (responseFormat?.type === 'json' && responseFormat.schema !== undefined) {
      args.push('--json-schema', JSON.stringify(responseFormat.schema));
    }
    return { command: settings.agyPath ?? 'agy', args };
  }

  async doGenerate(
    options: Parameters<LanguageModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV4['doGenerate']>>> {
    const { stream, request } = await this.doStream(options);
    const content: LanguageModelV4Content[] = [];
    const text = new Map<string, LanguageModelV4Text>();
    let usage = emptyUsage();
    let finishReason: LanguageModelV4FinishReason = { raw: undefined, unified: 'other' };
    let warnings: SharedV4Warning[] = [];
    let providerMetadata: SharedV4ProviderMetadata | undefined;
    let responseId: string | undefined;
    let timestamp: Date | undefined;

    for await (const part of stream) {
      if (part.type === 'stream-start') warnings = part.warnings;
      else if (part.type === 'response-metadata') {
        responseId = part.id;
        timestamp = part.timestamp;
      } else if (part.type === 'text-start') {
        const value: LanguageModelV4Text = { type: 'text', text: '' };
        text.set(part.id, value);
        content.push(value);
      } else if (part.type === 'text-delta') {
        let value = text.get(part.id);
        if (!value) {
          value = { type: 'text', text: '' };
          text.set(part.id, value);
          content.push(value);
        }
        value.text += part.delta;
      } else if (part.type === 'tool-call' || part.type === 'tool-result') {
        content.push(part);
      } else if (part.type === 'finish') {
        usage = part.usage;
        finishReason = part.finishReason;
        providerMetadata = part.providerMetadata;
      }
    }

    return {
      content: content.filter((part) => part.type !== 'text' || part.text.length > 0),
      finishReason,
      providerMetadata,
      request,
      response: { id: responseId, modelId: this.modelId, timestamp },
      usage,
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV4['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV4['doStream']>>> {
    const mapped = mapPrompt(options.prompt);
    const providerOptions = await parseProviderOptions<AntigravityProviderOptions>({
      provider: this.provider,
      providerOptions: options.providerOptions,
      schema: providerOptionsSchema,
    });
    let settings = this.mergeSettings(providerOptions);
    const warnings = [...unsupportedWarnings(options), ...mapped.warnings];

    if (
      options.reasoning !== undefined &&
      options.reasoning !== 'provider-default' &&
      providerOptions?.effort === undefined
    ) {
      if (
        options.reasoning === 'low' ||
        options.reasoning === 'medium' ||
        options.reasoning === 'high'
      ) {
        settings = { ...settings, effort: options.reasoning };
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'reasoning',
          details: `Antigravity supports low, medium, or high effort; '${options.reasoning}' was ignored.`,
        });
      }
    }

    const { command, args } = this.buildCommand(settings, options.responseFormat);
    const structuredResponse = options.responseFormat?.type === 'json';
    this.logger.debug(`Starting ${command} with ${args.length} arguments.`);
    let child: ChildProcessWithoutNullStreams | undefined;

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: (controller) => {
        child = spawn(command, args, {
          cwd: settings.cwd,
          env: { ...process.env, ...settings.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        controller.enqueue({ type: 'stream-start', warnings });

        let buffer = '';
        let stderr = '';
        let settled = false;
        let textId: string | undefined;
        let textStepIndex: number | undefined;
        let emittedText = '';
        let result: AntigravityResult | undefined;
        let failure: string | undefined;
        let abortReason: unknown;
        const tools = new Map<number, ToolState>();

        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          controller.error(normalizeCliError(error, stderr));
        };

        const endText = () => {
          if (!textId) return;
          controller.enqueue({ type: 'text-end', id: textId });
          textId = undefined;
          textStepIndex = undefined;
        };

        const emitText = (delta: string, stepIndex?: number) => {
          if (!delta) return;
          if (textId && stepIndex !== undefined && textStepIndex !== stepIndex) endText();
          if (!textId) {
            textId = randomUUID();
            textStepIndex = stepIndex;
            controller.enqueue({ type: 'text-start', id: textId });
          }
          emittedText += delta;
          controller.enqueue({ type: 'text-delta', id: textId, delta });
        };

        const emitTool = (step: AntigravityStepUpdate) => {
          endText();
          const index = step.step_index;
          if (index === undefined) return;
          const name = step.tool_name ?? step.tool_info?.name ?? 'antigravity_tool';
          let state = tools.get(index);
          if (!state) {
            state = { callEmitted: false, id: `agy-tool-${index}-${randomUUID()}`, name };
            tools.set(index, state);
          }
          if (!state.callEmitted) {
            const input = JSON.stringify(step.tool_info?.parameters ?? {});
            controller.enqueue({
              type: 'tool-input-start',
              dynamic: true,
              id: state.id,
              providerExecuted: true,
              toolName: state.name,
            });
            if (input) controller.enqueue({ type: 'tool-input-delta', delta: input, id: state.id });
            controller.enqueue({ type: 'tool-input-end', id: state.id });
            controller.enqueue({
              type: 'tool-call',
              dynamic: true,
              input,
              providerExecuted: true,
              toolCallId: state.id,
              toolName: state.name,
            });
            state.callEmitted = true;
          }
          if (step.state === 'DONE' || step.state === 'ERROR') {
            const isError = step.state === 'ERROR' || step.tool_info?.error !== undefined;
            const value = isError ? step.tool_info?.error : step.tool_info?.output;
            controller.enqueue({
              type: 'tool-result',
              dynamic: true,
              isError: isError || undefined,
              result: toJsonValue(value),
              toolCallId: state.id,
              toolName: state.name,
            });
            tools.delete(index);
          }
        };

        const processEvent = (event: AntigravityEvent) => {
          if (settings.rawEvents) controller.enqueue({ type: 'raw', rawValue: event });
          if (event.event === 'init') {
            controller.enqueue({
              type: 'response-metadata',
              id: event.conversation_id ?? randomUUID(),
              modelId: this.modelId,
              timestamp: new Date(),
            });
            return;
          }
          if (event.event === 'step_update' && event.step_update) {
            const step = event.step_update;
            if (!structuredResponse && step.step_type === 'agent_response' && step.text_delta) {
              emitText(step.text_delta, step.step_index);
            }
            if (step.step_type === 'tool') emitTool(step);
            return;
          }
          if (event.event === 'result' && event.result) {
            result = event.result;
            if (result.status !== 'SUCCESS')
              failure = result.error ?? `Antigravity status: ${result.status}`;
          }
        };

        const processLine = (line: string) => {
          if (!line.trim()) return;
          const event = parseEvent(line);
          if (event) processEvent(event);
          else this.logger.warn('Ignored a malformed line from Antigravity stdout.');
        };

        const abort = () => {
          abortReason = options.abortSignal?.reason ?? new Error('Request aborted');
          child?.kill('SIGTERM');
        };
        if (options.abortSignal?.aborted) {
          abort();
          fail(options.abortSignal.reason ?? new Error('Request aborted'));
          return;
        }
        options.abortSignal?.addEventListener('abort', abort, { once: true });

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          const lines = (buffer + chunk).split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) processLine(line);
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
          stderr = `${stderr}${chunk}`.slice(-65_536);
        });
        child.stdin.on('error', (error) => {
          this.logger.debug(`Antigravity stdin closed early: ${error.message}`);
        });
        child.on('error', fail);
        child.on('close', (code) => {
          options.abortSignal?.removeEventListener('abort', abort);
          if (buffer) processLine(buffer);
          if (settled) return;
          if (abortReason !== undefined) {
            fail(abortReason);
            return;
          }
          if (code !== 0) {
            fail(
              createCliError(`Antigravity CLI exited with code ${code}.`, {
                exitCode: code ?? undefined,
                stderr,
              }),
            );
            return;
          }
          if (failure) {
            fail(createCliError(failure, { exitCode: code ?? undefined, stderr }));
            return;
          }
          if (!result) {
            fail(createCliError('Antigravity CLI exited without a result event.', { stderr }));
            return;
          }
          if (structuredResponse && result.structured_output !== undefined) {
            emitText(JSON.stringify(result.structured_output));
          } else if (!emittedText && result.response) {
            emitText(result.response);
          }
          endText();

          const details: Record<string, NonNullable<JSONValue>> = {};
          if (result.conversation_id !== undefined) {
            details.conversationId = result.conversation_id;
          }
          if (result.duration_seconds !== undefined) {
            details.durationSeconds = result.duration_seconds;
          }
          if (result.num_turns !== undefined) details.numTurns = result.num_turns;
          if (result.status !== undefined) details.status = result.status;
          if (result.structured_output !== undefined) {
            details.structuredOutput = toJsonValue(result.structured_output);
          }
          const metadata: SharedV4ProviderMetadata = { 'antigravity-cli': details };
          controller.enqueue({
            type: 'finish',
            finishReason: { raw: result.status, unified: 'stop' },
            providerMetadata: metadata,
            usage: mapUsage(result.usage),
          });
          settled = true;
          controller.close();
        });

        child.stdin.end(
          `${JSON.stringify({ event: 'user', message: { content: mapped.text } })}\n`,
        );
      },
      cancel: () => {
        child?.kill('SIGTERM');
      },
    });

    return {
      request: {
        body: { characterCount: mapped.text.length, messageCount: options.prompt.length },
      },
      stream,
    };
  }
}
