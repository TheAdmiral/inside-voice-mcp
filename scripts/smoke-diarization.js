import { join } from 'node:path';
import { transcribeTool } from '../src/tools/transcribe.js';

// Pass a model name to use something other than base.en.
const model = process.argv[2] ?? 'base.en';
const audioPath = join(import.meta.dirname, '../test/fixtures/sample_meeting_40_seconds.wav');

try {
  console.log('Testing speaker diarization with:', audioPath);

  const args = transcribeTool.argsSchema.parse({
    audio_path: audioPath,
    options: { model, diarize: true, min_speakers: 2, max_speakers: 5 },
  });
  const result = await transcribeTool.handler(args);

  console.log('\n=== SPEAKER DIARIZATION RESULTS ===');
  console.log(result.content[0].text);
} catch (error) {
  console.error('Error:', error.message);
  process.exitCode = 1;
}
