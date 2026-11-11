#!/usr/bin/env node

/**
 * The inside-voice-mcp command.
 *
 * With no command it starts the MCP server, which is how MCP clients run it. The other
 * commands are for setting up the server from a terminal, such as installing models.
 */

const USAGE = `Inside Voice: local speech-to-text transcription for MCP clients.

Usage:
  inside-voice-mcp                     Start the MCP server over stdio, for MCP clients
  inside-voice-mcp --http [--port N]   Start the MCP server on http://127.0.0.1:3700/mcp
  inside-voice-mcp models [command]    List, install and delete whisper models
  inside-voice-mcp setup-diarization   Download the speaker diarisation packages
  inside-voice-mcp setup-token         Store a HuggingFace token for speaker diarisation
  inside-voice-mcp help                Show this help

Run inside-voice-mcp models help to see the model commands.`;

// Each command is loaded only when it is used, so starting the server loads nothing extra.
const COMMANDS = {
  models: () => import('../scripts/model-manager.js'),
  'setup-diarization': () => import('../scripts/setup-diarization.js'),
  'setup-token': () => import('../scripts/setup-huggingface-auth.js'),
};

const HELP_ARGS = ['help', '--help', '-h'];

async function main(args) {
  const [firstArg, ...restOfArgs] = args;

  if (HELP_ARGS.includes(firstArg)) {
    console.log(USAGE);
    return;
  }

  // No command, or only options such as --http, starts the server.
  if (firstArg === undefined || firstArg.startsWith('-')) {
    const { startServer } = await import('./index.js');
    await startServer(args);
    return;
  }

  const loadCommand = COMMANDS[firstArg];
  if (!loadCommand) {
    console.error(`Unknown command: ${firstArg}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const command = await loadCommand();
  await command.run(restOfArgs);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
