import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getModelsDir } from '../src/whisper/integration.js';

const DOWNLOAD_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
const DEFAULT_MODEL = 'base.en';

async function downloadModel(model) {
  const modelsDir = getModelsDir();
  const fileName = `ggml-${model}.bin`;
  const modelPath = join(modelsDir, fileName);

  if (existsSync(modelPath)) {
    console.log(`${model} is already downloaded: ${modelPath}`);
    return;
  }

  console.log(`Downloading ${model} to ${modelPath}`);
  const response = await fetch(`${DOWNLOAD_BASE_URL}/${fileName}`);
  if (!response.ok) {
    throw new Error(`Could not download ${model}: HTTP ${response.status}`);
  }

  await mkdir(modelsDir, { recursive: true });

  // Download to a side file so an interrupted run never leaves a partial model behind.
  const partialPath = `${modelPath}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partialPath));
    await rename(partialPath, modelPath);
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }

  console.log(`Downloaded ${model}`);
}

const models = process.argv.slice(2);

try {
  for (const model of models.length > 0 ? models : [DEFAULT_MODEL]) {
    await downloadModel(model);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
