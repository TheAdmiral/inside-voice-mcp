import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const client = new Client({ name: 'server-test', version: '0.0.0' });

before(async () => {
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'], stderr: 'ignore' })
  );
});

after(() => client.close());

test('lists every tool', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    'health_check',
    'list_models',
    'transcribe',
    'transcribe_long',
    'transcribe_with_speakers',
    'version'
  ]);
});

test('calls a tool over stdio', async () => {
  const result = await client.callTool({ name: 'version', arguments: {} });
  assert.equal(JSON.parse(result.content[0].text).name, 'whisper-mcp-server');
});

test('rejects unknown tools with MethodNotFound', async () => {
  await assert.rejects(client.callTool({ name: 'no_such_tool', arguments: {} }), {
    code: ErrorCode.MethodNotFound
  });
});
