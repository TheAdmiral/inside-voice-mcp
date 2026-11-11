import { spawnSync } from 'node:child_process';
import { DIARIZE_SCRIPT } from '../src/utils/diarization-python.js';

/** Downloads Python and the speaker diarization packages with uv. */
export function run() {
  // Without this step uv downloads everything during the first diarization,
  // which can take long enough for an MCP client to give up waiting.
  console.log('Downloading Python and the speaker diarization packages (about 1.5 GB)');

  const result = spawnSync('uv', ['sync', '--frozen', '--script', DIARIZE_SCRIPT], {
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`Could not run uv: ${result.error.message}. Install it with: brew install uv`);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    console.log('Speaker diarization packages are ready');
  }
}
