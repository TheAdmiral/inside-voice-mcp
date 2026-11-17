/**
 * Stores a HuggingFace token for speaker diarisation, in the macOS Keychain by default.
 * Run with --file to store it in a private file instead.
 */

import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { setup } from '../src/strings.js';
import {
  findHuggingFaceToken,
  getConfigPath,
  saveHuggingFaceToken,
} from '../src/utils/huggingface-auth.js';

/** Resolves with the line typed, or an empty string if the prompt is cancelled. */
function askForHiddenInput(question) {
  process.stdout.write(question);

  // readline echoes what is typed to its output, so give it one that discards everything.
  const discardedOutput = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const reader = createInterface({
    input: process.stdin,
    output: discardedOutput,
    terminal: true,
  });

  return new Promise((resolve) => {
    reader.once('line', (line) => {
      resolve(line);
      reader.close();
    });
    reader.once('close', () => resolve(''));
  });
}

async function reportSavedLocation(location, useKeychain) {
  if (location === 'keychain') {
    console.log(setup.savedToKeychain);
    return;
  }

  if (useKeychain) {
    console.log(setup.keychainUnavailable);
  }
  console.log(setup.savedToFile(getConfigPath()));

  // The server reads the Keychain before the file, so an older Keychain token would still win.
  const { source } = await findHuggingFaceToken();
  if (source === 'keychain') {
    console.log(setup.keychainTokenStillUsed);
  }
}

/** Asks for a HuggingFace token and stores it. Pass --file to store it in a file. */
export async function run(args) {
  try {
    const { values } = parseArgs({
      args,
      options: { file: { type: 'boolean', default: false } },
    });
    const useKeychain = !values.file;

    const token = (await askForHiddenInput(setup.tokenPrompt)).trim();
    process.stdout.write('\n');

    if (!token) {
      throw new Error(setup.noTokenEntered);
    }

    const location = await saveHuggingFaceToken(token, { useKeychain });
    await reportSavedLocation(location, useKeychain);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
