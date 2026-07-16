#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildInventory } from './generate-mutating-route-inventory.mjs';
import {
  loadMutatingRoutePolicy,
  verifyMutatingRoutePolicy,
} from './mutating-route-policy-utils.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_SOURCE_ROOT = path.join(REPO_ROOT, 'src/app/api');
const DEFAULT_POLICY = path.join(
  REPO_ROOT,
  'src/lib/security/mutating-route-policy.ts'
);

function parseArgs(argv) {
  const args = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    policy: DEFAULT_POLICY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--source-root') {
      args.sourceRoot = path.resolve(argv[++index]);
    } else if (value === '--policy') {
      args.policy = path.resolve(argv[++index]);
    } else {
      throw new Error('Unknown argument: ' + value);
    }
  }

  return args;
}

export async function verifyMutatingRoutes(args) {
  const inventory = buildInventory(args.sourceRoot);
  const policy = await loadMutatingRoutePolicy(args.policy);
  const verification = verifyMutatingRoutePolicy(inventory, policy);
  return { inventory, verification };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { inventory, verification } = await verifyMutatingRoutes(args);

  if (verification.errors.length > 0) {
    for (const error of verification.errors) {
      console.error(error.code + ': ' + error.message);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    String(inventory.handlers.length) + ' mutating handlers classified'
  );
  console.log(
    String(inventory.sideEffectingGetCandidates.length) +
      ' side-effecting GET handlers classified'
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
