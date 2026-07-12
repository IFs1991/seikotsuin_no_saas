#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');
const DEFAULT_MANIFEST = path.join(
  SCRIPT_DIR,
  'migration-history-baseline.sha256'
);
const MIGRATION_NAME_PATTERN = /^(\d{14})_[a-z0-9][a-z0-9_]*\.sql$/;

function parseArgs(argv) {
  let migrationsDir = DEFAULT_MIGRATIONS_DIR;
  let manifestPath = DEFAULT_MANIFEST;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--migrations-dir') {
      migrationsDir = path.resolve(argv[++index] ?? '');
      if (!argv[index]) throw new Error('--migrations-dir requires a value');
    } else if (value === '--manifest') {
      manifestPath = path.resolve(argv[++index] ?? '');
      if (!argv[index]) throw new Error('--manifest requires a value');
    } else {
      throw new Error(
        'Usage: verify-migration-history.mjs [--migrations-dir <path>] [--manifest <path>]'
      );
    }
  }

  return { manifestPath, migrationsDir };
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function parseMigrationName(filename) {
  const match = MIGRATION_NAME_PATTERN.exec(filename);
  return match ? match[1] : null;
}

function readBaseline(manifestPath) {
  const entries = readFileSync(manifestPath, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map((line, index) => {
      const match = /^([a-f0-9]{64})  (\S+)$/.exec(line);
      if (!match) {
        throw new Error(
          `Invalid baseline entry at line ${String(index + 1)}: ${line}`
        );
      }
      const [, hash, filename] = match;
      const version = parseMigrationName(filename);
      if (!version)
        throw new Error(`Invalid baseline migration name: ${filename}`);
      return { filename, hash, version };
    });

  if (entries.length === 0) throw new Error('Migration baseline is empty');
  return entries;
}

function verifyMigrationHistory({ manifestPath, migrationsDir }) {
  const baseline = readBaseline(manifestPath);
  const baselineByName = new Map(
    baseline.map(entry => [entry.filename, entry])
  );
  if (baselineByName.size !== baseline.length) {
    throw new Error('Migration baseline contains duplicate filenames');
  }
  const baselineVersions = new Set(baseline.map(entry => entry.version));
  if (baselineVersions.size !== baseline.length) {
    throw new Error('Migration baseline contains duplicate versions');
  }
  for (let index = 1; index < baseline.length; index += 1) {
    if (baseline[index - 1].version >= baseline[index].version) {
      throw new Error('Migration baseline must be strictly version-sorted');
    }
  }

  const latestBaselineVersion = baseline.at(-1)?.version;
  if (!latestBaselineVersion) throw new Error('Migration baseline is empty');

  const filenames = readdirSync(migrationsDir)
    .filter(filename => filename.endsWith('.sql'))
    .sort();
  const seenVersions = new Set();
  const errors = [];

  for (const filename of filenames) {
    const version = parseMigrationName(filename);
    if (!version) {
      errors.push(`invalid migration filename: ${filename}`);
      continue;
    }
    if (seenVersions.has(version)) {
      errors.push(`duplicate migration version: ${version}`);
    }
    seenVersions.add(version);

    const baselineEntry = baselineByName.get(filename);
    if (baselineEntry) {
      const actualHash = sha256File(path.join(migrationsDir, filename));
      if (actualHash !== baselineEntry.hash) {
        errors.push(`applied migration content changed: ${filename}`);
      }
      continue;
    }

    if (baselineVersions.has(version)) {
      errors.push(`applied migration renamed: ${filename}`);
    } else if (version <= latestBaselineVersion) {
      errors.push(`migration inserted before frozen history: ${filename}`);
    }
  }

  for (const entry of baseline) {
    if (!filenames.includes(entry.filename)) {
      errors.push(`applied migration missing: ${entry.filename}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return { baselineCount: baseline.length, migrationCount: filenames.length };
}

try {
  const result = verifyMigrationHistory(parseArgs(process.argv.slice(2)));
  console.log(
    `Migration history is append-only: ${String(result.baselineCount)} frozen, ${String(result.migrationCount - result.baselineCount)} appended.`
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration history contract failed:\n${message}`);
  process.exitCode = 1;
}
