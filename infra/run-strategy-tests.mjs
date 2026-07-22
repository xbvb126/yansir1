import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const unittestArgs = ['-m', 'unittest', 'discover', 'services/strategy/tests', '-t', 'services/strategy', '-v'];
const python = resolvePython();
const args = [...python.prefixArgs, ...unittestArgs];

if (process.argv.includes('--print-command')) {
  console.log([python.command, ...args].join(' '));
  process.exit(0);
}

const result = spawnSync(python.command, args, {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(`Unable to start Python strategy tests with ${python.command}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

function resolvePython() {
  if (process.env.PYTHON_BIN) {
    return { command: process.env.PYTHON_BIN, prefixArgs: [] };
  }

  const virtualEnvironment = process.platform === 'win32'
    ? path.join(repoRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(repoRoot, '.venv', 'bin', 'python');
  if (existsSync(virtualEnvironment)) {
    return { command: virtualEnvironment, prefixArgs: [] };
  }

  return process.platform === 'win32'
    ? { command: 'py', prefixArgs: ['-3'] }
    : { command: 'python3', prefixArgs: [] };
}
