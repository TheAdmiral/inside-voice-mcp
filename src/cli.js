#!/usr/bin/env node

/**
 * The inside-voice-mcp command.
 *
 * With no command it starts the MCP server, which is how MCP clients run it. The other
 * commands are for setting up the server from a terminal, such as installing models.
 */

import { cli, errors } from './strings.js';

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
    console.log(cli.usage);
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
    console.error(errors.unknownCommand(firstArg, cli.usage));
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
