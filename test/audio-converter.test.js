import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { convertToWav, isWhisperCompatible, prepareAudio } from '../src/utils/audio-converter.js';

const SAMPLE_WAV = join(import.meta.dirname, 'fixtures', 'sample_meeting_40_seconds.wav');

function makeTempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'inside-voice-audio-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Empties PATH for one test, so ffmpeg cannot be found even if it is installed. */
function hideFfmpeg(t) {
  const originalPath = process.env.PATH;
  process.env.PATH = '';
  t.after(() => {
    process.env.PATH = originalPath;
  });
}

/** Reads the channel count and sample rate from a WAV file's header. */
function readWavFormat(path) {
  const header = readFileSync(path).subarray(0, 44);
  return { channels: header.readUInt16LE(22), sampleRate: header.readUInt32LE(24) };
}

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

test('converts compressed audio to 16 kHz mono WAV without ffmpeg', async (t) => {
  const dir = makeTempDir(t);
  const m4aPath = join(dir, 'sample.m4a');
  execFileSync('/usr/bin/afconvert', ['-f', 'm4af', '-d', 'aac', SAMPLE_WAV, m4aPath]);

  hideFfmpeg(t);
  const wavPath = await convertToWav(m4aPath);
  t.after(() => rmSync(wavPath, { force: true }));

  assert.deepEqual(readWavFormat(wavPath), { channels: 1, sampleRate: 16000 });
});

test('suggests ffmpeg when macOS cannot read the file', async (t) => {
  const dir = makeTempDir(t);
  const unreadablePath = join(dir, 'not-audio.wma');
  writeFileSync(unreadablePath, 'this is not audio');

  hideFfmpeg(t);

  await assert.rejects(convertToWav(unreadablePath), /install ffmpeg with: brew install ffmpeg/);
});
