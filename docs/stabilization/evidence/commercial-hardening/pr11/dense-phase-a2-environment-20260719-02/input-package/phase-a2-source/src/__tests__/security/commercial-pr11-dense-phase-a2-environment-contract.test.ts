/** @jest-environment node */

import * as fs from 'node:fs';
import * as path from 'node:path';

const SPEC_PATH =
  'docs/stabilization/spec-commercial-pr11-dense-phase-a2-attribution-v1.0.md';
const RUNNER_PATH =
  'scripts/commercial-hardening/run-pr11-dense-phase-a2-environment.mjs';
const COLLECTOR_PATH =
  'scripts/commercial-hardening/collect-pr11-phase-a2-host-telemetry.ps1';
const PREFLIGHT_PATH =
  'scripts/commercial-hardening/sql/pr11-phase-a2-environment-preflight.sql';
const CONTRACT_PATH =
  'src/__tests__/security/commercial-pr11-dense-phase-a2-environment-contract.test.ts';

const repoRoot = path.resolve(__dirname, '../../..');

function repositoryPath(relativePath: string): string {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function readRepositoryFile(relativePath: string): string {
  return fs.readFileSync(repositoryPath(relativePath), 'utf8');
}

function normalizeExecutableSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

describe('commercial PR-11 dense Phase A2 environment validity contract', () => {
  const specification = readRepositoryFile(SPEC_PATH);
  const runner = readRepositoryFile(RUNNER_PATH);
  const collector = readRepositoryFile(COLLECTOR_PATH);
  const preflight = readRepositoryFile(PREFLIGHT_PATH);
  const executablePreflight = normalizeExecutableSql(preflight);

  it('ships a separate, self-contained D0/D1 investigation surface', () => {
    for (const requiredPath of [
      SPEC_PATH,
      RUNNER_PATH,
      COLLECTOR_PATH,
      PREFLIGHT_PATH,
      CONTRACT_PATH,
    ]) {
      expect(fs.existsSync(repositoryPath(requiredPath))).toBe(true);
      expect(runner).toContain(requiredPath);
    }

    expect(runner).toContain('pr11_phase_a_investigation_team_handoff.md');
    expect(runner).toContain(
      'report-pr11-dense-insert-gate-fail-root-cause-v0.1-20260718.md'
    );
    expect(runner).toContain('phaseAManifest.inputHashes');
    expect(runner).toContain('phaseAInputBundleSha256');
    expect(runner).toContain('package-manifest.json');
  });

  it('freezes the official identity, tools, baselines, and admission gates', () => {
    for (const frozenValue of [
      'aaf3837f6f8053b0379a2d4caea65880952ce027',
      '20260718011731',
      '170006',
      '7662783869098430503',
      '2.109.0',
      '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118',
      '4ea5b92ae679323cde0e69ca92b801c3fc705c8351bdff50cb3b8eff6926f5c7',
      '5e6ae3af19f428d63b8eaa8a56d7b659d4841fe693071e7ca11449c756c3cb65',
      'c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78',
      '94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86',
      '381b4222-f694-41f0-9685-ff5bb260df2e',
    ]) {
      expect(runner).toContain(frozenValue);
    }

    for (const gate of [
      'hostSampleCount: 5',
      'minimumAvailableMemoryBytes: 4 * 1024 ** 3',
      'minimumAvailableMemoryFraction: 0.25',
      'maximumCommittedBytesInUsePercent: 80',
      'maximumProcessorUtilityPercent: 10',
      'minimumProcessorPerformancePercent: 90',
      'maximumProcessorFrequencyCoefficientOfVariation: 0.1',
      'maximumPagesInputPerSecond: 0',
      'maximumPageReadsPerSecond: 0',
      'runningContainersOutsideTargetProjectAllowed: 0',
      'restartingContainersAllowed: 0',
      'maximumTargetDatabaseCpuPercent: 2',
      'targetDatabaseHealthyRequired: true',
      'checkpointerCounterIncreaseAllowed: false',
      'walCounterIncreaseAllowed: false',
    ]) {
      expect(runner).toContain(gate);
    }
  });

  it('hard-stops before all timing and candidate work when D1 is invalid', () => {
    expect(runner).toContain("d1CurrentAA: 'NOT_RUN'");
    expect(runner).toContain("d2FourArm: 'NOT_RUN'");
    expect(runner).toContain("d3CommittedAB: 'NOT_AUTHORIZED'");
    expect(runner).toContain("rollbackOnlyAttribution: 'NOT_RUN'");
    expect(runner).toContain('candidateSqlExecutionCount: 0');
    expect(runner).toContain("'ENVIRONMENT_INVALID'");
    expect(runner).toContain("'STABILIZE_HOST_THEN_RERUN_D1'");
    expect(runner).not.toMatch(/drop\s+index/i);
    expect(collector).not.toMatch(/powercfg(?:\.exe)?\s+\/(?:s|setactive)/i);

    expect(executablePreflight).not.toMatch(
      /\b(drop|create|alter|truncate|insert|update|delete|grant|revoke)\b/
    );
    expect(executablePreflight).not.toMatch(/\bcommit\b|\brollback\b/);
  });

  it('emits the frozen classification schema and hashes both result formats', () => {
    for (const field of [
      '`environment_validity: ${result.environmentValidity}`',
      '`rollback_only_attribution: NOT_RUN`',
      '`d3_committed_a_b: NOT_AUTHORIZED`',
      'manifest.resultSha256 = fileSha(resultPath)',
      'manifest.resultYamlSha256 = fileSha(resultYamlPath)',
    ]) {
      expect(runner).toContain(field);
    }
    expect(runner).not.toContain('current_environment_validity');
  });

  it('allowlists telemetry fields and excludes host or Docker identifiers', () => {
    expect(specification).toContain('Docker collection is allowlist-only');
    expect(runner).not.toContain("'{{json .}}'");
    expect(runner).not.toContain('{{json .State}}');
    expect(runner).not.toContain('.Labels');
    expect(runner).not.toContain('dockerName');
    expect(runner).toContain(
      '{{.Names}}\\t{{.Image}}\\t{{.State}}\\t{{.Status}}'
    );
    expect(runner).toContain('{{.NCPU}}\\t{{.MemTotal}}');

    expect(collector).not.toContain('Win32_Battery');
    expect(collector).not.toContain('name = $_.Name');
    expect(collector).not.toContain('powerPlanRaw');
    expect(collector).not.toContain('processorNames');
    expect(collector).not.toContain('RemainingCapacity');
  });

  it('keeps Phase A conclusions explicit instead of rewriting the old FAIL', () => {
    for (const classification of [
      'Phase A2 does not rewrite the Phase A `FAIL`',
      '`ENVIRONMENT_INVALID`',
      'candidate DDL execution count must remain zero',
      'candidate effect remains `NOT_PROVEN`',
      'D2 remains `NOT_RUN`',
    ]) {
      expect(specification).toContain(classification);
    }

    expect(runner).toContain("phaseAOriginalResult: 'FAIL'");
    expect(runner).toContain("phaseAWallClockValidity: 'INCONCLUSIVE'");
    expect(runner).toContain("steadyStateIndexEffect: 'NOT_PROVEN'");
    expect(runner).toContain("cascadeWal: 'NOT_PROVEN'");
  });

  it('does not add a Phase A2 migration or rollback', () => {
    const migrationNames = fs
      .readdirSync(repositoryPath('supabase/migrations'))
      .filter(file => /phase[_-]?a2|dense[_-]?attribution/i.test(file));
    const rollbackNames = fs
      .readdirSync(repositoryPath('supabase/rollbacks'))
      .filter(file => /phase[_-]?a2|dense[_-]?attribution/i.test(file));

    expect(migrationNames).toEqual([]);
    expect(rollbackNames).toEqual([]);
  });
});
