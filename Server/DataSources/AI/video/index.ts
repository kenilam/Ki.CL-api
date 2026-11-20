import type { ProviderAttempt } from 'server/DataSources/AI/failover.js';
import type { GeneratedVideo, LoopOptions } from './types.js';
import {
  generateLoopGemini,
  isGeminiVideoConfigured,
  resolveGeminiVideoModel,
} from './gemini.js';

export function buildLoopProviders(options: LoopOptions): ProviderAttempt<GeneratedVideo>[] {
  const model = resolveGeminiVideoModel();

  return [
    {
      name: `gemini:${model}`,
      isConfigured: isGeminiVideoConfigured,
      run: async () => ({
        buffer: await generateLoopGemini(options, model),
        generator: `gemini:${model}`,
      }),
    },
  ];
}

export type { GeneratedVideo, LoopOptions } from './types.js';
