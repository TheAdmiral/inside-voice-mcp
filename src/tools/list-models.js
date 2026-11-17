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
import { listModels, toolDescriptions } from '../strings.js';
import { jsonResult } from './tool-result.js';

/** A regular model's details, apart from its name, which the listing already gives as model. */
function regularModelDetails(regularModel) {
  return {
    description: regularModel.description,
    languages: regularModel.languages,
    speed_rating: regularModel.speed_rating,
    accuracy_rating: regularModel.accuracy_rating,
  };
}

function describeInstalledModel(model) {
  const regularModel = findRegularModel(model.name);

  if (regularModel) {
    return {
      model: model.name,
      available: true,
      type: 'regular',
      size: formatSize(model.size_bytes),
      ...regularModelDetails(regularModel),
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
    ...regularModelDetails(regularModel),
    download_note: listModels.downloadNote(regularModel.name),
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
      model_manager: listModels.modelManagerInstructions,
      models_directory: listModels.modelsDirectory(getModelsDir()),
    },
  });
}

export const listModelsTool = {
  name: 'list_models',
  description: toolDescriptions.listModels,
  argsSchema: z.object({}),
  handler,
};
