/**
 * Serves the MCP server over Streamable HTTP on localhost, for clients such as Jan that
 * connect to a URL instead of starting the server themselves.
 *
 * Each request gets its own MCP server ("stateless" mode). None of the tools send messages
 * between requests, so there is no session to keep.
 */

import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// The tools read and write local files, so only accept connections from this computer.
const HOST = '127.0.0.1';
const MCP_PATH = '/mcp';

// Checking the Host header stops a web page from reaching the server through DNS rebinding.
const LOCAL_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]'];

function sendJsonRpcError(res, statusCode, message, headers = {}) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

function hasLocalHost(req) {
  try {
    const hostname = new URL(`http://${req.headers.host}`).hostname;
    return LOCAL_HOSTNAMES.includes(hostname);
  } catch {
    return false;
  }
}

async function handleMcpRequest(createMcpServer, req, res) {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}

async function handleRequest(createMcpServer, req, res) {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path !== MCP_PATH) {
    sendJsonRpcError(res, 404, `Not found. The MCP endpoint is ${MCP_PATH}`);
    return;
  }

  if (!hasLocalHost(req)) {
    sendJsonRpcError(res, 403, `Invalid Host header: ${req.headers.host}`);
    return;
  }

  // Without sessions there is nothing to stream to (GET) or end (DELETE).
  if (req.method !== 'POST') {
    sendJsonRpcError(res, 405, 'Method not allowed', { Allow: 'POST' });
    return;
  }

  try {
    await handleMcpRequest(createMcpServer, req, res);
  } catch (error) {
    console.error('[HTTP Error]', error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, 'Internal server error');
    }
  }
}

/**
 * Starts listening on localhost. Pass port 0 to use any free port.
 * Resolves with the Node HTTP server once it is listening.
 */
export function startHttpServer(createMcpServer, port) {
  const httpServer = createServer((req, res) => handleRequest(createMcpServer, req, res));

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, HOST, () => {
      httpServer.off('error', reject);
      resolve(httpServer);
    });
  });
}

export function httpServerUrl(httpServer) {
  return `http://${HOST}:${httpServer.address().port}${MCP_PATH}`;
}
