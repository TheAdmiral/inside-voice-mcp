import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TranscribeOptionsSchema } from '../src/schemas.js';
import { buildWhisperArgs, parseWhisperJson, transcribe } from '../src/whisper.js';

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
    '--output-json',
    '--no-prints',
  ]);
});

test('adds the VAD flags when given a VAD model', () => {
  const args = buildWhisperArgs('a.wav', 'm.bin', 'out', options(), 'vad.bin');

  assert.deepEqual(args.slice(-4), ['--vad', '--vad-model', 'vad.bin', '--no-prints']);
  assert.ok(!buildWhisperArgs('a.wav', 'm.bin', 'out', options()).includes('--vad'));
});

test('asks for the JSON file only once when JSON is the chosen format', () => {
  const args = buildWhisperArgs('a.wav', 'm.bin', 'out', options({ output_format: 'json' }));

  assert.equal(args.filter((arg) => arg === '--output-json').length, 1);
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

/** What the fake whisper-cli's cue files should come back as, without the leading spaces. */
const EXPECTED_CUE_FILES = {
  srt: '1\n00:00:00,000 --> 00:00:01,000\nhello',
  vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhello',
  csv: 'start,end,text\n0,1000,"hello"',
};

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
echo '{"result":{"language":"sv"},"transcription":[{"text":" hello","offsets":{"from":0,"to":1000}}]}' > "$out.json"
echo hello > "$out.txt"
printf '1\\n00:00:00,000 --> 00:00:01,000\\n hello\\n' > "$out.srt"
printf 'WEBVTT\\n\\n00:00:00.000 --> 00:00:01.000\\n hello\\n' > "$out.vtt"
printf 'start,end,text\\n0,1000," hello"\\n' > "$out.csv"
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

test('an installed advanced model can be used', async (t) => {
  const { audioPath } = setUpFakeWhisper(t);
  writeFileSync(join(process.env.WHISPER_MODELS_PATH, 'ggml-tiny.en-q5_1.bin'), '');

  const result = await transcribe(audioPath, options({ model: 'tiny.en-q5_1' }));

  assert.equal(result.model_used, 'tiny.en-q5_1');
});

test('a model that is not installed says how to install it', async (t) => {
  const { audioPath } = setUpFakeWhisper(t);

  await assert.rejects(
    transcribe(audioPath, options({ model: 'small.en' })),
    /not installed.*npm run models -- install small\.en/,
  );
});

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

    assert.equal(result.text, EXPECTED_CUE_FILES[output_format]);
  });
}

for (const output_format of ['txt', 'srt', 'vtt', 'csv', 'json']) {
  test(`${output_format} transcription reports the detected language`, async (t) => {
    const { audioPath } = setUpFakeWhisper(t);

    const result = await transcribe(audioPath, options({ model: 'tiny.en', output_format }));

    assert.equal(result.language, 'sv');
  });
}

for (const output_format of ['srt', 'vtt', 'csv']) {
  test(`word timestamps keep the ${output_format} output and add segments`, async (t) => {
    const { audioPath } = setUpFakeWhisper(t);

    const result = await transcribe(
      audioPath,
      options({ model: 'tiny.en', output_format, word_timestamps: true }),
    );

    assert.equal(result.text, EXPECTED_CUE_FILES[output_format]);
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

test('merges tokens into words with times in seconds', () => {
  const { segments } = parseWhisperJson({
    transcription: [
      {
        text: " Today's plan.",
        offsets: { from: 0, to: 3000 },
        tokens: [
          { text: '[_BEG_]', offsets: { from: 0, to: 0 } },
          { text: ' Today', offsets: { from: 100, to: 500 } },
          { text: "'s", offsets: { from: 500, to: 700 } },
          { text: ' plan', offsets: { from: 800, to: 1200 } },
          { text: '.', offsets: { from: 1200, to: 2900 } },
          { text: '[_TT_150]', offsets: { from: 3000, to: 3000 } },
        ],
      },
    ],
  });

  assert.deepEqual(segments[0].words, [
    { start: 0.1, end: 0.7, text: "Today's" },
    { start: 0.8, end: 1.2, text: 'plan.' },
  ]);
});

test('words with no duration run up to the next word or the segment end', () => {
  const { segments } = parseWhisperJson({
    transcription: [
      {
        text: ' Hello there',
        offsets: { from: 0, to: 2000 },
        tokens: [
          { text: ' Hello', offsets: { from: 480, to: 480 } },
          { text: ' there', offsets: { from: 900, to: 900 } },
        ],
      },
    ],
  });

  assert.deepEqual(segments[0].words, [
    { start: 0.48, end: 0.9, text: 'Hello' },
    { start: 0.9, end: 2, text: 'there' },
  ]);
});

test('segments have no words key without tokens', () => {
  const { segments } = parseWhisperJson({
    transcription: [{ text: ' Hi', offsets: { from: 0, to: 1000 } }],
  });

  assert.equal('words' in segments[0], false);
});

/** Installs a stand-in VAD model in the fake models directory. */
function installFakeVadModel() {
  const vadDir = join(process.env.WHISPER_MODELS_PATH, 'vad');
  mkdirSync(vadDir);
  writeFileSync(join(vadDir, 'ggml-silero-v6.2.0.bin'), '');
}

test('uses VAD when the VAD model is installed', async (t) => {
  const { audioPath } = setUpFakeWhisper(t);
  installFakeVadModel();

  const result = await transcribe(audioPath, options({ model: 'tiny.en' }));

  assert.equal(result.vad_used, true);
});

test('skips VAD when the VAD model is not installed', async (t) => {
  const { audioPath } = setUpFakeWhisper(t);

  const result = await transcribe(audioPath, options({ model: 'tiny.en' }));

  assert.equal(result.vad_used, false);
});

test('vad false turns VAD off even when it is installed', async (t) => {
  const { audioPath } = setUpFakeWhisper(t);
  installFakeVadModel();

  const result = await transcribe(audioPath, options({ model: 'tiny.en', vad: false }));

  assert.equal(result.vad_used, false);
});

test('vad true without the VAD model says how to install it', async (t) => {
  const { audioPath } = setUpFakeWhisper(t);

  await assert.rejects(
    transcribe(audioPath, options({ model: 'tiny.en', vad: true })),
    /VAD model is not installed.*npm run models -- install vad/,
  );
});
