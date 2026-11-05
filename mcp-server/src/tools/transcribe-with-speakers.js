import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { z } from 'zod';
import { transcribe } from '../whisper/integration.js';
import {
  checkFfmpegInstallation,
  convertToWav,
  isWhisperCompatible,
} from '../utils/audio-converter.js';
import {
  DiarizationError,
  findDiarizationPython,
  runDiarization,
} from '../utils/diarization-python.js';
import {
  alignTranscriptionWithSpeakers,
  formatSpeakerSegments,
} from '../utils/diarization-alignment.js';
import { DiarizationOptionsSchema } from '../schemas.js';
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
  SETUP_ERROR:
    '\n\nSetup Help:\n- Install Python: brew install python3\n- Install dependencies: pip install torch torchaudio pyannote.audio\n- Set HF_TOKEN environment variable for Pyannote models',
  INPUT_ERROR: '\n\nPlease check that the audio file exists and is accessible.',
  PROCESSING_ERROR:
    '\n\nThis may be due to audio format issues or model loading problems. Try with a different audio file or check your Python environment.',
};

async function handler({ audio_file_path, options, auto_convert }) {
  const startTime = Date.now();
  let tempFile = null;

  try {
    if (!existsSync(audio_file_path)) {
      throw new DiarizationError('INPUT_ERROR', `Audio file not found: ${audio_file_path}`);
    }

    const python = await findDiarizationPython();
    if (!python) {
      throw new DiarizationError(
        'SETUP_ERROR',
        'Speaker diarization requires Python with PyTorch and pyannote.audio. Please install: pip install torch torchaudio pyannote.audio',
      );
    }

    let processedAudioPath = audio_file_path;

    if (auto_convert && !isWhisperCompatible(audio_file_path)) {
      if (!(await checkFfmpegInstallation())) {
        throw new DiarizationError(
          'SETUP_ERROR',
          'ffmpeg is required for audio format conversion. Install with: brew install ffmpeg',
        );
      }

      tempFile = await convertToWav(audio_file_path);
      processedAudioPath = tempFile;
    }

    console.error('[Diarization] Running whisper.cpp transcription...');
    // Alignment needs segment timestamps, so always ask whisper for JSON.
    const transcription = await transcribe(processedAudioPath, {
      model: options.whisper_model,
      output_format: 'json',
      word_timestamps: true,
      language: 'auto',
      temperature: 0,
      threads: 4,
      translate: false,
      max_len: 0,
      split_on_word: false,
    });

    console.error('[Diarization] Running speaker diarization...');
    const diarizationSegments = await runDiarization(python, {
      audioPath: processedAudioPath,
      model: options.model,
      minSpeakers: options.min_speakers,
      maxSpeakers: options.max_speakers,
    });

    console.error('[Diarization] Aligning transcription with speakers...');
    const speakerSegments = alignTranscriptionWithSpeakers(transcription, diarizationSegments);
    const speakers = [...new Set(speakerSegments.map((segment) => segment.speaker))];
    const processingTime = Date.now() - startTime;

    console.error(
      `[Diarization] Completed in ${processingTime}ms. Found ${speakers.length} speakers.`,
    );

    if (options.output_format !== 'json') {
      return textResult(formatSpeakerSegments(speakerSegments, options.output_format));
    }

    return jsonResult({
      segments: speakerSegments,
      speakers,
      metadata: {
        whisper_model: options.whisper_model,
        diarization_model: options.model,
        processing_time: processingTime,
        num_speakers: speakers.length,
        device_used: options.use_mps ? 'mps' : 'cpu',
      },
    });
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
