#!/usr/bin/env node

import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const SOURCE_ROOT = path.join(REPO_ROOT, 'src');
const E2E_SCRIPT_ROOT = path.join(REPO_ROOT, 'scripts/e2e');
const CONNECTION_SCRIPT = path.join(
  REPO_ROOT,
  'scripts/verify-supabase-connection.mjs'
);
const OUTPUT = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening/pr07/runtime-reference-inventory.json'
);

const LEGACY_TABLES = [
  'appointments',
  'revenues',
  'treatment_menu_records',
  'treatments',
  'visits',
];
const LEGACY_TABLE_SET = new Set(LEGACY_TABLES);
const RUNTIME_SOURCE_EXTENSION = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/;
const MUTATING_METHODS = new Set([
  'delete',
  'insert',
  'upsert',
  'update',
]);
const ALLOWED_TABLE_REFERENCES = [
  {
    name: 'revenues',
    path: 'src/app/api/clinic/analysis/route.ts',
    methods: ['eq', 'limit', 'order', 'select'],
  },
];
const ALLOWED_RPC_REFERENCES = [
  {
    name: 'get_hourly_visit_pattern',
    path: 'src/lib/dashboard/read-model.ts',
    methods: [],
  },
];

function parseMode(argv) {
  if (argv.length !== 1 || !['--write', '--check'].includes(argv[0])) {
    throw new Error('Usage: verify-legacy-quarantine.mjs --write|--check');
  }
  return argv[0].slice(2);
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

function listRuntimeSourceFiles(root) {
  const files = [];

  function visit(directory) {
    for (const entry of readdirSync(directory).sort()) {
      const absolute = path.join(directory, entry);
      const relative = normalizePath(path.relative(root, absolute));
      const stats = statSync(absolute);

      if (stats.isDirectory()) {
        if (!['__tests__', 'legacy', 'types'].includes(entry)) {
          visit(absolute);
        }
      } else if (
        RUNTIME_SOURCE_EXTENSION.test(entry) &&
        !relative.endsWith('.d.ts')
      ) {
        files.push(absolute);
      }
    }
  }

  visit(root);
  return files;
}

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(?:c|m)?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function literalCall(node, methodName) {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== methodName
  ) {
    return null;
  }

  const argument = node.arguments[0];
  return argument && ts.isStringLiteralLike(argument) ? argument.text : null;
}

function chainedMethods(call) {
  const methods = [];
  let current = call;

  while (
    current.parent &&
    ts.isPropertyAccessExpression(current.parent) &&
    current.parent.expression === current
  ) {
    const property = current.parent;
    const parentCall = property.parent;
    if (!ts.isCallExpression(parentCall) || parentCall.expression !== property) {
      break;
    }
    methods.push(property.name.text);
    current = parentCall;
  }

  return [...new Set(methods)].sort();
}

function collectReferences(files) {
  const tableReferences = [];
  const rpcReferences = [];
  const operationalScriptReferences = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(file)
    );
    const relativePath = normalizePath(path.relative(REPO_ROOT, file));
    const isOperationalScript = relativePath.startsWith('scripts/');

    function visit(node) {
      const tableName = literalCall(node, 'from');
      const rpcName = literalCall(node, 'rpc');
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      const reference = {
        path: relativePath,
        line: position.line + 1,
        methods: chainedMethods(node),
      };

      if (
        isOperationalScript &&
        ts.isStringLiteralLike(node) &&
        LEGACY_TABLE_SET.has(node.text)
      ) {
        operationalScriptReferences.push({
          name: node.text,
          path: relativePath,
          line: position.line + 1,
        });
      }

      if (tableName && LEGACY_TABLE_SET.has(tableName)) {
        tableReferences.push({ name: tableName, ...reference });
      }
      if (rpcName === 'get_hourly_visit_pattern') {
        rpcReferences.push({ name: rpcName, ...reference });
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  const compare = (left, right) =>
    left.name.localeCompare(right.name) ||
    left.path.localeCompare(right.path) ||
    left.line - right.line;
  return {
    tableReferences: tableReferences.sort(compare),
    rpcReferences: rpcReferences.sort(compare),
    operationalScriptReferences: operationalScriptReferences.sort(compare),
  };
}

function comparable(references) {
  return references.map(reference => ({
    name: reference.name,
    path: reference.path,
    methods: reference.methods,
  }));
}

function assertExactReferences(actual, expected, label) {
  const actualText = JSON.stringify(comparable(actual));
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(
      `${label} drift. Expected ${expectedText}; received ${actualText}`
    );
  }
}

const mode = parseMode(process.argv.slice(2));
const files = [
  ...listRuntimeSourceFiles(SOURCE_ROOT),
  ...listRuntimeSourceFiles(E2E_SCRIPT_ROOT),
  CONNECTION_SCRIPT,
].sort();
const references = collectReferences(files);
const scannedOperationalFiles = files
  .map(file => normalizePath(path.relative(REPO_ROOT, file)))
  .filter(file => file.startsWith('scripts/'));

if (references.operationalScriptReferences.length > 0) {
  throw new Error(
    'Quarantined table reference observed in operational scripts: ' +
      references.operationalScriptReferences
        .map(reference =>
          `${reference.name} at ${reference.path}:${reference.line}`
        )
        .join(', ')
  );
}

for (const reference of references.tableReferences) {
  const mutation = reference.methods.find(method =>
    MUTATING_METHODS.has(method)
  );
  if (mutation) {
    throw new Error(
      `Quarantined table write observed: ${reference.name}.${mutation} at ${reference.path}:${reference.line}`
    );
  }
}

assertExactReferences(
  references.tableReferences,
  ALLOWED_TABLE_REFERENCES,
  'Legacy table runtime reference'
);
assertExactReferences(
  references.rpcReferences,
  ALLOWED_RPC_REFERENCES,
  'Legacy RPC runtime reference'
);

const referencedTables = new Set(
  references.tableReferences.map(reference => reference.name)
);
const inventory = {
  schemaVersion: 2,
  generatedBy: 'scripts/commercial-hardening/verify-legacy-quarantine.mjs',
  scope:
    'src runtime JS/TS variants plus E2E and connection scripts, excluding __tests__, legacy, generated types, and non-literal/computed database object names',
  scanSummary: {
    operationalFiles: scannedOperationalFiles,
  },
  contract: {
    quarantinedTables: LEGACY_TABLES,
    writeMethods: [...MUTATING_METHODS].sort(),
    allowedTableReferences: ALLOWED_TABLE_REFERENCES,
    allowedRpcReferences: ALLOWED_RPC_REFERENCES,
  },
  tables: LEGACY_TABLES.map(name => ({
    name,
    status: referencedTables.has(name)
      ? 'REVIEWED_READ_REFERENCE'
      : 'NO_LITERAL_RUNTIME_REFERENCE',
    references: references.tableReferences.filter(
      reference => reference.name === name
    ),
  })),
  rpcReferences: references.rpcReferences,
  operationalScriptReferences: references.operationalScriptReferences,
  limitations: [
    'Computed table or RPC names cannot be attributed to a catalog object statically.',
    'The PR-07 SQL contract verifies only the reviewed get_hourly_visit_pattern(uuid) body; other database-side legacy dependencies and transitive callers remain a deletion-gate residual risk.',
  ],
};
const output = JSON.stringify(inventory, null, 2) + '\n';

if (mode === 'write') {
  writeFileSync(OUTPUT, output, 'utf8');
  console.log(`Wrote ${normalizePath(path.relative(REPO_ROOT, OUTPUT))}`);
} else if (readFileSync(OUTPUT, 'utf8') !== output) {
  console.error(
    `Legacy quarantine inventory drift: ${normalizePath(path.relative(REPO_ROOT, OUTPUT))}`
  );
  process.exitCode = 1;
} else {
  console.log('Legacy quarantine runtime inventory is current and read-only.');
}
