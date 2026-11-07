import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isWhisperCompatible, planChunks, prepareAudio } from '../src/utils/audio-converter.js';

test('short audio is a single chunk', () => {
  assert.deepEqual(planChunks(40, 600, 30), [{ start: 0, duration: 40 }]);
});

test('audio exactly as long as one chunk is a single chunk', () => {
  assert.deepEqual(planChunks(600, 600, 30), [{ start: 0, duration: 600 }]);
});

test('chunks overlap, including the first two', () => {
  assert.deepEqual(planChunks(1000, 600, 30), [
    { start: 0, duration: 600 },
    { start: 570, duration: 430 },
  ]);
});

test('an exact multiple of the step does not add an empty chunk', () => {
  assert.deepEqual(planChunks(1140, 600, 60), [
    { start: 0, duration: 600 },
    { start: 540, duration: 600 },
  ]);
});

test('the final chunk is partial', () => {
  const chunks = planChunks(170, 60, 10);

  assert.deepEqual(chunks, [
    { start: 0, duration: 60 },
    { start: 50, duration: 60 },
    { start: 100, duration: 60 },
    { start: 150, duration: 20 },
  ]);
});

test('every second of audio is covered', () => {
  const chunks = planChunks(3725, 600, 30);
  const last = chunks.at(-1);

  assert.equal(last.start + last.duration, 3725);
});

test('overlap that is not shorter than the chunk throws', () => {
  assert.throws(() => planChunks(1000, 60, 60), /overlap_seconds must be shorter/);
  assert.throws(() => planChunks(1000, 60, 120), /overlap_seconds must be shorter/);
});

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
