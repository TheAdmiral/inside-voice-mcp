import { z } from 'zod';

export const WhisperModel = z.enum([
  'tiny.en',
  'tiny',
  'base.en',
  'base',
  'small.en',
  'small',
  'medium.en',
  'medium',
  'large-v1',
  'large-v2',
  'large-v3',
  'large-v3-turbo',
]);

export const OutputFormat = z.enum(['txt', 'vtt', 'srt', 'json', 'csv']);

export const DiarizationModel = z.enum(['pyannote']);

export const TranscribeOptionsSchema = z.object({
  model: WhisperModel.default('base.en'),
  language: z.string().default('auto'),
  output_format: OutputFormat.default('txt'),
  temperature: z.number().min(0).max(1).default(0),
  threads: z.number().min(1).max(16).default(4),
  translate: z.boolean().default(false),
  word_timestamps: z.boolean().default(false),
  max_len: z.number().min(0).default(0),
  split_on_word: z.boolean().default(false),
});

export const DiarizationOptionsSchema = z.object({
  model: DiarizationModel.default('pyannote').describe('Speaker diarization model'),
  min_speakers: z.number().min(1).default(1).describe('Minimum number of speakers'),
  max_speakers: z.number().min(1).default(10).describe('Maximum number of speakers'),
  whisper_model: WhisperModel.default('base.en').describe('Whisper model to use'),
  output_format: z.enum(['json', 'txt', 'vtt', 'srt']).default('json').describe('Output format'),
  use_mps: z.boolean().default(true).describe('Use MPS acceleration on Apple Silicon'),
});
