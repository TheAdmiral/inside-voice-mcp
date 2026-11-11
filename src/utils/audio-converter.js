import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { runCommand } from './run-command.js';

// afconvert comes with macOS and reads MP3, M4A, AAC, Opus, Ogg, FLAC, AIFF and more.
const AFCONVERT_BINARY = '/usr/bin/afconvert';
// ffmpeg is optional, for the formats afconvert cannot read, such as WMA and video files.
const FFMPEG_BINARY = 'ffmpeg';
const WHISPER_NATIVE_EXTENSIONS = ['.wav', '.flac'];

/**
 * Converts audio to WAV if whisper cannot read it directly and `autoConvert` is on.
 * @returns {Promise<{ processedPath: string, tempFile: string | null }>} `processedPath` is the
 *   file to transcribe, and `tempFile` is a converted file for the caller to remove afterwards.
 */
export async function prepareAudio(audioPath, { autoConvert }) {
  if (!autoConvert || isWhisperCompatible(audioPath)) {
    return { processedPath: audioPath, tempFile: null };
  }

  const wavPath = await convertToWav(audioPath);

  return { processedPath: wavPath, tempFile: wavPath };
}

/** Returns the error output if afconvert could not convert the file, or null if it did. */
async function convertWithAfconvert(inputPath, outputPath) {
  // WAVE file, 16-bit little-endian samples at 16 kHz, in one channel.
  const args = ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', inputPath, outputPath];

  const result = await runCommand(AFCONVERT_BINARY, args);
  if (result.exitCode === 0) {
    return null;
  }

  return result.stderr.trim() || `afconvert exited with code ${result.exitCode}`;
}

/** Returns the error output if ffmpeg could not convert the file, or null if it did. */
async function convertWithFfmpeg(inputPath, outputPath) {
  const args = [
    '-i',
    inputPath,
    '-acodec',
    'pcm_s16le',
    '-ar',
    '16000',
    '-ac',
    '1',
    '-f',
    'wav',
    '-y',
    outputPath,
  ];

  const result = await runCommand(FFMPEG_BINARY, args);
  if (result.exitCode === 0) {
    return null;
  }

  return result.stderr.trim() || `ffmpeg exited with code ${result.exitCode}`;
}

async function isFfmpegInstalled() {
  try {
    const result = await runCommand(FFMPEG_BINARY, ['-version']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Converts audio to 16 kHz mono WAV in the temp directory and returns its path.
 * Uses afconvert, and ffmpeg if it is installed and afconvert cannot read the file.
 */
export async function convertToWav(inputPath) {
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const outputPath = join(tmpdir(), `${basename(inputPath, extname(inputPath))}_${Date.now()}.wav`);

  const afconvertError = await convertWithAfconvert(inputPath, outputPath);
  if (afconvertError === null) {
    return outputPath;
  }

  // afconvert can leave a partly written file behind.
  await rm(outputPath, { force: true });

  if (!(await isFfmpegInstalled())) {
    throw new Error(
      `Audio conversion failed: macOS could not read this file (${afconvertError}). ` +
        'For other formats, install ffmpeg with: brew install ffmpeg',
    );
  }

  console.error('[Audio] afconvert could not read the file, so trying ffmpeg');
  const ffmpegError = await convertWithFfmpeg(inputPath, outputPath);
  if (ffmpegError !== null) {
    await rm(outputPath, { force: true });
    throw new Error(`Audio conversion failed: ${ffmpegError}`);
  }

  return outputPath;
}

export function isWhisperCompatible(audioPath) {
  return WHISPER_NATIVE_EXTENSIONS.includes(extname(audioPath).toLowerCase());
}
