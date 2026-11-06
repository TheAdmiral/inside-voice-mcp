import { z } from 'zod';
import { getAvailableModels, getModelsDir } from '../whisper/integration.js';
import { jsonResult } from './tool-result.js';

// Ratings go from 1 to 5. For speed 5 is fastest, for accuracy 5 is most accurate.
const MODEL_INFO = {
  'tiny.en': {
    name: 'tiny.en',
    size: '39 MB',
    description: 'Smallest English-only model, fastest processing',
    languages: ['en'],
    speed_rating: 5,
    accuracy_rating: 2,
    recommended_for: ['quick transcription', 'real-time processing', 'low-resource environments'],
  },
  'base.en': {
    name: 'base.en',
    size: '142 MB',
    description: 'Balanced English-only model, good speed/accuracy trade-off',
    languages: ['en'],
    speed_rating: 4,
    accuracy_rating: 3,
    recommended_for: ['general transcription', 'M1 MacBook Pro', 'balanced performance'],
  },
  'small.en': {
    name: 'small.en',
    size: '488 MB',
    description: 'Higher accuracy English-only model',
    languages: ['en'],
    speed_rating: 3,
    accuracy_rating: 4,
    recommended_for: ['high accuracy needs', 'clear audio', 'professional transcription'],
  },
  base: {
    name: 'base',
    size: '142 MB',
    description: 'Multilingual base model',
    languages: ['99 languages'],
    speed_rating: 4,
    accuracy_rating: 3,
    recommended_for: ['multilingual content', 'language detection', 'general purpose'],
  },
  small: {
    name: 'small',
    size: '488 MB',
    description: 'Higher accuracy multilingual model',
    languages: ['99 languages'],
    speed_rating: 3,
    accuracy_rating: 4,
    recommended_for: ['multilingual high accuracy', 'professional use', 'diverse content'],
  },
};

async function handler() {
  const availableModels = getAvailableModels();

  const downloaded = availableModels.map((model) => ({
    model,
    available: true,
    ...MODEL_INFO[model],
  }));

  const notDownloaded = Object.keys(MODEL_INFO)
    .filter((model) => !availableModels.includes(model))
    .map((model) => ({
      model,
      available: false,
      ...MODEL_INFO[model],
      download_note: 'Model not downloaded - use setup:models script or download manually',
    }));

  return jsonResult({
    available_models: downloaded,
    not_downloaded: notDownloaded,
    recommended_for_m1: 'base.en',
    performance_notes: {
      fastest: 'tiny.en',
      balanced: 'base.en',
      most_accurate: 'small.en',
      multilingual_balanced: 'base',
      multilingual_accurate: 'small',
    },
    download_instructions: {
      base_en:
        'curl -L -O https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
      models_directory: `Place models in: ${getModelsDir()}`,
    },
  });
}

export const listModelsTool = {
  name: 'list_models',
  description: 'List available whisper models with performance recommendations',
  argsSchema: z.object({}),
  handler,
};
