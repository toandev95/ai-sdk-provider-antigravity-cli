import type { LanguageModelV4, ProviderV4 } from '@ai-sdk/provider';
import { NoSuchModelError } from '@ai-sdk/provider';
import { AntigravityLanguageModel } from './antigravity-language-model.js';
import type {
  AntigravityModelId,
  AntigravityProviderSettings,
  AntigravitySettings,
} from './types-antigravity.js';

export interface AntigravityProvider extends ProviderV4 {
  (modelId?: AntigravityModelId, settings?: AntigravitySettings): LanguageModelV4;
  chat(modelId?: AntigravityModelId, settings?: AntigravitySettings): LanguageModelV4;
  languageModel(modelId?: AntigravityModelId, settings?: AntigravitySettings): LanguageModelV4;
  embeddingModel(modelId: string): never;
  imageModel(modelId: string): never;
}

export function createAntigravity(options: AntigravityProviderSettings = {}): AntigravityProvider {
  const createModel = (
    modelId: AntigravityModelId = 'default',
    settings: AntigravitySettings = {},
  ) =>
    new AntigravityLanguageModel(modelId, {
      ...options.defaultSettings,
      ...settings,
    });

  const provider = Object.assign(
    (modelId?: AntigravityModelId, settings?: AntigravitySettings) =>
      createModel(modelId, settings),
    { specificationVersion: 'v4' as const },
  ) as unknown as AntigravityProvider;

  provider.chat = createModel;
  provider.languageModel = createModel;
  provider.embeddingModel = ((modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  }) as never;
  provider.imageModel = ((modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  }) as never;
  return provider;
}

export const antigravity = createAntigravity();
