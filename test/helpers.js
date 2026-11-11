/**
 * Setup shared by the tests: temporary directories, a way to put environment variables back
 * after a test, and fake commands that stand in for programs such as whisper-cli.
 */

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Makes an empty directory that is deleted when the test ends. */
export function makeTempDir(t, name = 'test') {
  const dir = mkdtempSync(join(tmpdir(), `inside-voice-${name}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Tests whose environment is already saved, so that it is only saved once per test. Saving it
// again after a change would put the changed environment back instead of the original.
const testsWithSavedEnvironment = new WeakSet();

/**
 * Saves every environment variable, and puts them back as they were when the test ends.
 * The test can then change any variable without affecting the tests after it.
 */
export function restoreEnvironmentAfter(t) {
  if (testsWithSavedEnvironment.has(t)) {
    return;
  }
  testsWithSavedEnvironment.add(t);

  const originalEnvironment = { ...process.env };
  t.after(() => {
    for (const name of Object.keys(process.env)) {
      if (!(name in originalEnvironment)) {
        delete process.env[name];
      }
    }
    Object.assign(process.env, originalEnvironment);
  });
}

/** Writes a shell script that can be run as a command. */
export function writeExecutable(path, script) {
  writeFileSync(path, script);
  chmodSync(path, 0o755);
}

const DEFAULT_WHISPER_JSON = {
  result: { language: 'sv' },
  transcription: [{ text: ' hello', offsets: { from: 0, to: 1000 } }],
};

/**
 * Puts a fake whisper-cli first on the PATH, and points WHISPER_MODELS_PATH at a directory
 * with the tiny.en model in it.
 *
 * The fake writes `json` and `text` as its JSON and txt output, and "hello" in the other
 * formats, each with the space whisper puts before cue text. Like the real one, it prints
 * timestamped text, which should never be used as the transcript. It exits with `exitCode`,
 * and records the output path it was given in the file at `recordPath`.
 * @returns {{ dir: string, recordPath: string }}
 */
export function installFakeWhisper(
  t,
  { json = DEFAULT_WHISPER_JSON, text = 'hello', exitCode = 0 } = {},
) {
  const dir = makeTempDir(t, 'fake-whisper');
  restoreEnvironmentAfter(t);

  const recordPath = join(dir, 'output-base');
  writeFileSync(join(dir, 'whisper-output.json'), JSON.stringify(json));
  writeFileSync(join(dir, 'whisper-output.txt'), `${text}\n`);

  writeExecutable(
    join(dir, 'whisper-cli'),
    `#!/bin/sh
while [ $# -gt 0 ]; do
  if [ "$1" = "--output-file" ]; then out="$2"; fi
  shift
done
printf '%s' "$out" > "${recordPath}"
cp "${dir}/whisper-output.json" "$out.json"
cp "${dir}/whisper-output.txt" "$out.txt"
printf '1\\n00:00:00,000 --> 00:00:01,000\\n hello\\n' > "$out.srt"
printf 'WEBVTT\\n\\n00:00:00.000 --> 00:00:01.000\\n hello\\n' > "$out.vtt"
printf 'start,end,text\\n0,1000," hello"\\n' > "$out.csv"
echo '[00:00:00.000 --> 00:00:01.000]   ${text}'
exit ${exitCode}
`,
  );

  process.env.PATH = `${dir}:${process.env.PATH}`;
  process.env.WHISPER_MODELS_PATH = dir;
  writeFileSync(join(dir, 'ggml-tiny.en.bin'), '');

  return { dir, recordPath };
}
