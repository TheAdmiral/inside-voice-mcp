import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { runCommand } from './run-command.js';

const FFMPEG_BINARY = 'ffmpeg';
const WHISPER_NATIVE_EXTENSIONS = ['.wav', '.flac'];

export async function checkFfmpegInstallation() {
  try {
    const result = await runCommand(FFMPEG_BINARY, ['-version']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function requireFfmpeg() {
  const installed = await checkFfmpegInstallation();
  if (!installed) {
    throw new Error(
      'ffmpeg is required for audio format conversion. Install with: brew install ffmpeg',
    );
  }
}

/**
 * Converts audio to WAV if whisper cannot read it directly and `autoConvert` is on.
 * @returns {Promise<{ processedPath: string, tempFile: string | null }>} `processedPath` is the
 *   file to transcribe, and `tempFile` is a converted file for the caller to remove afterwards.
 */
export async function prepareAudio(audioPath, { autoConvert }) {
  if (!autoConvert || isWhisperCompatible(audioPath)) {
    return { processedPath: audioPath, tempFile: null };
  }

  await requireFfmpeg();
  const wavPath = await convertToWav(audioPath);

  return { processedPath: wavPath, tempFile: wavPath };
}

/** Converts any audio file to 16 kHz mono WAV in the temp directory and returns its path. */
export async function convertToWav(inputPath) {
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const outputPath = join(tmpdir(), `${basename(inputPath, extname(inputPath))}_${Date.now()}.wav`);
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
  if (result.exitCode !== 0) {
    throw new Error(`Audio conversion failed: ${result.stderr}`);
  }

  return outputPath;
}

export function isWhisperCompatible(audioPath) {
  return WHISPER_NATIVE_EXTENSIONS.includes(extname(audioPath).toLowerCase());
}
