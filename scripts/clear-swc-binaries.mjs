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
  console.log('[swc-clear] Current platform does not require cleanup.');
  process.exit(0);
}

const swcBaseDir = path.join(repoRoot, 'node_modules', '@next');
if (!fs.existsSync(swcBaseDir)) {
  console.log('[swc-clear] node_modules directory not found. Nothing to clean.');
  process.exit(0);
}

const expectedPackageSuffix = platform === 'win32' ? 'swc-win32-x64-msvc' : 'swc-linux-x64-gnu';
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

const removed = [];

for (const pkg of knownPackages) {
  if (pkg === expectedPackageSuffix) continue;
  const candidatePath = path.join(swcBaseDir, pkg);
  if (fs.existsSync(candidatePath)) {
    fs.rmSync(candidatePath, { recursive: true, force: true });
    removed.push(`@next/${pkg}`);
  }
}

if (removed.length === 0) {
  console.log('[swc-clear] No incompatible SWC binaries detected.');
} else {
  const context = isWSL ? 'WSL (Linux)' : platform;
  console.log(
    `[swc-clear] Removed incompatible SWC binaries for platform ${context}: ${removed.join(', ')}.`
  );
  console.log(
    '[swc-clear] Reinstall dependencies in this environment to restore the correct binary if needed (e.g., `npm install`).'
  );
}

process.exit(0);
