import { join } from 'node:path';
import { findHuggingFaceToken } from './huggingface-auth.js';
import { runCommand } from './run-command.js';

const DIARIZE_SCRIPT = join(import.meta.dirname, '../../python/diarize.py');
const PACKAGE_CHECK_TIMEOUT_MS = 30_000;
const DIARIZATION_TIMEOUT_MS = 300_000;

export class DiarizationError extends Error {
  /** `code` is 'SETUP_ERROR', 'INPUT_ERROR' or 'PROCESSING_ERROR'. */
  constructor(code, message) {
    super(message);
    this.name = 'DiarizationError';
    this.code = code;
  }
}

function buildPythonEnvironment(huggingFaceToken) {
  const environment = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONWARNINGS: 'ignore',
    // Prevents Unicode problems when the server is started from a desktop app.
    LC_ALL: 'en_US.UTF-8',
    LANG: 'en_US.UTF-8',
  };

  if (huggingFaceToken) {
    environment.HF_TOKEN = huggingFaceToken;
  }

  return environment;
}

/** Returns the first Python executable that can import torch and pyannote.audio, or null. */
export async function findDiarizationPython() {
  const candidates = [
    process.env.PYTHON_EXECUTABLE,
    '/opt/miniconda3/bin/python3',
    'python3',
    'python',
    '/opt/homebrew/bin/python3',
    '/usr/bin/python3',
  ].filter(Boolean);

  for (const python of candidates) {
    try {
      const result = await runCommand(python, ['-c', 'import torch, pyannote.audio'], {
        env: buildPythonEnvironment(),
        timeout: PACKAGE_CHECK_TIMEOUT_MS,
      });

      if (result.exitCode === 0) {
        console.error(`[Diarization] Using Python: ${python}`);
        return python;
      }
    } catch {
      // This candidate is not installed, so try the next one.
    }
  }

  return null;
}

/**
 * Runs python/diarize.py and returns the speaker segments, and the device that was used.
 * @param {{ audioPath: string, model: string, minSpeakers: number, maxSpeakers: number,
 *   useMps: boolean }} params
 * @returns {Promise<{ segments: import('./diarization-alignment.js').DiarizationSegment[],
 *   device: string }>}
 */
export async function runDiarization(python, params) {
  const { audioPath, model, minSpeakers, maxSpeakers, useMps } = params;
  const args = [
    DIARIZE_SCRIPT,
    audioPath,
    model,
    String(minSpeakers),
    String(maxSpeakers),
    String(useMps),
  ];

  const { token, problem } = await findHuggingFaceToken();
  if (problem) {
    throw new DiarizationError('SETUP_ERROR', problem);
  }

  console.error(`[Diarization] Diarizing ${audioPath}`);

  let result;
  try {
    result = await runCommand(python, args, {
      env: buildPythonEnvironment(token),
      timeout: DIARIZATION_TIMEOUT_MS,
    });
  } catch (error) {
    throw new DiarizationError('PROCESSING_ERROR', `Script execution failed: ${error.message}`);
  }

  if (result.exitCode !== 0) {
    throw new DiarizationError(
      'PROCESSING_ERROR',
      `Diarization script failed (exit code ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }

  let output;
  try {
    output = JSON.parse(result.stdout);
  } catch (error) {
    throw new DiarizationError(
      'PROCESSING_ERROR',
      `Failed to parse diarization output: ${error.message}`,
    );
  }

  if (output.error) {
    throw new DiarizationError('PROCESSING_ERROR', output.error);
  }

  return { segments: output.segments ?? [], device: output.device };
}
