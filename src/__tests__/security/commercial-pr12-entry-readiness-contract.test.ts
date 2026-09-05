/** @jest-environment node */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');

const CLOSURE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr11/dense-phase-a2-closure-20260719.yaml';
const ENTRY_GATE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr12/pr11-performance-entry-gate.yaml';
const HANDOFF_PATH =
  'docs/stabilization/pr12-entry-readiness-handoff-v0.1-20260719.md';
const REPORT_PATH =
  'docs/stabilization/report-pr11-dense-phase-a2-environment-validity-v0.1-20260719.md';
const WAIVER_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr11/pilot-performance-waiver.yaml';
const PR11_README_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr11/README.md';
const PR11_SPEC_PATH =
  'docs/stabilization/spec-commercial-performance-safe-indexes-rls-plan-v1.0.md';
const CHANGE_DOD_PATH = 'docs/quality/change-dod-v1.0.md';
const COMMERCIAL_QUALIFICATION_PATH =
  'docs/releases/commercial-release-qualification-v1.0.md';
const MASTER_PR12_SPEC_PATH =
  'docs/stabilization/spec-commercial-hardening-migration-v1.0.md';
const QUARANTINED_EVIDENCE_PATH =
  '/docs/stabilization/evidence/commercial-hardening/pr11/dense-phase-a2-environment-20260719-01/';
const EVIDENCE_BASE = 'docs/stabilization/evidence/commercial-hardening/pr11';
const EVIDENCE_COMMIT_SHA = '25a983e6f39a02855667f9e943523f7cb4aa40ee';
const EVIDENCE_ATTRIBUTE_LINES = [
  `${EVIDENCE_BASE}/dense-phase-a2-environment-20260719-02/** -text -whitespace`,
  `${EVIDENCE_BASE}/dense-phase-a2-environment-20260719-03/** -text -whitespace`,
] as const;

const frozenTrackedInputs = new Map([
  [
    WAIVER_PATH,
    '85d3da719047b6af80b77026c7ca6d7172319f140aad6099331d86a38698f622',
  ],
  [
    PR11_README_PATH,
    'fee22f982f6a8bf81a09de230afc2691dc8a5f709cd7a033a1486103081d86ee',
  ],
  [
    PR11_SPEC_PATH,
    '89e552094e16fd750410d81d42d81bb0efd26703bc8b49af3a42ea7a09cc7ac5',
  ],
]);

const frozenPhaseA2Sources = new Map([
  [
    REPORT_PATH,
    'c38e04c3771b206b322c96e89f031aaf844e56281be04660b12f162452a816fe',
  ],
  [
    'docs/stabilization/spec-commercial-pr11-dense-phase-a2-attribution-v1.0.md',
    'ede00bb70cec99e6f9f44c6bea49c7f8298c4c0a32abc80b3e34f18f52e7a87a',
  ],
  [
    'scripts/commercial-hardening/collect-pr11-phase-a2-host-telemetry.ps1',
    '730310ba95ffdd997ca723395d56e20345807e5a6147564610cb41cf25b17eb3',
  ],
  [
    'scripts/commercial-hardening/run-pr11-dense-phase-a2-environment.mjs',
    '40149ee63bff590f73fa867408ae2bbaa40a508bc9510d3e1edbf16d5e2b5c27',
  ],
  [
    'scripts/commercial-hardening/sql/pr11-phase-a2-environment-preflight.sql',
    'bb9959c54664eedff7876a2f5b4d659ebe4e41382c1d672d427caaf11925fa30',
  ],
  [
    'src/__tests__/security/commercial-pr11-dense-phase-a2-environment-contract.test.ts',
    'f62b5365a55bf4a248f3516a1f54fddcd04644d9a539303bbb06ab5e27727964',
  ],
]);

type EvidencePacket = Readonly<{
  suffix: '02' | '03';
  manifestSha256: string;
  frozenGatesSha256: string;
  resultSha256: string;
}>;

const evidencePackets: readonly EvidencePacket[] = [
  {
    suffix: '02',
    manifestSha256:
      '3eb0e2eca7b22ce0c0f02ba457cdcdf7fc3cc0f640e09b017a7abd668cc4a087',
    frozenGatesSha256:
      'bcae3229aaee165751585e53c656cdb9e1ca1e9fd3369a55b3595404444e5e5c',
    resultSha256:
      '89c304bf71d4122d6d87d8ee65207f74fd4df1c2029d0e2a073b081082823547',
  },
  {
    suffix: '03',
    manifestSha256:
      '878b93bc8b8f5e64a65d71aa739b6e2ab755a86c41b96cceab141f8ff29fd77b',
    frozenGatesSha256:
      '15b997f726d06260d58a2219a39f369dcb505d0507524cac0db73b86acfc8cf7',
    resultSha256:
      'bf080640ae06ae30e2cd851ee47f57e343eafcd80ccdf7d0b880b1a0e373a721',
  },
];

const PACKAGE_MANIFEST_SHA256 =
  'dc8016c11de7fcb8b94dd5dc933cdd87ffd9ec25cc82a05e13298d8d8fa1a2c8';
const RESULT_YAML_SHA256 =
  'e22fe7a41237cf3ce58f13498c6282ef9ec622be4e9ce5dcbda9388863dc7716';
const LOGICAL_HASH =
  'c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78';
const PHYSICAL_HASH =
  '94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86';
const ALLOWED_STATUSES = new Set([
  'PASS',
  'FAIL',
  'NOT_RUN',
  'PASS_WITH_RISK',
  'NOT_APPLICABLE',
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

  return value as unknown[];
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${context} must be a string`);
  }

  return value;
}

function requireNumber(value: unknown, context: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`${context} must be a number`);
  }

  return value;
}

function requireBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${context} must be a boolean`);
  }

  return value;
}

function readJsonRecord(relativePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readRepositoryFile(relativePath));
  return requireRecord(parsed, relativePath);
}

function listFilesRecursively(relativeDirectory: string): string[] {
  const root = repositoryPath(relativeDirectory);
  const files: string[] = [];

  function visit(absoluteDirectory: string, relativePrefix: string): void {
    for (const entry of fs.readdirSync(absoluteDirectory, {
      withFileTypes: true,
    })) {
      const relativeEntry = relativePrefix
        ? `${relativePrefix}/${entry.name}`
        : entry.name;
      const absoluteEntry = path.join(absoluteDirectory, entry.name);

      if (entry.isDirectory()) {
        visit(absoluteEntry, relativeEntry);
      } else if (entry.isFile()) {
        files.push(relativeEntry);
      }
    }
  }

  visit(root, '');
  return files.sort((left, right) => left.localeCompare(right));
}

function topLevelYamlScalar(source: string, key: string): string[] {
  const pattern = new RegExp(`^${key}:\\s+([^\\r\\n]+)$`, 'gm');
  return [...source.matchAll(pattern)].map(match => match[1].trim());
}

function assertAllowedYamlStatuses(source: string): void {
  const statuses = [...source.matchAll(/^\s*status:\s+([A-Z_]+)\s*$/gm)].map(
    match => match[1]
  );

  expect(statuses.length).toBeGreaterThan(0);
  for (const status of statuses) {
    expect(ALLOWED_STATUSES.has(status)).toBe(true);
  }
}

function packetBase(suffix: EvidencePacket['suffix']): string {
  return `${EVIDENCE_BASE}/dense-phase-a2-environment-20260719-${suffix}`;
}

function verifyEvidencePacket(packet: EvidencePacket): void {
  const base = packetBase(packet.suffix);
  const packageManifestPath = `${base}/package-manifest.json`;
  const manifestPath = `${base}/manifest.json`;
  const resultPath = `${base}/phase-a2-result.json`;
  const resultYamlPath = `${base}/phase-a2-result.yaml`;
  const frozenGatesPath = `${base}/frozen-phase-a2-gates.json`;

  expect(fileSha256(packageManifestPath)).toBe(PACKAGE_MANIFEST_SHA256);
  expect(fileSha256(manifestPath)).toBe(packet.manifestSha256);
  expect(fileSha256(resultPath)).toBe(packet.resultSha256);
  expect(fileSha256(resultYamlPath)).toBe(RESULT_YAML_SHA256);
  expect(fileSha256(frozenGatesPath)).toBe(packet.frozenGatesSha256);

  const packageManifest = readJsonRecord(packageManifestPath);
  expect(packageManifest.kind).toBe(
    'pr11_phase_a2_self_contained_input_package'
  );
  expect(packageManifest.phaseAInputCount).toBe(24);
  const packageEntries = requireArray(
    packageManifest.files,
    `${packageManifestPath}.files`
  );
  expect(packageEntries).toHaveLength(37);

  const listedPackageFiles: string[] = [];
  for (const [index, unknownEntry] of packageEntries.entries()) {
    const entry = requireRecord(
      unknownEntry,
      `${packageManifestPath}.files[${index}]`
    );
    const listedPath = requireString(
      entry.path,
      `${packageManifestPath}.files[${index}].path`
    );
    const expectedBytes = requireNumber(
      entry.bytes,
      `${packageManifestPath}.files[${index}].bytes`
    );
    const expectedSha256 = requireString(
      entry.sha256,
      `${packageManifestPath}.files[${index}].sha256`
    );

    expect(path.isAbsolute(listedPath)).toBe(false);
    expect(listedPath.split('/')).not.toContain('..');
    const packagedPath = `${base}/input-package/${listedPath}`;
    expect(fs.statSync(repositoryPath(packagedPath)).size).toBe(expectedBytes);
    expect(fileSha256(packagedPath)).toBe(expectedSha256);
    listedPackageFiles.push(listedPath);
  }

  expect(new Set(listedPackageFiles).size).toBe(37);
  expect(listFilesRecursively(`${base}/input-package`)).toEqual(
    [...listedPackageFiles].sort((left, right) => left.localeCompare(right))
  );

  const manifest = readJsonRecord(manifestPath);
  expect(manifest.protocol).toBe('pr11-dense-phase-a2-environment-validity-v1');
  expect(manifest.status).toBe('environment-invalid');
  const steps = requireArray(manifest.steps, `${manifestPath}.steps`);
  expect(steps).toHaveLength(42);

  const listedStreams: string[] = [];
  for (const [index, unknownStep] of steps.entries()) {
    const step = requireRecord(unknownStep, `${manifestPath}.steps[${index}]`);
    expect(requireNumber(step.exitCode, `step ${index} exitCode`)).toBe(0);

    for (const streamName of ['stdout', 'stderr'] as const) {
      const streamFile = requireString(
        step[`${streamName}File`],
        `step ${index} ${streamName}File`
      );
      const streamSha256 = requireString(
        step[`${streamName}Sha256`],
        `step ${index} ${streamName}Sha256`
      );
      expect(path.isAbsolute(streamFile)).toBe(false);
      expect(streamFile.split('/')).not.toContain('..');
      expect(fileSha256(`${base}/${streamFile}`)).toBe(streamSha256);
      listedStreams.push(streamFile);
    }
  }

  expect(listedStreams).toHaveLength(84);
  expect(new Set(listedStreams).size).toBe(84);
  expect(
    listFilesRecursively(base).filter(
      relativePath =>
        !relativePath.startsWith('input-package/') &&
        relativePath.endsWith('.raw')
    )
  ).toEqual(
    [...listedStreams].sort((left, right) => left.localeCompare(right))
  );

  const result = readJsonRecord(resultPath);
  expect(result.releaseDecision).toBe('FAIL_STOP');
  expect(result.environmentValidity).toBe('ENVIRONMENT_INVALID');
  expect(result.phaseAOriginalResult).toBe('FAIL');
  expect(result.candidateUnderPhaseAProtocol).toBe('REJECTED');
  expect(result.steadyStateIndexEffect).toBe('NOT_PROVEN');
  expect(result.d1CurrentAA).toBe('NOT_RUN');
  expect(result.d2FourArm).toBe('NOT_RUN');
  expect(result.d3CommittedAB).toBe('NOT_AUTHORIZED');
  expect(
    requireNumber(result.candidateSqlExecutionCount, 'candidate SQL count')
  ).toBe(0);
  expect(requireBoolean(result.permanentDdlApplied, 'permanent DDL')).toBe(
    false
  );
  expect(result.logicalHash).toBe(LOGICAL_HASH);
  expect(result.physicalHash).toBe(PHYSICAL_HASH);
}

describe('commercial PR-12 entry readiness and PR-11 Phase A2 closure', () => {
  it('ships separate closure, entry-gate, handoff, and report records', () => {
    for (const requiredPath of [
      CLOSURE_PATH,
      ENTRY_GATE_PATH,
      HANDOFF_PATH,
      REPORT_PATH,
    ]) {
      expect(fs.existsSync(repositoryPath(requiredPath))).toBe(true);
    }
  });

  it('quarantines the identifier-bearing local attempt by one exact rule', () => {
    const gitignore = readRepositoryFile('.gitignore');
    const gitAttributes = readRepositoryFile('.gitattributes');
    const exactRules = gitignore
      .split(/\r?\n/u)
      .filter(line => line === QUARANTINED_EVIDENCE_PATH);

    expect(exactRules).toHaveLength(1);
    expect(gitignore).toContain('PR-11 Phase A2 local-only quarantine');

    for (const attributeLine of EVIDENCE_ATTRIBUTE_LINES) {
      expect(
        gitAttributes.split(/\r?\n/u).filter(line => line === attributeLine)
      ).toHaveLength(1);
    }
  });

  it('preserves and pins all merged and Phase A2 source inputs', () => {
    const closure = readRepositoryFile(CLOSURE_PATH);

    for (const frozenInputs of [frozenTrackedInputs, frozenPhaseA2Sources]) {
      for (const [relativePath, expectedSha256] of frozenInputs) {
        expect(fileSha256(relativePath)).toBe(expectedSha256);
        expect(closure).toContain(`path: ${relativePath}`);
        expect(closure).toContain(`sha256: ${expectedSha256}`);
      }
    }
  });

  it('re-hashes both sanitized packets, all 37 inputs, and all 84 streams', () => {
    const closure = readRepositoryFile(CLOSURE_PATH);

    for (const packet of evidencePackets) {
      verifyEvidencePacket(packet);
      expect(closure).toContain(
        `directory: dense-phase-a2-environment-20260719-${packet.suffix}`
      );
      expect(closure).toContain(`manifest_sha256: ${packet.manifestSha256}`);
      expect(closure).toContain(
        `frozen_gates_sha256: ${packet.frozenGatesSha256}`
      );
      expect(closure).toContain(`result_sha256: ${packet.resultSha256}`);
    }

    expect(closure.match(/package_entry_count: 37/gu)).toHaveLength(2);
    expect(closure.match(/collection_step_count: 42/gu)).toHaveLength(2);
    expect(closure.match(/stream_count: 84/gu)).toHaveLength(2);
    expect(
      closure.match(/nonzero_collection_step_exit_count: 0/gu)
    ).toHaveLength(2);
    expect(
      closure.match(
        new RegExp(`package_manifest_sha256: ${PACKAGE_MANIFEST_SHA256}`, 'gu')
      )
    ).toHaveLength(2);
    expect(
      closure.match(
        new RegExp(`result_yaml_sha256: ${RESULT_YAML_SHA256}`, 'gu')
      )
    ).toHaveLength(2);
  });

  it('binds the approved closure without rewriting failed outcomes', () => {
    const closure = readRepositoryFile(CLOSURE_PATH);
    const report = readRepositoryFile(REPORT_PATH);

    expect(topLevelYamlScalar(closure, 'status')).toEqual(['PASS_WITH_RISK']);
    expect(topLevelYamlScalar(closure, 'blocking')).toEqual(['false']);
    assertAllowedYamlStatuses(closure);

    for (const requiredFact of [
      `commit: ${EVIDENCE_COMMIT_SHA}`,
      'source_commit: aaf3837f6f8053b0379a2d4caea65880952ce027',
      'owner: product_owner',
      'approved_by: product_owner',
      "approved_at: '2026-07-19'",
      "expires_at: '2026-08-18T23:59:59+09:00'",
      'mitigation: collect_durable_restoration_evidence_in_pr12_isolated_staging',
      'closure_record_state: READY_FOR_REVIEW',
      'worktree_evidence_integrity_result: PASS',
      'committed_evidence_integrity_result: PASS',
      'public_push_authorized: true',
      'owner_publication_review_required: false',
      'owner_publication_review_status: PASS',
      'owner_publication_approved_by: product_owner',
      "owner_publication_approved_at: '2026-07-19'",
      'evidence_classification: manual_observation',
      'dedicated_raw_artifact_present: false',
      'machine_replayable: false',
      'review_required_before_closure_pass: false',
      'closure_acceptance_status: PASS_WITH_RISK',
      'closure_acceptance_scope: phase_a2_closure_only',
      'closure_acceptance_approved_by: product_owner',
      "closure_acceptance_approved_at: '2026-07-19'",
      "closure_acceptance_expires_at: '2026-08-18T23:59:59+09:00'",
      'closure_acceptance_mitigation: collect_durable_restoration_evidence_in_pr12_isolated_staging',
      'inherited_by_pr12_isolated_staging: false',
      'inherited_by_commercial_release: false',
      'durable_evidence_required_before_pr12_staging_qualification_pass: true',
      'decision_boundary: phase_a2_evidence_closure_only',
      'closure_outcome: CLOSED_ENVIRONMENT_INVALID',
      'not_a_waiver: true',
      'proposed_disposition: TRANSFER_QUALIFICATION_TO_PR12_ISOLATED_STAGING',
      'release_decision: FAIL_STOP',
      'environment_validity: ENVIRONMENT_INVALID',
      'candidate_sql_execution_count: 0',
      'permanent_ddl_applied: false',
      'd1_current_a_a: NOT_RUN',
      'd2_four_arm: NOT_RUN',
      'd3_committed_a_b: NOT_AUTHORIZED',
      'steady_state_index_effect: NOT_PROVEN',
      'singleton_index_retirement_under_phase_a_protocol: REJECTED',
      'singleton_index_state: PRESENT',
      'closure_pr_creation_authorized: true',
      'closure_pr_ready_authorized_after_all_gates: true',
      'closure_pr_merge_authorized: false',
      'closure_pr_merge_actor: human_only',
      'pr12_draft_preparation_eligible: true',
      'pr12_draft_pr_creation_eligible: false',
      'evidence:',
    ]) {
      expect(closure).toContain(requiredFact);
    }

    expect(closure).not.toMatch(/^\s+draft_preparation_eligible:/mu);
    expect(closure).not.toMatch(/^\s+draft_pr_creation_eligible:/mu);

    expect(report).toContain('release_decision: FAIL_STOP');
    expect(report).toContain('environment_validity: ENVIRONMENT_INVALID');
    expect(report).toContain(
      '## Requested PR-12 preparation boundary (2026-07-19)'
    );
    expect(report).toContain(
      'creation of the Phase A2 closure Draft PR is authorized'
    );
    expect(report).toMatch(
      /The product\s+owner completed and approved that metadata review/u
    );
    expect(report).toMatch(/closure-only\s+`PASS_WITH_RISK`/u);
    expect(report).toContain(
      'The publication decision does not authorize merge of the Phase A2 closure PR'
    );
  });

  it('allows planning but blocks staging, merge, release, and waiver inheritance', () => {
    const entryGate = readRepositoryFile(ENTRY_GATE_PATH);
    const handoff = readRepositoryFile(HANDOFF_PATH);

    for (const qualificationSource of [
      CHANGE_DOD_PATH,
      COMMERCIAL_QUALIFICATION_PATH,
      MASTER_PR12_SPEC_PATH,
    ]) {
      expect(fs.existsSync(repositoryPath(qualificationSource))).toBe(true);
      expect(entryGate).toContain(qualificationSource);
    }

    expect(topLevelYamlScalar(entryGate, 'status')).toEqual(['NOT_RUN']);
    expect(topLevelYamlScalar(entryGate, 'blocking')).toEqual(['true']);
    assertAllowedYamlStatuses(entryGate);

    for (const requiredBoundary of [
      'commit: NOT_CAPTURED',
      'source_commit: aaf3837f6f8053b0379a2d4caea65880952ce027',
      'owner: UNASSIGNED',
      'approved_by: UNASSIGNED',
      'evidence: []',
      'source_evidence:',
      'required_blocking_gate_families:',
      'all_blocking_gates_must_pass: true',
      'inherited_by_pr12: false',
      'phase_a2_closure_manual_observation_risk_scope: phase_a2_closure_only',
      'phase_a2_closure_manual_observation_risk_inherited_by_pr12: false',
      'phase_a2_closure_manual_observation_risk_inherited_by_release: false',
      'pr12_planning_eligible: true',
      'pr12_draft_preparation_eligible: true',
      'pr12_draft_pr_creation_eligible: false',
      'isolated_staging_authorized: false',
      'pr12_merge_eligible: false',
      'production_apply_authorized: false',
      'general_commercial_release_eligible: false',
      'index_retirement_authorized: false',
      'current_gate_status_refresh: NOT_RUN',
      'Data API enabled state, exposed schemas, and automatic-grants setting are recorded',
      'default privileges for postgres and supabase_admin are recorded',
      'relation, column, sequence, and function privileges are inventoried for anon, authenticated, and service_role',
      'service_role credential storage, server-only use, and non-exposure boundaries are recorded',
      'pg_graphql installed version, enabled state, exposed schemas, and introspection setting are recorded',
      'every original canonical PR-11 fixed execution, WAL, plan, and semantic gate passes',
      'GraphQL direct-role, tenant, column-field visibility, and introspection smoke tests pass',
      'relation-level and column-level allow and deny paths',
      'the credential is absent from browser bundles, client responses, logs, and evidence',
      'RLS remains enabled and policy results pass independently',
    ]) {
      expect(entryGate).toContain(requiredBoundary);
    }

    expect(entryGate).not.toMatch(/^\s+draft_preparation_eligible:/mu);
    expect(entryGate).not.toMatch(/^\s+draft_pr_creation_eligible:/mu);

    for (const gateFamily of [
      'COMM-DB',
      'COMM-TENANT',
      'COMM-AUTH',
      'COMM-API',
      'COMM-BILL',
      'COMM-OPS',
    ]) {
      expect(entryGate).toContain(`- ${gateFamily}`);
      expect(handoff).toContain(`\`${gateFamily}\``);
    }

    for (const requiredSection of [
      '## Decision',
      '## Authority / SSOT',
      '## Frozen facts',
      '## PR-12 entry boundaries',
      '## Isolated staging acceptance',
      '## Abort criteria',
      '## Required owner decisions',
    ]) {
      expect(handoff).toContain(requiredSection);
    }

    expect(handoff).toContain('PR-12 planning: `GO`');
    expect(handoff).toContain(
      'Phase A2 closure Draft PR creation: `AUTHORIZED`'
    );
    expect(handoff).toContain(
      'Phase A2 closure Ready transition: `AUTHORIZED_AFTER_GATES`'
    );
    expect(handoff).toContain('Phase A2 closure merge: `HUMAN_ONLY`');
    expect(handoff).toContain('PR-12 Draft PR creation: `NOT_YET`');
    expect(handoff).toContain('isolated staging execution: `NOT_AUTHORIZED`');
    expect(handoff).toContain('general commercial release: `NO_GO`');
    expect(handoff).toContain(
      'PR-12、staging、production、一般商用releaseへ継承しない'
    );
    expect(handoff).toContain('Data APIへの自動公開を仮定せず');
  });
});
