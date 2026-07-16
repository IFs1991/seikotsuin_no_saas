#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyMutatingRoutes } from './verify-mutating-routes.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const { inventory, verification } = await verifyMutatingRoutes({
  sourceRoot: path.join(REPO_ROOT, 'src/app/api'),
  policy: path.join(REPO_ROOT, 'src/lib/security/mutating-route-policy.ts'),
});

if (verification.errors.length > 0) {
  for (const error of verification.errors) {
    console.error(error.code + ': ' + error.message);
  }
  process.exitCode = 1;
} else {
  console.log(
    String(inventory.handlers.length) + ' mutating handlers classified'
  );
  console.log(
    String(inventory.sideEffectingGetCandidates.length) +
      ' side-effecting GET handlers classified'
  );
}
