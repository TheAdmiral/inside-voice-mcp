import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { VAD_MODEL_NAME } from '../src/models.js';
import * as strings from '../src/strings.js';

function runCli(args) {
  return spawnSync(process.execPath, ['src/cli.js', ...args], { encoding: 'utf8' });
}

test('help lists the commands', () => {
  const result = runCli(['help']);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${strings.cli.usage}\n`);
});

test('passes the rest of the arguments to the command', () => {
  const result = runCli(['models', 'help']);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${strings.modelManager.usage(VAD_MODEL_NAME)}\n`);
});

test('rejects an unknown command', () => {
  const result = runCli(['no-such-command']);

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr,
    `${strings.errors.unknownCommand('no-such-command', strings.cli.usage)}\n`,
  );
});

test('--port without --http is an error', () => {
  const result = runCli(['--port', '4000']);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, `${strings.errors.portWithoutHttp('4000')}\n`);
});

test('--port must be a valid port number', () => {
  const result = runCli(['--http', '--port', '0']);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, `${strings.errors.invalidPort('0')}\n`);
});

test('starts the MCP server when there is no command', async () => {
  const client = new Client({ name: 'cli-test', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['src/cli.js'],
      stderr: 'ignore',
    }),
  );

  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === 'transcribe'));

  await client.close();
});
