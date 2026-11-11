import { z } from 'zod';
import { DEFAULT_MODEL, MODEL_NAME_PATTERN, REGULAR_MODEL_NAMES } from './models.js';

const RegularModel = z.enum(REGULAR_MODEL_NAMES);

// Advanced models work too once they are installed, so accept any name that is safe to use
// as a file name. Transcription then checks that the model is installed.
const AdvancedModel = z
  .string()
  .regex(
    MODEL_NAME_PATTERN,
    'Model names can only contain letters, numbers, dots, dashes and underscores',
  );

export const WhisperModel = z.union([RegularModel, AdvancedModel]);

export const OutputFormat = z.enum(['txt', 'vtt', 'srt', 'json', 'csv']);

export const TranscribeOptionsSchema = z
  .object({
    model: WhisperModel.default(DEFAULT_MODEL).describe(
      'Model to use. Advanced models also work once installed. list_models shows what is installed',
    ),
    language: z.string().default('auto'),
    output_format: OutputFormat.default('txt'),
    temperature: z.number().min(0).max(1).default(0),
    threads: z.number().min(1).max(16).default(4),
    word_timestamps: z.boolean().default(false),
    max_len: z.number().min(0).default(0),
    split_on_word: z.boolean().default(false),
    vad: z
      .boolean()
      .optional()
      .describe(
        'Skip the parts without speech, which is faster and avoids made-up text in silences. ' +
          'Used by default when the VAD model is installed',
      ),
    vocabulary: z
      .array(z.string().trim().min(1))
      .default([])
      .describe(
        'Names and terms to spell correctly, such as company or product names. ' +
          'whisper is more likely to write them this way, but it is not guaranteed',
      ),
    diarize: z.boolean().default(false).describe('Identify who is speaking in each segment'),
    min_speakers: z.number().min(1).default(1).describe('Fewest speakers to look for'),
    max_speakers: z.number().min(1).default(10).describe('Most speakers to look for'),
    use_mps: z
      .boolean()
      .default(true)
      .describe('Use MPS acceleration on Apple Silicon when identifying speakers'),
  })
  .refine((options) => options.min_speakers <= options.max_speakers, {
    message: 'min_speakers cannot be greater than max_speakers',
    path: ['min_speakers'],
  });
