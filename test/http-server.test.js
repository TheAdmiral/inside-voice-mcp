import assert from 'node:assert/strict';
import { request } from 'node:http';
import { after, before, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { httpServerUrl, startHttpServer } from '../src/http-server.js';
import { createServer } from '../src/index.js';

let httpServer;
let url;

before(async () => {
  httpServer = await startHttpServer(createServer, 0);
  url = httpServerUrl(httpServer);
});

after(() => httpServer.close());

/** Sends a raw request, so the test can set headers that fetch does not allow. */
function sendRequest({ method = 'POST', path = '/mcp', headers = {} }) {
  const { port } = httpServer.address();
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end('{}');
  });
}

test('serves the tools over HTTP', async () => {
  const client = new Client({ name: 'http-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));

  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === 'transcribe'));

  const result = await client.callTool({ name: 'version', arguments: {} });
  assert.equal(JSON.parse(result.content[0].text).name, 'inside-voice-mcp');

  await client.close();
});

test('listens on localhost only', () => {
  assert.equal(httpServer.address().address, '127.0.0.1');
});

test('rejects requests with a Host that is not local', async () => {
  assert.equal(await sendRequest({ headers: { Host: 'attacker.example:3700' } }), 403);
});

test('only serves the MCP endpoint', async () => {
  assert.equal(await sendRequest({ path: '/other' }), 404);
});

test('rejects methods other than POST', async () => {
  assert.equal(await sendRequest({ method: 'GET' }), 405);
  assert.equal(await sendRequest({ method: 'DELETE' }), 405);
});
