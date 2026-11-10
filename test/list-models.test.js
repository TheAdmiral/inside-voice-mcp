import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { REGULAR_MODEL_NAMES } from '../src/models.js';
import { listModelsTool } from '../src/tools/list-models.js';

async function listModels(t, installedFiles) {
  const dir = mkdtempSync(join(tmpdir(), 'inside-voice-models-'));
  t.after(() => {
    delete process.env.WHISPER_MODELS_PATH;
    rmSync(dir, { recursive: true, force: true });
  });
  process.env.WHISPER_MODELS_PATH = dir;

  for (const [fileName, contents] of Object.entries(installedFiles)) {
    writeFileSync(join(dir, fileName), contents);
  }

  const response = await listModelsTool.handler({});
  return JSON.parse(response.content[0].text);
}

test('installed models are listed with their size and type', async (t) => {
  const result = await listModels(t, {
    'ggml-base.en.bin': 'abc',
    'ggml-base.en-q5_1.bin': 'ab',
  });

  const [regular, advanced] = result.available_models;
  assert.equal(regular.model, 'base.en');
  assert.equal(regular.type, 'regular');
  assert.equal(regular.size, '0 MB');
  assert.equal(regular.speed_rating, 4);

  assert.equal(advanced.model, 'base.en-q5_1');
  assert.equal(advanced.type, 'advanced');
  assert.match(advanced.description, /quantised/);
});

test('every regular model that is not installed is listed as not downloaded', async (t) => {
  const result = await listModels(t, { 'ggml-tiny.en.bin': '' });

  const notDownloaded = result.not_downloaded.map((model) => model.model);
  assert.deepEqual(
    notDownloaded,
    REGULAR_MODEL_NAMES.filter((name) => name !== 'tiny.en'),
  );
  assert.match(result.not_downloaded[0].download_note, /npm run models -- install tiny$/);
});
