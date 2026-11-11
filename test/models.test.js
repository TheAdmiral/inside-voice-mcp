import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  deleteModel,
  describeModel,
  formatSize,
  getInstalledModels,
  getModelPath,
  getModelsDir,
  getVadModelPath,
  installModel,
  installVadModel,
  isRegularModel,
  isVadModelInstalled,
  modelsFromRepositoryFiles,
} from '../src/models.js';
import { makeTempDir, restoreEnvironmentAfter } from './helpers.js';

/** Points WHISPER_MODELS_PATH at an empty directory for the length of the test. */
function useTemporaryModelsDir(t) {
  const dir = makeTempDir(t, 'models');
  restoreEnvironmentAfter(t);
  process.env.WHISPER_MODELS_PATH = dir;

  return dir;
}

/** Replaces fetch for the length of the test. */
function fakeFetch(t, respond) {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url) => respond(url);
}

test('models live in the home directory by default', (t) => {
  restoreEnvironmentAfter(t);
  delete process.env.WHISPER_MODELS_PATH;

  assert.equal(getModelsDir(), join(homedir(), '.inside-voice-mcp', 'models'));
});

test('WHISPER_MODELS_PATH overrides the models directory', (t) => {
  const dir = useTemporaryModelsDir(t);

  assert.equal(getModelsDir(), dir);
  assert.equal(getModelPath('tiny.en'), join(dir, 'ggml-tiny.en.bin'));
});

test('installed models have their size, with regular models first', (t) => {
  const dir = useTemporaryModelsDir(t);
  writeFileSync(join(dir, 'ggml-base.en-q5_1.bin'), 'abc');
  writeFileSync(join(dir, 'ggml-small.bin'), 'abcdef');
  writeFileSync(join(dir, 'ggml-tiny.en.bin'), '');

  assert.deepEqual(getInstalledModels(), [
    { name: 'tiny.en', size_bytes: 0 },
    { name: 'small', size_bytes: 6 },
    { name: 'base.en-q5_1', size_bytes: 3 },
  ]);
});

test('files that are not whisper models are not listed as installed', (t) => {
  const dir = useTemporaryModelsDir(t);
  writeFileSync(join(dir, 'ggml-tiny.en.bin.part'), '');
  writeFileSync(join(dir, 'other.bin'), '');
  writeFileSync(join(dir, 'notes.txt'), '');

  assert.deepEqual(getInstalledModels(), []);
});

test('a missing models directory gives no models', (t) => {
  restoreEnvironmentAfter(t);
  process.env.WHISPER_MODELS_PATH = join(tmpdir(), 'inside-voice-no-such-directory');

  assert.deepEqual(getInstalledModels(), []);
});

test('only models are picked out of the repository files, with their stored size', () => {
  const files = [
    { type: 'file', path: 'README.md', size: 3196 },
    { type: 'file', path: 'ggml-base.en-encoder.mlmodelc.zip', size: 37950917 },
    { type: 'directory', path: 'ggml-folder.bin', size: 0 },
    { type: 'file', path: 'ggml-tiny-q5_1.bin', size: 135, lfs: { size: 32152673 } },
    { type: 'file', path: 'ggml-large-v3.bin', size: 135, lfs: { size: 3095033483 } },
    { type: 'file', path: 'ggml-tiny.bin', size: 77691713 },
  ];

  assert.deepEqual(modelsFromRepositoryFiles(files), [
    { name: 'tiny', size_bytes: 77691713 },
    { name: 'large-v3', size_bytes: 3095033483 },
    { name: 'tiny-q5_1', size_bytes: 32152673 },
  ]);
});

test('regular models are the standard whisper models', () => {
  assert.equal(isRegularModel('large-v3-turbo'), true);
  assert.equal(isRegularModel('large-v3-turbo-q5_0'), false);
});

test('quantised models are described by the model they came from', () => {
  assert.match(describeModel('medium.en-q8_0'), /^medium\.en quantised to q8_0/);
  assert.equal(describeModel('my-own-model'), 'Advanced model');
});

test('a model path cannot lead outside the models directory', () => {
  assert.throws(() => getModelPath('../secret'), /not a valid model name/);
});

test('installing a model downloads it into the models directory', async (t) => {
  const dir = useTemporaryModelsDir(t);
  let requestedUrl;
  fakeFetch(t, (url) => {
    requestedUrl = url;
    return new Response('model bytes', { headers: { 'content-length': '11' } });
  });

  const progress = [];
  await installModel('tiny.en-q5_1', (received, total) => progress.push([received, total]));

  assert.match(requestedUrl, /\/resolve\/main\/ggml-tiny\.en-q5_1\.bin$/);
  assert.equal(readFileSync(join(dir, 'ggml-tiny.en-q5_1.bin'), 'utf-8'), 'model bytes');
  assert.deepEqual(progress.at(-1), [11, 11]);
});

test('a failed download leaves nothing behind', async (t) => {
  const dir = useTemporaryModelsDir(t);
  fakeFetch(t, () => new Response('missing', { status: 404 }));

  await assert.rejects(installModel('no-such-model'), /HTTP 404/);
  assert.deepEqual(readdirSync(dir), []);
});

test('deleting a model removes its file', async (t) => {
  const dir = useTemporaryModelsDir(t);
  writeFileSync(join(dir, 'ggml-tiny.en.bin'), '');

  await deleteModel('tiny.en');

  assert.equal(existsSync(join(dir, 'ggml-tiny.en.bin')), false);
});

test('deleting a model that is not installed fails', async (t) => {
  useTemporaryModelsDir(t);

  await assert.rejects(deleteModel('tiny.en'), /tiny\.en is not installed/);
});

test('sizes are shown in decimal units', () => {
  assert.equal(formatSize(77704715), '78 MB');
  assert.equal(formatSize(3095033483), '3.1 GB');
});

test('the VAD model installs into its own directory and is not listed as a whisper model', async (t) => {
  useTemporaryModelsDir(t);
  let requestedUrl;
  fakeFetch(t, (url) => {
    requestedUrl = url;
    return new Response('vad model');
  });

  assert.equal(isVadModelInstalled(), false);
  await installVadModel();

  assert.match(requestedUrl, /ggml-org\/whisper-vad\/resolve\/main\/ggml-silero-v6\.2\.0\.bin$/);
  assert.equal(isVadModelInstalled(), true);
  assert.equal(readFileSync(getVadModelPath(), 'utf-8'), 'vad model');
  assert.deepEqual(getInstalledModels(), []);
});
