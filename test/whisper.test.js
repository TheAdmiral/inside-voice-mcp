import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TranscribeOptionsSchema } from '../src/schemas.js';
import {
  buildWhisperArgs,
  getAvailableModels,
  getModelsDir,
  parseWhisperJson,
} from '../src/whisper/integration.js';

const options = (overrides = {}) => TranscribeOptionsSchema.parse(overrides);

test('builds the default arguments', () => {
  assert.deepEqual(buildWhisperArgs('a.wav', 'm.bin', options()), [
    '--model',
    'm.bin',
    '--file',
    'a.wav',
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
    const args = buildWhisperArgs('a.wav', 'm.bin', options({ output_format: format }));
    assert.ok(args.includes(flag), format);
  }
});

test('word timestamps override the output format', () => {
  const args = buildWhisperArgs(
    'a.wav',
    'm.bin',
    options({ output_format: 'srt', word_timestamps: true }),
  );

  assert.ok(args.includes('--output-json-full'));
  assert.ok(!args.includes('--output-srt'));
});

test('adds optional flags only when they are set', () => {
  const args = buildWhisperArgs(
    'a.wav',
    'm.bin',
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
  assert.ok(!buildWhisperArgs('a.wav', 'm.bin', options()).includes('--language'));
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
