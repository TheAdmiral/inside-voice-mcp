import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCsv, formatSrt, formatTimestamp, formatVtt } from '../src/utils/subtitles.js';

const cues = [
  { start: 0, end: 1.5, text: 'Hello' },
  { start: 61.25, end: 3725.5, text: 'World' },
];

test('formats timestamps with the given separator', () => {
  assert.equal(formatTimestamp(0), '00:00:00.000');
  assert.equal(formatTimestamp(1.5, ','), '00:00:01,500');
  assert.equal(formatTimestamp(61.25), '00:01:01.250');
});

test('formats timestamps over one hour', () => {
  assert.equal(formatTimestamp(3725.5), '01:02:05.500');
  assert.equal(formatTimestamp(36000), '10:00:00.000');
});

test('formats VTT exactly', () => {
  assert.equal(
    formatVtt(cues),
    'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.500\nHello\n\n2\n00:01:01.250 --> 01:02:05.500\nWorld\n\n',
  );
});

test('formats SRT exactly', () => {
  assert.equal(
    formatSrt(cues),
    '1\n00:00:00,000 --> 00:00:01,500\nHello\n\n2\n00:01:01,250 --> 01:02:05,500\nWorld\n\n',
  );
});

test('no cues gives only the header for VTT and nothing for SRT', () => {
  assert.equal(formatVtt([]), 'WEBVTT\n\n');
  assert.equal(formatSrt([]), '');
});

test('formats CSV with millisecond times and quoted text', () => {
  const csv = formatCsv([
    { start: 0, end: 3.92, text: 'Hello, everyone' },
    { start: 3.92, end: 8.48, text: 'She said "hi"' },
  ]);

  assert.equal(csv, 'start,end,text\n0,3920,"Hello, everyone"\n3920,8480,"She said ""hi"""\n');
});

test('timestamps survive floating point rounding', () => {
  assert.equal(formatTimestamp(3.92, ','), '00:00:03,920');
  assert.equal(formatTimestamp(59.9996), '00:01:00.000');
});
