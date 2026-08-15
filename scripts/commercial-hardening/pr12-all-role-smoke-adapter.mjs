import {
  AllRoleSmokeContractError,
  canonicalAllRoleSmokeJson,
  compileAllRoleSmokePlan,
  validateAllRoleSmokePlan,
} from './pr12-all-role-smoke-contract.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SECRET_KEY_PATTERN =
  /(authorization|bearer.?token|password|jwt|cookie|storage.?state|response.?body|secret)/i;
const SECRET_VALUE_PATTERN =
  /(bearer\s+[a-z0-9._~-]+|eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/i;
const ACTOR_ROLE_BY_ID = Object.freeze({
  'tenant-a-admin': 'admin',
  'tenant-a-clinic-admin': 'clinic_admin',
  'tenant-a-manager': 'manager',
  'tenant-a-therapist': 'therapist',
  'tenant-a-staff': 'staff',
  'tenant-b-staff': 'staff',
  'no-clinic-staff': 'staff',
});

function fail(code) {
  throw new AllRoleSmokeContractError(code);
}

function requireSha256(value, code) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail(code);
  return value;
}

function isRecord(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function scanSecretBearingValue(value, path = []) {
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERN.test(value))
      fail('ALL_ROLE_SECRET_BEARING_EVIDENCE');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanSecretBearingValue(entry, [...path, String(index)])
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      const isNegativePersistenceClaim =
        /persisted$/i.test(key) && entry === false;
      const isFingerprintOnlyJwtProjection =
        key === 'jwtOutput' && entry === 'FINGERPRINT_SHA256_ONLY';
      const isInMemoryStorageState =
        key === 'storageState' && entry === 'IN_MEMORY_ONLY';
      if (
        !isNegativePersistenceClaim &&
        !isFingerprintOnlyJwtProjection &&
        !isInMemoryStorageState
      ) {
        fail('ALL_ROLE_SECRET_BEARING_EVIDENCE');
      }
    }
    scanSecretBearingValue(entry, [...path, key]);
  }
}

export function assertSecretFreeSmokeEvidence(value) {
  scanSecretBearingValue(value);
  return true;
}

function operation(sequence, kind, fields) {
  return {
    sequence,
    operation: kind,
    ...fields,
  };
}

export function compileAllRoleSmokeAdapterPlan(plan, smokePlanSha256) {
  validateAllRoleSmokePlan(plan);
  const expectedSmokePlanSha256 = requireSha256(
    smokePlanSha256,
    'ALL_ROLE_SMOKE_PLAN_SHA256_INVALID'
  );
  const compiled = compileAllRoleSmokePlan(plan.fixturePlanSha256);
  if (compiled.planSha256 !== expectedSmokePlanSha256) {
    fail('ALL_ROLE_SMOKE_PLAN_SHA256_MISMATCH');
  }

  let sequence = 0;
  const operations = [];
  for (const actorId of plan.actorIds) {
    const role = ACTOR_ROLE_BY_ID[actorId];
    operations.push(
      operation(++sequence, 'AUTH_SIGN_IN', {
        actorId,
        role,
        credentialInput: 'IN_MEMORY_ACTOR_MAP',
        persist: false,
      }),
      operation(++sequence, 'AUTH_REFRESH', {
        actorId,
        role,
        jwtOutput: 'FINGERPRINT_SHA256_ONLY',
        persist: false,
      }),
      operation(++sequence, 'AUTH_PROFILE', {
        actorId,
        role,
        route: '/api/auth/profile',
        responseOutput: 'STATUS_ROLE_CLINIC_COUNT_ONLY',
        persist: false,
      })
    );
  }
  for (const restCase of plan.restCases) {
    operations.push(
      operation(++sequence, 'REST_STAFF_SELECT', {
        caseId: restCase.id,
        actorId: restCase.actorId,
        role: restCase.role,
        relation: restCase.relation,
        clinicId: restCase.clinicId,
        expectedRows: restCase.expectedRows,
        responseOutput: 'STATUS_ROW_COUNT_FINGERPRINT_ONLY',
        persist: false,
      })
    );
  }
  for (const browserCase of plan.browserCases) {
    if (browserCase.role === 'service_role') {
      fail('ALL_ROLE_SERVICE_ROLE_BROWSER_FORBIDDEN');
    }
    operations.push(
      operation(++sequence, 'BROWSER_ROUTE', {
        caseId: browserCase.id,
        actorId: browserCase.actorId,
        role: browserCase.role,
        route: browserCase.route,
        expected: browserCase.expected,
        storageState: 'IN_MEMORY_ONLY',
        persist: false,
      })
    );
  }
  operations.push(
    operation(++sequence, 'SERVICE_ROLE_CLIENT_BOUNDARY', {
      expected: 'NO_BROWSER_OR_CLIENT_EXPOSURE',
      remoteEvaluation: 'DEFERRED_TO_PR12_CMD_014',
      persist: false,
    })
  );

  const envelope = {
    schemaVersion: 1,
    resultType: 'PR12_ALL_ROLE_SMOKE_ADAPTER_PLAN',
    commandId: 'PR12-CMD-013',
    componentId: 'PR12-CMD-013-ALL-ROLE-SMOKE',
    fixturePlanSha256: plan.fixturePlanSha256,
    smokePlanSha256: expectedSmokePlanSha256,
    implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
    executionStatus: 'NOT_RUN',
    evaluationStatus: 'NOT_EVALUATED',
    authorizedNow: false,
    remoteContactPerformed: false,
    retryCount: 0,
    operations,
  };
  assertSecretFreeSmokeEvidence(envelope);
  return envelope;
}

function requireExactResultKeys(result, expectedKeys, code) {
  if (!isRecord(result)) fail(code);
  const actualKeys = Object.keys(result).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    !actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  ) {
    fail(code);
  }
  return result;
}

function validateLocalAdapterPlan(adapterPlan) {
  if (!isRecord(adapterPlan)) fail('ALL_ROLE_LOCAL_ADAPTER_PLAN_INVALID');
  if (
    adapterPlan.executionStatus !== 'NOT_RUN' ||
    adapterPlan.evaluationStatus !== 'NOT_EVALUATED' ||
    adapterPlan.authorizedNow !== false ||
    adapterPlan.remoteContactPerformed !== false ||
    adapterPlan.retryCount !== 0
  ) {
    fail('ALL_ROLE_LOCAL_ADAPTER_PLAN_INVALID');
  }
  const fixturePlanSha256 = requireSha256(
    adapterPlan.fixturePlanSha256,
    'ALL_ROLE_FIXTURE_PLAN_SHA256_INVALID'
  );
  const smoke = compileAllRoleSmokePlan(fixturePlanSha256);
  if (smoke.planSha256 !== adapterPlan.smokePlanSha256) {
    fail('ALL_ROLE_SMOKE_PLAN_SHA256_MISMATCH');
  }
  const expected = compileAllRoleSmokeAdapterPlan(smoke.plan, smoke.planSha256);
  if (
    canonicalAllRoleSmokeJson(adapterPlan) !==
    canonicalAllRoleSmokeJson(expected)
  ) {
    fail('ALL_ROLE_LOCAL_ADAPTER_PLAN_INVALID');
  }
  return expected;
}

function requireFingerprint(result, code) {
  requireSha256(result.fingerprintSha256, code);
}

function validateLocalOperationResult(operation, result) {
  assertSecretFreeSmokeEvidence(result);
  if (operation.operation === 'AUTH_SIGN_IN') {
    const record = requireExactResultKeys(
      result,
      ['outcome', 'fingerprintSha256'],
      'ALL_ROLE_AUTH_SIGN_IN_RESULT_INVALID'
    );
    if (record.outcome !== 'SIGNED_IN') {
      fail('ALL_ROLE_AUTH_SIGN_IN_RESULT_INVALID');
    }
    requireFingerprint(record, 'ALL_ROLE_AUTH_SIGN_IN_RESULT_INVALID');
    return;
  }
  if (operation.operation === 'AUTH_REFRESH') {
    const record = requireExactResultKeys(
      result,
      ['outcome', 'fingerprintSha256'],
      'ALL_ROLE_AUTH_REFRESH_RESULT_INVALID'
    );
    if (record.outcome !== 'REFRESHED') {
      fail('ALL_ROLE_AUTH_REFRESH_RESULT_INVALID');
    }
    requireFingerprint(record, 'ALL_ROLE_AUTH_REFRESH_RESULT_INVALID');
    return;
  }
  if (operation.operation === 'AUTH_PROFILE') {
    const record = requireExactResultKeys(
      result,
      ['outcome', 'role', 'clinicCount', 'fingerprintSha256'],
      'ALL_ROLE_AUTH_PROFILE_RESULT_INVALID'
    );
    if (
      record.outcome !== 'PROFILE_MATCHED' ||
      record.role !== operation.role ||
      !Number.isInteger(record.clinicCount) ||
      record.clinicCount < 0
    ) {
      fail('ALL_ROLE_AUTH_PROFILE_RESULT_INVALID');
    }
    requireFingerprint(record, 'ALL_ROLE_AUTH_PROFILE_RESULT_INVALID');
    return;
  }
  if (operation.operation === 'REST_STAFF_SELECT') {
    const record = requireExactResultKeys(
      result,
      ['outcome', 'rowCount', 'fingerprintSha256'],
      'ALL_ROLE_REST_RESULT_INVALID'
    );
    if (
      record.outcome !== 'ROW_COUNT' ||
      !Number.isInteger(record.rowCount) ||
      record.rowCount < 0
    ) {
      fail('ALL_ROLE_REST_RESULT_INVALID');
    }
    if (record.rowCount !== operation.expectedRows) {
      fail('ALL_ROLE_REST_ROW_COUNT_MISMATCH');
    }
    requireFingerprint(record, 'ALL_ROLE_REST_RESULT_INVALID');
    return;
  }
  if (operation.operation === 'BROWSER_ROUTE') {
    const record = requireExactResultKeys(
      result,
      ['outcome', 'fingerprintSha256'],
      'ALL_ROLE_BROWSER_RESULT_INVALID'
    );
    if (record.outcome !== operation.expected) {
      fail('ALL_ROLE_BROWSER_RESULT_INVALID');
    }
    requireFingerprint(record, 'ALL_ROLE_BROWSER_RESULT_INVALID');
    return;
  }
  if (operation.operation === 'SERVICE_ROLE_CLIENT_BOUNDARY') {
    const record = requireExactResultKeys(
      result,
      ['outcome', 'fingerprintSha256'],
      'ALL_ROLE_SERVICE_ROLE_BOUNDARY_RESULT_INVALID'
    );
    if (record.outcome !== operation.expected) {
      fail('ALL_ROLE_SERVICE_ROLE_BOUNDARY_RESULT_INVALID');
    }
    requireFingerprint(record, 'ALL_ROLE_SERVICE_ROLE_BOUNDARY_RESULT_INVALID');
    return;
  }
  fail('ALL_ROLE_LOCAL_OPERATION_INVALID');
}

function requireDispatchers(dispatchers) {
  if (!isRecord(dispatchers)) fail('ALL_ROLE_LOCAL_DISPATCHERS_INVALID');
  const expected = [
    'authProfile',
    'authRefresh',
    'authSignIn',
    'browserRoute',
    'restStaffSelect',
    'serviceRoleClientBoundary',
  ];
  const actual = Object.keys(dispatchers).sort();
  if (
    actual.length !== expected.length ||
    !actual.every((key, index) => key === expected[index]) ||
    !actual.every(key => typeof dispatchers[key] === 'function')
  ) {
    fail('ALL_ROLE_LOCAL_DISPATCHERS_INVALID');
  }
  return dispatchers;
}

function dispatcherForOperation(dispatchers, operation) {
  const keyByOperation = {
    AUTH_SIGN_IN: 'authSignIn',
    AUTH_REFRESH: 'authRefresh',
    AUTH_PROFILE: 'authProfile',
    REST_STAFF_SELECT: 'restStaffSelect',
    BROWSER_ROUTE: 'browserRoute',
    SERVICE_ROLE_CLIENT_BOUNDARY: 'serviceRoleClientBoundary',
  };
  const dispatcher = dispatchers[keyByOperation[operation.operation]];
  if (typeof dispatcher !== 'function') {
    fail('ALL_ROLE_LOCAL_OPERATION_INVALID');
  }
  return dispatcher;
}

export async function executeAllRoleSmokeLocalContract(
  adapterPlan,
  dispatchers
) {
  const plan = validateLocalAdapterPlan(adapterPlan);
  const localDispatchers = requireDispatchers(dispatchers);
  for (const currentOperation of plan.operations) {
    const dispatcher = dispatcherForOperation(
      localDispatchers,
      currentOperation
    );
    const result = await dispatcher({ ...currentOperation });
    validateLocalOperationResult(currentOperation, result);
  }
  return {
    schemaVersion: 1,
    resultType: 'PR12_ALL_ROLE_SMOKE_LOCAL_CONTRACT_RESULT',
    implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
    executionStatus: 'NOT_RUN',
    evaluationStatus: 'NOT_EVALUATED',
    remoteContactPerformed: false,
    commGateStatus: 'NOT_RUN',
    commGatePassClaimed: false,
    retryCount: 0,
    operationCount: plan.operations.length,
    rawJwtPersisted: false,
    rawPasswordPersisted: false,
    storageStatePersisted: false,
    responseBodyPersisted: false,
  };
}

export function createAllRoleSmokeReadinessEnvelope(
  fixturePlanSha256,
  smokePlanSha256
) {
  return {
    schemaVersion: 1,
    resultType: 'PR12_ALL_ROLE_SMOKE_READINESS',
    commandId: 'PR12-CMD-013',
    componentId: 'PR12-CMD-013-ALL-ROLE-SMOKE',
    fixturePlanSha256: requireSha256(
      fixturePlanSha256,
      'ALL_ROLE_FIXTURE_PLAN_SHA256_INVALID'
    ),
    smokePlanSha256: requireSha256(
      smokePlanSha256,
      'ALL_ROLE_SMOKE_PLAN_SHA256_INVALID'
    ),
    implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
    executionStatus: 'NOT_RUN',
    evaluationStatus: 'NOT_EVALUATED',
    authorizedNow: false,
    remoteContactPerformed: false,
    commGateStatus: 'NOT_RUN',
    commGatePassClaimed: false,
    retryCount: 0,
    rawJwtPersisted: false,
    rawPasswordPersisted: false,
    storageStatePersisted: false,
    responseBodyPersisted: false,
    serviceRoleBrowserExposure: 'FORBIDDEN',
  };
}

export function validateAllRoleSmokeReadinessEnvelope(readiness) {
  if (!isRecord(readiness)) fail('ALL_ROLE_READINESS_INVALID');
  if (readiness.retryCount !== 0) fail('ALL_ROLE_RETRY_FORBIDDEN');
  if (
    readiness.rawJwtPersisted !== false ||
    readiness.rawPasswordPersisted !== false ||
    readiness.storageStatePersisted !== false ||
    readiness.responseBodyPersisted !== false
  ) {
    fail('ALL_ROLE_PERSISTED_STATE_FORBIDDEN');
  }
  if (
    readiness.commGateStatus !== 'NOT_RUN' ||
    readiness.commGatePassClaimed !== false
  ) {
    fail('ALL_ROLE_COMM_PASS_FORBIDDEN');
  }
  if (
    readiness.executionStatus !== 'NOT_RUN' ||
    readiness.evaluationStatus !== 'NOT_EVALUATED' ||
    readiness.authorizedNow !== false ||
    readiness.remoteContactPerformed !== false
  ) {
    fail('ALL_ROLE_READINESS_STATE_INVALID');
  }
  const expected = createAllRoleSmokeReadinessEnvelope(
    readiness.fixturePlanSha256,
    readiness.smokePlanSha256
  );
  if (JSON.stringify(readiness) !== JSON.stringify(expected)) {
    fail('ALL_ROLE_READINESS_INVALID');
  }
  return true;
}
