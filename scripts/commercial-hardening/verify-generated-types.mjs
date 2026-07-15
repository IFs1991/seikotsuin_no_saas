#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

import {
  normalizePostgrestVersion,
  readPostgrestVersion,
} from '../lib/supabase-generated-types.mjs';
import {
  assertPinnedSupabaseCliVersion,
  resolveSupabaseCliInvocation,
} from '../verify-supabase-cli-version.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const COMMITTED_TYPES = path.join(REPO_ROOT, 'src/types/supabase.ts');
const EVIDENCE_DIR = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening'
);

function parseArgs(argv) {
  let target = null;
  let projectId = null;
  let cliCwd = REPO_ROOT;
  let allowPostgrestVersionDrift = false;
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--local' || value === '--linked') {
      if (target) throw new Error('Choose exactly one database target');
      target = value;
    } else if (value === '--project-id') {
      if (target || projectId)
        throw new Error('Choose exactly one database target');
      projectId = argv[++index];
      if (!projectId) throw new Error('--project-id requires a value');
    } else if (value === '--write') {
      write = true;
    } else if (value === '--workdir') {
      const workdir = argv[++index];
      if (!workdir) throw new Error('--workdir requires a value');
      cliCwd = path.resolve(workdir);
    } else if (value === '--allow-postgrest-version-drift') {
      allowPostgrestVersionDrift = true;
    } else {
      throw new Error(
        'Usage: verify-generated-types.mjs (--local|--linked|--project-id <ref>) [--workdir <path>] [--allow-postgrest-version-drift] [--write]'
      );
    }
  }

  if (!target && !projectId) {
    throw new Error(
      'Usage: verify-generated-types.mjs (--local|--linked|--project-id <ref>) [--workdir <path>] [--allow-postgrest-version-drift] [--write]'
    );
  }
  return {
    cliTarget: projectId ? ['--project-id', projectId] : [target],
    cliCwd,
    allowPostgrestVersionDrift,
    targetName: target === '--local' ? 'local' : 'remote',
    write,
  };
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function generateTypes(cliTarget, cliCwd) {
  const invocation = resolveSupabaseCliInvocation([
    'gen',
    'types',
    '--lang',
    'typescript',
    ...cliTarget,
    '--schema',
    'public',
  ]);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: cliCwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      DO_NOT_TRACK: '1',
      SUPABASE_TELEMETRY_DISABLED: '1',
    },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      'Supabase type generation failed with status ' +
        String(result.status) +
        ': ' +
        result.stderr.trim()
    );
  }

  const lines = result.stdout.split(/\r?\n/);
  const start = lines.findIndex(line =>
    line.trimStart().startsWith('export type Json')
  );
  if (start < 0) {
    throw new Error('Generated output does not contain export type Json');
  }
  return lines.slice(start).join('\n').trimEnd() + '\n';
}

const args = parseArgs(process.argv.slice(2));
assertPinnedSupabaseCliVersion();
const prettierConfig = (await resolveConfig(COMMITTED_TYPES)) ?? {};
const generated = await format(generateTypes(args.cliTarget, args.cliCwd), {
  ...prettierConfig,
  filepath: COMMITTED_TYPES,
});
const committed = readFileSync(COMMITTED_TYPES, 'utf8');
const generatedHash = sha256(generated);
const committedHash = sha256(committed);

if (args.write) {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    path.join(EVIDENCE_DIR, 'types-' + args.targetName + '.sha256'),
    generatedHash + '  generated-types:' + args.targetName + '\n',
    'utf8'
  );
  writeFileSync(
    path.join(EVIDENCE_DIR, 'types-committed.sha256'),
    committedHash + '  src/types/supabase.ts\n',
    'utf8'
  );
}

if (generatedHash !== committedHash) {
  const normalizedGenerated = normalizePostgrestVersion(generated);
  const normalizedCommitted = normalizePostgrestVersion(committed);

  if (
    args.allowPostgrestVersionDrift &&
    normalizedGenerated === normalizedCommitted
  ) {
    console.log(
      'Generated ' +
        args.targetName +
        ' schema matches the committed types; only explicit PostgREST runtime metadata differs (' +
        String(readPostgrestVersion(generated)) +
        ' != ' +
        String(readPostgrestVersion(committed)) +
        ').'
    );
    process.exit(0);
  }

  console.error(
    'RED COMM-TYPES-001: committed types differ from ' +
      args.targetName +
      ' generated types (' +
      committedHash +
      ' != ' +
      generatedHash +
      ')'
  );
  process.exitCode = 1;
} else {
  console.log(
    'Generated ' + args.targetName + ' types match the committed file.'
  );
}
