#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const searchTargets = ['src', 'app', 'components', 'lib'];
const allowList = new Set([
  'src/lib/env.ts',
  'src/lib/supabase/server.ts',
  'src/api/database/supabase-client.ts',
]);

const result = spawnSync('rg', [
  '--nocolor',
  '--with-filename',
  'SUPABASE_SERVICE_ROLE_KEY',
  ...searchTargets,
]);

if (result.error) {
  console.error('Failed to execute ripgrep:', result.error.message);
  process.exit(1);
}

if (result.status === 1) {
  // No matches found
  process.exit(0);
}

if (result.status !== 0) {
  console.error(result.stdout.toString());
  console.error(result.stderr.toString());
  process.exit(result.status ?? 1);
}

const matches = result.stdout
  .toString()
  .split('\n')
  .filter(Boolean)
  .map(line => {
    const [file] = line.split(':');
    return file;
  })
  .filter(file => !allowList.has(file));

if (matches.length > 0) {
  console.error(
    'Secret scan failed. Remove SUPABASE service role references from the following files:'
  );
  matches.forEach(file => console.error(`  - ${file}`));
  process.exit(1);
}
