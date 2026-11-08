import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from './utils/run-command.js';

const WHISPER_BINARY = 'whisper-cli';

const OUTPUT_FORMAT_FLAGS = {
  txt: '--output-txt',
  vtt: '--output-vtt',
  srt: '--output-srt',
  json: '--output-json',
  csv: '--output-csv',
};

/**
 * @typedef {{ start: number, end: number, text: string }} Word
 * @typedef {{ start: number, end: number, text: string, words?: Word[] }} Segment
 * @typedef {{ text: string, segments?: Segment[], language?: string, model_used: string,
 *   processing_time: number }} TranscriptionResult
 */

/** Returns the directory whisper models are stored in. */
export function getModelsDir() {
  return process.env.WHISPER_MODELS_PATH || join(homedir(), '.inside-voice-mcp', 'models');
}

/**
 * `options` are validated options, see TranscribeOptionsSchema in schemas.js.
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
    if (result.exitCode === 0) {
      return { installed: true, version: 'whisper.cpp' };
    }

    return { installed: false, error: result.stderr };
  } catch (error) {
    return { installed: false, error: error.message };
  }
}

/**
 * `outputBase` is the output file path without its extension.
 * `options` are validated options, see TranscribeOptionsSchema in schemas.js.
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

  args.push(OUTPUT_FORMAT_FLAGS[options.output_format]);

  // Only the JSON file reports the detected language, so every format needs it.
  if (options.output_format !== 'json') {
    args.push(OUTPUT_FORMAT_FLAGS.json);
  }

  // Word timestamps need the full JSON output, which is written alongside the chosen format.
  if (options.word_timestamps) {
    args.push('--output-json-full');
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

  const segments = entries.filter((entry) => entry.offsets && entry.text).map(parseWhisperSegment);

  const text = entries
    .map((entry) => entry.text)
    .join('')
    .trim();

  return { text, segments, language: json.result?.language || 'en' };
}

function parseWhisperSegment(entry) {
  const segment = {
    start: entry.offsets.from / 1000,
    end: entry.offsets.to / 1000,
    text: entry.text.trim(),
  };

  const words = parseWhisperWords(entry);
  if (words.length > 0) {
    segment.words = words;
  }

  return segment;
}

function isPunctuation(text) {
  return /^\p{P}+$/u.test(text);
}

/**
 * Merges a segment's tokens into words. Only the full JSON output has tokens.
 * A token that starts with a space begins a new word, so languages written without spaces
 * come out as one word per segment.
 * @returns {Word[]}
 */
function parseWhisperWords(entry) {
  const words = [];

  for (const token of entry.tokens ?? []) {
    // Special tokens look like [_BEG_] and [_TT_196].
    if (token.text.startsWith('[_')) {
      continue;
    }

    const previousWord = words.at(-1);
    if (previousWord && !token.text.startsWith(' ')) {
      previousWord.text += token.text;
      // Punctuation tokens run on into the silence after the word, so they don't extend it.
      if (!isPunctuation(token.text)) {
        previousWord.end = token.offsets.to / 1000;
      }
    } else {
      words.push({
        start: token.offsets.from / 1000,
        end: token.offsets.to / 1000,
        text: token.text.trim(),
      });
    }
  }

  // whisper gives some tokens no duration, so run those words up to the next one.
  const segmentEnd = entry.offsets.to / 1000;
  for (const [index, word] of words.entries()) {
    if (word.end === word.start) {
      const nextWord = words[index + 1];
      word.end = nextWord ? nextWord.start : segmentEnd;
    }
  }

  return words;
}

async function readJsonOutput(outputBase) {
  const jsonText = await readFile(`${outputBase}.json`, 'utf-8');
  return parseWhisperJson(JSON.parse(jsonText));
}

/** whisper starts the text of every cue with a space that is not part of the transcript. */
function removeSpaceBeforeCueText(fileText, format) {
  if (format === 'csv') {
    return fileText.replace(/^(\d+,\d+,") +/gm, '$1');
  }

  return fileText.replace(/^ +/gm, '');
}

async function readFormattedText(outputBase, stdout, format) {
  // stdout is always timestamped text, so other formats only exist in their output file.
  if (format === 'txt') {
    return stdout;
  }

  const fileText = await readFile(`${outputBase}.${format}`, 'utf-8');
  return removeSpaceBeforeCueText(fileText, format);
}

async function readWhisperOutput(outputBase, stdout, options) {
  const { output_format, word_timestamps } = options;
  const jsonOutput = await readJsonOutput(outputBase);

  if (output_format === 'json') {
    return jsonOutput;
  }

  const text = await readFormattedText(outputBase, stdout, output_format);
  const output = { text: text.trim(), language: jsonOutput.language };

  if (word_timestamps) {
    output.segments = jsonOutput.segments;
  }

  return output;
}
