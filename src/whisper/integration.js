import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../utils/run-command.js';

const WHISPER_BINARY = 'whisper-cli';

const OUTPUT_FORMAT_FLAGS = {
  txt: '--output-txt',
  vtt: '--output-vtt',
  srt: '--output-srt',
  json: '--output-json',
  csv: '--output-csv',
};

/**
 * @typedef {{ start: number, end: number, text: string }} Segment
 * @typedef {{ text: string, segments?: Segment[], language?: string, model_used: string,
 *   processing_time: number }} TranscriptionResult
 */

/** Returns the directory whisper models are stored in. */
export function getModelsDir() {
  return process.env.WHISPER_MODELS_PATH || join(homedir(), '.inside-voice-mcp', 'models');
}

/**
 * @param {string} audioPath
 * @param {object} options Validated options, see TranscribeOptionsSchema in schemas.js.
 * @returns {Promise<TranscriptionResult>}
 */
export async function transcribe(audioPath, options) {
  const startTime = Date.now();

  if (!existsSync(audioPath)) {
    throw new Error(`Audio file error: ${audioPath} - File does not exist`);
  }

  const modelsDir = getModelsDir();
  const modelPath = join(modelsDir, `ggml-${options.model}.bin`);
  if (!existsSync(modelPath)) {
    throw new Error(`Model '${options.model}' not found in ${modelsDir}`);
  }

  // whisper-cli writes its output files to disk, so keep them away from the user's audio.
  const outputDir = await mkdtemp(join(tmpdir(), 'inside-voice-whisper-'));
  const outputBase = join(outputDir, 'output');

  try {
    const args = buildWhisperArgs(audioPath, modelPath, outputBase, options);
    console.error(`[Whisper] Executing: ${WHISPER_BINARY} ${args.join(' ')}`);

    const result = await runCommand(WHISPER_BINARY, args);
    if (result.exitCode !== 0) {
      throw new Error(`Whisper process failed: ${result.stderr}`);
    }

    const output = await readWhisperOutput(outputBase, result.stdout, options);

    return {
      ...output,
      model_used: options.model,
      processing_time: Date.now() - startTime,
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

export function getAvailableModels() {
  const modelsDir = getModelsDir();
  if (!existsSync(modelsDir)) {
    return [];
  }

  return readdirSync(modelsDir)
    .filter((file) => file.endsWith('.bin'))
    .map((file) => file.replace('ggml-', '').replace('.bin', ''));
}

export async function checkInstallation() {
  try {
    const result = await runCommand(WHISPER_BINARY, ['--help']);
    const installed = result.exitCode === 0;
    return {
      installed,
      version: installed ? 'whisper.cpp' : undefined,
      error: installed ? undefined : result.stderr,
    };
  } catch (error) {
    return { installed: false, error: error.message };
  }
}

/**
 * @param {string} audioPath
 * @param {string} modelPath
 * @param {string} outputBase Output file path without its extension.
 * @param {object} options Validated options, see TranscribeOptionsSchema in schemas.js.
 */
export function buildWhisperArgs(audioPath, modelPath, outputBase, options) {
  const args = [
    '--model',
    modelPath,
    '--file',
    audioPath,
    '--output-file',
    outputBase,
    '--threads',
    String(options.threads),
    '--temperature',
    String(options.temperature),
  ];

  if (options.language !== 'auto') {
    args.push('--language', options.language);
  }

  if (options.translate) {
    args.push('--translate');
  }

  // Word timestamps need the full JSON output, so they override the chosen format.
  if (options.word_timestamps) {
    args.push('--output-json-full');
  } else {
    args.push(OUTPUT_FORMAT_FLAGS[options.output_format]);
  }

  if (options.max_len > 0) {
    args.push('--max-len', String(options.max_len));
  }

  if (options.split_on_word) {
    args.push('--split-on-word');
  }

  args.push('--no-prints');

  return args;
}

/** Converts whisper.cpp JSON output into text and segments, with times in seconds. */
export function parseWhisperJson(json) {
  const entries = json.transcription ?? [];

  const segments = entries
    .filter((entry) => entry.offsets && entry.text)
    .map((entry) => ({
      start: entry.offsets.from / 1000,
      end: entry.offsets.to / 1000,
      text: entry.text.trim(),
    }));

  const text = entries
    .map((entry) => entry.text)
    .join('')
    .trim();

  return { text, segments, language: json.result?.language || 'en' };
}

async function readWhisperOutput(outputBase, stdout, options) {
  const writesJsonFile = options.word_timestamps || options.output_format === 'json';
  if (!writesJsonFile) {
    return { text: stdout.trim(), language: 'en' };
  }

  // whisper-cli writes JSON to the output file, not to stdout.
  const jsonText = await readFile(`${outputBase}.json`, 'utf-8');
  return parseWhisperJson(JSON.parse(jsonText));
}
