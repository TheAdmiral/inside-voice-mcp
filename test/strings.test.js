import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'acorn';
import { REGULAR_MODEL_NAMES } from '../src/models.js';
import { modelDescriptions } from '../src/strings.js';

const PROJECT_DIR = join(import.meta.dirname, '..');
const STRINGS_FILE = 'src/strings.js';

const SKIPPED_FILES = [
  STRINGS_FILE,
  // A test tool for developers, which only prints what it is testing and the result.
  'scripts/smoke-diarization.js',
];

// Text that looks like copy, but is not shown to anyone.
const ALLOWED_TEXT = [
  {
    file: 'src/whisper.js',
    text: 'Words used in this recording include ',
    reason: 'The vocabulary prompt goes to whisper, and its wording was tested for accuracy',
  },
  {
    file: 'src/utils/diarization-python.js',
    text: 'import torch, pyannote.audio',
    reason: 'Python code that checks the diarization packages are installed',
  },
];

// Two words separated by a space, such as "not installed" or "Delete it? Type y".
const TWO_WORDS = /\p{L}[.,:;!?]?\s+\p{L}/u;
// Codes such as SETUP_ERROR, which are not copy even when they are passed with a message.
const CODE = /^[A-Z_]+$/;
const LETTER = /\p{L}/u;

const MESSAGE_CLASSES = ['Error', 'McpError', 'DiarizationError'];
const MESSAGE_PROPERTIES = ['description', 'message'];

function readSyntaxTree(file) {
  const source = readFileSync(join(PROJECT_DIR, file), 'utf-8');
  return parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
}

/** Yields every node in the tree with the node it is part of. */
function* walk(node, parent = null) {
  yield { node, parent };

  for (const value of Object.values(node)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (typeof child?.type === 'string') {
        yield* walk(child, node);
      }
    }
  }
}

/** Returns the text of a string or template literal, or null for any other node. */
function textOf(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((quasi) => quasi.value.cooked).join('');
  }

  return null;
}

/**
 * Whether the node is used as a message: printed, thrown, or given as a description.
 * This catches copy with only one word, which the two-word check misses.
 */
function isUsedAsMessage(node, parent) {
  if (parent.type === 'NewExpression' && parent.arguments.includes(node)) {
    return MESSAGE_CLASSES.includes(parent.callee.name);
  }

  if (parent.type === 'CallExpression' && parent.arguments.includes(node)) {
    const { callee } = parent;
    if (callee.type !== 'MemberExpression') {
      return false;
    }
    return callee.object.name === 'console' || callee.property.name === 'describe';
  }

  if (parent.type === 'Property' && parent.value === node) {
    return MESSAGE_PROPERTIES.includes(parent.key.name);
  }

  return false;
}

function looksLikeCopy(text, node, parent) {
  if (TWO_WORDS.test(text)) {
    return true;
  }

  return LETTER.test(text) && !CODE.test(text) && isUsedAsMessage(node, parent);
}

function findAllowedText(file, text) {
  return ALLOWED_TEXT.find((allowed) => allowed.file === file && text.includes(allowed.text));
}

function checkedFiles() {
  const files = globSync(['src/**/*.js', 'scripts/**/*.js'], { cwd: PROJECT_DIR });
  return files.filter((file) => !SKIPPED_FILES.includes(file)).sort();
}

test('all the text people see is in strings.js', () => {
  const misplacedText = [];
  const usedAllowances = new Set();

  for (const file of checkedFiles()) {
    for (const { node, parent } of walk(readSyntaxTree(file))) {
      const text = textOf(node);
      if (text === null || !looksLikeCopy(text, node, parent)) {
        continue;
      }

      const allowed = findAllowedText(file, text);
      if (allowed) {
        usedAllowances.add(allowed);
      } else {
        misplacedText.push(`${file}:${node.loc.start.line}  ${JSON.stringify(text)}`);
      }
    }
  }

  assert.equal(
    misplacedText.length,
    0,
    `Move this text to ${STRINGS_FILE}, or add it to ALLOWED_TEXT in this test with the ` +
      `reason it is not copy:\n${misplacedText.join('\n')}`,
  );

  const unusedAllowances = ALLOWED_TEXT.filter((allowed) => !usedAllowances.has(allowed));
  assert.deepEqual(
    unusedAllowances,
    [],
    'Remove these from ALLOWED_TEXT, which no longer need them',
  );
});

test('strings.js imports nothing, so that any file can import it', () => {
  const imports = readSyntaxTree(STRINGS_FILE).body.filter(
    (node) => node.type === 'ImportDeclaration',
  );

  assert.deepEqual(imports, []);
});

test('every regular model has a description, and only the regular models have one', () => {
  assert.deepEqual(Object.keys(modelDescriptions.regular).sort(), [...REGULAR_MODEL_NAMES].sort());
});
