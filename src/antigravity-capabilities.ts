/** Transport capabilities, independent of model availability and account permissions. */
export const antigravityCapabilities = Object.freeze({
  textGeneration: true,
  textStreaming: true,
  structuredOutput: 'final-only',
  nativeToolEvents: true,
  sdkCallbacksViaMcp: true,
  inlineSdkTools: false,
  toolChoice: false,
  imageInput: false,
  fileInput: false,
  reasoningText: false,
  embeddings: false,
  imageGeneration: false,
  samplingControls: false,
} as const);
