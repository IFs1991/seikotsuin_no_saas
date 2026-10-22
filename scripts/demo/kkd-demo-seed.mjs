#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildKkdDemoDataset,
  validateKkdDemoDataset,
  DEMO_EMAIL_DOMAIN,
} from './kkd-demo-fixtures.mjs';
import {
  assertMutationSafety,
  requireConnectionEnv,
  requireDemoPassword,
  createAdminClient,
  runStep,
  seedDataset,
  resetDemoNamespace,
  validateDatasetInDatabase,
} from './kkd-demo-db.mjs';
import { validateGeneratedTypeContract } from './kkd-demo-contract.mjs';

const COMMANDS = new Set(['seed', 'validate', 'reset']);

function loadEnvFile(fileName) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

['.env.demo.local', '.env.local', '.env'].forEach(loadEnvFile);

function parseIntegerOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const raw = args[index + 1];
  const value = Number(raw);
  if (!raw || !Number.isInteger(value)) {
    throw new Error(`${name} requires an integer value`);
  }
  return value;
}

function parseCli(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'seed';
  if (!COMMANDS.has(command)) {
    throw new Error(`Unknown command: ${command}. Use seed, validate, or reset.`);
  }

  return {
    command,
    dryRun: args.includes('--dry-run'),
    historyDays: parseIntegerOption(args, '--history-days', 56),
    futureDays: parseIntegerOption(args, '--future-days', 14),
    todayKey: (() => {
      const index = args.indexOf('--today');
      if (index === -1) return undefined;
      const value = args[index + 1];
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(value ?? '')) {
        throw new Error('--today requires YYYY-MM-DD');
      }
      return value;
    })(),
  };
}

function printDryRun(dataset, summary, generatedTypeContract) {
  console.log('KKD demo seed dry-run: PASS');
  console.log(
    JSON.stringify(
      {
        metadata: dataset.metadata,
        summary,
        generatedTypeContract,
        loginAccounts: dataset.users.map(user => ({
          role: user.role,
          name: user.fullName,
          email: user.email,
          clinicId: user.clinicId,
          clinicScopeIds: user.clinicScopeIds,
        })),
        safety: {
          syntheticOnly: true,
          emailDomain: DEMO_EMAIL_DOMAIN,
          externalStripeSideEffects: false,
          externalLineSideEffects: false,
        },
      },
      null,
      2
    )
  );
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  const dataset = buildKkdDemoDataset({
    todayKey: cli.todayKey,
    historyDays: cli.historyDays,
    futureDays: cli.futureDays,
  });
  const summary = validateKkdDemoDataset(dataset);
  const generatedTypeContract = validateGeneratedTypeContract(dataset);

  if (cli.dryRun) {
    printDryRun(dataset, summary, generatedTypeContract);
    return;
  }

  const { url, serviceRoleKey } = requireConnectionEnv();
  if (cli.command !== 'validate') assertMutationSafety(cli.command, url);
  const client = await createAdminClient(url, serviceRoleKey);

  console.log(`KKD demo command: ${cli.command}`);
  console.log(`Target: ${new URL(url).origin}`);
  console.log(`Dataset: ${JSON.stringify(dataset.metadata)}`);

  if (cli.command === 'seed') {
    const password = requireDemoPassword();
    await seedDataset(client, dataset, password);
    const validation = await runStep('validate seeded DB/read models', () =>
      validateDatasetInDatabase(client, dataset)
    );
    console.log('\nKKD demo seed completed.');
    console.log(
      JSON.stringify({ summary, generatedTypeContract, validation }, null, 2)
    );
    console.log('\nLogin accounts (password is KKD_DEMO_PASSWORD):');
    for (const user of dataset.users) {
      console.log(`- ${user.role}: ${user.email}`);
    }
    return;
  }

  if (cli.command === 'validate') {
    const validation = await runStep('validate seeded DB/read models', () =>
      validateDatasetInDatabase(client, dataset)
    );
    console.log(
      JSON.stringify({ summary, generatedTypeContract, validation }, null, 2)
    );
    return;
  }

  await resetDemoNamespace(client, dataset);
  console.log('\nKKD demo namespace reset completed.');
}

main().catch(error => {
  console.error(
    `\nKKD demo seed failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
