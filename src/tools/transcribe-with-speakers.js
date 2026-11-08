import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
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
import { DiarizationOptionsSchema, TranscribeOptionsSchema } from '../schemas.js';
import { jsonResult, textResult } from './tool-result.js';

const argsSchema = z.object({
  audio_file_path: z
    .string()
    .describe('Path to the audio file to transcribe with speaker diarization'),
  options: DiarizationOptionsSchema.prefault({}).describe('Diarization and transcription options'),
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
    '- Install Python: brew install python3',
    '- Install dependencies: pip install -r python/requirements.txt',
    '- Store your HuggingFace token for Pyannote models: npm run setup:token',
  ].join('\n'),
  INPUT_ERROR: '\n\nPlease check that the audio file exists and is accessible.',
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
    throw new DiarizationError(
      'SETUP_ERROR',
      'Speaker diarization requires Python with PyTorch and pyannote.audio.',
    );
  }

  return python;
}

function transcribeForAlignment(audioPath, whisperModel) {
  // Alignment needs segment timestamps, so always ask whisper for JSON.
  const transcribeOptions = TranscribeOptionsSchema.parse({
    model: whisperModel,
    output_format: 'json',
  });

  return transcribe(audioPath, transcribeOptions);
}

function buildResult(speakerSegments, device, options, processingTime) {
  if (options.output_format !== 'json') {
    return textResult(formatSpeakerSegments(speakerSegments, options.output_format));
  }

  const speakers = [...new Set(speakerSegments.map((segment) => segment.speaker))];

  return jsonResult({
    segments: speakerSegments,
    speakers,
    metadata: {
      whisper_model: options.whisper_model,
      diarization_model: options.model,
      processing_time: processingTime,
      num_speakers: speakers.length,
      device_used: device,
    },
  });
}

async function handler({ audio_file_path, options, auto_convert }) {
  const startTime = Date.now();
  let tempFile = null;

  try {
    if (!existsSync(audio_file_path)) {
      throw new DiarizationError('INPUT_ERROR', `Audio file not found: ${audio_file_path}`);
    }

    const python = await findPythonOrThrow();

    const audio = await prepareAudio(audio_file_path, { autoConvert: auto_convert });
    tempFile = audio.tempFile;

    console.error('[Diarization] Running whisper.cpp transcription...');
    const transcription = await transcribeForAlignment(audio.processedPath, options.whisper_model);

    console.error('[Diarization] Running speaker diarization...');
    const diarization = await runDiarization(python, {
      audioPath: audio.processedPath,
      model: options.model,
      minSpeakers: options.min_speakers,
      maxSpeakers: options.max_speakers,
      useMps: options.use_mps,
    });

    console.error('[Diarization] Aligning transcription with speakers...');
    const speakerSegments = alignTranscriptionWithSpeakers(transcription, diarization.segments);
    const processingTime = Date.now() - startTime;

    console.error(`[Diarization] Completed in ${processingTime}ms.`);

    return buildResult(speakerSegments, diarization.device, options, processingTime);
  } catch (error) {
    console.error(`[Diarization] Failed: ${error.message}`);
    const helpText = error instanceof DiarizationError ? HELP_TEXT[error.code] : '';
    throw new Error(`Speaker diarization failed: ${error.message}${helpText}`);
  } finally {
    if (tempFile) {
      await rm(tempFile, { force: true });
    }
  }
}

export const transcribeWithSpeakersTool = {
  name: 'transcribe_with_speakers',
  description:
    'Transcribe audio with speaker identification using whisper.cpp + diarization models',
  argsSchema,
  handler,
};
