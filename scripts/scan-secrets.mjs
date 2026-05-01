#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const searchTargets = ['src', 'app', 'components', 'lib'];
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
]);

const allowLists = {
  serviceRole: new Set([
    'src/lib/env.ts',
    'src/lib/auth/password-recovery-intent.ts',
    'src/lib/supabase/server.ts',
    'src/api/database/supabase-client.ts',
  ]),
  publicKeyEnv: new Set([
    'src/lib/env.ts',
    'src/lib/supabase/server.ts',
    'src/lib/supabase/client.ts',
    'src/lib/supabase-browser.ts',
  ]),
};

const publicKeyEnvPattern =
  /NEXT_PUBLIC_[A-Z0-9_]*(?:API_KEY|GEMINI|SECRET|SERVICE_ROLE|PRIVATE|TOKEN)\b/;

function toRepoPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function listFiles(target) {
  if (!existsSync(target)) {
    return [];
  }

  const files = [];
  const stack = [target];

  while (stack.length > 0) {
    const current = stack.pop();
    const stats = statSync(current);

    if (stats.isFile()) {
      if (textExtensions.has(path.extname(current))) {
        files.push(current);
      }
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== '__mocks__') {
          stack.push(path.join(current, entry.name));
        }
        continue;
      }

      if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
        files.push(path.join(current, entry.name));
      }
    }
  }

  return files;
}

const findings = [];
const filesToScan = [...new Set(searchTargets.flatMap(listFiles))];

for (const file of filesToScan) {
  const repoPath = toRepoPath(file);
  const content = readFileSync(file, 'utf8');

  if (
    content.includes('SUPABASE_SERVICE_ROLE_KEY') &&
    !allowLists.serviceRole.has(repoPath)
  ) {
    findings.push({
      rule: 'SUPABASE_SERVICE_ROLE_KEY',
      file: repoPath,
    });
  }

  if (
    publicKeyEnvPattern.test(content) &&
    !allowLists.publicKeyEnv.has(repoPath)
  ) {
    findings.push({
      rule: 'NEXT_PUBLIC_* secret-like key name',
      file: repoPath,
    });
  }
}

if (findings.length > 0) {
  console.error('Secret scan failed. Review the following references:');
  findings.forEach(({ rule, file }) => console.error(`  - ${rule}: ${file}`));
  process.exit(1);
}
