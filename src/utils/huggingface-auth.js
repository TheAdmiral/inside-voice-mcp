import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { runCommand } from './run-command.js';

const KEYCHAIN_SERVICE = 'inside-voice-mcp';
const KEYCHAIN_ACCOUNT = 'HF_TOKEN';
const KEYCHAIN_TIMEOUT_MS = 10_000;

// Any permission bit for the group or for other users makes the file too open.
const GROUP_AND_OTHER_PERMISSIONS = 0o077;

export function getConfigPath() {
  return join(homedir(), '.inside-voice-mcp', 'config.json');
}

function isKeychainSupported() {
  return platform() === 'darwin';
}

async function readTokenFromKeychain() {
  if (!isKeychainSupported()) {
    return null;
  }

  const args = ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w'];

  try {
    // The timeout stops a locked Keychain from blocking the server behind a dialog.
    const result = await runCommand('security', args, { timeout: KEYCHAIN_TIMEOUT_MS });
    const token = result.stdout.trim();

    if (result.exitCode === 0 && token) {
      return token;
    }
  } catch {
    // The security command could not be started, so there is no Keychain to read.
  }

  return null;
}

/** Returns the token from the config file, or null. Throws if the file should not be used. */
async function readTokenFromConfigFile() {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  const { mode } = await stat(configPath);
  if ((mode & GROUP_AND_OTHER_PERMISSIONS) !== 0) {
    throw new Error(
      `${configPath} can be read by other users. Fix it with: chmod 600 ${configPath}`,
    );
  }

  const contents = await readFile(configPath, 'utf-8');

  let config;
  try {
    config = JSON.parse(contents);
  } catch {
    // The parser's own message can quote the file, so it must not be repeated here.
    throw new Error(`${configPath} is not valid JSON.`);
  }

  const token = config?.hf_token;
  if (typeof token === 'string' && token) {
    return token;
  }

  return null;
}

/**
 * Finds the HuggingFace token. HF_TOKEN wins, then the macOS Keychain, then the config file.
 * `problem` explains why a config file that exists could not be used.
 * @returns {Promise<{ token: string | null, source: 'environment' | 'keychain' | 'config_file'
 *   | null, problem: string | null }>}
 */
export async function findHuggingFaceToken() {
  if (process.env.HF_TOKEN) {
    return { token: process.env.HF_TOKEN, source: 'environment', problem: null };
  }

  const keychainToken = await readTokenFromKeychain();
  if (keychainToken) {
    return { token: keychainToken, source: 'keychain', problem: null };
  }

  try {
    const configToken = await readTokenFromConfigFile();
    if (configToken) {
      return { token: configToken, source: 'config_file', problem: null };
    }
  } catch (error) {
    return { token: null, source: null, problem: error.message };
  }

  return { token: null, source: null, problem: null };
}

/** Returns true only if the token can be read back from the Keychain afterwards. */
async function saveTokenToKeychain(token) {
  if (!isKeychainSupported()) {
    return false;
  }

  // Sent on stdin because command line arguments are visible to other processes.
  const command = `add-generic-password -U -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w "${token}"\n`;

  try {
    await runCommand('security', ['-i'], { input: command, timeout: KEYCHAIN_TIMEOUT_MS });
  } catch {
    return false;
  }

  // Interactive mode does not report failures in its exit code.
  const savedToken = await readTokenFromKeychain();
  return savedToken === token;
}

async function saveTokenToConfigFile(token) {
  const configPath = getConfigPath();
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });

  // A write only applies the mode when it creates a file, so always create a new one.
  const temporaryPath = `${configPath}.tmp`;
  const contents = `${JSON.stringify({ hf_token: token }, null, 2)}\n`;

  await rm(temporaryPath, { force: true });
  await writeFile(temporaryPath, contents, { mode: 0o600, flag: 'wx' });
  await rename(temporaryPath, configPath);
}

/**
 * Stores the token in the macOS Keychain, or in the config file if the Keychain is unavailable.
 * @returns {Promise<'keychain' | 'config_file'>} where the token was stored
 */
export async function saveHuggingFaceToken(token) {
  // This also keeps the token safe to place inside the quoted Keychain command.
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('That does not look like a HuggingFace token.');
  }

  if (await saveTokenToKeychain(token)) {
    return 'keychain';
  }

  await saveTokenToConfigFile(token);
  return 'config_file';
}
