#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const COVERAGE_JSON = resolve('coverage', 'coverage-summary.json');
const COVERAGE_TXT = resolve('coverage', 'coverage-summary.txt');

function formatRow(label, data) {
  const pct = data.pct?.toFixed?.(2) ?? String(data.pct ?? 'N/A');
  const covered = data.covered ?? 'N/A';
  const total = data.total ?? 'N/A';
  return `${label.padEnd(12)} ${pct.toString().padStart(6)}% (${covered}/${total})`;
}

try {
  const jsonRaw = readFileSync(COVERAGE_JSON, 'utf8');
  const summary = JSON.parse(jsonRaw);
  const lines = [
    'Jest Coverage Summary',
    '======================',
    formatRow('Statements', summary.total.statements),
    formatRow('Branches', summary.total.branches),
    formatRow('Functions', summary.total.functions),
    formatRow('Lines', summary.total.lines),
  ];

  writeFileSync(COVERAGE_TXT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Coverage summary written to ${COVERAGE_TXT}`);
} catch (error) {
  console.error('Failed to generate coverage summary:', error.message);
  process.exit(1);
}
