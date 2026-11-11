import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { transcribeTool } from '../src/tools/transcribe.js';
import { installFakeWhisper, writeExecutable } from './helpers.js';

const WHISPER_JSON = {
  result: { language: 'sv' },
  transcription: [
    {
      text: ' Hello there.',
      offsets: { from: 0, to: 2000 },
      tokens: [{ text: ' Hello', offsets: { from: 0, to: 900 } }],
    },
    {
      text: ' Hi.',
      offsets: { from: 3000, to: 4000 },
      tokens: [{ text: ' Hi', offsets: { from: 3000, to: 3900 } }],
    },
  ],
};

const DIARIZATION_JSON = JSON.stringify({
  segments: [
    { start: 0, end: 2.5, speaker: 'SPEAKER_00' },
    { start: 2.5, end: 4.5, speaker: 'SPEAKER_01' },
  ],
  device: 'cpu',
});

/** Replaces whisper-cli and Python with fakes, and keeps the tests away from the Keychain. */
function setUpFakeTools(t) {
  const { dir } = installFakeWhisper(t, { json: WHISPER_JSON, text: 'plain transcript' });

  const pythonCallsPath = join(dir, 'python-calls');
  const pythonPath = join(dir, 'python');
  writeExecutable(
    pythonPath,
    `#!/bin/sh
if [ "$1" = "-c" ]; then exit 0; fi
echo "$@" >> "${pythonCallsPath}"
echo '${DIARIZATION_JSON}'
`,
  );

  process.env.PYTHON_EXECUTABLE = pythonPath;
  process.env.HF_TOKEN = 'token-from-test';

  const audioPath = join(dir, 'sample.wav');
  writeFileSync(audioPath, '');

  return { audioPath, pythonCallsPath };
}

async function runTool(audioPath, options) {
  const args = transcribeTool.argsSchema.parse({
    audio_path: audioPath,
    options: { model: 'tiny.en', ...options },
  });
  const response = await transcribeTool.handler(args);

  return JSON.parse(response.content[0].text);
}

test('does not run Python unless diarization is requested', async (t) => {
  const { audioPath, pythonCallsPath } = setUpFakeTools(t);

  const result = await runTool(audioPath, {});

  assert.equal(result.transcription, 'plain transcript');
  assert.equal('speakers' in result.metadata, false);
  assert.equal(existsSync(pythonCallsPath), false);
});

test('labels the transcription with speakers', async (t) => {
  const { audioPath } = setUpFakeTools(t);

  const result = await runTool(audioPath, { diarize: true });

  assert.equal(result.transcription, '[speaker00]: Hello there.\n[speaker01]: Hi.');
  assert.deepEqual(result.metadata.speakers, ['speaker00', 'speaker01']);
  assert.equal(result.metadata.diarization_device, 'cpu');
  assert.equal(result.metadata.language, 'sv');
  assert.equal('segments' in result.metadata, false);
});

test('passes the speaker options to the diarization script', async (t) => {
  const { audioPath, pythonCallsPath } = setUpFakeTools(t);

  await runTool(audioPath, { diarize: true, min_speakers: 2, max_speakers: 3, use_mps: false });

  const args = readFileSync(pythonCallsPath, 'utf-8').trim().split(' ');
  assert.deepEqual(args.slice(-3), ['2', '3', 'false']);
});

test('json output has the same shape as without diarization', async (t) => {
  const { audioPath } = setUpFakeTools(t);

  const result = await runTool(audioPath, { diarize: true, output_format: 'json' });

  assert.equal(result.transcription, '[speaker00]: Hello there.\n[speaker01]: Hi.');
  assert.equal(result.metadata.segments[1].speaker, 'speaker01');
  assert.equal(result.metadata.segments[1].text, 'Hi.');
});

test('csv output has a speaker column', async (t) => {
  const { audioPath } = setUpFakeTools(t);

  const result = await runTool(audioPath, { diarize: true, output_format: 'csv' });

  assert.equal(
    result.transcription,
    'start,end,speaker,text\n0,2000,speaker00,"Hello there."\n3000,4000,speaker01,"Hi."',
  );
});

test('word timestamps are kept with diarization', async (t) => {
  const { audioPath } = setUpFakeTools(t);

  const result = await runTool(audioPath, { diarize: true, word_timestamps: true });

  assert.deepEqual(result.metadata.segments[0].words, [{ start: 0, end: 0.9, text: 'Hello' }]);
});

test('a missing audio file is reported before any tool runs', async (t) => {
  const { pythonCallsPath } = setUpFakeTools(t);

  await assert.rejects(runTool('/no/such/file.wav', { diarize: true }), /Audio file not found/);
  assert.equal(existsSync(pythonCallsPath), false);
});
