#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const DEFAULT_PATHS = [
  'docs/stabilization/evidence/commercial-hardening/pr12',
  'docs/stabilization/spec-commercial-pr12-isolated-release-qualification-v1.0.md',
  'docs/operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md',
  'docs/releases/current-gate-status.yaml',
];
const TEXT_EXTENSIONS = new Set([
  '.csv',
  '.json',
  '.md',
  '.raw',
  '.sql',
  '.toml',
  '.txt',
  '.yaml',
  '.yml',
]);

const RULES = [
  {
    id: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
  },
  {
    id: 'supabase-secret-key',
    pattern: /\bsb_secret_[A-Za-z0-9_-]{12,}\b/gu,
  },
  {
    id: 'jwt-value',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
  },
  {
    id: 'provider-token',
    pattern:
      /\b(?:sk_live|sk_test|whsec|ghp|github_pat|xoxb|xoxp|xoxa)-?[A-Za-z0-9_-]{12,}\b/gu,
  },
  {
    id: 'aws-access-key',
    pattern: /\bAKIA[A-Z0-9]{16}\b/gu,
  },
  {
    id: 'credentialed-database-url',
    pattern: /\bpostgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@[^\s]+/gu,
  },
  {
    id: 'password-assignment',
    pattern:
      /\b(?:password|passwd|pgpassword)\s*[:=]\s*["']?(?!NOT_CAPTURED\b|UNASSIGNED\b|REDACTED\b|<)[^\s"']{8,}/giu,
  },
  {
    id: 'windows-user-home',
    pattern: /\b[A-Za-z]:\\Users\\[^\\\s]+\\/gu,
  },
  {
    id: 'unix-user-home',
    pattern: /(?:^|\s)\/(?:home|Users)\/[^/\s]+\//gu,
  },
  {
    id: 'international-phone',
    pattern: /\+[1-9][0-9][0-9 ()-]{7,}[0-9]/gu,
  },
  {
    id: 'japanese-domestic-phone',
    pattern:
      /\b0(?:[789]0[- ]?[0-9]{4}[- ]?[0-9]{4}|[1-9][0-9]?[- ]?[0-9]{1,4}[- ]?[0-9]{4})\b/gu,
  },
];

function parseArgs(argv) {
  if (argv.length === 0) return DEFAULT_PATHS;
  const paths = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--path') {
      throw new Error(
        'Usage: scan-pr12-evidence.mjs [--path <file-or-directory>]...'
      );
    }
    const value = argv[index + 1];
    if (!value) throw new Error('--path requires a value');
    paths.push(value);
    index += 1;
  }
  return paths;
}

function collectFiles(absolutePath) {
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symbolic links are not accepted: ${absolutePath}`);
  }
  if (stat.isFile()) return [absolutePath];
  if (!stat.isDirectory()) return [];

  return readdirSync(absolutePath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap(entry => collectFiles(path.join(absolutePath, entry.name)));
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length;
}

function emailFindings(source) {
  const findings = [];
  const pattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
  for (const match of source.matchAll(pattern)) {
    const value = match[0].toLowerCase();
    if (
      value.endsWith('@example.invalid') ||
      value.endsWith('@example.com') ||
      value.endsWith('@example.org')
    ) {
      continue;
    }
    findings.push({ id: 'email-address', index: match.index ?? 0 });
  }
  return findings;
}

function scanFile(absolutePath) {
  const extension = path.extname(absolutePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported evidence file type: ${absolutePath}`);
  }
  const source = readFileSync(absolutePath, 'utf8');
  const findings = [];
  for (const rule of RULES) {
    for (const match of source.matchAll(rule.pattern)) {
      findings.push({ id: rule.id, index: match.index ?? 0 });
    }
  }
  findings.push(...emailFindings(source));
  return findings.map(finding => ({
    id: finding.id,
    line: lineNumberAt(source, finding.index),
  }));
}

function main() {
  const roots = parseArgs(process.argv.slice(2)).map(value =>
    path.resolve(REPO_ROOT, value)
  );
  const files = [...new Set(roots.flatMap(collectFiles))].sort((left, right) =>
    left.localeCompare(right, 'en')
  );
  const findings = [];
  for (const file of files) {
    for (const finding of scanFile(file)) {
      findings.push({
        ...finding,
        path: path.relative(REPO_ROOT, file).replaceAll('\\', '/'),
      });
    }
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.id}: ${finding.path}:${String(finding.line)}`);
    }
    throw new Error(
      `PR12 evidence privacy scan found ${String(findings.length)} issue(s)`
    );
  }

  console.log(
    `PR12 evidence privacy scan: PASS (${String(files.length)} text artifacts checked against configured machine-detectable patterns; matched values are never printed).`
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
