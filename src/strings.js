/**
 * All the text that people see: tool descriptions, tool output, error messages, log messages
 * and command output.
 *
 * Text with a value in it, such as a model name, is a function that takes the value.
 *
 * This file imports nothing, so that any other file can import it.
 */

export const toolDescriptions = {
  transcribe:
    'Transcribe an audio file of any length to text using whisper.cpp, with automatic format ' +
    'conversion and optional speaker identification',
  listModels:
    'List installed whisper models, and the regular models that are not installed, with ' +
    'sizes and performance recommendations',
  healthCheck: 'Check whisper.cpp installation and system configuration',
  version: 'Get server version information. Use list_models to see the models',
};

export const optionDescriptions = {
  audioPath: 'Path to the audio file to transcribe',
  options: 'Transcription options',
  autoConvert: 'Automatically convert unsupported formats to WAV',
  model:
    'Model to use. Advanced models also work once installed. list_models shows what is installed',
  vad:
    'Skip the parts without speech, which is faster and avoids made-up text in silences. ' +
    'Used by default when the VAD model is installed',
  vocabulary:
    'Names and terms to spell correctly, such as company or product names. ' +
    'whisper is more likely to write them this way, but it is not guaranteed',
  diarize: 'Identify who is speaking in each segment',
  minSpeakers: 'Fewest speakers to look for',
  maxSpeakers: 'Most speakers to look for',
  useMps: 'Use MPS acceleration on Apple Silicon when identifying speakers',
};

export const modelDescriptions = {
  regular: {
    'tiny.en': 'Smallest English-only model, fastest processing',
    tiny: 'Smallest multilingual model, fastest processing',
    'base.en': 'Balanced English-only model, good speed/accuracy trade-off',
    base: 'Balanced multilingual model, good speed/accuracy trade-off',
    'small.en': 'Higher accuracy English-only model',
    small: 'Higher accuracy multilingual model',
    'medium.en': 'High accuracy English-only model, slower and larger',
    medium: 'High accuracy multilingual model, slower and larger',
    'large-v1': 'First large multilingual model, replaced by large-v2 and large-v3',
    'large-v2': 'Large multilingual model, very accurate but slow',
    'large-v3': 'Latest large multilingual model, the most accurate and the slowest',
    'large-v3-turbo': 'Much faster version of large-v3, nearly as accurate',
  },
  recommendedAccurate:
    'large-v3-turbo quantised to q8_0: recommended for accuracy, faster and smaller than large-v3',
  quantised: (baseModel, quantisation) =>
    `${baseModel} quantised to ${quantisation}: smaller, uses less memory, slightly less accurate`,
  advanced: 'Advanced model',
  multilingualLanguages: '99 languages',
};

export const listModels = {
  downloadNote: (model) =>
    `Install with the model manager: inside-voice-mcp models install ${model}`,
  modelManagerInstructions:
    'Run inside-voice-mcp models available to see every model with its size, including ' +
    'advanced models, then inside-voice-mcp models install <model>',
  modelsDirectory: (directory) => `Models are stored in: ${directory}`,
};

export const healthCheck = {
  whisperNotInstalled: 'whisper.cpp not installed or not in PATH',
  installWhisper: 'Install whisper.cpp: brew install whisper-cpp',
  noModels: 'No whisper models found',
  installModel: (model) => `Install a model: inside-voice-mcp models install ${model}`,
  storeToken: 'For speaker diarization, store a HuggingFace token: inside-voice-mcp setup-token',
  installVadModel:
    'To skip silence, which is faster and more accurate, install the VAD model: ' +
    'inside-voice-mcp models install vad',
  recommendedThreads: (threads) => `Recommended thread count: ${threads}`,
};

export const version = {
  description: 'whisper.cpp MCP server for local speech-to-text transcription',
  capabilities: [
    'audio transcription',
    'multiple output formats',
    'Apple Silicon optimisation',
    'local processing',
  ],
};

export const warnings = {
  vocabularyTooLong: (maxTokens) =>
    `The vocabulary may be too long. whisper reads about ${maxTokens} tokens of it, ` +
    'so some terms may be ignored. Keep it to the terms this recording needs',
};

export const errors = {
  // Starting the server
  unknownCommand: (command, usage) => `Unknown command: ${command}\n\n${usage}`,
  portWithoutHttp: (port) =>
    `--port only works with --http, as in: inside-voice-mcp --http --port ${port}`,
  invalidPort: (port) => `--port must be a whole number from 1 to 65535, not "${port}"`,
  portInUse: (port) => `Port ${port} is already in use. Choose another with --http --port <number>`,

  // Calling tools
  unknownTool: (name) => `Unknown tool: ${name}`,
  toolFailed: (message) => `Tool execution failed: ${message}`,
  invalidModelNameCharacters:
    'Model names can only contain letters, numbers, dots, dashes and underscores',
  minSpeakersAboveMax: 'min_speakers cannot be greater than max_speakers',

  // The HTTP server
  notFound: (mcpPath) => `Not found. The MCP endpoint is ${mcpPath}`,
  invalidHost: (host) => `Invalid Host header: ${host}`,
  methodNotAllowed: 'Method not allowed',
  internalServerError: 'Internal server error',

  // Models
  invalidModelName: (name) => `'${name}' is not a valid model name`,
  couldNotReachHuggingFace: (message) =>
    `Could not reach Hugging Face to list the models: ${message}`,
  couldNotListModels: (status) => `Could not list the models on Hugging Face: HTTP ${status}`,
  couldNotDownload: (what, status) => `Could not download ${what}: HTTP ${status}`,
  theVadModel: 'the VAD model',
  notInstalled: (name) => `${name} is not installed`,
  vadModelNotInstalled: 'The VAD model is not installed',

  // Transcribing
  audioFileNotFound: (path) => `Audio file not found: ${path}`,
  transcriptionFailed: (message, helpText) => `Transcription failed: ${message}${helpText}`,
  modelNotInstalled: (model, modelsDirectory) =>
    `Model '${model}' is not installed in ${modelsDirectory}. ` +
    `Install it with: inside-voice-mcp models install ${model}`,
  vadModelNeeded:
    'The VAD model is not installed. Install it with: inside-voice-mcp models install vad',
  whisperFailed: (stderr) => `Whisper process failed: ${stderr}`,

  // Converting audio
  afconvertExited: (exitCode) => `afconvert exited with code ${exitCode}`,
  ffmpegExited: (exitCode) => `ffmpeg exited with code ${exitCode}`,
  macOsCouldNotRead: (afconvertError) =>
    `Audio conversion failed: macOS could not read this file (${afconvertError}). ` +
    'For other formats, install ffmpeg with: brew install ffmpeg',
  conversionFailed: (ffmpegError) => `Audio conversion failed: ${ffmpegError}`,

  // Speaker diarization
  uvNeeded: 'Speaker diarization requires uv (brew install uv).',
  diarizationScriptCouldNotRun: (message) => `Script execution failed: ${message}`,
  diarizationScriptFailed: (exitCode, output) =>
    `Diarization script failed (exit code ${exitCode}): ${output}`,
  diarizationNoResult: 'The diarization script gave no valid result.',
  diarizationSetupHelp: `

Setup Help:
- Follow the Speaker Diarization Setup section of the README
- Store your HuggingFace token for Pyannote models: inside-voice-mcp setup-token`,
  diarizationProcessingHelp: `

This may be due to audio format issues or model loading problems.
Try with a different audio file or check your Python environment.`,

  // The HuggingFace token
  configFileTooOpen: (configPath) =>
    `${configPath} can be read by other users. Fix it with: chmod 600 ${configPath}`,
  configFileNotJson: (configPath) => `${configPath} is not valid JSON.`,
  notAHuggingFaceToken: 'That does not look like a HuggingFace token.',
};

// Messages for the server log, which goes to stderr.
export const logs = {
  runningOnStdio: 'Inside Voice MCP server running on stdio',
  runningAt: (url) => `Inside Voice MCP server running at ${url}`,
  startupFailed: 'Server startup failed:',
  uncaughtException: 'Uncaught exception:',
  unhandledRejectionAt: 'Unhandled rejection at:',
  unhandledRejectionReason: 'reason:',
  mcpError: '[MCP Error]',
  httpError: '[HTTP Error]',
  whisperCommand: (commandLine) => `[Whisper] Executing: ${commandLine}`,
  afconvertFallback: '[Audio] afconvert could not read the file, so trying ffmpeg',
  diarizationStarting: '[Diarization] Running speaker diarization...',
  diarizationUsingPython: (python) => `[Diarization] Using Python: ${python}`,
  diarizationUsingUv: '[Diarization] Using uv',
  diarizationAudio: (audioPath) => `[Diarization] Diarizing ${audioPath}`,
};

export const cli = {
  usage: `Inside Voice: local speech-to-text transcription for MCP clients.

Usage:
  inside-voice-mcp                     Start the MCP server over stdio, for MCP clients
  inside-voice-mcp --http [--port N]   Start the MCP server on http://127.0.0.1:3700/mcp
  inside-voice-mcp models [command]    List, install and delete whisper models
  inside-voice-mcp setup-diarization   Download the speaker diarisation packages
  inside-voice-mcp setup-token         Store a HuggingFace token for speaker diarisation
  inside-voice-mcp help                Show this help

Run inside-voice-mcp models help to see the model commands.`,
};

export const modelManager = {
  usage: (vadModelName) => `Manage the whisper models Inside Voice uses.

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

The VAD model, called ${vadModelName}, lets whisper skip the parts without speech, which is
faster and avoids made-up text in silences. It is installed along with any whisper model,
or on its own with: inside-voice-mcp models install ${vadModelName}`,

  // Lists of models
  regularModelsHeading: 'Regular models',
  advancedModelsHeading: 'Advanced models',
  installedMark: 'installed',
  modelsIn: (modelsDirectory) => `Models in ${modelsDirectory}`,
  modelsYouCanInstall: 'Models you can install from Hugging Face',
  noModelsInstalled: 'No models are installed. Run the install command to choose some.',
  noModelsInstalledIn: (modelsDirectory) => `No models are installed in ${modelsDirectory}`,
  total: (size) => `Total: ${size}`,
  vadModelHeading: 'Voice activity detection',
  vadModelDescription: (status) => `Lets whisper skip silence, ${status}`,
  vadModelInstalledStatus: 'installed',
  vadModelInstallStatus: (vadModelName) =>
    `install it with: inside-voice-mcp models install ${vadModelName}`,

  // Choosing models
  chooseModelsToInstall:
    'Type the numbers of the models to install, separated by spaces, or press Enter to cancel: ',
  chooseModelsToDelete:
    'Type the numbers of the models to delete, separated by spaces, or press Enter to cancel: ',
  notANumberInTheList: (text) => `${text} is not one of the numbers in the list.`,
  noModelCalled: (name) =>
    `There is no model called ${name}. The available command lists every model.`,
  modelNotInstalled: (name) => `${name} is not installed.`,

  // Installing
  downloading: (name, size) => `Downloading ${name} (${size})`,
  installed: (name) => `Installed ${name}`,
  alreadyInstalled: (name) => `${name} is already installed`,
  alsoInstallingVadModel: 'Also installing the VAD model, which lets whisper skip silence',
  nothingInstalled: 'Nothing was installed.',

  // Deleting
  confirmDelete: (what) => `Delete ${what}? Type y to confirm: `,
  // What has to be typed to confirm, which confirmDelete asks for.
  confirmAnswer: 'y',
  vadModelNotInstalled: (vadModelName) => `${vadModelName} is not installed`,
  notDeleted: (name) => `${name} was not deleted.`,
  deleted: (name) => `Deleted ${name}`,
  nothingDeleted: 'Nothing was deleted.',
};

export const setup = {
  // setup-diarization
  downloadingDiarizationPackages:
    'Downloading Python and the speaker diarization packages (about 1.5 GB)',
  couldNotRunUv: (message) => `Could not run uv: ${message}. Install it with: brew install uv`,
  diarizationPackagesReady: 'Speaker diarization packages are ready',

  // setup-token
  tokenPrompt: 'HuggingFace token (input is hidden): ',
  noTokenEntered: 'No token entered, so nothing was saved.',
  savedToKeychain: 'Saved your HuggingFace token to the macOS Keychain.',
  keychainUnavailable: 'The macOS Keychain was not available.',
  savedToFile: (configPath) =>
    `Saved your HuggingFace token to ${configPath}, readable only by you.`,
  keychainTokenStillUsed: `A token in the Keychain is still used instead. Remove it with:
  security delete-generic-password -s inside-voice-mcp -a HF_TOKEN`,
};

// The Claude Desktop extension built by scripts/build-mcpb.js.
export const bundle = {
  displayName: 'Inside Voice',
  description: 'Local speech-to-text with whisper.cpp, with optional speaker identification.',
  longDescription:
    'Transcribes audio files on your Mac with whisper.cpp. Nothing is sent to the cloud.\n\n' +
    'This extension starts the Inside Voice server installed by Homebrew. Install that first:\n\n' +
    '    brew install TheAdmiral/tap/inside-voice\n' +
    '    inside-voice-mcp models install base.en',
  built: (bundlePath) => `Built ${bundlePath}`,
};
