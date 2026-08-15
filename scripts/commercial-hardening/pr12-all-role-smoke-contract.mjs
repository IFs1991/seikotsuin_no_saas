import { createHash } from 'node:crypto';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class AllRoleSmokeContractError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AllRoleSmokeContractError';
    this.code = code;
  }
}

function fail(code) {
  throw new AllRoleSmokeContractError(code);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

function isRecord(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function requireRecord(value, code) {
  requireCondition(isRecord(value), code);
  return value;
}

function requireSha256(value, code) {
  requireCondition(
    typeof value === 'string' && SHA256_PATTERN.test(value),
    code
  );
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

export function canonicalAllRoleSmokeJson(value) {
  return JSON.stringify(canonicalize(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export const ALL_ROLE_SMOKE_ROLE_CLASSES = Object.freeze([
  'anon',
  'authenticated',
  'service_role',
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
]);

export const ALL_ROLE_SMOKE_APPLICATION_ROLES = Object.freeze([
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
]);

export const ALL_ROLE_SMOKE_ACTOR_IDS = Object.freeze([
  'tenant-a-admin',
  'tenant-a-clinic-admin',
  'tenant-a-manager',
  'tenant-a-therapist',
  'tenant-a-staff',
  'tenant-b-staff',
  'no-clinic-staff',
]);

export const ALL_ROLE_SMOKE_REST_CASES = Object.freeze([
  Object.freeze({
    id: 'rest-tenant-a-admin-a-child-allow',
    role: 'admin',
    actorId: 'tenant-a-admin',
    relation: 'public.staff',
    clinicId: 'tenant-a-child',
    expectedRows: 3,
  }),
  Object.freeze({
    id: 'rest-tenant-a-admin-b-child-deny',
    role: 'admin',
    actorId: 'tenant-a-admin',
    relation: 'public.staff',
    clinicId: 'tenant-b-child',
    expectedRows: 0,
  }),
  Object.freeze({
    id: 'rest-tenant-a-clinic-admin-a-child-allow',
    role: 'clinic_admin',
    actorId: 'tenant-a-clinic-admin',
    relation: 'public.staff',
    clinicId: 'tenant-a-child',
    expectedRows: 3,
  }),
  Object.freeze({
    id: 'rest-tenant-a-clinic-admin-b-child-deny',
    role: 'clinic_admin',
    actorId: 'tenant-a-clinic-admin',
    relation: 'public.staff',
    clinicId: 'tenant-b-child',
    expectedRows: 0,
  }),
  Object.freeze({
    id: 'rest-tenant-a-manager-a-child-allow',
    role: 'manager',
    actorId: 'tenant-a-manager',
    relation: 'public.staff',
    clinicId: 'tenant-a-child',
    expectedRows: 3,
  }),
  Object.freeze({
    id: 'rest-tenant-a-manager-b-child-deny',
    role: 'manager',
    actorId: 'tenant-a-manager',
    relation: 'public.staff',
    clinicId: 'tenant-b-child',
    expectedRows: 0,
  }),
  Object.freeze({
    id: 'rest-tenant-a-therapist-a-child-allow',
    role: 'therapist',
    actorId: 'tenant-a-therapist',
    relation: 'public.staff',
    clinicId: 'tenant-a-child',
    expectedRows: 3,
  }),
  Object.freeze({
    id: 'rest-tenant-a-therapist-b-child-deny',
    role: 'therapist',
    actorId: 'tenant-a-therapist',
    relation: 'public.staff',
    clinicId: 'tenant-b-child',
    expectedRows: 0,
  }),
  Object.freeze({
    id: 'rest-tenant-a-staff-a-child-allow',
    role: 'staff',
    actorId: 'tenant-a-staff',
    relation: 'public.staff',
    clinicId: 'tenant-a-child',
    expectedRows: 3,
  }),
  Object.freeze({
    id: 'rest-tenant-a-staff-b-child-deny',
    role: 'staff',
    actorId: 'tenant-a-staff',
    relation: 'public.staff',
    clinicId: 'tenant-b-child',
    expectedRows: 0,
  }),
  Object.freeze({
    id: 'rest-tenant-b-staff-b-child-allow',
    role: 'staff',
    actorId: 'tenant-b-staff',
    relation: 'public.staff',
    clinicId: 'tenant-b-child',
    expectedRows: 1,
  }),
  Object.freeze({
    id: 'rest-tenant-b-staff-a-child-deny',
    role: 'staff',
    actorId: 'tenant-b-staff',
    relation: 'public.staff',
    clinicId: 'tenant-a-child',
    expectedRows: 0,
  }),
  Object.freeze({
    id: 'rest-no-clinic-staff-a-child-deny',
    role: 'staff',
    actorId: 'no-clinic-staff',
    relation: 'public.staff',
    clinicId: 'tenant-a-child',
    expectedRows: 0,
  }),
  Object.freeze({
    id: 'rest-no-clinic-staff-b-child-deny',
    role: 'staff',
    actorId: 'no-clinic-staff',
    relation: 'public.staff',
    clinicId: 'tenant-b-child',
    expectedRows: 0,
  }),
]);

const BROWSER_ROLE_EXPECTATIONS = Object.freeze({
  admin: Object.freeze({
    '/dashboard': 'ALLOW_PAGE',
    '/admin/mfa-setup': 'ALLOW_PAGE',
    '/manager': 'DENY_UI',
  }),
  clinic_admin: Object.freeze({
    '/dashboard': 'ALLOW_PAGE',
    '/admin/mfa-setup': 'ALLOW_PAGE',
    '/manager': 'DENY_UI',
  }),
  manager: Object.freeze({
    '/dashboard': 'ALLOW_PAGE',
    '/admin/mfa-setup': 'REDIRECT_UNAUTHORIZED',
    '/manager': 'ALLOW_PAGE',
  }),
  therapist: Object.freeze({
    '/dashboard': 'ALLOW_PAGE',
    '/admin/mfa-setup': 'REDIRECT_UNAUTHORIZED',
    '/manager': 'DENY_UI',
  }),
  staff: Object.freeze({
    '/dashboard': 'ALLOW_PAGE',
    '/admin/mfa-setup': 'REDIRECT_UNAUTHORIZED',
    '/manager': 'DENY_UI',
  }),
});

const ACTOR_BY_ROLE = Object.freeze({
  admin: 'tenant-a-admin',
  clinic_admin: 'tenant-a-clinic-admin',
  manager: 'tenant-a-manager',
  therapist: 'tenant-a-therapist',
  staff: 'tenant-a-staff',
});

export const ALL_ROLE_SMOKE_BROWSER_CASES = Object.freeze([
  ...ALL_ROLE_SMOKE_APPLICATION_ROLES.flatMap(role =>
    ['/dashboard', '/admin/mfa-setup', '/manager'].map(route =>
      Object.freeze({
        id: `browser-${role}-${route.slice(1).replaceAll('/', '-')}`,
        role,
        actorId: ACTOR_BY_ROLE[role],
        route,
        expected: BROWSER_ROLE_EXPECTATIONS[role][route],
      })
    )
  ),
  Object.freeze({
    id: 'browser-anon-dashboard-redirect',
    role: 'anon',
    actorId: 'anon',
    route: '/dashboard',
    expected: 'REDIRECT_SIGN_IN',
  }),
]);

function buildPlan(fixturePlanSha256) {
  return {
    schemaVersion: 1,
    contractId: 'PR12-ALL-ROLE-SMOKE-PLAN-001',
    commandId: 'PR12-CMD-013',
    componentId: 'PR12-CMD-013-ALL-ROLE-SMOKE',
    fixturePlanSha256,
    implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
    executionStatus: 'NOT_RUN',
    evaluationStatus: 'NOT_EVALUATED',
    authorizedNow: false,
    commGateStatus: 'NOT_RUN',
    commGatePassClaimed: false,
    roleClasses: ALL_ROLE_SMOKE_ROLE_CLASSES,
    applicationRoles: ALL_ROLE_SMOKE_APPLICATION_ROLES,
    actorIds: ALL_ROLE_SMOKE_ACTOR_IDS,
    authChecks: {
      perActor: ['SIGN_IN', 'REFRESH', 'API_AUTH_PROFILE'],
      actorCount: 7,
      rawJwtPersisted: false,
      rawPasswordPersisted: false,
    },
    restTargetBinding: {
      relation: 'public.staff',
      catalogSource: 'PR12-CMD-007A_FRESH_POST_REPLAY_CATALOG',
      ownerClassificationRequired: true,
      dataApiExposure: 'OBSERVE_DO_NOT_ASSUME',
      grants: 'OBSERVE_DO_NOT_ASSUME',
      rlsRequired: true,
      missingOrAmbiguous: 'ABORT',
    },
    restCases: ALL_ROLE_SMOKE_REST_CASES,
    browserCases: ALL_ROLE_SMOKE_BROWSER_CASES,
    serviceRoleBoundary: {
      browserExposure: 'FORBIDDEN',
      clientExposure: 'FORBIDDEN',
      directRestRpcGraphqlEvaluation: 'DEFERRED_TO_PR12_CMD_014',
    },
    evidenceContract: {
      retryCount: 0,
      storageStatePersisted: false,
      responseBodyPersisted: false,
      persistedFields: [
        'case_id',
        'actor_id',
        'role',
        'expected_outcome',
        'actual_outcome',
        'count',
        'fingerprint_sha256',
      ],
    },
  };
}

function requireExactCaseMatrix(actual, expected, code) {
  requireCondition(
    Array.isArray(actual) &&
      actual.length === expected.length &&
      canonicalAllRoleSmokeJson(actual) === canonicalAllRoleSmokeJson(expected),
    code
  );
}

export function validateAllRoleSmokePlan(plan) {
  const candidate = requireRecord(plan, 'ALL_ROLE_SMOKE_PLAN_INVALID');
  requireExactCaseMatrix(
    candidate.restCases,
    ALL_ROLE_SMOKE_REST_CASES,
    'ALL_ROLE_REST_MATRIX_INVALID'
  );
  requireExactCaseMatrix(
    candidate.browserCases,
    ALL_ROLE_SMOKE_BROWSER_CASES,
    'ALL_ROLE_BROWSER_MATRIX_INVALID'
  );
  const fixturePlanSha256 = requireSha256(
    candidate.fixturePlanSha256,
    'ALL_ROLE_FIXTURE_PLAN_SHA256_INVALID'
  );
  const expected = buildPlan(fixturePlanSha256);
  requireCondition(
    canonicalAllRoleSmokeJson(candidate) ===
      canonicalAllRoleSmokeJson(expected),
    'ALL_ROLE_SMOKE_PLAN_INVALID'
  );
  return true;
}

export function compileAllRoleSmokePlan(fixturePlanSha256) {
  const fixtureSha = requireSha256(
    fixturePlanSha256,
    'ALL_ROLE_FIXTURE_PLAN_SHA256_INVALID'
  );
  const plan = cloneJson(buildPlan(fixtureSha));
  validateAllRoleSmokePlan(plan);
  const canonicalPlan = canonicalAllRoleSmokeJson(plan);
  return {
    plan,
    canonicalPlan,
    planSha256: createHash('sha256')
      .update(canonicalPlan, 'utf8')
      .digest('hex'),
  };
}
