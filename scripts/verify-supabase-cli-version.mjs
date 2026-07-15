#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const VERSION_FILE = path.join(REPO_ROOT, '.supabase-cli-version');
const TELEMETRY_DISABLED_ENV = {
  ...process.env,
  DO_NOT_TRACK: '1',
  SUPABASE_TELEMETRY_DISABLED: '1',
};

export function readPinnedSupabaseCliVersion() {
  const version = readFileSync(VERSION_FILE, 'utf8').trim();

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `.supabase-cli-version must contain one exact semantic version; received ${JSON.stringify(version)}`
    );
  }

  return version;
}

export function resolveSupabaseCliInvocation(args) {
  const cliJavaScriptPath = process.env.SUPABASE_CLI_JS_PATH?.trim();
  if (!cliJavaScriptPath) {
    return { command: 'supabase', args };
  }

  if (
    !path.isAbsolute(cliJavaScriptPath) ||
    path.extname(cliJavaScriptPath).toLowerCase() !== '.js'
  ) {
    throw new Error(
      'SUPABASE_CLI_JS_PATH must be an absolute JavaScript file path'
    );
  }

  return {
    command: process.execPath,
    args: [cliJavaScriptPath, ...args],
  };
}

export function readInstalledSupabaseCliVersion() {
  const invocation = resolveSupabaseCliInvocation(['--version']);
  return execFileSync(invocation.command, invocation.args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: TELEMETRY_DISABLED_ENV,
    timeout: 30_000,
    windowsHide: true,
  }).trim();
}

export function assertPinnedSupabaseCliVersion() {
  const expected = readPinnedSupabaseCliVersion();
  const actual = readInstalledSupabaseCliVersion();

  if (actual !== expected) {
    throw new Error(
      `Supabase CLI version mismatch: expected ${expected} from .supabase-cli-version, received ${actual}`
    );
  }

  return expected;
}

function main(argv) {
  if (argv.length === 1 && argv[0] === '--print') {
    console.log(readPinnedSupabaseCliVersion());
    return;
  }

  if (argv.length !== 0) {
    throw new Error('Usage: verify-supabase-cli-version.mjs [--print]');
  }

  const version = assertPinnedSupabaseCliVersion();
  console.log(`Supabase CLI ${version} matches .supabase-cli-version.`);
}

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[supabase:cli] ${message}`);
    process.exitCode = 1;
  }
}
