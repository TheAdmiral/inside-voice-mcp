import { createWriteStream, existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Every model comes from this Hugging Face repository.
const REPOSITORY = 'ggerganov/whisper.cpp';
const DOWNLOAD_BASE_URL = `https://huggingface.co/${REPOSITORY}/resolve/main`;
const FILE_LIST_URL = `https://huggingface.co/api/models/${REPOSITORY}/tree/main`;

export const DEFAULT_MODEL = 'base.en';

/**
 * The regular models, which are the standard whisper models, from smallest to largest.
 * Anything else in the repository, such as a quantised version of one of these, is an
 * advanced model.
 * Ratings go from 1 to 5. For speed 5 is fastest, for accuracy 5 is most accurate.
 */
export const REGULAR_MODELS = [
  {
    name: 'tiny.en',
    description: 'Smallest English-only model, fastest processing',
    languages: ['en'],
    speed_rating: 5,
    accuracy_rating: 2,
  },
  {
    name: 'tiny',
    description: 'Smallest multilingual model, fastest processing',
    languages: ['99 languages'],
    speed_rating: 5,
    accuracy_rating: 2,
  },
  {
    name: 'base.en',
    description: 'Balanced English-only model, good speed/accuracy trade-off',
    languages: ['en'],
    speed_rating: 4,
    accuracy_rating: 3,
  },
  {
    name: 'base',
    description: 'Balanced multilingual model, good speed/accuracy trade-off',
    languages: ['99 languages'],
    speed_rating: 4,
    accuracy_rating: 3,
  },
  {
    name: 'small.en',
    description: 'Higher accuracy English-only model',
    languages: ['en'],
    speed_rating: 3,
    accuracy_rating: 4,
  },
  {
    name: 'small',
    description: 'Higher accuracy multilingual model',
    languages: ['99 languages'],
    speed_rating: 3,
    accuracy_rating: 4,
  },
  {
    name: 'medium.en',
    description: 'High accuracy English-only model, slower and larger',
    languages: ['en'],
    speed_rating: 2,
    accuracy_rating: 4,
  },
  {
    name: 'medium',
    description: 'High accuracy multilingual model, slower and larger',
    languages: ['99 languages'],
    speed_rating: 2,
    accuracy_rating: 4,
  },
  {
    name: 'large-v1',
    description: 'First large multilingual model, replaced by large-v2 and large-v3',
    languages: ['99 languages'],
    speed_rating: 1,
    accuracy_rating: 4,
  },
  {
    name: 'large-v2',
    description: 'Large multilingual model, very accurate but slow',
    languages: ['99 languages'],
    speed_rating: 1,
    accuracy_rating: 5,
  },
  {
    name: 'large-v3',
    description: 'Latest large multilingual model, the most accurate and the slowest',
    languages: ['99 languages'],
    speed_rating: 1,
    accuracy_rating: 5,
  },
  {
    name: 'large-v3-turbo',
    description: 'Much faster version of large-v3, nearly as accurate but weaker at translation',
    languages: ['99 languages'],
    speed_rating: 2,
    accuracy_rating: 5,
  },
];

export const REGULAR_MODEL_NAMES = REGULAR_MODELS.map((model) => model.name);

/**
 * Model names become file names, so they must not contain anything that could lead outside
 * the models directory, such as a slash.
 */
export const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Quantised models are named after the model they were made from, such as base.en-q5_1.
const QUANTISED_NAME_PATTERN = /^(.+)-(q\d_\d)$/;

/**
 * @typedef {{ name: string, size_bytes: number }} ModelFile
 */

export function isRegularModel(name) {
  return REGULAR_MODEL_NAMES.includes(name);
}

/** Returns the regular model's details, or undefined for an advanced model. */
export function findRegularModel(name) {
  return REGULAR_MODELS.find((model) => model.name === name);
}

/** Returns a one-line description of any model, regular or advanced. */
export function describeModel(name) {
  const regularModel = findRegularModel(name);
  if (regularModel) {
    return regularModel.description;
  }

  const quantised = name.match(QUANTISED_NAME_PATTERN);
  if (quantised) {
    const [, baseModel, quantisation] = quantised;
    return `${baseModel} quantised to ${quantisation}: smaller and faster, slightly less accurate`;
  }

  return 'Advanced model';
}

/** Returns the directory whisper models are stored in. */
export function getModelsDir() {
  return process.env.WHISPER_MODELS_PATH || join(homedir(), '.inside-voice-mcp', 'models');
}

function modelFileName(name) {
  return `ggml-${name}.bin`;
}

/** Returns the model's name, or null if the file is not a whisper model. */
function modelNameFromFileName(fileName) {
  if (!fileName.startsWith('ggml-') || !fileName.endsWith('.bin')) {
    return null;
  }

  const name = fileName.slice('ggml-'.length, -'.bin'.length);
  if (!MODEL_NAME_PATTERN.test(name)) {
    return null;
  }

  return name;
}

export function getModelPath(name) {
  if (!MODEL_NAME_PATTERN.test(name)) {
    throw new Error(`'${name}' is not a valid model name`);
  }

  return join(getModelsDir(), modelFileName(name));
}

/** Where a model sorts: regular models by size, then advanced models after the one they came from. */
function sortPosition(name) {
  const regularIndex = REGULAR_MODEL_NAMES.indexOf(name);
  if (regularIndex !== -1) {
    return regularIndex;
  }

  const quantised = name.match(QUANTISED_NAME_PATTERN);
  const baseIndex = quantised ? REGULAR_MODEL_NAMES.indexOf(quantised[1]) : -1;
  const afterRegularModels = REGULAR_MODEL_NAMES.length;
  if (baseIndex !== -1) {
    return afterRegularModels + baseIndex;
  }

  return afterRegularModels * 2;
}

/**
 * Returns the models with the regular ones first, smallest first, then the advanced ones.
 * @param {ModelFile[]} models
 * @returns {ModelFile[]}
 */
export function sortModels(models) {
  return [...models].sort((a, b) => {
    const positionDifference = sortPosition(a.name) - sortPosition(b.name);
    if (positionDifference !== 0) {
      return positionDifference;
    }

    return a.name.localeCompare(b.name);
  });
}

/** @returns {ModelFile[]} */
export function getInstalledModels() {
  const modelsDir = getModelsDir();
  if (!existsSync(modelsDir)) {
    return [];
  }

  const models = [];
  for (const fileName of readdirSync(modelsDir)) {
    const name = modelNameFromFileName(fileName);
    if (name) {
      const size_bytes = statSync(join(modelsDir, fileName)).size;
      models.push({ name, size_bytes });
    }
  }

  return sortModels(models);
}

/**
 * Picks the models out of a Hugging Face file listing, which also has other files such as
 * Core ML encoders.
 * @returns {ModelFile[]}
 */
export function modelsFromRepositoryFiles(files) {
  const models = [];

  for (const file of files) {
    if (file.type !== 'file') {
      continue;
    }

    const name = modelNameFromFileName(file.path);
    if (name) {
      // Large files are stored with Git LFS, and their real size is recorded there.
      const size_bytes = file.lfs?.size ?? file.size;
      models.push({ name, size_bytes });
    }
  }

  return sortModels(models);
}

/** @returns {Promise<ModelFile[]>} */
export async function fetchOnlineModels() {
  let response;
  try {
    response = await fetch(FILE_LIST_URL);
  } catch (error) {
    throw new Error(`Could not reach Hugging Face to list the models: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Could not list the models on Hugging Face: HTTP ${response.status}`);
  }

  return modelsFromRepositoryFiles(await response.json());
}

/**
 * Downloads a model into the models directory, replacing any installed copy.
 * `onProgress` is called with the bytes received so far and the total, which is null when
 * the server does not say.
 */
export async function installModel(name, onProgress = () => {}) {
  const modelPath = getModelPath(name);

  const response = await fetch(`${DOWNLOAD_BASE_URL}/${modelFileName(name)}`);
  if (!response.ok) {
    throw new Error(`Could not download ${name}: HTTP ${response.status}`);
  }

  const totalBytes = Number(response.headers.get('content-length')) || null;
  let receivedBytes = 0;
  const progressCounter = new Transform({
    transform(chunk, _encoding, done) {
      receivedBytes += chunk.length;
      onProgress(receivedBytes, totalBytes);
      done(null, chunk);
    },
  });

  await mkdir(getModelsDir(), { recursive: true });

  // Download to a side file so an interrupted download never leaves a partial model behind.
  const partialPath = `${modelPath}.part`;
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      progressCounter,
      createWriteStream(partialPath),
    );
    await rename(partialPath, modelPath);
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
}

export async function deleteModel(name) {
  const modelPath = getModelPath(name);
  if (!existsSync(modelPath)) {
    throw new Error(`${name} is not installed`);
  }

  await rm(modelPath);
}

/** Formats a size in bytes the way macOS Finder and Hugging Face do, such as 148 MB. */
export function formatSize(bytes) {
  const gigabytes = bytes / 1e9;
  if (gigabytes >= 1) {
    return `${gigabytes.toFixed(1)} GB`;
  }

  return `${Math.round(bytes / 1e6)} MB`;
}
