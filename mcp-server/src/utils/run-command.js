import { spawn } from 'node:child_process';

// Resolves with the exit details, even for a non-zero exit.
// Rejects only when the command cannot be started, for example when it is not installed.
export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

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
