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
import { errors, logs } from './strings.js';
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

  server.onerror = (error) => console.error(logs.mcpError, error);

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
      throw new McpError(ErrorCode.MethodNotFound, errors.unknownTool(request.params.name));
    }

    const parsed = tool.argsSchema.safeParse(request.params.arguments ?? {});
    if (!parsed.success) {
      throw new McpError(ErrorCode.InvalidParams, z.prettifyError(parsed.error));
    }

    try {
      return await tool.handler(parsed.data);
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, errors.toolFailed(error.message));
    }
  });

  return server;
}

function readOptions(args) {
  const { values } = parseArgs({
    args,
    options: {
      http: { type: 'boolean', default: false },
      port: { type: 'string' },
    },
  });

  // The port is only for HTTP, so on its own it is a mistake rather than a request for HTTP.
  if (values.port !== undefined && !values.http) {
    throw new Error(errors.portWithoutHttp(values.port));
  }

  const port = values.port === undefined ? DEFAULT_HTTP_PORT : Number(values.port);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(errors.invalidPort(values.port));
  }

  return { useHttp: values.http, port };
}

async function runOverStdio() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error(logs.runningOnStdio);
}

async function runOverHttp(port) {
  try {
    const httpServer = await startHttpServer(createServer, port);
    console.error(logs.runningAt(httpServerUrl(httpServer)));
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      throw new Error(errors.portInUse(port));
    }
    throw error;
  }
}

/** Starts the server, over stdio or, with --http, over HTTP on localhost. */
export async function startServer(args) {
  const { useHttp, port } = readOptions(args);

  process.on('uncaughtException', (error) => {
    console.error(logs.uncaughtException, error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error(logs.unhandledRejectionAt, promise, logs.unhandledRejectionReason, reason);
    process.exit(1);
  });

  if (useHttp) {
    await runOverHttp(port);
  } else {
    await runOverStdio();
  }
}

if (import.meta.main) {
  startServer(process.argv.slice(2)).catch((error) => {
    console.error(logs.startupFailed, error.message);
    process.exit(1);
  });
}
