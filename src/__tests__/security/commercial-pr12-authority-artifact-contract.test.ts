/** @jest-environment node */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const implementationSsot =
  'docs/stabilization/spec-commercial-hardening-migration-v1.0.md';
const pr12Spec =
  'docs/stabilization/spec-commercial-pr12-isolated-release-qualification-v1.0.md';
const preparationGate =
  'docs/stabilization/evidence/commercial-hardening/pr12/pr12-preparation-gate.yaml';
const currentGateStatus = 'docs/releases/current-gate-status.yaml';
const evidenceDirectory =
  'docs/stabilization/evidence/commercial-hardening/pr12';

const expectedObjective = 'コード品質を運用品質へ変換する。';
const expectedSteps = [
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
] as const;
const expectedAcceptance = [
  'restore evidence',
  'tenant isolation after restore',
  'no duplicate external side effects',
  'incident rollback/forward-fix runbook',
  'production sign-off',
] as const;
const expectedPr12SectionSha256 =
  '71fe7972430268396ca405a388e2cdf87b937962f735dfae6af48b2cb1d66b94';
const datedOriginalSha256 =
  'fb3960ef365f803c718f7e297fd6b49378341c3f7a1b9250828fd64d0b0a40b5';

const currentAction003Tuple = [
  'source-project-provisioning-binding-v6.template.json',
  'source-project-provisioning-credential-configuration-v2.template.json',
  'source-project-provisioning-authorization-projection-v1.template.json',
  'source-project-provisioning-single-action-approval-receipt-v2.template.json',
  'source-project-provisioning-derived-execution-binding-v1.template.json',
  'source-project-official-pricing-evidence-v3.template.json',
  'source-project-provisioning-result-v6.template.json',
  'source-project-provider-safe-projection-v4.template.json',
] as const;

const supersededAction003Templates = [
  'source-project-provisioning-binding-v2.template.json',
  'source-project-provisioning-binding-v3.template.json',
  'source-project-provisioning-binding-v4.template.json',
  'source-project-provisioning-binding-v5.template.json',
  'source-project-provisioning-result-v2.template.json',
  'source-project-provisioning-result-v3.template.json',
  'source-project-provisioning-result-v4.template.json',
  'source-project-provisioning-result-v5.template.json',
  'source-project-provisioning-owner-approval.template.json',
  'source-project-provisioning-owner-approval-v2.template.json',
  'source-project-provisioning-owner-approval-v3.template.json',
  'source-project-provisioning-owner-approval-v4.template.json',
  'source-project-official-pricing-evidence-v2.template.json',
  'source-project-provisioning-initial-approval-receipt-v1.template.json',
  'source-project-provisioning-final-approval-receipt-v1.template.json',
  'source-project-provider-safe-projection-v2.template.json',
  'source-project-provider-safe-projection-v3.template.json',
  'source-project-provisioning-credential-configuration.template.json',
] as const;

const legacyCommercialManifestTuple = [
  'source-project-provisioning-binding.template.json',
  'source-project-provisioning-result.template.json',
  'source-project-provider-export.template.json',
] as const;

function repositoryPath(relativePath: string): string {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function readRepositoryFile(relativePath: string): string {
  return fs
    .readFileSync(repositoryPath(relativePath), 'utf8')
    .replace(/\r\n/gu, '\n');
}

function extractCanonicalPr12Section(source: string): string {
  const start = source.indexOf(
    '## PR-12: Release qualification, staging migration, DR drill'
  );
  if (start < 0) {
    throw new Error('canonical PR12 section start is missing');
  }
  const separatorStart = source.indexOf('\n---', start);
  if (separatorStart < 0) {
    throw new Error('canonical PR12 section terminator is missing');
  }
  return source.slice(start, separatorStart + '\n---'.length).trim();
}

function extractMarkdownList(
  section: string,
  heading: string,
  nextHeadingOrTerminator: string
): readonly string[] {
  const start = section.indexOf(heading);
  const end = section.indexOf(nextHeadingOrTerminator, start + heading.length);
  if (start < 0 || end < 0) {
    throw new Error(`cannot extract ${heading}`);
  }
  return section
    .slice(start + heading.length, end)
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^(?:\d+\.|- )/u.test(line))
    .map(line => line.replace(/^(?:\d+\.|- )\s*/u, ''));
}

function extractTraceabilityRows(
  specification: string
): readonly (readonly string[])[] {
  const startMarker = '<!-- PR12-TRACEABILITY-MATRIX:START -->';
  const endMarker = '<!-- PR12-TRACEABILITY-MATRIX:END -->';
  expect(specification.match(/PR12-TRACEABILITY-MATRIX:START/gu)).toHaveLength(
    1
  );
  expect(specification.match(/PR12-TRACEABILITY-MATRIX:END/gu)).toHaveLength(1);
  const start = specification.indexOf(startMarker);
  const end = specification.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

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

describe('PR12 canonical authority and current artifact contract', () => {
  it('hash-pins the exact canonical objective, 14 steps, and five Acceptance items', () => {
    const section = extractCanonicalPr12Section(
      readRepositoryFile(implementationSsot)
    );
    expect(createHash('sha256').update(section).digest('hex')).toBe(
      expectedPr12SectionSha256
    );
    expect(section).toContain(`### Objective\n\n${expectedObjective}`);
    expect(extractMarkdownList(section, '### Steps', '### Acceptance')).toEqual(
      expectedSteps
    );
    expect(extractMarkdownList(section, '### Acceptance', '\n---')).toEqual(
      expectedAcceptance
    );
  });

  it('defines scoped authority without allowing subordinate sources to replace the canonical PR12 contract', () => {
    const specification = readRepositoryFile(pr12Spec);
    for (const requiredRule of [
      'Purpose, ordered 14 steps, and five Acceptance items',
      'docs/stabilization/spec-commercial-hardening-migration-v1.0.md',
      expectedPr12SectionSha256,
      'Gate and evidence-state semantics',
      'docs/quality/change-dod-v1.0.md',
      'The 54 COMM gate definitions',
      'docs/releases/commercial-release-qualification-v1.0.md',
      'PR12-specific binding, command, and evidence shape',
      'may tighten but must not remove, reorder, waive, replace, or substitute',
      'BLOCK / NO_GO',
      'before remote contact',
    ]) {
      expect(specification).toContain(requiredRule);
    }
  });

  it('keeps one ordered 14-step matrix with every execution NOT_RUN and no inherited authority', () => {
    const rows = extractTraceabilityRows(readRepositoryFile(pr12Spec));
    expect(rows).toHaveLength(14);
    expect(rows.map(row => row[0])).toEqual(
      expectedSteps.map((_, index) => String(index + 1).padStart(2, '0'))
    );
    expect(rows.map(row => row[1])).toEqual(expectedSteps);
    expect(rows.every(row => row[3] === 'NOT_RUN')).toBe(true);
    expect(new Set(rows.map(row => row[0])).size).toBe(14);

    const isolatedProject = rows[0];
    expect(isolatedProject[2]).toBe('PREREQUISITE_PASS_ONLY');
    expect(isolatedProject[4]).toBe('NOT_AUTHORIZED');
    expect(isolatedProject[5]).toContain('PR12-ACTION-002');
    expect(isolatedProject[5]).toContain('PR12-ACTION-003');

    const productionApply = rows[11];
    expect(productionApply[2]).toBe('NOT_IMPLEMENTED');
    expect(productionApply[4]).toBe('NOT_AUTHORIZED');
    expect(productionApply[5]).toContain('independent production approval');
  });

  it('maps every canonical Acceptance item inside the single traceability section', () => {
    const specification = readRepositoryFile(pr12Spec);
    const start = specification.indexOf(
      '<!-- PR12-TRACEABILITY-MATRIX:START -->'
    );
    const end = specification.indexOf(
      '<!-- PR12-TRACEABILITY-MATRIX:END -->',
      start
    );
    const matrix = specification.slice(start, end);
    const firstColumnValues = matrix
      .split('\n')
      .filter(line => line.startsWith('|'))
      .map(line => line.split('|')[1]?.trim());
    for (const acceptance of expectedAcceptance) {
      expect(firstColumnValues).toContain(acceptance);
    }
  });

  it('pins only the canonical path and hashes in gate snapshots without redefining the steps', () => {
    for (const relativePath of [preparationGate, currentGateStatus]) {
      const snapshot = readRepositoryFile(relativePath);
      expect(snapshot).toContain(
        `pr12_section_sha256: ${expectedPr12SectionSha256}`
      );
      expect(snapshot).toContain(
        `dated_original_sha256: ${datedOriginalSha256}`
      );
      expect(snapshot).toContain(`implementation_ssot: ${implementationSsot}`);
      expect(snapshot).not.toContain('canonical_steps:');
      expect(snapshot).not.toContain('acceptance_items:');
    }
  });

  it('keeps only the current Action-003 tuple and compatibility-only legacy v1 trio', () => {
    for (const current of currentAction003Tuple) {
      expect(
        fs.existsSync(repositoryPath(`${evidenceDirectory}/${current}`))
      ).toBe(true);
    }
    for (const superseded of supersededAction003Templates) {
      expect(
        fs.existsSync(repositoryPath(`${evidenceDirectory}/${superseded}`))
      ).toBe(false);
    }
    for (const legacy of legacyCommercialManifestTuple) {
      expect(
        fs.existsSync(repositoryPath(`${evidenceDirectory}/${legacy}`))
      ).toBe(true);
    }

    const readme = readRepositoryFile(`${evidenceDirectory}/README.md`);
    expect(readme).toContain('Current PR12-ACTION-003 tuple');
    expect(readme).toContain(
      'Legacy commercial-manifest v1 compatibility only'
    );
    expect(readme).toContain('schema v2 through v6');
    for (const superseded of supersededAction003Templates) {
      expect(readme).not.toContain(superseded);
    }
  });
});
