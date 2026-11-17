import { z } from 'zod';
import packageJson from '../../package.json' with { type: 'json' };
import { OutputFormat } from '../schemas.js';
import { toolDescriptions, version } from '../strings.js';
import { jsonResult } from './tool-result.js';

// There is no list of input formats or models here. Input formats depend on what afconvert
// and ffmpeg can read, and the models depend on what is installed, which list_models shows.
async function handler() {
  return jsonResult({
    name: 'inside-voice-mcp',
    version: packageJson.version,
    description: version.description,
    capabilities: version.capabilities,
    output_formats: OutputFormat.options,
    author: 'inside-voice-mcp',
    license: 'MIT',
  });
}

export const versionTool = {
  name: 'version',
  description: toolDescriptions.version,
  argsSchema: z.object({}),
  handler,
};
