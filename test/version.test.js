import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutputFormat } from '../src/schemas.js';
import { versionTool } from '../src/tools/version.js';

async function getVersionInfo() {
  const result = await versionTool.handler();
  return JSON.parse(result.content[0].text);
}

test('reports the output formats the transcribe tool accepts', async () => {
  const info = await getVersionInfo();
  assert.deepEqual(info.output_formats, OutputFormat.options);
});

test('leaves the models to list_models', async () => {
  const info = await getVersionInfo();
  assert.equal(info.whisper_models, undefined);
  assert.equal(info.supported_formats, undefined);
});
