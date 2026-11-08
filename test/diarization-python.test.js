import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runDiarization } from '../src/utils/diarization-python.js';

/** Writes a fake Python that records its arguments and prints diarization output. */
function setUpFakePython(t) {
  const dir = mkdtempSync(join(tmpdir(), 'inside-voice-fake-python-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  // Setting the variable also keeps these tests away from the real Keychain.
  process.env.HF_TOKEN = 'token-from-test';
  t.after(() => delete process.env.HF_TOKEN);

  const argsPath = join(dir, 'args');
  const tokenPath = join(dir, 'token');
  const pythonPath = join(dir, 'python');
  writeFileSync(
    pythonPath,
    `#!/bin/sh
echo "$@" > "${argsPath}"
echo "$HF_TOKEN" > "${tokenPath}"
echo '{"segments":[{"start":0,"end":1,"speaker":"SPEAKER_00"}],"device":"cpu"}'
`,
  );
  chmodSync(pythonPath, 0o755);

  return { pythonPath, argsPath, tokenPath };
}

const params = { audioPath: 'a.wav', minSpeakers: 1, maxSpeakers: 2 };

for (const useMps of [true, false]) {
  test(`passes useMps ${useMps} to the script`, async (t) => {
    const { pythonPath, argsPath } = setUpFakePython(t);

    await runDiarization(pythonPath, { ...params, useMps });

    const args = readFileSync(argsPath, 'utf-8').trim().split(' ');
    assert.deepEqual(args.slice(1), ['a.wav', '1', '2', String(useMps)]);
  });
}

function writeFailingPython(t, script) {
  const { pythonPath } = setUpFakePython(t);
  writeFileSync(pythonPath, `#!/bin/sh\n${script}\nexit 1\n`);
  return pythonPath;
}

test('reports the error from the script even after other stdout output', async (t) => {
  const pythonPath = writeFailingPython(
    t,
    `echo "Could not download the pipeline"
echo "Loading..." >&2
echo '{"error":"Check your token","code":"SETUP_ERROR"}'`,
  );

  await assert.rejects(runDiarization(pythonPath, { ...params, useMps: false }), {
    name: 'DiarizationError',
    code: 'SETUP_ERROR',
    message: 'Check your token',
  });
});

test('a script error without a code is a processing error', async (t) => {
  const pythonPath = writeFailingPython(t, `echo '{"error":"It broke"}'`);

  await assert.rejects(runDiarization(pythonPath, { ...params, useMps: false }), {
    code: 'PROCESSING_ERROR',
    message: 'It broke',
  });
});

test('a crash with no JSON reports stderr', async (t) => {
  const pythonPath = writeFailingPython(t, 'echo "Segmentation fault" >&2');

  await assert.rejects(
    runDiarization(pythonPath, { ...params, useMps: false }),
    /exit code 1\): Segmentation fault/,
  );
});

test('passes the HuggingFace token to the script', async (t) => {
  const { pythonPath, tokenPath } = setUpFakePython(t);

  await runDiarization(pythonPath, { ...params, useMps: false });

  assert.equal(readFileSync(tokenPath, 'utf-8').trim(), 'token-from-test');
});

test('returns the segments and the device the script used', async (t) => {
  const { pythonPath } = setUpFakePython(t);

  const result = await runDiarization(pythonPath, { ...params, useMps: false });

  assert.deepEqual(result, {
    segments: [{ start: 0, end: 1, speaker: 'SPEAKER_00' }],
    device: 'cpu',
  });
});
