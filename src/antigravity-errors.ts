import { APICallError, LoadAPIKeyError } from '@ai-sdk/provider';

export function createCliError(message: string, details?: { exitCode?: number; stderr?: string }) {
  return new APICallError({
    message,
    isRetryable: false,
    requestBodyValues: undefined,
    url: 'antigravity-cli://headless',
    data: details,
  });
}

export function normalizeCliError(error: unknown, stderr = ''): Error {
  if (error instanceof APICallError || error instanceof LoadAPIKeyError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (
    /authentication required|not authenticated|log(?:ged)? in|sign in/i.test(
      `${message}\n${stderr}`,
    )
  ) {
    return new LoadAPIKeyError({
      message: 'Antigravity CLI is not authenticated. Run `agy` interactively and sign in once.',
    });
  }
  return createCliError(message, { stderr: stderr || undefined });
}
