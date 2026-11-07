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

  const argsPath = join(dir, 'args');
  const pythonPath = join(dir, 'python');
  writeFileSync(
    pythonPath,
    `#!/bin/sh
echo "$@" > "${argsPath}"
echo '{"segments":[{"start":0,"end":1,"speaker":"SPEAKER_00"}],"device":"cpu"}'
`,
  );
  chmodSync(pythonPath, 0o755);

  return { pythonPath, argsPath };
}

const params = { audioPath: 'a.wav', model: 'pyannote', minSpeakers: 1, maxSpeakers: 2 };

for (const useMps of [true, false]) {
  test(`passes useMps ${useMps} to the script`, async (t) => {
    const { pythonPath, argsPath } = setUpFakePython(t);

    await runDiarization(pythonPath, { ...params, useMps });

    const args = readFileSync(argsPath, 'utf-8').trim().split(' ');
    assert.deepEqual(args.slice(1), ['a.wav', 'pyannote', '1', '2', String(useMps)]);
  });
}

test('returns the segments and the device the script used', async (t) => {
  const { pythonPath } = setUpFakePython(t);

  const result = await runDiarization(pythonPath, { ...params, useMps: false });

  assert.deepEqual(result, {
    segments: [{ start: 0, end: 1, speaker: 'SPEAKER_00' }],
    device: 'cpu',
  });
});
