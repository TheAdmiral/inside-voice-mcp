import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const client = new Client({ name: 'server-test', version: '0.0.0' });

before(async () => {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['src/index.js'],
      stderr: 'ignore',
    }),
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
    'version',
  ]);
});

test('calls a tool over stdio', async () => {
  const result = await client.callTool({ name: 'version', arguments: {} });
  assert.equal(JSON.parse(result.content[0].text).name, 'inside-voice-mcp');
});

test('rejects unknown tools with MethodNotFound', async () => {
  await assert.rejects(client.callTool({ name: 'no_such_tool', arguments: {} }), {
    code: ErrorCode.MethodNotFound,
  });
});

test('rejects invalid arguments with InvalidParams', async () => {
  await assert.rejects(
    client.callTool({
      name: 'transcribe',
      arguments: { audio_path: 'x.wav', options: { model: 'not-a-model' } },
    }),
    { code: ErrorCode.InvalidParams },
  );

  await assert.rejects(client.callTool({ name: 'transcribe', arguments: {} }), {
    code: ErrorCode.InvalidParams,
  });
});

test('publishes the transcribe schema generated from zod', async () => {
  const { tools } = await client.listTools();
  const schema = tools.find((tool) => tool.name === 'transcribe').inputSchema;

  assert.deepEqual(schema.required, ['audio_path']);
  assert.ok(schema.properties.options.properties.model.enum.includes('tiny.en'));
  assert.ok(schema.properties.options.properties.model.enum.includes('large-v3-turbo'));
  assert.ok('max_len' in schema.properties.options.properties);
  assert.ok('split_on_word' in schema.properties.options.properties);
});
