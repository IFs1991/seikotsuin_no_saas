/** @jest-environment node */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');

const requiredArtifacts = [
  'docs/stabilization/spec-commercial-pr12-isolated-release-qualification-v1.0.md',
  'docs/operations/commercial-pr12-isolated-staging-dr-runbook-v1.0.md',
  'docs/stabilization/evidence/commercial-hardening/pr12/README.md',
  'docs/stabilization/evidence/commercial-hardening/pr12/pr12-preparation-gate.yaml',
  'docs/stabilization/evidence/commercial-hardening/pr12/isolated-staging-entry-contract.yaml',
  'docs/stabilization/evidence/commercial-hardening/pr12/frozen-pr11-performance-contract.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/migration-input-contract.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-contract.schema.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-manifest.template.json',
  'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml',
  'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-binding.template.json',
  'scripts/commercial-hardening/verify-pr12-preparation.mjs',
  'scripts/commercial-hardening/verify-pr12-evidence-manifest.mjs',
  'scripts/commercial-hardening/scan-pr12-evidence.mjs',
  'src/__tests__/security/commercial-pr12-evidence-verifier.test.ts',
] as const;

const expectedPrimaryExecutionGates = [
  {
    id: 'created_by_read_100_of_20000',
    limit: 2.851,
    unit: 'ms',
    plan: 'natural_index_scan:blocks_created_by_idx',
  },
  { id: 'sparse_insert_10000', limit: 435.7373, unit: 'ms' },
  { id: 'dense_insert_10000', limit: 521.55125, unit: 'ms' },
  { id: 'shift_full_only_insert_2000', limit: 198.387, unit: 'ms' },
  {
    id: 'shift_full_plus_partial_insert_2000',
    limit: 219.224,
    unit: 'ms',
  },
  {
    id: 'recipient_sparse_composite_insert_1000',
    limit: 46.665,
    unit: 'ms',
  },
  {
    id: 'recipient_dense_composite_insert_1000',
    limit: 81.761,
    unit: 'ms',
  },
  {
    id: 'customer_insurance_coverages_read_250',
    limit: 66.757,
    unit: 'ms',
  },
  {
    id: 'menu_billing_profiles_read_250',
    limit: 63.3855,
    unit: 'ms',
  },
] as const;

const expectedPrimaryWalGates = [
  { id: 'sparse_insert_10000', limit: 9292168.2, unit: 'bytes' },
  { id: 'dense_insert_10000', limit: 11133665, unit: 'bytes' },
  {
    id: 'shift_full_only_insert_2000',
    limit: 1868505.6,
    unit: 'bytes',
  },
  {
    id: 'shift_full_plus_partial_insert_2000',
    limit: 2028773.6,
    unit: 'bytes',
  },
  {
    id: 'recipient_sparse_composite_insert_1000',
    limit: 600946.5,
    unit: 'bytes',
  },
  {
    id: 'recipient_dense_composite_insert_1000',
    limit: 755065,
    unit: 'bytes',
  },
] as const;

const expectedAuxiliaryExecutionGates = [
  { id: 'coverage_insert_2000', limit: 124.709, unit: 'ms' },
  { id: 'menu_profile_insert_2000', limit: 135.944, unit: 'ms' },
] as const;

const expectedAuxiliaryWalGates = [
  { id: 'coverage_insert_2000', limit: 1220025, unit: 'bytes' },
  { id: 'menu_profile_insert_2000', limit: 1718510, unit: 'bytes' },
] as const;

const expectedPlanGates = [
  'created_by_read:natural_index_scan:blocks_created_by_idx',
  'rls_read:natural_index_scan',
  'rls_read:no_sort',
  'rls_read:no_bitmap_heap_scan',
  'rls_read:no_target_seq_scan',
  'rls_read:row_limit_250',
  'blocks:trigger_and_fk_each_10000_calls',
  'target_indexes:exact_catalog_identity',
] as const;

const expectedSemanticGates = [
  'blocks_integrity:30_cases',
  'blocks_integrity:sqlstate_message_equivalence',
  'rls_scope:27_before_27_after',
  'rls_scope:tenant_a_b_exact_semantics',
  'pgtap:52_ok_0_not_ok',
] as const;

const frozenInputs = new Map([
  [
    'docs/stabilization/spec-commercial-hardening-migration-v1.0.md',
    'dbe834d03458d07babd1bbae7b7912868ae50c6ba190cc7e09819c076e62effb',
  ],
  [
    'docs/stabilization/evidence/commercial-hardening/pr11/dense-phase-a2-closure-20260719.yaml',
    '5ba5925130905190e3e765031d77bad87ac95a9d04cb3031a8be20d89ded7431',
  ],
  [
    'docs/stabilization/evidence/commercial-hardening/pr11/forward-fix-postapply-official-20260718-02/experiment-summary.json',
    'c9eec6ef5acbecac591206fc9536e85a6ce900214d26e404b64d654680379f41',
  ],
  [
    'docs/stabilization/evidence/commercial-hardening/pr11/forward-fix-postapply-official-20260718-02/manifest.json',
    '11f9c8dbea406823c3f0a06542802c8bb6319ad00d534f30a4f2570dc4b5a285',
  ],
  [
    'scripts/commercial-hardening/run-pr11-forward-fix-postapply-paired.mjs',
    'b1befb0f7d80967b0ebf101162a376a986b7d9484e73e96ef1097ed0e61955c3',
  ],
  [
    'scripts/commercial-hardening/sql/pr11-performance-probe.sql',
    '5e6ae3af19f428d63b8eaa8a56d7b659d4841fe693071e7ca11449c756c3cb65',
  ],
  [
    'scripts/commercial-hardening/sql/pr11-rls-plan-probe.sql',
    'b8377b491379afd9fbb09c156e29d8b4b12fb85c93e588ca8b1c3c47ca544279',
  ],
  [
    'scripts/commercial-hardening/sql/pr11-forward-rls-write-probe.sql',
    '09767c89cfcf03fae91d60069d1b40f0f8e806a97b7987617d12b74574efb0ac',
  ],
  [
    'scripts/commercial-hardening/sql/pr11-forward-rls-scope-semantic-probe.sql',
    'd1b5b1c9373e36a9cf31fecbc9bdc0a1cbde6d8abfcc14eba09d4a80f4349aae',
  ],
  [
    'package.json',
    'fa596a02c3eced90f2174f69d3bbf14a2ed7a2ad311017a992e5df6db9943c8d',
  ],
  [
    'package-lock.json',
    '098ee73c073ff2b5882e08405526b431b9a8a0619e06f256b06d7609aae26edf',
  ],
  [
    'src/types/supabase.ts',
    '9845fe3ee96c70d6116e4152b95335eb6e7792ff5eef256f8f3601fb1d4ac24f',
  ],
  [
    'supabase/seed.sql',
    '376d2982befda40f5ac9781ccea5bf7049ee9d357f7ea9a9155ec36f2323ca5a',
  ],
]);

function repositoryPath(relativePath: string): string {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function readRepositoryFile(relativePath: string): string {
  return fs.readFileSync(repositoryPath(relativePath), 'utf8');
}

function fileSha256(relativePath: string): string {
  return createHash('sha256')
    .update(fs.readFileSync(repositoryPath(relativePath)))
    .digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: unknown,
  context: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  return value;
}

function requireArray(value: unknown, context: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${context} must be an array`);
  }
  return value;
}

function readJsonRecord(relativePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readRepositoryFile(relativePath));
  return requireRecord(parsed, relativePath);
}

function runNodeScript(
  relativeScript: string,
  args: readonly string[]
): { status: number | null; output: string } {
  const result = spawnSync(
    process.execPath,
    [repositoryPath(relativeScript), ...args],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return {
    status: result.status,
    output: [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join('\n'),
  };
}

describe('commercial PR-12 qualification preparation contract', () => {
  it('starts from the complete reviewable artifact set', () => {
    for (const requiredPath of requiredArtifacts) {
      expect(fs.existsSync(repositoryPath(requiredPath))).toBe(true);
    }
  });

  it('preserves PR-11, Phase A2, generated types, seed, and npm inputs', () => {
    for (const [relativePath, expectedSha256] of frozenInputs) {
      expect(fileSha256(relativePath)).toBe(expectedSha256);
    }
  });

  it('freezes all canonical PR-11 execution and WAL gates without rebaseline', () => {
    const contract = readJsonRecord(
      'docs/stabilization/evidence/commercial-hardening/pr12/frozen-pr11-performance-contract.json'
    );
    const primaryExecution = requireArray(
      contract.primaryExecutionGates,
      'primaryExecutionGates'
    );
    const primaryWal = requireArray(
      contract.primaryWalGates,
      'primaryWalGates'
    );
    const auxiliaryExecution = requireArray(
      contract.auxiliaryExecutionGates,
      'auxiliaryExecutionGates'
    );
    const auxiliaryWal = requireArray(
      contract.auxiliaryWalGates,
      'auxiliaryWalGates'
    );

    expect(primaryExecution).toHaveLength(9);
    expect(primaryWal).toHaveLength(6);
    expect(auxiliaryExecution).toHaveLength(2);
    expect(auxiliaryWal).toHaveLength(2);
    expect(primaryExecution).toEqual(expectedPrimaryExecutionGates);
    expect(primaryWal).toEqual(expectedPrimaryWalGates);
    expect(auxiliaryExecution).toEqual(expectedAuxiliaryExecutionGates);
    expect(auxiliaryWal).toEqual(expectedAuxiliaryWalGates);
    expect(contract.planGates).toEqual(expectedPlanGates);
    expect(contract.semanticGates).toEqual(expectedSemanticGates);

    const authority = requireRecord(contract.authority, 'authority');
    expect(authority.officialResultSha256).toBe(
      'c9eec6ef5acbecac591206fc9536e85a6ce900214d26e404b64d654680379f41'
    );

    const serialized = JSON.stringify(contract);
    for (const requiredBoundary of [
      'median_of_exactly_3',
      'before_after_after_before_before_after',
      'discarded_samples_allowed',
      'rebaseline_allowed',
      'planner_forcing_addition_allowed',
      'canonical_probe_analyze_addition_allowed',
      'hosted_slo_is_additive_not_replacement',
      'blocks_created_by_idx',
      'natural_index_scan',
      'no_sort',
      'no_bitmap_heap_scan',
      'no_target_seq_scan',
      'row_limit_250',
      'sqlstate_message_equivalence',
      'tenant_a_b_exact_semantics',
    ]) {
      expect(serialized).toContain(requiredBoundary);
    }
  });

  it('pins the exact migration and rollback input sets at the PR-11 head', () => {
    const contract = readJsonRecord(
      'docs/stabilization/evidence/commercial-hardening/pr12/migration-input-contract.json'
    );
    expect(contract.baseCommit).toBe(
      '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab'
    );
    expect(contract.migrationHead).toBe('20260718011731');
    expect(contract.migrationCount).toBe(61);
    expect(contract.rollbackCount).toBe(60);
    expect(contract.migrationSetSha256).toBe(
      '82aee8f14e126997b8361837587159a179964c460c0d3d18b975c3af17371c07'
    );
    expect(contract.rollbackSetSha256).toBe(
      'dc586f355365ed02af1b5041bde9c20162f95230786f768af6e659e676b6d63f'
    );
    expect(contract.rollbackParity).toBe('ALL_NON_BASELINE_MIGRATIONS_PAIRED');
  });

  it('inventories every blocking COMM gate and keeps commercial release NO_GO', () => {
    const status = readRepositoryFile('docs/releases/current-gate-status.yaml');
    const ids = [...status.matchAll(/^\s*- id: (COMM-[A-Z]+-\d{3})$/gm)].map(
      match => match[1]
    );
    const expectedFamilies = new Map([
      ['DB', 8],
      ['TENANT', 9],
      ['AUTH', 8],
      ['API', 9],
      ['BILL', 9],
      ['OPS', 11],
    ]);

    expect(ids).toHaveLength(54);
    expect(new Set(ids).size).toBe(54);
    for (const [family, count] of expectedFamilies) {
      expect(ids.filter(id => id.startsWith(`COMM-${family}-`))).toHaveLength(
        count
      );
    }
    expect(status).toContain('commercial_release: NO_GO');
    expect(status).toContain('assessed_commit: NOT_CAPTURED');
    expect(status).toContain('selector: GIT_HEAD_AT_EVALUATION');
    expect(status.match(/^\s*status: NOT_RUN$/gm)).toHaveLength(59);
    expect(status).not.toMatch(/^\s*status: PASS(?:_WITH_RISK)?$/gm);
  });

  it('keeps staging, Ready, merge, production, and index retirement unauthorized', () => {
    const preparation = readRepositoryFile(
      'docs/stabilization/evidence/commercial-hardening/pr12/pr12-preparation-gate.yaml'
    );
    const entry = readRepositoryFile(
      'docs/stabilization/evidence/commercial-hardening/pr12/isolated-staging-entry-contract.yaml'
    );
    const approval = readRepositoryFile(
      'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml'
    );
    const combined = `${preparation}\n${entry}\n${approval}`;

    for (const boundary of [
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
      'estimated_cost: NOT_CAPTURED',
    ]) {
      expect(combined).toContain(boundary);
    }
  });

  it('requires complete, immutable, privacy-scanned execution evidence', () => {
    const schema = readJsonRecord(
      'docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-contract.schema.json'
    );
    const serialized = JSON.stringify(schema);
    for (const field of [
      'gitCommit',
      'approvalPacketSha256',
      'projectRef',
      'region',
      'databaseTier',
      'credentialHandling',
      'toolVersions',
      'clientResponseExposureAllowed',
      'logExposureAllowed',
      'startedAt',
      'endedAt',
      'redactedCommand',
      'stdoutSha256',
      'stderrSha256',
      'rowCounts',
      'logicalHash',
      'physicalHash',
      'owner',
      'approver',
      'status',
      'residualRisk',
      'expiresAt',
      'privacyScan',
      'externalSideEffects',
      'representativeData',
      'performance',
      'primaryExecutionResults',
      'hostedSlo',
      'backup',
      'postRestore',
      'securityMatrix',
      'defaultPrivileges',
      'schemaUsage',
      'aclVerdict',
      'rlsVerdict',
      'directRoleResults',
      'manualReviewStatus',
      'machineScanEvidence',
      'approvalPacketPath',
      'rtoStartEvent',
      'rtoEndEvent',
      'rpoWatermarkDefinition',
      'rtoSeconds',
      'rpoSeconds',
    ]) {
      expect(serialized).toContain(field);
    }
  });

  it('restricts top-level evidence status to fail-closed qualification states', () => {
    const schema = readJsonRecord(
      'docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-contract.schema.json'
    );
    const properties = requireRecord(schema.properties, 'schema.properties');
    const status = requireRecord(properties.status, 'schema.properties.status');
    expect(status.enum).toEqual(['PASS', 'FAIL', 'NOT_RUN']);
  });

  it('rejects a placeholder-only manifest relabeled PASS', () => {
    const template = readJsonRecord(
      'docs/stabilization/evidence/commercial-hardening/pr12/qualification-evidence-manifest.template.json'
    );
    template.status = 'PASS';
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-fail-closed-')
    );
    try {
      const manifestPath = path.join(temporaryDirectory, 'manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(template), 'utf8');
      const result = runNodeScript(
        'scripts/commercial-hardening/verify-pr12-evidence-manifest.mjs',
        ['--manifest', manifestPath]
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain('placeholder or unresolved value');
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('detects a synthetic Japanese domestic phone without printing it', () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-privacy-')
    );
    const syntheticPhone = ['090', '0000', '0000'].join('-');
    try {
      const evidencePath = path.join(temporaryDirectory, 'evidence.txt');
      fs.writeFileSync(evidencePath, `synthetic=${syntheticPhone}\n`, 'utf8');
      const result = runNodeScript(
        'scripts/commercial-hardening/scan-pr12-evidence.mjs',
        ['--path', evidencePath]
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain('japanese-domestic-phone');
      expect(result.output).not.toContain(syntheticPhone);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('keeps unresolved approval facts separate from requirements', () => {
    const packet = readRepositoryFile(
      'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml'
    );
    expect(packet).toContain('patient_pii_observed: NOT_CAPTURED');
    expect(packet).toContain('storage: UNASSIGNED');
    expect(packet).toContain('required_channel: process_environment');
    expect(packet).toContain(
      'required_storage: owner_approved_server_secret_store'
    );
    expect(packet).toContain('expires_at: NOT_CAPTURED');
    expect(packet).toContain('security_matrix_sha256: NOT_CAPTURED');
    expect(packet).toContain('approval_expiry_and_revalidation: NOT_CAPTURED');
    expect(packet).toContain(
      'machine_readable_execution_binding: NOT_CAPTURED'
    );
    expect(packet).not.toContain('UNASSIGNED_SECURE_SERVER_SIDE_CHANNEL');
  });
});
