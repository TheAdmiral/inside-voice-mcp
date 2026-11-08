import { platform } from 'node:os';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { getConfigPath, saveHuggingFaceToken } from '../src/utils/huggingface-auth.js';

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

function reportSavedLocation(location) {
  if (location === 'keychain') {
    console.log('Saved your HuggingFace token to the macOS Keychain.');
    return;
  }

  if (platform() === 'darwin') {
    console.log('The macOS Keychain was not available.');
  }
  console.log(`Saved your HuggingFace token to ${getConfigPath()}, readable only by you.`);
}

try {
  const token = (await askForHiddenInput('HuggingFace token (input is hidden): ')).trim();
  process.stdout.write('\n');

  if (!token) {
    throw new Error('No token entered, so nothing was saved.');
  }

  reportSavedLocation(await saveHuggingFaceToken(token));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
