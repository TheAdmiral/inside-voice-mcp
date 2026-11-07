import { rm } from 'node:fs/promises';
import { z } from 'zod';
import { transcribe } from '../whisper.js';
import { prepareAudio } from '../utils/audio-converter.js';
import { TranscribeOptionsSchema } from '../schemas.js';
import { jsonResult } from './tool-result.js';

const argsSchema = z.object({
  audio_path: z.string().describe('Path to the audio file to transcribe'),
  options: TranscribeOptionsSchema.prefault({}).describe('Transcription options'),
  auto_convert: z
    .boolean()
    .default(true)
    .describe('Automatically convert unsupported formats to WAV'),
});

async function handler({ audio_path, options, auto_convert }) {
  let tempFile = null;

  try {
    const audio = await prepareAudio(audio_path, { autoConvert: auto_convert });
    tempFile = audio.tempFile;

    const result = await transcribe(audio.processedPath, options);

    return jsonResult({
      transcription: result.text,
      metadata: {
        model_used: result.model_used,
        language: result.language,
        processing_time: result.processing_time,
        segments: result.segments,
        format_converted: tempFile !== null,
        original_format: audio_path.split('.').pop().toLowerCase(),
      },
    });
  } catch (error) {
    throw new Error(`Transcription failed: ${error.message}`);
  } finally {
    if (tempFile) {
      await rm(tempFile, { force: true });
    }
  }
}

export const transcribeTool = {
  name: 'transcribe',
  description: 'Transcribe audio file to text using whisper.cpp with automatic format conversion',
  argsSchema,
  handler,
};
