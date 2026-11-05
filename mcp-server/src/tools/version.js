import { z } from 'zod';
import packageJson from '../../package.json' with { type: 'json' };
import { jsonResult } from './tool-result.js';

async function handler() {
  return jsonResult({
    name: 'whisper-mcp-server',
    version: packageJson.version,
    description: 'whisper.cpp MCP server for local speech-to-text transcription',
    capabilities: [
      'audio transcription',
      'multiple output formats',
      'M1 optimization',
      'local processing',
    ],
    supported_formats: ['wav', 'mp3', 'm4a', 'flac', 'ogg'],
    output_formats: ['txt', 'vtt', 'srt', 'json', 'csv'],
    whisper_models: ['tiny.en', 'base.en', 'small.en', 'base', 'small', 'medium', 'large-v3'],
    author: 'whisper-mcp-server',
    license: 'MIT',
  });
}

export const versionTool = {
  name: 'version',
  description: 'Get server version information',
  argsSchema: z.object({}),
  handler,
};
