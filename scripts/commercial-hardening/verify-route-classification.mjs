#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildInventory } from './generate-mutating-route-inventory.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const inventory = buildInventory(path.join(REPO_ROOT, 'src/app/api'));
const unknown = inventory.handlers.filter(
  handler => handler.classification === 'UNKNOWN'
);

if (unknown.length > 0) {
  console.error(
    'RED COMM-ROUTE-001: ' +
      String(unknown.length) +
      ' mutating handlers remain unclassified'
  );
  process.exitCode = 1;
} else {
  console.log('All mutating handlers have an explicit classification.');
}
