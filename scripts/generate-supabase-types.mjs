#!/usr/bin/env node
/**
 * supabase:types 生成ラッパー
 * - pinned Supabase CLI で local/explicit remote target から生成
 * - supabase gen types の出力からログ混入を除去
 * - 生成後に先頭行と必須tableを検証
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';

import { preserveCommittedPostgrestVersion } from './lib/supabase-generated-types.mjs';
import { assertPinnedSupabaseCliVersion } from './verify-supabase-cli-version.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT_FILE = path.join(REPO_ROOT, 'src/types/supabase.ts');

function parseArgs(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === '--local')) {
    return {
      cliTarget: ['--local'],
      cliCwd: REPO_ROOT,
      preserveRuntimeVersion: true,
    };
  }

  if (argv.length === 2 && argv[0] === '--project-id' && argv[1]) {
    return {
      cliTarget: ['--project-id', argv[1]],
      cliCwd: REPO_ROOT,
      preserveRuntimeVersion: false,
    };
  }

  if (argv.length === 2 && argv[0] === '--workdir' && argv[1]) {
    return {
      cliTarget: ['--local'],
      cliCwd: path.resolve(argv[1]),
      preserveRuntimeVersion: true,
    };
  }

  throw new Error(
    'Usage: generate-supabase-types.mjs [--local|--project-id <ref>|--workdir <path>]'
  );
}

try {
  const { cliTarget, cliCwd, preserveRuntimeVersion } = parseArgs(
    process.argv.slice(2)
  );
  const cliVersion = assertPinnedSupabaseCliVersion();
  console.log(
    `[supabase:types] Generating types with Supabase CLI ${cliVersion}...`
  );

  const raw = execFileSync(
    'supabase',
    ['gen', 'types', 'typescript', ...cliTarget, '--schema', 'public'],
    {
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
    }
  );

  // Filter: keep only lines that are part of the TypeScript type definition
  const lines = raw.split('\n');
  const startIdx = lines.findIndex(l =>
    l.trimStart().startsWith('export type Json')
  );

  if (startIdx === -1) {
    console.error(
      '[supabase:types] ERROR: Generated output does not contain "export type Json".'
    );
    console.error('[supabase:types] First 5 lines of output:');
    lines.slice(0, 5).forEach(l => console.error('  ' + l));
    process.exit(1);
  }

  const cleanOutput = lines.slice(startIdx).join('\n').trimEnd() + '\n';
  const prettierConfig = (await resolveConfig(OUTPUT_FILE)) ?? {};
  const formattedGeneratedOutput = await format(cleanOutput, {
    ...prettierConfig,
    filepath: OUTPUT_FILE,
  });
  let contractOutput = formattedGeneratedOutput;

  if (preserveRuntimeVersion) {
    const committedOutput = readFileSync(OUTPUT_FILE, 'utf8');
    const preserved = preserveCommittedPostgrestVersion(
      formattedGeneratedOutput,
      committedOutput
    );
    contractOutput = preserved.content;

    if (preserved.changed) {
      const generatedRuntime =
        preserved.generatedVersion ?? 'not reported by DB-only typegen';
      console.log(
        '[supabase:types] Preserving committed remote PostgREST runtime metadata ' +
          `${preserved.committedVersion}; local source reports ${generatedRuntime}.`
      );
    }
  }

  writeFileSync(OUTPUT_FILE, contractOutput, 'utf8');

  // Validate
  const written = readFileSync(OUTPUT_FILE, 'utf-8');
  const firstLine = written.split('\n')[0].trim();

  if (firstLine !== 'export type Json =') {
    console.error(
      `[supabase:types] VALIDATION FAILED: first line is "${firstLine}"`
    );
    process.exit(1);
  }

  // Check required tables
  const requiredTables = [
    'clinics',
    'reservations',
    'blocks',
    'security_events',
    'user_permissions',
  ];
  const missing = requiredTables.filter(
    t => !written.includes(`      ${t}: {`)
  );

  if (missing.length > 0) {
    console.error(
      `[supabase:types] VALIDATION FAILED: missing tables: ${missing.join(', ')}`
    );
    process.exit(1);
  }

  console.log(`[supabase:types] OK - written to ${OUTPUT_FILE}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[supabase:types] Generation failed:', message);
  process.exit(1);
}
