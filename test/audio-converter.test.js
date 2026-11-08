import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isWhisperCompatible, prepareAudio } from '../src/utils/audio-converter.js';

test('only wav and flac go to whisper directly', () => {
  assert.equal(isWhisperCompatible('a.WAV'), true);
  assert.equal(isWhisperCompatible('a.flac'), true);
  assert.equal(isWhisperCompatible('a.mp3'), false);
});

test('audio whisper can read is used as is', async () => {
  const audio = await prepareAudio('a.wav', { autoConvert: true });

  assert.deepEqual(audio, { processedPath: 'a.wav', tempFile: null });
});

test('audio is left alone when conversion is off', async () => {
  const audio = await prepareAudio('a.mp3', { autoConvert: false });

  assert.deepEqual(audio, { processedPath: 'a.mp3', tempFile: null });
});
