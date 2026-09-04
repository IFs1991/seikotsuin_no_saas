#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPr12AuthorityArtifactContract } from './pr12-authority-artifact-contract.mjs';
import { verifyPr12LocalReadinessContracts } from './pr12-local-readiness-contract.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const PR12_EVIDENCE = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening/pr12'
);
const BASE_COMMIT = '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab';
const FROZEN_PROPOSED_DR_CONTRACT_SHA256 =
  '9bd4b1002dc2456d0bd063aa5be06cbb24f7acf4b2b7ff9411331d780fe279ed';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CANONICAL_LEDGER_COMMAND_IDS = [
  'PR12-CMD-000',
  'PR12-CMD-000A',
  'PR12-CMD-001',
  'PR12-CMD-002',
  'PR12-CMD-004A',
  'PR12-CMD-003',
  'PR12-CMD-004',
  'PR12-CMD-005',
  'PR12-CMD-006',
  'PR12-CMD-007',
  'PR12-CMD-007A',
  'PR12-CMD-008A',
  'PR12-CMD-008B',
  'PR12-CMD-008',
  'PR12-CMD-009',
  'PR12-CMD-010',
  'PR12-CMD-011',
  'PR12-CMD-012',
  'PR12-CMD-013',
  'PR12-CMD-014',
  'PR12-CMD-015',
  'PR12-CMD-016',
  'PR12-CMD-017',
  'PR12-CMD-016A',
  'PR12-CMD-017A',
  'PR12-CMD-017B',
  'PR12-ACTION-017',
  'PR12-CMD-018',
  'PR12-CMD-019',
  'PR12-CMD-019S',
  'PR12-CMD-019D',
  'PR12-CMD-019G',
  'PR12-CMD-019A',
  'PR12-CMD-019F',
  'PR12-CMD-020',
];
const STAGE_3_COMMAND_IDS = CANONICAL_LEDGER_COMMAND_IDS.slice(5, 12);
const STAGE_4_COMMAND_IDS = CANONICAL_LEDGER_COMMAND_IDS.slice(12, 25);
const SHARED_PARENT_ENVIRONMENT_NAMES = [
  'PR12_SUPABASE_ACCESS_TOKEN',
  'PR12_PSQL_EXE',
];
const SOURCE_PARENT_ENVIRONMENT_NAMES = [
  'PR12_SOURCE_DB_PASSWORD',
  'PR12_SOURCE_PROJECT_REF',
  'PR12_SOURCE_SUPABASE_URL',
  'PR12_SOURCE_ANON_KEY',
  'PR12_SOURCE_SERVICE_ROLE_KEY',
  'PR12_SOURCE_PGHOST',
  'PR12_SOURCE_PGPORT',
  'PR12_SOURCE_PGDATABASE',
  'PR12_SOURCE_PGUSER',
  'PR12_SOURCE_PGPASSWORD',
  'PR12_SOURCE_HOSTED_ACTOR_PASSWORD_MAP_JSON',
];
const RESTORE_PARENT_ENVIRONMENT_NAMES = [
  'PR12_RESTORE_DB_PASSWORD',
  'PR12_RESTORE_PROJECT_REF',
  'PR12_RESTORE_SUPABASE_URL',
  'PR12_RESTORE_ANON_KEY',
  'PR12_RESTORE_SERVICE_ROLE_KEY',
  'PR12_RESTORE_PGHOST',
  'PR12_RESTORE_PGPORT',
  'PR12_RESTORE_PGDATABASE',
  'PR12_RESTORE_PGUSER',
  'PR12_RESTORE_PGPASSWORD',
  'PR12_RESTORE_HOSTED_ACTOR_PASSWORD_MAP_JSON',
];

const REQUIRED_ARTIFACTS = [
  'docs/stabilization/spec-commercial-pr12-isolated-release-qualification-v1.0.md',
  'docs/stabilization/spec-commercial-pr12-phase1-source-project-provisioning-approval-preparation-v1.0.md',
  'docs/stabilization/pr12-staging-execution-owner-approval-packet-v0.2-20260719.md',
  'docs/operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md',
  'docs/releases/current-gate-status.yaml',
  'docs/stabilization/evidence/commercial-hardening/pr12/README.md',
  'docs/stabilization/evidence/commercial-hardening/pr12/pr12-preparation-gate.yaml',
  'docs/stabilization/evidence/commercial-hardening/pr12/isolated-staging-entry-contract.yaml',
  'docs/stabilization/evidence/commercial-hardening/pr12/frozen-pr11-performance-contract.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/migration-input-contract.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-contract.schema.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-manifest.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml',
  'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-binding.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-binding-v6.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-credential-configuration-v2.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-authorization-projection-v1.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-single-action-approval-receipt-v2.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-derived-execution-binding-v1.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-official-pricing-evidence-v3.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-dpapi-bootstrap-approval-v1.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-windows-dpapi-envelope-v1.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-action-journal.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-result-v6.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provider-safe-projection-v4.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-evidence-manifest.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-privacy-scan.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-organization-identity-capture-binding-v1.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-organization-identity-capture-owner-approval-v1.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-organization-identity-capture-action-journal.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-organization-identity-capture-result-v1.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-organization-identity-provider-safe-projection-v1.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-organization-identity-capture-evidence-manifest-v1.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-organization-identity-capture-privacy-scan-v1.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-identity-bootstrap-binding.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-identity-bootstrap-result.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-platform-configuration-raw-evidence.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-replay-catalog-capture-binding.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-replay-catalog-capture-result.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-clean-replay-precondition-result.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-migration-replay-dry-run-result.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-clean-migration-replay-operation.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-credential-provider-configuration.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/restore-credential-provider-configuration.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-external-side-effect-inventory-result.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/post-restore-side-effect-result.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/external-side-effect-raw-evidence.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/backup-watermark-operation.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/backup-inventory-raw-evidence.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/dr-platform-config-projection-contract-v1.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/dr-excluded-manual-scope-raw-evidence.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/dr-excluded-manual-scope-comparison.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/restore-project-creation-binding.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/restore-project-provider-export.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/restore-execution-supplemental-binding.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/hosted-slo-contract.proposed.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/representative-data-contract.proposed.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/dr-contract.proposed.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/integration-credential-contract.proposed.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/staging-command-ledger.proposed.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/security-target-classification.proposed.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/security-target-inventory.proposed.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/data-api-acl-inventory.proposed.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/comm-gate-evidence-map-v1.json',
  'scripts/commercial-hardening/scan-pr12-evidence.mjs',
  'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs',
  'scripts/commercial-hardening/pr12-windows-dpapi-credential-channel.mjs',
  'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1',
  'scripts/commercial-hardening/initialize-pr12-windows-dpapi-credentials.ps1',
  'scripts/commercial-hardening/build-pr12-action003-approval-packet.mjs',
  'scripts/commercial-hardening/prepare-pr12-action003-approval-packet.mjs',
  'scripts/commercial-hardening/pr12-action003-approval-receipt-contract.mjs',
  'scripts/commercial-hardening/pr12-windows-owner-private-acl.ps1',
  'scripts/commercial-hardening/capture-pr12-action003-public-pricing.mjs',
  'scripts/commercial-hardening/derive-pr12-action003-execution-binding.mjs',
  'scripts/commercial-hardening/record-pr12-action003-derived-execution-binding.mjs',
  'scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs',
  'scripts/commercial-hardening/verify-pr12-source-project-provisioning-evidence.mjs',
  'scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs',
  'scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs',
  'scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs',
  'scripts/commercial-hardening/verify-pr12-evidence-manifest.mjs',
  'scripts/commercial-hardening/pr12-authority-artifact-contract.mjs',
  'scripts/commercial-hardening/pr12-stage-command-runtime.mjs',
  'scripts/commercial-hardening/pr12-source-identity-configuration-contract.mjs',
  'scripts/commercial-hardening/pr12-source-replay-catalog-contract.mjs',
  'scripts/commercial-hardening/pr12-hosted-types-parity.mjs',
  'scripts/commercial-hardening/pr12-advisor-diff.mjs',
  'scripts/commercial-hardening/pr12-representative-fixture-contract.mjs',
  'scripts/commercial-hardening/pr12-representative-fixture-adapter.mjs',
  'scripts/commercial-hardening/pr12-all-role-smoke-contract.mjs',
  'scripts/commercial-hardening/pr12-all-role-smoke-adapter.mjs',
  'scripts/commercial-hardening/pr12-local-readiness-contract.mjs',
  'scripts/commercial-hardening/sql/pr12-source-clean-replay-precondition.sql',
  'scripts/commercial-hardening/sql/pr12-post-replay-catalog-capture.sql',
  'scripts/commercial-hardening/sql/pr12-migration-history-parity.sql',
  'src/__tests__/security/commercial-pr12-qualification-preparation-contract.test.ts',
  'src/__tests__/security/commercial-pr12-action003-approval-builder.test.ts',
  'src/__tests__/security/commercial-pr12-action003-approval-preflight.test.ts',
  'src/__tests__/security/commercial-pr12-source-project-provisioning-contract.test.ts',
  'src/__tests__/security/commercial-pr12-source-organization-identity-capture-contract.test.ts',
  'src/__tests__/security/commercial-pr12-evidence-verifier.test.ts',
  'src/__tests__/security/commercial-pr12-authority-artifact-contract.test.ts',
  'src/__tests__/security/commercial-pr12-stage-command-runtime.test.ts',
  'src/__tests__/security/commercial-pr12-source-identity-configuration-readiness.test.ts',
  'src/__tests__/security/commercial-pr12-source-replay-collector.test.ts',
  'src/__tests__/security/commercial-pr12-hosted-types-collector.test.ts',
  'src/__tests__/security/commercial-pr12-advisor-collector.test.ts',
  'src/__tests__/security/commercial-pr12-representative-fixture-readiness.test.ts',
  'src/__tests__/security/commercial-pr12-all-role-smoke-readiness.test.ts',
  'src/__tests__/security/pr12-local-module-test-helpers.ts',
];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function repositoryPath(relativePath) {
  return path.join(REPO_ROOT, ...relativePath.split('/'));
}

function readRepositoryFile(relativePath) {
  return readFileSync(repositoryPath(relativePath), 'utf8');
}

function readJson(relativePath) {
  const value = JSON.parse(readRepositoryFile(relativePath));
  assert(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${relativePath} must contain one JSON object`
  );
  return value;
}

function parseCsvRows(relativePath) {
  const lines = readRepositoryFile(relativePath)
    .split(/\r?\n/u)
    .filter(line => line.length > 0);
  const parseLine = line => {
    const fields = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        fields.push(current);
        current = '';
      } else {
        current += character;
      }
    }
    assert(!quoted, `${relativePath} contains an unterminated quoted field`);
    fields.push(current);
    return fields;
  };
  assert(lines.length > 1, `${relativePath} must contain header and data rows`);
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line, index) => {
    const values = parseLine(line);
    assert(
      values.length === headers.length,
      `${relativePath} row ${String(index + 2)} column count drift`
    );
    return Object.fromEntries(
      headers.map((header, offset) => [header, values[offset]])
    );
  });
}

function requireRecord(value, context) {
  assert(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${context} must be an object`
  );
  return value;
}

function requireLimit(group, id, field) {
  const entry = requireRecord(group[id], `${id}`);
  assert(typeof entry[field] === 'number', `${id}.${field} must be a number`);
  return entry[field];
}

function assertExactJson(actual, expected, context) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${context} exact contract drift`
  );
}

function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(relativePath) {
  return sha256Buffer(readFileSync(repositoryPath(relativePath)));
}

function verifyExpectedFile(relativePath, expectedSha256) {
  assert(
    SHA256_PATTERN.test(expectedSha256),
    `invalid SHA-256: ${relativePath}`
  );
  assert(
    existsSync(repositoryPath(relativePath)),
    `missing input: ${relativePath}`
  );
  assert(
    sha256File(relativePath) === expectedSha256,
    `input hash drift: ${relativePath}`
  );
}

function canonicalSqlSet(relativeDirectory) {
  const absoluteDirectory = repositoryPath(relativeDirectory);
  const filenames = readdirSync(absoluteDirectory)
    .filter(filename => filename.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right, 'en'));
  const canonical = filenames
    .map(
      filename =>
        `${sha256File(`${relativeDirectory}/${filename}`)}  ${filename}`
    )
    .join('\n');
  return {
    filenames,
    sha256: sha256Buffer(`${canonical}\n`),
  };
}

function verifyRollbackParity(migrations, rollbacks) {
  const rollbackNames = new Set(rollbacks);
  for (const migration of migrations) {
    if (migration === '00000000000001_squashed_baseline.sql') continue;
    const expected = migration.replace(/\.sql$/u, '_rollback.sql');
    assert(
      rollbackNames.has(expected),
      `rollback parity missing for ${migration}: expected ${expected}`
    );
  }
}

function verifyMigrationContract() {
  const contract = readJson(
    'docs/stabilization/evidence/commercial-hardening/pr12/migration-input-contract.json'
  );
  assert(contract.baseCommit === BASE_COMMIT, 'migration contract base drift');
  assert(contract.migrationHead === '20260718011731', 'migration head drift');

  const migrations = canonicalSqlSet('supabase/migrations');
  const rollbacks = canonicalSqlSet('supabase/rollbacks');
  assert(
    migrations.filenames.length === contract.migrationCount,
    `migration count drift: ${String(migrations.filenames.length)}`
  );
  assert(
    rollbacks.filenames.length === contract.rollbackCount,
    `rollback count drift: ${String(rollbacks.filenames.length)}`
  );
  assert(
    migrations.sha256 === contract.migrationSetSha256,
    `migration set hash drift: ${migrations.sha256}`
  );
  assert(
    rollbacks.sha256 === contract.rollbackSetSha256,
    `rollback set hash drift: ${rollbacks.sha256}`
  );
  verifyRollbackParity(migrations.filenames, rollbacks.filenames);

  assert(Array.isArray(contract.pr11Inputs), 'pr11Inputs must be an array');
  for (const input of contract.pr11Inputs) {
    assert(
      typeof input === 'object' && input !== null && !Array.isArray(input),
      'each pr11Input must be an object'
    );
    verifyExpectedFile(input.migration, input.migrationSha256);
    verifyExpectedFile(input.rollback, input.rollbackSha256);
  }

  const nonMigrationInputs = contract.nonMigrationInputs;
  assert(
    typeof nonMigrationInputs === 'object' &&
      nonMigrationInputs !== null &&
      !Array.isArray(nonMigrationInputs),
    'nonMigrationInputs must be an object'
  );
  for (const input of Object.values(nonMigrationInputs)) {
    assert(
      typeof input === 'object' && input !== null && !Array.isArray(input),
      'each non-migration input must be an object'
    );
    verifyExpectedFile(input.path, input.sha256);
  }
}

function verifyPerformanceContract() {
  const contract = readJson(
    'docs/stabilization/evidence/commercial-hardening/pr12/frozen-pr11-performance-contract.json'
  );
  const authority = contract.authority;
  assert(
    typeof authority === 'object' &&
      authority !== null &&
      !Array.isArray(authority),
    'performance authority must be an object'
  );
  verifyExpectedFile(
    authority.officialResultPath,
    authority.officialResultSha256
  );
  verifyExpectedFile(
    authority.officialManifestPath,
    authority.officialManifestSha256
  );
  verifyExpectedFile(authority.runnerPath, authority.runnerSha256);

  assert(Array.isArray(contract.sourceInputs), 'sourceInputs must be an array');
  for (const input of contract.sourceInputs) {
    assert(
      typeof input === 'object' && input !== null && !Array.isArray(input),
      'each performance input must be an object'
    );
    verifyExpectedFile(input.path, input.sha256);
  }

  assertExactJson(
    contract.historicalFacts,
    {
      primaryExecutionResult: '8_PASS_1_FAIL',
      denseObservedMedianMs: 549.305,
      denseLimitMs: 521.55125,
      denseStatus: 'FAIL',
      pilotWaiverInheritedByPr12: false,
      phaseA2EnvironmentValidity: 'ENVIRONMENT_INVALID',
      candidateSqlExecutionCount: 0,
      permanentDdlApplied: false,
      steadyStateIndexEffect: 'NOT_PROVEN',
      singletonIndexRetirementAuthorized: false,
      idxBlocksResourceIdExpectedPresent: true,
      logicalBaseline:
        'c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78',
      normalizedPhysicalBaseline:
        '94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86',
    },
    'historicalFacts'
  );

  for (const [field, count] of [
    ['primaryExecutionGates', 9],
    ['primaryWalGates', 6],
    ['auxiliaryExecutionGates', 2],
    ['auxiliaryWalGates', 2],
  ]) {
    assert(Array.isArray(contract[field]), `${field} must be an array`);
    assert(contract[field].length === count, `${field} count drift`);
  }

  const official = readJson(authority.officialResultPath);
  const fixedLimits = requireRecord(
    official.fixedLimits,
    'official.fixedLimits'
  );
  const performance = requireRecord(
    fixedLimits.performance,
    'official.fixedLimits.performance'
  );
  const rlsRead = requireRecord(
    fixedLimits.rlsRead,
    'official.fixedLimits.rlsRead'
  );
  const rlsWrite = requireRecord(
    fixedLimits.rlsWrite,
    'official.fixedLimits.rlsWrite'
  );
  const expectedPrimaryExecution = [
    {
      id: 'created_by_read_100_of_20000',
      limit: requireLimit(
        performance,
        'created_by_read_100_of_20000',
        'executionMs'
      ),
      unit: 'ms',
      plan: 'natural_index_scan:blocks_created_by_idx',
    },
    ...[
      'sparse_insert_10000',
      'dense_insert_10000',
      'shift_full_only_insert_2000',
      'shift_full_plus_partial_insert_2000',
      'recipient_sparse_composite_insert_1000',
      'recipient_dense_composite_insert_1000',
    ].map(id => ({
      id,
      limit: requireLimit(performance, id, 'executionMs'),
      unit: 'ms',
    })),
    {
      id: 'customer_insurance_coverages_read_250',
      limit: requireLimit(
        rlsRead,
        'customer_insurance_coverages',
        'executionMs'
      ),
      unit: 'ms',
    },
    {
      id: 'menu_billing_profiles_read_250',
      limit: requireLimit(rlsRead, 'menu_billing_profiles', 'executionMs'),
      unit: 'ms',
    },
  ];
  const expectedPrimaryWal = [
    'sparse_insert_10000',
    'dense_insert_10000',
    'shift_full_only_insert_2000',
    'shift_full_plus_partial_insert_2000',
    'recipient_sparse_composite_insert_1000',
    'recipient_dense_composite_insert_1000',
  ].map(id => ({
    id,
    limit: requireLimit(performance, id, 'walBytes'),
    unit: 'bytes',
  }));
  const expectedAuxiliaryExecution = [
    'coverage_insert_2000',
    'menu_profile_insert_2000',
  ].map(id => ({
    id,
    limit: requireLimit(rlsWrite, id, 'executionMs'),
    unit: 'ms',
  }));
  const expectedAuxiliaryWal = [
    'coverage_insert_2000',
    'menu_profile_insert_2000',
  ].map(id => ({
    id,
    limit: requireLimit(rlsWrite, id, 'walBytes'),
    unit: 'bytes',
  }));
  assertExactJson(
    contract.primaryExecutionGates,
    expectedPrimaryExecution,
    'primaryExecutionGates'
  );
  assertExactJson(
    contract.primaryWalGates,
    expectedPrimaryWal,
    'primaryWalGates'
  );
  assertExactJson(
    contract.auxiliaryExecutionGates,
    expectedAuxiliaryExecution,
    'auxiliaryExecutionGates'
  );
  assertExactJson(
    contract.auxiliaryWalGates,
    expectedAuxiliaryWal,
    'auxiliaryWalGates'
  );
  assertExactJson(
    contract.planGates,
    [
      'created_by_read:natural_index_scan:blocks_created_by_idx',
      'rls_read:natural_index_scan',
      'rls_read:no_sort',
      'rls_read:no_bitmap_heap_scan',
      'rls_read:no_target_seq_scan',
      'rls_read:row_limit_250',
      'blocks:trigger_and_fk_each_10000_calls',
      'target_indexes:exact_catalog_identity',
    ],
    'planGates'
  );
  assertExactJson(
    contract.semanticGates,
    [
      'blocks_integrity:30_cases',
      'blocks_integrity:sqlstate_message_equivalence',
      'rls_scope:27_before_27_after',
      'rls_scope:tenant_a_b_exact_semantics',
      'pgtap:52_ok_0_not_ok',
    ],
    'semanticGates'
  );

  const serialized = JSON.stringify(contract);
  for (const boundary of [
    'median_of_exactly_3',
    'before_after_after_before_before_after',
    'rebaseline_allowed":false',
    'discarded_samples_allowed":false',
    'hosted_slo_is_additive_not_replacement":true',
    'natural_index_scan:blocks_created_by_idx',
    'tenant_a_b_exact_semantics',
  ]) {
    assert(
      serialized.includes(boundary),
      `performance boundary missing: ${boundary}`
    );
  }
}

function verifyGateInventory() {
  const source = readRepositoryFile('docs/releases/current-gate-status.yaml');
  const ids = [...source.matchAll(/^\s*- id: (COMM-[A-Z]+-\d{3})$/gmu)].map(
    match => match[1]
  );
  assert(
    ids.length === 54,
    `expected 54 COMM gates, found ${String(ids.length)}`
  );
  assert(new Set(ids).size === 54, 'duplicate COMM gate IDs');

  for (const [family, count] of [
    ['DB', 8],
    ['TENANT', 9],
    ['AUTH', 8],
    ['API', 9],
    ['BILL', 9],
    ['OPS', 11],
  ]) {
    assert(
      ids.filter(id => id.startsWith(`COMM-${family}-`)).length === count,
      `COMM-${family} inventory drift`
    );
  }

  const notRunCount = [...source.matchAll(/^\s*status: NOT_RUN$/gmu)].length;
  assert(
    notRunCount === 59,
    `expected 59 NOT_RUN items, found ${String(notRunCount)}`
  );
  assert(
    !/^\s*status: PASS(?:_WITH_RISK)?$/gmu.test(source),
    'unsupported PASS found'
  );
  assert(
    source.includes('commercial_release: NO_GO'),
    'commercial release must stay NO_GO'
  );
  assert(
    source.includes('assessed_commit: NOT_CAPTURED'),
    'self commit must be deferred'
  );
  assert(
    source.includes('selector: GIT_HEAD_AT_EVALUATION'),
    'head selector missing'
  );
}

function verifyCommGateEvidenceMap() {
  const gateStatus = readRepositoryFile(
    'docs/releases/current-gate-status.yaml'
  );
  const expectedIds = [
    ...gateStatus.matchAll(/^\s*- id: (COMM-[A-Z]+-\d{3})$/gmu),
  ].map(match => match[1]);
  const contractPath =
    'docs/stabilization/evidence/commercial-hardening/pr12/comm-gate-evidence-map-v1.json';
  const contract = readJson(contractPath);
  const familyResultTypes = requireRecord(
    contract.familyResultTypes,
    'comm map familyResultTypes'
  );
  const familyDefaults = requireRecord(
    contract.familyDefaults,
    'comm map familyDefaults'
  );
  const gates = Array.isArray(contract.gates) ? contract.gates : [];
  const ids = gates.map((value, index) => {
    const row = requireRecord(value, `comm map gates[${String(index)}]`);
    assert(
      Array.isArray(row.requires) && row.requires.length > 0,
      `comm map ${String(row.id)} has no closed claims`
    );
    assert(
      row.requires.every(
        claim => typeof claim === 'string' && claim.length > 0
      ) && new Set(row.requires).size === row.requires.length,
      `comm map ${String(row.id)} claim inventory drift`
    );
    return row.id;
  });
  assert(
    contract.schemaVersion === 1 &&
      contract.status === 'DESIGN_FROZEN_EXECUTION_BLOCKED' &&
      contract.unknownClaimsFailClosed === true,
    'COMM evidence map must remain fail-closed and execution-blocked'
  );
  assertExactJson(ids, expectedIds, 'COMM evidence map gate inventory');
  assertExactJson(
    familyResultTypes,
    {
      DB: 'DATABASE_QUALIFICATION_RESULT',
      TENANT: 'TENANT_ISOLATION_RESULT',
      AUTH: 'AUTHORIZATION_BOUNDARY_RESULT',
      API: 'API_EXPOSURE_RESULT',
      BILL: 'BILLING_SANDBOX_RESULT',
      OPS: 'OPERATIONS_DR_RESULT',
    },
    'COMM evidence map family result types'
  );
  assert(
    Array.isArray(familyDefaults.BILL) &&
      familyDefaults.BILL.length === 3 &&
      Object.keys(familyDefaults).length === 6,
    'COMM evidence map family defaults drift'
  );
  assert(
    Array.isArray(contract.unimplementedClaimFamilies) &&
      contract.unimplementedClaimFamilies.length > 0,
    'COMM evidence map must retain explicit unimplemented claim families'
  );
  const digest = sha256File(contractPath);
  const approval = readRepositoryFile(
    'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml'
  );
  const entry = readRepositoryFile(
    'docs/stabilization/evidence/commercial-hardening/pr12/isolated-staging-entry-contract.yaml'
  );
  for (const value of [approval, entry]) {
    assert(
      value.includes(`sha256: ${digest}`) &&
        value.includes('generic_self_attestation_allowed: false') &&
        value.includes('typed_claim_registry_status: NOT_IMPLEMENTED') &&
        value.includes('execution_pass_allowed: false'),
      'COMM evidence map approval binding or fail-closed boundary missing'
    );
  }
}

function verifyApprovalBoundaries() {
  const sources = [
    'docs/stabilization/evidence/commercial-hardening/pr12/pr12-preparation-gate.yaml',
    'docs/stabilization/evidence/commercial-hardening/pr12/isolated-staging-entry-contract.yaml',
    'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml',
  ].map(readRepositoryFile);
  const combined = sources.join('\n');
  for (const required of [
    'draft_pr_creation_authorized: true',
    'isolated_staging_connection_authorized: false',
    'isolated_staging_execution_authorized: false',
    'ready_transition_authorized: false',
    'merge_authorized: false',
    'production_connection_authorized: false',
    'commercial_release_authorized: false',
    'index_retirement_authorized: false',
    'project_ref: NOT_CAPTURED',
    'project_name: seikotsuin-pr12-isolated-qualification-20260719',
    'region: ap-northeast-1',
    'database_tier: LARGE',
    'hosted_concurrency: 50',
    'p95_ms: 2000',
    'rto_threshold_seconds: 28800',
    'rpo_threshold_seconds: 86400',
    'approved_database_connection_mode: DIRECT',
    'exact_commands: PROPOSED_NOT_EXECUTABLE',
    'hosted_collector_status: NOT_IMPLEMENTED',
    'maximum_allowed_clock_skew_seconds: UNASSIGNED',
    'typed_claim_registry_status: NOT_IMPLEMENTED',
    'execution_pass_allowed: false',
    'action_id: PR12-ACTION-003',
    'method: OWNER_MANAGEMENT_API_CREATE_PROJECT',
    'endpoint: https://api.supabase.com/v1/projects',
    'one new isolated billable Supabase source project',
  ]) {
    assert(
      combined.includes(required),
      `approval boundary missing: ${required}`
    );
  }
  assert(
    sources[2].includes(
      'phase1_operator_canonical_principal_id: owner:futoshi-iwasawa'
    ) &&
      sources[2].includes(
        'owner:futoshi-iwasawa is the recorded canonical principal'
      ) &&
      sources[2].includes('phase1_final_action_risk_acceptance: NOT_CAPTURED'),
    'Phase 1 principal or unresolved final Action-003 risk acceptance drift'
  );
  const humanPacket = readRepositoryFile(
    'docs/stabilization/pr12-staging-execution-owner-approval-packet-v0.2-20260719.md'
  );
  assert(
    humanPacket.includes('`DIRECT` only') &&
      !humanPacket.includes('platform-default direct/session pool') &&
      humanPacket.includes('`PR12-ACTION-003` Management API') &&
      humanPacket.includes('`PR12_SUPABASE_ACCESS_TOKEN`') &&
      humanPacket.includes('`PR12_SOURCE_DB_PASSWORD`') &&
      humanPacket.includes('one new billable isolated Supabase source project'),
    'human packet must make DIRECT the only approved execution connection'
  );
}

function verifyProposalContracts() {
  const prefix = 'docs/stabilization/evidence/commercial-hardening/pr12/';
  const proposalFiles = [
    'hosted-slo-contract.proposed.json',
    'representative-data-contract.proposed.json',
    'dr-contract.proposed.json',
    'integration-credential-contract.proposed.json',
    'staging-command-ledger.proposed.json',
    'security-target-classification.proposed.json',
    'security-target-inventory.proposed.json',
    'data-api-acl-inventory.proposed.json',
    'comm-gate-evidence-map-v1.json',
  ];
  const approval = readRepositoryFile(
    `${prefix}staging-execution-approval-packet.yaml`
  );
  const entry = readRepositoryFile(
    `${prefix}isolated-staging-entry-contract.yaml`
  );
  const normalizedApproval = approval.replaceAll('\r\n', '\n');
  const normalizedEntry = entry.replaceAll('\r\n', '\n');
  for (const requiredStageToken of [
    'source_project_provisioning',
    'source_identity_and_configuration_bootstrap',
    'source_replay_and_catalog_capture',
    'source_qualification_and_backup_capture',
    'restore_project_creation',
    'restore_target_validation',
  ]) {
    assert(
      approval.includes(requiredStageToken),
      `approval packet omits six-stage token: ${requiredStageToken}`
    );
  }
  assert(
    approval.includes('first_and_only_remote_command_id: PR12-CMD-004A') &&
      normalizedApproval.includes(
        'dpapi_bootstrap_authorized_roles:\n      - DATABASE_PASSWORD'
      ) &&
      approval.includes(
        'source_identity_and_configuration_bootstrap_authorized: false'
      ) &&
      entry.includes(
        'stage_2_source_identity_and_read_only_configuration_bootstrap_PR12_CMD_004A'
      ) &&
      entry.includes(
        'source_identity_and_configuration_bootstrap_authorized: false'
      ),
    'six-stage bootstrap authority or mandatory stop drift'
  );
  const stage3Yaml = STAGE_3_COMMAND_IDS.map(id => `        - ${id}`).join(
    '\n'
  );
  const stage4Yaml = STAGE_4_COMMAND_IDS.map(id => `        - ${id}`).join(
    '\n'
  );
  const entryStage3Yaml = STAGE_3_COMMAND_IDS.map(id => `  - ${id}`).join('\n');
  const entryStage4Yaml = STAGE_4_COMMAND_IDS.map(id => `  - ${id}`).join('\n');
  assert(
    normalizedApproval.includes(
      `    source_replay_and_catalog_capture:\n      first_command_id: PR12-CMD-003\n      last_command_id: PR12-CMD-008A\n      ordered_command_ids:\n${stage3Yaml}`
    ) &&
      normalizedApproval.includes(
        `    source_qualification_and_backup_capture:\n      first_command_id: PR12-CMD-008B\n      last_command_id: PR12-CMD-017A\n      ordered_command_ids:\n${stage4Yaml}`
      ) &&
      normalizedEntry.includes(
        `stage_3_ordered_command_ids:\n${entryStage3Yaml}`
      ) &&
      normalizedEntry.includes(
        `stage_4_ordered_command_ids:\n${entryStage4Yaml}`
      ),
    'machine approval packet or entry contract Stage 3/4 command order drift'
  );
  assert(
    normalizedApproval.includes(
      'static_verifier_clock_capability: ACTION_START_TO_PR12_CMD_019F_MONOTONIC_AND_FOUR_SOURCE_SKEW_IMPLEMENTED_AND_NEGATIVE_TESTED'
    ) &&
      normalizedApproval.includes(
        'runtime_clock_provenance_collector_status: NOT_IMPLEMENTED'
      ) &&
      normalizedApproval.includes(
        'runtime_numeric_skew_input_collector_status: NOT_IMPLEMENTED'
      ) &&
      !normalizedApproval.includes('current_verifier_clock_capability:') &&
      !normalizedApproval.includes('numeric_skew_validator_status:'),
    'static DR verifier capability or runtime collector status drift'
  );
  const binding = readJson(`${prefix}staging-execution-binding.template.json`);
  const serializedBinding = JSON.stringify(binding);
  for (const filename of proposalFiles) {
    const relativePath = `${prefix}${filename}`;
    const digest = sha256File(relativePath);
    assert(approval.includes(filename), `approval omits ${filename}`);
    assert(approval.includes(digest), `approval hash drift for ${filename}`);
    assert(entry.includes(filename), `entry omits ${filename}`);
    assert(entry.includes(digest), `entry hash drift for ${filename}`);
    assert(serializedBinding.includes(filename), `binding omits ${filename}`);
    assert(
      serializedBinding.includes(digest),
      `binding hash drift for ${filename}`
    );
  }

  const classificationPath = `${prefix}security-target-classification.proposed.json`;
  const inventoryPath = `${prefix}security-target-inventory.proposed.json`;
  const dataApiAclPath = `${prefix}data-api-acl-inventory.proposed.json`;
  const classificationDigest = sha256File(classificationPath);
  const inventoryDigest = sha256File(inventoryPath);
  const dataApiAclDigest = sha256File(dataApiAclPath);
  assert(
    approval.includes(
      `target_classification_proposal_sha256: ${classificationDigest}`
    ) &&
      approval.includes(
        `target_inventory_proposal_sha256: ${inventoryDigest}`
      ) &&
      entry.includes(
        `target_classification_proposal_sha256: ${classificationDigest}`
      ) &&
      entry.includes(`target_inventory_proposal_sha256: ${inventoryDigest}`),
    'security proposal field-specific hash binding drift'
  );
  assert(
    approval.includes(
      'acl_inventory_proposal_path: data-api-acl-inventory.proposed.json'
    ) &&
      approval.includes(`acl_inventory_proposal_sha256: ${dataApiAclDigest}`) &&
      entry.includes(
        'acl_inventory_proposal: data-api-acl-inventory.proposed.json'
      ) &&
      entry.includes(`acl_inventory_proposal_sha256: ${dataApiAclDigest}`),
    'Data API ACL proposal field-specific hash binding drift'
  );
  assert(
    approval.includes('execution_target_inventory_path: NOT_CAPTURED') &&
      approval.includes('execution_target_inventory_sha256: NOT_CAPTURED') &&
      entry.includes('finalized_target_inventory: NOT_CAPTURED') &&
      entry.includes('finalized_target_inventory_sha256: NOT_CAPTURED'),
    'provisional security proposal was promoted to executable evidence'
  );

  const targetClassification = readJson(classificationPath);
  const classificationTaxonomy = requireRecord(
    targetClassification.taxonomy,
    'security target classification taxonomy'
  );
  const classificationOwner = requireRecord(
    targetClassification.ownerDecision,
    'security target classification owner decision'
  );
  const classificationReadiness = requireRecord(
    targetClassification.implementationReadiness,
    'security target classification readiness'
  );
  const classificationAuthority = requireRecord(
    targetClassification.authority,
    'security target classification authority'
  );
  const trackedDraftBaseline = requireRecord(
    classificationAuthority.trackedDraftBaseline,
    'security target tracked draft baseline'
  );
  const trackedDraftPath = String(trackedDraftBaseline.path);
  assert(
    trackedDraftPath ===
      'docs/stabilization/evidence/commercial-hardening/table-classification-draft.csv' &&
      trackedDraftBaseline.sha256 === sha256File(trackedDraftPath),
    'security target tracked draft baseline binding drift'
  );
  const trackedDraftRows = parseCsvRows(trackedDraftPath);
  const publicRelations = trackedDraftRows.map(
    row => `public.${row.table_name}`
  );
  assert(
    new Set(publicRelations).size === publicRelations.length,
    'security target tracked draft baseline contains duplicate relations'
  );
  const candidateClassCounts = Object.fromEntries(
    [
      'A_TENANT_CANONICAL',
      'B_SERVICE_ROLE_ONLY',
      'C_SHARED_MASTER_READ_ONLY',
      'E_LEGACY_QUARANTINE',
      'UNKNOWN',
    ].map(candidateClass => [
      candidateClass,
      trackedDraftRows.filter(row => row.candidate_class === candidateClass)
        .length,
    ])
  );
  assert(
    Object.values(candidateClassCounts).reduce(
      (total, value) => total + value,
      0
    ) === trackedDraftRows.length,
    'security target tracked draft contains an unsupported candidate class'
  );
  const computedDraftSummary = {
    publicRelationCount: trackedDraftRows.length,
    candidateClassCounts,
    publicSurfaceSpecialCandidateCount: trackedDraftRows.filter(
      row => row.public_surface_candidate === 'true'
    ).length,
    ownerApprovedPublicRelationCount: 0,
    unresolvedPublicRelationCount: trackedDraftRows.length,
  };
  assertExactJson(
    targetClassification.trackedDraftSummary,
    computedDraftSummary,
    'security target tracked draft summary'
  );
  const requiredAuthTargets = Array.isArray(
    targetClassification.requiredAuthTargets
  )
    ? targetClassification.requiredAuthTargets.map((value, index) =>
        requireRecord(value, `required Auth target ${String(index)}`)
      )
    : [];
  assert(
    targetClassification.schemaVersion === 2 &&
      targetClassification.status === 'PROPOSED_OWNER_APPROVAL_REQUIRED' &&
      targetClassification.executionStatus === 'NOT_RUN' &&
      classificationTaxonomy.unknownOrDraftBlocksExecution === true &&
      classificationOwner.owner === 'UNASSIGNED' &&
      classificationOwner.approvedAt === 'NOT_CAPTURED' &&
      classificationReadiness.postReplayCatalogCollector ===
        'NOT_IMPLEMENTED' &&
      classificationReadiness.normalizedClassificationCollector ===
        'NOT_IMPLEMENTED' &&
      classificationReadiness.executionAuthorized === false,
    'security target classification proposal must remain non-executable'
  );
  assertExactJson(
    requiredAuthTargets.map(value => [
      value.relation,
      value.proposedClassification,
      value.reviewStatus,
      value.executionBlocker,
    ]),
    [
      ['auth.identities', 'AUTH_PLATFORM_MANAGED', 'UNASSIGNED', true],
      ['auth.users', 'AUTH_PLATFORM_MANAGED', 'UNASSIGNED', true],
    ],
    'security target required Auth blockers'
  );

  const targetInventory = readJson(inventoryPath);
  const inventoryDerivation = requireRecord(
    targetInventory.derivation,
    'security target inventory derivation'
  );
  const classificationContract = requireRecord(
    inventoryDerivation.classificationContract,
    'security target inventory classification contract'
  );
  const inventoryOwner = requireRecord(
    targetInventory.ownerDecision,
    'security target inventory owner decision'
  );
  const inventoryReadiness = requireRecord(
    targetInventory.implementationReadiness,
    'security target inventory readiness'
  );
  const blockingInputs = Array.isArray(targetInventory.blockingInputs)
    ? targetInventory.blockingInputs.map((blocker, index) =>
        requireRecord(
          blocker,
          `security target inventory blocker ${String(index)}`
        )
      )
    : [];
  assertExactJson(
    blockingInputs.map(blocker => [blocker.id, blocker.status]),
    [
      ['POST_REPLAY_CATALOG_NOT_CAPTURED', 'NOT_CAPTURED'],
      ['CATALOG_TO_TRACKED_BASELINE_PARITY_NOT_CAPTURED', 'NOT_CAPTURED'],
      ['PUBLIC_CLASSIFICATIONS_UNRESOLVED', 'UNASSIGNED'],
      ['ALL_RELATION_OWNER_REVIEW_NOT_CAPTURED', 'NOT_CAPTURED'],
      ['AUTH_RELATION_CLASSIFICATION_NOT_APPROVED', 'UNASSIGNED'],
      ['TARGET_INVENTORY_COLLECTOR_NOT_IMPLEMENTED', 'NOT_IMPLEMENTED'],
    ],
    'security target inventory blockers'
  );
  assert(
    targetInventory.schemaVersion === 2 &&
      targetInventory.status === 'PROPOSED_OWNER_APPROVAL_REQUIRED' &&
      targetInventory.executionStatus === 'NOT_RUN' &&
      inventoryDerivation.selfAttestedMatrixTargetsAllowed === false &&
      classificationContract.path ===
        'security-target-classification.proposed.json' &&
      classificationContract.sha256 === classificationDigest &&
      inventoryOwner.owner === 'UNASSIGNED' &&
      inventoryOwner.approvedAt === 'NOT_CAPTURED' &&
      inventoryReadiness.collector === 'NOT_IMPLEMENTED' &&
      inventoryReadiness.executionAuthorized === false,
    'security target inventory proposal must remain non-executable'
  );
  const inventoryTrackedBaseline = requireRecord(
    inventoryDerivation.trackedDraftBaseline,
    'security target inventory tracked draft baseline'
  );
  const inventorySourceCatalog = requireRecord(
    inventoryDerivation.sourceCatalog,
    'security target inventory source catalog'
  );
  const inventoryRepresentative = requireRecord(
    inventoryDerivation.representativeDataContract,
    'security target inventory representative fixture'
  );
  const representativeContractRelativePath =
    'docs/stabilization/evidence/commercial-hardening/pr12/representative-data-contract.proposed.json';
  const representativeContractDigest = sha256File(
    representativeContractRelativePath
  );
  assert(
    inventoryTrackedBaseline.path === trackedDraftPath &&
      inventoryTrackedBaseline.sha256 === trackedDraftBaseline.sha256 &&
      inventoryTrackedBaseline.publicRelationCount ===
        trackedDraftRows.length &&
      inventorySourceCatalog.path === 'NOT_CAPTURED' &&
      inventorySourceCatalog.sha256 === 'NOT_CAPTURED' &&
      inventorySourceCatalog.status === 'NOT_RUN' &&
      inventoryRepresentative.path ===
        'representative-data-contract.proposed.json' &&
      inventoryRepresentative.sha256 === representativeContractDigest &&
      inventoryRepresentative.role.includes('fixture coverage subset only'),
    'security target inventory catalog/fixture binding or role drift'
  );
  assertExactJson(
    targetInventory.provisionalCatalogSummary,
    {
      trackedPublicRelations: trackedDraftRows.length,
      requiredAuthRelations: requiredAuthTargets.length,
      provisionalTotalRelations:
        trackedDraftRows.length + requiredAuthTargets.length,
      currentUnknownPublicRelations: candidateClassCounts.UNKNOWN,
      allRelationsOwnerApproved: false,
      postReplayCatalogCaptured: false,
    },
    'security target provisional catalog summary'
  );

  const dataApiAcl = readJson(dataApiAclPath);
  const aclScope = requireRecord(
    dataApiAcl.catalogScope,
    'Data API ACL catalog scope'
  );
  const aclInputs = requireRecord(
    dataApiAcl.trackedInputs,
    'Data API ACL tracked inputs'
  );
  const aclContract = requireRecord(
    dataApiAcl.finalExecutionContract,
    'Data API ACL final execution contract'
  );
  const aclOwner = requireRecord(
    dataApiAcl.ownerDecision,
    'Data API ACL owner decision'
  );
  const aclReadiness = requireRecord(
    dataApiAcl.implementationReadiness,
    'Data API ACL implementation readiness'
  );
  const aclBlockers = Array.isArray(dataApiAcl.blockingInputs)
    ? dataApiAcl.blockingInputs.map((blocker, index) =>
        requireRecord(blocker, `Data API ACL blocker ${String(index)}`)
      )
    : [];
  assert(
    dataApiAcl.schemaVersion === 1 &&
      dataApiAcl.inventoryId === 'PR12-DATA-API-ACL-INVENTORY-PROPOSAL-001' &&
      dataApiAcl.status === 'PROPOSED_OWNER_APPROVAL_REQUIRED' &&
      dataApiAcl.executionStatus === 'NOT_RUN' &&
      aclScope.source === 'POST_REPLAY_PG_CATALOG' &&
      aclScope.actualExposedSchemas === 'NOT_CAPTURED' &&
      aclScope.schemasFromProjectSettings === true &&
      aclScope.columnsIncluded === true &&
      aclScope.functionIdentityArgumentsIncluded === true &&
      aclContract.sourceCatalogPath === 'NOT_CAPTURED' &&
      aclContract.sourceCatalogSha256 === 'NOT_CAPTURED' &&
      aclContract.restoreCatalogPath === 'NOT_CAPTURED' &&
      aclContract.restoreCatalogSha256 === 'NOT_CAPTURED' &&
      aclContract.missingExtraOrDuplicateTupleAllowed === false &&
      aclContract.effectiveGrantRecomputed === true &&
      aclContract.aclAndRlsEvaluatedIndependently === true &&
      aclContract.sourceAndRestoreCatalogParityRequired === true &&
      aclContract.sourceEvidenceReuseAfterRestoreAllowed === false &&
      aclOwner.owner === 'UNASSIGNED' &&
      aclOwner.approvedAt === 'NOT_CAPTURED' &&
      aclOwner.expiresAt === 'NOT_CAPTURED' &&
      aclOwner.approvalEvidence === 'NOT_CAPTURED' &&
      aclReadiness.catalogCollector === 'NOT_IMPLEMENTED' &&
      aclReadiness.matrixCollector === 'NOT_IMPLEMENTED' &&
      aclReadiness.executionAuthorized === false,
    'Data API ACL inventory proposal must remain complete and non-executable'
  );
  assertExactJson(
    aclScope.relationRelkinds,
    ['r', 'p', 'v', 'm', 'f'],
    'Data API ACL relation relkinds'
  );
  assertExactJson(
    aclScope.defaultPrivilegeObjectTypes,
    ['TABLES', 'SEQUENCES', 'FUNCTIONS', 'TYPES', 'SCHEMAS'],
    'Data API ACL default privilege object types'
  );
  assert(
    aclScope.sequenceRelkind === 'S',
    'Data API ACL sequence relkind drift'
  );
  assertExactJson(
    aclScope.defaultPrivilegeOwners,
    ['postgres', 'supabase_admin'],
    'Data API ACL default privilege owners'
  );
  assert(
    aclContract.caseFormula ===
      'exact catalog object x applicable privilege x anon/authenticated/service_role',
    'Data API ACL exact case formula drift'
  );
  assertExactJson(
    aclContract.grantSources,
    ['DIRECT', 'PUBLIC', 'INHERITED'],
    'Data API ACL grant sources'
  );
  assertExactJson(
    aclContract.privilegeUniverse,
    {
      ACL_SCHEMA: ['USAGE', 'CREATE'],
      ACL_RELATION: [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
        'MAINTAIN',
      ],
      ACL_COLUMN: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
      ACL_SEQUENCE: ['SELECT', 'UPDATE', 'USAGE'],
      ACL_FUNCTION: ['EXECUTE'],
      ACL_DEFAULT_TABLES: [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
        'MAINTAIN',
      ],
      ACL_DEFAULT_SEQUENCES: ['SELECT', 'UPDATE', 'USAGE'],
      ACL_DEFAULT_FUNCTIONS: ['EXECUTE'],
      ACL_DEFAULT_TYPES: ['USAGE'],
      ACL_DEFAULT_SCHEMAS: ['USAGE', 'CREATE'],
    },
    'Data API ACL privilege universe'
  );
  assertExactJson(
    aclScope.roles,
    ['anon', 'authenticated', 'service_role'],
    'Data API ACL roles'
  );
  assertExactJson(
    aclScope.objectKinds,
    [
      'SCHEMA',
      'RELATION',
      'COLUMN',
      'SEQUENCE',
      'FUNCTION',
      'DEFAULT_PRIVILEGE',
    ],
    'Data API ACL object kinds'
  );
  for (const [inputName, expectedPath] of [
    [
      'pr02RelationPrivilegeMatrix',
      'docs/stabilization/evidence/commercial-hardening/pr02/privilege-matrix.csv',
    ],
    [
      'pr04SecurityDefinerMatrix',
      'docs/stabilization/evidence/commercial-hardening/pr04/security-definer-matrix.csv',
    ],
    [
      'pr04FunctionBoundary',
      'docs/stabilization/evidence/commercial-hardening/pr04/function-boundary-local-after.csv',
    ],
  ]) {
    const input = requireRecord(
      aclInputs[inputName],
      `Data API ACL ${inputName}`
    );
    assert(
      input.path === expectedPath && input.sha256 === sha256File(expectedPath),
      `Data API ACL tracked input drift: ${inputName}`
    );
  }
  const relationBaseline = requireRecord(
    aclInputs.pr02RelationPrivilegeMatrix,
    'Data API ACL relation privilege baseline'
  );
  assert(
    relationBaseline.role ===
      'tracked baseline input only; runtime exposed-schema catalog remains authoritative',
    'Data API ACL tracked baseline was promoted to runtime authority'
  );
  assertExactJson(
    aclBlockers.map(blocker => [blocker.id, blocker.status, blocker.owner]),
    [
      [
        'DATA_API_PROJECT_SETTINGS_NOT_CAPTURED',
        'NOT_CAPTURED',
        'supabasePlatformOwner',
      ],
      [
        'POST_REPLAY_ACL_OBJECT_CATALOG_NOT_CAPTURED',
        'NOT_CAPTURED',
        'databaseMigrationOperator',
      ],
      [
        'ACL_EXPECTED_CASES_NOT_OWNER_APPROVED',
        'UNASSIGNED',
        'securityTenantReviewer',
      ],
      [
        'ACL_CATALOG_AND_MATRIX_COLLECTOR_NOT_IMPLEMENTED',
        'NOT_IMPLEMENTED',
        'databaseMigrationOperator',
      ],
    ],
    'Data API ACL blockers'
  );

  const hosted = readJson(`${prefix}hosted-slo-contract.proposed.json`);
  const hostedTarget = requireRecord(hosted.target, 'hosted.target');
  const hostedThresholds = requireRecord(
    hosted.thresholds,
    'hosted.thresholds'
  );
  const hostedReadiness = requireRecord(
    hosted.implementationReadiness,
    'hosted.implementationReadiness'
  );
  assert(
    hosted.status === 'PROPOSED_OWNER_APPROVAL_REQUIRED' &&
      hosted.executionStatus === 'NOT_RUN',
    'hosted proposal status drift'
  );
  assert(
    hostedTarget.region === 'ap-northeast-1' &&
      hostedTarget.compute === 'large',
    'hosted target proposal drift'
  );
  assert(
    Array.isArray(hosted.scoredSamples) &&
      JSON.stringify(
        hosted.scoredSamples.map(sample => [
          sample.id,
          sample.durationSeconds,
          sample.concurrency,
        ])
      ) ===
        JSON.stringify([
          ['sample_1_read_heavy_c50', 600, 50],
          ['sample_2_mixed_crud_c50', 600, 50],
          ['sample_3_read_heavy_repeat_c50', 600, 50],
        ]),
    'hosted sample order/duration/concurrency drift'
  );
  assertExactJson(
    hostedThresholds,
    {
      p95Ms: 2000,
      p99Ms: 3000,
      minimumThroughputPerSecond: 20,
      maximumUnexpectedFailedRequests: 0,
      maximum5xxRate: 0,
      maximumTimeoutRate: 0,
      maximumCpuPercent: 75,
      minimumPoolHeadroomPercent: 25,
      maximumLockWaitMs: 1000,
      maximumWalBytes: 268435456,
      maximumMigrationDurationSeconds: 900,
    },
    'hosted thresholds'
  );
  assert(
    hostedReadiness.hostedCollector === 'NOT_IMPLEMENTED' &&
      hostedReadiness.executionAuthorized === false,
    'hosted proposal must remain non-executable'
  );

  const data = readJson(`${prefix}representative-data-contract.proposed.json`);
  const rowTargets = requireRecord(
    data.explicitPersistentRowTargets,
    'data.explicitPersistentRowTargets'
  );
  const representativeness = requireRecord(
    data.representativeness,
    'data.representativeness'
  );
  const dataReadiness = requireRecord(
    data.implementationReadiness,
    'data.implementationReadiness'
  );
  assert(
    data.classification === 'SYNTHETIC' &&
      data.productionSnapshotAllowed === false &&
      data.patientPiiAllowed === false,
    'representative-data privacy boundary drift'
  );
  const derivedRows = requireRecord(data.derivedRows, 'data.derivedRows');
  assert(
    rowTargets.combinedSubtotal === 83 &&
      derivedRows.exactCount === 12 &&
      derivedRows.snapshotTotal === 95 &&
      derivedRows.snapshotRelationCount === 19 &&
      data.fixturePlanSha256 ===
        'a2446817c50b1d2ada0c4701acedc7abd2e00623c2ba503873f325a78d421028' &&
      data.fixturePayloadAggregateSha256 ===
        '0c5c6237faa673171a618b9a815cba41f6ced4e5a8e89814e399f006fa747e39' &&
      data.actorTopologySha256 ===
        'beae5bba032aadcb88adacc21146b47c95ce4582407a19e2b68f6891dbba83a3' &&
      data.runtimeSourceSnapshotSha256 === 'NOT_CAPTURED',
    'fixture 83+12 row, relation, or plan identity drift'
  );
  assert(
    representativeness.persistentCapacityRepresentative === false,
    'capacity limitation must remain explicit'
  );
  assert(
    data.implementationStatus === 'IMPLEMENTED_OFFLINE_VERIFIED' &&
      data.executionStatus === 'NOT_RUN' &&
      dataReadiness.fixturePlanCompiler === 'IMPLEMENTED_OFFLINE_VERIFIED' &&
      dataReadiness.strictLoadOperationCompiler ===
        'IMPLEMENTED_OFFLINE_VERIFIED' &&
      dataReadiness.postLoadExactRowAndHashValidator ===
        'IMPLEMENTED_OFFLINE_VERIFIED' &&
      dataReadiness.payloadIdentityBinding === 'IMPLEMENTED_OFFLINE_VERIFIED' &&
      dataReadiness.sqlPayloadResolver === 'NOT_IMPLEMENTED' &&
      dataReadiness.runtimeDatabaseCollector === 'NOT_IMPLEMENTED' &&
      dataReadiness.executionAuthorized === false,
    'data readiness must stay offline-only and non-executable'
  );

  const dr = readJson(`${prefix}dr-contract.proposed.json`);
  assert(
    sha256File(`${prefix}dr-contract.proposed.json`) ===
      FROZEN_PROPOSED_DR_CONTRACT_SHA256,
    'DR proposal changed an immutable pre-execution safety boundary'
  );
  const drMethod = requireRecord(dr.method, 'dr.method');
  const rto = requireRecord(dr.rto, 'dr.rto');
  const rpo = requireRecord(dr.rpo, 'dr.rpo');
  const cleanup = requireRecord(dr.cleanup, 'dr.cleanup');
  const drSource = requireRecord(dr.source, 'dr.source');
  assert(
    drMethod.backup === 'Supabase Pro daily physical backup' &&
      drMethod.restore ===
        'Supabase Dashboard Restore to a New Project (Beta)' &&
      drMethod.pitrEnabled === false,
    'DR method drift'
  );
  assert(
    rto.thresholdSeconds === 28800 &&
      rpo.thresholdSeconds === 86400 &&
      dr.rpoCalculationClock === 'SOURCE_DATABASE_CLOCK_TIMESTAMP_UTC' &&
      rpo.calculationClock === 'SOURCE_DATABASE_CLOCK_TIMESTAMP_UTC',
    'RTO/RPO proposal drift'
  );
  assert(
    cleanup.sourceOrTargetDeletionAuthorized === false,
    'proposal must not authorize project deletion'
  );
  assert(
    drSource.providerInsertedAt === 'NOT_CAPTURED' &&
      !Object.hasOwn(drSource, 'backupCompletedAt'),
    'DR source must use provider inserted_at semantics without a fabricated completion timestamp'
  );

  const integration = readJson(
    `${prefix}integration-credential-contract.proposed.json`
  );
  const credentialChannels = requireRecord(
    integration.credentialChannels,
    'integration.credentialChannels'
  );
  const sharedCredentialChannel = requireRecord(
    credentialChannels.sharedProvider,
    'integration.credentialChannels.sharedProvider'
  );
  const sourceCredentialChannel = requireRecord(
    credentialChannels.source,
    'integration.credentialChannels.source'
  );
  const restoreCredentialChannel = requireRecord(
    credentialChannels.restore,
    'integration.credentialChannels.restore'
  );
  const commonCredentialIsolationRules = requireRecord(
    credentialChannels.commonIsolationRules,
    'integration.credentialChannels.commonIsolationRules'
  );
  const targetModes = requireRecord(
    integration.targetModes,
    'integration.targetModes'
  );
  const sourceIntegrations = requireRecord(
    integration.integrations,
    'integration.integrations'
  );
  const sourceStripe = requireRecord(
    sourceIntegrations.stripe,
    'integration.integrations.stripe'
  );
  const restoreIntegrationOverrides = requireRecord(
    integration.restoreIntegrationOverrides,
    'integration.restoreIntegrationOverrides'
  );
  const restoreStripe = requireRecord(
    restoreIntegrationOverrides.stripe,
    'integration.restoreIntegrationOverrides.stripe'
  );
  const sideEffectCollector = requireRecord(
    integration.sideEffectCollector,
    'integration.sideEffectCollector'
  );
  const targetBindingRules = requireRecord(
    integration.targetBindingRules,
    'integration.targetBindingRules'
  );
  const directDatabaseUrlPolicy = requireRecord(
    integration.directDatabaseUrlPolicy,
    'integration.directDatabaseUrlPolicy'
  );
  const stageRuntimeChannels = requireRecord(
    integration.stageCommandRuntimeChannels,
    'integration.stageCommandRuntimeChannels'
  );
  const stageDatabaseChild = requireRecord(
    stageRuntimeChannels.databaseChild,
    'integration.stageCommandRuntimeChannels.databaseChild'
  );
  const stageHostedTypesChild = requireRecord(
    stageRuntimeChannels.hostedTypesChild,
    'integration.stageCommandRuntimeChannels.hostedTypesChild'
  );
  const stageChildProcess = requireRecord(
    stageRuntimeChannels.childProcess,
    'integration.stageCommandRuntimeChannels.childProcess'
  );
  assert(
    integration.schemaVersion === 1 &&
      integration.mode === 'SANDBOXED' &&
      integration.realExternalSideEffectsAllowed === false &&
      integration.executionAuthorized === false &&
      integration.channel === 'process_environment' &&
      integration.storageProvider === 'UNASSIGNED' &&
      integration.serverOnly === true &&
      integration.passwordFreeDirectDatabaseUrlInArgumentAllowed === true &&
      directDatabaseUrlPolicy.scheme === 'postgresql' &&
      directDatabaseUrlPolicy.username === 'postgres' &&
      directDatabaseUrlPolicy.passwordComponentAllowed === false &&
      directDatabaseUrlPolicy.host ===
        'db.<approved-project-ref>.supabase.co' &&
      directDatabaseUrlPolicy.port === 5432 &&
      directDatabaseUrlPolicy.database === 'postgres' &&
      directDatabaseUrlPolicy.sslmode === 'verify-full' &&
      directDatabaseUrlPolicy.sslrootcertMustMatchApprovedCaBundlePathAndSha256 ===
        true &&
      directDatabaseUrlPolicy.poolerAllowed === false &&
      directDatabaseUrlPolicy.ipv4AddonFallbackAllowed === false &&
      directDatabaseUrlPolicy.tlsWeakeningAllowed === false &&
      sharedCredentialChannel.channel === 'process_environment' &&
      sharedCredentialChannel.persistence === 'process_lifetime_only' &&
      sourceCredentialChannel.targetKind === 'SOURCE' &&
      restoreCredentialChannel.targetKind === 'RESTORE' &&
      commonCredentialIsolationRules.inheritParentEnvironment === false &&
      commonCredentialIsolationRules.ambientGenericFallbackAllowed === false &&
      commonCredentialIsolationRules.forbiddenLocationsApplyToSecretValuesOnly ===
        true &&
      commonCredentialIsolationRules.committedFixturePasswordsAllowedOnHosted ===
        false &&
      commonCredentialIsolationRules.databasePasswordChildVariable ===
        'PGPASSWORD' &&
      commonCredentialIsolationRules.databasePasswordMayAppearInUrlOrArgv ===
        false &&
      commonCredentialIsolationRules.passwordFreeDirectDatabaseUrlMayAppearInArgv ===
        true &&
      commonCredentialIsolationRules.databasePasswordAndManagementTokenChildProcessesMustBeDistinct ===
        true &&
      stageRuntimeChannels.authority === 'PR12_STAGE_COMMAND_RUNTIME_ONLY' &&
      stageRuntimeChannels.implementationStatus ===
        'IMPLEMENTED_OFFLINE_VERIFIED' &&
      stageRuntimeChannels.executionStatus === 'NOT_RUN' &&
      stageRuntimeChannels.executionAuthorized === false &&
      stageRuntimeChannels.inheritParentEnvironment === false &&
      stageRuntimeChannels.dotenvAllowed === false &&
      stageRuntimeChannels.ambientCredentialFallbackAllowed === false &&
      JSON.stringify(stageDatabaseChild.commandIds) ===
        JSON.stringify([
          'PR12-CMD-004A',
          'PR12-CMD-004',
          'PR12-CMD-005',
          'PR12-CMD-006',
          'PR12-CMD-007',
          'PR12-CMD-007A',
          'PR12-CMD-008A',
          'PR12-CMD-008',
          'PR12-CMD-009',
          'PR12-CMD-016',
        ]) &&
      JSON.stringify(stageDatabaseChild.exactSecretChildEnvironmentNames) ===
        JSON.stringify(['PGPASSWORD']) &&
      stageDatabaseChild.parentCredentialName === 'PR12_SOURCE_DB_PASSWORD' &&
      stageDatabaseChild.managementTokenPresent === false &&
      stageDatabaseChild.passwordFreeDirectDatabaseUrlInArguments === true &&
      stageDatabaseChild.passwordInUrlOrArgumentsAllowed === false &&
      stageDatabaseChild.tlsMode === 'verify-full' &&
      stageDatabaseChild.approvedCaBundlePathAndSha256Required === true &&
      stageDatabaseChild.poolerOrFallbackAllowed === false &&
      JSON.stringify(stageHostedTypesChild.commandIds) ===
        JSON.stringify(['PR12-CMD-010']) &&
      stageHostedTypesChild.parentCredentialName ===
        'PR12_SUPABASE_ACCESS_TOKEN' &&
      JSON.stringify(stageHostedTypesChild.exactSecretChildEnvironmentNames) ===
        JSON.stringify(['SUPABASE_ACCESS_TOKEN']) &&
      stageHostedTypesChild.databasePasswordPresent === false &&
      stageHostedTypesChild.committedTypesFileWriteAllowed === false &&
      stageChildProcess.shell === false &&
      stageChildProcess.stdin === 'CLOSED' &&
      stageChildProcess.wrapperRetryCount === 0 &&
      stageChildProcess.maximumDispatchCountPerCommand === 1 &&
      stageChildProcess.timeoutOrAmbiguousOutcome ===
        'UNKNOWN_REMOTE_OUTCOME' &&
      targetModes.source === 'SANDBOXED' &&
      targetModes.restore === 'DISABLED' &&
      sourceStripe.mode === 'TEST_MODE_SANDBOX_ONLY' &&
      sourceStripe.liveKeyAllowed === false &&
      sourceStripe.liveChargeAllowed === false &&
      restoreStripe.mode === 'DISABLED' &&
      restoreStripe.liveKeyAllowed === false &&
      restoreStripe.liveChargeAllowed === false &&
      sideEffectCollector.collectorId === 'PR12-SIDE-EFFECT-COLLECTOR-V2' &&
      sideEffectCollector.descriptorPath ===
        'docs/stabilization/evidence/commercial-hardening/pr12/external-side-effect-collector-descriptors-v2.json' &&
      sideEffectCollector.descriptorArtifactSha256 ===
        sha256File(sideEffectCollector.descriptorPath) &&
      sideEffectCollector.implementationStatus === 'NOT_IMPLEMENTED' &&
      targetBindingRules.keyPresenceCollectorId ===
        'PR12-TARGET-CREDENTIAL-PRESENCE-V1' &&
      targetBindingRules.targetSpecificKeyPresenceMustBeCollectorDerived ===
        true &&
      targetBindingRules.fingerprintsMustBeComputedFromTheSameRuntimeValues ===
        true &&
      targetBindingRules.emptyCredentialFingerprintAllowed === false,
    'integration/credential proposal boundary drift'
  );
  const sourceOptionalEnvironmentNames = [
    'PR12_SOURCE_STRIPE_TEST_SECRET_KEY',
    'PR12_SOURCE_STRIPE_TEST_WEBHOOK_SECRET',
  ];
  const expectedSharedMappings = {
    SUPABASE_ACCESS_TOKEN: 'PR12_SUPABASE_ACCESS_TOKEN',
  };
  const expectedSourceMappings = {
    SUPABASE_DB_PASSWORD: 'PR12_SOURCE_DB_PASSWORD',
    NEXT_PUBLIC_SUPABASE_URL: 'PR12_SOURCE_SUPABASE_URL',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'PR12_SOURCE_ANON_KEY',
    SUPABASE_SERVICE_ROLE_KEY: 'PR12_SOURCE_SERVICE_ROLE_KEY',
    PGHOST: 'PR12_SOURCE_PGHOST',
    PGPORT: 'PR12_SOURCE_PGPORT',
    PGDATABASE: 'PR12_SOURCE_PGDATABASE',
    PGUSER: 'PR12_SOURCE_PGUSER',
    PGPASSWORD: 'PR12_SOURCE_PGPASSWORD',
    PR12_HOSTED_ACTOR_PASSWORD_MAP_JSON:
      'PR12_SOURCE_HOSTED_ACTOR_PASSWORD_MAP_JSON',
    STRIPE_SECRET_KEY: 'PR12_SOURCE_STRIPE_TEST_SECRET_KEY',
    STRIPE_WEBHOOK_SECRET: 'PR12_SOURCE_STRIPE_TEST_WEBHOOK_SECRET',
  };
  const expectedRestoreMappings = {
    SUPABASE_DB_PASSWORD: 'PR12_RESTORE_DB_PASSWORD',
    NEXT_PUBLIC_SUPABASE_URL: 'PR12_RESTORE_SUPABASE_URL',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'PR12_RESTORE_ANON_KEY',
    SUPABASE_SERVICE_ROLE_KEY: 'PR12_RESTORE_SERVICE_ROLE_KEY',
    PGHOST: 'PR12_RESTORE_PGHOST',
    PGPORT: 'PR12_RESTORE_PGPORT',
    PGDATABASE: 'PR12_RESTORE_PGDATABASE',
    PGUSER: 'PR12_RESTORE_PGUSER',
    PGPASSWORD: 'PR12_RESTORE_PGPASSWORD',
    PR12_HOSTED_ACTOR_PASSWORD_MAP_JSON:
      'PR12_RESTORE_HOSTED_ACTOR_PASSWORD_MAP_JSON',
  };
  assert(
    JSON.stringify(sharedCredentialChannel.requiredParentEnvironmentNames) ===
      JSON.stringify(SHARED_PARENT_ENVIRONMENT_NAMES) &&
      JSON.stringify(sharedCredentialChannel.childProcessMappings) ===
        JSON.stringify(expectedSharedMappings) &&
      JSON.stringify(sourceCredentialChannel.requiredParentEnvironmentNames) ===
        JSON.stringify(SOURCE_PARENT_ENVIRONMENT_NAMES) &&
      JSON.stringify(
        sourceCredentialChannel.optionalSandboxParentEnvironmentNames
      ) === JSON.stringify(sourceOptionalEnvironmentNames) &&
      JSON.stringify(sourceCredentialChannel.childProcessMappings) ===
        JSON.stringify(expectedSourceMappings) &&
      JSON.stringify(
        restoreCredentialChannel.requiredParentEnvironmentNames
      ) === JSON.stringify(RESTORE_PARENT_ENVIRONMENT_NAMES) &&
      JSON.stringify(
        restoreCredentialChannel.optionalSandboxParentEnvironmentNames
      ) === JSON.stringify([]) &&
      JSON.stringify(restoreCredentialChannel.childProcessMappings) ===
        JSON.stringify(expectedRestoreMappings),
    'credential channel exact parent names or child mappings drift'
  );
  const sourceParents = new Set([
    ...SOURCE_PARENT_ENVIRONMENT_NAMES,
    ...sourceOptionalEnvironmentNames,
  ]);
  assert(
    RESTORE_PARENT_ENVIRONMENT_NAMES.every(name => !sourceParents.has(name)),
    'source and restore credential parent sets must be disjoint'
  );
  const staleParentEnvironmentNames = [
    'PR12_SUPABASE_DB_PASSWORD',
    'PR12_STAGING_PROJECT_REF',
    'PR12_STAGING_SUPABASE_URL',
    'PR12_STAGING_ANON_KEY',
    'PR12_STAGING_SERVICE_ROLE_KEY',
    'PR12_PGHOST',
    'PR12_PGPORT',
    'PR12_PGDATABASE',
    'PR12_PGUSER',
    'PR12_PGPASSWORD',
    'PR12_STRIPE_TEST_SECRET_KEY',
    'PR12_STRIPE_TEST_WEBHOOK_SECRET',
  ];
  assert(
    staleParentEnvironmentNames.every(
      name => !normalizedApproval.includes(name)
    ),
    'machine approval packet retains a stale generic or staging credential parent'
  );
  for (const name of [
    ...SHARED_PARENT_ENVIRONMENT_NAMES,
    ...SOURCE_PARENT_ENVIRONMENT_NAMES,
    ...sourceOptionalEnvironmentNames,
    ...RESTORE_PARENT_ENVIRONMENT_NAMES,
  ]) {
    assert(
      normalizedApproval.includes(name),
      `machine approval packet omits credential parent: ${name}`
    );
  }

  const ledger = readJson(`${prefix}staging-command-ledger.proposed.json`);
  const targetGuard = requireRecord(ledger.targetGuard, 'ledger.targetGuard');
  const ledgerProvisioningActions = requireRecord(
    ledger.provisioningActions,
    'ledger.provisioningActions'
  );
  const ledgerSourceProjectAction = requireRecord(
    ledgerProvisioningActions.sourceProject,
    'ledger.provisioningActions.sourceProject'
  );
  const ledgerOrganizationIdentityAction = requireRecord(
    ledgerProvisioningActions.organizationIdentityCapture,
    'ledger.provisioningActions.organizationIdentityCapture'
  );
  const ledgerSupabaseCli = requireRecord(
    ledger.supabaseCli,
    'ledger.supabaseCli'
  );
  const ledgerSupabaseGo = requireRecord(
    ledgerSupabaseCli.adjacentGoExecutable,
    'ledger.supabaseCli.adjacentGoExecutable'
  );
  const ledgerPsql = requireRecord(ledger.psql, 'ledger.psql');
  const ledgerCaBundle = requireRecord(ledger.caBundle, 'ledger.caBundle');
  const ledgerExternalWorkdir = requireRecord(
    ledger.externalRuntimeWorkdir,
    'ledger.externalRuntimeWorkdir'
  );
  const ledgerChildProcess = requireRecord(
    ledger.childProcessContract,
    'ledger.childProcessContract'
  );
  const ledgerSupabaseHome = requireRecord(
    ledger.supabaseHome,
    'ledger.supabaseHome'
  );
  const ledgerDockerConfig = requireRecord(
    ledger.dockerConfig,
    'ledger.dockerConfig'
  );
  const commands = Array.isArray(ledger.commands) ? ledger.commands : [];
  assert(
    ledger.status === 'PROPOSED_NOT_EXECUTABLE' &&
      ledger.executionAuthorized === false &&
      targetGuard.status ===
        'PHASE1_ACTION_003_AND_SELECTED_READINESS_IMPLEMENTED_REMAINDER_NOT_IMPLEMENTED' &&
      targetGuard.phase1ImplementationPath ===
        'scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs' &&
      targetGuard.organizationIdentityCaptureImplementationPath ===
        'scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs' &&
      targetGuard.organizationIdentityCaptureRequiredBeforeSourceProvisioning ===
        true &&
      targetGuard.organizationIdentityCaptureEvidenceLinkageStatus ===
        'IMPLEMENTED_ACTION_003_V6_REQUIRED' &&
      targetGuard.stageCommandRuntimeImplementationPath ===
        'scripts/commercial-hardening/pr12-stage-command-runtime.mjs' &&
      targetGuard.repositoryLinkMetadataAllowed === false &&
      targetGuard.externalRuntimeMetadataRequired === true &&
      targetGuard.databaseConnectionMode === 'DIRECT' &&
      targetGuard.databasePortMustEqual === 5432 &&
      targetGuard.databaseNameMustEqual === 'postgres' &&
      targetGuard.databasePasswordInUrlOrArgumentsAllowed === false &&
      targetGuard.databaseUrlFragmentAllowed === false &&
      JSON.stringify(targetGuard.databaseUrlExactQueryKeys) ===
        JSON.stringify(['sslmode', 'sslrootcert']) &&
      targetGuard.databaseUrlExtraQueryParametersAllowed === false &&
      targetGuard.databasePasswordChildEnvironmentName === 'PGPASSWORD' &&
      targetGuard.tlsMode === 'verify-full' &&
      targetGuard.sslrootcertMustEqualApprovedCaBundlePath === true &&
      targetGuard.approvedCaBundlePathAndSha256Required === true &&
      targetGuard.poolerIpv4AddonOrTlsFallbackAllowed === false &&
      targetGuard.dotenvLoadingAllowed === false &&
      targetGuard.inheritParentEnvironmentAllowed === false &&
      targetGuard.requiredForEveryRemoteCommand === true &&
      JSON.stringify(targetGuard.prohibitedProjectRefs) ===
        JSON.stringify(['qnanuoqveidwvacvbhqp']) &&
      JSON.stringify(targetGuard.prohibitedHosts) ===
        JSON.stringify(['db.qnanuoqveidwvacvbhqp.supabase.co']) &&
      JSON.stringify(targetGuard.prohibitedDatabaseSystemIdentifiers) ===
        JSON.stringify([]) &&
      targetGuard.prohibitedDatabaseSystemIdentifiersStatus ===
        'NOT_CAPTURED_BLOCKING' &&
      targetGuard.allThreeProductionDenylistDimensionsRequiredBeforeRemoteContact ===
        true,
    'command ledger fail-closed proposal drift'
  );
  assert(
    ledgerSupabaseCli.path === 'NOT_CAPTURED' &&
      ledgerSupabaseCli.pathSha256 === 'NOT_CAPTURED' &&
      ledgerSupabaseCli.resolvedPathSha256 === 'NOT_CAPTURED' &&
      ledgerSupabaseCli.version === '2.109.0' &&
      ledgerSupabaseCli.executableSha256 ===
        '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118' &&
      ledgerSupabaseGo.path === 'NOT_CAPTURED' &&
      ledgerSupabaseGo.pathSha256 === 'NOT_CAPTURED' &&
      ledgerSupabaseGo.resolvedPathSha256 === 'NOT_CAPTURED' &&
      ledgerSupabaseGo.version === '2.109.0' &&
      ledgerSupabaseGo.executableSha256 ===
        '59cd06ac674fdf5d6add75206408ada0a24b1dcb796d099c13b1f2aaf3f463f0' &&
      ledgerSupabaseCli.officialArchivePath === 'NOT_CAPTURED' &&
      ledgerSupabaseCli.officialArchivePathSha256 === 'NOT_CAPTURED' &&
      ledgerSupabaseCli.officialArchiveResolvedPathSha256 === 'NOT_CAPTURED' &&
      ledgerSupabaseCli.officialArchiveSha256 ===
        'd2b687ec3427fe7847cf7a8f603413fa8d4331f6fdbbc825eea6aa34a64d686b' &&
      ledgerPsql.path === 'NOT_CAPTURED' &&
      ledgerPsql.pathSha256 === 'NOT_CAPTURED' &&
      ledgerPsql.resolvedPathSha256 === 'NOT_CAPTURED' &&
      ledgerPsql.version === '17.9' &&
      ledgerPsql.executableSha256 ===
        '6a4b5cd854ee1c0e50646e7612a9e769c9ae86aa97bf94c50342dad058c2b531' &&
      ledgerCaBundle.path === 'NOT_CAPTURED' &&
      ledgerCaBundle.pathSha256 === 'NOT_CAPTURED' &&
      ledgerCaBundle.resolvedPathSha256 === 'NOT_CAPTURED' &&
      ledgerCaBundle.contentSha256 === 'NOT_CAPTURED' &&
      ledgerSupabaseHome.path === 'NOT_CAPTURED' &&
      ledgerSupabaseHome.pathSha256 === 'NOT_CAPTURED' &&
      ledgerSupabaseHome.resolvedPathSha256 === 'NOT_CAPTURED' &&
      ledgerDockerConfig.path === 'NOT_CAPTURED' &&
      ledgerDockerConfig.pathSha256 === 'NOT_CAPTURED' &&
      ledgerDockerConfig.resolvedPathSha256 === 'NOT_CAPTURED' &&
      ledger.supabaseNoKeyringChildEnvironmentValue === '1' &&
      ledger.supabaseHomeAndDockerConfigMustDiffer === true &&
      ledgerExternalWorkdir.path === 'NOT_CAPTURED' &&
      ledgerExternalWorkdir.pathSha256 === 'NOT_CAPTURED' &&
      ledgerExternalWorkdir.resolvedPathSha256 === 'NOT_CAPTURED' &&
      ledgerExternalWorkdir.copiedFileCount === 65 &&
      ledgerExternalWorkdir.migrationCount === 61,
    'command ledger pinned toolchain or external path identity drift'
  );
  assert(
    JSON.stringify(commands.map(command => command.id)) ===
      JSON.stringify(CANONICAL_LEDGER_COMMAND_IDS),
    'command ledger exact canonical order drift'
  );
  assert(
    ledger.operatorShell === 'PowerShell_7' &&
      ledgerChildProcess.shell === false &&
      ledgerChildProcess.stdin === 'ignore' &&
      JSON.stringify(ledgerChildProcess.stdio) ===
        JSON.stringify(['ignore', 'pipe', 'pipe']) &&
      ledgerChildProcess.environmentBuiltFromZero === true &&
      ledgerChildProcess.wrapperRetryCount === 0 &&
      ledgerChildProcess.maximumDispatchCountPerCommand === 1 &&
      ledgerChildProcess.automaticRetryAllowed === false &&
      ledgerChildProcess.timeoutOrThrownErrorOutcome ===
        'UNKNOWN_REMOTE_OUTCOME' &&
      commands.every(
        command =>
          typeof command.implementationStatus === 'string' &&
          typeof command.executionStatus === 'string' &&
          typeof command.authorizedNow === 'boolean'
      ),
    'command ledger child-process or explicit command-state contract drift'
  );
  const remoteCommands = commands.filter(command => command.remoteContact);
  assert(remoteCommands.length > 0, 'command ledger has no remote phases');
  const allowedMutationScopes = new Set([
    'CANONICAL_PROBE_TRANSACTION_ONLY',
    'ISOLATED_SCHEMA_REPLAY_ONLY',
    'NONE',
    'RESTORE_PROJECT_CREATION',
    'SANDBOX_BILLING_ONLY',
    'SYNTHETIC_API_MATRIX_ONLY',
    'SYNTHETIC_BACKUP_WATERMARK_ONLY',
    'SYNTHETIC_HOSTED_WORKLOAD_ONLY',
    'SYNTHETIC_QUALIFICATION_ONLY',
    'SYNTHETIC_REPRESENTATIVE_DATA_ONLY',
    'SYNTHETIC_SECURITY_MATRIX_ONLY',
  ]);
  assert(
    commands.every(
      command =>
        typeof command.remoteContact === 'boolean' &&
        typeof command.mutating === 'boolean' &&
        typeof command.mutationScope === 'string' &&
        allowedMutationScopes.has(command.mutationScope) &&
        (command.mutating
          ? command.mutationScope !== 'NONE'
          : command.mutationScope === 'NONE')
    ),
    'command ledger boolean or mutation-scope proposal drift'
  );
  const offlineImplementedRemoteCommandIds = new Set([
    'PR12-CMD-004A',
    'PR12-CMD-004',
    'PR12-CMD-005',
    'PR12-CMD-006',
    'PR12-CMD-007',
    'PR12-CMD-007A',
    'PR12-CMD-008A',
    'PR12-CMD-008',
    'PR12-CMD-009',
    'PR12-CMD-010',
    'PR12-CMD-016',
  ]);
  assert(
    remoteCommands.every(command => {
      if (command.authorizedNow !== false) return false;
      if (offlineImplementedRemoteCommandIds.has(command.id)) {
        return (
          command.implementationStatus === 'IMPLEMENTED_OFFLINE_VERIFIED' &&
          command.executionStatus === 'NOT_RUN' &&
          command.redactedCommand !== 'NOT_IMPLEMENTED'
        );
      }
      return command.redactedCommand === 'NOT_IMPLEMENTED';
    }),
    'remote commands must stay either offline-only NOT_RUN or unimplemented, and all unauthorized'
  );
  const cmd003 = commands.find(command => command.id === 'PR12-CMD-003');
  const cmd013 = commands.find(command => command.id === 'PR12-CMD-013');
  const cmd016 = commands.find(command => command.id === 'PR12-CMD-016');
  const cmd013Components = requireRecord(
    cmd013?.components,
    'PR12-CMD-013.components'
  );
  const allRoleSmoke = requireRecord(
    cmd013Components.allRoleSmoke,
    'PR12-CMD-013.components.allRoleSmoke'
  );
  const cmd016Components = requireRecord(
    cmd016?.components,
    'PR12-CMD-016.components'
  );
  const advisorNormalizerAndDiff = requireRecord(
    cmd016Components.snapshotNormalizerAndDiff,
    'PR12-CMD-016.components.snapshotNormalizerAndDiff'
  );
  assert(
    cmd003?.remoteContact === false &&
      cmd003?.mutating === false &&
      cmd003?.mutationScope === 'NONE' &&
      cmd003?.redactedCommand ===
        'LOCAL_IN_PROCESS:buildExternalReplayInputManifest+materializeExternalReplayInputs' &&
      cmd003?.implementationStatus === 'IMPLEMENTED_OFFLINE_VERIFIED' &&
      cmd003?.executionStatus === 'NOT_RUN' &&
      cmd003?.authorizedNow === false &&
      cmd013?.implementationStatus === 'NOT_IMPLEMENTED' &&
      cmd013?.executionStatus === 'NOT_RUN' &&
      allRoleSmoke.implementationStatus === 'IMPLEMENTED_OFFLINE_VERIFIED' &&
      allRoleSmoke.executionStatus === 'NOT_RUN' &&
      allRoleSmoke.commGateStatus === 'NOT_RUN' &&
      allRoleSmoke.remoteContactPerformed === false &&
      cmd016?.implementationStatus === 'IMPLEMENTED_OFFLINE_VERIFIED' &&
      cmd016?.executionStatus === 'NOT_RUN' &&
      cmd016?.authorizedNow === false &&
      advisorNormalizerAndDiff.implementationStatus ===
        'IMPLEMENTED_OFFLINE_VERIFIED' &&
      advisorNormalizerAndDiff.executionStatus === 'NOT_RUN' &&
      advisorNormalizerAndDiff.remoteContactPerformed === false &&
      cmd016?.redactedCommand.endsWith('--output-format json'),
    'local runtime materialization, all-role component, or Advisor readiness drift'
  );
  assert(
    remoteCommands[0]?.id === 'PR12-CMD-004A' &&
      JSON.stringify(commands.slice(5, 12).map(command => command.id)) ===
        JSON.stringify(STAGE_3_COMMAND_IDS) &&
      JSON.stringify(commands.slice(12, 25).map(command => command.id)) ===
        JSON.stringify(STAGE_4_COMMAND_IDS) &&
      commands[25]?.id === 'PR12-CMD-017B',
    'six-stage bootstrap, Stage 3/4, or restore-creation stop order drift'
  );
  for (const purpose of [
    'fixture contract',
    'canonical PR11',
    'Data API and GraphQL',
    'COMM-BILL',
    'backup ID',
    'post-restore',
  ]) {
    assert(
      JSON.stringify(ledger).includes(purpose),
      `command ledger does not surface blocker family: ${purpose}`
    );
  }

  const provisioning = readJson(
    `${prefix}source-project-provisioning-binding-v6.template.json`
  );
  const provisioningCredential = readJson(
    `${prefix}source-project-provisioning-credential-configuration-v2.template.json`
  );
  const provisioningAuthorizationProjection = readJson(
    `${prefix}source-project-provisioning-authorization-projection-v1.template.json`
  );
  const provisioningSingleActionApprovalReceipt = readJson(
    `${prefix}source-project-provisioning-single-action-approval-receipt-v2.template.json`
  );
  const provisioningDerivedExecutionBinding = readJson(
    `${prefix}source-project-provisioning-derived-execution-binding-v1.template.json`
  );
  const provisioningPricing = readJson(
    `${prefix}source-project-official-pricing-evidence-v3.template.json`
  );
  const provisioningBootstrapApproval = readJson(
    `${prefix}source-project-dpapi-bootstrap-approval-v1.template.json`
  );
  const provisioningJournal = readJson(
    `${prefix}source-project-provisioning-action-journal.template.json`
  );
  const provisioningResult = readJson(
    `${prefix}source-project-provisioning-result-v6.template.json`
  );
  const provisioningProviderExport = readJson(
    `${prefix}source-project-provider-safe-projection-v4.template.json`
  );
  const provisioningEvidenceManifest = readJson(
    `${prefix}source-project-provisioning-evidence-manifest.template.json`
  );
  const provisioningPrivacyScan = readJson(
    `${prefix}source-project-provisioning-privacy-scan.template.json`
  );
  const organizationIdentityBinding = readJson(
    `${prefix}source-organization-identity-capture-binding-v1.template.json`
  );
  const organizationIdentityOwnerApproval = readJson(
    `${prefix}source-organization-identity-capture-owner-approval-v1.template.json`
  );
  const organizationIdentityJournal = readJson(
    `${prefix}source-organization-identity-capture-action-journal.template.json`
  );
  const organizationIdentityResult = readJson(
    `${prefix}source-organization-identity-capture-result-v1.template.json`
  );
  const organizationIdentityProvider = readJson(
    `${prefix}source-organization-identity-provider-safe-projection-v1.template.json`
  );
  const organizationIdentityManifest = readJson(
    `${prefix}source-organization-identity-capture-evidence-manifest-v1.template.json`
  );
  const organizationIdentityPrivacy = readJson(
    `${prefix}source-organization-identity-capture-privacy-scan-v1.template.json`
  );
  const sourceReplay = readJson(
    `${prefix}source-replay-catalog-capture-binding.template.json`
  );
  const sourceBootstrap = readJson(
    `${prefix}source-identity-bootstrap-binding.template.json`
  );
  const sourceBootstrapResult = readJson(
    `${prefix}source-identity-bootstrap-result.template.json`
  );
  const sourceReplayResult = readJson(
    `${prefix}source-replay-catalog-capture-result.template.json`
  );
  const restoreSupplement = readJson(
    `${prefix}restore-execution-supplemental-binding.template.json`
  );
  const restoreCreation = readJson(
    `${prefix}restore-project-creation-binding.template.json`
  );
  const governanceDigest = sha256File(
    `${prefix}staging-execution-approval-packet.yaml`
  );
  for (const [context, governanceProposal] of [
    ['source execution', binding.governanceProposal],
    ['source identity bootstrap', sourceBootstrap.governanceProposal],
    ['source replay/catalog capture', sourceReplay.governanceProposal],
  ]) {
    assert(
      governanceProposal.path === 'staging-execution-approval-packet.yaml' &&
        governanceProposal.sha256 === governanceDigest,
      `${context} governance proposal hash drift`
    );
  }
  assert(
    provisioning.governanceProposal.path ===
      'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml' &&
      provisioning.governanceProposal.sha256 === 'NOT_CAPTURED',
    'source provisioning final governance hash must remain an approval blocker'
  );
  assert(
    organizationIdentityBinding.status === 'NOT_RUN' &&
      organizationIdentityBinding.phase ===
        'SOURCE_ORGANIZATION_IDENTITY_CAPTURE' &&
      organizationIdentityBinding.action.actionId === 'PR12-ACTION-002' &&
      organizationIdentityBinding.action.httpMethod === 'GET' &&
      organizationIdentityBinding.action.endpoint ===
        'https://api.supabase.com/v1/organizations/kbnsntifrawhimhfjrug' &&
      organizationIdentityBinding.action.maximumRemoteContactCount === 1 &&
      organizationIdentityBinding.action.maximumRequestAttempts === 1 &&
      organizationIdentityBinding.action.automaticRetryAllowed === false &&
      organizationIdentityBinding.action.redirectAllowed === false &&
      organizationIdentityBinding.action.requestBodyAllowed === false &&
      organizationIdentityBinding.authorization
        .organizationIdentityCaptureAuthorized === false &&
      Object.values(organizationIdentityBinding.authorization).every(
        value => value === false
      ) &&
      organizationIdentityBinding.credentialControls
        .managementAccessTokenRetrievalAllowed === true &&
      organizationIdentityBinding.credentialControls
        .databasePasswordRetrievalAllowed === false &&
      organizationIdentityBinding.productionBoundary.productionProjectRef ===
        'qnanuoqveidwvacvbhqp' &&
      organizationIdentityBinding.productionBoundary
        .productionProjectSpecificManagementApiContactAuthorized === false &&
      organizationIdentityBinding.evidenceContract
        .rawProviderBodiesPersisted === false &&
      organizationIdentityBinding.evidenceContract.rawHttpHeadersPersisted ===
        false,
    'Organization identity capture binding template drift'
  );
  assert(
    organizationIdentityOwnerApproval.decision === 'NOT_CAPTURED' &&
      organizationIdentityOwnerApproval.actionId === 'PR12-ACTION-002' &&
      organizationIdentityOwnerApproval.tokenOnlyCredentialRetrievalAuthorized ===
        false &&
      organizationIdentityOwnerApproval.databasePasswordRetrievalAuthorized ===
        false &&
      organizationIdentityOwnerApproval.sourceProjectProvisioningAuthorized ===
        false &&
      organizationIdentityOwnerApproval.soleOperatorSelfApprovalRiskAccepted ===
        false &&
      organizationIdentityOwnerApproval.sameUserDpapiCredentialExposureRiskAccepted ===
        false &&
      organizationIdentityOwnerApproval.productionContactProhibitionAcknowledged ===
        false &&
      organizationIdentityJournal.state === 'NOT_RUN' &&
      organizationIdentityJournal.automaticRetryCount === 0 &&
      organizationIdentityResult.status === 'NOT_RUN' &&
      organizationIdentityResult.contact.remoteContactCount === 0 &&
      organizationIdentityResult.contact.automaticRetryCount === 0 &&
      organizationIdentityResult.credential.databasePasswordRetrieved ===
        false &&
      organizationIdentityResult.ownerControl
        .soleOperatorSelfApprovalRiskAccepted === false &&
      organizationIdentityResult.ownerControl
        .sameUserDpapiCredentialExposureRiskAccepted === false &&
      organizationIdentityProvider.status === 'NOT_RUN' &&
      organizationIdentityProvider.rawProviderBodiesPersisted === false &&
      organizationIdentityManifest.status === 'NOT_RUN' &&
      organizationIdentityManifest.artifactCount === 0 &&
      organizationIdentityPrivacy.status === 'NOT_RUN' &&
      organizationIdentityPrivacy.runtimeSecretValueCount === 0,
    'Organization identity capture approval, journal, or evidence template drift'
  );
  assert(
    ledgerOrganizationIdentityAction.actionId === 'PR12-ACTION-002' &&
      ledgerOrganizationIdentityAction.httpMethod === 'GET' &&
      ledgerOrganizationIdentityAction.endpoint ===
        'https://api.supabase.com/v1/organizations/kbnsntifrawhimhfjrug' &&
      ledgerOrganizationIdentityAction.maximumRemoteContactCount === 1 &&
      ledgerOrganizationIdentityAction.maximumRequestAttempts === 1 &&
      ledgerOrganizationIdentityAction.automaticRetryAllowed === false &&
      ledgerOrganizationIdentityAction.redirectAllowed === false &&
      ledgerOrganizationIdentityAction.queryAllowed === false &&
      ledgerOrganizationIdentityAction.requestBodyAllowed === false &&
      ledgerOrganizationIdentityAction.projectEnumerationAllowed === false &&
      ledgerOrganizationIdentityAction.productionProjectSpecificPathAllowed ===
        false &&
      ledgerOrganizationIdentityAction.databasePasswordRetrievalAllowed ===
        false &&
      ledgerOrganizationIdentityAction.tokenOnlyDpapiRetrievalRequired ===
        true &&
      ledgerOrganizationIdentityAction.wrapperImplemented === true &&
      ledgerOrganizationIdentityAction.wrapperExecuted === true &&
      ledgerOrganizationIdentityAction.executionStatus === 'PASS' &&
      ledgerOrganizationIdentityAction.executionOutcome === 'PASS' &&
      ledgerOrganizationIdentityAction.authorizedNow === false &&
      ledgerOrganizationIdentityAction.organizationId ===
        'kbnsntifrawhimhfjrug' &&
      ledgerOrganizationIdentityAction.secretFreeRequestProjectionSha256 ===
        '95149b0f64407700298cbe842cbd15780300e9e357dc492f5d4d56e490490a8e' &&
      ledgerOrganizationIdentityAction.bindingMaterialSha256 ===
        '56b07d3eb802d546df25be3b487e32b9c30f0aa7ac1f896bba483cb5e207eb3c' &&
      ledgerOrganizationIdentityAction.manifestSha256 ===
        '66db9ed2b7fdb7573b76e79273c71d95551cdb7385e0ca8ee21724c56399f582' &&
      ledgerOrganizationIdentityAction.terminalSha256 ===
        '3fec7d3156c52e862602e9adb115e460c6959caeba38d5a1b290abe41513782e' &&
      ledgerOrganizationIdentityAction.terminalState === 'TERMINAL_PASS' &&
      ledgerOrganizationIdentityAction.remoteContactCount === 1 &&
      ledgerOrganizationIdentityAction.requestAttemptCount === 1 &&
      ledgerOrganizationIdentityAction.automaticRetryCount === 0 &&
      ledgerOrganizationIdentityAction.action003IdentityEvidenceLinkageStatus ===
        'IMPLEMENTED_ACTION_003_V6_REQUIRED' &&
      ledgerOrganizationIdentityAction.terminalJournalToManifestVerifierStatus ===
        'IMPLEMENTED_FAIL_CLOSED' &&
      normalizedApproval.includes('  source_organization_identity_capture:') &&
      normalizedApproval.includes('    action_id: PR12-ACTION-002') &&
      normalizedApproval.includes(
        '    endpoint: https://api.supabase.com/v1/organizations/kbnsntifrawhimhfjrug'
      ) &&
      normalizedApproval.includes('    automatic_retry_allowed: false') &&
      normalizedApproval.includes('    redirect_allowed: false') &&
      normalizedApproval.includes('    query_allowed: false') &&
      normalizedApproval.includes(
        '    database_password_retrieval_allowed: false'
      ) &&
      normalizedApproval.includes(
        '    action_003_identity_evidence_linkage_status: IMPLEMENTED_ACTION_003_V6_REQUIRED'
      ) &&
      normalizedApproval.includes('    wrapper_executed: true') &&
      normalizedApproval.includes('    execution_status: PASS') &&
      normalizedApproval.includes(
        '    manifest_sha256: 66db9ed2b7fdb7573b76e79273c71d95551cdb7385e0ca8ee21724c56399f582'
      ),
    'Organization identity capture action is not cross-bound across packet, ledger, and template'
  );
  const requiredOwnerFields = [
    'commercialReleaseOwner',
    'supabasePlatformOwner',
    'databaseMigrationOperator',
    'disasterRecoveryOperator',
    'securityTenantReviewer',
    'clinicalDataPrivacyReviewer',
    'billingMessagingSandboxOwner',
    'siteReliabilityOwner',
    'incidentCommander',
    'cleanupOwner',
    'evidenceCustodian',
  ];
  for (const [context, owners] of [
    ['source identity bootstrap', sourceBootstrap.owners],
    ['source replay/catalog capture', sourceReplay.owners],
    ['source execution', binding.owners],
    ['restore creation', restoreCreation.owners],
    ['restore supplemental', restoreSupplement.owners],
  ]) {
    assert(
      JSON.stringify(
        Object.keys(requireRecord(owners, `${context}.owners`))
      ) === JSON.stringify(requiredOwnerFields),
      `${context} owner inventory drift`
    );
  }
  assert(
    JSON.stringify(Object.keys(provisioning.owners).sort()) ===
      JSON.stringify([...requiredOwnerFields, 'provisioningOperator'].sort()),
    'source provisioning phase-local owner inventory drift'
  );
  const sourceAuthorization = requireRecord(
    provisioning.authorization,
    'provisioning.authorization'
  );
  const provisionEnvironment = requireRecord(
    provisioning.environmentProposal,
    'provisioning.environmentProposal'
  );
  const initialPlatformPosture = requireRecord(
    provisioning.initialPlatformPosture,
    'provisioning.initialPlatformPosture'
  );
  const provisioningAction = requireRecord(
    provisioning.provisioningAction,
    'provisioning.provisioningAction'
  );
  const provisioningImplementationContracts = requireRecord(
    provisioning.implementationContracts,
    'provisioning.implementationContracts'
  );
  const organizationIdentityEvidence = requireRecord(
    provisioning.organizationIdentityEvidence,
    'provisioning.organizationIdentityEvidence'
  );
  const organizationIdentityEvidenceOrganization = requireRecord(
    organizationIdentityEvidence.organization,
    'provisioning.organizationIdentityEvidence.organization'
  );
  assert(
    ledgerSourceProjectAction.actionId === provisioningAction.actionId &&
      ledgerSourceProjectAction.method === provisioningAction.method &&
      ledgerSourceProjectAction.httpMethod === provisioningAction.httpMethod &&
      ledgerSourceProjectAction.endpoint === provisioningAction.endpoint &&
      ledgerSourceProjectAction.name === provisionEnvironment.projectName &&
      ledgerSourceProjectAction.organizationName === "IFs1991's Org" &&
      ledgerSourceProjectAction.organizationSlug === 'kbnsntifrawhimhfjrug' &&
      ledgerSourceProjectAction.sameOrganizationException.mode ===
        'PHASE1_SAME_ORGANIZATION_PRODUCTION_PROJECT_DENY_EXCEPTION_V1' &&
      ledgerSourceProjectAction.sameOrganizationException
        .productionProjectRef === 'qnanuoqveidwvacvbhqp' &&
      ledgerSourceProjectAction.sameOrganizationException
        .productionProjectSpecificManagementApiContactAuthorized === false &&
      ledgerSourceProjectAction.existingOrganizationPlanRequired === 'PRO' &&
      ledgerSourceProjectAction.organizationPlanChangeIncluded === false &&
      ledgerSourceProjectAction.organizationId === 'kbnsntifrawhimhfjrug' &&
      !ledgerSourceProjectAction.readOnlySupportingRequests.includes(
        'GET /v1/organizations/kbnsntifrawhimhfjrug'
      ) &&
      ledgerSourceProjectAction.organizationIdentityDuplicateGetStatus ===
        'REMOVED_ACTION_002_EVIDENCE_IS_SOLE_SOURCE' &&
      ledgerSourceProjectAction.regionSelection.code ===
        provisionEnvironment.region &&
      ledgerSourceProjectAction.desiredInstanceSize === 'large' &&
      ledgerSourceProjectAction.maximumPostAttempts === 1 &&
      ledgerSourceProjectAction.automaticPostRetryAllowed === false &&
      ledgerSourceProjectAction.providerIdempotencyKeyDocumented === false &&
      ledgerSourceProjectAction.durablePrePostState === 'POST_INTENT_DURABLE' &&
      ledgerSourceProjectAction.postIntentPermanentlyConsumesActionIdentity ===
        true &&
      ledgerSourceProjectAction.recoveryModeHasPostPath === false &&
      ledgerSourceProjectAction.evidenceSealOrder ===
        'PARTIAL_FLUSH_VERIFY_ATOMIC_RENAME_THEN_TERMINAL' &&
      ledgerSourceProjectAction.automaticResealAllowed === false &&
      ledgerSourceProjectAction.commercialManifestPromotion ===
        'NOT_IMPLEMENTED' &&
      ledgerSourceProjectAction.wrapperImplemented === true &&
      ledgerSourceProjectAction.wrapperExecuted === false &&
      ledgerSourceProjectAction.authorizedNow === false &&
      ledgerSourceProjectAction.requiresSeparateProvisioningBinding === true &&
      normalizedApproval.includes(
        `    action_id: ${String(provisioningAction.actionId)}`
      ) &&
      normalizedApproval.includes(
        `    method: ${String(provisioningAction.method)}`
      ) &&
      normalizedApproval.includes(
        `    http_method: ${String(provisioningAction.httpMethod)}`
      ) &&
      normalizedApproval.includes(
        `    endpoint: ${String(provisioningAction.endpoint)}`
      ) &&
      normalizedApproval.includes('    maximum_post_attempt_count: 1') &&
      normalizedApproval.includes(
        '    local_guarantee: AT_MOST_ONE_POST_ATTEMPT_NO_AUTOMATIC_RETRY'
      ) &&
      normalizedApproval.includes(
        '    durable_pre_post_state: POST_INTENT_DURABLE'
      ) &&
      normalizedApproval.includes(
        '    post_intent_permanently_consumes_action_identity: true'
      ) &&
      normalizedApproval.includes('    recovery_mode_has_post_path: false') &&
      normalizedApproval.includes(
        '    evidence_seal_order: PARTIAL_FLUSH_VERIFY_ATOMIC_RENAME_THEN_TERMINAL'
      ) &&
      normalizedApproval.includes('    automatic_reseal_allowed: false') &&
      normalizedApproval.includes(
        '    template: source-project-provisioning-binding-v6.template.json'
      ) &&
      normalizedApproval.includes('    phase_local_contract_version: 6') &&
      normalizedApproval.includes(
        '    result_template: source-project-provisioning-result-v6.template.json'
      ) &&
      normalizedApproval.includes(
        '    provider_safe_projection_template: source-project-provider-safe-projection-v4.template.json'
      ) &&
      normalizedApproval.includes(
        '    credential_configuration_template: source-project-provisioning-credential-configuration-v2.template.json'
      ) &&
      normalizedApproval.includes(
        '    authorization_projection_template: source-project-provisioning-authorization-projection-v1.template.json'
      ) &&
      normalizedApproval.includes(
        '    single_action_approval_receipt_template: source-project-provisioning-single-action-approval-receipt-v2.template.json'
      ) &&
      normalizedApproval.includes(
        '    derived_execution_binding_template: source-project-provisioning-derived-execution-binding-v1.template.json'
      ) &&
      normalizedApproval.includes('    candidate_binding_path: NOT_CAPTURED') &&
      normalizedApproval.includes(
        '    candidate_binding_sha256: NOT_CAPTURED'
      ) &&
      normalizedApproval.includes(
        '    single_action_approval_receipt_path: NOT_CAPTURED'
      ) &&
      normalizedApproval.includes(
        '    single_action_approval_receipt_sha256: NOT_CAPTURED'
      ) &&
      normalizedApproval.includes(
        '    derived_execution_binding_path: NOT_CAPTURED'
      ) &&
      normalizedApproval.includes(
        '    derived_execution_binding_sha256: NOT_CAPTURED'
      ) &&
      normalizedApproval.includes(
        '    official_pricing_evidence_template: source-project-official-pricing-evidence-v3.template.json'
      ) &&
      ledgerSourceProjectAction.wrapper.includes(
        '--binding <candidate-binding-v6.json>'
      ) &&
      ledgerSourceProjectAction.wrapper.includes(
        '--credential-config <candidate-dpapi-credential-config-v2.json>'
      ) &&
      ledgerSourceProjectAction.wrapper.includes(
        '--approval-evidence <authorization-projection-candidate-v1.json>'
      ) &&
      ledgerSourceProjectAction.wrapper.includes(
        '--single-action-approval-receipt <single-action-approval-receipt-v2.json>'
      ) &&
      ledgerSourceProjectAction.wrapper.includes(
        '--derived-execution-binding <derived-execution-binding-v1.json>'
      ) &&
      ledgerSourceProjectAction.wrapper.includes(
        '--owner-private-approval-root <owner-private-approval-root>'
      ) &&
      ledgerSourceProjectAction.reconciliationOnlyWrapper.includes(
        '--single-action-approval-receipt <single-action-approval-receipt-v2.json>'
      ) &&
      ledgerSourceProjectAction.reconciliationOnlyWrapper.includes(
        '--derived-execution-binding <derived-execution-binding-v1.json>'
      ) &&
      ledgerSourceProjectAction.reconciliationOnlyWrapper.includes(
        '--owner-private-approval-root <owner-private-approval-root>'
      ) &&
      !ledgerSourceProjectAction.wrapper.includes(
        '<approved-binding-v6.json>'
      ) &&
      !ledgerSourceProjectAction.reconciliationOnlyWrapper.includes(
        '<approved-binding-v6.json>'
      ),
    'source project provisioning action is not cross-bound across packet, ledger, and binding'
  );
  assert(
    sourceAuthorization.sourceProjectProvisioningAuthorized === false &&
      sourceAuthorization.isolatedStagingConnectionAuthorized === false &&
      sourceAuthorization.isolatedStagingExecutionAuthorized === false &&
      provisioning.status === 'NOT_RUN' &&
      provisioning.schemaVersion === 6 &&
      provisionEnvironment.organizationId === 'kbnsntifrawhimhfjrug' &&
      provisionEnvironment.organizationSlug === 'kbnsntifrawhimhfjrug' &&
      JSON.stringify(provisionEnvironment.prohibitedOrganizationIds) ===
        JSON.stringify(['kbnsntifrawhimhfjrug']) &&
      JSON.stringify(provisionEnvironment.prohibitedOrganizationSlugs) ===
        JSON.stringify(['kbnsntifrawhimhfjrug']) &&
      provisioning.approvedRequest.projection.organization_slug ===
        'kbnsntifrawhimhfjrug' &&
      provisioning.sameOrganizationException.mode ===
        'PHASE1_SAME_ORGANIZATION_PRODUCTION_PROJECT_DENY_EXCEPTION_V1' &&
      provisioning.sameOrganizationException.targetOrganizationName ===
        "IFs1991's Org" &&
      provisioning.sameOrganizationException.targetOrganizationSlug ===
        'kbnsntifrawhimhfjrug' &&
      provisioning.sameOrganizationException.productionOrganizationId ===
        'kbnsntifrawhimhfjrug' &&
      provisioning.sameOrganizationException.productionOrganizationSlug ===
        'kbnsntifrawhimhfjrug' &&
      provisioning.sameOrganizationException.productionProjectRef ===
        'qnanuoqveidwvacvbhqp' &&
      provisioning.sameOrganizationException.productionProjectOrigin ===
        'https://qnanuoqveidwvacvbhqp.supabase.co' &&
      provisioning.sameOrganizationException
        .organizationProjectEnumerationAllowed === true &&
      provisioning.sameOrganizationException
        .productionProjectSpecificManagementApiContactAuthorized === false &&
      provisioning.sameOrganizationException
        .productionProjectDataPlaneContactAuthorized === false &&
      provisioning.sameOrganizationException
        .productionDatabaseContactAuthorized === false &&
      provisioning.sameOrganizationException
        .productionCredentialAccessAuthorized === false &&
      initialPlatformPosture.mutationsIncludedInPhase1 === false &&
      initialPlatformPosture.phase2ReadOnlyObservationRequired === true &&
      provisioning.approvedRequest.projection.db_pass ===
        'RUNTIME_SECRET_NOT_IN_EVIDENCE' &&
      provisioning.approvedRequest.projection.desired_instance_size ===
        'large' &&
      provisioning.approvedRequest.sha256 === 'NOT_CAPTURED' &&
      provisioningImplementationContracts.organizationIdentityContractPath ===
        'scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs' &&
      provisioningImplementationContracts.organizationIdentityContractSha256 ===
        'NOT_CAPTURED' &&
      provisioningImplementationContracts.organizationIdentityVerifierPath ===
        'scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs' &&
      provisioningImplementationContracts.organizationIdentityVerifierSha256 ===
        'NOT_CAPTURED' &&
      provisioningAction.scheduledExecutionAt === 'NOT_CAPTURED' &&
      organizationIdentityEvidence.status === 'PASS' &&
      organizationIdentityEvidence.actionId === 'PR12-ACTION-002' &&
      organizationIdentityEvidence.terminalState === 'TERMINAL_PASS' &&
      organizationIdentityEvidence.sourceGitCommit ===
        '6edd6733756dd73e458cf705675895a5666c76e6' &&
      organizationIdentityEvidence.sourceBindingMaterialSha256 ===
        '56b07d3eb802d546df25be3b487e32b9c30f0aa7ac1f896bba483cb5e207eb3c' &&
      organizationIdentityEvidence.sourceRequestSha256 ===
        '95149b0f64407700298cbe842cbd15780300e9e357dc492f5d4d56e490490a8e' &&
      organizationIdentityEvidence.manifestSha256 ===
        '66db9ed2b7fdb7573b76e79273c71d95551cdb7385e0ca8ee21724c56399f582' &&
      organizationIdentityEvidence.terminalSha256 ===
        '3fec7d3156c52e862602e9adb115e460c6959caeba38d5a1b290abe41513782e' &&
      organizationIdentityEvidenceOrganization.organizationId ===
        'kbnsntifrawhimhfjrug' &&
      organizationIdentityEvidenceOrganization.organizationName ===
        "IFs1991's Org" &&
      organizationIdentityEvidenceOrganization.organizationSlug ===
        'kbnsntifrawhimhfjrug' &&
      organizationIdentityEvidenceOrganization.plan === 'PRO' &&
      Object.values(
        requireRecord(
          organizationIdentityEvidence.evidenceDirectoryFingerprint,
          'provisioning.organizationIdentityEvidence.evidenceDirectoryFingerprint'
        )
      ).every(value => value === 'NOT_CAPTURED') &&
      Object.values(
        requireRecord(
          organizationIdentityEvidence.journalDirectoryFingerprint,
          'provisioning.organizationIdentityEvidence.journalDirectoryFingerprint'
        )
      ).every(value => value === 'NOT_CAPTURED') &&
      provisioning.duplicateAndFailurePolicy
        .atomicLocalClaimRequiredBeforeCredentialRetrieval === true &&
      provisioning.duplicateAndFailurePolicy
        .durableFileFlushAndReadbackRequired === true &&
      provisioning.duplicateAndFailurePolicy.postIntentDurableBeforeFetch ===
        true &&
      provisioning.duplicateAndFailurePolicy
        .postIntentPermanentlyConsumesActionIdentity === true &&
      provisioning.duplicateAndFailurePolicy
        .credentialBrokerFailureConsumesActionIdentity === true &&
      provisioning.duplicateAndFailurePolicy
        .credentialBrokerAutomaticRetryAllowed === false &&
      provisioning.duplicateAndFailurePolicy.unknownRemoteOutcomeAction ===
        'NO_RETRY_READ_ONLY_RECONCILIATION_AND_OWNER_DECISION' &&
      provisioning.duplicateAndFailurePolicy.reconciliationOnlyMode ===
        '--reconcile-dispatched-action' &&
      provisioning.evidenceContract.rawProviderBodiesPersisted === false &&
      provisioning.evidenceContract.rawHttpHeadersPersisted === false &&
      provisioning.evidenceContract.atomicPartialThenRenameRequired === true &&
      provisioning.evidenceContract
        .evidenceSealBeforeTerminalOutcomeRequired === true &&
      provisioning.evidenceContract.partialEvidenceAutomaticDeletionAllowed ===
        false &&
      provisioning.operatorControl.mode ===
        'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1' &&
      provisioning.operatorControl.principalDisplayName === 'FUTOSHI IWASAWA' &&
      provisioning.operatorControl.principalId === 'owner:futoshi-iwasawa' &&
      provisioning.operatorControl.principalIdType ===
        'OWNER_DECLARED_STABLE_PRINCIPAL_ID' &&
      provisioning.operatorControl.identitySeparationAvailable === false &&
      provisioning.operatorControl.independentHumanReviewClaimed === false &&
      provisioning.operatorControl.localPreparationExceptionAuthorized ===
        true &&
      provisioning.approval.soleOperatorRiskAccepted === false &&
      provisioning.approval.sameUserDpapiCredentialExposureRiskAccepted ===
        false &&
      provisioning.approval.providerSpendCapLimitationAcknowledged === false &&
      provisioning.approval.sameOrganizationExceptionRiskAccepted === false &&
      provisioning.approval.organizationListProductionRefObservationAccepted ===
        false &&
      provisioning.approval
        .sharedOrganizationIamBillingControlPlaneRiskAccepted === false &&
      provisioning.approval.productionDirectContactProhibitionAcknowledged ===
        false &&
      provisioning.approval.unknownChargesAcknowledged === false &&
      provisioning.provisioningAction.requestTimeoutMilliseconds === 30000 &&
      provisioning.provisioningAction.readinessObservationMaximumSeconds ===
        900 &&
      provisioning.provisioningAction.readinessPollIntervalSeconds === 15 &&
      provisioning.cost.organizationCurrentPlan === 'PRO' &&
      provisioning.cost.moneyScale === 10000 &&
      provisioning.cost.computeRateUsdScaledPerProjectHour === 1517 &&
      provisioning.cost.sourceMaximumComputeUsdScaled === 109224 &&
      provisioning.cost.unallocatedAuthorizationHeadroomUsdScaled === 390776 &&
      provisioning.cost.knownAdditionalChargesUsdScaled === 0 &&
      provisioning.cost.unknownChargesAcknowledged === false &&
      provisioning.cost.ownerAuthorizationCeilingUsdScaled === 500000 &&
      provisioning.cost.providerSpendCapEnforced === false &&
      provisioning.retentionAndCleanupDecision
        .fundingApprovedAmountUsdScaled === 500000 &&
      provisioning.retentionAndCleanupDecision.fundingSource ===
        'OWNER_REGISTERED_ORGANIZATION_PAYMENT_METHOD' &&
      provisioning.retentionAndCleanupDecision.fundedThrough ===
        'NOT_CAPTURED' &&
      ledgerSourceProjectAction.operatorControlMode ===
        provisioning.operatorControl.mode &&
      ledgerSourceProjectAction.operatorDisplayName ===
        provisioning.operatorControl.principalDisplayName &&
      ledgerSourceProjectAction.operatorCanonicalPrincipalId ===
        'owner:futoshi-iwasawa' &&
      ledgerSourceProjectAction.ownerAuthorizationCeilingUsdScaled === 500000 &&
      ledgerSourceProjectAction.moneyScale === 10000 &&
      ledgerSourceProjectAction.authorizedDurationHours === 72 &&
      ledgerSourceProjectAction.maximumComputeUsdScaled === 109224 &&
      ledgerSourceProjectAction.unallocatedAuthorizationHeadroomUsdScaled ===
        390776 &&
      ledgerSourceProjectAction.providerSpendCapEnforced === false &&
      ledgerSourceProjectAction.credentialProvider ===
        'WINDOWS_DPAPI_CURRENT_USER_V1' &&
      ledgerSourceProjectAction.realCredentialBootstrapAuthorized === true &&
      ledgerSourceProjectAction.realCredentialBootstrapCompleted === false &&
      ledgerSourceProjectAction.fundingApprovedAmountUsd === 50 &&
      ledgerSourceProjectAction.fundingSource ===
        "FUTOSHI IWASAWAが管理するIFs1991's Org登録済み支払方法" &&
      ledgerSourceProjectAction.fundedThroughPolicy ===
        'PR12-ACTION-003 authority acceptedAt plus 73 hours' &&
      ledgerSourceProjectAction.scheduledExecutionAt === 'NOT_CAPTURED' &&
      ledgerSourceProjectAction.fundedThrough === 'NOT_CAPTURED' &&
      ledgerSourceProjectAction.organizationIdentityCaptureActionId ===
        'PR12-ACTION-002' &&
      ledgerSourceProjectAction.organizationIdentityEvidenceLinkageStatus ===
        'IMPLEMENTED_ACTION_003_V6_REQUIRED' &&
      ledgerSourceProjectAction.fundedThroughPolicyBindingStatus ===
        'IMPLEMENTED_EXACT_AUTHORITY_ACCEPTED_AT_PLUS_73_HOURS' &&
      ledgerSourceProjectAction.fundedThroughPolicyVerifierStatus ===
        'IMPLEMENTED_EXACT_AUTHORITY_ACCEPTED_AT_PLUS_73_HOURS' &&
      ledgerSourceProjectAction.actionApprovable === false &&
      normalizedApproval.includes(
        '  phase1_source_project_owner_authorization_ceiling_usd: 50'
      ) &&
      normalizedApproval.includes(
        '  phase1_source_project_ceiling_duration_hours: 72'
      ) &&
      normalizedApproval.includes(
        '  phase1_source_project_provider_spend_cap_enforced: false'
      ) &&
      normalizedApproval.includes(
        '  sole_operator_self_approval_exception_design_authorized: true'
      ) &&
      normalizedApproval.includes(
        '  official_list_price_substitution_design_authorized: true'
      ) &&
      normalizedApproval.includes(
        '  windows_dpapi_credential_channel_local_preparation_authorized: true'
      ) &&
      normalizedApproval.includes('  pr12_action_003_authorized: false') &&
      normalizedApproval.includes(
        '  source_project_creation_authorized: false'
      ) &&
      normalizedApproval.includes(
        '  authenticated_supabase_contact_authorized: false'
      ) &&
      normalizedApproval.includes(
        '  same_organization_exception_local_implementation_authorized: true'
      ) &&
      normalizedApproval.includes(
        '  target_organization_slug: kbnsntifrawhimhfjrug'
      ) &&
      normalizedApproval.includes(
        '  production_project_ref: qnanuoqveidwvacvbhqp'
      ) &&
      normalizedApproval.includes(
        '  production_project_direct_contact_authorized: false'
      ) &&
      normalizedApproval.includes(
        '  real_credential_bootstrap_authorized: true'
      ) &&
      normalizedApproval.includes(
        '  real_credential_bootstrap_completed: false'
      ) &&
      normalizedApproval.includes(
        '  organization_identity_capture_local_implementation_authorized: true'
      ) &&
      normalizedApproval.includes(
        '  organization_identity_capture_remote_get_authorized_by_this_decision: false'
      ) &&
      normalizedApproval.includes(
        '  phase1_funding_approved_amount_usd: 50.00'
      ) &&
      normalizedApproval.includes(
        '  phase1_funding_source: "FUTOSHI IWASAWAが管理するIFs1991\'s Org登録済み支払方法"'
      ) &&
      normalizedApproval.includes(
        '  source_funded_through_policy_binding_status: IMPLEMENTED_EXACT_AUTHORITY_ACCEPTED_AT_PLUS_73_HOURS'
      ) &&
      normalizedApproval.includes(
        '  source_funded_through_policy_verifier_status: IMPLEMENTED_EXACT_AUTHORITY_ACCEPTED_AT_PLUS_73_HOURS'
      ) &&
      normalizedApproval.includes(
        '  pr12_action_003_duplicate_organization_get_status: REMOVED_ACTION_002_EVIDENCE_IS_SOLE_SOURCE'
      ) &&
      normalizedApproval.includes('  pr12_action_003_approvable: false'),
    'source provisioning phase boundary drift'
  );
  const canonicalManagementAccessTokenHandle =
    provisioningCredential.secrets.managementAccessToken.opaqueHandle;
  assert(
    typeof canonicalManagementAccessTokenHandle === 'string' &&
      normalizedApproval.includes(
        `    management_token_role:\n      opaque_handle: ${canonicalManagementAccessTokenHandle}\n      envelope_path_sha256:`
      ) &&
      !normalizedApproval.includes(
        'windows-dpapi-cu://pr12-source-project/management-token/v1'
      ),
    'Phase 1 approval packet management access token handle must match credential configuration v2'
  );
  assert(
    provisioningCredential.resultType ===
      'SOURCE_PROJECT_PROVISIONING_CREDENTIAL_CONFIGURATION' &&
      provisioningCredential.status === 'NOT_CAPTURED' &&
      provisioningCredential.schemaVersion === 2 &&
      provisioningCredential.provider.providerId ===
        'WINDOWS_DPAPI_CURRENT_USER_V1' &&
      provisioningCredential.provider.retrievalChannel ===
        'CLAIM_BOUND_CAPTURED_STDOUT_BINARY_V1' &&
      provisioningCredential.protocol.brokerTimeoutMilliseconds === 30_000 &&
      provisioningCredential.provider.ownerApproved === false &&
      provisioningCredential.secrets.managementAccessToken.opaqueHandle ===
        'windows-dpapi-cu://pr12-source-project/management-access-token/v1' &&
      provisioningCredential.secrets.databasePassword.opaqueHandle ===
        'windows-dpapi-cu://pr12-source-project/database-password/v1' &&
      provisioningCredential.secrets.databasePassword.minimumBytes === 32 &&
      provisioningCredential.processBoundary.genericOrAmbientFallbackAllowed ===
        false &&
      provisioningCredential.processBoundary.dotenvLoadingAllowed === false &&
      provisioningCredential.processBoundary.cliLoginSessionFallbackAllowed ===
        false &&
      provisioningCredential.processBoundary.inheritedEnvironmentAllowed ===
        false &&
      provisioningCredential.processBoundary.rawValueInArgvAllowed === false &&
      provisioningCredential.processBoundary.rawValueInUrlAllowed === false &&
      provisioningCredential.processBoundary.rawValueInEnvironmentAllowed ===
        false &&
      provisioningCredential.processBoundary
        .rawValueRelayToParentStdoutOrStderrAllowed === false &&
      provisioningCredential.processBoundary.rawValueInLogOrEvidenceAllowed ===
        false &&
      provisioningCredential.bootstrap.realCredentialBootstrapCompleted ===
        false &&
      provisioningCredential.bootstrap
        .realCredentialBootstrapAuthorizedByThisPreparation === false,
    'Phase 1 provisioning credential contract drift'
  );
  assert(
    provisioningAuthorizationProjection.recordType ===
      'PR12_SOURCE_PROJECT_PROVISIONING_AUTHORIZATION_PROJECTION' &&
      provisioningAuthorizationProjection.projectionStatus === 'NOT_DERIVED' &&
      provisioningAuthorizationProjection.derivationStatus === 'NOT_DERIVED' &&
      provisioningAuthorizationProjection.derivationMethod ===
        'SYSTEM_DERIVED_FROM_SINGLE_ACTION_APPROVAL' &&
      provisioningAuthorizationProjection.actionId === 'PR12-ACTION-003' &&
      provisioningAuthorizationProjection.schemaVersion === 1 &&
      provisioningAuthorizationProjection.operatorControlMode ===
        'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1' &&
      provisioningAuthorizationProjection.soleOperatorRiskAccepted === false &&
      provisioningAuthorizationProjection.sameUserDpapiCredentialExposureRiskAccepted ===
        false &&
      provisioningAuthorizationProjection.sameOrganizationExceptionRiskAccepted ===
        false &&
      provisioningAuthorizationProjection.unknownChargesAcknowledged ===
        false &&
      provisioningAuthorizationProjection.productionProjectRef ===
        'qnanuoqveidwvacvbhqp' &&
      provisioningAuthorizationProjection.organizationSlug ===
        'kbnsntifrawhimhfjrug' &&
      provisioningAuthorizationProjection.organizationId ===
        'kbnsntifrawhimhfjrug' &&
      provisioningAuthorizationProjection.organizationIdentityManifestSha256 ===
        organizationIdentityEvidence.manifestSha256 &&
      provisioningAuthorizationProjection.organizationIdentityTerminalSha256 ===
        organizationIdentityEvidence.terminalSha256 &&
      provisioningAuthorizationProjection.organizationIdentitySourceBindingMaterialSha256 ===
        organizationIdentityEvidence.sourceBindingMaterialSha256 &&
      provisioningAuthorizationProjection.organizationIdentitySourceRequestSha256 ===
        organizationIdentityEvidence.sourceRequestSha256 &&
      provisioningAuthorizationProjection.scheduledExecutionAt ===
        'NOT_CAPTURED' &&
      provisioningAuthorizationProjection.fundedThrough === 'NOT_CAPTURED' &&
      provisioningAuthorizationProjection.phase2AndLaterAuthorized === false &&
      provisioningAuthorizationProjection.cleanupDeletionAuthorized === false &&
      provisioningPricing.recordType ===
        'PR12_SOURCE_PROJECT_OFFICIAL_PRICING_EVIDENCE' &&
      provisioningPricing.status === 'NOT_CAPTURED' &&
      provisioningPricing.pricing.hourlyRateUsdScaled === 1517 &&
      provisioningPricing.pricing.maximumBillableHours === 72 &&
      provisioningPricing.pricing.maximumComputeUsdScaled === 109224 &&
      provisioningPricing.authorizationBoundary
        .ownerAuthorizationCeilingUsdScaled === 500000 &&
      provisioningPricing.authorizationBoundary.providerSpendCapEnforced ===
        false &&
      provisioningPricing.rawOfficialSourceArtifactsPersistedInRepository ===
        false &&
      JSON.stringify(provisioningBootstrapApproval.authorizedRoles) ===
        JSON.stringify(['DATABASE_PASSWORD']) &&
      provisioningBootstrapApproval.realSecretInteractiveReadAuthorized ===
        false &&
      provisioningBootstrapApproval.envelopeCreationAuthorized === false &&
      provisioningBootstrapApproval.sourceProjectProvisioningAuthorized ===
        false,
    'Phase 1 authorization projection, pricing, or DPAPI bootstrap contract drift'
  );
  assert(
    provisioningSingleActionApprovalReceipt.schemaVersion === 2 &&
      provisioningSingleActionApprovalReceipt.recordType ===
        'PR12_SOURCE_PROJECT_PROVISIONING_SINGLE_ACTION_APPROVAL_RECEIPT' &&
      provisioningSingleActionApprovalReceipt.decision === 'NOT_CAPTURED' &&
      provisioningSingleActionApprovalReceipt.attestationStatus ===
        'NOT_CAPTURED' &&
      provisioningSingleActionApprovalReceipt.attestationMethod ===
        'SOLE_OPERATOR_EXPLICIT_SINGLE_ACTION_APPROVAL' &&
      provisioningSingleActionApprovalReceipt.actionId === 'PR12-ACTION-003' &&
      provisioningSingleActionApprovalReceipt.approvedByPrincipalId ===
        'owner:futoshi-iwasawa' &&
      provisioningSingleActionApprovalReceipt.approvedByDisplayName ===
        'FUTOSHI IWASAWA' &&
      provisioningSingleActionApprovalReceipt.acceptedAt === 'NOT_CAPTURED' &&
      provisioningSingleActionApprovalReceipt.expiresAt === 'NOT_CAPTURED' &&
      provisioningSingleActionApprovalReceipt.approvalTtlSeconds === 3600 &&
      provisioningSingleActionApprovalReceipt.approvalPurpose ===
        'ACTION003_PACKET_PREPARATION_AND_SOURCE_PROJECT_PROVISIONING' &&
      provisioningSingleActionApprovalReceipt.maximumPostAttempts === 1 &&
      provisioningSingleActionApprovalReceipt.unknownChargesAcknowledged ===
        false &&
      provisioningSingleActionApprovalReceipt.action003PacketPreparationAuthorized ===
        false &&
      provisioningSingleActionApprovalReceipt.databasePasswordBootstrapAuthorized ===
        false &&
      provisioningSingleActionApprovalReceipt.sourceProjectProvisioningAuthorized ===
        false &&
      provisioningSingleActionApprovalReceipt.productionContactAuthorized ===
        false &&
      provisioningSingleActionApprovalReceipt.phase2AndLaterAuthorized ===
        false &&
      provisioningSingleActionApprovalReceipt.cleanupDeletionAuthorized ===
        false,
    'Phase 1 single-action approval receipt template drift'
  );
  assert(
    provisioningDerivedExecutionBinding.schemaVersion === 1 &&
      provisioningDerivedExecutionBinding.recordType ===
        'PR12_SOURCE_PROJECT_PROVISIONING_DERIVED_EXECUTION_BINDING' &&
      provisioningDerivedExecutionBinding.derivationStatus === 'NOT_DERIVED' &&
      provisioningDerivedExecutionBinding.derivationMethod ===
        'SYSTEM_DERIVED_HASH_BINDING_FROM_SINGLE_APPROVAL' &&
      provisioningDerivedExecutionBinding.actionId === 'PR12-ACTION-003' &&
      provisioningDerivedExecutionBinding.generatedAt === 'NOT_CAPTURED' &&
      provisioningDerivedExecutionBinding.expiresAt === 'NOT_CAPTURED' &&
      provisioningDerivedExecutionBinding.authorityReceiptSha256 ===
        'NOT_CAPTURED' &&
      provisioningDerivedExecutionBinding.bindingSha256 === 'NOT_CAPTURED' &&
      provisioningDerivedExecutionBinding.bindingMaterialSha256 ===
        'NOT_CAPTURED' &&
      provisioningDerivedExecutionBinding.payloadSha256 === 'NOT_CAPTURED' &&
      provisioningDerivedExecutionBinding.credentialConfigurationSha256 ===
        'NOT_CAPTURED' &&
      provisioningDerivedExecutionBinding.pricingEvidenceSha256 ===
        'NOT_CAPTURED' &&
      provisioningDerivedExecutionBinding.authorizationProjectionSha256 ===
        'NOT_CAPTURED' &&
      provisioningDerivedExecutionBinding.authorityScopeConfirmed === false &&
      provisioningDerivedExecutionBinding.productionContactAuthorized ===
        false &&
      provisioningDerivedExecutionBinding.phase2AndLaterAuthorized === false &&
      provisioningDerivedExecutionBinding.cleanupDeletionAuthorized === false &&
      !Object.hasOwn(
        provisioningDerivedExecutionBinding,
        'approvedByPrincipalId'
      ) &&
      !Object.hasOwn(provisioningDerivedExecutionBinding, 'acceptedAt') &&
      !Object.hasOwn(provisioningDerivedExecutionBinding, 'decision'),
    'Phase 1 derived execution binding template drift'
  );
  assert(
    provisioningJournal.actionId === 'PR12-ACTION-003' &&
      provisioningJournal.derivedExecutionBindingSha256 === 'NOT_CAPTURED' &&
      provisioningJournal.post.attemptCount === 0 &&
      provisioningJournal.post.automaticRetryCount === 0 &&
      provisioningJournal.readOnlyReconciliation.state === 'NOT_RUN' &&
      provisioningJournal.readOnlyReconciliation.automaticPostRetryPerformed ===
        false &&
      provisioningJournal.reconciliationOnlyMode ===
        '--reconcile-dispatched-action' &&
      provisioningJournal.postIntentPermanentlyConsumesActionIdentity ===
        true &&
      provisioningJournal.sealedEvidenceRequiredBeforePassTerminal === true &&
      provisioningJournal.automaticResealAllowed === false &&
      provisioningJournal.automaticCleanupAuthorized === false &&
      provisioningJournal.destructiveRecoveryAuthorized === false &&
      provisioningResult.schemaVersion === 6 &&
      provisioningResult.status === 'NOT_RUN' &&
      provisioningResult.createPostAttemptCount === 0 &&
      provisioningResult.automaticRetryCount === 0 &&
      provisioningResult.credentialBrokerInvocationCount === 0 &&
      provisioningResult.operatorControlMode ===
        'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1' &&
      provisioningResult.identitySeparationAvailable === false &&
      provisioningResult.pricingAndFunding
        .ownerAuthorizationCeilingUsdScaled === 500000 &&
      provisioningResult.pricingAndFunding.providerSpendCapEnforced === false &&
      provisioningResult.pricingAndFunding.scheduledExecutionAt ===
        'NOT_CAPTURED' &&
      provisioningResult.pricingAndFunding.fundedThrough === 'NOT_CAPTURED' &&
      provisioningResult.approvalWindow.derivedExecutionBindingSha256 ===
        'NOT_CAPTURED' &&
      requireRecord(
        provisioningResult.organizationIdentityEvidence,
        'provisioningResult.organizationIdentityEvidence'
      ).manifestSha256 === organizationIdentityEvidence.manifestSha256 &&
      provisioningResult.readOnlyReconciliation === null &&
      provisioningResult.databaseConnectionPerformed === false &&
      provisioningResult.phase2AndLaterAuthorized === false,
    'Phase 1 journal or result contract drift'
  );
  assert(
    provisioningProviderExport.schemaVersion === 4 &&
      provisioningProviderExport.exportType ===
        'SUPABASE_SOURCE_PROJECT_PROVIDER_SAFE_PROJECTION' &&
      provisioningProviderExport.request.rawWireBodyPersisted === false &&
      provisioningProviderExport.request.rawHttpHeadersPersisted === false &&
      !Object.hasOwn(provisioningProviderExport.preflight, 'organization') &&
      !Object.hasOwn(
        provisioningProviderExport.preflight,
        'organizationResponseBodySha256'
      ) &&
      requireRecord(
        provisioningProviderExport.organizationIdentityEvidence,
        'provisioningProviderExport.organizationIdentityEvidence'
      ).terminalSha256 === organizationIdentityEvidence.terminalSha256 &&
      provisioningProviderExport.computeObservation.variantId === 'ci_large' &&
      provisioningProviderExport.reconciliation === null &&
      provisioningProviderExport.productionBoundary
        .directProductionProjectManagementApiContactCount === 0 &&
      provisioningProviderExport.productionBoundary
        .productionProjectDataPlaneContactCount === 0 &&
      provisioningProviderExport.rawProviderBodiesPersisted === false &&
      provisioningEvidenceManifest.manifestType ===
        'PR12_PHASE1_SOURCE_PROJECT_PROVISIONING_EVIDENCE' &&
      provisioningEvidenceManifest.derivedExecutionBindingSha256 ===
        'NOT_CAPTURED' &&
      provisioningEvidenceManifest.rawProviderBodiesPersisted === false &&
      provisioningPrivacyScan.scanType ===
        'PR12_PHASE1_EVIDENCE_PRIVACY_AND_SECRET_SCAN' &&
      provisioningPrivacyScan.rawProviderBodiesPersisted === false,
    'Phase 1 provider projection, manifest, or privacy contract drift'
  );
  const provisioningEvidenceVerifier = readRepositoryFile(
    'scripts/commercial-hardening/verify-pr12-source-project-provisioning-evidence.mjs'
  );
  const provisioningContract = readRepositoryFile(
    'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs'
  );
  const provisioningWrapper = readRepositoryFile(
    'scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs'
  );
  const action003ApprovalBuilder = readRepositoryFile(
    'scripts/commercial-hardening/build-pr12-action003-approval-packet.mjs'
  );
  for (const requiredBuilderBoundary of [
    'buildAction003ApprovalArtifacts',
    'initializeAction003ApprovalOutputCreateNew',
    'completeAction003ApprovalOutputCreateNew',
    'verifyAction003ApprovalOutput',
    'verifyExistingAction003ApprovalOutput',
    'buildBindingMaterial',
    'buildSecretFreeRequestProjection',
    'validateInitialAction003ApprovalReceipt',
    'validateOfflineApprovalCandidate',
    'PENDING_DERIVED_EXECUTION_BINDING',
    'initialApprovalReceiptSha256',
    'sourceProjectProvisioningAuthorized: false',
    'source-project-provisioning-binding-v6.json',
    'source-project-provisioning-credential-configuration-v2.json',
    'source-project-provisioning-authorization-projection-v1.json',
    "flag: 'wx'",
    'remoteContactPerformed: false',
    'credentialReadPerformed: false',
    'AMBIENT_CREDENTIAL_FORBIDDEN',
    'ACTION002_SEALED_EVIDENCE_MISMATCH',
  ]) {
    assert(
      action003ApprovalBuilder.includes(requiredBuilderBoundary),
      `Action-003 approval builder boundary missing: ${requiredBuilderBoundary}`
    );
  }
  assert(
    !/\bfetch\s*\(/u.test(action003ApprovalBuilder) &&
      !action003ApprovalBuilder.includes('retrieveClaimBoundCredentials') &&
      !action003ApprovalBuilder.includes('buildCredentialBrokerRequest'),
    'Action-003 approval builder must remain local-only and credential-free'
  );
  const action003ApprovalPreflight = readRepositoryFile(
    'scripts/commercial-hardening/prepare-pr12-action003-approval-packet.mjs'
  );
  for (const requiredPreflightBoundary of [
    'verifyOrganizationIdentityCaptureTerminalLinkage',
    'validateDpapiCredentialResources',
    'revalidateDpapiCredentialResources',
    'includeDatabasePassword: true',
    'inspectAction003GitState',
    'organizationIdentitySourceGitCommitIsAncestor',
    'PRICING_SOURCE_ARTIFACT_HASH_MISMATCH',
    'INPUT_DESCRIPTOR_NOT_CANONICAL',
    'TEST_RUNTIME_OVERRIDE_FORBIDDEN',
    'AMBIENT_CREDENTIAL_FORBIDDEN',
    'BUILT_AT_CLOCK_MISMATCH',
    'APPROVAL_EXPIRED',
    'validateInitialAction003ApprovalReceipt',
    'initialApprovalReceiptPath',
    'assertWindowsAclBoundaries',
    'protectWindowsOutputAcl',
    'ACL_BOUNDARY_INVALID',
    'initializeAction003ApprovalOutputCreateNew',
    'completeAction003ApprovalOutputCreateNew',
    'verifyAction003ApprovalOutput',
    'verifyExistingAction003ApprovalOutput',
    'revalidateAction003ApprovalPacket',
    'PREFLIGHT_MODE_REVALIDATE',
    'EXISTING_OUTPUT_REVALIDATION_FAILED',
    'VALIDATED_NOT_WRITTEN',
    'validateAction003ApprovalPreflightForTest',
    'credentialPlaintextReadPerformed: false',
    'shell: false',
    'OWNER_PRIVATE_ACL_HELPER_PATH',
    "'-File'",
  ]) {
    assert(
      action003ApprovalPreflight.includes(requiredPreflightBoundary),
      `Action-003 approval preflight boundary missing: ${requiredPreflightBoundary}`
    );
  }
  assert(
    !/\bfetch\s*\(/u.test(action003ApprovalPreflight) &&
      !action003ApprovalPreflight.includes('retrieveClaimBoundCredentials') &&
      !action003ApprovalPreflight.includes('buildCredentialBrokerRequest') &&
      !action003ApprovalPreflight.includes('--execute-authorized-action') &&
      !action003ApprovalPreflight.includes("'-Command'"),
    'Action-003 approval preflight must remain local-only and credential-free'
  );
  assert(
    !action003ApprovalPreflight.includes(
      'export function prepareAction003ApprovalPacketWithRuntime'
    ) &&
      action003ApprovalPreflight.indexOf("status: 'VALIDATED_NOT_WRITTEN'") <
        action003ApprovalPreflight.indexOf('runtime.initializeOutput('),
    'Action-003 test runtime seam must remain structurally read-only'
  );
  const action003ApprovalReceiptContract = readRepositoryFile(
    'scripts/commercial-hardening/pr12-action003-approval-receipt-contract.mjs'
  );
  for (const requiredReceiptBoundary of [
    'requireOwnerPrivateBoundary',
    'inspectOwnerPrivatePathAcl',
    'protectOwnerPrivatePath',
    'validateInitialAction003ApprovalReceipt',
    'validateAction003ExecutionBinding',
    'deriveAction003ExecutionBinding',
    'recordInitialAction003ApprovalReceiptCreateNew',
    'recordAction003ExecutionBindingCreateNew',
    'verifyInitialAction003ApprovalReceiptStable',
    'verifyAction003ExecutionBindingStable',
    'OWNER_PRIVATE_BOUNDARY_INVALID',
    'OWNER_PRIVATE_ROOT_ACL_INVALID',
    'OWNER_PRIVATE_TARGET_ACL_INVALID',
    'allPathComponentsNonReparse: true',
    'outsideWindowsTempRoots: true',
    'databasePasswordBootstrapAuthorized',
    'sourceProjectProvisioningAuthorized',
    "openSync(filename, 'wx'",
    'remoteContactPerformed: false',
    'credentialReadPerformed: false',
  ]) {
    assert(
      action003ApprovalReceiptContract.includes(requiredReceiptBoundary),
      `Action-003 approval receipt boundary missing: ${requiredReceiptBoundary}`
    );
  }
  assert(
    !/\bfetch\s*\(/u.test(action003ApprovalReceiptContract) &&
      !action003ApprovalReceiptContract.includes(
        'retrieveClaimBoundCredentials'
      ),
    'Action-003 approval receipt contract must remain local-only and credential-free'
  );
  const action003ApprovalReceiptRecorder = readRepositoryFile(
    'scripts/commercial-hardening/record-pr12-action003-derived-execution-binding.mjs'
  );
  for (const requiredRecorderBoundary of [
    'RECORD_PR12_ACTION003_DERIVED_EXECUTION_BINDING_LOCAL_ONLY',
    'recordAction003DerivedExecutionBinding',
    '--owner-private-root',
    '--candidate-directory',
    '--input',
    '--single-action-approval-receipt',
    '--pricing-evidence',
    '--pricing-owner-private-root',
    '--derived-execution-binding-output',
    'remoteContactPerformed: false',
    'credentialPlaintextReadPerformed === false',
    'revalidateAction003ApprovalPacket',
  ]) {
    assert(
      action003ApprovalReceiptRecorder.includes(requiredRecorderBoundary),
      `Action-003 approval receipt recorder boundary missing: ${requiredRecorderBoundary}`
    );
  }
  assert(
    !/\bfetch\s*\(/u.test(action003ApprovalReceiptRecorder) &&
      !action003ApprovalReceiptRecorder.includes(
        'retrieveClaimBoundCredentials'
      ) &&
      !action003ApprovalReceiptRecorder.includes(
        '--execute-authorized-action'
      ) &&
      !action003ApprovalReceiptRecorder.includes('https://api.supabase.com'),
    'Action-003 approval receipt recorder must remain local-only and credential-free'
  );
  const ownerPrivateAclHelper = readRepositoryFile(
    'scripts/commercial-hardening/pr12-windows-owner-private-acl.ps1'
  );
  for (const requiredAclBoundary of [
    "ValidateSet('PROTECT_AND_CAPTURE', 'CAPTURE', 'CAPTURE_EFFECTIVE')",
    "ValidateSet('FILE', 'DIRECTORY')",
    'FileAttributes]::ReparsePoint',
    'SetAccessRuleProtection($true, $false)',
    "'S-1-5-18'",
    'ACCESS_RULE_COUNT_INVALID',
    'ACCESS_RULE_SID_SET_INVALID',
    'WINDOWS_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_V1',
  ]) {
    assert(
      ownerPrivateAclHelper.includes(requiredAclBoundary),
      `Action-003 owner-private ACL helper boundary missing: ${requiredAclBoundary}`
    );
  }
  const organizationIdentityContract = readRepositoryFile(
    'scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs'
  );
  const organizationIdentityWrapper = readRepositoryFile(
    'scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs'
  );
  const organizationIdentityVerifier = readRepositoryFile(
    'scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs'
  );
  for (const requiredIdentityBoundary of [
    'PR12-ACTION-002',
    'ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT',
    'TARGET_ORGANIZATION_SLUG',
    'OUTBOUND_ROUTE_NOT_ALLOWED',
    'PRODUCTION_OR_PROJECT_ROUTE_FORBIDDEN',
    'CLAIMED_GET_NOT_SENT',
    'GET_INTENT_DURABLE',
    'databasePasswordRetrievalAllowed',
    'assertNoAmbientOrganizationCaptureCredentialEnvironment',
    'sharedProvisioningContractSha256',
    'UNSAFE_NODE_RUNTIME',
    'EXECUTING_IMPLEMENTATION_ROOT_MISMATCH',
    'RUNTIME_OUTPUT_DIRECTORY_INSIDE_REPOSITORY',
    'PROVIDER_RESPONSE_DUPLICATE_MEMBER',
    'GET_ATTEMPT_TERMINATED_WITHOUT_ACCEPTED_RESPONSE',
  ]) {
    assert(
      organizationIdentityContract.includes(requiredIdentityBoundary) ||
        organizationIdentityWrapper.includes(requiredIdentityBoundary),
      `Organization identity capture boundary missing: ${requiredIdentityBoundary}`
    );
  }
  for (const requiredIdentityVerifierBoundary of [
    'EVIDENCE_FILE_SET_INVALID',
    'MANIFEST_SIDECAR_INVALID',
    'EVIDENCE_CROSS_BINDING_INVALID',
    'ACTION_EVENTS_INVALID',
    'PROVIDER_EVIDENCE_INVALID',
    'PRIVACY_SCAN_INVALID',
    'assertOrganizationIdentityCaptureEvidenceSecretFree',
    'UNKNOWN_REMOTE_OUTCOME',
    'processExecArgvCount',
  ]) {
    assert(
      organizationIdentityVerifier.includes(requiredIdentityVerifierBoundary),
      `Organization identity evidence verifier boundary missing: ${requiredIdentityVerifierBoundary}`
    );
  }
  assert(
    (organizationIdentityWrapper.match(/\bfetchImplementation\(/g) ?? [])
      .length === 1 &&
      organizationIdentityWrapper.includes("redirect: 'error'") &&
      !organizationIdentityWrapper.includes("method: 'POST'") &&
      !organizationIdentityWrapper.includes('--reconcile-dispatched-action'),
    'Organization identity wrapper must retain one exact no-retry GET path'
  );
  for (const requiredVerifierBoundary of [
    'ARTIFACT_HASH_OR_SIZE_MISMATCH',
    'MANIFEST_SIDECAR_MISMATCH',
    'EVIDENCE_CROSS_ARTIFACT_MISMATCH',
    'EVIDENCE_JSON_NON_CANONICAL',
    'PROVIDER_EXPORT_OUTCOME_INVALID',
    'PRIVACY_SCAN_INVALID',
    'assertSecretFreeEvidence',
  ]) {
    assert(
      provisioningEvidenceVerifier.includes(requiredVerifierBoundary),
      `Phase 1 evidence verifier boundary missing: ${requiredVerifierBoundary}`
    );
  }
  for (const forbiddenTransportName of [
    'NODE_DEBUG_NATIVE',
    'NODE_USE_SYSTEM_CA',
    'OPENSSL_CONF',
    'OPENSSL_MODULES',
    'SSLKEYLOGFILE',
  ]) {
    assert(
      provisioningContract.includes(`'${forbiddenTransportName}'`),
      `Phase 1 ambient transport/debug denial missing: ${forbiddenTransportName}`
    );
  }
  for (const requiredApprovalBoundary of [
    'PHASE1_OWNER_PRINCIPAL_ID',
    'validateOfflineApprovalCandidate',
    'validateDerivedExecutionBinding',
    'DERIVED_EXECUTION_BINDING_INVALID',
    'SCHEDULED_EXECUTION_TIME_INVALID',
    'APPROVAL_EXPIRY_TIME_INVALID',
    'derivedExecutionBindingSha256',
  ]) {
    assert(
      provisioningContract.includes(requiredApprovalBoundary),
      `Phase 1 final approval contract boundary missing: ${requiredApprovalBoundary}`
    );
  }
  const postCallCount = (
    provisioningWrapper.match(/\{\s*method:\s*'POST',\s*body:/g) ?? []
  ).length;
  const recoveryStart = provisioningWrapper.indexOf(
    'async function executeReadOnlyRecovery('
  );
  const recoveryEnd = provisioningWrapper.indexOf(
    '\nasync function main()',
    recoveryStart
  );
  assert(
    postCallCount === 1 && recoveryStart >= 0 && recoveryEnd > recoveryStart,
    'Phase 1 wrapper must contain exactly one create POST call path'
  );
  const recoverySource = provisioningWrapper.slice(recoveryStart, recoveryEnd);
  const providerFetchStart = provisioningWrapper.indexOf(
    'async function providerFetch('
  );
  const providerFetchEnd = provisioningWrapper.indexOf(
    '\nasync function fetchReadOnlyProjection(',
    providerFetchStart
  );
  const providerFetchSource = provisioningWrapper.slice(
    providerFetchStart,
    providerFetchEnd
  );
  const remoteRevalidationStart = provisioningWrapper.indexOf(
    'function revalidateExecutionStateBeforeRemoteContact('
  );
  const remoteRevalidationEnd = provisioningWrapper.indexOf(
    '\nfunction revalidateImmediatelyBeforePost',
    remoteRevalidationStart
  );
  const remoteRevalidationSource = provisioningWrapper.slice(
    remoteRevalidationStart,
    remoteRevalidationEnd
  );
  const guardedExecutionCallCount = (
    provisioningWrapper.match(
      /beforeRemoteContact: revalidateBeforeRemoteContact/g
    ) ?? []
  ).length;
  assert(
    !recoverySource.includes('providerFetch(') &&
      !recoverySource.includes("{ method: 'POST'") &&
      recoverySource.includes('reconcileAfterPostAttempt') &&
      provisioningWrapper.includes("state: 'POST_INTENT_DURABLE'") &&
      provisioningWrapper.includes('flush: true') &&
      provisioningWrapper.includes('renameSync(directory, finalDirectory)') &&
      provisioningWrapper.includes('function readFileSnapshot(') &&
      provisioningWrapper.includes(
        'function revalidateImmutableApprovalInputs('
      ) &&
      provisioningWrapper.includes(
        'derivedExecutionBinding: readFileSnapshot('
      ) &&
      provisioningWrapper.includes('--derived-execution-binding') &&
      provisioningWrapper.includes('derivedExecutionBindingSha256') &&
      provisioningWrapper.includes('inspectOwnerPrivatePathAcl({') &&
      provisioningWrapper.includes('approvalReceiptContractPath') &&
      provisioningWrapper.includes('ownerPrivateAclHelperPath') &&
      provisioningWrapper.includes('assertRemoteContactWithinApproval(') &&
      provisioningWrapper.includes('assertMutationPricingCurrent(') &&
      !provisioningWrapper.includes('onRemoteContact = () => undefined') &&
      !provisioningWrapper.includes('beforeRemoteContact = () => undefined') &&
      providerFetchSource.includes("fail('REMOTE_CONTACT_GUARD_REQUIRED')") &&
      providerFetchSource.indexOf('assertAllowedManagementApiRequest({') >= 0 &&
      providerFetchSource.indexOf('assertAllowedManagementApiRequest({') <
        providerFetchSource.indexOf('beforeRemoteContact();') &&
      providerFetchSource.indexOf('beforeRemoteContact();') <
        providerFetchSource.indexOf('assertRemoteContactWithinApproval(') &&
      providerFetchSource.indexOf('assertRemoteContactWithinApproval(') <
        providerFetchSource.indexOf('onRemoteContact();') &&
      providerFetchSource.indexOf('onRemoteContact();') <
        providerFetchSource.indexOf('return fetch(url,') &&
      remoteRevalidationStart >= 0 &&
      remoteRevalidationEnd > remoteRevalidationStart &&
      remoteRevalidationSource.includes(
        'revalidateImmutableApprovalInputs(inputs)'
      ) &&
      remoteRevalidationSource.includes(
        'revalidatePreparedLocalResources(inputs)'
      ) &&
      /runGit\(\s*\['rev-parse', 'HEAD'\]/.test(remoteRevalidationSource) &&
      /runGit\(\s*\['merge-base', 'HEAD', 'origin\/main'\]/.test(
        remoteRevalidationSource
      ) &&
      remoteRevalidationSource.includes('ambientCredentialNames()') &&
      remoteRevalidationSource.includes('validateOfflineApproval(') &&
      guardedExecutionCallCount === 3 &&
      provisioningWrapper.includes(
        'beforeRemoteContact: revalidateBeforeRecoveryRemoteContact'
      ) &&
      provisioningWrapper.includes('completeTerminalFromExistingEvidence') &&
      provisioningWrapper.includes('retainEvidenceAfterSealFailure(') &&
      provisioningWrapper.includes(
        'retainedPartialEvidenceDirectoryName(error)'
      ) &&
      !provisioningWrapper.includes(
        'partialEvidenceDirectoryName: evidence.partialDirectoryName'
      ) &&
      provisioningWrapper.includes('verified.trustedResult') &&
      provisioningWrapper.includes('verified.trustedProvider') &&
      provisioningEvidenceVerifier.includes('function readFileSnapshot(') &&
      provisioningEvidenceVerifier.includes('derivedExecutionBindingSha256') &&
      provisioningEvidenceVerifier.includes('trustedResult:') &&
      provisioningEvidenceVerifier.includes('trustedProvider:') &&
      provisioningWrapper.includes(
        "'EVIDENCE_SEAL_FAILED_OWNER_DECISION_REQUIRED'"
      ),
    'Phase 1 create-once, no-POST recovery, or evidence-seal boundary drift'
  );
  assert(
    sourceBootstrap.status === 'NOT_RUN' &&
      sourceBootstrap.authorization.sourceIdentityConnectionAuthorized ===
        false &&
      sourceBootstrap.authorization.sourceIdentityCaptureAuthorized === false &&
      sourceBootstrap.authorization.sourceReplayAuthorized === false &&
      sourceBootstrap.authorization.cleanMigrationReplayAuthorized === false &&
      sourceBootstrap.mandatoryStop.automaticContinuationAuthorized === false &&
      JSON.stringify(sourceBootstrap.approvedCommandIds) ===
        JSON.stringify([
          'capture-node-version',
          'capture-supabase-version',
          'capture-psql-version',
          'hash-supabase-binary',
          'hash-supabase-archive',
          'hash-psql-binary',
          'PR12-CMD-000',
          'PR12-CMD-000A',
          'PR12-CMD-001',
          'PR12-CMD-002',
          'PR12-CMD-004A',
        ]) &&
      sourceBootstrapResult.status === 'NOT_RUN' &&
      sourceBootstrapResult.commandId === 'PR12-CMD-004A',
    'source identity bootstrap phase boundary drift'
  );
  assert(
    sourceReplay.status === 'NOT_RUN' &&
      sourceReplay.authorization.isolatedStagingConnectionAuthorized ===
        false &&
      sourceReplay.authorization.cleanMigrationReplayAuthorized === false &&
      sourceReplay.authorization.postReplayCatalogCaptureAuthorized === false &&
      sourceReplay.authorization.representativeSeedAuthorized === false &&
      sourceReplay.authorization.fullQualificationAuthorized === false &&
      JSON.stringify(sourceReplay.approvedCommandIds) ===
        JSON.stringify([
          'PR12-CMD-003',
          'PR12-CMD-004',
          'PR12-CMD-005',
          'PR12-CMD-006',
          'PR12-CMD-007',
          'PR12-CMD-007A',
          'PR12-CMD-008A',
        ]) &&
      sourceReplayResult.status === 'NOT_RUN' &&
      sourceReplayResult.catalogCaptureCommandId === 'PR12-CMD-007A' &&
      sourceReplayResult.catalogCapture.path === 'NOT_CAPTURED',
    'source replay/catalog capture phase boundary drift'
  );
  assert(
    restoreCreation.status === 'NOT_RUN' &&
      restoreCreation.authorization.restoreProjectCreationAuthorized ===
        false &&
      restoreCreation.authorization.restoreProjectConnectionAuthorized ===
        false &&
      restoreCreation.authorization.postRestoreValidationAuthorized === false &&
      restoreCreation.selectedBackup.backupId === 'NOT_CAPTURED',
    'restore creation approval boundary drift'
  );
  assert(
    restoreSupplement.status === 'NOT_RUN' &&
      restoreSupplement.authorization.restoreProjectConnectionAuthorized ===
        false &&
      restoreSupplement.authorization
        .approvedQualificationMutationAuthorized === false &&
      restoreSupplement.identityConstraints
        .sourceAndRestoreProjectRefsMustDiffer === true &&
      restoreSupplement.postRestoreContracts.securityMatrix.path ===
        'NOT_CAPTURED' &&
      restoreSupplement.postRestoreContracts.dataApi.path === 'NOT_CAPTURED' &&
      restoreSupplement.postRestoreContracts.graphQl.path === 'NOT_CAPTURED' &&
      restoreSupplement.restoreEnvironment.systemIdentifier === undefined &&
      restoreSupplement.firstSupplementalIdentityAndClockCommand.commandId ===
        'PR12-CMD-018' &&
      restoreSupplement.firstSupplementalIdentityAndClockCommand.status ===
        'NOT_RUN' &&
      restoreSupplement.firstSupplementalIdentityAndClockCommand.mutating ===
        false &&
      restoreSupplement.firstSupplementalIdentityAndClockCommand
        .mutationScope === 'NONE' &&
      JSON.stringify(
        restoreSupplement.firstSupplementalIdentityAndClockCommand
          .requiredCapturedFields
      ) ===
        JSON.stringify([
          'restore project ref',
          'project URL',
          'direct database host and user',
          'database version',
          'database system identifier',
          'restore database clock_timestamp() UTC',
          'command start/end UTC',
          'stdout/stderr SHA-256',
        ]),
    'restore supplemental approval boundary drift'
  );
  for (const required of [
    'source_replay_catalog_binding_template: source-replay-catalog-capture-binding.template.json',
    'source_replay_catalog_binding_path: NOT_CAPTURED',
    'source_replay_catalog_result_template: source-replay-catalog-capture-result.template.json',
    'source_replay_catalog_result_path: NOT_CAPTURED',
    'restore_project_creation_binding_template: restore-project-creation-binding.template.json',
    'restore_project_creation_binding_path: NOT_CAPTURED',
    'restore_project_creation_binding_sha256: NOT_CAPTURED',
  ]) {
    assert(
      entry.includes(required),
      `entry restore creation binding missing: ${required}`
    );
  }
}

function verifySchemaAndTemplate() {
  const schema = readJson(
    'docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-contract.schema.json'
  );
  const template = readJson(
    'docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-manifest.template.json'
  );
  assert(
    schema.$schema === 'https://json-schema.org/draft/2020-12/schema',
    'schema draft drift'
  );
  assert(template.status === 'NOT_RUN', 'template must remain NOT_RUN');
  assert(
    template.source.gitCommit === 'NOT_CAPTURED',
    'template commit must be empty'
  );
  assert(
    template.restore.status === 'NOT_RUN',
    'template restore must be NOT_RUN'
  );
  assert(
    template.privacyScan.status === 'NOT_RUN',
    'template privacy scan must be NOT_RUN'
  );
  for (const field of [
    'backup',
    'postRestore',
    'securityMatrix',
    'representativeData',
    'performance',
    'credentialHandling',
    'sourceStructuredResults',
    'runtimePathProjection',
  ]) {
    assert(field in schema.properties, `schema missing ${field}`);
    assert(field in template, `template missing ${field}`);
  }
  assert(
    Array.isArray(schema.allOf),
    'schema must contain fail-closed conditionals'
  );
  assert(
    JSON.stringify(schema.properties.status.enum) ===
      JSON.stringify(['PASS', 'FAIL', 'NOT_RUN']),
    'top-level schema status must reject PASS_WITH_RISK and NOT_APPLICABLE'
  );
  assertExactJson(
    template.toolVersions,
    {
      node: 'NOT_CAPTURED',
      supabaseCli: '2.109.0',
      supabaseGo: '2.109.0',
      psql: 'psql (PostgreSQL) 17.9',
    },
    'qualification template tool versions'
  );
  assert(
    template.toolBinaries.supabaseCli.sha256 ===
      '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118' &&
      template.toolBinaries.supabaseGo.sha256 ===
        '59cd06ac674fdf5d6add75206408ada0a24b1dcb796d099c13b1f2aaf3f463f0' &&
      template.toolBinaries.psql.sha256 ===
        '6a4b5cd854ee1c0e50646e7612a9e769c9ae86aa97bf94c50342dad058c2b531',
    'qualification template exact tool binary pin drift'
  );
  assert(
    template.runtimePathProjection.status === 'NOT_CAPTURED' &&
      template.runtimePathProjection.rawPathsRetained === false &&
      template.runtimePathProjection.projectionSha256 === 'NOT_CAPTURED' &&
      JSON.stringify(
        Object.keys(template.runtimePathProjection.entries).sort()
      ) ===
        JSON.stringify([
          'caBundlePath',
          'dockerConfig',
          'externalWorkdir',
          'psqlPath',
          'supabaseGoPath',
          'supabaseHome',
          'supabasePath',
        ]) &&
      Object.values(template.runtimePathProjection.entries).every(
        entry =>
          entry.rawPathRetained === false &&
          entry.pathSha256 === 'NOT_CAPTURED' &&
          entry.resolvedPathSha256 === 'NOT_CAPTURED'
      ),
    'qualification template runtime path fingerprint projection drift'
  );
  const passConditional = schema.allOf.find(
    value =>
      requireRecord(value, 'schema conditional').if?.properties?.status
        ?.const === 'PASS'
  );
  assert(passConditional, 'schema PASS conditional missing');
  const passProperties = requireRecord(
    requireRecord(passConditional.then, 'schema PASS then').properties,
    'schema PASS properties'
  );
  const backupPass = requireRecord(
    requireRecord(passProperties.backup, 'schema PASS backup').properties,
    'schema PASS backup properties'
  );
  const restorePass = requireRecord(
    requireRecord(passProperties.restore, 'schema PASS restore').properties,
    'schema PASS restore properties'
  );
  assert(
    !('creationApprovalPath' in backupPass) &&
      'creationApprovalPath' in restorePass &&
      'supplementalApprovalSha256' in restorePass &&
      requireRecord(
        restorePass.validationCommandIds,
        'schema PASS restore validationCommandIds'
      ).minItems === 1 &&
      requireRecord(
        restorePass.mutationCommandIds,
        'schema PASS restore mutationCommandIds'
      ).minItems === 1,
    'schema PASS restore approval or mutation constraints drift'
  );
  const serialized = JSON.stringify(schema);
  for (const boundary of [
    'defaultPrivileges',
    'schemaUsage',
    'objectAcl',
    'aclInventoryResults',
    'directRoleResults',
    'actorId',
    'credentialHandle',
    'tokenProvenance',
    'sourceTenant',
    'targetTenant',
    'tenantDirection',
    'expectedAuthTokenSource',
    'expectedAuthActorId',
    'authorityStateControl',
    'caseClass',
    'expectedSqlExecuted',
    'observedSqlExecuted',
    'expectedEndpointOutcome',
    'observedEndpointOutcome',
    'coveredCaseIds',
    'aclVerdict',
    'rlsVerdict',
    'rtoStartEvent',
    'rtoEndEvent',
    'rpoWatermarkDefinition',
    'manualReviewStatus',
    'machineScanEvidence',
    'approvalPacketPath',
    'contractPath',
    'credentialHandling',
    'runtimePathProjection',
    'supabaseGo',
    'clientResponseExposureAllowed',
    'logExposureAllowed',
    'canonicalObservation',
    'migrationReplay',
    'sampleIds',
    'tenantDirections',
    'targets',
  ]) {
    assert(
      serialized.includes(boundary),
      `schema boundary missing: ${boundary}`
    );
  }
  const semanticVerifier = repositoryPath(
    'scripts/commercial-hardening/verify-pr12-evidence-manifest.mjs'
  );
  const templatePath = repositoryPath(
    'docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-manifest.template.json'
  );
  const result = spawnSync(
    process.execPath,
    [semanticVerifier, '--manifest', templatePath],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assert(
    result.status === 0,
    'semantic verifier must accept the NOT_RUN template'
  );

  const scanner = readRepositoryFile(
    'scripts/commercial-hardening/scan-pr12-evidence.mjs'
  );
  assert(
    scanner.includes('japanese-domestic-phone'),
    'domestic phone scan rule missing'
  );
  assert(
    scanner.includes(
      'docs/stabilization/pr12-staging-execution-owner-approval-packet-v0.2-20260719.md'
    ) &&
      scanner.includes(
        'docs/stabilization/spec-commercial-pr12-phase1-source-project-provisioning-approval-preparation-v1.0.md'
      ),
    'Phase 1 spec or human owner packet is missing from the default privacy scan'
  );

  const approval = readRepositoryFile(
    'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml'
  );
  for (const boundary of [
    'patient_pii_observed: NOT_CAPTURED',
    'security_matrix_sha256: NOT_CAPTURED',
    'approval_expiry_and_revalidation: NOT_CAPTURED',
    'machine_readable_execution_binding: NOT_CAPTURED',
    'expires_at: NOT_CAPTURED',
  ]) {
    assert(approval.includes(boundary), `approval field missing: ${boundary}`);
  }
  assert(
    !approval.includes('UNASSIGNED_SECURE_SERVER_SIDE_CHANNEL'),
    'nonstandard unresolved sentinel found'
  );

  const binding = readJson(
    'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-binding.template.json'
  );
  const classificationDigest = sha256File(
    'docs/stabilization/evidence/commercial-hardening/pr12/security-target-classification.proposed.json'
  );
  const inventoryDigest = sha256File(
    'docs/stabilization/evidence/commercial-hardening/pr12/security-target-inventory.proposed.json'
  );
  const dataApiAclDigest = sha256File(
    'docs/stabilization/evidence/commercial-hardening/pr12/data-api-acl-inventory.proposed.json'
  );
  assert(binding.status === 'NOT_RUN', 'binding template must remain NOT_RUN');
  assert(
    binding.authorization.isolatedStagingConnectionAuthorized === false &&
      binding.authorization.isolatedStagingExecutionAuthorized === false,
    'binding template must not authorize staging'
  );
  assert(
    binding.toolVersions.supabaseCli === '2.109.0' &&
      binding.toolVersions.supabaseGo === '2.109.0' &&
      binding.toolVersions.psql === '17.9',
    'binding template toolchain version pin drift'
  );
  assert(
    binding.toolBinaries.supabaseCli.path === 'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseCli.pathSha256 === 'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseCli.resolvedPathSha256 === 'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseCli.sha256 ===
        '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118' &&
      binding.toolBinaries.supabaseCli.archiveSha256 ===
        'd2b687ec3427fe7847cf7a8f603413fa8d4331f6fdbbc825eea6aa34a64d686b' &&
      binding.toolBinaries.supabaseCli.archivePath === 'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseCli.archivePathSha256 === 'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseCli.archiveResolvedPathSha256 ===
        'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseCli.archiveHashCommandId ===
        'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseGo.path === 'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseGo.pathSha256 === 'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseGo.resolvedPathSha256 === 'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseGo.sha256 ===
        '59cd06ac674fdf5d6add75206408ada0a24b1dcb796d099c13b1f2aaf3f463f0' &&
      binding.toolBinaries.psql.path === 'NOT_CAPTURED' &&
      binding.toolBinaries.psql.pathSha256 === 'NOT_CAPTURED' &&
      binding.toolBinaries.psql.resolvedPathSha256 === 'NOT_CAPTURED' &&
      binding.toolBinaries.psql.sha256 ===
        '6a4b5cd854ee1c0e50646e7612a9e769c9ae86aa97bf94c50342dad058c2b531' &&
      binding.toolBinaries.caBundle.path === 'NOT_CAPTURED' &&
      binding.toolBinaries.caBundle.contentSha256 === 'NOT_CAPTURED' &&
      binding.toolBinaries.externalRuntimeWorkdir.path === 'NOT_CAPTURED' &&
      binding.toolBinaries.externalRuntimeWorkdir.copiedFileCount === 65 &&
      binding.toolBinaries.externalRuntimeWorkdir.migrationCount === 61 &&
      binding.toolBinaries.externalRuntimeWorkdir.collectorSqlAssetCount === 3,
    'binding template exact toolchain or external path pin drift'
  );
  assert(
    binding.toolVersionCommands.node === 'NOT_CAPTURED' &&
      binding.toolVersionCommands.supabaseCli === 'NOT_CAPTURED' &&
      binding.toolVersionCommands.supabaseGo === 'NOT_CAPTURED' &&
      binding.toolVersionCommands.psql === 'NOT_CAPTURED',
    'binding template tool version command IDs must remain unresolved'
  );
  assertExactJson(
    binding.runtimeReadiness,
    {
      moduleContractStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
      populatedStagingBindingAdapterStatus: 'NOT_IMPLEMENTED',
      remoteDispatcherCallSiteStatus: 'NOT_IMPLEMENTED',
      executionStatus: 'NOT_RUN',
      executionAuthorized: false,
      runtimePathProjection: {
        schemaVersion: 1,
        status: 'NOT_CAPTURED',
        entries: {
          caBundlePath: {
            pathSha256: 'NOT_CAPTURED',
            resolvedPathSha256: 'NOT_CAPTURED',
          },
          dockerConfig: {
            pathSha256: 'NOT_CAPTURED',
            resolvedPathSha256: 'NOT_CAPTURED',
          },
          externalWorkdir: {
            pathSha256: 'NOT_CAPTURED',
            resolvedPathSha256: 'NOT_CAPTURED',
          },
          psqlPath: {
            pathSha256: 'NOT_CAPTURED',
            resolvedPathSha256: 'NOT_CAPTURED',
          },
          supabaseGoPath: {
            pathSha256: 'NOT_CAPTURED',
            resolvedPathSha256: 'NOT_CAPTURED',
          },
          supabaseHome: {
            pathSha256: 'NOT_CAPTURED',
            resolvedPathSha256: 'NOT_CAPTURED',
          },
          supabasePath: {
            pathSha256: 'NOT_CAPTURED',
            resolvedPathSha256: 'NOT_CAPTURED',
          },
        },
        exactPathCount: 7,
        rawPathsRetained: false,
        projectionSha256: 'NOT_CAPTURED',
      },
      productionDenylist: {
        projectRefs: ['qnanuoqveidwvacvbhqp'],
        hosts: ['db.qnanuoqveidwvacvbhqp.supabase.co'],
        databaseSystemIdentifiers: [],
        databaseSystemIdentifiersStatus: 'NOT_CAPTURED_BLOCKING',
        allThreeDimensionsRequiredBeforeRemoteContact: true,
      },
    },
    'binding template runtime readiness'
  );
  assert(
    binding.reviewedProposals.integrationCredential.path ===
      'integration-credential-contract.proposed.json',
    'binding template reviewed credential proposal path drift'
  );
  assertExactJson(
    binding.reviewedProposals.securityTargetClassification,
    {
      path: 'security-target-classification.proposed.json',
      sha256: classificationDigest,
    },
    'reviewed security target classification proposal'
  );
  assertExactJson(
    binding.reviewedProposals.securityTargetInventory,
    {
      path: 'security-target-inventory.proposed.json',
      sha256: inventoryDigest,
    },
    'reviewed security target inventory proposal'
  );
  assertExactJson(
    binding.reviewedProposals.dataApiAclInventory,
    {
      path: 'data-api-acl-inventory.proposed.json',
      sha256: dataApiAclDigest,
    },
    'reviewed Data API ACL inventory proposal'
  );
  assert(
    binding.bindings.credentialContract.path === 'NOT_CAPTURED' &&
      binding.bindings.commandLedger.path === 'NOT_CAPTURED' &&
      binding.bindings.commGateEvidenceMap.path === 'NOT_CAPTURED' &&
      binding.bindings.securityTargetInventory.path === 'NOT_CAPTURED' &&
      binding.bindings.securityTargetClassification.path === 'NOT_CAPTURED',
    'proposal artifacts must not be treated as executable bindings'
  );
  assert(
    binding.environment.projectRef === 'NOT_CAPTURED' &&
      binding.approval.approvedBy === 'UNASSIGNED',
    'binding template must retain project/owner blockers'
  );
}

function verifyRelativeLinks(relativePath) {
  const source = readRepositoryFile(relativePath);
  const parent = path.dirname(repositoryPath(relativePath));
  const links = [...source.matchAll(/\[[^\]]+\]\(([^)]+)\)/gmu)].map(
    match => match[1]
  );
  for (const link of links) {
    if (/^(?:https?:|mailto:|#)/u.test(link)) continue;
    const withoutAnchor = link.split('#', 1)[0];
    assert(withoutAnchor.length > 0, `empty relative link in ${relativePath}`);
    const target = path.resolve(parent, decodeURIComponent(withoutAnchor));
    assert(
      existsSync(target),
      `broken relative link in ${relativePath}: ${link}`
    );
  }
}

function main() {
  verifyPr12AuthorityArtifactContract(REPO_ROOT);
  verifyPr12LocalReadinessContracts(REPO_ROOT);
  for (const requiredPath of REQUIRED_ARTIFACTS) {
    assert(
      existsSync(repositoryPath(requiredPath)),
      `missing artifact: ${requiredPath}`
    );
  }
  assert(existsSync(PR12_EVIDENCE), 'PR12 evidence directory missing');
  verifyMigrationContract();
  verifyPerformanceContract();
  verifyGateInventory();
  verifyCommGateEvidenceMap();
  verifyApprovalBoundaries();
  verifyProposalContracts();
  verifySchemaAndTemplate();
  for (const document of [
    'docs/stabilization/spec-commercial-pr12-isolated-release-qualification-v1.0.md',
    'docs/stabilization/spec-commercial-pr12-phase1-source-project-provisioning-approval-preparation-v1.0.md',
    'docs/operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md',
    'docs/stabilization/evidence/commercial-hardening/pr12/README.md',
    'docs/stabilization/pr12-staging-execution-owner-approval-packet-v0.2-20260719.md',
  ]) {
    verifyRelativeLinks(document);
  }
  console.log(
    'PR12 preparation static contract: PASS (PR12-ACTION-002 PASS is linked; Action-003 local enablement is implemented; this static verifier does not infer external approval or execution state; 54 COMM gates remain NOT_RUN; staging is not authorized).'
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`PR12 preparation static contract: FAIL\n${message}`);
  process.exitCode = 1;
}
