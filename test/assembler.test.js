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
  assert.equal(formatOutput(result, 'csv'), 'start,end,text\n0,2000,"Hello world."\n');
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

test('keeps one copy of the overlap, cutting at its midpoint', () => {
  const result = assembleTranscriptions(
    [
      chunk(0, 0, 'A B C', [
        { start: 0, end: 48, text: 'A' },
        { start: 52, end: 54, text: 'B' },
        { start: 56, end: 60, text: 'C (cut off)' },
      ]),
      chunk(1, 50, 'B C D', [
        { start: 2, end: 4, text: 'B' },
        { start: 6, end: 9, text: 'C' },
        { start: 12, end: 15, text: 'D' },
      ]),
    ],
    { overlapSeconds: 10 },
  );

  assert.deepEqual(result.segments, [
    { start: 0, end: 48, text: 'A' },
    { start: 52, end: 54, text: 'B' },
    { start: 56, end: 59, text: 'C' },
    { start: 62, end: 65, text: 'D' },
  ]);
  assert.equal(result.text, 'A B C D');
});

test('trims a cue that runs into the next chunk', () => {
  const result = assembleTranscriptions(
    [
      chunk(0, 0, 'A', [{ start: 53, end: 56, text: 'A' }]),
      chunk(1, 50, 'B', [{ start: 5.5, end: 8, text: 'B' }]),
    ],
    { overlapSeconds: 10 },
  );

  assert.deepEqual(result.segments, [
    { start: 53, end: 55.5, text: 'A' },
    { start: 55.5, end: 58, text: 'B' },
  ]);
});
