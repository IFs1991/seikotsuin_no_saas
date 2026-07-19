#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const CURRENT_GATE_PATH = path.join(
  REPO_ROOT,
  'docs/releases/current-gate-status.yaml'
);
const FROZEN_PERFORMANCE_CONTRACT_PATH = path.join(
  REPO_ROOT,
  'docs/stabilization/evidence/commercial-hardening/pr12/frozen-pr11-performance-contract.json'
);
const BASE_COMMIT = '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab';
const MIGRATION_HEAD = '20260718011731';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const EXECUTION_STATUSES = new Set(['PASS']);
const UNRESOLVED = new Set([
  'NOT_CAPTURED',
  'NOT_RUN',
  'UNASSIGNED',
  'NOT_APPLICABLE',
]);
const REQUIRED_ROLES = [
  'anon',
  'authenticated',
  'service_role',
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
];
const APPLICATION_ROLES = [
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
];
const REQUIRED_JWT_CASES = [
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
const REQUIRED_TENANT_CRUD = ['read', 'insert', 'update', 'delete'];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function requireRecord(value, context) {
  assert(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${context} must be an object`
  );
  return value;
}

function requireArray(value, context) {
  assert(Array.isArray(value), `${context} must be an array`);
  return value;
}

function requireString(value, context) {
  assert(
    typeof value === 'string' && value.length > 0,
    `${context} must be a string`
  );
  return value;
}

function requireNumber(value, context) {
  assert(
    typeof value === 'number' && Number.isFinite(value) && value >= 0,
    `${context} must be a non-negative number`
  );
  return value;
}

function requireConcreteString(value, context) {
  const candidate = requireString(value, context);
  assert(
    !UNRESOLVED.has(candidate),
    `${context} contains a placeholder or unresolved value`
  );
  return candidate;
}

function requireSha256(value, context) {
  const candidate = requireConcreteString(value, context);
  assert(SHA256_PATTERN.test(candidate), `${context} must be a SHA-256`);
  return candidate;
}

function requireGitCommit(value, context) {
  const candidate = requireConcreteString(value, context);
  assert(GIT_COMMIT_PATTERN.test(candidate), `${context} must be a Git commit`);
  return candidate;
}

function sha256File(absolutePath) {
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
}

function readJsonFile(absolutePath, context) {
  const parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
  return requireRecord(parsed, context);
}

function currentGitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert(result.status === 0, 'git rev-parse HEAD failed');
  return requireGitCommit(result.stdout.trim(), 'current Git HEAD');
}

function requireIsoTimestamp(value, context, options = {}) {
  const candidate = requireConcreteString(value, context);
  assert(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      candidate
    ),
    `${context} must be an ISO-8601 timestamp with timezone`
  );
  const instant = Date.parse(candidate);
  assert(Number.isFinite(instant), `${context} must be a valid timestamp`);
  if (options.future === true) {
    assert(instant > Date.now(), `${context} is expired`);
  }
  if (options.notFuture === true) {
    assert(instant <= Date.now(), `${context} must not be in the future`);
  }
  return candidate;
}

function requireConcreteStringArray(value, context, options = {}) {
  const values = requireArray(value, context);
  if (options.allowEmpty !== true) {
    assert(values.length > 0, `${context} must not be empty`);
  }
  return values.map((item, index) =>
    requireConcreteString(item, `${context}[${String(index)}]`)
  );
}

function assertExactStringArray(actual, expected, context) {
  assert(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${context} approval mismatch`
  );
}

function requiredCommGateIds() {
  const source = readFileSync(CURRENT_GATE_PATH, 'utf8');
  const ids = [...source.matchAll(/^\s*- id: (COMM-[A-Z]+-\d{3})$/gmu)].map(
    match => match[1]
  );
  assert(
    ids.length === 54,
    'current gate inventory must contain 54 COMM gates'
  );
  assert(
    new Set(ids).size === 54,
    'current gate inventory has duplicate COMM gates'
  );
  return ids;
}

function resolveEvidencePath(manifestDirectory, relativePath, context) {
  const candidate = requireConcreteString(relativePath, context);
  assert(!path.isAbsolute(candidate), `${context} must be relative`);
  const absolute = path.resolve(manifestDirectory, candidate);
  const relative = path.relative(manifestDirectory, absolute);
  assert(
    relative.length > 0 &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative),
    `${context} escapes the manifest directory`
  );
  assert(existsSync(absolute), `${context} does not exist`);
  assert(
    !lstatSync(absolute).isSymbolicLink(),
    `${context} must not be a symbolic link`
  );
  assert(lstatSync(absolute).isFile(), `${context} must be a file`);
  return { absolute, relative: candidate.replaceAll('\\', '/') };
}

function verifyEvidenceReferences(value, context, artifactPaths) {
  const evidence = requireArray(value, context);
  assert(evidence.length > 0, `${context} must not be empty`);
  for (const [index, item] of evidence.entries()) {
    const reference = requireConcreteString(
      item,
      `${context}[${String(index)}]`
    );
    assert(
      artifactPaths.has(reference.replaceAll('\\', '/')),
      `${context}[${String(index)}] is not a hashed artifact`
    );
  }
}

function verifyPassedGate(
  value,
  context,
  artifactPaths,
  allowNotApplicable = false
) {
  const gate = requireRecord(value, context);
  const status = requireString(gate.status, `${context}.status`);
  const allowed = allowNotApplicable
    ? new Set(['PASS', 'NOT_APPLICABLE'])
    : new Set(['PASS']);
  assert(allowed.has(status), `${context}.status is not supported`);
  verifyEvidenceReferences(gate.evidence, `${context}.evidence`, artifactPaths);
}

function verifyArtifacts(manifest, manifestDirectory) {
  const artifacts = requireArray(manifest.artifacts, 'artifacts');
  assert(artifacts.length > 0, 'artifacts must not be empty');
  const artifactPaths = new Set();
  const artifactHashes = new Map();
  const artifactFiles = new Map();
  for (const [index, value] of artifacts.entries()) {
    const context = `artifacts[${String(index)}]`;
    const artifact = requireRecord(value, context);
    const resolved = resolveEvidencePath(
      manifestDirectory,
      artifact.path,
      `${context}.path`
    );
    assert(
      !artifactPaths.has(resolved.relative),
      `${context}.path is duplicated`
    );
    const expectedBytes = requireNumber(artifact.bytes, `${context}.bytes`);
    const expectedSha256 = requireSha256(artifact.sha256, `${context}.sha256`);
    const classification = requireConcreteString(
      artifact.classification,
      `${context}.classification`
    );
    assert(
      ['PUBLIC_SANITIZED', 'INTERNAL_NO_PII'].includes(classification),
      `${context}.classification is not allowed in passing evidence`
    );
    assert(
      statSync(resolved.absolute).size === expectedBytes,
      `${context}.bytes drift`
    );
    assert(
      sha256File(resolved.absolute) === expectedSha256,
      `${context}.sha256 drift`
    );
    artifactPaths.add(resolved.relative);
    artifactHashes.set(resolved.relative, expectedSha256);
    artifactFiles.set(resolved.relative, resolved.absolute);
  }
  return { artifactPaths, artifactHashes, artifactFiles };
}

function verifyBoundArtifact(value, context, artifactHashes, artifactFiles) {
  const binding = requireRecord(value, context);
  const artifactPath = requireConcreteString(
    binding.path,
    `${context}.path`
  ).replaceAll('\\', '/');
  const artifactSha256 = requireSha256(binding.sha256, `${context}.sha256`);
  assert(
    artifactHashes.has(artifactPath),
    `${context}.path is not a hashed artifact`
  );
  assert(
    artifactHashes.get(artifactPath) === artifactSha256,
    `${context}.sha256 does not match the artifact`
  );
  const absolutePath = artifactFiles.get(artifactPath);
  assert(
    typeof absolutePath === 'string',
    `${context}.path cannot be resolved`
  );
  return { path: artifactPath, sha256: artifactSha256, absolutePath };
}

function verifyCommands(manifest, artifactPaths, artifactHashes) {
  const commands = requireArray(manifest.commands, 'commands');
  assert(commands.length > 0, 'commands must not be empty');
  for (const [index, value] of commands.entries()) {
    const context = `commands[${String(index)}]`;
    const command = requireRecord(value, context);
    requireConcreteString(command.id, `${context}.id`);
    requireConcreteString(
      command.redactedCommand,
      `${context}.redactedCommand`
    );
    requireConcreteString(command.startedAt, `${context}.startedAt`);
    requireConcreteString(command.endedAt, `${context}.endedAt`);
    assert(command.exitCode === 0, `${context}.exitCode must be zero`);
    for (const stream of ['stdout', 'stderr']) {
      const streamPath = requireConcreteString(
        command[`${stream}Path`],
        `${context}.${stream}Path`
      ).replaceAll('\\', '/');
      const streamHash = requireSha256(
        command[`${stream}Sha256`],
        `${context}.${stream}Sha256`
      );
      assert(
        artifactPaths.has(streamPath),
        `${context}.${stream}Path is not an artifact`
      );
      assert(
        artifactHashes.get(streamPath) === streamHash,
        `${context}.${stream}Sha256 does not match the artifact`
      );
    }
  }
}

function verifyDirectRoleResults(
  value,
  context,
  artifactPaths,
  allowNotApplicable,
  contract
) {
  const results = requireArray(value, context);
  const expectedRows = requireArray(contract.rows, `${context}.contract.rows`);
  assert(
    results.length === expectedRows.length && results.length > 0,
    `${context} result count does not match its approved contract`
  );
  const expectedById = new Map();
  for (const [index, value] of expectedRows.entries()) {
    const expectedContext = `${context}.contract.rows[${String(index)}]`;
    const expected = requireRecord(value, expectedContext);
    const caseId = requireConcreteString(
      expected.caseId,
      `${expectedContext}.caseId`
    );
    assert(
      !expectedById.has(caseId),
      `${expectedContext}.caseId is duplicated`
    );
    expectedById.set(caseId, expected);
  }
  const roles = new Set();
  const observedIds = new Set();
  for (const [index, item] of results.entries()) {
    const rowContext = `${context}[${String(index)}]`;
    const row = requireRecord(item, rowContext);
    const caseId = requireConcreteString(row.caseId, `${rowContext}.caseId`);
    assert(!observedIds.has(caseId), `${rowContext}.caseId is duplicated`);
    observedIds.add(caseId);
    const expectedRow = requireRecord(
      expectedById.get(caseId),
      `${rowContext}.approvedContract`
    );
    const role = requireConcreteString(row.role, `${rowContext}.role`);
    assert(
      ['anon', 'authenticated', 'service_role'].includes(role),
      `${rowContext}.role is unsupported`
    );
    roles.add(role);
    const operation = requireConcreteString(
      row.operation,
      `${rowContext}.operation`
    );
    const expected = requireConcreteString(
      row.expected,
      `${rowContext}.expected`
    );
    const observed = requireConcreteString(
      row.observed,
      `${rowContext}.observed`
    );
    assert(expectedRow.role === role, `${rowContext}.role approval mismatch`);
    assert(
      expectedRow.operation === operation,
      `${rowContext}.operation approval mismatch`
    );
    assert(
      expectedRow.expected === expected,
      `${rowContext}.expected approval mismatch`
    );
    assert(
      observed === expected,
      `${rowContext}.observed does not match expected`
    );
    const allowed = allowNotApplicable
      ? new Set(['PASS', 'NOT_APPLICABLE'])
      : new Set(['PASS']);
    assert(
      allowed.has(row.aclVerdict),
      `${rowContext}.aclVerdict is unsupported`
    );
    assert(
      allowed.has(row.rlsVerdict),
      `${rowContext}.rlsVerdict is unsupported`
    );
    assert(row.status === 'PASS', `${rowContext}.status must be PASS`);
    verifyEvidenceReferences(
      row.evidence,
      `${rowContext}.evidence`,
      artifactPaths
    );
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert(roles.has(role), `${context} is missing ${role}`);
  }
}

function verifyEnvironment(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles
) {
  const environment = requireRecord(manifest.environment, 'environment');
  for (const field of [
    'projectRef',
    'projectName',
    'region',
    'databaseTier',
    'databaseVersion',
    'systemIdentifier',
  ]) {
    requireConcreteString(environment[field], `environment.${field}`);
  }

  const dataApi = requireRecord(environment.dataApi, 'environment.dataApi');
  const dataApiMatrix = verifyBoundArtifact(
    { path: dataApi.matrixPath, sha256: dataApi.matrixSha256 },
    'environment.dataApi.matrix',
    artifactHashes,
    artifactFiles
  );
  const dataApiContract = readJsonFile(
    dataApiMatrix.absolutePath,
    'environment.dataApi.matrixContract'
  );
  assert(
    dataApiContract.schemaVersion === 1,
    'Data API matrix schemaVersion drift'
  );
  assert(
    dataApiContract.matrixId === dataApi.matrixId,
    'environment.dataApi.matrixId approval mismatch'
  );
  const dataApiConfiguration = requireRecord(
    dataApiContract.configuration,
    'environment.dataApi.matrixContract.configuration'
  );
  assert(
    typeof dataApi.enabled === 'boolean',
    'environment.dataApi.enabled must be boolean'
  );
  assert(
    dataApi.enabled === dataApiConfiguration.enabled,
    'environment.dataApi.enabled approval mismatch'
  );
  const exposedSchemas = requireConcreteStringArray(
    dataApi.exposedSchemas,
    'environment.dataApi.exposedSchemas'
  );
  const approvedExposedSchemas = requireConcreteStringArray(
    dataApiConfiguration.exposedSchemas,
    'environment.dataApi.matrixContract.configuration.exposedSchemas'
  );
  assertExactStringArray(
    exposedSchemas,
    approvedExposedSchemas,
    'environment.dataApi.exposedSchemas'
  );
  const automaticGrants = requireConcreteString(
    dataApi.automaticGrants,
    'environment.dataApi.automaticGrants'
  );
  assert(
    automaticGrants === dataApiConfiguration.automaticGrants,
    'environment.dataApi.automaticGrants approval mismatch'
  );
  const defaults = requireRecord(
    dataApi.defaultPrivileges,
    'environment.dataApi.defaultPrivileges'
  );
  const approvedDefaults = requireRecord(
    dataApiConfiguration.defaultPrivileges,
    'environment.dataApi.matrixContract.configuration.defaultPrivileges'
  );
  for (const field of ['postgres', 'supabaseAdmin']) {
    const observed = requireConcreteString(
      defaults[field],
      `environment.dataApi.defaultPrivileges.${field}`
    );
    const approved = requireConcreteString(
      approvedDefaults[field],
      `environment.dataApi.matrixContract.configuration.defaultPrivileges.${field}`
    );
    assert(
      observed === approved,
      `environment.dataApi.defaultPrivileges.${field} approval mismatch`
    );
  }
  verifyPassedGate(
    dataApi.schemaUsage,
    'environment.dataApi.schemaUsage',
    artifactPaths
  );
  verifyPassedGate(
    dataApi.objectAcl,
    'environment.dataApi.objectAcl',
    artifactPaths
  );
  verifyDirectRoleResults(
    dataApi.directRoleResults,
    'environment.dataApi.directRoleResults',
    artifactPaths,
    false,
    dataApiContract
  );
  verifyPassedGate(
    dataApi.aclVerdict,
    'environment.dataApi.aclVerdict',
    artifactPaths
  );
  verifyPassedGate(
    dataApi.rlsVerdict,
    'environment.dataApi.rlsVerdict',
    artifactPaths
  );

  const graphQl = requireRecord(environment.graphQl, 'environment.graphQl');
  const graphQlMatrix = verifyBoundArtifact(
    { path: graphQl.matrixPath, sha256: graphQl.matrixSha256 },
    'environment.graphQl.matrix',
    artifactHashes,
    artifactFiles
  );
  const graphQlContract = readJsonFile(
    graphQlMatrix.absolutePath,
    'environment.graphQl.matrixContract'
  );
  assert(
    graphQlContract.schemaVersion === 1,
    'GraphQL matrix schemaVersion drift'
  );
  assert(
    graphQlContract.matrixId === graphQl.matrixId,
    'environment.graphQl.matrixId approval mismatch'
  );
  const graphQlConfiguration = requireRecord(
    graphQlContract.configuration,
    'environment.graphQl.matrixContract.configuration'
  );
  const installedVersion = requireConcreteString(
    graphQl.installedVersion,
    'environment.graphQl.installedVersion'
  );
  assert(
    installedVersion === graphQlConfiguration.installedVersion,
    'environment.graphQl.installedVersion approval mismatch'
  );
  assert(
    typeof graphQl.enabled === 'boolean',
    'environment.graphQl.enabled must be boolean'
  );
  assert(
    graphQl.enabled === graphQlConfiguration.enabled,
    'environment.graphQl.enabled approval mismatch'
  );
  const graphQlExposedSchemas = requireConcreteStringArray(
    graphQl.exposedSchemas,
    'environment.graphQl.exposedSchemas',
    { allowEmpty: true }
  );
  const approvedGraphQlExposedSchemas = requireConcreteStringArray(
    graphQlConfiguration.exposedSchemas,
    'environment.graphQl.matrixContract.configuration.exposedSchemas',
    { allowEmpty: true }
  );
  assertExactStringArray(
    graphQlExposedSchemas,
    approvedGraphQlExposedSchemas,
    'environment.graphQl.exposedSchemas'
  );
  const introspection = requireConcreteString(
    graphQl.introspection,
    'environment.graphQl.introspection'
  );
  assert(
    introspection === graphQlConfiguration.introspection,
    'environment.graphQl.introspection approval mismatch'
  );
  verifyDirectRoleResults(
    graphQl.directRoleResults,
    'environment.graphQl.directRoleResults',
    artifactPaths,
    !graphQl.enabled,
    graphQlContract
  );
  verifyPassedGate(
    graphQl.tenantBoundary,
    'environment.graphQl.tenantBoundary',
    artifactPaths,
    !graphQl.enabled
  );
  verifyPassedGate(
    graphQl.fieldVisibility,
    'environment.graphQl.fieldVisibility',
    artifactPaths,
    !graphQl.enabled
  );
  verifyPassedGate(
    graphQl.disabledEndpointRejection,
    'environment.graphQl.disabledEndpointRejection',
    artifactPaths,
    graphQl.enabled
  );
  if (graphQl.enabled) {
    assert(
      requireRecord(
        graphQl.disabledEndpointRejection,
        'disabledEndpointRejection'
      ).status === 'NOT_APPLICABLE',
      'enabled GraphQL must evidence why disabled endpoint rejection is NOT_APPLICABLE'
    );
  } else {
    assert(
      requireRecord(
        graphQl.disabledEndpointRejection,
        'disabledEndpointRejection'
      ).status === 'PASS',
      'disabled GraphQL requires endpoint rejection PASS'
    );
  }
}

function verifySecurityMatrix(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles
) {
  const matrix = requireRecord(manifest.securityMatrix, 'securityMatrix');
  const matrixId = requireConcreteString(
    matrix.matrixId,
    'securityMatrix.matrixId'
  );
  const contractBinding = verifyBoundArtifact(
    { path: matrix.contractPath, sha256: matrix.contractSha256 },
    'securityMatrix.contract',
    artifactHashes,
    artifactFiles
  );
  const contract = readJsonFile(
    contractBinding.absolutePath,
    'securityMatrix.contract'
  );
  assert(
    contract.schemaVersion === 1,
    'securityMatrix contract schemaVersion drift'
  );
  assert(
    contract.matrixId === matrixId,
    'securityMatrix.matrixId approval mismatch'
  );
  const roles = new Set(
    requireArray(matrix.roles, 'securityMatrix.roles').map((value, index) =>
      requireConcreteString(value, `securityMatrix.roles[${String(index)}]`)
    )
  );
  const jwtCases = new Set(
    requireArray(matrix.jwtCases, 'securityMatrix.jwtCases').map(
      (value, index) =>
        requireConcreteString(
          value,
          `securityMatrix.jwtCases[${String(index)}]`
        )
    )
  );
  const tenantCrudCases = new Set(
    requireArray(matrix.tenantCrudCases, 'securityMatrix.tenantCrudCases').map(
      (value, index) =>
        requireConcreteString(
          value,
          `securityMatrix.tenantCrudCases[${String(index)}]`
        )
    )
  );
  for (const role of REQUIRED_ROLES)
    assert(roles.has(role), `securityMatrix.roles missing ${role}`);
  for (const jwtCase of REQUIRED_JWT_CASES) {
    assert(jwtCases.has(jwtCase), `securityMatrix.jwtCases missing ${jwtCase}`);
  }
  for (const operation of REQUIRED_TENANT_CRUD) {
    assert(
      tenantCrudCases.has(operation),
      `securityMatrix.tenantCrudCases missing ${operation}`
    );
  }

  const contractRoles = requireArray(
    contract.roles,
    'securityMatrix.contract.roles'
  );
  const contractJwtCases = requireArray(
    contract.jwtCases,
    'securityMatrix.contract.jwtCases'
  );
  const contractTenantCrud = requireArray(
    contract.tenantCrudCases,
    'securityMatrix.contract.tenantCrudCases'
  );
  assert(
    JSON.stringify([...roles].sort()) ===
      JSON.stringify([...contractRoles].sort()),
    'securityMatrix.roles approval mismatch'
  );
  assert(
    JSON.stringify([...jwtCases].sort()) ===
      JSON.stringify([...contractJwtCases].sort()),
    'securityMatrix.jwtCases approval mismatch'
  );
  assert(
    JSON.stringify([...tenantCrudCases].sort()) ===
      JSON.stringify([...contractTenantCrud].sort()),
    'securityMatrix.tenantCrudCases approval mismatch'
  );

  const expectedRows = requireArray(
    contract.rows,
    'securityMatrix.contract.rows'
  );
  const expectedById = new Map();
  for (const [index, value] of expectedRows.entries()) {
    const context = `securityMatrix.contract.rows[${String(index)}]`;
    const expected = requireRecord(value, context);
    const caseId = requireConcreteString(expected.caseId, `${context}.caseId`);
    assert(!expectedById.has(caseId), `${context}.caseId is duplicated`);
    expectedById.set(caseId, expected);
  }

  const rows = requireArray(matrix.rows, 'securityMatrix.rows');
  assert(
    rows.length === expectedRows.length && rows.length > 0,
    'securityMatrix.rows do not match the approved contract count'
  );
  const observedRoles = new Set();
  const observedJwtCases = new Set();
  const observedOperations = new Set();
  const observedCrossTenantCases = new Set();
  const observedIds = new Set();
  for (const [index, value] of rows.entries()) {
    const context = `securityMatrix.rows[${String(index)}]`;
    const row = requireRecord(value, context);
    const caseId = requireConcreteString(row.caseId, `${context}.caseId`);
    assert(!observedIds.has(caseId), `${context}.caseId is duplicated`);
    observedIds.add(caseId);
    const expected = requireRecord(
      expectedById.get(caseId),
      `${context}.approvedContract`
    );
    for (const field of [
      'role',
      'actor',
      'jwtCase',
      'sourceTenant',
      'targetTenant',
      'tenantBoundary',
      'target',
      'operation',
    ]) {
      const observedValue = requireConcreteString(
        row[field],
        `${context}.${field}`
      );
      assert(
        expected[field] === observedValue,
        `${context}.${field} approval mismatch`
      );
    }
    assert(
      row.sourceTenant !== row.targetTenant,
      `${context} must use distinct source and target tenants`
    );
    assert(
      row.tenantBoundary === 'CROSS_TENANT_DENIED',
      `${context}.tenantBoundary must be CROSS_TENANT_DENIED`
    );
    observedRoles.add(row.role);
    observedJwtCases.add(row.jwtCase);
    observedOperations.add(row.operation);
    observedCrossTenantCases.add(`${row.role}:${row.operation}`);
    for (const field of [
      'expectedHttpStatus',
      'expectedSqlstate',
      'expectedRowCount',
      'expectedAclOutcome',
      'expectedRlsOutcome',
    ]) {
      assert(
        (typeof row[field] === 'string' && !UNRESOLVED.has(row[field])) ||
          Number.isInteger(row[field]),
        `${context}.${field} contains a placeholder or unresolved value`
      );
      assert(
        expected[field] === row[field],
        `${context}.${field} approval mismatch`
      );
    }
    for (const [expectedField, observedField] of [
      ['expectedHttpStatus', 'observedHttpStatus'],
      ['expectedSqlstate', 'observedSqlstate'],
      ['expectedRowCount', 'observedRowCount'],
      ['expectedAclOutcome', 'observedAclOutcome'],
      ['expectedRlsOutcome', 'observedRlsOutcome'],
    ]) {
      assert(
        row[observedField] === row[expectedField],
        `${context}.${observedField} does not match ${expectedField}`
      );
    }
    assert(row.aclVerdict === 'PASS', `${context}.aclVerdict must be PASS`);
    assert(row.rlsVerdict === 'PASS', `${context}.rlsVerdict must be PASS`);
    assert(row.status === 'PASS', `${context}.status must be PASS`);
    verifyEvidenceReferences(
      row.evidence,
      `${context}.evidence`,
      artifactPaths
    );
  }
  for (const role of REQUIRED_ROLES) {
    assert(
      observedRoles.has(role),
      `securityMatrix.rows have no case for ${role}`
    );
  }
  for (const jwtCase of REQUIRED_JWT_CASES) {
    assert(
      observedJwtCases.has(jwtCase),
      `securityMatrix.rows have no case for ${jwtCase}`
    );
  }
  for (const operation of REQUIRED_TENANT_CRUD) {
    assert(
      observedOperations.has(operation),
      `securityMatrix.rows have no case for ${operation}`
    );
  }
  for (const role of APPLICATION_ROLES) {
    for (const operation of REQUIRED_TENANT_CRUD) {
      assert(
        observedCrossTenantCases.has(`${role}:${operation}`),
        `securityMatrix.rows missing cross-tenant ${role} ${operation}`
      );
    }
  }
  verifyPassedGate(
    matrix.serviceRoleBoundary,
    'securityMatrix.serviceRoleBoundary',
    artifactPaths
  );
  verifyPassedGate(
    matrix.aclRlsIndependence,
    'securityMatrix.aclRlsIndependence',
    artifactPaths
  );
}

function verifyRepresentativeData(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles
) {
  const data = requireRecord(manifest.representativeData, 'representativeData');
  const binding = verifyBoundArtifact(
    { path: data.contractPath, sha256: data.contractSha256 },
    'representativeData.contract',
    artifactHashes,
    artifactFiles
  );
  const contract = readJsonFile(
    binding.absolutePath,
    'representativeData.contract'
  );
  assert(
    contract.schemaVersion === 1,
    'representativeData contract schemaVersion drift'
  );
  const classification = requireConcreteString(
    data.classification,
    'representativeData.classification'
  );
  assert(
    ['SYNTHETIC', 'ANONYMIZED'].includes(classification),
    'representativeData.classification is unsupported'
  );
  for (const field of [
    'classification',
    'volume',
    'sourceSha256',
    'expiresAt',
  ]) {
    assert(
      contract[field] === data[field],
      `representativeData.${field} approval mismatch`
    );
  }
  requireConcreteString(data.volume, 'representativeData.volume');
  requireSha256(data.sourceSha256, 'representativeData.sourceSha256');
  requireIsoTimestamp(data.expiresAt, 'representativeData.expiresAt', {
    future: true,
  });
  verifyEvidenceReferences(
    data.evidence,
    'representativeData.evidence',
    artifactPaths
  );
}

function verifyMetricResults(
  resultsValue,
  expectedGates,
  context,
  artifactPaths
) {
  const results = requireArray(resultsValue, context);
  assert(
    results.length === expectedGates.length,
    `${context} count does not match the frozen contract`
  );
  const expectedById = new Map(expectedGates.map(gate => [gate.id, gate]));
  const observedIds = new Set();
  for (const [index, value] of results.entries()) {
    const rowContext = `${context}[${String(index)}]`;
    const row = requireRecord(value, rowContext);
    const id = requireConcreteString(row.id, `${rowContext}.id`);
    assert(!observedIds.has(id), `${rowContext}.id is duplicated`);
    observedIds.add(id);
    const expected = requireRecord(
      expectedById.get(id),
      `${rowContext}.frozenGate`
    );
    const samples = requireArray(row.samples, `${rowContext}.samples`).map(
      (sample, sampleIndex) =>
        requireNumber(sample, `${rowContext}.samples[${String(sampleIndex)}]`)
    );
    assert(
      samples.length === 3,
      `${rowContext}.samples must contain exactly three values`
    );
    const median = [...samples].sort((left, right) => left - right)[1];
    assert(
      row.median === median,
      `${rowContext}.median does not match the samples`
    );
    assert(row.limit === expected.limit, `${rowContext}.limit drift`);
    assert(row.unit === expected.unit, `${rowContext}.unit drift`);
    assert(
      median <= expected.limit,
      `${rowContext}.median exceeds the frozen limit`
    );
    assert(row.status === 'PASS', `${rowContext}.status must be PASS`);
    verifyEvidenceReferences(
      row.evidence,
      `${rowContext}.evidence`,
      artifactPaths
    );
  }
  for (const expected of expectedGates) {
    assert(
      observedIds.has(expected.id),
      `${context} is missing ${expected.id}`
    );
  }
}

function verifyNamedResults(resultsValue, expectedIds, context, artifactPaths) {
  const results = requireArray(resultsValue, context);
  assert(results.length === expectedIds.length, `${context} count drift`);
  const expected = new Set(expectedIds);
  const observed = new Set();
  for (const [index, value] of results.entries()) {
    const rowContext = `${context}[${String(index)}]`;
    const row = requireRecord(value, rowContext);
    const id = requireConcreteString(row.id, `${rowContext}.id`);
    assert(expected.has(id), `${rowContext}.id is not in the frozen contract`);
    assert(!observed.has(id), `${rowContext}.id is duplicated`);
    observed.add(id);
    assert(row.status === 'PASS', `${rowContext}.status must be PASS`);
    verifyEvidenceReferences(
      row.evidence,
      `${rowContext}.evidence`,
      artifactPaths
    );
  }
}

function verifyHostedSlo(
  hostedValue,
  artifactPaths,
  artifactHashes,
  artifactFiles
) {
  const hosted = requireRecord(hostedValue, 'performance.hostedSlo');
  const binding = verifyBoundArtifact(
    { path: hosted.contractPath, sha256: hosted.contractSha256 },
    'performance.hostedSlo.contract',
    artifactHashes,
    artifactFiles
  );
  const contract = readJsonFile(
    binding.absolutePath,
    'performance.hostedSlo.contract'
  );
  assert(
    contract.schemaVersion === 1,
    'hosted SLO contract schemaVersion drift'
  );
  for (const field of [
    'workloadId',
    'concurrency',
    'sampleOrder',
    'durationSeconds',
  ]) {
    assert(
      JSON.stringify(hosted[field]) === JSON.stringify(contract[field]),
      `performance.hostedSlo.${field} approval mismatch`
    );
  }
  requireConcreteString(hosted.workloadId, 'performance.hostedSlo.workloadId');
  assert(
    Number.isInteger(hosted.concurrency) && hosted.concurrency > 0,
    'performance.hostedSlo.concurrency must be a positive integer'
  );
  assert(
    requireArray(hosted.sampleOrder, 'performance.hostedSlo.sampleOrder')
      .length > 0,
    'performance.hostedSlo.sampleOrder must not be empty'
  );
  assert(
    requireNumber(
      hosted.durationSeconds,
      'performance.hostedSlo.durationSeconds'
    ) > 0,
    'performance.hostedSlo.durationSeconds must be positive'
  );
  const thresholds = requireRecord(
    hosted.thresholds,
    'performance.hostedSlo.thresholds'
  );
  const approvedThresholds = requireRecord(
    contract.thresholds,
    'performance.hostedSlo.contract.thresholds'
  );
  assert(
    JSON.stringify(thresholds) === JSON.stringify(approvedThresholds),
    'performance.hostedSlo.thresholds approval mismatch'
  );
  const observed = requireRecord(
    hosted.observed,
    'performance.hostedSlo.observed'
  );
  const comparisons = [
    ['p95Ms', 'p95Ms', 'max'],
    ['p99Ms', 'p99Ms', 'max'],
    ['throughputPerSecond', 'minimumThroughputPerSecond', 'min'],
    ['rate5xx', 'maximum5xxRate', 'max'],
    ['timeoutRate', 'maximumTimeoutRate', 'max'],
    ['cpuPercent', 'maximumCpuPercent', 'max'],
    ['poolHeadroomPercent', 'minimumPoolHeadroomPercent', 'min'],
    ['lockWaitMs', 'maximumLockWaitMs', 'max'],
    ['walBytes', 'maximumWalBytes', 'max'],
    ['migrationDurationSeconds', 'maximumMigrationDurationSeconds', 'max'],
  ];
  for (const [observedField, thresholdField, direction] of comparisons) {
    const observedValue = requireNumber(
      observed[observedField],
      `performance.hostedSlo.observed.${observedField}`
    );
    const threshold = requireNumber(
      thresholds[thresholdField],
      `performance.hostedSlo.thresholds.${thresholdField}`
    );
    assert(
      direction === 'min'
        ? observedValue >= threshold
        : observedValue <= threshold,
      `performance.hostedSlo.observed.${observedField} fails its frozen threshold`
    );
  }
  assert(hosted.status === 'PASS', 'performance.hostedSlo.status must be PASS');
  verifyEvidenceReferences(
    hosted.evidence,
    'performance.hostedSlo.evidence',
    artifactPaths
  );
}

function verifyPerformance(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles
) {
  const performance = requireRecord(manifest.performance, 'performance');
  const binding = verifyBoundArtifact(
    { path: performance.contractPath, sha256: performance.contractSha256 },
    'performance.contract',
    artifactHashes,
    artifactFiles
  );
  const frozenHash = sha256File(FROZEN_PERFORMANCE_CONTRACT_PATH);
  assert(
    binding.sha256 === frozenHash,
    'performance.contractSha256 repository drift'
  );
  assert(
    readFileSync(binding.absolutePath).equals(
      readFileSync(FROZEN_PERFORMANCE_CONTRACT_PATH)
    ),
    'performance contract artifact is not the repository frozen contract'
  );
  const contract = readJsonFile(binding.absolutePath, 'performance.contract');
  assert(performance.sampleCount === 3, 'performance.sampleCount must be 3');
  assert(
    performance.aggregation === 'median_of_exactly_3',
    'performance.aggregation drift'
  );
  assert(
    performance.pairedSampleOrder === 'before_after_after_before_before_after',
    'performance.pairedSampleOrder drift'
  );
  verifyMetricResults(
    performance.primaryExecutionResults,
    requireArray(
      contract.primaryExecutionGates,
      'performance.contract.primaryExecutionGates'
    ),
    'performance.primaryExecutionResults',
    artifactPaths
  );
  verifyMetricResults(
    performance.primaryWalResults,
    requireArray(
      contract.primaryWalGates,
      'performance.contract.primaryWalGates'
    ),
    'performance.primaryWalResults',
    artifactPaths
  );
  verifyMetricResults(
    performance.auxiliaryExecutionResults,
    requireArray(
      contract.auxiliaryExecutionGates,
      'performance.contract.auxiliaryExecutionGates'
    ),
    'performance.auxiliaryExecutionResults',
    artifactPaths
  );
  verifyMetricResults(
    performance.auxiliaryWalResults,
    requireArray(
      contract.auxiliaryWalGates,
      'performance.contract.auxiliaryWalGates'
    ),
    'performance.auxiliaryWalResults',
    artifactPaths
  );
  verifyNamedResults(
    performance.planResults,
    requireArray(contract.planGates, 'performance.contract.planGates'),
    'performance.planResults',
    artifactPaths
  );
  verifyNamedResults(
    performance.semanticResults,
    requireArray(contract.semanticGates, 'performance.contract.semanticGates'),
    'performance.semanticResults',
    artifactPaths
  );
  verifyHostedSlo(
    performance.hostedSlo,
    artifactPaths,
    artifactHashes,
    artifactFiles
  );
}

function verifyCommGates(manifest, artifactPaths) {
  const gates = requireArray(manifest.gates, 'gates');
  const byId = new Map();
  for (const [index, value] of gates.entries()) {
    const context = `gates[${String(index)}]`;
    const gate = requireRecord(value, context);
    const id = requireConcreteString(gate.id, `${context}.id`);
    assert(!byId.has(id), `${context}.id is duplicated`);
    byId.set(id, gate);
  }
  for (const id of requiredCommGateIds()) {
    assert(byId.has(id), `gates is missing ${id}`);
    verifyPassedGate(byId.get(id), `gates.${id}`, artifactPaths);
  }
}

function assertBindingMatch(actualPath, actualSha256, approved, context) {
  const normalizedPath = requireConcreteString(
    actualPath,
    `${context}.path`
  ).replaceAll('\\', '/');
  const sha256 = requireSha256(actualSha256, `${context}.sha256`);
  assert(normalizedPath === approved.path, `${context}.path approval mismatch`);
  assert(sha256 === approved.sha256, `${context}.sha256 approval mismatch`);
}

function verifyCommandLedger(manifest, approvedLedger) {
  const ledger = readJsonFile(
    approvedLedger.absolutePath,
    'approval.commandLedger'
  );
  assert(ledger.schemaVersion === 1, 'command ledger schemaVersion drift');
  const approvedCommands = requireArray(
    ledger.commands,
    'approval.commandLedger.commands'
  );
  const commands = requireArray(manifest.commands, 'commands');
  assert(
    commands.length === approvedCommands.length,
    'commands count approval mismatch'
  );
  for (const [index, value] of approvedCommands.entries()) {
    const context = `approval.commandLedger.commands[${String(index)}]`;
    const approved = requireRecord(value, context);
    const command = requireRecord(
      commands[index],
      `commands[${String(index)}]`
    );
    for (const field of ['id', 'redactedCommand']) {
      assert(
        command[field] === approved[field],
        `commands[${String(index)}].${field} approval mismatch`
      );
    }
  }
}

function verifyApprovedToolVersions(manifest, packet, artifactFiles) {
  const observed = requireRecord(manifest.toolVersions, 'toolVersions');
  const approved = requireRecord(
    packet.toolVersions,
    'approvalPacket.toolVersions'
  );
  const observedKeys = Object.keys(observed).sort();
  const approvedKeys = Object.keys(approved).sort();
  assert(
    observedKeys.length === approvedKeys.length &&
      observedKeys.every((value, index) => value === approvedKeys[index]),
    'toolVersions key set approval mismatch'
  );
  for (const tool of observedKeys) {
    const observedVersion = requireConcreteString(
      observed[tool],
      `toolVersions.${tool}`
    );
    const approvedVersion = requireConcreteString(
      approved[tool],
      `approvalPacket.toolVersions.${tool}`
    );
    assert(
      observedVersion === approvedVersion,
      `toolVersions.${tool} approval mismatch`
    );
  }
  const nodeVersion = requireConcreteString(observed.node, 'toolVersions.node');
  assert(
    /^v?24\.\d+\.\d+$/u.test(nodeVersion),
    'toolVersions.node must be an exact Node 24 version'
  );
  assert(
    observed.supabaseCli === '2.109.0',
    'toolVersions.supabaseCli must be 2.109.0'
  );
  const psqlVersion = requireConcreteString(observed.psql, 'toolVersions.psql');
  assert(
    /^psql \(PostgreSQL\) \d+(?:\.\d+){0,2}(?:\s.*)?$/u.test(psqlVersion),
    'toolVersions.psql must be an exact psql --version output'
  );
  const executingNodeVersion = `v${process.versions.node}`;
  assert(
    observed.node === executingNodeVersion,
    'toolVersions.node does not match the executing Node runtime'
  );

  const versionCommands = requireRecord(
    packet.toolVersionCommands,
    'approvalPacket.toolVersionCommands'
  );
  const commands = requireArray(manifest.commands, 'commands').map(
    (value, index) => requireRecord(value, `commands[${String(index)}]`)
  );
  for (const [tool, expectedCommand, expectedOutput] of [
    ['node', 'node --version', observed.node],
    ['supabaseCli', 'supabase --version', observed.supabaseCli],
    ['psql', 'psql --version', observed.psql],
  ]) {
    const commandId = requireConcreteString(
      versionCommands[tool],
      `approvalPacket.toolVersionCommands.${tool}`
    );
    const command = commands.find(value => value.id === commandId);
    assert(command, `tool version command is missing for ${tool}`);
    assert(
      command.redactedCommand === expectedCommand,
      `tool version command drift for ${tool}`
    );
    const stdoutPath = requireConcreteString(
      command.stdoutPath,
      `toolVersionCommands.${tool}.stdoutPath`
    ).replaceAll('\\', '/');
    const stderrPath = requireConcreteString(
      command.stderrPath,
      `toolVersionCommands.${tool}.stderrPath`
    ).replaceAll('\\', '/');
    const stdoutAbsolute = artifactFiles.get(stdoutPath);
    const stderrAbsolute = artifactFiles.get(stderrPath);
    assert(
      typeof stdoutAbsolute === 'string',
      `tool version stdout is not a hashed artifact for ${tool}`
    );
    assert(
      typeof stderrAbsolute === 'string',
      `tool version stderr is not a hashed artifact for ${tool}`
    );
    assert(
      readFileSync(stdoutAbsolute, 'utf8').trim() === expectedOutput,
      `tool version stdout mismatch for ${tool}`
    );
    assert(
      readFileSync(stderrAbsolute, 'utf8').trim() === '',
      `tool version stderr must be empty for ${tool}`
    );
  }
}

function verifyApprovalBinding(manifest, artifactHashes, artifactFiles) {
  const source = requireRecord(manifest.source, 'source');
  const approvalArtifact = verifyBoundArtifact(
    { path: source.approvalPacketPath, sha256: source.approvalPacketSha256 },
    'source.approvalPacket',
    artifactHashes,
    artifactFiles
  );
  const packet = readJsonFile(approvalArtifact.absolutePath, 'approvalPacket');
  assert(packet.schemaVersion === 1, 'approval packet schemaVersion drift');
  assert(
    packet.status === 'APPROVED',
    'approval packet status must be APPROVED'
  );
  const authorization = requireRecord(
    packet.authorization,
    'approvalPacket.authorization'
  );
  assert(
    authorization.isolatedStagingExecutionAuthorized === true,
    'approval packet does not authorize isolated staging execution'
  );
  for (const field of [
    'readyTransitionAuthorized',
    'mergeAuthorized',
    'productionConnectionAuthorized',
    'commercialReleaseAuthorized',
    'indexRetirementAuthorized',
  ]) {
    assert(
      authorization[field] === false,
      `approvalPacket.authorization.${field} must be false`
    );
  }

  const target = requireRecord(packet.target, 'approvalPacket.target');
  const gitHead = currentGitHead();
  assert(
    source.gitCommit === gitHead,
    'source.gitCommit does not match current Git HEAD'
  );
  assert(
    target.gitCommit === source.gitCommit,
    'approval target gitCommit mismatch'
  );
  assert(
    target.baseCommit === source.baseCommit,
    'approval target baseCommit mismatch'
  );
  assert(
    target.migrationHead === source.migrationHead,
    'approval target migrationHead mismatch'
  );

  const environment = requireRecord(manifest.environment, 'environment');
  const approvedEnvironment = requireRecord(
    packet.environment,
    'approvalPacket.environment'
  );
  for (const field of [
    'projectRef',
    'projectName',
    'region',
    'databaseTier',
    'databaseVersion',
  ]) {
    assert(
      approvedEnvironment[field] === environment[field],
      `environment.${field} approval mismatch`
    );
  }

  const bindings = requireRecord(packet.bindings, 'approvalPacket.bindings');
  const approvedBindings = new Map();
  for (const name of [
    'securityMatrix',
    'dataApiMatrix',
    'graphQlMatrix',
    'performanceContract',
    'hostedSloContract',
    'representativeDataContract',
    'commandLedger',
    'drContract',
    'integrationContract',
    'credentialContract',
  ]) {
    approvedBindings.set(
      name,
      verifyBoundArtifact(
        bindings[name],
        `approvalPacket.bindings.${name}`,
        artifactHashes,
        artifactFiles
      )
    );
  }

  const security = requireRecord(manifest.securityMatrix, 'securityMatrix');
  const dataApi = requireRecord(environment.dataApi, 'environment.dataApi');
  const graphQl = requireRecord(environment.graphQl, 'environment.graphQl');
  const performance = requireRecord(manifest.performance, 'performance');
  const hostedSlo = requireRecord(
    performance.hostedSlo,
    'performance.hostedSlo'
  );
  const representativeData = requireRecord(
    manifest.representativeData,
    'representativeData'
  );
  for (const [actual, approvedName, context] of [
    [security, 'securityMatrix', 'securityMatrix.contract'],
    [
      {
        contractPath: dataApi.matrixPath,
        contractSha256: dataApi.matrixSha256,
      },
      'dataApiMatrix',
      'environment.dataApi.matrix',
    ],
    [
      {
        contractPath: graphQl.matrixPath,
        contractSha256: graphQl.matrixSha256,
      },
      'graphQlMatrix',
      'environment.graphQl.matrix',
    ],
    [performance, 'performanceContract', 'performance.contract'],
    [hostedSlo, 'hostedSloContract', 'performance.hostedSlo.contract'],
    [
      representativeData,
      'representativeDataContract',
      'representativeData.contract',
    ],
  ]) {
    assertBindingMatch(
      actual.contractPath,
      actual.contractSha256,
      approvedBindings.get(approvedName),
      context
    );
  }

  const approval = requireRecord(packet.approval, 'approvalPacket.approval');
  const approvedAt = requireIsoTimestamp(
    approval.approvedAt,
    'approvalPacket.approval.approvedAt',
    { notFuture: true }
  );
  const expiresAt = requireIsoTimestamp(
    approval.expiresAt,
    'approvalPacket.approval.expiresAt',
    { future: true }
  );
  assert(
    Date.parse(approvedAt) < Date.parse(expiresAt),
    'approval expiry must follow approval'
  );
  assert(
    manifest.expiresAt === expiresAt,
    'manifest expiry does not match approval'
  );
  const approvalEvidencePath = requireConcreteString(
    approval.evidencePath,
    'approvalPacket.approval.evidencePath'
  ).replaceAll('\\', '/');
  const approvalEvidenceSha = requireSha256(
    approval.evidenceSha256,
    'approvalPacket.approval.evidenceSha256'
  );
  assert(
    artifactHashes.get(approvalEvidencePath) === approvalEvidenceSha,
    'approval evidence is not a matching hashed artifact'
  );

  const ownership = requireRecord(manifest.ownership, 'ownership');
  const owners = requireRecord(packet.owners, 'approvalPacket.owners');
  assert(
    owners.stagingOwner === ownership.owner,
    'ownership.owner approval mismatch'
  );
  assert(
    owners.stagingOperator === ownership.stagingOperator,
    'ownership.stagingOperator approval mismatch'
  );
  assert(
    owners.incidentOwner === ownership.incidentOwner,
    'ownership.incidentOwner approval mismatch'
  );
  assert(
    approval.approvedBy === ownership.approver,
    'ownership.approver approval mismatch'
  );

  verifyApprovedToolVersions(manifest, packet, artifactFiles);
  verifyCommandLedger(manifest, approvedBindings.get('commandLedger'));
  return { bindings: approvedBindings, approvedAt, expiresAt };
}

function verifyExecutionTiming(manifest, approvalWindow) {
  const timing = requireRecord(manifest.timing, 'timing');
  const startedAt = requireIsoTimestamp(timing.startedAt, 'timing.startedAt');
  const endedAt = requireIsoTimestamp(timing.endedAt, 'timing.endedAt');
  const approvedAtMs = Date.parse(approvalWindow.approvedAt);
  const expiresAtMs = Date.parse(approvalWindow.expiresAt);
  const startedAtMs = Date.parse(startedAt);
  const endedAtMs = Date.parse(endedAt);
  assert(
    approvedAtMs <= startedAtMs,
    'timing.startedAt precedes approvalPacket.approval.approvedAt'
  );
  assert(startedAtMs <= endedAtMs, 'timing ended before it started');
  assert(
    endedAtMs <= expiresAtMs,
    'timing.endedAt exceeds approvalPacket.approval.expiresAt'
  );
  requireNumber(timing.durationSeconds, 'timing.durationSeconds');

  const commands = requireArray(manifest.commands, 'commands');
  for (const [index, value] of commands.entries()) {
    const context = `commands[${String(index)}]`;
    const command = requireRecord(value, context);
    const commandStartedAt = requireIsoTimestamp(
      command.startedAt,
      `${context}.startedAt`
    );
    const commandEndedAt = requireIsoTimestamp(
      command.endedAt,
      `${context}.endedAt`
    );
    const commandStartedAtMs = Date.parse(commandStartedAt);
    const commandEndedAtMs = Date.parse(commandEndedAt);
    assert(
      approvedAtMs <= commandStartedAtMs,
      `${context}.startedAt precedes approval`
    );
    assert(
      startedAtMs <= commandStartedAtMs,
      `${context}.startedAt precedes manifest timing`
    );
    assert(
      commandStartedAtMs <= commandEndedAtMs,
      `${context} ended before it started`
    );
    assert(
      commandEndedAtMs <= endedAtMs,
      `${context}.endedAt exceeds manifest timing`
    );
    assert(
      commandEndedAtMs <= expiresAtMs,
      `${context}.endedAt exceeds approval expiry`
    );
  }
}

function verifyCredentialHandling(
  manifest,
  artifactPaths,
  artifactHashes,
  artifactFiles,
  approvedCredentialContract
) {
  const credential = requireRecord(
    manifest.credentialHandling,
    'credentialHandling'
  );
  assertBindingMatch(
    credential.contractPath,
    credential.contractSha256,
    approvedCredentialContract,
    'credentialHandling.contract'
  );
  const binding = verifyBoundArtifact(
    {
      path: credential.contractPath,
      sha256: credential.contractSha256,
    },
    'credentialHandling.contract',
    artifactHashes,
    artifactFiles
  );
  const contract = readJsonFile(
    binding.absolutePath,
    'credentialHandling.contract'
  );
  assert(
    contract.schemaVersion === 1,
    'credentialHandling contract schemaVersion drift'
  );
  for (const field of ['channel', 'storage', 'retrieval', 'logging']) {
    const observed = requireConcreteString(
      credential[field],
      `credentialHandling.${field}`
    );
    const approved = requireConcreteString(
      contract[field],
      `credentialHandling.contract.${field}`
    );
    assert(
      observed === approved,
      `credentialHandling.${field} approval mismatch`
    );
  }
  for (const [field, requiredValue] of [
    ['channel', 'process_environment'],
    ['storage', 'owner_approved_server_secret_store'],
    ['retrieval', 'ephemeral_server_subprocess_injection'],
    ['logging', 'redacted_variable_names_only'],
  ]) {
    assert(
      credential[field] === requiredValue,
      `credentialHandling.${field} violates the server-only credential boundary`
    );
  }
  for (const field of [
    'serverOnly',
    'browserExposureAllowed',
    'commandLineExposureAllowed',
    'evidenceExposureAllowed',
    'clientResponseExposureAllowed',
    'logExposureAllowed',
    'sourceControlExposureAllowed',
    'urlExposureAllowed',
  ]) {
    assert(
      typeof credential[field] === 'boolean' &&
        credential[field] === contract[field],
      `credentialHandling.${field} approval mismatch`
    );
  }
  assert(
    credential.serverOnly === true,
    'credentialHandling.serverOnly must be true'
  );
  for (const field of [
    'browserExposureAllowed',
    'commandLineExposureAllowed',
    'evidenceExposureAllowed',
    'clientResponseExposureAllowed',
    'logExposureAllowed',
    'sourceControlExposureAllowed',
    'urlExposureAllowed',
  ]) {
    assert(
      credential[field] === false,
      `credentialHandling.${field} must be false`
    );
  }
  assert(
    credential.status === 'PASS',
    'credentialHandling.status must be PASS'
  );
  verifyEvidenceReferences(
    credential.evidence,
    'credentialHandling.evidence',
    artifactPaths
  );
}

function verifyBackupRestore(
  manifest,
  artifactPaths,
  artifactHashes,
  approvedDrContract
) {
  const drContract = readJsonFile(
    approvedDrContract.absolutePath,
    'approvalPacket.drContract'
  );
  assert(drContract.schemaVersion === 1, 'DR contract schemaVersion drift');
  const backup = requireRecord(manifest.backup, 'backup');
  assert(backup.status === 'PASS', 'backup.status must be PASS');
  for (const field of ['method', 'scope', 'capturedAt', 'sourceWatermark']) {
    requireConcreteString(backup[field], `backup.${field}`);
  }
  assert(
    backup.method === drContract.backupMethod,
    'backup.method approval mismatch'
  );
  assert(
    backup.scope === drContract.backupScope,
    'backup.scope approval mismatch'
  );
  const backupPath = requireConcreteString(
    backup.artifactPath,
    'backup.artifactPath'
  ).replaceAll('\\', '/');
  const backupSha = requireSha256(
    backup.artifactSha256,
    'backup.artifactSha256'
  );
  assert(
    artifactPaths.has(backupPath),
    'backup.artifactPath is not a hashed artifact'
  );
  assert(
    artifactHashes.get(backupPath) === backupSha,
    'backup.artifactSha256 drift'
  );
  verifyEvidenceReferences(backup.evidence, 'backup.evidence', artifactPaths);

  const restore = requireRecord(manifest.restore, 'restore');
  assert(restore.status === 'PASS', 'restore.status must be PASS');
  for (const field of [
    'restoreSource',
    'restorePoint',
    'rtoStartEvent',
    'rtoEndEvent',
    'rtoMeasurementClockAndSource',
    'rpoWatermarkDefinition',
    'rpoObservationEvent',
    'rpoMeasurementClockAndSource',
  ]) {
    requireConcreteString(restore[field], `restore.${field}`);
  }
  for (const [manifestField, contractField] of [
    ['restoreSource', 'restoreSource'],
    ['restorePoint', 'restorePoint'],
    ['rtoStartEvent', 'rtoStartEvent'],
    ['rtoEndEvent', 'rtoEndEvent'],
    ['rtoMeasurementClockAndSource', 'rtoMeasurementClockAndSource'],
    ['rpoWatermarkDefinition', 'rpoWatermarkDefinition'],
    ['rpoObservationEvent', 'rpoObservationEvent'],
    ['rpoMeasurementClockAndSource', 'rpoMeasurementClockAndSource'],
  ]) {
    assert(
      restore[manifestField] === drContract[contractField],
      `restore.${manifestField} approval mismatch`
    );
  }
  const rtoThreshold = requireNumber(
    restore.rtoThresholdSeconds,
    'restore.rtoThresholdSeconds'
  );
  const rpoThreshold = requireNumber(
    restore.rpoThresholdSeconds,
    'restore.rpoThresholdSeconds'
  );
  assert(
    rtoThreshold === drContract.rtoThresholdSeconds,
    'restore.rtoThresholdSeconds approval mismatch'
  );
  assert(
    rpoThreshold === drContract.rpoThresholdSeconds,
    'restore.rpoThresholdSeconds approval mismatch'
  );
  const rto = requireNumber(restore.rtoSeconds, 'restore.rtoSeconds');
  const rpo = requireNumber(restore.rpoSeconds, 'restore.rpoSeconds');
  assert(
    rto <= rtoThreshold,
    'restore.rtoSeconds exceeds its frozen threshold'
  );
  assert(
    rpo <= rpoThreshold,
    'restore.rpoSeconds exceeds its frozen threshold'
  );
  verifyEvidenceReferences(restore.evidence, 'restore.evidence', artifactPaths);

  const postRestore = requireRecord(manifest.postRestore, 'postRestore');
  for (const field of [
    'schemaParity',
    'dataParity',
    'tenantIsolation',
    'authBoundary',
    'dataApiBoundary',
    'graphQlBoundary',
  ]) {
    verifyPassedGate(postRestore[field], `postRestore.${field}`, artifactPaths);
  }
}

function verifyIntegrationContract(manifest, approvedIntegration) {
  const contract = readJsonFile(
    approvedIntegration.absolutePath,
    'approvalPacket.integrationContract'
  );
  assert(
    contract.schemaVersion === 1,
    'integration contract schemaVersion drift'
  );
  const sideEffects = requireRecord(
    manifest.externalSideEffects,
    'externalSideEffects'
  );
  assert(
    sideEffects.mode === contract.mode,
    'externalSideEffects.mode approval mismatch'
  );
  assert(
    contract.realExternalSideEffectsAllowed === false,
    'integration contract must prohibit real external side effects'
  );
}

function verifyExecutionManifest(manifest, manifestDirectory) {
  assert(manifest.schemaVersion === 1, 'schemaVersion must be 1');
  requireConcreteString(manifest.qualificationId, 'qualificationId');
  const source = requireRecord(manifest.source, 'source');
  requireGitCommit(source.gitCommit, 'source.gitCommit');
  assert(
    requireGitCommit(source.baseCommit, 'source.baseCommit') === BASE_COMMIT,
    'source.baseCommit drift'
  );
  assert(source.migrationHead === MIGRATION_HEAD, 'source.migrationHead drift');
  requireConcreteString(source.approvalPacketPath, 'source.approvalPacketPath');
  requireSha256(source.approvalPacketSha256, 'source.approvalPacketSha256');

  const { artifactPaths, artifactHashes, artifactFiles } = verifyArtifacts(
    manifest,
    manifestDirectory
  );
  verifyCommands(manifest, artifactPaths, artifactHashes);

  const ownership = requireRecord(manifest.ownership, 'ownership');
  for (const field of [
    'owner',
    'approver',
    'stagingOperator',
    'incidentOwner',
  ]) {
    requireConcreteString(ownership[field], `ownership.${field}`);
  }
  const approvalWindow = verifyApprovalBinding(
    manifest,
    artifactHashes,
    artifactFiles
  );
  verifyEnvironment(manifest, artifactPaths, artifactHashes, artifactFiles);
  verifySecurityMatrix(manifest, artifactPaths, artifactHashes, artifactFiles);
  verifyRepresentativeData(
    manifest,
    artifactPaths,
    artifactHashes,
    artifactFiles
  );
  verifyPerformance(manifest, artifactPaths, artifactHashes, artifactFiles);
  verifyCommGates(manifest, artifactPaths);

  const toolVersions = requireRecord(manifest.toolVersions, 'toolVersions');
  assert(
    Object.keys(toolVersions).length > 0,
    'toolVersions must not be empty'
  );
  for (const [tool, version] of Object.entries(toolVersions)) {
    requireConcreteString(version, `toolVersions.${tool}`);
  }
  verifyExecutionTiming(manifest, approvalWindow);

  const rowCounts = requireRecord(manifest.rowCounts, 'rowCounts');
  assert(Object.keys(rowCounts).length > 0, 'rowCounts must not be empty');
  for (const [relation, count] of Object.entries(rowCounts)) {
    assert(
      Number.isInteger(count) && count >= 0,
      `rowCounts.${relation} must be an integer`
    );
  }
  const hashes = requireRecord(manifest.hashes, 'hashes');
  for (const field of [
    'logicalHash',
    'physicalHash',
    'schemaHash',
    'dataHash',
  ]) {
    requireSha256(hashes[field], `hashes.${field}`);
  }

  const sideEffects = requireRecord(
    manifest.externalSideEffects,
    'externalSideEffects'
  );
  assert(
    ['DISABLED', 'SANDBOXED'].includes(sideEffects.mode),
    'externalSideEffects.mode contains a placeholder or unresolved value'
  );
  assert(
    sideEffects.duplicateCount === 0,
    'externalSideEffects.duplicateCount must be zero'
  );
  verifyEvidenceReferences(
    sideEffects.evidence,
    'externalSideEffects.evidence',
    artifactPaths
  );
  verifyIntegrationContract(
    manifest,
    approvalWindow.bindings.get('integrationContract')
  );
  verifyCredentialHandling(
    manifest,
    artifactPaths,
    artifactHashes,
    artifactFiles,
    approvalWindow.bindings.get('credentialContract')
  );
  verifyBackupRestore(
    manifest,
    artifactPaths,
    artifactHashes,
    approvalWindow.bindings.get('drContract')
  );

  const privacy = requireRecord(manifest.privacyScan, 'privacyScan');
  assert(privacy.status === 'PASS', 'privacyScan.status must be PASS');
  requireIsoTimestamp(privacy.scannedAt, 'privacyScan.scannedAt');
  assert(
    privacy.scannerVersion === 'pr12-evidence-scan-v1',
    'privacyScan.scannerVersion drift'
  );
  assert(privacy.findingCount === 0, 'privacyScan.findingCount must be zero');
  const machineScanCommandId = requireConcreteString(
    privacy.machineScanCommandId,
    'privacyScan.machineScanCommandId'
  );
  const machineCommand = requireArray(manifest.commands, 'commands')
    .map((value, index) => requireRecord(value, `commands[${String(index)}]`))
    .find(command => command.id === machineScanCommandId);
  assert(machineCommand, 'privacyScan.machineScanCommandId is not in commands');
  assert(
    requireString(
      machineCommand.redactedCommand,
      'privacy scan command'
    ).includes('scan-pr12-evidence.mjs'),
    'privacyScan.machineScanCommandId is not the pinned scanner command'
  );
  verifyEvidenceReferences(
    privacy.machineScanEvidence,
    'privacyScan.machineScanEvidence',
    artifactPaths
  );
  assert(
    privacy.manualReviewStatus === 'PASS',
    'privacyScan.manualReviewStatus must be PASS'
  );
  requireConcreteString(privacy.manualReviewer, 'privacyScan.manualReviewer');
  requireIsoTimestamp(privacy.manualReviewedAt, 'privacyScan.manualReviewedAt');
  verifyEvidenceReferences(
    privacy.manualReviewEvidence,
    'privacyScan.manualReviewEvidence',
    artifactPaths
  );
  requireIsoTimestamp(manifest.expiresAt, 'expiresAt', { future: true });
}

function parseManifestPath(argv) {
  assert(
    argv.length === 2 && argv[0] === '--manifest' && argv[1],
    'Usage: verify-pr12-evidence-manifest.mjs --manifest <manifest.json>'
  );
  return path.resolve(REPO_ROOT, argv[1]);
}

function main() {
  const manifestPath = parseManifestPath(process.argv.slice(2));
  assert(existsSync(manifestPath), 'manifest does not exist');
  assert(
    !lstatSync(manifestPath).isSymbolicLink(),
    'manifest must not be a symbolic link'
  );
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const manifest = requireRecord(parsed, 'manifest');
  const status = requireString(manifest.status, 'status');
  assert(
    ['PASS', 'FAIL', 'NOT_RUN'].includes(status),
    'manifest status is unsupported'
  );
  if (EXECUTION_STATUSES.has(status)) {
    verifyExecutionManifest(manifest, path.dirname(manifestPath));
    console.log(
      'PR12 execution evidence manifest: PASS (semantic and artifact hashes verified).'
    );
    return;
  }
  console.log(
    `PR12 evidence manifest: ${status} (non-qualifying status accepted; no PASS inferred).`
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`PR12 evidence manifest: FAIL\n${message}`);
  process.exitCode = 1;
}
