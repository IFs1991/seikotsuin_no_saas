import {
  REPRESENTATIVE_FIXTURE_ACTOR_TOPOLOGY_SHA256,
  REPRESENTATIVE_FIXTURE_EXPLICIT_ROWS,
  REPRESENTATIVE_FIXTURE_PAYLOAD_AGGREGATE_SHA256,
  REPRESENTATIVE_FIXTURE_PAYLOAD_FINGERPRINTS,
  RepresentativeFixtureContractError,
  canonicalFixtureJson,
  compileRepresentativeFixturePlan,
  createRepresentativeFixturePayloadIdentity,
  fingerprintRepresentativeFixturePayloadIdentity,
} from './pr12-representative-fixture-contract.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const REPRESENTATIVE_FIXTURE_LOAD_ORDER = Object.freeze([
  'public.clinics',
  'auth.users',
  'auth.identities',
  'public.profiles',
  'public.staff',
  'public.user_permissions',
  'public.manager_clinic_assignments',
  'public.customers',
  'public.menus',
  'public.resources',
  'public.patients',
  'public.reservations',
  'public.ai_comments',
  'public.user_sessions',
  'public.security_events',
  'public.audit_logs',
  'public.staff_shifts',
  'public.staff_preferences',
]);

function fail(code) {
  throw new RepresentativeFixtureContractError(code);
}

function requirePlanSha256(value) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('FIXTURE_PLAN_SHA256_INVALID');
  }
  if (value !== compileRepresentativeFixturePlan().planSha256) {
    fail('FIXTURE_PLAN_SHA256_MISMATCH');
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function isRecord(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function requireExactRelationCounts(value) {
  if (
    !isRecord(value) ||
    canonicalFixtureJson(value) !==
      canonicalFixtureJson(REPRESENTATIVE_FIXTURE_EXPLICIT_ROWS)
  ) {
    fail('FIXTURE_RELATION_COUNTS_INVALID');
  }
  return value;
}

function requireExactPayloadIdentity(payload) {
  const fingerprints = fingerprintRepresentativeFixturePayloadIdentity(payload);
  if (
    canonicalFixtureJson(fingerprints.byRelationSha256) !==
      canonicalFixtureJson(REPRESENTATIVE_FIXTURE_PAYLOAD_FINGERPRINTS) ||
    fingerprints.aggregateSha256 !==
      REPRESENTATIVE_FIXTURE_PAYLOAD_AGGREGATE_SHA256 ||
    fingerprints.actorTopologySha256 !==
      REPRESENTATIVE_FIXTURE_ACTOR_TOPOLOGY_SHA256
  ) {
    fail('FIXTURE_PAYLOAD_IDENTITY_HASH_MISMATCH');
  }
  return fingerprints;
}

function deepCloneAndFreeze(value) {
  const clone = JSON.parse(JSON.stringify(value));
  const freeze = candidate => {
    if (Array.isArray(candidate)) {
      candidate.forEach(freeze);
      return Object.freeze(candidate);
    }
    if (isRecord(candidate)) {
      Object.values(candidate).forEach(freeze);
      return Object.freeze(candidate);
    }
    return candidate;
  };
  return freeze(clone);
}

export function createRepresentativeFixtureAdapterReadiness(fixturePlanSha256) {
  const planSha256 = requirePlanSha256(fixturePlanSha256);
  return {
    schemaVersion: 1,
    resultType: 'PR12_REPRESENTATIVE_FIXTURE_ADAPTER_READINESS',
    commandId: 'PR12-CMD-008',
    snapshotCommandId: 'PR12-CMD-009',
    fixturePlanSha256: planSha256,
    implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
    executionStatus: 'NOT_RUN',
    authorizedNow: false,
    remoteContactPerformed: false,
    remoteContactRequiredForFutureExecution: true,
    warningPolicy: 'ABORT',
    skipPolicy: 'ABORT',
    fallbackPolicy: 'ABORT',
    credentialInput: 'IN_MEMORY_ACTOR_MAP',
    rawCredentialsPersisted: false,
    rawRowsPersisted: false,
    forbiddenSourceEntrypoints: [
      'scripts/e2e/seed-e2e-data.mjs',
      'supabase/seed.sql',
    ],
  };
}

export function validateRepresentativeFixtureAdapterReadiness(readiness) {
  if (
    typeof readiness !== 'object' ||
    readiness === null ||
    Array.isArray(readiness)
  ) {
    fail('FIXTURE_ADAPTER_READINESS_INVALID');
  }
  if (readiness.warningPolicy !== 'ABORT') {
    fail('FIXTURE_WARNING_POLICY_INVALID');
  }
  if (readiness.skipPolicy !== 'ABORT') {
    fail('FIXTURE_SKIP_POLICY_INVALID');
  }
  if (readiness.fallbackPolicy !== 'ABORT') {
    fail('FIXTURE_FALLBACK_POLICY_INVALID');
  }
  if (
    readiness.rawCredentialsPersisted !== false ||
    readiness.rawRowsPersisted !== false
  ) {
    fail('FIXTURE_PERSISTENCE_POLICY_INVALID');
  }
  const expected = createRepresentativeFixtureAdapterReadiness(
    readiness.fixturePlanSha256
  );
  if (canonicalJson(readiness) !== canonicalJson(expected)) {
    fail('FIXTURE_ADAPTER_READINESS_INVALID');
  }
  return true;
}

export function compileRepresentativeFixtureLoadOperations(
  fixturePlanSha256,
  relationCountPayload,
  inMemoryPayloadIdentity
) {
  const planSha256 = requirePlanSha256(fixturePlanSha256);
  const counts = requireExactRelationCounts(relationCountPayload);
  const payloadFingerprints = requireExactPayloadIdentity(
    inMemoryPayloadIdentity
  );
  const operations = REPRESENTATIVE_FIXTURE_LOAD_ORDER.map(
    (relation, index) => ({
      sequence: index + 1,
      operation: 'PARAMETERIZED_BATCH_INSERT',
      relation,
      rowCount: counts[relation],
      payloadSha256: payloadFingerprints.byRelationSha256[relation],
      parameterSource: 'IN_MEMORY_ROW_PAYLOAD',
      warningPolicy: 'ABORT',
      skipPolicy: 'ABORT',
      fallbackPolicy: 'ABORT',
      persist: false,
    })
  );
  return {
    schemaVersion: 1,
    resultType: 'PR12_REPRESENTATIVE_FIXTURE_LOCAL_OPERATION_PLAN',
    fixturePlanSha256: planSha256,
    implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
    executionStatus: 'NOT_RUN',
    authorizedNow: false,
    remoteContactPerformed: false,
    retryCount: 0,
    relationCountPayload: { ...counts },
    payloadAggregateSha256: payloadFingerprints.aggregateSha256,
    actorTopologySha256: payloadFingerprints.actorTopologySha256,
    rawRowsPersisted: false,
    operations,
  };
}

function validateLocalOperationPlan(plan) {
  if (!isRecord(plan)) fail('FIXTURE_LOCAL_OPERATION_PLAN_INVALID');
  if (
    plan.executionStatus !== 'NOT_RUN' ||
    plan.authorizedNow !== false ||
    plan.remoteContactPerformed !== false ||
    plan.retryCount !== 0
  ) {
    fail('FIXTURE_LOCAL_OPERATION_PLAN_INVALID');
  }
  const canonicalPayloadIdentity = createRepresentativeFixturePayloadIdentity();
  const expected = compileRepresentativeFixtureLoadOperations(
    plan.fixturePlanSha256,
    plan.relationCountPayload,
    canonicalPayloadIdentity
  );
  if (canonicalJson(plan) !== canonicalJson(expected)) {
    fail('FIXTURE_LOCAL_OPERATION_PLAN_INVALID');
  }
  return expected;
}

function validateLocalDispatchResult(result, operation) {
  if (!isRecord(result)) fail('FIXTURE_LOCAL_DISPATCH_RESULT_INVALID');
  const keys = Object.keys(result).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== 'affectedRows' ||
    keys[1] !== 'status' ||
    result.status !== 'APPLIED' ||
    result.affectedRows !== operation.rowCount
  ) {
    fail('FIXTURE_LOCAL_DISPATCH_RESULT_INVALID');
  }
}

export async function executeRepresentativeFixtureLocalContract(
  operationPlan,
  inMemoryPayloadIdentity,
  dispatcher
) {
  const plan = validateLocalOperationPlan(operationPlan);
  const payloadFingerprints = requireExactPayloadIdentity(
    inMemoryPayloadIdentity
  );
  if (
    plan.payloadAggregateSha256 !== payloadFingerprints.aggregateSha256 ||
    plan.actorTopologySha256 !== payloadFingerprints.actorTopologySha256
  ) {
    fail('FIXTURE_PAYLOAD_IDENTITY_HASH_MISMATCH');
  }
  if (typeof dispatcher !== 'function') {
    fail('FIXTURE_LOCAL_DISPATCHER_INVALID');
  }
  let explicitRows = 0;
  for (const operation of plan.operations) {
    if (
      operation.payloadSha256 !==
      payloadFingerprints.byRelationSha256[operation.relation]
    ) {
      fail('FIXTURE_PAYLOAD_IDENTITY_HASH_MISMATCH');
    }
    const inMemoryRows = deepCloneAndFreeze(
      inMemoryPayloadIdentity[operation.relation]
    );
    const result = await dispatcher({ ...operation }, inMemoryRows);
    validateLocalDispatchResult(result, operation);
    explicitRows += operation.rowCount;
  }
  return {
    schemaVersion: 1,
    resultType: 'PR12_REPRESENTATIVE_FIXTURE_LOCAL_CONTRACT_RESULT',
    implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
    executionStatus: 'NOT_RUN',
    remoteContactPerformed: false,
    operationCount: plan.operations.length,
    explicitRows,
    payloadAggregateSha256: payloadFingerprints.aggregateSha256,
    actorTopologySha256: payloadFingerprints.actorTopologySha256,
    warningCount: 0,
    skipCount: 0,
    fallbackCount: 0,
    rawRowsPersisted: false,
    rawCredentialsPersisted: false,
  };
}
