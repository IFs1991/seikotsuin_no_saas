#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const SOURCE_ROOT = path.join(REPO_ROOT, 'src');
const EVIDENCE_DIR = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening'
);
const TABLE_DRAFT = path.join(EVIDENCE_DIR, 'table-classification-draft.csv');
const OUTPUT = path.join(EVIDENCE_DIR, 'source-reference-inventory.json');

function parseArgs(argv) {
  if (argv.length !== 1 || !['--write', '--check'].includes(argv[0])) {
    throw new Error(
      'Usage: generate-source-reference-inventory.mjs --write|--check'
    );
  }
  return argv[0].slice(2);
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function listSourceFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory).sort()) {
      const absolute = path.join(directory, entry);
      const relative = normalizePath(path.relative(SOURCE_ROOT, absolute));
      const stats = statSync(absolute);
      if (stats.isDirectory()) {
        if (entry !== '__tests__' && entry !== 'types') visit(absolute);
      } else if (/\.(?:js|jsx|ts|tsx)$/.test(entry) && !relative.endsWith('.d.ts')) {
        files.push(absolute);
      }
    }
  }
  visit(root);
  return files;
}

function lineNumberAt(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

function collectLiteralCalls(files, method) {
  const references = new Map();
  const pattern = new RegExp(
    '\\.' +
      method +
      '\\s*\\(\\s*([\\\'"`])([A-Za-z0-9_]+)\\1\\s*(?:,|\\))',
    'g'
  );

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const clientModule = /^\s*['"]use client['"];?/m.test(content);
    for (const match of content.matchAll(pattern)) {
      const name = match[2];
      const entries = references.get(name) ?? [];
      entries.push({
        path: normalizePath(path.relative(REPO_ROOT, file)),
        line: lineNumberAt(content, match.index ?? 0),
        clientModule,
      });
      references.set(name, entries);
    }
  }
  return references;
}

function tableNames() {
  return readFileSync(TABLE_DRAFT, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .map(line => /^"([^"]+)"/.exec(line)?.[1])
    .filter(name => name !== undefined)
    .sort();
}

function sortedEntries(references) {
  return [...references.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, calls]) => ({
      name,
      calls: calls.sort(
        (left, right) =>
          left.path.localeCompare(right.path) || left.line - right.line
      ),
    }));
}

const mode = parseArgs(process.argv.slice(2));
const files = listSourceFiles(SOURCE_ROOT);
const fromReferences = collectLiteralCalls(files, 'from');
const rpcReferences = collectLiteralCalls(files, 'rpc');
const inventory = {
  schemaVersion: 1,
  generatedBy:
    'scripts/commercial-hardening/generate-source-reference-inventory.mjs',
  scope: 'src runtime JS/TS, excluding __tests__ and generated types',
  limitations: [
    'Literal .from() and .rpc() calls only; computed names and transitive client imports remain UNKNOWN.',
    'clientModule records an explicit use-client directive, not the full import graph.',
  ],
  summary: {
    scannedSourceFiles: files.length,
    catalogTables: tableNames().length,
    catalogTablesWithLiteralReferences: tableNames().filter(name =>
      fromReferences.has(name)
    ).length,
    literalRpcNames: rpcReferences.size,
  },
  tables: tableNames().map(name => ({
    name,
    status: fromReferences.has(name)
      ? 'LITERAL_RUNTIME_REFERENCE_OBSERVED'
      : 'NO_LITERAL_RUNTIME_REFERENCE_OBSERVED',
    calls: (fromReferences.get(name) ?? []).sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.line - right.line
    ),
  })),
  rpcReferences: sortedEntries(rpcReferences),
  nonCatalogFromReferences: sortedEntries(
    new Map(
      [...fromReferences].filter(([name]) => !tableNames().includes(name))
    )
  ),
};
const output = JSON.stringify(inventory, null, 2) + '\n';

if (mode === 'check') {
  if (readFileSync(OUTPUT, 'utf8') !== output) {
    console.error('Source reference inventory drift: ' + path.relative(REPO_ROOT, OUTPUT));
    process.exitCode = 1;
  }
} else {
  writeFileSync(OUTPUT, output, 'utf8');
  console.log('Wrote ' + path.relative(REPO_ROOT, OUTPUT));
}
