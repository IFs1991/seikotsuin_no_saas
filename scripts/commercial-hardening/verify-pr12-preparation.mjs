#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-binding.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-result.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provider-export.template.json',
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
  'scripts/commercial-hardening/verify-pr12-evidence-manifest.mjs',
  'src/__tests__/security/commercial-pr12-qualification-preparation-contract.test.ts',
  'src/__tests__/security/commercial-pr12-evidence-verifier.test.ts',
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
  assert(rowTargets.combinedSubtotal === 74, 'fixture row total drift');
  assert(
    representativeness.persistentCapacityRepresentative === false,
    'capacity limitation must remain explicit'
  );
  assert(
    dataReadiness.postLoadExactRowAndHashValidator === 'NOT_IMPLEMENTED' &&
      dataReadiness.executionAuthorized === false,
    'data proposal must remain non-executable'
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
  assert(
    integration.schemaVersion === 1 &&
      integration.mode === 'SANDBOXED' &&
      integration.realExternalSideEffectsAllowed === false &&
      integration.executionAuthorized === false &&
      integration.channel === 'process_environment' &&
      integration.storageProvider === 'UNASSIGNED' &&
      integration.serverOnly === true &&
      sharedCredentialChannel.channel === 'process_environment' &&
      sharedCredentialChannel.persistence === 'process_lifetime_only' &&
      sourceCredentialChannel.targetKind === 'SOURCE' &&
      restoreCredentialChannel.targetKind === 'RESTORE' &&
      commonCredentialIsolationRules.inheritParentEnvironment === false &&
      commonCredentialIsolationRules.ambientGenericFallbackAllowed === false &&
      commonCredentialIsolationRules.committedFixturePasswordsAllowedOnHosted ===
        false &&
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
  const ledgerSupabaseCli = requireRecord(
    ledger.supabaseCli,
    'ledger.supabaseCli'
  );
  const commands = Array.isArray(ledger.commands) ? ledger.commands : [];
  assert(
    ledger.status === 'PROPOSED_NOT_EXECUTABLE' &&
      ledger.executionAuthorized === false &&
      targetGuard.status === 'NOT_IMPLEMENTED' &&
      targetGuard.requiredForEveryRemoteCommand === true &&
      JSON.stringify(targetGuard.prohibitedProjectRefs) ===
        JSON.stringify(['qnanuoqveidwvacvbhqp']),
    'command ledger fail-closed proposal drift'
  );
  assert(
    ledgerSupabaseCli.path ===
      'C:\\tmp\\pr12-supabase-cli-2.109.0\\bin\\supabase.exe' &&
      ledgerSupabaseCli.version === '2.109.0' &&
      ledgerSupabaseCli.executableSha256 ===
        '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118' &&
      ledgerSupabaseCli.officialArchivePath ===
        'C:\\tmp\\pr12-supabase-cli-2.109.0\\supabase_2.109.0_windows_amd64.zip' &&
      ledgerSupabaseCli.officialArchiveSha256 ===
        'd2b687ec3427fe7847cf7a8f603413fa8d4331f6fdbbc825eea6aa34a64d686b',
    'command ledger Supabase CLI executable/archive identity drift'
  );
  assert(
    JSON.stringify(commands.map(command => command.id)) ===
      JSON.stringify(CANONICAL_LEDGER_COMMAND_IDS),
    'command ledger exact canonical order drift'
  );
  const remoteCommands = commands.filter(command => command.remoteContact);
  assert(remoteCommands.length > 0, 'command ledger has no remote phases');
  const allowedMutationScopes = new Set([
    'CANONICAL_PROBE_TRANSACTION_ONLY',
    'ISOLATED_SCHEMA_REPLAY_ONLY',
    'LOCAL_LINK_METADATA_ONLY',
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
  assert(
    remoteCommands.every(
      command =>
        command.redactedCommand === 'NOT_IMPLEMENTED' &&
        command.authorizedNow === false
    ),
    'every proposed remote command must remain unimplemented and unauthorized'
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
    'post-load exact-row and normalized-hash validator',
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
    `${prefix}source-project-provisioning-binding.template.json`
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
    ['source provisioning', provisioning.governanceProposal],
    ['source identity bootstrap', sourceBootstrap.governanceProposal],
    ['source replay/catalog capture', sourceReplay.governanceProposal],
  ]) {
    assert(
      governanceProposal.path === 'staging-execution-approval-packet.yaml' &&
        governanceProposal.sha256 === governanceDigest,
      `${context} governance proposal hash drift`
    );
  }
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
    ['source provisioning', provisioning.owners],
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
  const sourceAuthorization = requireRecord(
    provisioning.authorization,
    'provisioning.authorization'
  );
  const provisionEnvironment = requireRecord(
    provisioning.environmentProposal,
    'provisioning.environmentProposal'
  );
  const provisionDataApi = requireRecord(
    provisionEnvironment.dataApi,
    'provisioning.environmentProposal.dataApi'
  );
  const provisionAuth = requireRecord(
    provisionEnvironment.auth,
    'provisioning.environmentProposal.auth'
  );
  const provisioningAction = requireRecord(
    provisioning.provisioningAction,
    'provisioning.provisioningAction'
  );
  assert(
    ledgerSourceProjectAction.actionId === provisioningAction.actionId &&
      ledgerSourceProjectAction.method === provisioningAction.method &&
      ledgerSourceProjectAction.httpMethod === provisioningAction.httpMethod &&
      ledgerSourceProjectAction.endpoint === provisioningAction.endpoint &&
      ledgerSourceProjectAction.name === provisionEnvironment.projectName &&
      ledgerSourceProjectAction.plan === 'pro' &&
      ledgerSourceProjectAction.region === provisionEnvironment.region &&
      ledgerSourceProjectAction.compute === 'large' &&
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
      normalizedApproval.includes('    maximum_execution_count: 1'),
    'source project provisioning action is not cross-bound across packet, ledger, and binding'
  );
  assert(
    sourceAuthorization.sourceProjectProvisioningAuthorized === false &&
      sourceAuthorization.isolatedStagingConnectionAuthorized === false &&
      sourceAuthorization.isolatedStagingExecutionAuthorized === false &&
      provisionDataApi.enabled === true &&
      provisionDataApi.automaticallyExposeNewTablesAndFunctions === false &&
      provisionEnvironment.postgresMajor === 17 &&
      provisionAuth.anonymousSignInEnabled === false &&
      provisionAuth.realEmailSmsOrOAuthDeliveryConfigured === false &&
      provisionAuth.hostedFixturePasswords ===
        'owner_secret_store_generated_ephemeral_minimum_32_characters',
    'source provisioning phase boundary drift'
  );
  assert(
    sourceBootstrap.status === 'NOT_RUN' &&
      sourceBootstrap.authorization.sourceIdentityConnectionAuthorized ===
        false &&
      sourceBootstrap.authorization.sourceIdentityCaptureAuthorized === false &&
      sourceBootstrap.authorization.sourceLinkAuthorized === false &&
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
    ),
    'human owner packet is missing from the default privacy scan'
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
    binding.toolVersions.supabaseCli === '2.109.0',
    'binding template Supabase CLI pin drift'
  );
  assert(
    binding.toolBinaries.supabaseCli.sha256 ===
      '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118' &&
      binding.toolBinaries.supabaseCli.archiveSha256 ===
        'd2b687ec3427fe7847cf7a8f603413fa8d4331f6fdbbc825eea6aa34a64d686b' &&
      binding.toolBinaries.supabaseCli.archivePath === 'NOT_CAPTURED' &&
      binding.toolBinaries.supabaseCli.archiveHashCommandId === 'NOT_CAPTURED',
    'binding template Supabase CLI executable/archive pin drift'
  );
  assert(
    binding.toolVersionCommands.node === 'NOT_CAPTURED' &&
      binding.toolVersionCommands.supabaseCli === 'NOT_CAPTURED' &&
      binding.toolVersionCommands.psql === 'NOT_CAPTURED',
    'binding template tool version command IDs must remain unresolved'
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
    'docs/operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md',
    'docs/stabilization/evidence/commercial-hardening/pr12/README.md',
    'docs/stabilization/pr12-staging-execution-owner-approval-packet-v0.2-20260719.md',
  ]) {
    verifyRelativeLinks(document);
  }
  console.log(
    'PR12 preparation static contract: PASS (54 COMM gates remain NOT_RUN; staging is not authorized).'
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`PR12 preparation static contract: FAIL\n${message}`);
  process.exitCode = 1;
}
