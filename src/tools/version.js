import { z } from 'zod';
import packageJson from '../../package.json' with { type: 'json' };
import { OutputFormat } from '../schemas.js';
import { jsonResult } from './tool-result.js';

// There is no list of input formats or models here. Input formats depend on what afconvert
// and ffmpeg can read, and the models depend on what is installed, which list_models shows.
async function handler() {
  return jsonResult({
    name: 'inside-voice-mcp',
    version: packageJson.version,
    description: 'whisper.cpp MCP server for local speech-to-text transcription',
    capabilities: [
      'audio transcription',
      'multiple output formats',
      'Apple Silicon optimisation',
      'local processing',
    ],
    output_formats: OutputFormat.options,
    author: 'inside-voice-mcp',
    license: 'MIT',
  });
}

export const versionTool = {
  name: 'version',
  description: 'Get server version information. Use list_models to see the models',
  argsSchema: z.object({}),
  handler,
};
