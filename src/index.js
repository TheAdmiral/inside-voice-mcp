#!/usr/bin/env node

/**
 * Inside Voice MCP Server
 *
 * A Model Context Protocol server that provides speech-to-text transcription
 * using whisper.cpp, optimized for Apple Silicon.
 *
 * By default it talks to the client over stdio. Run it with --http to serve it on
 * localhost instead, optionally with --port <number>.
 *
 * stdout carries the MCP protocol over stdio, so log to stderr only.
 */

import { parseArgs } from 'node:util';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import packageJson from '../package.json' with { type: 'json' };
import { httpServerUrl, startHttpServer } from './http-server.js';
import { healthCheckTool } from './tools/health-check.js';
import { listModelsTool } from './tools/list-models.js';
import { transcribeTool } from './tools/transcribe.js';
import { versionTool } from './tools/version.js';

const DEFAULT_HTTP_PORT = 3700;

export const tools = [transcribeTool, listModelsTool, healthCheckTool, versionTool];

const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

export function createServer() {
  const server = new Server(
    { name: 'inside-voice-mcp', version: packageJson.version },
    { capabilities: { tools: {} } },
  );

  server.onerror = (error) => console.error('[MCP Error]', error);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      // 'input' keeps fields that have a default from being marked as required.
      inputSchema: z.toJSONSchema(tool.argsSchema, { io: 'input' }),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolsByName.get(request.params.name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    const parsed = tool.argsSchema.safeParse(request.params.arguments ?? {});
    if (!parsed.success) {
      throw new McpError(ErrorCode.InvalidParams, z.prettifyError(parsed.error));
    }

    try {
      return await tool.handler(parsed.data);
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
    }
  });

  return server;
}

function readOptions() {
  const { values } = parseArgs({
    options: {
      http: { type: 'boolean', default: false },
      port: { type: 'string' },
    },
  });

  // Giving a port implies serving over HTTP.
  const useHttp = values.http || values.port !== undefined;
  const port = values.port === undefined ? DEFAULT_HTTP_PORT : Number(values.port);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be a whole number from 1 to 65535, not "${values.port}"`);
  }

  return { useHttp, port };
}

async function runOverStdio() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error('Inside Voice MCP server running on stdio');
}

async function runOverHttp(port) {
  try {
    const httpServer = await startHttpServer(createServer, port);
    console.error(`Inside Voice MCP server running at ${httpServerUrl(httpServer)}`);
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. Choose another with --port <number>`);
    }
    throw error;
  }
}

async function main() {
  const { useHttp, port } = readOptions();

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  if (useHttp) {
    await runOverHttp(port);
  } else {
    await runOverStdio();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  });
}
