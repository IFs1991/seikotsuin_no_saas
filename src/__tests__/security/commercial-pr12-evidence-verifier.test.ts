/** @jest-environment node */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type Artifact = {
  path: string;
  bytes: number;
  sha256: string;
  classification: 'PUBLIC_SANITIZED';
};

type CredentialPolicy = {
  channel: string;
  storage: string;
  retrieval: string;
  logging: string;
  serverOnly: boolean;
  browserExposureAllowed: boolean;
  commandLineExposureAllowed: boolean;
  evidenceExposureAllowed: boolean;
  clientResponseExposureAllowed: boolean;
  logExposureAllowed: boolean;
  sourceControlExposureAllowed: boolean;
  urlExposureAllowed: boolean;
};

type FixtureOptions = {
  approvalAt?: string;
  nodeVersion?: string;
  supabaseCliVersion?: string;
  psqlVersion?: string;
  credentialOverrides?: Partial<CredentialPolicy>;
};

const repoRoot = path.resolve(__dirname, '../../..');
const verifierPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/verify-pr12-evidence-manifest.mjs'
);
const baseCommit = '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab';
const migrationHead = '20260718011731';
const evidencePath = 'evidence.txt';
const futureTimestamp = '2999-01-01T00:00:00Z';
const pastTimestamp = '2000-01-01T00:00:00Z';
const requiredRoles = [
  'anon',
  'authenticated',
  'service_role',
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
];
const applicationRoles = [
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
];
const requiredJwtCases = [
  'inactive_profile',
  'expired_manager_assignment',
  'revoked_manager_assignment',
  'missing_authority',
  'stale_jwt',
  'empty_jwt',
  'malformed_jwt',
  'expired_jwt',
  'cross_clinic',
  'missing_or_null_resource',
  'parent_rehome',
  'resource_and_clinic_cascade',
];
const tenantCrudCases = ['read', 'insert', 'update', 'delete'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: unknown,
  context: string
): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object`);
  return value;
}

function requireArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${context} must be an array`);
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function writeArtifact(
  directory: string,
  relativePath: string,
  content: string | Buffer
): Artifact {
  const absolutePath = path.join(directory, relativePath);
  fs.writeFileSync(absolutePath, content);
  const bytes = fs.readFileSync(absolutePath);
  return {
    path: relativePath,
    bytes: bytes.length,
    sha256: sha256(bytes),
    classification: 'PUBLIC_SANITIZED',
  };
}

function writeJsonArtifact(
  directory: string,
  relativePath: string,
  value: unknown
): Artifact {
  return writeArtifact(
    directory,
    relativePath,
    `${JSON.stringify(value, null, 2)}\n`
  );
}

function binding(artifact: Artifact): { path: string; sha256: string } {
  return { path: artifact.path, sha256: artifact.sha256 };
}

function currentHead(): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error('git rev-parse HEAD failed');
  return result.stdout.trim();
}

function runVerifier(manifestPath: string): {
  status: number | null;
  output: string;
} {
  const result = spawnSync(
    process.execPath,
    [verifierPath, '--manifest', manifestPath],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return {
    status: result.status,
    output: [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join('\n'),
  };
}

function securityExpectedRow(
  caseId: string,
  role: string,
  jwtCase: string,
  operation: string
): Record<string, unknown> {
  return {
    caseId,
    role,
    actor: `synthetic_${role}`,
    jwtCase,
    sourceTenant: 'tenant_a',
    targetTenant: 'tenant_b',
    tenantBoundary: 'CROSS_TENANT_DENIED',
    target: 'representative_relation',
    operation,
    expectedHttpStatus: 403,
    expectedSqlstate: 'NONE',
    expectedRowCount: 0,
    expectedAclOutcome: 'EXPECTED_BOUNDARY',
    expectedRlsOutcome: 'CROSS_TENANT_DENIED',
  };
}

function observedSecurityRow(
  expected: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...expected,
    observedHttpStatus: expected.expectedHttpStatus,
    observedSqlstate: expected.expectedSqlstate,
    observedRowCount: expected.expectedRowCount,
    observedAclOutcome: expected.expectedAclOutcome,
    observedRlsOutcome: expected.expectedRlsOutcome,
    aclVerdict: 'PASS',
    rlsVerdict: 'PASS',
    status: 'PASS',
    evidence: [evidencePath],
  };
}

function directRoleContractRows(prefix: string): Record<string, unknown>[] {
  return ['anon', 'authenticated', 'service_role'].map(role => ({
    caseId: `${prefix}_${role}`,
    role,
    operation: 'read',
    expected: prefix === 'graphql' ? 'ENDPOINT_REJECTED' : 'EXPECTED_RESULT',
  }));
}

function directRoleResults(
  rows: readonly Record<string, unknown>[],
  disabled: boolean
): Record<string, unknown>[] {
  return rows.map(row => ({
    ...row,
    observed: row.expected,
    aclVerdict: disabled ? 'NOT_APPLICABLE' : 'PASS',
    rlsVerdict: disabled ? 'NOT_APPLICABLE' : 'PASS',
    status: 'PASS',
    evidence: [evidencePath],
  }));
}

function metricResults(value: unknown): Record<string, unknown>[] {
  return requireArray(value, 'performance gates').map((gateValue, index) => {
    const gate = requireRecord(gateValue, `performance gate ${String(index)}`);
    if (typeof gate.limit !== 'number' || typeof gate.unit !== 'string') {
      throw new TypeError('performance gate limit/unit invalid');
    }
    const samples = [gate.limit * 0.5, gate.limit * 0.6, gate.limit * 0.7];
    return {
      id: gate.id,
      samples,
      median: samples[1],
      limit: gate.limit,
      unit: gate.unit,
      status: 'PASS',
      evidence: [evidencePath],
    };
  });
}

function namedResults(value: unknown): Record<string, unknown>[] {
  return requireArray(value, 'named gates').map(id => ({
    id,
    status: 'PASS',
    evidence: [evidencePath],
  }));
}

function buildPassingFixture(
  directory: string,
  options: FixtureOptions = {}
): {
  manifestPath: string;
  manifest: Record<string, unknown>;
} {
  const artifacts: Artifact[] = [];
  const add = (artifact: Artifact): Artifact => {
    artifacts.push(artifact);
    return artifact;
  };
  const generalEvidence = add(
    writeArtifact(directory, evidencePath, 'synthetic qualification evidence\n')
  );
  const machineScan = add(
    writeArtifact(
      directory,
      'machine-scan.txt',
      'configured pattern scan PASS\n'
    )
  );
  const stderr = add(writeArtifact(directory, 'stderr.txt', ''));
  const approvalEvidence = add(
    writeArtifact(
      directory,
      'approval-evidence.txt',
      'synthetic owner approval\n'
    )
  );
  const backupArtifact = add(
    writeArtifact(directory, 'backup.bin', 'synthetic backup artifact')
  );

  const securityRows = [
    ...applicationRoles.flatMap(role =>
      tenantCrudCases.map(operation =>
        securityExpectedRow(
          `cross_${role}_${operation}`,
          role,
          'valid_jwt',
          operation
        )
      )
    ),
    ...requiredJwtCases.map(jwtCase =>
      securityExpectedRow(`auth_${jwtCase}`, 'authenticated', jwtCase, 'read')
    ),
    securityExpectedRow('direct_anon', 'anon', 'empty_jwt', 'read'),
    securityExpectedRow(
      'direct_service_role',
      'service_role',
      'service_role_server_only',
      'read'
    ),
  ];
  const securityContract = add(
    writeJsonArtifact(directory, 'security-matrix.json', {
      schemaVersion: 1,
      matrixId: 'SECURITY-MATRIX-TEST',
      roles: requiredRoles,
      jwtCases: ['valid_jwt', 'service_role_server_only', ...requiredJwtCases],
      tenantCrudCases,
      rows: securityRows,
    })
  );

  const dataApiRows = directRoleContractRows('data_api');
  const dataApiConfiguration = {
    enabled: true,
    exposedSchemas: ['public'],
    automaticGrants: 'disabled',
    defaultPrivileges: { postgres: 'captured', supabaseAdmin: 'captured' },
  };
  const dataApiContract = add(
    writeJsonArtifact(directory, 'data-api-matrix.json', {
      schemaVersion: 1,
      matrixId: 'DATA-API-MATRIX-TEST',
      configuration: dataApiConfiguration,
      rows: dataApiRows,
    })
  );
  const graphQlRows = directRoleContractRows('graphql');
  const graphQlConfiguration = {
    installedVersion: 'test-version',
    enabled: false,
    exposedSchemas: [],
    introspection: 'disabled',
  };
  const graphQlContract = add(
    writeJsonArtifact(directory, 'graphql-matrix.json', {
      schemaVersion: 1,
      matrixId: 'GRAPHQL-MATRIX-TEST',
      configuration: graphQlConfiguration,
      rows: graphQlRows,
    })
  );

  const frozenPerformanceBytes = fs.readFileSync(
    path.join(
      repoRoot,
      'docs/stabilization/evidence/commercial-hardening/pr12/frozen-pr11-performance-contract.json'
    )
  );
  const performanceContract = add(
    writeArtifact(
      directory,
      'frozen-performance-contract.json',
      frozenPerformanceBytes
    )
  );
  const parsedFrozenPerformance: unknown = JSON.parse(
    frozenPerformanceBytes.toString('utf8')
  );
  const frozenPerformance = requireRecord(
    parsedFrozenPerformance,
    'frozen performance contract'
  );
  const hostedThresholds = {
    p95Ms: 100,
    p99Ms: 150,
    minimumThroughputPerSecond: 10,
    maximum5xxRate: 0.01,
    maximumTimeoutRate: 0.01,
    maximumCpuPercent: 80,
    minimumPoolHeadroomPercent: 20,
    maximumLockWaitMs: 100,
    maximumWalBytes: 1000000,
    maximumMigrationDurationSeconds: 600,
  };
  const hostedContractValue = {
    schemaVersion: 1,
    workloadId: 'HOSTED-SLO-TEST',
    concurrency: 2,
    sampleOrder: ['warmup', 'steady'],
    durationSeconds: 60,
    thresholds: hostedThresholds,
  };
  const hostedContract = add(
    writeJsonArtifact(
      directory,
      'hosted-slo-contract.json',
      hostedContractValue
    )
  );
  const representativeDataValue = {
    schemaVersion: 1,
    classification: 'SYNTHETIC',
    volume: 'small_test_fixture',
    sourceSha256: '1'.repeat(64),
    expiresAt: futureTimestamp,
  };
  const representativeDataContract = add(
    writeJsonArtifact(
      directory,
      'representative-data-contract.json',
      representativeDataValue
    )
  );
  const toolVersions = {
    node: options.nodeVersion ?? `v${process.versions.node}`,
    supabaseCli: options.supabaseCliVersion ?? '2.109.0',
    psql: options.psqlVersion ?? 'psql (PostgreSQL) 17.4',
  };
  const nodeVersionStdout = add(
    writeArtifact(
      directory,
      'node-version.stdout.txt',
      `${toolVersions.node}\n`
    )
  );
  const supabaseVersionStdout = add(
    writeArtifact(
      directory,
      'supabase-version.stdout.txt',
      `${toolVersions.supabaseCli}\n`
    )
  );
  const psqlVersionStdout = add(
    writeArtifact(
      directory,
      'psql-version.stdout.txt',
      `${toolVersions.psql}\n`
    )
  );
  const commands = [
    {
      id: 'capture-node-version',
      redactedCommand: 'node --version',
      startedAt: pastTimestamp,
      endedAt: pastTimestamp,
      exitCode: 0,
      stdoutPath: nodeVersionStdout.path,
      stdoutSha256: nodeVersionStdout.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'capture-supabase-version',
      redactedCommand: 'supabase --version',
      startedAt: pastTimestamp,
      endedAt: pastTimestamp,
      exitCode: 0,
      stdoutPath: supabaseVersionStdout.path,
      stdoutSha256: supabaseVersionStdout.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'capture-psql-version',
      redactedCommand: 'psql --version',
      startedAt: pastTimestamp,
      endedAt: pastTimestamp,
      exitCode: 0,
      stdoutPath: psqlVersionStdout.path,
      stdoutSha256: psqlVersionStdout.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
    {
      id: 'privacy-scan',
      redactedCommand:
        'node scripts/commercial-hardening/scan-pr12-evidence.mjs',
      startedAt: pastTimestamp,
      endedAt: pastTimestamp,
      exitCode: 0,
      stdoutPath: machineScan.path,
      stdoutSha256: machineScan.sha256,
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
    },
  ];
  const commandLedger = add(
    writeJsonArtifact(directory, 'command-ledger.json', {
      schemaVersion: 1,
      commands: commands.map(command => ({
        id: command.id,
        redactedCommand: command.redactedCommand,
      })),
    })
  );
  const drContractValue = {
    schemaVersion: 1,
    backupMethod: 'synthetic_snapshot',
    backupScope: 'database',
    restoreSource: 'synthetic_backup',
    restorePoint: 'synthetic_restore_point',
    rtoStartEvent: 'restore_requested',
    rtoEndEvent: 'security_checks_passed',
    rtoMeasurementClockAndSource: 'monotonic_test_clock',
    rpoWatermarkDefinition: 'durable_test_watermark',
    rpoObservationEvent: 'restore_complete',
    rpoMeasurementClockAndSource: 'database_test_clock',
    rtoThresholdSeconds: 100,
    rpoThresholdSeconds: 100,
  };
  const drContract = add(
    writeJsonArtifact(directory, 'dr-contract.json', drContractValue)
  );
  const integrationContract = add(
    writeJsonArtifact(directory, 'integration-contract.json', {
      schemaVersion: 1,
      mode: 'DISABLED',
      realExternalSideEffectsAllowed: false,
    })
  );
  const credentialPolicy: CredentialPolicy = {
    channel: 'process_environment',
    storage: 'owner_approved_server_secret_store',
    retrieval: 'ephemeral_server_subprocess_injection',
    logging: 'redacted_variable_names_only',
    serverOnly: true,
    browserExposureAllowed: false,
    commandLineExposureAllowed: false,
    evidenceExposureAllowed: false,
    clientResponseExposureAllowed: false,
    logExposureAllowed: false,
    sourceControlExposureAllowed: false,
    urlExposureAllowed: false,
    ...options.credentialOverrides,
  };
  const credentialContractValue = {
    schemaVersion: 1,
    ...credentialPolicy,
  };
  const credentialContract = add(
    writeJsonArtifact(
      directory,
      'credential-contract.json',
      credentialContractValue
    )
  );

  const head = currentHead();
  const environment = {
    projectRef: 'synthetic-project-ref',
    projectName: 'synthetic-project',
    region: 'test-region',
    databaseTier: 'test-tier',
    databaseVersion: 'test-version',
    systemIdentifier: 'synthetic-system-id',
    dataApi: {
      enabled: dataApiConfiguration.enabled,
      matrixId: 'DATA-API-MATRIX-TEST',
      matrixPath: dataApiContract.path,
      matrixSha256: dataApiContract.sha256,
      exposedSchemas: dataApiConfiguration.exposedSchemas,
      automaticGrants: dataApiConfiguration.automaticGrants,
      defaultPrivileges: dataApiConfiguration.defaultPrivileges,
      schemaUsage: { status: 'PASS', evidence: [evidencePath] },
      objectAcl: { status: 'PASS', evidence: [evidencePath] },
      directRoleResults: directRoleResults(dataApiRows, false),
      aclVerdict: { status: 'PASS', evidence: [evidencePath] },
      rlsVerdict: { status: 'PASS', evidence: [evidencePath] },
    },
    graphQl: {
      installedVersion: graphQlConfiguration.installedVersion,
      enabled: graphQlConfiguration.enabled,
      matrixId: 'GRAPHQL-MATRIX-TEST',
      matrixPath: graphQlContract.path,
      matrixSha256: graphQlContract.sha256,
      exposedSchemas: graphQlConfiguration.exposedSchemas,
      introspection: graphQlConfiguration.introspection,
      directRoleResults: directRoleResults(graphQlRows, true),
      tenantBoundary: { status: 'NOT_APPLICABLE', evidence: [evidencePath] },
      fieldVisibility: { status: 'NOT_APPLICABLE', evidence: [evidencePath] },
      disabledEndpointRejection: { status: 'PASS', evidence: [evidencePath] },
    },
  };
  const approvalBinding = add(
    writeJsonArtifact(directory, 'approved-binding.json', {
      schemaVersion: 1,
      status: 'APPROVED',
      authorization: {
        isolatedStagingExecutionAuthorized: true,
        readyTransitionAuthorized: false,
        mergeAuthorized: false,
        productionConnectionAuthorized: false,
        commercialReleaseAuthorized: false,
        indexRetirementAuthorized: false,
      },
      target: { gitCommit: head, baseCommit, migrationHead },
      environment: {
        projectRef: environment.projectRef,
        projectName: environment.projectName,
        region: environment.region,
        databaseTier: environment.databaseTier,
        databaseVersion: environment.databaseVersion,
      },
      toolVersions,
      toolVersionCommands: {
        node: 'capture-node-version',
        supabaseCli: 'capture-supabase-version',
        psql: 'capture-psql-version',
      },
      bindings: {
        securityMatrix: binding(securityContract),
        dataApiMatrix: binding(dataApiContract),
        graphQlMatrix: binding(graphQlContract),
        performanceContract: binding(performanceContract),
        hostedSloContract: binding(hostedContract),
        representativeDataContract: binding(representativeDataContract),
        commandLedger: binding(commandLedger),
        drContract: binding(drContract),
        integrationContract: binding(integrationContract),
        credentialContract: binding(credentialContract),
      },
      approval: {
        approvedBy: 'synthetic_approver',
        approvedAt: options.approvalAt ?? pastTimestamp,
        expiresAt: futureTimestamp,
        evidencePath: approvalEvidence.path,
        evidenceSha256: approvalEvidence.sha256,
      },
      owners: {
        stagingOwner: 'synthetic_owner',
        stagingOperator: 'synthetic_operator',
        incidentOwner: 'synthetic_incident_owner',
      },
    })
  );

  const gateSource = fs.readFileSync(
    path.join(repoRoot, 'docs/releases/current-gate-status.yaml'),
    'utf8'
  );
  const commGateIds = [
    ...gateSource.matchAll(/^\s*- id: (COMM-[A-Z]+-\d{3})$/gmu),
  ].map(match => match[1]);
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    qualificationId: 'PR12-SYNTHETIC-VERIFIER-TEST',
    status: 'PASS',
    source: {
      gitCommit: head,
      baseCommit,
      migrationHead,
      approvalPacketPath: approvalBinding.path,
      approvalPacketSha256: approvalBinding.sha256,
    },
    environment,
    credentialHandling: {
      contractPath: credentialContract.path,
      contractSha256: credentialContract.sha256,
      ...credentialPolicy,
      status: 'PASS',
      evidence: [evidencePath],
    },
    toolVersions,
    timing: {
      startedAt: pastTimestamp,
      endedAt: pastTimestamp,
      durationSeconds: 1,
    },
    commands,
    artifacts,
    rowCounts: { representative_relation: 1 },
    hashes: {
      logicalHash: '2'.repeat(64),
      physicalHash: '3'.repeat(64),
      schemaHash: '4'.repeat(64),
      dataHash: '5'.repeat(64),
    },
    representativeData: {
      contractPath: representativeDataContract.path,
      contractSha256: representativeDataContract.sha256,
      ...representativeDataValue,
      evidence: [evidencePath],
    },
    performance: {
      contractPath: performanceContract.path,
      contractSha256: performanceContract.sha256,
      sampleCount: 3,
      aggregation: 'median_of_exactly_3',
      pairedSampleOrder: 'before_after_after_before_before_after',
      primaryExecutionResults: metricResults(
        frozenPerformance.primaryExecutionGates
      ),
      primaryWalResults: metricResults(frozenPerformance.primaryWalGates),
      auxiliaryExecutionResults: metricResults(
        frozenPerformance.auxiliaryExecutionGates
      ),
      auxiliaryWalResults: metricResults(frozenPerformance.auxiliaryWalGates),
      planResults: namedResults(frozenPerformance.planGates),
      semanticResults: namedResults(frozenPerformance.semanticGates),
      hostedSlo: {
        contractPath: hostedContract.path,
        contractSha256: hostedContract.sha256,
        workloadId: hostedContractValue.workloadId,
        concurrency: hostedContractValue.concurrency,
        sampleOrder: hostedContractValue.sampleOrder,
        durationSeconds: hostedContractValue.durationSeconds,
        thresholds: hostedThresholds,
        observed: {
          p95Ms: 50,
          p99Ms: 75,
          throughputPerSecond: 20,
          rate5xx: 0,
          timeoutRate: 0,
          cpuPercent: 40,
          poolHeadroomPercent: 50,
          lockWaitMs: 10,
          walBytes: 100,
          migrationDurationSeconds: 10,
        },
        status: 'PASS',
        evidence: [evidencePath],
      },
    },
    gates: commGateIds.map(id => ({
      id,
      status: 'PASS',
      evidence: [evidencePath],
    })),
    securityMatrix: {
      matrixId: 'SECURITY-MATRIX-TEST',
      contractPath: securityContract.path,
      contractSha256: securityContract.sha256,
      roles: requiredRoles,
      jwtCases: ['valid_jwt', 'service_role_server_only', ...requiredJwtCases],
      tenantCrudCases,
      rows: securityRows.map(observedSecurityRow),
      serviceRoleBoundary: { status: 'PASS', evidence: [evidencePath] },
      aclRlsIndependence: { status: 'PASS', evidence: [evidencePath] },
    },
    externalSideEffects: {
      mode: 'DISABLED',
      duplicateCount: 0,
      evidence: [evidencePath],
    },
    backup: {
      status: 'PASS',
      method: drContractValue.backupMethod,
      scope: drContractValue.backupScope,
      capturedAt: pastTimestamp,
      sourceWatermark: 'synthetic_watermark',
      artifactPath: backupArtifact.path,
      artifactSha256: backupArtifact.sha256,
      evidence: [evidencePath],
    },
    restore: {
      status: 'PASS',
      restoreSource: drContractValue.restoreSource,
      restorePoint: drContractValue.restorePoint,
      rtoStartEvent: drContractValue.rtoStartEvent,
      rtoEndEvent: drContractValue.rtoEndEvent,
      rtoMeasurementClockAndSource:
        drContractValue.rtoMeasurementClockAndSource,
      rpoWatermarkDefinition: drContractValue.rpoWatermarkDefinition,
      rpoObservationEvent: drContractValue.rpoObservationEvent,
      rpoMeasurementClockAndSource:
        drContractValue.rpoMeasurementClockAndSource,
      rtoThresholdSeconds: drContractValue.rtoThresholdSeconds,
      rpoThresholdSeconds: drContractValue.rpoThresholdSeconds,
      rtoSeconds: 10,
      rpoSeconds: 10,
      evidence: [evidencePath],
    },
    postRestore: {
      schemaParity: { status: 'PASS', evidence: [evidencePath] },
      dataParity: { status: 'PASS', evidence: [evidencePath] },
      tenantIsolation: { status: 'PASS', evidence: [evidencePath] },
      authBoundary: { status: 'PASS', evidence: [evidencePath] },
      dataApiBoundary: { status: 'PASS', evidence: [evidencePath] },
      graphQlBoundary: { status: 'PASS', evidence: [evidencePath] },
    },
    ownership: {
      owner: 'synthetic_owner',
      approver: 'synthetic_approver',
      stagingOperator: 'synthetic_operator',
      incidentOwner: 'synthetic_incident_owner',
    },
    privacyScan: {
      status: 'PASS',
      scannedAt: pastTimestamp,
      scannerVersion: 'pr12-evidence-scan-v1',
      findingCount: 0,
      machineScanCommandId: 'privacy-scan',
      machineScanEvidence: [machineScan.path],
      manualReviewStatus: 'PASS',
      manualReviewer: 'synthetic_privacy_reviewer',
      manualReviewedAt: pastTimestamp,
      manualReviewEvidence: [approvalEvidence.path],
    },
    residualRisk: [],
    expiresAt: futureTimestamp,
  };
  const manifestPath = path.join(directory, 'manifest.json');
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  expect(generalEvidence.sha256).toHaveLength(64);
  return { manifestPath, manifest };
}

describe('commercial PR-12 execution evidence verifier', () => {
  it('accepts one fully bound synthetic manifest and rejects approval drift', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-evidence-verifier-')
    );
    try {
      const { manifestPath, manifest } = buildPassingFixture(directory);
      const valid = runVerifier(manifestPath);
      expect(valid.status).toBe(0);
      expect(valid.output).toContain('semantic and artifact hashes verified');

      const environment = requireRecord(manifest.environment, 'environment');
      environment.region = 'unapproved-region';
      const mismatchPath = path.join(directory, 'manifest-mismatch.json');
      fs.writeFileSync(
        mismatchPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain('environment.region approval mismatch');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects expected/observed security outcome mismatch', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-security-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const security = requireRecord(manifest.securityMatrix, 'securityMatrix');
      const rows = requireArray(security.rows, 'securityMatrix.rows');
      const firstRow = requireRecord(rows[0], 'securityMatrix.rows[0]');
      firstRow.observedHttpStatus = 200;
      const mismatchPath = path.join(
        directory,
        'manifest-security-mismatch.json'
      );
      fs.writeFileSync(
        mismatchPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'observedHttpStatus does not match expectedHttpStatus'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects Data API configuration drift from the hash-bound matrix', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-data-api-config-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const environment = requireRecord(manifest.environment, 'environment');
      const dataApi = requireRecord(environment.dataApi, 'environment.dataApi');
      dataApi.enabled = false;
      const mismatchPath = path.join(
        directory,
        'manifest-data-api-config-mismatch.json'
      );
      fs.writeFileSync(
        mismatchPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'environment.dataApi.enabled approval mismatch'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects execution that started before approval', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-retroactive-approval-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        approvalAt: '2000-01-02T00:00:00Z',
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'timing.startedAt precedes approvalPacket.approval.approvedAt'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unpinned Supabase CLI version even when the packet agrees', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-cli-version-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        supabaseCliVersion: '2.110.0',
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'toolVersions.supabaseCli must be 2.109.0'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects missing psql version evidence', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-missing-psql-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const toolVersions = requireRecord(manifest.toolVersions, 'toolVersions');
      delete toolVersions.psql;
      const mismatchPath = path.join(directory, 'manifest-missing-psql.json');
      fs.writeFileSync(
        mismatchPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'toolVersions key set approval mismatch'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a psql claim that is not exact version-command output', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-invalid-psql-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        psqlVersion: 'PostgreSQL 17.4',
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'toolVersions.psql must be an exact psql --version output'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a self-reported Node 24 version that differs from the runtime', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-node-runtime-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        nodeVersion: 'v24.99.99',
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'toolVersions.node does not match the executing Node runtime'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects tool-version stdout that does not match its hash-bound claim', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-tool-output-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const artifacts = requireArray(manifest.artifacts, 'artifacts');
      const generalEvidence = artifacts
        .map((value, index) =>
          requireRecord(value, `artifacts[${String(index)}]`)
        )
        .find(value => value.path === evidencePath);
      if (!generalEvidence)
        throw new Error('general evidence artifact missing');
      const commands = requireArray(manifest.commands, 'commands');
      const nodeVersionCommand = requireRecord(commands[0], 'commands[0]');
      nodeVersionCommand.stdoutPath = generalEvidence.path;
      nodeVersionCommand.stdoutSha256 = generalEvidence.sha256;
      const mismatchPath = path.join(
        directory,
        'manifest-tool-output-mismatch.json'
      );
      fs.writeFileSync(
        mismatchPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'tool version stdout mismatch for node'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unsafe credential channel even when manifest and approval agree', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-unsafe-credential-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        credentialOverrides: { channel: 'command_line' },
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'credentialHandling.channel violates the server-only credential boundary'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects secret logging or client-response exposure in an approved contract', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-unsafe-exposure-verifier-')
    );
    try {
      const { manifestPath } = buildPassingFixture(directory, {
        credentialOverrides: {
          logging: 'plaintext_secret',
          clientResponseExposureAllowed: true,
        },
      });
      const result = runVerifier(manifestPath);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'credentialHandling.logging violates the server-only credential boundary'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects credential-channel drift from the approved contract', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-credential-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const credential = requireRecord(
        manifest.credentialHandling,
        'credentialHandling'
      );
      credential.channel = 'unapproved_channel';
      const mismatchPath = path.join(
        directory,
        'manifest-credential-mismatch.json'
      );
      fs.writeFileSync(
        mismatchPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain(
        'credentialHandling.channel approval mismatch'
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'TYPO_CLASSIFICATION'],
  ])('rejects %s artifact classification', (_label, value) => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-classification-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      const artifacts = requireArray(manifest.artifacts, 'artifacts');
      const first = requireRecord(artifacts[0], 'artifacts[0]');
      if (value === undefined) {
        delete first.classification;
      } else {
        first.classification = value;
      }
      const mismatchPath = path.join(
        directory,
        'manifest-classification-mismatch.json'
      );
      fs.writeFileSync(
        mismatchPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain('artifacts[0].classification');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects top-level PASS_WITH_RISK without evaluating it as a pass', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-pass-with-risk-verifier-')
    );
    try {
      const { manifest } = buildPassingFixture(directory);
      manifest.status = 'PASS_WITH_RISK';
      const mismatchPath = path.join(directory, 'manifest-pass-with-risk.json');
      fs.writeFileSync(
        mismatchPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
      );
      const mismatch = runVerifier(mismatchPath);
      expect(mismatch.status).toBe(1);
      expect(mismatch.output).toContain('manifest status is unsupported');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
