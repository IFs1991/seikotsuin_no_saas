/** @jest-environment node */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');

const requiredArtifacts = [
  'docs/stabilization/spec-commercial-pr12-isolated-release-qualification-v1.0.md',
  'docs/stabilization/pr12-staging-execution-owner-approval-packet-v0.2-20260719.md',
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

  it('rejects a representative-data digest that is not the tracked contract digest', () => {
    const inventory = readJsonRecord(
      'docs/stabilization/evidence/commercial-hardening/pr12/security-target-inventory.proposed.json'
    );
    const derivation = requireRecord(
      inventory.derivation,
      'security target inventory derivation'
    );
    const representative = requireRecord(
      derivation.representativeDataContract,
      'security target inventory representative data binding'
    );
    const trackedDigest = fileSha256(
      'docs/stabilization/evidence/commercial-hardening/pr12/representative-data-contract.proposed.json'
    );
    expect(representative.path).toBe(
      'representative-data-contract.proposed.json'
    );
    expect(representative.sha256).toBe(trackedDigest);
    expect({ ...representative, sha256: '0'.repeat(64) }.sha256).not.toBe(
      trackedDigest
    );
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
    expect(contract.historicalFacts).toEqual({
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
    });

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

  it('freezes the 54-gate COMM claim map while keeping its typed registry blocked', () => {
    const mapPath =
      'docs/stabilization/evidence/commercial-hardening/pr12/comm-gate-evidence-map-v1.json';
    const contract = readJsonRecord(mapPath);
    const gates = requireArray(contract.gates, 'COMM map gates');
    const ids = gates.map((value, index) => {
      const row = requireRecord(value, `COMM map gates[${String(index)}]`);
      const claims = requireArray(row.requires, `COMM map ${String(row.id)}`);
      expect(claims.length).toBeGreaterThan(0);
      expect(new Set(claims).size).toBe(claims.length);
      return row.id;
    });
    const status = readRepositoryFile('docs/releases/current-gate-status.yaml');
    const expectedIds = [
      ...status.matchAll(/^\s*- id: (COMM-[A-Z]+-\d{3})$/gm),
    ].map(match => match[1]);
    expect(contract.status).toBe('DESIGN_FROZEN_EXECUTION_BLOCKED');
    expect(contract.unknownClaimsFailClosed).toBe(true);
    expect(ids).toEqual(expectedIds);
    expect(
      requireArray(contract.unimplementedClaimFamilies, 'families').length
    ).toBeGreaterThan(0);
    const digest = fileSha256(mapPath);
    for (const bindingPath of [
      'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml',
      'docs/stabilization/evidence/commercial-hardening/pr12/isolated-staging-entry-contract.yaml',
    ]) {
      const binding = readRepositoryFile(bindingPath);
      expect(binding).toContain(`sha256: ${digest}`);
      expect(binding).toContain('generic_self_attestation_allowed: false');
      expect(binding).toContain('typed_claim_registry_status: NOT_IMPLEMENTED');
      expect(binding).toContain('execution_pass_allowed: false');
    }
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
      'isolated_staging_connection_authorized: false',
      'isolated_staging_execution_authorized: false',
      'source_replay_and_catalog_capture_authorized: false',
      'source_full_qualification_and_backup_capture_authorized: false',
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
      'exact_commands: PROPOSED_NOT_EXECUTABLE',
      'hosted_collector_status: NOT_IMPLEMENTED',
      'action_id: PR12-ACTION-003',
      'method: OWNER_MANAGEMENT_API_CREATE_PROJECT',
      'endpoint: https://api.supabase.com/v1/projects',
      'one new isolated billable Supabase source project',
    ]) {
      expect(combined).toContain(boundary);
    }
  });

  it('pins a concrete owner proposal without relabeling it executable', () => {
    const evidencePrefix =
      'docs/stabilization/evidence/commercial-hardening/pr12/';
    const proposalPaths = [
      'hosted-slo-contract.proposed.json',
      'representative-data-contract.proposed.json',
      'dr-contract.proposed.json',
      'integration-credential-contract.proposed.json',
      'staging-command-ledger.proposed.json',
      'security-target-classification.proposed.json',
      'security-target-inventory.proposed.json',
      'data-api-acl-inventory.proposed.json',
      'comm-gate-evidence-map-v1.json',
    ] as const;
    const packet = readRepositoryFile(
      `${evidencePrefix}staging-execution-approval-packet.yaml`
    );
    const entry = readRepositoryFile(
      `${evidencePrefix}isolated-staging-entry-contract.yaml`
    );
    const binding = readJsonRecord(
      `${evidencePrefix}staging-execution-binding.template.json`
    );
    const serializedBinding = JSON.stringify(binding);

    for (const requiredStageToken of [
      'source_project_provisioning',
      'source_identity_and_configuration_bootstrap',
      'source_replay_and_catalog_capture',
      'source_qualification_and_backup_capture',
      'restore_project_creation',
      'restore_target_validation',
    ]) {
      expect(packet).toContain(requiredStageToken);
    }
    expect(packet).toContain('first_and_only_remote_command_id: PR12-CMD-004A');
    expect(packet).toContain(
      'source_identity_and_configuration_bootstrap_authorized: false'
    );
    expect(entry).toContain(
      'stage_2_source_identity_and_read_only_configuration_bootstrap_PR12_CMD_004A'
    );

    for (const proposalPath of proposalPaths) {
      const relativePath = `${evidencePrefix}${proposalPath}`;
      const digest = fileSha256(relativePath);
      expect(packet).toContain(proposalPath);
      expect(packet).toContain(digest);
      expect(entry).toContain(proposalPath);
      expect(entry).toContain(digest);
      expect(serializedBinding).toContain(proposalPath);
      expect(serializedBinding).toContain(digest);
    }

    const targetClassification = readJsonRecord(
      `${evidencePrefix}security-target-classification.proposed.json`
    );
    const classificationSummary = requireRecord(
      targetClassification.trackedDraftSummary,
      'security target classification summary'
    );
    const requiredAuthTargets = requireArray(
      targetClassification.requiredAuthTargets,
      'security target required Auth targets'
    ).map((value, index) =>
      requireRecord(value, `security target Auth target ${String(index)}`)
    );
    const classificationReadiness = requireRecord(
      targetClassification.implementationReadiness,
      'security target classification readiness'
    );
    expect(targetClassification).toMatchObject({
      status: 'PROPOSED_OWNER_APPROVAL_REQUIRED',
      executionStatus: 'NOT_RUN',
    });
    expect(classificationSummary).toEqual({
      publicRelationCount: 86,
      candidateClassCounts: {
        A_TENANT_CANONICAL: 24,
        B_SERVICE_ROLE_ONLY: 5,
        C_SHARED_MASTER_READ_ONLY: 4,
        E_LEGACY_QUARANTINE: 5,
        UNKNOWN: 48,
      },
      publicSurfaceSpecialCandidateCount: 4,
      ownerApprovedPublicRelationCount: 0,
      unresolvedPublicRelationCount: 86,
    });
    expect(
      requiredAuthTargets.map(row => [
        row.relation,
        row.reviewStatus,
        row.executionBlocker,
      ])
    ).toEqual([
      ['auth.identities', 'UNASSIGNED', true],
      ['auth.users', 'UNASSIGNED', true],
    ]);
    expect(classificationReadiness).toMatchObject({
      postReplayCatalogCollector: 'NOT_IMPLEMENTED',
      normalizedClassificationCollector: 'NOT_IMPLEMENTED',
      executionAuthorized: false,
    });

    const targetInventory = readJsonRecord(
      `${evidencePrefix}security-target-inventory.proposed.json`
    );
    const inventoryBlockers = requireArray(
      targetInventory.blockingInputs,
      'security target inventory blockers'
    ).map((value, index) =>
      requireRecord(value, `security target inventory blocker ${String(index)}`)
    );
    expect(targetInventory).toMatchObject({
      status: 'PROPOSED_OWNER_APPROVAL_REQUIRED',
      executionStatus: 'NOT_RUN',
    });
    expect(inventoryBlockers.map(row => [row.id, row.status])).toEqual([
      ['POST_REPLAY_CATALOG_NOT_CAPTURED', 'NOT_CAPTURED'],
      ['CATALOG_TO_TRACKED_BASELINE_PARITY_NOT_CAPTURED', 'NOT_CAPTURED'],
      ['PUBLIC_CLASSIFICATIONS_UNRESOLVED', 'UNASSIGNED'],
      ['ALL_RELATION_OWNER_REVIEW_NOT_CAPTURED', 'NOT_CAPTURED'],
      ['AUTH_RELATION_CLASSIFICATION_NOT_APPROVED', 'UNASSIGNED'],
      ['TARGET_INVENTORY_COLLECTOR_NOT_IMPLEMENTED', 'NOT_IMPLEMENTED'],
    ]);
    expect(
      requireRecord(
        targetInventory.implementationReadiness,
        'security target inventory readiness'
      )
    ).toEqual({ collector: 'NOT_IMPLEMENTED', executionAuthorized: false });

    const aclInventory = readJsonRecord(
      `${evidencePrefix}data-api-acl-inventory.proposed.json`
    );
    const aclScope = requireRecord(
      aclInventory.catalogScope,
      'Data API ACL catalog scope'
    );
    const aclBlockers = requireArray(
      aclInventory.blockingInputs,
      'Data API ACL blockers'
    ).map((value, index) =>
      requireRecord(value, `Data API ACL blocker ${String(index)}`)
    );
    expect(aclInventory).toMatchObject({
      status: 'PROPOSED_OWNER_APPROVAL_REQUIRED',
      executionStatus: 'NOT_RUN',
    });
    expect(aclScope).toMatchObject({
      source: 'POST_REPLAY_PG_CATALOG',
      actualExposedSchemas: 'NOT_CAPTURED',
      schemasFromProjectSettings: true,
      relationRelkinds: ['r', 'p', 'v', 'm', 'f'],
      sequenceRelkind: 'S',
      columnsIncluded: true,
      functionIdentityArgumentsIncluded: true,
      defaultPrivilegeOwners: ['postgres', 'supabase_admin'],
      roles: ['anon', 'authenticated', 'service_role'],
    });
    expect(aclBlockers.map(row => [row.id, row.status])).toEqual([
      ['DATA_API_PROJECT_SETTINGS_NOT_CAPTURED', 'NOT_CAPTURED'],
      ['POST_REPLAY_ACL_OBJECT_CATALOG_NOT_CAPTURED', 'NOT_CAPTURED'],
      ['ACL_EXPECTED_CASES_NOT_OWNER_APPROVED', 'UNASSIGNED'],
      ['ACL_CATALOG_AND_MATRIX_COLLECTOR_NOT_IMPLEMENTED', 'NOT_IMPLEMENTED'],
    ]);

    const hosted = readJsonRecord(
      `${evidencePrefix}hosted-slo-contract.proposed.json`
    );
    const target = requireRecord(hosted.target, 'hosted.target');
    const thresholds = requireRecord(hosted.thresholds, 'hosted.thresholds');
    const readiness = requireRecord(
      hosted.implementationReadiness,
      'hosted.implementationReadiness'
    );
    const samples = requireArray(hosted.scoredSamples, 'hosted.scoredSamples');
    expect(hosted.status).toBe('PROPOSED_OWNER_APPROVAL_REQUIRED');
    expect(hosted.executionStatus).toBe('NOT_RUN');
    expect(target).toMatchObject({
      region: 'ap-northeast-1',
      compute: 'large',
    });
    expect(thresholds).toEqual({
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
    });
    expect(
      samples.map((sample, index) => {
        const value = requireRecord(sample, `hosted sample ${String(index)}`);
        return [value.id, value.durationSeconds, value.concurrency];
      })
    ).toEqual([
      ['sample_1_read_heavy_c50', 600, 50],
      ['sample_2_mixed_crud_c50', 600, 50],
      ['sample_3_read_heavy_repeat_c50', 600, 50],
    ]);
    expect(readiness).toMatchObject({
      hostedCollector: 'NOT_IMPLEMENTED',
      executionAuthorized: false,
    });

    const data = readJsonRecord(
      `${evidencePrefix}representative-data-contract.proposed.json`
    );
    const rowTargets = requireRecord(
      data.explicitPersistentRowTargets,
      'data.explicitPersistentRowTargets'
    );
    const representativeness = requireRecord(
      data.representativeness,
      'data.representativeness'
    );
    expect(data).toMatchObject({
      classification: 'SYNTHETIC',
      productionSnapshotAllowed: false,
      patientPiiAllowed: false,
    });
    expect(rowTargets.combinedSubtotal).toBe(74);
    expect(representativeness.persistentCapacityRepresentative).toBe(false);

    const integration = readJsonRecord(
      `${evidencePrefix}integration-credential-contract.proposed.json`
    );
    const targetBindingRules = requireRecord(
      integration.targetBindingRules,
      'integration.targetBindingRules'
    );
    const credentialChannels = requireRecord(
      integration.credentialChannels,
      'integration.credentialChannels'
    );
    const sharedCredentialChannel = requireRecord(
      credentialChannels.sharedProvider,
      'credentialChannels.sharedProvider'
    );
    const sourceCredentialChannel = requireRecord(
      credentialChannels.source,
      'credentialChannels.source'
    );
    const restoreCredentialChannel = requireRecord(
      credentialChannels.restore,
      'credentialChannels.restore'
    );
    expect(sharedCredentialChannel.requiredParentEnvironmentNames).toEqual([
      'PR12_SUPABASE_ACCESS_TOKEN',
      'PR12_PSQL_EXE',
    ]);
    expect(sharedCredentialChannel.childProcessMappings).toEqual({
      SUPABASE_ACCESS_TOKEN: 'PR12_SUPABASE_ACCESS_TOKEN',
    });
    expect(sourceCredentialChannel.requiredParentEnvironmentNames).toEqual([
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
    ]);
    expect(
      sourceCredentialChannel.optionalSandboxParentEnvironmentNames
    ).toEqual([
      'PR12_SOURCE_STRIPE_TEST_SECRET_KEY',
      'PR12_SOURCE_STRIPE_TEST_WEBHOOK_SECRET',
    ]);
    expect(restoreCredentialChannel.requiredParentEnvironmentNames).toEqual([
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
    ]);
    expect(
      restoreCredentialChannel.optionalSandboxParentEnvironmentNames
    ).toEqual([]);
    const sourceParentSet = new Set(
      [
        ...requireArray(
          sourceCredentialChannel.requiredParentEnvironmentNames,
          'source parents'
        ),
        ...requireArray(
          sourceCredentialChannel.optionalSandboxParentEnvironmentNames,
          'source optional parents'
        ),
      ].map(String)
    );
    expect(
      requireArray(
        restoreCredentialChannel.requiredParentEnvironmentNames,
        'restore parents'
      ).every(value => !sourceParentSet.has(String(value)))
    ).toBe(true);

    const dr = readJsonRecord(`${evidencePrefix}dr-contract.proposed.json`);
    expect(fileSha256(`${evidencePrefix}dr-contract.proposed.json`)).toBe(
      '9bd4b1002dc2456d0bd063aa5be06cbb24f7acf4b2b7ff9411331d780fe279ed'
    );
    const drMethod = requireRecord(dr.method, 'dr.method');
    const restoreTarget = requireRecord(dr.restoreTarget, 'dr.restoreTarget');
    const watermark = requireRecord(dr.watermark, 'dr.watermark');
    const backupEvidence = requireRecord(
      dr.backupEvidence,
      'dr.backupEvidence'
    );
    const operationEvidence = requireRecord(
      dr.operationEvidence,
      'dr.operationEvidence'
    );
    const productTargetConflict = requireRecord(
      dr.productTargetConflict,
      'dr.productTargetConflict'
    );
    const rto = requireRecord(dr.rto, 'dr.rto');
    const rpo = requireRecord(dr.rpo, 'dr.rpo');
    const cleanup = requireRecord(dr.cleanup, 'dr.cleanup');
    const drSource = requireRecord(dr.source, 'dr.source');
    expect(rto.thresholdSeconds).toBe(28800);
    expect(rpo.thresholdSeconds).toBe(86400);
    expect(cleanup.sourceOrTargetDeletionAuthorized).toBe(false);
    expect(drMethod).toMatchObject({
      pitrEnabled: false,
      logicalFallbackAllowedWithoutReapproval: false,
      sourceMustRemainUntouched: true,
    });
    expect(restoreTarget).toMatchObject({
      mustBeNewProject: true,
      mustBeSameRegion: true,
      maximumPreActionInventoryAgeSeconds: 60,
      productionIdentityAllowed: false,
    });
    expect(watermark).toMatchObject({
      requiredAffectedRows: 1,
      executionCommandId: 'PR12-CMD-017',
      postWatermarkSourceIntegrityRequired: true,
      normalizedDataHashIncludesWatermarkColumn: true,
    });
    expect(backupEvidence).toMatchObject({
      rawProviderInventoryRequired: true,
      rawProviderInventoryCommandId: 'PR12-CMD-017A',
    });
    expect(operationEvidence).toMatchObject({
      monotonicTimerClockSource: 'NODE_PROCESS_HRTIME_BIGINT',
      persistentOrchestratorRequired: true,
      rtoRpoPassCurrentlyPossible: false,
    });
    expect(productTargetConflict).toMatchObject({
      drillThresholds: { rtoSeconds: 28800, rpoSeconds: 86400 },
      productThresholds: { rtoSeconds: 1800, rpoSeconds: 900 },
      commercialReleaseAuthorizedByThisDecision: false,
    });
    expect(drSource.providerInsertedAt).toBe('NOT_CAPTURED');
    expect(Object.hasOwn(drSource, 'backupCompletedAt')).toBe(false);
    expect(targetBindingRules).toMatchObject({
      keyPresenceCollectorId: 'PR12-TARGET-CREDENTIAL-PRESENCE-V1',
      targetSpecificKeyPresenceMustBeCollectorDerived: true,
      fingerprintsMustBeComputedFromTheSameRuntimeValues: true,
      emptyCredentialFingerprintAllowed: false,
    });

    const ledger = readJsonRecord(
      `${evidencePrefix}staging-command-ledger.proposed.json`
    );
    const targetGuard = requireRecord(ledger.targetGuard, 'ledger.targetGuard');
    const ledgerSourceProjectAction = requireRecord(
      requireRecord(ledger.provisioningActions, 'ledger.provisioningActions')
        .sourceProject,
      'ledger.provisioningActions.sourceProject'
    );
    const commands = requireArray(ledger.commands, 'ledger.commands');
    expect(ledger.status).toBe('PROPOSED_NOT_EXECUTABLE');
    expect(ledger.executionAuthorized).toBe(false);
    expect(targetGuard).toMatchObject({
      status: 'NOT_IMPLEMENTED',
      requiredForEveryRemoteCommand: true,
      prohibitedProjectRefs: ['qnanuoqveidwvacvbhqp'],
    });
    expect(commands.length).toBe(35);
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
    expect(
      commands.every((command, index) => {
        const entry = requireRecord(
          command,
          `ledger.commands[${String(index)}]`
        );
        return (
          typeof entry.remoteContact === 'boolean' &&
          typeof entry.mutating === 'boolean' &&
          typeof entry.mutationScope === 'string' &&
          allowedMutationScopes.has(entry.mutationScope) &&
          (entry.mutating
            ? entry.mutationScope !== 'NONE'
            : entry.mutationScope === 'NONE')
        );
      })
    ).toBe(true);
    const remoteCommands = commands
      .map((command, index) =>
        requireRecord(command, `ledger.commands[${String(index)}]`)
      )
      .filter(command => command.remoteContact === true);
    expect(remoteCommands.length).toBeGreaterThan(0);
    expect(
      remoteCommands.every(
        command =>
          command.redactedCommand === 'NOT_IMPLEMENTED' &&
          command.authorizedNow === false
      )
    ).toBe(true);
    const commandIds = commands.map((command, index) =>
      String(requireRecord(command, `ledger.commands[${String(index)}]`).id)
    );
    expect(commandIds).toEqual([
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
    ]);
    expect(remoteCommands[0]?.id).toBe('PR12-CMD-004A');
    expect(commandIds.indexOf('PR12-CMD-007')).toBeLessThan(
      commandIds.indexOf('PR12-CMD-007A')
    );
    expect(commandIds.indexOf('PR12-CMD-007A')).toBeLessThan(
      commandIds.indexOf('PR12-CMD-008A')
    );
    expect(commandIds.indexOf('PR12-CMD-008A')).toBeLessThan(
      commandIds.indexOf('PR12-CMD-008B')
    );
    expect(commandIds.indexOf('PR12-CMD-008B')).toBeLessThan(
      commandIds.indexOf('PR12-CMD-008')
    );
    expect(commandIds.indexOf('PR12-CMD-017')).toBeLessThan(
      commandIds.indexOf('PR12-CMD-016A')
    );
    expect(commandIds.indexOf('PR12-CMD-016A')).toBeLessThan(
      commandIds.indexOf('PR12-CMD-017A')
    );
    expect(
      commands
        .map((command, index) =>
          requireRecord(command, `ledger.commands[${String(index)}]`)
        )
        .find(command => command.id === 'PR12-CMD-018')
    ).toMatchObject({
      phase: 'restore_identity',
      remoteContact: true,
      mutating: false,
      mutationScope: 'NONE',
    });

    const provisioning = readJsonRecord(
      `${evidencePrefix}source-project-provisioning-binding.template.json`
    );
    const sourceReplay = readJsonRecord(
      `${evidencePrefix}source-replay-catalog-capture-binding.template.json`
    );
    const sourceBootstrap = readJsonRecord(
      `${evidencePrefix}source-identity-bootstrap-binding.template.json`
    );
    const sourceBootstrapResult = readJsonRecord(
      `${evidencePrefix}source-identity-bootstrap-result.template.json`
    );
    const sourceReplayResult = readJsonRecord(
      `${evidencePrefix}source-replay-catalog-capture-result.template.json`
    );
    const restoreSupplement = readJsonRecord(
      `${evidencePrefix}restore-execution-supplemental-binding.template.json`
    );
    const restoreCreation = readJsonRecord(
      `${evidencePrefix}restore-project-creation-binding.template.json`
    );
    const provisioningAction = requireRecord(
      provisioning.provisioningAction,
      'provisioning.provisioningAction'
    );
    const provisionEnvironment = requireRecord(
      provisioning.environmentProposal,
      'provisioning.environmentProposal'
    );
    expect(ledgerSourceProjectAction).toMatchObject({
      actionId: 'PR12-ACTION-003',
      method: 'OWNER_MANAGEMENT_API_CREATE_PROJECT',
      httpMethod: 'POST',
      endpoint: 'https://api.supabase.com/v1/projects',
      name: provisionEnvironment.projectName,
      plan: 'pro',
      region: provisionEnvironment.region,
      compute: 'large',
      authorizedNow: false,
      requiresSeparateProvisioningBinding: true,
    });
    expect(provisioningAction).toMatchObject({
      actionId: ledgerSourceProjectAction.actionId,
      method: ledgerSourceProjectAction.method,
      httpMethod: ledgerSourceProjectAction.httpMethod,
      endpoint: ledgerSourceProjectAction.endpoint,
      maximumExecutionCount: 1,
      remoteContact: true,
      mutating: true,
      mutationScope: 'SOURCE_PROJECT_CREATION',
    });
    const approvalPacket = readRepositoryFile(
      `${evidencePrefix}staging-execution-approval-packet.yaml`
    );
    expect(approvalPacket).toContain(
      `    action_id: ${String(provisioningAction.actionId)}`
    );
    expect(approvalPacket).toContain(
      `    method: ${String(provisioningAction.method)}`
    );
    expect(approvalPacket).toContain(
      `    endpoint: ${String(provisioningAction.endpoint)}`
    );
    const governanceDigest = fileSha256(
      `${evidencePrefix}staging-execution-approval-packet.yaml`
    );
    for (const [context, value] of [
      ['source execution', binding.governanceProposal],
      ['source provisioning', provisioning.governanceProposal],
      ['source identity bootstrap', sourceBootstrap.governanceProposal],
      ['source replay/catalog capture', sourceReplay.governanceProposal],
    ] as const) {
      const governanceProposal = requireRecord(
        value,
        `${context}.governanceProposal`
      );
      expect(governanceProposal).toEqual({
        path: 'staging-execution-approval-packet.yaml',
        sha256: governanceDigest,
      });
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
    ] as const) {
      expect(Object.keys(requireRecord(owners, `${context}.owners`))).toEqual(
        requiredOwnerFields
      );
    }
    const reviewedProposals = requireRecord(
      binding.reviewedProposals,
      'binding.reviewedProposals'
    );
    const executableBindings = requireRecord(
      binding.bindings,
      'binding.bindings'
    );
    expect(reviewedProposals.securityTargetClassification).toEqual({
      path: 'security-target-classification.proposed.json',
      sha256: fileSha256(
        `${evidencePrefix}security-target-classification.proposed.json`
      ),
    });
    expect(reviewedProposals.securityTargetInventory).toEqual({
      path: 'security-target-inventory.proposed.json',
      sha256: fileSha256(
        `${evidencePrefix}security-target-inventory.proposed.json`
      ),
    });
    expect(reviewedProposals.dataApiAclInventory).toEqual({
      path: 'data-api-acl-inventory.proposed.json',
      sha256: fileSha256(
        `${evidencePrefix}data-api-acl-inventory.proposed.json`
      ),
    });
    expect(executableBindings.securityTargetClassification).toEqual({
      path: 'NOT_CAPTURED',
      sha256: 'NOT_CAPTURED',
    });
    expect(executableBindings.securityTargetInventory).toEqual({
      path: 'NOT_CAPTURED',
      sha256: 'NOT_CAPTURED',
    });
    expect(provisioning.status).toBe('NOT_RUN');
    expect(
      requireRecord(provisioning.authorization, 'provisioning.authorization')
        .sourceProjectProvisioningAuthorized
    ).toBe(false);
    expect(sourceReplay.status).toBe('NOT_RUN');
    expect(sourceBootstrap.status).toBe('NOT_RUN');
    expect(
      requireRecord(
        sourceBootstrap.authorization,
        'sourceBootstrap.authorization'
      )
    ).toMatchObject({
      sourceIdentityConnectionAuthorized: false,
      sourceIdentityCaptureAuthorized: false,
      sourceLinkAuthorized: false,
      cleanMigrationReplayAuthorized: false,
    });
    expect(sourceBootstrap.approvedCommandIds).toEqual([
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
    ]);
    expect(sourceBootstrapResult).toMatchObject({
      status: 'NOT_RUN',
      commandId: 'PR12-CMD-004A',
    });
    expect(
      requireRecord(sourceReplay.authorization, 'sourceReplay.authorization')
    ).toMatchObject({
      isolatedStagingConnectionAuthorized: false,
      cleanMigrationReplayAuthorized: false,
      postReplayCatalogCaptureAuthorized: false,
      representativeSeedAuthorized: false,
      fullQualificationAuthorized: false,
    });
    expect(sourceReplay.approvedCommandIds).toEqual([
      'PR12-CMD-003',
      'PR12-CMD-004',
      'PR12-CMD-005',
      'PR12-CMD-006',
      'PR12-CMD-007',
      'PR12-CMD-007A',
      'PR12-CMD-008A',
    ]);
    expect(sourceReplayResult).toMatchObject({
      status: 'NOT_RUN',
      catalogCaptureCommandId: 'PR12-CMD-007A',
      catalogCapture: { path: 'NOT_CAPTURED', sha256: 'NOT_CAPTURED' },
    });
    expect(restoreCreation.status).toBe('NOT_RUN');
    expect(
      requireRecord(
        restoreCreation.authorization,
        'restoreCreation.authorization'
      ).restoreProjectCreationAuthorized
    ).toBe(false);
    expect(restoreSupplement.status).toBe('NOT_RUN');
    expect(restoreSupplement.restoreEnvironment).not.toHaveProperty(
      'systemIdentifier'
    );
    expect(
      restoreSupplement.firstSupplementalIdentityAndClockCommand
    ).toMatchObject({
      commandId: 'PR12-CMD-018',
      resultType: 'RESTORE_IDENTITY_CLOCK_OPERATION',
      status: 'NOT_RUN',
      mutating: false,
      mutationScope: 'NONE',
      requiredCapturedFields: [
        'restore project ref',
        'project URL',
        'direct database host and user',
        'database version',
        'database system identifier',
        'restore database clock_timestamp() UTC',
        'command start/end UTC',
        'stdout/stderr SHA-256',
      ],
    });
  });

  it('freezes typed DR excluded and manual scope provenance without credential values', () => {
    const evidencePrefix =
      'docs/stabilization/evidence/commercial-hardening/pr12/';
    const projection = readJsonRecord(
      `${evidencePrefix}dr-platform-config-projection-contract-v1.json`
    );
    expect(projection.status).toBe('PROPOSED_OWNER_APPROVAL_REQUIRED');
    expect(projection.officialOpenApi).toEqual({
      url: 'https://api.supabase.com/api/v1-json',
      capturedAt: '2026-07-22T00:00:00+09:00',
      sha256:
        '7825629c7e6deb1c87e6bef4689a59c30ff1dd7be280d7053ae8497bda48da7d',
      revalidationRequiredImmediatelyBeforeApproval: true,
      driftDisposition: 'ABORT_AND_REVIEW_BEFORE_REMOTE_EXECUTION',
    });
    const collectors = requireRecord(
      projection.inventoryCollectors,
      'projection.inventoryCollectors'
    );
    const managementLists = requireRecord(
      collectors.managementApiLists,
      'projection.managementApiLists'
    );
    expect(Object.keys(managementLists)).toEqual([
      'storageBuckets',
      'edgeFunctions',
    ]);
    const dashboard = requireRecord(
      collectors.dashboardReadReplicas,
      'projection.dashboardReadReplicas'
    );
    expect(dashboard).toMatchObject({
      captureMethod: 'SUPABASE_DASHBOARD_SETTINGS_EXPORT',
      pageId: 'DATABASE_READ_REPLICAS',
      passCondition: 'NO_READ_REPLICA_PROJECT_REFS',
      persistRawSnapshot: false,
    });
    const databaseCatalog = requireRecord(
      collectors.databaseCatalog,
      'projection.databaseCatalog'
    );
    expect(databaseCatalog.querySetId).toBe('PR12-DR-DATABASE-CATALOG-V1');
    expect(
      requireArray(databaseCatalog.queries, 'projection database queries').map(
        (value, index) =>
          requireRecord(value, `projection query ${String(index)}`).id
      )
    ).toEqual([
      'storage_bucket_row_count',
      'storage_object_metadata_row_count',
      'custom_roles_requiring_passwords',
      'extension_catalog',
      'normalized_database_settings',
      'realtime_publication_tables',
    ]);
    expect(databaseCatalog).toMatchObject({
      rawQueryOutputPersistence: 'HASH_ONLY',
      secretValuesCaptured: false,
    });

    const scopeTemplate = readJsonRecord(
      `${evidencePrefix}dr-excluded-manual-scope-raw-evidence.template.json`
    );
    expect(scopeTemplate).toMatchObject({
      status: 'NOT_RUN',
      credentialValuesCaptured: false,
      secretValuesCaptured: false,
      credentialProviderConfiguration: {
        path: 'NOT_CAPTURED',
        sha256: 'NOT_CAPTURED',
      },
    });
    expect(Object.hasOwn(scopeTemplate, 'targetSpecificApiKeysPresent')).toBe(
      false
    );
    for (const target of ['source', 'restore'] as const) {
      const credentialConfiguration = readJsonRecord(
        `${evidencePrefix}${target}-credential-provider-configuration.template.json`
      );
      expect(
        requireRecord(
          credentialConfiguration.keyPresenceCollector,
          `${target} credential key presence collector`
        )
      ).toMatchObject({
        collectorId: 'PR12-TARGET-CREDENTIAL-PRESENCE-V1',
        method: 'TARGET_PREFIXED_PROCESS_ENVIRONMENT_NON_EMPTY_SHA256',
        status: 'NOT_CAPTURED',
        anonKeyPresent: false,
        serviceRoleKeyPresent: false,
        fingerprintsComputedFromSameRuntimeValues: false,
        emptyStringFingerprintRejected: false,
        rawValuesPersisted: false,
      });
    }
    const sourceSideEffects = readJsonRecord(
      `${evidencePrefix}source-external-side-effect-inventory-result.template.json`
    );
    const restoreSideEffects = readJsonRecord(
      `${evidencePrefix}post-restore-side-effect-result.template.json`
    );
    for (const value of [sourceSideEffects, restoreSideEffects]) {
      expect(value.drScopeInventory).toEqual({
        path: 'NOT_CAPTURED',
        sha256: 'NOT_CAPTURED',
      });
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
      'toolBinaries',
      'clientResponseExposureAllowed',
      'logExposureAllowed',
      'startedAt',
      'endedAt',
      'redactedCommand',
      'stdoutSha256',
      'stderrSha256',
      'rowCounts',
      'logicalHash',
      'historicalNormalizedPhysicalHash',
      'environmentPhysicalStructureHash',
      'integrityResults',
      'drScopeInventory',
      'commercialReleaseOwner',
      'databaseMigrationOperator',
      'disasterRecoveryOperator',
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
      'sampleResults',
      'pooledResult',
      'backup',
      'postRestore',
      'securityMatrix',
      'defaultPrivileges',
      'schemaUsage',
      'aclVerdict',
      'rlsVerdict',
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
      'manualReviewStatus',
      'machineScanEvidence',
      'approvalPacketPath',
      'rtoStartEvent',
      'rtoEndEvent',
      'rpoWatermarkDefinition',
      'rtoSeconds',
      'rpoSeconds',
      'creationApprovalPath',
      'mutationCommandIds',
      'canonicalObservation',
      'migrationReplay',
      'sampleIds',
      'tenantProbeControl',
    ]) {
      expect(serialized).toContain(field);
    }
    const scanner = readRepositoryFile(
      'scripts/commercial-hardening/scan-pr12-evidence.mjs'
    );
    expect(scanner).toContain(
      'docs/stabilization/pr12-staging-execution-owner-approval-packet-v0.2-20260719.md'
    );
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

  it('detects Supabase management tokens and quoted JSON passwords without printing values', () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-secret-rules-')
    );
    const managementToken = `sbp_${'syntheticvalue'.repeat(3)}`;
    const databasePassword = 'synthetic-password-value-never-print';
    const wireDatabasePassword = 'synthetic-db-pass-value-never-print';
    const smtpPassword = 'synthetic-smtp-pass-value-never-print';
    try {
      const evidencePath = path.join(temporaryDirectory, 'secret.json');
      fs.writeFileSync(
        evidencePath,
        JSON.stringify({
          token: managementToken,
          databasePassword,
          db_pass: wireDatabasePassword,
          smtp_pass: smtpPassword,
        }),
        'utf8'
      );
      const result = runNodeScript(
        'scripts/commercial-hardening/scan-pr12-evidence.mjs',
        ['--path', evidencePath]
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain('supabase-management-access-token');
      expect(result.output).toContain('json-password-assignment');
      expect(result.output).not.toContain(managementToken);
      expect(result.output).not.toContain(databasePassword);
      expect(result.output).not.toContain(wireDatabasePassword);
      expect(result.output).not.toContain(smtpPassword);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('allows unresolved/redacted password sentinels and PR12 parent-variable mappings', () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-secret-sentinels-')
    );
    try {
      const evidencePath = path.join(temporaryDirectory, 'sentinels.json');
      fs.writeFileSync(
        evidencePath,
        JSON.stringify({
          password: 'NOT_CAPTURED',
          databasePassword: 'UNASSIGNED',
          pgpassword: 'REDACTED',
          db_password: '<owner-secret-store>',
          PGPASSWORD: 'PR12_SOURCE_PGPASSWORD',
        }),
        'utf8'
      );
      const result = runNodeScript(
        'scripts/commercial-hardening/scan-pr12-evidence.mjs',
        ['--path', evidencePath]
      );
      expect(result.status).toBe(0);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('rejects an unmanifested file in qualification-scanner mode', () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-scanner-closure-')
    );
    try {
      const write = (filename: string, value: string) => {
        const absolutePath = path.join(temporaryDirectory, filename);
        fs.writeFileSync(absolutePath, value, 'utf8');
        const bytes = fs.readFileSync(absolutePath);
        return {
          path: filename,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          classification: 'PUBLIC_SANITIZED',
        };
      };
      const artifacts = [
        write('evidence.txt', 'synthetic safe evidence\n'),
        write('machine-scan.json', ''),
        write('machine-scan.stderr.txt', ''),
      ];
      const manifestPath = path.join(temporaryDirectory, 'manifest.json');
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          artifacts,
          commands: [
            {
              id: 'PR12-CMD-020',
              stdoutPath: 'machine-scan.json',
              stderrPath: 'machine-scan.stderr.txt',
            },
          ],
          privacyScan: { machineScanCommandId: 'PR12-CMD-020' },
        }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(temporaryDirectory, 'unmanifested.txt'),
        'synthetic unlisted output\n',
        'utf8'
      );
      const result = runNodeScript(
        'scripts/commercial-hardening/scan-pr12-evidence.mjs',
        ['--manifest', manifestPath]
      );
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'evidence directory is not manifest-closed'
      );
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
