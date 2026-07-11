#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const SOURCE_ROOT = path.join(REPO_ROOT, 'src');
const EVIDENCE_DIR = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening'
);
const SOURCE = path.join(EVIDENCE_DIR, 'staff-id-semantics-before.csv');
const OUTPUT = path.join(EVIDENCE_DIR, 'staff-id-semantics-decisions.yaml');

const COLUMN_SPECS = [
  {
    column: 'user_permissions.staff_id',
    table: 'user_permissions',
    dbColumn: 'staff_id',
    semanticOwner: 'unknown',
    decision: 'BLOCK',
    rationale:
      'Current FK points to legacy staff.id while runtime writes use Auth user IDs; coincident ID matches do not prove ownership.',
  },
  {
    column: 'staff_preferences.staff_id',
    table: 'staff_preferences',
    dbColumn: 'staff_id',
    semanticOwner: 'unknown',
    decision: 'BLOCK',
    rationale:
      'No remote rows exist; current resources.id FK and names alone are insufficient semantic proof.',
  },
  {
    column: 'staff_shifts.staff_id',
    table: 'staff_shifts',
    dbColumn: 'staff_id',
    semanticOwner: 'unknown',
    decision: 'BLOCK',
    rationale:
      'All 54 values match several ID domains; current resources.id FK is evidence but not enough to resolve every runtime writer.',
  },
  {
    column: 'shift_requests.staff_id',
    table: 'shift_requests',
    dbColumn: 'staff_id',
    semanticOwner: 'unknown',
    decision: 'BLOCK',
    rationale:
      'No remote rows exist; the resources.id FK must be reconciled with Auth-user-facing runtime paths before adding constraints.',
  },
  {
    column: 'profiles.user_id',
    table: 'profiles',
    dbColumn: 'user_id',
    semanticOwner: 'auth.users.id',
    decision: 'KEEP',
    rationale:
      'Catalog FK and observed non-null values match auth.users.id; sensitive-column update authorization is a separate RED risk.',
  },
  {
    column: 'staff.user_id',
    table: 'staff',
    dbColumn: 'user_id',
    columnAbsent: true,
    semanticOwner: 'unknown',
    decision: 'BLOCK',
    rationale:
      'The legacy public.staff table has no user_id column; no equivalent mapping may be invented.',
  },
];

function parseArgs(argv) {
  if (argv.length !== 1 || !['--write', '--check'].includes(argv[0])) {
    throw new Error('Usage: generate-staff-id-decisions.mjs --write|--check');
  }
  return argv[0].slice(2);
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
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if (character === '\n' && !quoted) {
      row.push(value.replace(/\r$/, ''));
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  const [headers, ...data] = rows;
  return data.map(values =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]]))
  );
}

function listSourceFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory).sort()) {
      const absolute = path.join(directory, entry);
      const stats = statSync(absolute);
      if (stats.isDirectory()) {
        if (entry !== '__tests__' && entry !== 'types') visit(absolute);
      } else if (/\.(?:js|jsx|ts|tsx)$/.test(entry)) {
        files.push(absolute);
      }
    }
  }
  visit(root);
  return files;
}

function functionName(node) {
  let current = node;
  while (current.parent) {
    current = current.parent;
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isMethodDeclaration(current)
    ) {
      if (current.name && ts.isIdentifier(current.name)) {
        return current.name.text;
      }
    }
    if (ts.isArrowFunction(current)) {
      const parent = current.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      if (ts.isPropertyAssignment(parent)) return parent.name.getText();
    }
  }
  return 'module-scope';
}

function collectAccesses(spec, files) {
  const readers = new Set();
  const writers = new Set();
  if (spec.columnAbsent) return { readers: [], writers: [] };

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') || file.endsWith('.jsx')
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS
    );

    function visit(node) {
      const literalTableCall =
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'from' &&
        node.arguments.length > 0 &&
        (ts.isStringLiteral(node.arguments[0]) ||
          ts.isNoSubstitutionTemplateLiteral(node.arguments[0])) &&
        node.arguments[0].text === spec.table;
      if (!literalTableCall) {
        ts.forEachChild(node, visit);
        return;
      }

      const offset = node.getStart(sourceFile);
      const reference =
        path.relative(REPO_ROOT, file).split(path.sep).join('/') +
        ':' +
        functionName(node);
      const chain = content.slice(offset, offset + 1000);
      const containingFunction = (() => {
        let current = node.parent;
        while (current && !ts.isSourceFile(current)) {
          if (ts.isFunctionLike(current)) return current.getText(sourceFile);
          current = current.parent;
        }
        return content;
      })();
      if (
        /\.(?:insert|update|upsert|delete)\s*\(/.test(chain) &&
        new RegExp('\\b' + spec.dbColumn + '\\b').test(containingFunction)
      ) {
        writers.add(reference + ' (column observed in symbol)');
      }
      if (/\.select\s*\(/.test(chain)) {
        readers.add(reference + ' (table read; projection may be implicit)');
      }
      if (!/\.(?:insert|update|upsert|delete|select)\s*\(/.test(chain)) {
        readers.add(reference + ' (operation-unknown)');
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return { readers: [...readers].sort(), writers: [...writers].sort() };
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function rate(row, field) {
  if (!row || Number(row.rows_checked) === 0) return 'UNKNOWN_NO_ROWS';
  return (Number(row[field]) / Number(row.rows_checked)).toFixed(4);
}

const mode = parseArgs(process.argv.slice(2));
const rows = new Map(
  parseCsv(readFileSync(SOURCE, 'utf8')).map(row => [row.column_name, row])
);
const files = listSourceFiles(SOURCE_ROOT);
const lines = [
  'schema_version: 1',
  'generated_by: scripts/commercial-hardening/generate-staff-id-decisions.mjs',
  'limitations:',
  '  - "Runtime references are conservative literal table-call candidates; computed names and transitive column flow remain UNKNOWN."',
  '  - "ID equality can be coincidental and never overrides catalog/runtime semantic conflicts."',
  'columns:',
];

for (const spec of COLUMN_SPECS) {
  const row = rows.get(spec.column);
  const accesses = collectAccesses(spec, files);
  lines.push('  - column: ' + spec.column);
  lines.push('    semantic_owner: ' + spec.semanticOwner);
  lines.push(
    '    current_fk: ' + yamlString(row?.current_fk_target ?? 'COLUMN_ABSENT')
  );
  if (accesses.writers.length === 0) lines.push('    runtime_writers: []');
  else {
    lines.push('    runtime_writers:');
    accesses.writers.forEach(value =>
      lines.push('      - ' + yamlString(value))
    );
  }
  if (accesses.readers.length === 0) lines.push('    runtime_readers: []');
  else {
    lines.push('    runtime_readers:');
    accesses.readers.forEach(value =>
      lines.push('      - ' + yamlString(value))
    );
  }
  lines.push('    data_match_rate:');
  lines.push('      auth.users.id: ' + rate(row, 'matches_auth_users'));
  lines.push(
    '      profiles.user_id: ' + rate(row, 'matches_profiles_user_id')
  );
  lines.push('      staff.id: ' + rate(row, 'matches_staff_id'));
  lines.push('      resources.id: ' + rate(row, 'matches_resources_id'));
  lines.push(
    '      staff_profiles.id: ' + rate(row, 'matches_staff_profiles_id')
  );
  lines.push('    decision: ' + spec.decision);
  lines.push('    rationale: ' + yamlString(spec.rationale));
}

const output = lines.join('\n') + '\n';
if (mode === 'check') {
  if (readFileSync(OUTPUT, 'utf8') !== output) {
    console.error('Staff ID decision inventory drift: ' + path.relative(REPO_ROOT, OUTPUT));
    process.exitCode = 1;
  }
} else {
  writeFileSync(OUTPUT, output, 'utf8');
  console.log('Wrote ' + path.relative(REPO_ROOT, OUTPUT));
}
