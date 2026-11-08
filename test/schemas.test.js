import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { TranscribeOptionsSchema } from '../src/schemas.js';
import { transcribeTool } from '../src/tools/transcribe.js';

test('option defaults apply when options is omitted', () => {
  const args = transcribeTool.argsSchema.parse({ audio_path: 'a.wav' });

  assert.equal(args.auto_convert, true);
  assert.deepEqual(args.options, {
    model: 'base.en',
    language: 'auto',
    output_format: 'txt',
    temperature: 0,
    threads: 4,
    translate: false,
    word_timestamps: false,
    max_len: 0,
    split_on_word: false,
    diarize: false,
    min_speakers: 1,
    max_speakers: 10,
    use_mps: true,
  });
});

test('min_speakers cannot be greater than max_speakers', () => {
  assert.equal(
    TranscribeOptionsSchema.safeParse({ min_speakers: 3, max_speakers: 2 }).success,
    false,
  );
  assert.equal(
    TranscribeOptionsSchema.safeParse({ min_speakers: 2, max_speakers: 2 }).success,
    true,
  );
  assert.equal(TranscribeOptionsSchema.safeParse({ min_speakers: 11 }).success, false);
});

test('partial options keep the defaults for the other fields', () => {
  const options = TranscribeOptionsSchema.parse({ model: 'tiny.en' });

  assert.equal(options.model, 'tiny.en');
  assert.equal(options.threads, 4);
});

test('an invalid model is rejected', () => {
  const result = transcribeTool.argsSchema.safeParse({
    audio_path: 'a.wav',
    options: { model: 'huge' },
  });

  assert.equal(result.success, false);
});

test('any language code is accepted', () => {
  assert.equal(TranscribeOptionsSchema.parse({ language: 'sv' }).language, 'sv');
});

test('the published input schema does not require defaulted fields', () => {
  const schema = z.toJSONSchema(transcribeTool.argsSchema, { io: 'input' });

  assert.deepEqual(schema.required, ['audio_path']);
  assert.equal(schema.properties.options.properties.model.default, 'base.en');
});
