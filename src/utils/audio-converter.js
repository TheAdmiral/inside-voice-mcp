import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
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

export async function requireFfmpeg() {
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

export async function getAudioInfo(audioPath) {
  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const result = await runCommand(FFMPEG_BINARY, ['-i', audioPath, '-f', 'null', '-']);
  const output = result.stderr;

  const formatMatch = output.match(/Input #0, ([^,]+)/);
  const format = formatMatch ? formatMatch[1] : 'unknown';

  const sampleRateMatch = output.match(/(\d+) Hz/);
  const sampleRate = sampleRateMatch ? Number(sampleRateMatch[1]) : 0;

  return {
    duration: parseDuration(output),
    format,
    sampleRate,
    channels: parseChannelCount(output),
  };
}

/** Returns the duration in seconds, from text such as "Duration: 00:01:23.45". */
function parseDuration(ffmpegOutput) {
  const match = ffmpegOutput.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  return hours * 3600 + minutes * 60 + seconds;
}

function parseChannelCount(ffmpegOutput) {
  const match = ffmpegOutput.match(/(mono|stereo|(\d+) channels)/);

  if (!match) {
    return 1;
  }

  if (match[1] === 'stereo') {
    return 2;
  }

  if (match[1] === 'mono') {
    return 1;
  }

  return Number(match[2]);
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

/**
 * Plans where each chunk starts. Every chunk after the first starts `overlapSeconds`
 * before the end of the previous one.
 * @returns {{ start: number, duration: number }[]} Positions in seconds.
 */
export function planChunks(totalSeconds, chunkSeconds, overlapSeconds) {
  if (overlapSeconds >= chunkSeconds) {
    throw new Error('overlap_seconds must be shorter than the chunk duration');
  }

  const chunks = [];
  let start = 0;
  let reachedEnd = false;

  while (!reachedEnd) {
    const duration = Math.min(chunkSeconds, totalSeconds - start);
    chunks.push({ start, duration });

    reachedEnd = start + chunkSeconds >= totalSeconds;
    start += chunkSeconds - overlapSeconds;
  }

  return chunks;
}

/**
 * Splits audio into overlapping chunks in the temp directory.
 * Audio that fits in one chunk is returned as is, without running ffmpeg.
 * @returns {Promise<{ path: string, start: number }[]>} `start` is the chunk's offset in seconds.
 */
export async function splitAudio(inputPath, totalSeconds, chunkSeconds, overlapSeconds) {
  const plan = planChunks(totalSeconds, chunkSeconds, overlapSeconds);
  if (plan.length === 1) {
    return [{ path: inputPath, start: 0 }];
  }

  const extension = extname(inputPath);
  const baseName = basename(inputPath, extension);
  const chunks = [];

  try {
    for (const [index, { start, duration }] of plan.entries()) {
      const chunkPath = join(
        tmpdir(),
        `${baseName}_chunk_${String(index).padStart(3, '0')}${extension}`,
      );
      const args = [
        '-i',
        inputPath,
        '-ss',
        String(start),
        '-t',
        String(duration),
        '-acodec',
        'copy',
        '-y',
        chunkPath,
      ];

      const result = await runCommand(FFMPEG_BINARY, args);
      if (result.exitCode !== 0) {
        throw new Error(`Audio splitting failed at chunk ${index}: ${result.stderr}`);
      }

      chunks.push({ path: chunkPath, start });
    }
  } catch (error) {
    // The caller never receives the chunks made so far, so remove them here.
    await Promise.all(chunks.map((chunk) => rm(chunk.path, { force: true })));
    throw error;
  }

  return chunks;
}

export function isWhisperCompatible(audioPath) {
  return WHISPER_NATIVE_EXTENSIONS.includes(extname(audioPath).toLowerCase());
}
