#!/usr/bin/env node

/**
 * whisper.cpp MCP Server
 *
 * A Model Context Protocol server that provides speech-to-text transcription
 * using whisper.cpp optimized for M1 MacBook Pro performance.
 *
 * stdout carries the MCP protocol, so log to stderr only.
 */

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
import { healthCheckTool } from './tools/health-check.js';
import { listModelsTool } from './tools/list-models.js';
import { transcribeTool } from './tools/transcribe.js';
import { transcribeLongTool } from './tools/transcribe-long.js';
import { transcribeWithSpeakersTool } from './tools/transcribe-with-speakers.js';
import { versionTool } from './tools/version.js';

const tools = [
  transcribeTool,
  transcribeLongTool,
  transcribeWithSpeakersTool,
  listModelsTool,
  healthCheckTool,
  versionTool,
];

const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

function createServer() {
  const server = new Server(
    { name: 'whisper-mcp-server', version: packageJson.version },
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

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  try {
    await server.connect(transport);
    console.error('whisper.cpp MCP Server running on stdio');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Server startup failed:', error);
    process.exit(1);
  });
}
