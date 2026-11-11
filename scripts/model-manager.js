import { createInterface } from 'node:readline';
import {
  deleteModel,
  deleteVadModel,
  describeModel,
  fetchOnlineModels,
  formatSize,
  getInstalledModels,
  getModelsDir,
  installModel,
  installVadModel,
  isRegularModel,
  isVadModelInstalled,
  VAD_MODEL_NAME,
  VAD_MODEL_SIZE_BYTES,
} from '../src/models.js';

const USAGE = `Manage the whisper models Inside Voice uses.

Usage: inside-voice-mcp models [command]

Commands:
  list                 Show the installed models (the default)
  available            Show every model you can install, with its size
  install [model...]   Install models, or choose them from a list
  delete [model...]    Delete models, or choose them from a list
  help                 Show this help

Regular models are the standard whisper models. Advanced models are quantised versions of
them, which are smaller and use less memory but are slightly less accurate. large-v3-turbo-q8_0
is recommended for accuracy.

The VAD model, called ${VAD_MODEL_NAME}, lets whisper skip the parts without speech, which is
faster and avoids made-up text in silences. It is installed along with any whisper model,
or on its own with: inside-voice-mcp models install ${VAD_MODEL_NAME}`;

// One reader is shared by every question, because a reader takes all the input available,
// which can include answers to later questions when they are piped in.
let reader = null;
let lines = null;

/** Resolves with the line typed, or an empty string if the prompt is cancelled. */
async function ask(question) {
  if (!reader) {
    reader = createInterface({ input: process.stdin, output: process.stdout });
    reader.on('SIGINT', () => {
      process.stdout.write('\n');
      reader.close();
    });
    // Unlike the question method, this keeps lines that arrive before they are asked for.
    lines = reader[Symbol.asyncIterator]();
  }

  process.stdout.write(question);
  const line = await lines.next();
  return line.done ? '' : line.value;
}

/**
 * Prints models under Regular and Advanced headings, each with its size and description.
 * With `numbered`, each model gets its position in `models` as a number to choose it by.
 * Models named in `installedNames` are marked as installed.
 */
function printModels(models, { numbered = false, installedNames = [] } = {}) {
  const nameWidth = Math.max(...models.map((model) => model.name.length));
  const numberWidth = String(models.length).length;
  const showInstalled = installedNames.length > 0;

  let currentHeading = null;
  for (const [index, model] of models.entries()) {
    const heading = isRegularModel(model.name) ? 'Regular models' : 'Advanced models';
    if (heading !== currentHeading) {
      console.log(`\n${heading}`);
      currentHeading = heading;
    }

    const columns = [];
    if (numbered) {
      columns.push(`${String(index + 1).padStart(numberWidth)}.`);
    }
    columns.push(model.name.padEnd(nameWidth));
    columns.push(formatSize(model.size_bytes).padStart(7));
    if (showInstalled) {
      columns.push(installedNames.includes(model.name) ? 'installed' : '         ');
    }
    columns.push(describeModel(model.name));

    console.log(`  ${columns.join('  ')}`);
  }
}

function printVadModel() {
  const status = isVadModelInstalled() ? 'installed' : `install it with: install ${VAD_MODEL_NAME}`;

  console.log('\nVoice activity detection');
  console.log(
    `  ${VAD_MODEL_NAME}  ${formatSize(VAD_MODEL_SIZE_BYTES)}  Lets whisper skip silence, ${status}`,
  );
}

/** Asks for numbers from a printed list, and returns the models they stand for. */
async function chooseModels(models, action) {
  const answer = await ask(
    `\nType the numbers of the models to ${action}, separated by spaces, or press Enter to cancel: `,
  );

  const chosen = [];
  for (const text of answer.split(/[\s,]+/).filter(Boolean)) {
    const number = Number(text);
    if (!Number.isInteger(number) || number < 1 || number > models.length) {
      throw new Error(`${text} is not one of the numbers in the list.`);
    }

    const model = models[number - 1];
    if (!chosen.includes(model)) {
      chosen.push(model);
    }
  }

  return chosen;
}

/** Returns the models with the given names, or throws naming the first one that is missing. */
function findModelsByName(models, names, describeMissing) {
  return names.map((name) => {
    const model = models.find((candidate) => candidate.name === name);
    if (!model) {
      throw new Error(describeMissing(name));
    }
    return model;
  });
}

function showInstalled() {
  const installed = getInstalledModels();
  console.log(`Models in ${getModelsDir()}`);

  if (installed.length === 0) {
    console.log('\nNo models are installed. Run the install command to choose some.');
  } else {
    printModels(installed);
    const totalBytes = installed.reduce((total, model) => total + model.size_bytes, 0);
    console.log(`\nTotal: ${formatSize(totalBytes)}`);
  }

  printVadModel();
}

async function showAvailable() {
  const online = await fetchOnlineModels();
  const installedNames = getInstalledModels().map((model) => model.name);

  console.log('Models you can install from Hugging Face');
  printModels(online, { installedNames });
  printVadModel();
}

async function downloadWithProgress(model) {
  console.log(`Downloading ${model.name} (${formatSize(model.size_bytes)})`);

  // Progress overwrites one line, which only makes sense in a terminal.
  let shownPercent = -1;
  function showProgress(receivedBytes, totalBytes) {
    if (!process.stdout.isTTY) {
      return;
    }

    const percent = Math.floor((receivedBytes / (totalBytes ?? model.size_bytes)) * 100);
    if (percent !== shownPercent) {
      shownPercent = percent;
      process.stdout.cursorTo(0);
      process.stdout.write(`  ${percent}%`);
    }
  }

  try {
    await installModel(model.name, showProgress);
  } finally {
    if (process.stdout.isTTY) {
      process.stdout.cursorTo(0);
      process.stdout.clearLine(0);
    }
  }

  console.log(`Installed ${model.name}`);
}

async function installVad() {
  if (isVadModelInstalled()) {
    console.log(`${VAD_MODEL_NAME} is already installed`);
    return;
  }

  console.log(`Downloading ${VAD_MODEL_NAME} (${formatSize(VAD_MODEL_SIZE_BYTES)})`);
  await installVadModel();
  console.log(`Installed ${VAD_MODEL_NAME}`);
}

async function deleteVad() {
  if (!isVadModelInstalled()) {
    console.log(`${VAD_MODEL_NAME} is not installed`);
    return;
  }

  const answer = await ask(`Delete ${VAD_MODEL_NAME}? Type y to confirm: `);
  if (answer.trim().toLowerCase() !== 'y') {
    console.log(`${VAD_MODEL_NAME} was not deleted.`);
    return;
  }

  await deleteVadModel();
  console.log(`Deleted ${VAD_MODEL_NAME}`);
}

/** Removes the VAD model's name from `names`, and says whether it was there. */
function takeVadName(names) {
  const index = names.indexOf(VAD_MODEL_NAME);
  if (index === -1) {
    return false;
  }

  names.splice(index, 1);
  return true;
}

async function installModels(names) {
  // The VAD model is not a whisper model, so it is installed on its own.
  if (takeVadName(names)) {
    await installVad();
    if (names.length === 0) {
      return;
    }
  }

  const online = await fetchOnlineModels();
  const installedNames = getInstalledModels().map((model) => model.name);

  let chosen;
  if (names.length > 0) {
    chosen = findModelsByName(
      online,
      names,
      (name) => `There is no model called ${name}. The available command lists every model.`,
    );
  } else {
    console.log('Models you can install from Hugging Face');
    printModels(online, { numbered: true, installedNames });
    chosen = await chooseModels(online, 'install');
  }

  if (chosen.length === 0) {
    console.log('Nothing was installed.');
    return;
  }

  for (const model of chosen) {
    if (installedNames.includes(model.name)) {
      console.log(`${model.name} is already installed`);
    } else {
      await downloadWithProgress(model);
    }
  }

  // The VAD model is under 1 MB and makes every transcription better, so it comes along.
  if (!isVadModelInstalled()) {
    console.log('Also installing the VAD model, which lets whisper skip silence');
    await installVad();
  }
}

async function deleteModels(names) {
  if (takeVadName(names)) {
    await deleteVad();
    if (names.length === 0) {
      return;
    }
  }

  const installed = getInstalledModels();
  if (installed.length === 0) {
    console.log(`No models are installed in ${getModelsDir()}`);
    return;
  }

  let chosen;
  if (names.length > 0) {
    chosen = findModelsByName(installed, names, (name) => `${name} is not installed.`);
  } else {
    console.log(`Models in ${getModelsDir()}`);
    printModels(installed, { numbered: true });
    chosen = await chooseModels(installed, 'delete');
  }

  if (chosen.length === 0) {
    console.log('Nothing was deleted.');
    return;
  }

  const summary = chosen.map((model) => `${model.name} (${formatSize(model.size_bytes)})`);
  const answer = await ask(`Delete ${summary.join(', ')}? Type y to confirm: `);
  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Nothing was deleted.');
    return;
  }

  for (const model of chosen) {
    await deleteModel(model.name);
    console.log(`Deleted ${model.name}`);
  }
}

const COMMANDS = {
  list: showInstalled,
  available: showAvailable,
  install: installModels,
  delete: deleteModels,
  help: () => console.log(USAGE),
};

/** Runs a model manager command, such as: install tiny.en small */
export async function run(args) {
  const [commandName = 'list', ...modelArgs] = args;

  // Names can be separated by commas as well as spaces, as in: install tiny.en, small
  const modelNames = modelArgs.flatMap((arg) => arg.split(',')).filter(Boolean);
  const command = COMMANDS[commandName];

  try {
    if (!command) {
      throw new Error(`Unknown command: ${commandName}\n\n${USAGE}`);
    }

    await command(modelNames);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    // An open reader keeps the process waiting for input.
    reader?.close();
  }
}
