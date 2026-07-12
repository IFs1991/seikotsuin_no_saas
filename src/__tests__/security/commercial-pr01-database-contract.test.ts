/** @jest-environment node */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(__dirname, '../../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function expectCompositeRelationship(
  generatedTypes: string,
  foreignKeyName: string,
  columns: readonly string[]
): void {
  const relationshipStart = generatedTypes.indexOf(
    `foreignKeyName: '${foreignKeyName}'`
  );

  expect(relationshipStart).toBeGreaterThanOrEqual(0);

  const relationship = generatedTypes.slice(
    relationshipStart,
    generatedTypes.indexOf('},', relationshipStart) + 2
  );
  const renderedColumns = columns.map(column => `'${column}'`).join(', ');

  expect(relationship).toContain(`columns: [${renderedColumns}]`);
}

describe('commercial hardening PR-01 database contract', () => {
  it('pins the Supabase CLI in one repository file', () => {
    expect(readRepoFile('.supabase-cli-version').trim()).toBe('2.109.0');
  });

  it('commits types generated from all 50 migrations', () => {
    const baseline = readRepoFile(
      'scripts/commercial-hardening/migration-history-baseline.sha256'
    );
    const baselineEntries = baseline
      .split(/\r?\n/)
      .filter(line => line.length > 0 && !line.startsWith('#'));

    expect(baselineEntries).toHaveLength(50);

    const generatedTypes = readRepoFile('src/types/supabase.ts');

    expectCompositeRelationship(
      generatedTypes,
      'patient_outreach_recipients_booked_reservation_clinic_fkey',
      ['booked_reservation_id', 'clinic_id']
    );
    expectCompositeRelationship(
      generatedTypes,
      'patient_outreach_recipients_customer_clinic_fkey',
      ['customer_id', 'clinic_id']
    );
    expectCompositeRelationship(
      generatedTypes,
      'reservations_campaign_clinic_fkey',
      ['campaign_id', 'clinic_id']
    );

    expect(generatedTypes).not.toContain(
      "foreignKeyName: 'patient_outreach_recipients_booked_reservation_id_fkey'"
    );
    expect(generatedTypes).not.toContain(
      "foreignKeyName: 'patient_outreach_recipients_customer_id_fkey'"
    );
    expect(generatedTypes).not.toContain(
      "foreignKeyName: 'reservations_campaign_id_fkey'"
    );
  });

  it('rejects an edited applied migration and permits append-only migrations', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'pr01-migrations-'));
    const migrationsDir = path.join(fixtureRoot, 'migrations');
    const manifestPath = path.join(fixtureRoot, 'baseline.sha256');
    const scriptPath = path.join(
      repoRoot,
      'scripts/commercial-hardening/verify-migration-history.mjs'
    );

    try {
      mkdirSync(migrationsDir);
      const baselineFile = '20260707000200_applied.sql';
      const appendedFile = '20260708000100_append_only.sql';
      writeFileSync(path.join(migrationsDir, baselineFile), 'select 1;\n');
      writeFileSync(path.join(migrationsDir, appendedFile), 'select 2;\n');
      writeFileSync(
        manifestPath,
        '4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c  ' +
          baselineFile +
          '\n'
      );

      const green = spawnSync(
        process.execPath,
        [
          scriptPath,
          '--migrations-dir',
          migrationsDir,
          '--manifest',
          manifestPath,
        ],
        { encoding: 'utf8' }
      );
      expect(green.status).toBe(0);

      writeFileSync(path.join(migrationsDir, baselineFile), 'select 3;\n');
      const red = spawnSync(
        process.execPath,
        [
          scriptPath,
          '--migrations-dir',
          migrationsDir,
          '--manifest',
          manifestPath,
        ],
        { encoding: 'utf8' }
      );
      expect(red.status).toBe(1);
      expect(red.stderr).toContain('content changed');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('gates App E2E on a full database contract job', () => {
    const workflow = readRepoFile('.github/workflows/ci.yml');
    const databaseContractStart = workflow.indexOf('\n  database-contract:');
    const appE2eStart = workflow.indexOf('\n  app-e2e:');

    expect(databaseContractStart).toBeGreaterThanOrEqual(0);
    expect(appE2eStart).toBeGreaterThan(databaseContractStart);

    const databaseContract = workflow.slice(databaseContractStart, appE2eStart);
    const appE2e = workflow.slice(appE2eStart);

    expect(databaseContract).toContain('name: Database Contract');
    expect(databaseContract).toContain('npm run commercial:verify:migrations');
    expect(databaseContract).toContain('supabase db reset --local');
    expect(databaseContract).toContain('supabase test db --local');
    expect(databaseContract).toContain('npm run supabase:types');
    expect(databaseContract).toContain(
      'git diff --exit-code -- src/types/supabase.ts'
    );
    expect(databaseContract).toContain('id: supabase-cli-version');
    expect(databaseContract).toContain(
      'version: ${{ steps.supabase-cli-version.outputs.version }}'
    );
    expect(appE2e).toContain('needs: [quality, database-contract]');
  });
});
