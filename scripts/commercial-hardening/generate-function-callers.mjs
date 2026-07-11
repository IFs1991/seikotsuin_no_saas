#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const EVIDENCE_DIR = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening'
);

function parseArgs(argv) {
  const args = { label: null, mode: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--label') args.label = argv[++index];
    else if (value === '--write' || value === '--check') {
      args.mode = value.slice(2);
    } else {
      throw new Error(
        'Usage: generate-function-callers.mjs --label before|local-before --write|--check'
      );
    }
  }
  if (!['before', 'local-before'].includes(args.label) || !args.mode) {
    throw new Error(
      'Usage: generate-function-callers.mjs --label before|local-before --write|--check'
    );
  }
  return args;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted && character === '"' && content[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if (character === '\n' && !quoted) {
      row.push(value.replace(/\r$/, ''));
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  const [headers, ...data] = rows;
  return data.map(values =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]]))
  );
}

function csvValue(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

const args = parseArgs(process.argv.slice(2));
const functions = parseCsv(
  readFileSync(path.join(EVIDENCE_DIR, 'functions-' + args.label + '.csv'), 'utf8')
);
const dependencies = parseCsv(
  readFileSync(
    path.join(EVIDENCE_DIR, 'function-dependencies-' + args.label + '.csv'),
    'utf8'
  )
);
const sourceInventory = JSON.parse(
  readFileSync(path.join(EVIDENCE_DIR, 'source-reference-inventory.json'), 'utf8')
);
const dependencyMap = new Map();
for (const dependency of dependencies) {
  const entries = dependencyMap.get(dependency.function_signature) ?? [];
  entries.push(
    dependency.dependency_type +
      ':' +
      dependency.dependent_schema +
      '.' +
      dependency.dependent_object +
      ':' +
      dependency.detail
  );
  dependencyMap.set(dependency.function_signature, entries);
}
const runtimeMap = new Map(
  sourceInventory.rpcReferences.map(reference => [
    reference.name,
    reference.calls.map(
      call =>
        call.path +
        ':' +
        String(call.line) +
        (call.clientModule ? ':use-client' : ':server-or-shared')
    ),
  ])
);
const uniqueFunctions = new Map();
for (const functionRow of functions) {
  uniqueFunctions.set(functionRow.signature, functionRow);
}
const overloadCounts = new Map();
for (const functionRow of uniqueFunctions.values()) {
  overloadCounts.set(
    functionRow.function_name,
    (overloadCounts.get(functionRow.function_name) ?? 0) + 1
  );
}
const headers = [
  'schema',
  'signature',
  'function_name',
  'database_callers',
  'literal_runtime_callers',
  'unknowns',
];
const rows = [...uniqueFunctions.values()]
  .sort((left, right) => left.signature.localeCompare(right.signature))
  .map(functionRow => {
    const databaseCallers = [
      ...new Set(dependencyMap.get(functionRow.signature) ?? []),
    ].sort();
    const runtimeCallers = [
      ...new Set(runtimeMap.get(functionRow.function_name) ?? []),
    ].sort();
    const unknowns = ['dynamic/transitive runtime callers'];
    if (
      runtimeCallers.length > 0 &&
      (overloadCounts.get(functionRow.function_name) ?? 0) > 1
    ) {
      unknowns.push('literal RPC overload resolution');
    }
    return [
      functionRow.schema,
      functionRow.signature,
      functionRow.function_name,
      databaseCallers.join('; '),
      runtimeCallers.join('; '),
      unknowns.join('; '),
    ];
  });
const output =
  [headers, ...rows].map(row => row.map(csvValue).join(',')).join('\n') + '\n';
const outputPath = path.join(
  EVIDENCE_DIR,
  'function-callers-' + args.label + '.csv'
);

if (args.mode === 'check') {
  if (readFileSync(outputPath, 'utf8') !== output) {
    console.error('Function caller inventory drift: ' + path.relative(REPO_ROOT, outputPath));
    process.exitCode = 1;
  }
} else {
  writeFileSync(outputPath, output, 'utf8');
  console.log('Wrote ' + path.relative(REPO_ROOT, outputPath));
}
