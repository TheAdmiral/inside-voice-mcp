import { z } from 'zod';
import {
  DEFAULT_MODEL,
  RECOMMENDED_ACCURATE_MODEL,
  REGULAR_MODELS,
  describeModel,
  findRegularModel,
  formatSize,
  getInstalledModels,
  getModelsDir,
} from '../models.js';
import { jsonResult } from './tool-result.js';

function describeInstalledModel(model) {
  const regularModel = findRegularModel(model.name);

  if (regularModel) {
    return {
      model: model.name,
      available: true,
      type: 'regular',
      size: formatSize(model.size_bytes),
      ...regularModel,
    };
  }

  return {
    model: model.name,
    available: true,
    type: 'advanced',
    size: formatSize(model.size_bytes),
    description: describeModel(model.name),
  };
}

// Only installed models are listed with a size, because the server never goes online.
function describeMissingModel(regularModel) {
  return {
    model: regularModel.name,
    available: false,
    type: 'regular',
    ...regularModel,
    download_note: `Install with the model manager: inside-voice-mcp models install ${regularModel.name}`,
  };
}

async function handler() {
  const installedModels = getInstalledModels();
  const installedNames = installedModels.map((model) => model.name);

  const missingRegularModels = REGULAR_MODELS.filter(
    (regularModel) => !installedNames.includes(regularModel.name),
  );

  return jsonResult({
    available_models: installedModels.map(describeInstalledModel),
    not_downloaded: missingRegularModels.map(describeMissingModel),
    recommended_for_apple_silicon: DEFAULT_MODEL,
    recommended_for_accuracy: RECOMMENDED_ACCURATE_MODEL,
    performance_notes: {
      fastest: 'tiny.en',
      balanced: DEFAULT_MODEL,
      most_accurate: 'large-v3',
      fast_and_accurate: RECOMMENDED_ACCURATE_MODEL,
    },
    download_instructions: {
      model_manager:
        'Run inside-voice-mcp models available to see every model with its size, including ' +
        'advanced models, then inside-voice-mcp models install <model>',
      models_directory: `Models are stored in: ${getModelsDir()}`,
    },
  });
}

export const listModelsTool = {
  name: 'list_models',
  description:
    'List installed whisper models, and the regular models that are not installed, with ' +
    'sizes and performance recommendations',
  argsSchema: z.object({}),
  handler,
};
