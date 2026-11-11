import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { healthCheckTool } from '../src/tools/health-check.js';
import {
  findHuggingFaceToken,
  getConfigPath,
  saveHuggingFaceToken,
} from '../src/utils/huggingface-auth.js';
import { makeTempDir, restoreEnvironmentAfter, writeExecutable } from './helpers.js';

const skipUnlessMac = { skip: platform() !== 'darwin' };

/**
 * Points HOME at an empty directory and puts a fake `security` command on the PATH, so that
 * these tests never touch the real config file or Keychain.
 * The fake stores what it is given in a file. With `brokenKeychain` it stores nothing.
 */
function setUpIsolatedHome(t, { brokenKeychain = false } = {}) {
  const dir = makeTempDir(t, 'token');
  restoreEnvironmentAfter(t);

  const keychainPath = join(dir, 'fake-keychain');
  const securityPath = join(dir, 'security');
  const storeCommand = brokenKeychain
    ? 'cat > /dev/null'
    : `sed -n 's/.* -w "\\(.*\\)"$/\\1/p' > "${keychainPath}"`;

  writeExecutable(
    securityPath,
    `#!/bin/sh
if [ "$1" = "-i" ]; then
  ${storeCommand}
  exit 0
fi
if [ -f "${keychainPath}" ]; then
  cat "${keychainPath}"
  exit 0
fi
exit 44
`,
  );

  process.env.HOME = dir;
  process.env.PATH = `${dir}:${process.env.PATH}`;
  delete process.env.HF_TOKEN;

  return { keychainPath };
}

function writeConfigFile(contents, mode) {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, contents);
  chmodSync(configPath, mode);
  return configPath;
}

test('finds nothing when no token is stored', async (t) => {
  setUpIsolatedHome(t);

  assert.deepEqual(await findHuggingFaceToken(), { token: null, source: null, problem: null });
});

test('the environment variable wins over a stored token', async (t) => {
  setUpIsolatedHome(t);
  writeConfigFile('{"hf_token":"from-file"}', 0o600);
  process.env.HF_TOKEN = 'from-environment';

  const { token, source } = await findHuggingFaceToken();

  assert.equal(token, 'from-environment');
  assert.equal(source, 'environment');
});

test('an empty environment variable counts as not set', async (t) => {
  setUpIsolatedHome(t);
  writeConfigFile('{"hf_token":"from-file"}', 0o600);
  process.env.HF_TOKEN = '';

  const { token } = await findHuggingFaceToken();

  assert.equal(token, 'from-file');
});

test('the Keychain wins over the config file', skipUnlessMac, async (t) => {
  const { keychainPath } = setUpIsolatedHome(t);
  writeFileSync(keychainPath, 'from-keychain\n');
  writeConfigFile('{"hf_token":"from-file"}', 0o600);

  const { token, source } = await findHuggingFaceToken();

  assert.equal(token, 'from-keychain');
  assert.equal(source, 'keychain');
});

test('reads the token from a private config file', async (t) => {
  setUpIsolatedHome(t);
  writeConfigFile('{"hf_token":"from-file"}', 0o600);

  const { token, source, problem } = await findHuggingFaceToken();

  assert.equal(token, 'from-file');
  assert.equal(source, 'config_file');
  assert.equal(problem, null);
});

for (const mode of [0o640, 0o604, 0o644]) {
  test(`refuses a config file with permissions ${mode.toString(8)}`, async (t) => {
    setUpIsolatedHome(t);
    writeConfigFile('{"hf_token":"from-file"}', mode);

    const { token, problem } = await findHuggingFaceToken();

    assert.equal(token, null);
    assert.match(problem, /chmod 600/);
  });
}

test('malformed config does not repeat the file contents', async (t) => {
  setUpIsolatedHome(t);
  writeConfigFile('hf_secretvalue', 0o600);

  const { token, problem } = await findHuggingFaceToken();

  assert.equal(token, null);
  assert.match(problem, /not valid JSON/);
  assert.doesNotMatch(problem, /secretvalue/);
});

test('saves to the Keychain when it is available', skipUnlessMac, async (t) => {
  const { keychainPath } = setUpIsolatedHome(t);

  const location = await saveHuggingFaceToken('hf_abc123');

  assert.equal(location, 'keychain');
  assert.equal(readFileSync(keychainPath, 'utf-8').trim(), 'hf_abc123');
  assert.equal(existsSync(getConfigPath()), false);
});

test('falls back to a private file when the Keychain does not save', async (t) => {
  setUpIsolatedHome(t, { brokenKeychain: true });

  const location = await saveHuggingFaceToken('hf_abc123');

  assert.equal(location, 'config_file');
  assert.equal(statSync(getConfigPath()).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(getConfigPath(), 'utf-8')), { hf_token: 'hf_abc123' });
});

test('saves to a private file without trying the Keychain when asked', async (t) => {
  const { keychainPath } = setUpIsolatedHome(t);

  const location = await saveHuggingFaceToken('hf_abc123', { useKeychain: false });

  assert.equal(location, 'config_file');
  assert.equal(existsSync(keychainPath), false);
  assert.equal(statSync(getConfigPath()).mode & 0o777, 0o600);
  assert.equal((await findHuggingFaceToken()).token, 'hf_abc123');
});

test('saving replaces an existing file that was too open', async (t) => {
  setUpIsolatedHome(t, { brokenKeychain: true });
  writeConfigFile('{"hf_token":"old"}', 0o644);

  await saveHuggingFaceToken('hf_new');

  assert.equal(statSync(getConfigPath()).mode & 0o777, 0o600);
  assert.equal((await findHuggingFaceToken()).token, 'hf_new');
});

test('rejects text that could break out of the Keychain command', async (t) => {
  const { keychainPath } = setUpIsolatedHome(t);

  await assert.rejects(saveHuggingFaceToken('abc"\ndelete-keychain'), /does not look like/);
  assert.equal(existsSync(keychainPath), false);
  assert.equal(existsSync(getConfigPath()), false);
});

test('health_check reports where the token came from without revealing it', async (t) => {
  setUpIsolatedHome(t);
  process.env.HF_TOKEN = 'hf_secretvalue';

  const result = await healthCheckTool.handler();
  const output = result.content[0].text;

  assert.equal(JSON.parse(output).huggingface_token_source, 'environment');
  assert.doesNotMatch(output, /secretvalue/);
});
