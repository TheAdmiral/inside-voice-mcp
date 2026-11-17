import { z } from 'zod';
import { DEFAULT_MODEL, MODEL_NAME_PATTERN, REGULAR_MODEL_NAMES } from './models.js';
import { errors, optionDescriptions } from './strings.js';

const RegularModel = z.enum(REGULAR_MODEL_NAMES);

// Advanced models work too once they are installed, so accept any name that is safe to use
// as a file name. Transcription then checks that the model is installed.
const AdvancedModel = z.string().regex(MODEL_NAME_PATTERN, errors.invalidModelNameCharacters);

export const WhisperModel = z.union([RegularModel, AdvancedModel]);

export const OutputFormat = z.enum(['txt', 'vtt', 'srt', 'json', 'csv']);

export const TranscribeOptionsSchema = z
  .object({
    model: WhisperModel.default(DEFAULT_MODEL).describe(optionDescriptions.model),
    language: z.string().default('auto'),
    output_format: OutputFormat.default('txt'),
    temperature: z.number().min(0).max(1).default(0),
    threads: z.number().min(1).max(16).default(4),
    word_timestamps: z.boolean().default(false),
    max_len: z.number().min(0).default(0),
    split_on_word: z.boolean().default(false),
    vad: z.boolean().optional().describe(optionDescriptions.vad),
    vocabulary: z
      .array(z.string().trim().min(1))
      .default([])
      .describe(optionDescriptions.vocabulary),
    diarize: z.boolean().default(false).describe(optionDescriptions.diarize),
    min_speakers: z.number().min(1).default(1).describe(optionDescriptions.minSpeakers),
    max_speakers: z.number().min(1).default(10).describe(optionDescriptions.maxSpeakers),
    use_mps: z.boolean().default(true).describe(optionDescriptions.useMps),
  })
  .refine((options) => options.min_speakers <= options.max_speakers, {
    message: errors.minSpeakersAboveMax,
    path: ['min_speakers'],
  });
