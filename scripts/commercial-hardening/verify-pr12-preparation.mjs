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
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const REQUIRED_ARTIFACTS = [
  'docs/stabilization/spec-commercial-pr12-isolated-release-qualification-v1.0.md',
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

function verifyApprovalBoundaries() {
  const sources = [
    'docs/stabilization/evidence/commercial-hardening/pr12/pr12-preparation-gate.yaml',
    'docs/stabilization/evidence/commercial-hardening/pr12/isolated-staging-entry-contract.yaml',
    'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml',
  ].map(readRepositoryFile);
  const combined = sources.join('\n');
  for (const required of [
    'draft_pr_creation_authorized: true',
    'isolated_staging_execution_authorized: false',
    'ready_transition_authorized: false',
    'merge_authorized: false',
    'production_connection_authorized: false',
    'commercial_release_authorized: false',
    'index_retirement_authorized: false',
    'project_ref: NOT_CAPTURED',
    'region: UNASSIGNED',
    'database_tier: UNASSIGNED',
    'hosted_slo: NOT_CAPTURED',
    'backup_restore_method: NOT_CAPTURED',
    'exact_commands: NOT_CAPTURED',
  ]) {
    assert(
      combined.includes(required),
      `approval boundary missing: ${required}`
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
  const serialized = JSON.stringify(schema);
  for (const boundary of [
    'defaultPrivileges',
    'schemaUsage',
    'objectAcl',
    'directRoleResults',
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
  assert(binding.status === 'NOT_RUN', 'binding template must remain NOT_RUN');
  assert(
    binding.authorization.isolatedStagingExecutionAuthorized === false,
    'binding template must not authorize staging'
  );
  assert(
    binding.toolVersions.supabaseCli === '2.109.0',
    'binding template Supabase CLI pin drift'
  );
  assert(
    binding.toolVersionCommands.node === 'NOT_CAPTURED' &&
      binding.toolVersionCommands.supabaseCli === 'NOT_CAPTURED' &&
      binding.toolVersionCommands.psql === 'NOT_CAPTURED',
    'binding template tool version command IDs must remain unresolved'
  );
  assert(
    binding.bindings.credentialContract.path === 'NOT_CAPTURED',
    'binding template credential contract must remain unresolved'
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
  verifyApprovalBoundaries();
  verifySchemaAndTemplate();
  for (const document of [
    'docs/stabilization/spec-commercial-pr12-isolated-release-qualification-v1.0.md',
    'docs/operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md',
    'docs/stabilization/evidence/commercial-hardening/pr12/README.md',
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
