import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TranscribeOptionsSchema } from '../src/schemas.js';
import {
  buildWhisperArgs,
  getAvailableModels,
  getModelsDir,
  parseWhisperJson,
  transcribe,
} from '../src/whisper/integration.js';

const options = (overrides = {}) => TranscribeOptionsSchema.parse(overrides);

test('builds the default arguments', () => {
  assert.deepEqual(buildWhisperArgs('a.wav', 'm.bin', 'out', options()), [
    '--model',
    'm.bin',
    '--file',
    'a.wav',
    '--output-file',
    'out',
    '--threads',
    '4',
    '--temperature',
    '0',
    '--output-txt',
    '--no-prints',
  ]);
});

test('maps each output format to its flag', () => {
  for (const [format, flag] of [
    ['txt', '--output-txt'],
    ['vtt', '--output-vtt'],
    ['srt', '--output-srt'],
    ['json', '--output-json'],
    ['csv', '--output-csv'],
  ]) {
    const args = buildWhisperArgs('a.wav', 'm.bin', 'out', options({ output_format: format }));
    assert.ok(args.includes(flag), format);
  }
});

test('word timestamps add the full JSON output to the chosen format', () => {
  const args = buildWhisperArgs(
    'a.wav',
    'm.bin',
    'out',
    options({ output_format: 'srt', word_timestamps: true }),
  );

  assert.ok(args.includes('--output-json-full'));
  assert.ok(args.includes('--output-srt'));
});

test('adds optional flags only when they are set', () => {
  const args = buildWhisperArgs(
    'a.wav',
    'm.bin',
    'out',
    options({ language: 'sv', translate: true, max_len: 40, split_on_word: true }),
  );

  assert.deepEqual(args.slice(args.indexOf('--language'), args.indexOf('--language') + 2), [
    '--language',
    'sv',
  ]);
  assert.ok(args.includes('--translate'));
  assert.deepEqual(args.slice(args.indexOf('--max-len'), args.indexOf('--max-len') + 2), [
    '--max-len',
    '40',
  ]);
  assert.ok(args.includes('--split-on-word'));
  assert.ok(!buildWhisperArgs('a.wav', 'm.bin', 'out', options()).includes('--language'));
});

test('parses whisper JSON, converting milliseconds to seconds', () => {
  const parsed = parseWhisperJson({
    result: { language: 'sv' },
    transcription: [
      { offsets: { from: 0, to: 1500 }, text: ' Hello' },
      { offsets: { from: 1500, to: 3250 }, text: ' world. ' },
      { text: 'no offsets' },
    ],
  });

  assert.deepEqual(parsed.segments, [
    { start: 0, end: 1.5, text: 'Hello' },
    { start: 1.5, end: 3.25, text: 'world.' },
  ]);
  assert.equal(parsed.text, 'Hello world. no offsets');
  assert.equal(parsed.language, 'sv');
});

test('empty whisper JSON gives empty text and English', () => {
  assert.deepEqual(parseWhisperJson({}), { text: '', segments: [], language: 'en' });
});

test('models live in the home directory by default', (t) => {
  t.after(() => {
    delete process.env.WHISPER_MODELS_PATH;
  });
  delete process.env.WHISPER_MODELS_PATH;

  assert.equal(getModelsDir(), join(homedir(), '.inside-voice-mcp', 'models'));
});

test('WHISPER_MODELS_PATH overrides the models directory', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'inside-voice-models-'));
  t.after(() => {
    delete process.env.WHISPER_MODELS_PATH;
    rmSync(dir, { recursive: true, force: true });
  });
  process.env.WHISPER_MODELS_PATH = dir;
  writeFileSync(join(dir, 'ggml-tiny.en.bin'), '');

  assert.equal(getModelsDir(), dir);
  assert.deepEqual(getAvailableModels(), ['tiny.en']);
});

test('a missing models directory gives no models', (t) => {
  t.after(() => {
    delete process.env.WHISPER_MODELS_PATH;
  });
  process.env.WHISPER_MODELS_PATH = join(tmpdir(), 'inside-voice-no-such-directory');

  assert.deepEqual(getAvailableModels(), []);
});

/** Puts a fake whisper-cli on the PATH that writes output files and records where it put them. */
function setUpFakeWhisper(t, { exitCode = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'inside-voice-fake-whisper-'));
  const originalPath = process.env.PATH;
  t.after(() => {
    process.env.PATH = originalPath;
    delete process.env.WHISPER_MODELS_PATH;
    rmSync(dir, { recursive: true, force: true });
  });

  const recordPath = join(dir, 'output-base');
  const whisperPath = join(dir, 'whisper-cli');
  writeFileSync(
    whisperPath,
    `#!/bin/sh
while [ $# -gt 0 ]; do
  if [ "$1" = "--output-file" ]; then out="$2"; fi
  shift
done
printf '%s' "$out" > "${recordPath}"
echo '{"transcription":[{"text":" hello","offsets":{"from":0,"to":1000}}]}' > "$out.json"
echo hello > "$out.txt"
for format in srt vtt csv; do echo "$format file" > "$out.$format"; done
echo hello
exit ${exitCode}
`,
  );
  chmodSync(whisperPath, 0o755);
  process.env.PATH = `${dir}:${originalPath}`;

  process.env.WHISPER_MODELS_PATH = dir;
  writeFileSync(join(dir, 'ggml-tiny.en.bin'), '');

  const audioDir = mkdtempSync(join(dir, 'audio-'));
  const audioPath = join(audioDir, 'sample.wav');
  writeFileSync(audioPath, '');

  return { audioDir, audioPath, recordPath };
}

for (const output_format of ['txt', 'json']) {
  test(`${output_format} transcription leaves no files behind`, async (t) => {
    const { audioDir, audioPath, recordPath } = setUpFakeWhisper(t);

    const result = await transcribe(audioPath, options({ model: 'tiny.en', output_format }));

    assert.equal(result.text, 'hello');
    assert.deepEqual(readdirSync(audioDir), ['sample.wav']);
    assert.equal(existsSync(`${readFileSync(recordPath, 'utf-8')}.txt`), false);
  });
}

test('a failed transcription leaves no files behind', async (t) => {
  const { audioDir, audioPath, recordPath } = setUpFakeWhisper(t, { exitCode: 1 });

  await assert.rejects(transcribe(audioPath, options({ model: 'tiny.en' })), /Whisper process/);

  assert.deepEqual(readdirSync(audioDir), ['sample.wav']);
  assert.equal(existsSync(`${readFileSync(recordPath, 'utf-8')}.txt`), false);
});

for (const output_format of ['srt', 'vtt', 'csv']) {
  test(`${output_format} transcription returns the ${output_format} file`, async (t) => {
    const { audioPath } = setUpFakeWhisper(t);

    const result = await transcribe(audioPath, options({ model: 'tiny.en', output_format }));

    assert.equal(result.text, `${output_format} file`);
  });
}

for (const output_format of ['srt', 'vtt', 'csv']) {
  test(`word timestamps keep the ${output_format} output and add segments`, async (t) => {
    const { audioPath } = setUpFakeWhisper(t);

    const result = await transcribe(
      audioPath,
      options({ model: 'tiny.en', output_format, word_timestamps: true }),
    );

    assert.equal(result.text, `${output_format} file`);
    assert.deepEqual(result.segments, [{ start: 0, end: 1, text: 'hello' }]);
  });
}

test('word timestamps with json output still return the parsed JSON', async (t) => {
  const { audioPath } = setUpFakeWhisper(t);

  const result = await transcribe(
    audioPath,
    options({ model: 'tiny.en', output_format: 'json', word_timestamps: true }),
  );

  assert.equal(result.text, 'hello');
  assert.deepEqual(result.segments, [{ start: 0, end: 1, text: 'hello' }]);
});
