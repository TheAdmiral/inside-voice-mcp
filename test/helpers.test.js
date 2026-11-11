import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreEnvironmentAfter } from './helpers.js';

const originalPath = process.env.PATH;

test('a test changes the environment', (t) => {
  restoreEnvironmentAfter(t);
  process.env.INSIDE_VOICE_HELPER_TEST = 'set';
  process.env.PATH = '/changed';

  // Saving again after a change must not replace the original that is put back.
  restoreEnvironmentAfter(t);
  delete process.env.HOME;
});

test('the next test sees the environment as it was', () => {
  assert.equal(process.env.INSIDE_VOICE_HELPER_TEST, undefined);
  assert.equal(process.env.PATH, originalPath);
  assert.ok(process.env.HOME);
});
