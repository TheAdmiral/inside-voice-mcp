import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assembleTranscriptions, formatOutput } from '../src/utils/transcription-assembler.js';

const chunk = (chunkIndex, startOffset, text, segments) => ({
  chunkIndex,
  startOffset,
  result: { text, segments, model_used: 'tiny.en', processing_time: 100, language: 'en' },
});

test('adds the chunk offset to segment times', () => {
  const result = assembleTranscriptions([
    chunk(0, 0, 'First.', [{ start: 0, end: 5, text: 'First.' }]),
    chunk(1, 50, 'Second.', [{ start: 20, end: 25, text: 'Second.' }]),
  ]);

  assert.deepEqual(result.segments, [
    { start: 0, end: 5, text: 'First.' },
    { start: 70, end: 75, text: 'Second.' },
  ]);
});

test('joins the text of several chunks in order and sums the processing time', () => {
  const result = assembleTranscriptions([chunk(1, 50, 'Second.'), chunk(0, 0, 'First.')]);

  assert.equal(result.text, 'First. Second.');
  assert.equal(result.processing_time, 200);
  assert.equal(result.model_used, 'tiny.en');
});

test("does not reorder the caller's array", () => {
  const chunks = [chunk(1, 50, 'Second.'), chunk(0, 0, 'First.')];
  assembleTranscriptions(chunks);

  assert.equal(chunks[0].chunkIndex, 1);
});

test('a single chunk is returned unchanged', () => {
  const only = chunk(0, 0, 'Only.');

  assert.equal(assembleTranscriptions([only]), only.result);
});

test('no chunks gives an empty result', () => {
  assert.equal(assembleTranscriptions([]).text, '');
});

test('leaves segments out when timestamps are not wanted', () => {
  const result = assembleTranscriptions(
    [
      chunk(0, 0, 'A.', [{ start: 0, end: 1, text: 'A.' }]),
      chunk(1, 10, 'B.', [{ start: 0, end: 1, text: 'B.' }]),
    ],
    { preserveTimestamps: false },
  );

  assert.equal(result.segments, undefined);
});

test('formats output per format', () => {
  const result = {
    text: 'Hello world.',
    segments: [{ start: 0, end: 2, text: 'Hello world.' }],
    model_used: 'tiny.en',
    processing_time: 1,
  };

  assert.equal(formatOutput(result, 'txt'), 'Hello world.');
  assert.equal(formatOutput(result, 'csv'), 'Hello world.');
  assert.equal(
    formatOutput(result, 'vtt'),
    'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello world.\n\n',
  );
  assert.equal(formatOutput(result, 'srt'), '1\n00:00:00,000 --> 00:00:02,000\nHello world.\n\n');
  assert.deepEqual(JSON.parse(formatOutput(result, 'json')), result);
});

test('formats output without segments', () => {
  const result = { text: 'Hello.', model_used: 'tiny.en', processing_time: 1 };

  assert.equal(formatOutput(result, 'vtt'), 'WEBVTT\n\nHello.');
  assert.equal(formatOutput(result, 'srt'), 'Hello.');
});
