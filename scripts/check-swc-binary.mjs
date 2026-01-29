#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const platform = process.platform;
const isWSL = platform === 'linux' && Boolean(process.env.WSL_DISTRO_NAME);

if (!['win32', 'linux'].includes(platform)) {
  process.exit(0);
}

const swcBaseDir = path.join(repoRoot, 'node_modules', '@next');
if (!fs.existsSync(swcBaseDir)) {
  // Dependencies not installed yet; nothing to verify.
  process.exit(0);
}

const knownPackages = [
  'swc-win32-ia32-msvc',
  'swc-win32-x64-msvc',
  'swc-win32-arm64-msvc',
  'swc-linux-x64-gnu',
  'swc-linux-x64-musl',
  'swc-linux-arm64-gnu',
  'swc-linux-arm64-musl',
  'swc-darwin-x64',
  'swc-darwin-arm64',
];

const installedPackages = knownPackages.filter(pkg =>
  fs.existsSync(path.join(swcBaseDir, pkg))
);

const allowedPackages =
  platform === 'win32'
    ? [
        'swc-win32-ia32-msvc',
        'swc-win32-x64-msvc',
        'swc-win32-arm64-msvc',
      ]
    : [
        'swc-linux-x64-gnu',
        'swc-linux-x64-musl',
        'swc-linux-arm64-gnu',
        'swc-linux-arm64-musl',
      ];

const mismatchedPackages = installedPackages.filter(
  pkg => !allowedPackages.includes(pkg)
);

const issues = [];

if (
  installedPackages.length > 0 &&
  !installedPackages.some(pkg => allowedPackages.includes(pkg))
) {
  issues.push(
    `Expected SWC binary for the current environment is not installed.`
  );
}

if (mismatchedPackages.length > 0) {
  issues.push(
    `Found incompatible SWC binaries in node_modules: ${mismatchedPackages
      .map(name => `'@next/${name}'`)
      .join(', ')}.`
  );
}

if (issues.length > 0) {
  const context = isWSL ? 'WSL (Linux)' : platform;
  console.error('[swc-check]');
  console.error(
    `[swc-check] Detected platform: ${context}. To avoid mixing Windows and WSL binaries, install dependencies inside each environment separately.`
  );
  for (const issue of issues) {
    console.error(`[swc-check] ${issue}`);
  }
  console.error(
    "[swc-check] Remove 'node_modules' and run 'npm install' inside this environment, or run 'npm run swc:clear' then reinstall."
  );
  process.exit(1);
}

process.exit(0);
