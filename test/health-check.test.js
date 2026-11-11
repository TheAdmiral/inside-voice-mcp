import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { healthCheckTool } from '../src/tools/health-check.js';

/** Runs the health check with no whisper-cli on the PATH and an empty models directory. */
async function checkWithNothingInstalled(t) {
  const dir = mkdtempSync(join(tmpdir(), 'inside-voice-health-'));
  const originalEnvironment = { ...process.env };
  t.after(() => {
    process.env = originalEnvironment;
    rmSync(dir, { recursive: true, force: true });
  });

  process.env.PATH = dir;
  process.env.WHISPER_MODELS_PATH = dir;
  process.env.HF_TOKEN = 'token-from-test';

  const result = await healthCheckTool.handler();
  return JSON.parse(result.content[0].text);
}

test('a missing whisper-cli is critical, even when models are also missing', async (t) => {
  const result = await checkWithNothingInstalled(t);

  assert.equal(result.status, 'critical');
  assert.equal(result.whisper_installed, false);
  assert.deepEqual(result.diagnostics.issues, [
    'whisper.cpp not installed or not in PATH',
    'No whisper models found',
  ]);
});

test('recommends the default model when no models are installed', async (t) => {
  const result = await checkWithNothingInstalled(t);

  assert.equal(result.recommended_model, 'base.en');
});
