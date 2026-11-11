import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { extname } from 'node:path';
import { z } from 'zod';
import { transcribe } from '../whisper.js';
import { prepareAudio } from '../utils/audio-converter.js';
import {
  DiarizationError,
  findDiarizationPython,
  runDiarization,
} from '../utils/diarization-python.js';
import {
  alignTranscriptionWithSpeakers,
  formatSpeakerSegments,
} from '../utils/diarization-alignment.js';
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

const HELP_TEXT = {
  SETUP_ERROR: [
    '',
    '',
    'Setup Help:',
    '- Follow the Speaker Diarization Setup section of the README',
    '- Store your HuggingFace token for Pyannote models: inside-voice-mcp setup-token',
  ].join('\n'),
  PROCESSING_ERROR: [
    '',
    '',
    'This may be due to audio format issues or model loading problems.',
    'Try with a different audio file or check your Python environment.',
  ].join('\n'),
};

async function findPythonOrThrow() {
  const python = await findDiarizationPython();

  if (!python) {
    throw new DiarizationError('SETUP_ERROR', 'Speaker diarization requires uv (brew install uv).');
  }

  return python;
}

async function transcribeWithoutSpeakers(audioPath, options) {
  const result = await transcribe(audioPath, options);

  return {
    text: result.text,
    metadata: {
      model_used: result.model_used,
      language: result.language,
      vad_used: result.vad_used,
      warnings: result.warnings,
      processing_time: result.processing_time,
      segments: result.segments,
    },
  };
}

async function transcribeWithSpeakers(audioPath, options, python) {
  const startTime = Date.now();

  // Alignment needs segment times, and only whisper's JSON output has them for every format.
  const transcription = await transcribe(audioPath, { ...options, output_format: 'json' });

  console.error('[Diarization] Running speaker diarization...');
  const diarization = await runDiarization(python, {
    audioPath,
    minSpeakers: options.min_speakers,
    maxSpeakers: options.max_speakers,
    useMps: options.use_mps,
  });

  const segments = alignTranscriptionWithSpeakers(transcription, diarization.segments);
  const includeSegments = options.output_format === 'json' || options.word_timestamps;

  return {
    text: formatSpeakerSegments(segments, options.output_format).trim(),
    metadata: {
      model_used: transcription.model_used,
      language: transcription.language,
      vad_used: transcription.vad_used,
      warnings: transcription.warnings,
      processing_time: Date.now() - startTime,
      segments: includeSegments ? segments : undefined,
      speakers: [...new Set(segments.map((segment) => segment.speaker))],
      diarization_device: diarization.device,
    },
  };
}

async function handler({ audio_path, options, auto_convert }) {
  let tempFile = null;

  try {
    if (!existsSync(audio_path)) {
      throw new Error(`Audio file not found: ${audio_path}`);
    }

    // Checked first, so that a missing setup fails before any time is spent transcribing.
    const python = options.diarize ? await findPythonOrThrow() : null;

    const audio = await prepareAudio(audio_path, { autoConvert: auto_convert });
    tempFile = audio.tempFile;

    const output = options.diarize
      ? await transcribeWithSpeakers(audio.processedPath, options, python)
      : await transcribeWithoutSpeakers(audio.processedPath, options);

    return jsonResult({
      transcription: output.text,
      metadata: {
        ...output.metadata,
        format_converted: tempFile !== null,
        // An empty string when the file has no extension.
        original_format: extname(audio_path).slice(1).toLowerCase(),
      },
    });
  } catch (error) {
    const helpText = error instanceof DiarizationError ? HELP_TEXT[error.code] : '';
    throw new Error(`Transcription failed: ${error.message}${helpText}`);
  } finally {
    if (tempFile) {
      await rm(tempFile, { force: true });
    }
  }
}

export const transcribeTool = {
  name: 'transcribe',
  description:
    'Transcribe an audio file of any length to text using whisper.cpp, with automatic format ' +
    'conversion and optional speaker identification',
  argsSchema,
  handler,
};
