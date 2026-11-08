import { spawn } from 'node:child_process';

// Resolves with the exit details, even for a non-zero exit.
// Rejects only when the command cannot be started, for example when it is not installed.
// Pass `input` to send text to the command on stdin.
export function runCommand(command, args, options = {}) {
  const { input, ...spawnOptions } = options;
  const stdin = input === undefined ? 'ignore' : 'pipe';

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...spawnOptions, stdio: [stdin, 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    if (input !== undefined) {
      // A command that exits without reading stdin is reported through its exit code instead.
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (text) => {
      stdout += text;
    });
    child.stderr.on('data', (text) => {
      stderr += text;
    });

    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}
