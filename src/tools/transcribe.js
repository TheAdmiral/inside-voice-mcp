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
import { errors, logs, optionDescriptions, toolDescriptions } from '../strings.js';
import { jsonResult } from './tool-result.js';

const argsSchema = z.object({
  audio_path: z.string().describe(optionDescriptions.audioPath),
  options: TranscribeOptionsSchema.prefault({}).describe(optionDescriptions.options),
  auto_convert: z.boolean().default(true).describe(optionDescriptions.autoConvert),
});

const HELP_TEXT = {
  SETUP_ERROR: errors.diarizationSetupHelp,
  PROCESSING_ERROR: errors.diarizationProcessingHelp,
};

async function findPythonOrThrow() {
  const python = await findDiarizationPython();

  if (!python) {
    throw new DiarizationError('SETUP_ERROR', errors.uvNeeded);
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

// Transcription and diarization run one after the other on purpose. Running them at the same
// time was tested and was no faster, because both compete for the GPU and memory.
async function transcribeWithSpeakers(audioPath, options, python) {
  const startTime = Date.now();

  // Alignment needs segment times, and only whisper's JSON output has them for every format.
  const transcription = await transcribe(audioPath, { ...options, output_format: 'json' });

  console.error(logs.diarizationStarting);
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
      throw new Error(errors.audioFileNotFound(audio_path));
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
    throw new Error(errors.transcriptionFailed(error.message, helpText));
  } finally {
    if (tempFile) {
      await rm(tempFile, { force: true });
    }
  }
}

export const transcribeTool = {
  name: 'transcribe',
  description: toolDescriptions.transcribe,
  argsSchema,
  handler,
};
