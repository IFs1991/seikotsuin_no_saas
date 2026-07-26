import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const IMPLEMENTATION_SSOT =
  'docs/stabilization/spec-commercial-hardening-migration-v1.0.md';
const PR12_SPEC =
  'docs/stabilization/spec-commercial-pr12-isolated-release-qualification-v1.0.md';
const PREPARATION_GATE =
  'docs/stabilization/evidence/commercial-hardening/pr12/pr12-preparation-gate.yaml';
const CURRENT_GATE_STATUS = 'docs/releases/current-gate-status.yaml';
const EVIDENCE_DIRECTORY =
  'docs/stabilization/evidence/commercial-hardening/pr12';
const EXPECTED_PR12_SECTION_SHA256 =
  '71fe7972430268396ca405a388e2cdf87b937962f735dfae6af48b2cb1d66b94';
const DATED_ORIGINAL_SHA256 =
  'fb3960ef365f803c718f7e297fd6b49378341c3f7a1b9250828fd64d0b0a40b5';

const EXPECTED_STEPS = [
  'staging clone/isolated project',
  'full migration replay',
  'anonymized/representative data validation',
  'types parity',
  'advisor scan',
  'all role smoke',
  'canary deploy',
  'backup/restore drill',
  'measured RTO/RPO',
  'production change plan',
  'operator approval',
  'production apply',
  'post-deploy verification',
  '24h/72h monitoring review',
];

const EXPECTED_ACCEPTANCE = [
  'restore evidence',
  'tenant isolation after restore',
  'no duplicate external side effects',
  'incident rollback/forward-fix runbook',
  'production sign-off',
];

const CURRENT_ACTION_003_TUPLE = [
  'source-project-provisioning-binding-v5.template.json',
  'source-project-provisioning-credential-configuration-v2.template.json',
  'source-project-provisioning-owner-approval-v4.template.json',
  'source-project-official-pricing-evidence-v2.template.json',
  'source-project-provisioning-result-v5.template.json',
  'source-project-provider-safe-projection-v4.template.json',
];

const SUPERSEDED_ACTION_003_TEMPLATES = [
  'source-project-provisioning-binding-v2.template.json',
  'source-project-provisioning-binding-v3.template.json',
  'source-project-provisioning-binding-v4.template.json',
  'source-project-provisioning-result-v2.template.json',
  'source-project-provisioning-result-v3.template.json',
  'source-project-provisioning-result-v4.template.json',
  'source-project-provisioning-owner-approval.template.json',
  'source-project-provisioning-owner-approval-v2.template.json',
  'source-project-provisioning-owner-approval-v3.template.json',
  'source-project-provider-safe-projection-v2.template.json',
  'source-project-provider-safe-projection-v3.template.json',
  'source-project-provisioning-credential-configuration.template.json',
];

const LEGACY_COMMERCIAL_MANIFEST_TUPLE = [
  'source-project-provisioning-binding.template.json',
  'source-project-provisioning-result.template.json',
  'source-project-provider-export.template.json',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function repositoryPath(repoRoot, relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function readRepositoryFile(repoRoot, relativePath) {
  return readFileSync(repositoryPath(repoRoot, relativePath), 'utf8').replace(
    /\r\n/gu,
    '\n'
  );
}

function extractCanonicalPr12Section(source) {
  const start = source.indexOf(
    '## PR-12: Release qualification, staging migration, DR drill'
  );
  assert(start >= 0, 'canonical PR12 section start is missing');
  const separatorStart = source.indexOf('\n---', start);
  assert(separatorStart >= 0, 'canonical PR12 section terminator is missing');
  return source.slice(start, separatorStart + '\n---'.length).trim();
}

function extractMarkdownList(section, heading, nextHeadingOrTerminator) {
  const start = section.indexOf(heading);
  const end = section.indexOf(nextHeadingOrTerminator, start + heading.length);
  assert(start >= 0 && end >= 0, `cannot extract ${heading}`);
  return section
    .slice(start + heading.length, end)
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^(?:\d+\.|- )/u.test(line))
    .map(line => line.replace(/^(?:\d+\.|- )\s*/u, ''));
}

function extractTraceabilityRows(specification) {
  const startMarker = '<!-- PR12-TRACEABILITY-MATRIX:START -->';
  const endMarker = '<!-- PR12-TRACEABILITY-MATRIX:END -->';
  assert(
    specification.match(/PR12-TRACEABILITY-MATRIX:START/gu)?.length === 1 &&
      specification.match(/PR12-TRACEABILITY-MATRIX:END/gu)?.length === 1,
    'PR12 must contain exactly one traceability matrix'
  );
  const start = specification.indexOf(startMarker);
  const end = specification.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, 'PR12 traceability matrix is malformed');
  return specification
    .slice(start + startMarker.length, end)
    .split('\n')
    .filter(line => /^\|\s+(?:0[1-9]|1[0-4])\s+\|/u.test(line))
    .map(line =>
      line
        .slice(1, -1)
        .split('|')
        .map(cell => cell.trim().replaceAll('`', ''))
    );
}

export function verifyPr12AuthorityArtifactContract(repoRoot) {
  const section = extractCanonicalPr12Section(
    readRepositoryFile(repoRoot, IMPLEMENTATION_SSOT)
  );
  assert(
    createHash('sha256').update(section).digest('hex') ===
      EXPECTED_PR12_SECTION_SHA256,
    'canonical PR12 section SHA-256 drift'
  );
  assert(
    section.includes('### Objective\n\nコード品質を運用品質へ変換する。'),
    'canonical PR12 objective drift'
  );
  assert(
    JSON.stringify(
      extractMarkdownList(section, '### Steps', '### Acceptance')
    ) === JSON.stringify(EXPECTED_STEPS),
    'canonical PR12 ordered steps drift'
  );
  assert(
    JSON.stringify(extractMarkdownList(section, '### Acceptance', '\n---')) ===
      JSON.stringify(EXPECTED_ACCEPTANCE),
    'canonical PR12 Acceptance drift'
  );

  const specification = readRepositoryFile(repoRoot, PR12_SPEC);
  for (const requiredRule of [
    'Purpose, ordered 14 steps, and five Acceptance items',
    EXPECTED_PR12_SECTION_SHA256,
    'Gate and evidence-state semantics',
    'The 54 COMM gate definitions',
    'PR12-specific binding, command, and evidence shape',
    'may tighten but must not remove, reorder, waive, replace, or substitute',
    'BLOCK / NO_GO',
    'before remote contact',
  ]) {
    assert(
      specification.includes(requiredRule),
      `PR12 scoped authority rule is missing: ${requiredRule}`
    );
  }

  const rows = extractTraceabilityRows(specification);
  assert(rows.length === 14, 'PR12 traceability row count drift');
  assert(
    JSON.stringify(rows.map(row => row[0])) ===
      JSON.stringify(
        EXPECTED_STEPS.map((_, index) => String(index + 1).padStart(2, '0'))
      ),
    'PR12 traceability step identifiers drift'
  );
  assert(
    JSON.stringify(rows.map(row => row[1])) === JSON.stringify(EXPECTED_STEPS),
    'PR12 traceability canonical step text drift'
  );
  assert(
    rows.every(row => row.length === 6 && row[3] === 'NOT_RUN'),
    'every canonical PR12 execution must remain NOT_RUN'
  );
  assert(
    rows[0][2] === 'PREREQUISITE_PASS_ONLY' &&
      rows[0][4] === 'NOT_AUTHORIZED' &&
      rows[0][5].includes('PR12-ACTION-002') &&
      rows[0][5].includes('PR12-ACTION-003'),
    'ACTION-002 must remain prerequisite-only and must not authorize Action-003'
  );
  assert(
    rows[11][2] === 'NOT_IMPLEMENTED' &&
      rows[11][4] === 'NOT_AUTHORIZED' &&
      rows[11][5].includes('independent production approval'),
    'production apply must remain unimplemented and unauthorized'
  );
  const matrixStart = specification.indexOf(
    '<!-- PR12-TRACEABILITY-MATRIX:START -->'
  );
  const matrixEnd = specification.indexOf(
    '<!-- PR12-TRACEABILITY-MATRIX:END -->',
    matrixStart
  );
  const matrix = specification.slice(matrixStart, matrixEnd);
  const firstColumnValues = matrix
    .split('\n')
    .filter(line => line.startsWith('|'))
    .map(line => line.split('|')[1]?.trim());
  for (const acceptance of EXPECTED_ACCEPTANCE) {
    assert(
      firstColumnValues.includes(acceptance),
      `PR12 Acceptance mapping is missing: ${acceptance}`
    );
  }

  for (const relativePath of [PREPARATION_GATE, CURRENT_GATE_STATUS]) {
    const snapshot = readRepositoryFile(repoRoot, relativePath);
    assert(
      snapshot.includes(`implementation_ssot: ${IMPLEMENTATION_SSOT}`) &&
        snapshot.includes(
          `pr12_section_sha256: ${EXPECTED_PR12_SECTION_SHA256}`
        ) &&
        snapshot.includes(`dated_original_sha256: ${DATED_ORIGINAL_SHA256}`) &&
        !snapshot.includes('canonical_steps:') &&
        !snapshot.includes('acceptance_items:'),
      `${relativePath} must pin canonical PR12 authority without redefining it`
    );
  }

  for (const current of CURRENT_ACTION_003_TUPLE) {
    assert(
      existsSync(repositoryPath(repoRoot, `${EVIDENCE_DIRECTORY}/${current}`)),
      `current Action-003 artifact missing: ${current}`
    );
  }
  for (const superseded of SUPERSEDED_ACTION_003_TEMPLATES) {
    assert(
      !existsSync(
        repositoryPath(repoRoot, `${EVIDENCE_DIRECTORY}/${superseded}`)
      ),
      `superseded Action-003 artifact must be absent: ${superseded}`
    );
  }
  for (const legacy of LEGACY_COMMERCIAL_MANIFEST_TUPLE) {
    assert(
      existsSync(repositoryPath(repoRoot, `${EVIDENCE_DIRECTORY}/${legacy}`)),
      `legacy commercial-manifest compatibility artifact missing: ${legacy}`
    );
  }
}
