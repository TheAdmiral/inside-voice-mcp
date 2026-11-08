import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCommand } from '../src/utils/run-command.js';

test('rejects when the command is not installed', async () => {
  await assert.rejects(runCommand('no-such-command-for-tests', []), { code: 'ENOENT' });
});

test('resolves with the exit code of a failing command', async () => {
  const result = await runCommand(process.execPath, [
    '-e',
    'console.error("bad"); process.exit(3)',
  ]);

  assert.equal(result.exitCode, 3);
  assert.equal(result.stderr.trim(), 'bad');
});

test('collects stdout', async () => {
  const result = await runCommand(process.execPath, ['-e', 'console.log("hello")']);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'hello\n');
});

test('a command killed by a signal is not a success', async () => {
  const result = await runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {
    timeout: 100,
  });

  assert.notEqual(result.exitCode, 0);
});

test('sends input to the command on stdin', async () => {
  const result = await runCommand('cat', [], { input: 'hello' });

  assert.equal(result.stdout, 'hello');
});
