import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { findDiarizationPython, runDiarization } from '../src/utils/diarization-python.js';

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

  return { python: { command: pythonPath, argsBeforeScript: [] }, pythonPath, argsPath, tokenPath };
}

const params = { audioPath: 'a.wav', minSpeakers: 1, maxSpeakers: 2 };

for (const useMps of [true, false]) {
  test(`passes useMps ${useMps} to the script`, async (t) => {
    const { python, argsPath } = setUpFakePython(t);

    await runDiarization(python, { ...params, useMps });

    const args = readFileSync(argsPath, 'utf-8').trim().split(' ');
    assert.deepEqual(args.slice(1), ['a.wav', '1', '2', String(useMps)]);
  });
}

function writeFailingPython(t, script) {
  const { python, pythonPath } = setUpFakePython(t);
  writeFileSync(pythonPath, `#!/bin/sh\n${script}\nexit 1\n`);
  return python;
}

test('reports the error from the script even after other stdout output', async (t) => {
  const python = writeFailingPython(
    t,
    `echo "Could not download the pipeline"
echo "Loading..." >&2
echo '{"error":"Check your token","code":"SETUP_ERROR"}'`,
  );

  await assert.rejects(runDiarization(python, { ...params, useMps: false }), {
    name: 'DiarizationError',
    code: 'SETUP_ERROR',
    message: 'Check your token',
  });
});

test('a script error without a code is a processing error', async (t) => {
  const python = writeFailingPython(t, `echo '{"error":"It broke"}'`);

  await assert.rejects(runDiarization(python, { ...params, useMps: false }), {
    code: 'PROCESSING_ERROR',
    message: 'It broke',
  });
});

test('a crash with no JSON reports stderr', async (t) => {
  const python = writeFailingPython(t, 'echo "Segmentation fault" >&2');

  await assert.rejects(
    runDiarization(python, { ...params, useMps: false }),
    /exit code 1\): Segmentation fault/,
  );
});

test('passes the HuggingFace token to the script', async (t) => {
  const { python, tokenPath } = setUpFakePython(t);

  await runDiarization(python, { ...params, useMps: false });

  assert.equal(readFileSync(tokenPath, 'utf-8').trim(), 'token-from-test');
});

test('returns the segments and the device the script used', async (t) => {
  const { python } = setUpFakePython(t);

  const result = await runDiarization(python, { ...params, useMps: false });

  assert.deepEqual(result, {
    segments: [{ start: 0, end: 1, speaker: 'SPEAKER_00' }],
    device: 'cpu',
  });
});

test('puts the arguments for the runner before the script', async (t) => {
  const { python, argsPath } = setUpFakePython(t);

  await runDiarization(
    { ...python, argsBeforeScript: ['run', '--script'] },
    { ...params, useMps: false },
  );

  const args = readFileSync(argsPath, 'utf-8').trim().split(' ');
  assert.deepEqual(args.slice(0, 2), ['run', '--script']);
  assert.match(args[2], /python\/diarize\.py$/);
});

/** Replaces PATH with a directory holding only a fake uv, if `withUv` is true. */
function setUpPath(t, withUv) {
  const dir = mkdtempSync(join(tmpdir(), 'inside-voice-fake-path-'));
  const originalPath = process.env.PATH;
  const originalPython = process.env.PYTHON_EXECUTABLE;
  t.after(() => {
    process.env.PATH = originalPath;
    if (originalPython === undefined) {
      delete process.env.PYTHON_EXECUTABLE;
    } else {
      process.env.PYTHON_EXECUTABLE = originalPython;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  if (withUv) {
    writeFileSync(join(dir, 'uv'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(dir, 'uv'), 0o755);
  }

  process.env.PATH = dir;
  delete process.env.PYTHON_EXECUTABLE;
}

test('runs the script with uv when no Python is configured', async (t) => {
  setUpPath(t, true);

  const python = await findDiarizationPython();

  assert.equal(python.command, 'uv');
  assert.deepEqual(python.argsBeforeScript, ['run', '--quiet', '--frozen', '--script']);
});

test('finds nothing when uv is missing and no Python is configured', async (t) => {
  setUpPath(t, false);

  assert.equal(await findDiarizationPython(), null);
});

test('prefers a configured Python that has the packages', async (t) => {
  const { pythonPath } = setUpFakePython(t);
  setUpPath(t, true);
  process.env.PYTHON_EXECUTABLE = pythonPath;

  const python = await findDiarizationPython();

  assert.deepEqual(python, { command: pythonPath, argsBeforeScript: [] });
});

test('falls back to uv when the configured Python lacks the packages', async (t) => {
  const { pythonPath } = setUpFakePython(t);
  writeFileSync(pythonPath, '#!/bin/sh\nexit 1\n');
  setUpPath(t, true);
  process.env.PYTHON_EXECUTABLE = pythonPath;

  const python = await findDiarizationPython();

  assert.equal(python.command, 'uv');
});
