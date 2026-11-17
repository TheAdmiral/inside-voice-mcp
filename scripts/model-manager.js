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
import { errors, modelManager } from '../src/strings.js';

const USAGE = modelManager.usage(VAD_MODEL_NAME);

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
    const heading = isRegularModel(model.name)
      ? modelManager.regularModelsHeading
      : modelManager.advancedModelsHeading;
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
      const mark = installedNames.includes(model.name) ? modelManager.installedMark : '';
      columns.push(mark.padEnd(modelManager.installedMark.length));
    }
    columns.push(describeModel(model.name));

    console.log(`  ${columns.join('  ')}`);
  }
}

function printVadModel() {
  const status = isVadModelInstalled()
    ? modelManager.vadModelInstalledStatus
    : modelManager.vadModelInstallStatus(VAD_MODEL_NAME);

  console.log(`\n${modelManager.vadModelHeading}`);
  const size = formatSize(VAD_MODEL_SIZE_BYTES);
  console.log(`  ${VAD_MODEL_NAME}  ${size}  ${modelManager.vadModelDescription(status)}`);
}

/**
 * Asks `question` about a printed list of numbered models, and returns the models whose
 * numbers are typed.
 */
async function chooseModels(models, question) {
  const answer = await ask(`\n${question}`);

  const chosen = [];
  for (const text of answer.split(/[\s,]+/).filter(Boolean)) {
    const number = Number(text);
    if (!Number.isInteger(number) || number < 1 || number > models.length) {
      throw new Error(modelManager.notANumberInTheList(text));
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
  console.log(modelManager.modelsIn(getModelsDir()));

  if (installed.length === 0) {
    console.log(`\n${modelManager.noModelsInstalled}`);
  } else {
    printModels(installed);
    const totalBytes = installed.reduce((total, model) => total + model.size_bytes, 0);
    console.log(`\n${modelManager.total(formatSize(totalBytes))}`);
  }

  printVadModel();
}

async function showAvailable() {
  const online = await fetchOnlineModels();
  const installedNames = getInstalledModels().map((model) => model.name);

  console.log(modelManager.modelsYouCanInstall);
  printModels(online, { installedNames });
  printVadModel();
}

async function downloadWithProgress(model) {
  console.log(modelManager.downloading(model.name, formatSize(model.size_bytes)));

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

  console.log(modelManager.installed(model.name));
}

async function installVad() {
  if (isVadModelInstalled()) {
    console.log(modelManager.alreadyInstalled(VAD_MODEL_NAME));
    return;
  }

  console.log(modelManager.downloading(VAD_MODEL_NAME, formatSize(VAD_MODEL_SIZE_BYTES)));
  await installVadModel();
  console.log(modelManager.installed(VAD_MODEL_NAME));
}

function isConfirmed(answer) {
  return answer.trim().toLowerCase() === modelManager.confirmAnswer;
}

async function deleteVad() {
  if (!isVadModelInstalled()) {
    console.log(modelManager.vadModelNotInstalled(VAD_MODEL_NAME));
    return;
  }

  const answer = await ask(modelManager.confirmDelete(VAD_MODEL_NAME));
  if (!isConfirmed(answer)) {
    console.log(modelManager.notDeleted(VAD_MODEL_NAME));
    return;
  }

  await deleteVadModel();
  console.log(modelManager.deleted(VAD_MODEL_NAME));
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
    chosen = findModelsByName(online, names, modelManager.noModelCalled);
  } else {
    console.log(modelManager.modelsYouCanInstall);
    printModels(online, { numbered: true, installedNames });
    chosen = await chooseModels(online, modelManager.chooseModelsToInstall);
  }

  if (chosen.length === 0) {
    console.log(modelManager.nothingInstalled);
    return;
  }

  for (const model of chosen) {
    if (installedNames.includes(model.name)) {
      console.log(modelManager.alreadyInstalled(model.name));
    } else {
      await downloadWithProgress(model);
    }
  }

  // The VAD model is under 1 MB and makes every transcription better, so it comes along.
  if (!isVadModelInstalled()) {
    console.log(modelManager.alsoInstallingVadModel);
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
    console.log(modelManager.noModelsInstalledIn(getModelsDir()));
    return;
  }

  let chosen;
  if (names.length > 0) {
    chosen = findModelsByName(installed, names, modelManager.modelNotInstalled);
  } else {
    console.log(modelManager.modelsIn(getModelsDir()));
    printModels(installed, { numbered: true });
    chosen = await chooseModels(installed, modelManager.chooseModelsToDelete);
  }

  if (chosen.length === 0) {
    console.log(modelManager.nothingDeleted);
    return;
  }

  const summary = chosen.map((model) => `${model.name} (${formatSize(model.size_bytes)})`);
  const answer = await ask(modelManager.confirmDelete(summary.join(', ')));
  if (!isConfirmed(answer)) {
    console.log(modelManager.nothingDeleted);
    return;
  }

  for (const model of chosen) {
    await deleteModel(model.name);
    console.log(modelManager.deleted(model.name));
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
      throw new Error(errors.unknownCommand(commandName, USAGE));
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
