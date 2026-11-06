import { rm } from 'node:fs/promises';
import { z } from 'zod';
import { transcribe } from '../whisper/integration.js';
import {
  checkFfmpegInstallation,
  convertToWav,
  getAudioInfo,
  isWhisperCompatible,
  splitAudio,
} from '../utils/audio-converter.js';
import { assembleTranscriptions, formatOutput } from '../utils/transcription-assembler.js';
import { TranscribeOptionsSchema } from '../schemas.js';
import { jsonResult } from './tool-result.js';

const argsSchema = z.object({
  audio_path: z.string().describe('Path to the audio file to transcribe'),
  options: TranscribeOptionsSchema.prefault({}).describe('Transcription options'),
  chunk_duration_minutes: z
    .number()
    .min(1)
    .max(30)
    .default(10)
    .describe('Duration of each chunk in minutes'),
  overlap_seconds: z
    .number()
    .min(0)
    .max(120)
    .default(30)
    .describe('Overlap between chunks in seconds'),
  auto_cleanup: z.boolean().default(true).describe('Automatically clean up temporary files'),
  progress_callback: z.boolean().default(true).describe('Report progress during transcription'),
});

async function handler(args) {
  const { audio_path, options, chunk_duration_minutes, overlap_seconds, auto_cleanup } = args;
  const progress = args.progress_callback ? (message) => console.error(message) : () => {};
  const tempFiles = [];

  try {
    if (!(await checkFfmpegInstallation())) {
      throw new Error(
        'ffmpeg is required for audio format conversion. Install with: brew install ffmpeg',
      );
    }

    const audioInfo = await getAudioInfo(audio_path);
    progress(`Audio duration: ${Math.ceil(audioInfo.duration / 60)} minutes`);

    let processedAudioPath = audio_path;
    if (!isWhisperCompatible(audio_path)) {
      progress('Converting audio to WAV format...');
      processedAudioPath = await convertToWav(audio_path);
      tempFiles.push(processedAudioPath);
    }

    const chunks = await splitAudio(
      processedAudioPath,
      audioInfo.duration,
      chunk_duration_minutes * 60,
      overlap_seconds,
    );
    tempFiles.push(
      ...chunks.map((chunk) => chunk.path).filter((path) => path !== processedAudioPath),
    );

    // Every format is built from the joined segments, and only JSON output has them.
    const chunkOptions = { ...options, output_format: 'json' };

    const chunkTranscriptions = [];

    for (const [index, chunk] of chunks.entries()) {
      progress(`Transcribing chunk ${index + 1}/${chunks.length}...`);

      try {
        const result = await transcribe(chunk.path, chunkOptions);
        chunkTranscriptions.push({ chunkIndex: index, startOffset: chunk.start, result });
      } catch (error) {
        throw new Error(`Failed to transcribe chunk ${index + 1}: ${error.message}`);
      }
    }

    const assembledResult = assembleTranscriptions(chunkTranscriptions, {
      overlapSeconds: overlap_seconds,
      removeOverlapDuplicates: true,
    });

    progress('Transcription completed successfully!');

    return jsonResult({
      transcription: formatOutput(assembledResult, options.output_format),
      metadata: {
        model_used: assembledResult.model_used,
        language: assembledResult.language,
        processing_time: assembledResult.processing_time,
        total_chunks: chunks.length,
        audio_duration_seconds: audioInfo.duration,
        audio_format: audioInfo.format,
        chunk_duration_minutes,
        overlap_seconds,
        segments_count: assembledResult.segments?.length ?? 0,
        segments: options.word_timestamps ? assembledResult.segments : undefined,
        temp_files_created: tempFiles.length,
        temp_files_cleaned: auto_cleanup,
      },
    });
  } catch (error) {
    throw new Error(`Long transcription failed: ${error.message}`);
  } finally {
    if (auto_cleanup) {
      await Promise.all(tempFiles.map((file) => rm(file, { force: true })));
    }
  }
}

export const transcribeLongTool = {
  name: 'transcribe_long',
  description:
    'Transcribe long audio files with automatic splitting, format conversion, and context preservation',
  argsSchema,
  handler,
};
