import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

function resolveJestCommand() {
  const jestCli = path.join(rootDir, 'node_modules', 'jest', 'bin', 'jest.js');
  if (existsSync(jestCli)) {
    return { command: process.execPath, argsPrefix: [jestCli] };
  }

  const binName = process.platform === 'win32' ? 'jest.cmd' : 'jest';
  return {
    command: path.join(rootDir, 'node_modules', '.bin', binName),
    argsPrefix: [],
  };
}

function injectRunInBand(args) {
  if (args.includes('--runInBand')) return args;
  const markerIndex = args.indexOf('--');
  if (markerIndex === -1) {
    return [...args, '--runInBand'];
  }
  return [
    ...args.slice(0, markerIndex),
    '--runInBand',
    ...args.slice(markerIndex),
  ];
}

const { command, argsPrefix } = resolveJestCommand();
const userArgs = process.argv.slice(2);
const args =
  process.platform === 'win32' ? injectRunInBand(userArgs) : userArgs;

const child = spawn(command, [...argsPrefix, ...args], { stdio: 'inherit' });
child.on('error', error => {
  console.error('Failed to start jest:', error);
  process.exit(1);
});
child.on('exit', code => {
  process.exit(code ?? 1);
});
