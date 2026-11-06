import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alignTranscriptionWithSpeakers,
  formatSpeakerSegments,
} from '../src/utils/diarization-alignment.js';

const transcription = (segments) => ({ text: segments.map((s) => s.text).join(' '), segments });

test('assigns each segment to the speaker that overlaps it most', () => {
  const result = alignTranscriptionWithSpeakers(
    transcription([
      { start: 0, end: 4, text: 'Hello.' },
      { start: 5, end: 9, text: 'Hi there.' },
    ]),
    [
      { start: 0, end: 4.5, speaker: 'SPEAKER_00' },
      { start: 4.5, end: 10, speaker: 'SPEAKER_01' },
    ],
  );

  assert.deepEqual(
    result.map((segment) => [segment.speaker, segment.text, segment.confidence]),
    [
      ['speaker00', 'Hello.', 1],
      ['speaker01', 'Hi there.', 1],
    ],
  );
});

test('segments without an overlapping speaker are unknown', () => {
  const result = alignTranscriptionWithSpeakers(
    transcription([{ start: 20, end: 24, text: 'Alone.' }]),
    [{ start: 0, end: 4, speaker: 'SPEAKER_00' }],
  );

  assert.equal(result[0].speaker, 'speaker_unknown');
  assert.equal(result[0].confidence, 0);
});

test('merges neighbouring segments from the same speaker', () => {
  const result = alignTranscriptionWithSpeakers(
    transcription([
      { start: 0, end: 2, text: 'One.' },
      { start: 2.5, end: 4, text: 'Two.' },
      { start: 8, end: 9, text: 'Three.' },
    ]),
    [{ start: 0, end: 10, speaker: 'SPEAKER_00' }],
  );

  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'One. Two.');
  assert.equal(result[0].end, 4);
  assert.equal(result[1].text, 'Three.');
});

test('normalizes speaker labels', () => {
  const align = (speaker) =>
    alignTranscriptionWithSpeakers(transcription([{ start: 0, end: 2, text: 'x' }]), [
      { start: 0, end: 2, speaker },
    ])[0].speaker;

  assert.equal(align('SPEAKER_03'), 'speaker03');
  assert.equal(align('SPEAKER_007'), 'speaker07');
  assert.match(align('alice'), /^speaker(0[1-9]|10)$/);
  assert.equal(align('alice'), align('alice'));
});

test('without segments the whole text is one segment', () => {
  const result = alignTranscriptionWithSpeakers({ text: 'All of it.' }, [
    { start: 0, end: 30, speaker: 'SPEAKER_01' },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].end, 30);
  assert.equal(result[0].text, 'All of it.');
});

test('formats speaker segments', () => {
  const segments = [{ start: 0, end: 1.5, speaker: 'speaker01', text: 'Hi', confidence: 1 }];

  assert.equal(formatSpeakerSegments(segments, 'txt'), '[speaker01]: Hi');
  assert.equal(
    formatSpeakerSegments(segments, 'vtt'),
    'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.500\n<v speaker01>Hi</v>\n\n',
  );
  assert.equal(
    formatSpeakerSegments(segments, 'srt'),
    '1\n00:00:00,000 --> 00:00:01,500\n[speaker01]: Hi\n\n',
  );
  assert.deepEqual(JSON.parse(formatSpeakerSegments(segments, 'json')), segments);
});
