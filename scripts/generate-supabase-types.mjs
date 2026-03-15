#!/usr/bin/env node
/**
 * supabase:types 生成ラッパー
 * - supabase gen types の出力からログ混入を除去
 * - 生成後に先頭行が `export type Json` であることを検証
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const OUTPUT_FILE = resolve(import.meta.dirname, '../src/types/supabase.ts');

try {
  console.log('[supabase:types] Generating types...');

  const raw = execSync('supabase gen types typescript --local --schema public', {
    encoding: 'utf-8',
    timeout: 30_000,
  });

  // Filter: keep only lines that are part of the TypeScript type definition
  const lines = raw.split('\n');
  const startIdx = lines.findIndex((l) => l.trimStart().startsWith('export type Json'));

  if (startIdx === -1) {
    console.error('[supabase:types] ERROR: Generated output does not contain "export type Json".');
    console.error('[supabase:types] First 5 lines of output:');
    lines.slice(0, 5).forEach((l) => console.error('  ' + l));
    process.exit(1);
  }

  const cleanOutput = lines.slice(startIdx).join('\n').trimEnd() + '\n';

  writeFileSync(OUTPUT_FILE, cleanOutput, 'utf-8');
  execSync(`npx prettier --write "${OUTPUT_FILE}"`, {
    stdio: 'ignore',
    timeout: 30_000,
  });

  // Validate
  const written = readFileSync(OUTPUT_FILE, 'utf-8');
  const firstLine = written.split('\n')[0].trim();

  if (firstLine !== 'export type Json =') {
    console.error(`[supabase:types] VALIDATION FAILED: first line is "${firstLine}"`);
    process.exit(1);
  }

  // Check required tables
  const requiredTables = ['clinics', 'reservations', 'blocks', 'security_events', 'user_permissions'];
  const missing = requiredTables.filter((t) => !written.includes(`      ${t}: {`));

  if (missing.length > 0) {
    console.error(`[supabase:types] VALIDATION FAILED: missing tables: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log(`[supabase:types] OK - written to ${OUTPUT_FILE}`);
} catch (err) {
  console.error('[supabase:types] Generation failed:', err.message);
  process.exit(1);
}
