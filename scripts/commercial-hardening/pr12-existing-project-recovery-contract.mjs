import { createHash } from 'node:crypto';

export const PR12_RECOVERY_TARGET = Object.freeze({
  projectRef: 'weofpqtjisacuaiknnrm',
  organizationId: 'kbnsntifrawhimhfjrug',
  organizationSlug: 'kbnsntifrawhimhfjrug',
  projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
  region: 'ap-northeast-1',
  createdAt: '2026-08-01T15:59:37.300Z',
  directHost: 'db.weofpqtjisacuaiknnrm.supabase.co',
});

const PRODUCTION_PROJECT_REF = 'qnanuoqveidwvacvbhqp';
const PROJECT_REF_PATTERN = /^[a-z]{20}$/u;
const SYSTEM_IDENTIFIER_PATTERN = /^(?:0|[1-9][0-9]{0,19})$/u;
const STATUS_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/u;

export class Pr12ExistingProjectRecoveryError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Pr12ExistingProjectRecoveryError';
    this.code = code;
  }
}

function fail(code) {
  throw new Pr12ExistingProjectRecoveryError(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value, code) {
  if (!isRecord(value)) fail(code);
  return value;
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.length === 0) fail(code);
  return value;
}

function canonicalize(value) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('CANONICAL_VALUE_INVALID');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) fail('CANONICAL_VALUE_INVALID');
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

export function sha256Canonical(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

export function assertRecoveredStep01ContactCounts(valueInput) {
  const value = requireRecord(valueInput, 'RECOVERY_CONTACT_COUNTS_INVALID');
  const expected = {
    projectStateGetCount: 1,
    computeAddonGetCount: 1,
    publicCaGetCount: 1,
    directDatabaseConnectionCount: 1,
    postCount: 0,
    retryCount: 0,
  };
  const observedKeys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (
    observedKeys.length !== expectedKeys.length ||
    observedKeys.some((key, index) => key !== expectedKeys[index]) ||
    expectedKeys.some(key => value[key] !== expected[key])
  ) {
    fail('RECOVERY_CONTACT_COUNTS_INVALID');
  }
  return expected;
}

function normalizeProviderTimestamp(value) {
  const text = requireString(value, 'RECOVERY_TARGET_MISMATCH');
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) fail('RECOVERY_TARGET_MISMATCH');
  return new Date(milliseconds).toISOString();
}

export function assertAllowedRecoveryProviderRequest(methodInput, urlInput) {
  const method = requireString(methodInput, 'RECOVERY_ROUTE_NOT_ALLOWED');
  const rawUrl = requireString(urlInput, 'RECOVERY_ROUTE_NOT_ALLOWED');
  if (rawUrl.toLowerCase().includes(PRODUCTION_PROJECT_REF)) {
    fail('PRODUCTION_CONTACT_DENIED');
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail('RECOVERY_ROUTE_NOT_ALLOWED');
  }
  if (
    method !== 'GET' ||
    url.href !== rawUrl ||
    url.protocol !== 'https:' ||
    url.hostname !== 'api.supabase.com' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.hash !== ''
  ) {
    fail('RECOVERY_ROUTE_NOT_ALLOWED');
  }
  const basePath = `/v1/projects/${PR12_RECOVERY_TARGET.projectRef}`;
  if (url.pathname === basePath && url.search === '') {
    return 'EXISTING_PROJECT_STATE';
  }
  if (url.pathname === `${basePath}/billing/addons` && url.search === '') {
    return 'EXISTING_PROJECT_COMPUTE_ADDONS';
  }
  if (
    url.pathname === `${basePath}/api-keys` &&
    url.search === '?reveal=true'
  ) {
    return 'EXISTING_PROJECT_RUNTIME_API_KEYS';
  }
  fail('RECOVERY_ROUTE_NOT_ALLOWED');
}

export function projectResponseToRecoverySafeProjection(responseInput) {
  const response = requireRecord(responseInput, 'PROVIDER_RESPONSE_INVALID');
  const projectRef = requireString(response.ref, 'PROVIDER_RESPONSE_INVALID');
  const organizationId = requireString(
    response.organization_id,
    'PROVIDER_RESPONSE_INVALID'
  );
  const projectName = requireString(response.name, 'PROVIDER_RESPONSE_INVALID');
  const region = requireString(response.region, 'PROVIDER_RESPONSE_INVALID');
  const status = requireString(response.status, 'PROVIDER_RESPONSE_INVALID');
  if (
    !PROJECT_REF_PATTERN.test(projectRef) ||
    !STATUS_PATTERN.test(status) ||
    projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    organizationId !== PR12_RECOVERY_TARGET.organizationId ||
    projectName !== PR12_RECOVERY_TARGET.projectName ||
    region !== PR12_RECOVERY_TARGET.region
  ) {
    fail('RECOVERY_TARGET_MISMATCH');
  }
  const database = response.database;
  if (database !== null && database !== undefined) {
    const databaseRecord = requireRecord(database, 'PROVIDER_RESPONSE_INVALID');
    if (
      databaseRecord.host !== undefined &&
      databaseRecord.host !== PR12_RECOVERY_TARGET.directHost
    ) {
      fail('RECOVERY_TARGET_MISMATCH');
    }
  }
  const projection = {
    projectRef,
    organizationId,
    organizationSlug: PR12_RECOVERY_TARGET.organizationSlug,
    organizationSlugSource: 'OWNER_DECISION_TARGET',
    projectName,
    region,
    createdAt: normalizeProviderTimestamp(response.created_at),
    status,
    directHost: PR12_RECOVERY_TARGET.directHost,
    rawProviderBodyRetained: false,
  };
  if (projection.createdAt !== PR12_RECOVERY_TARGET.createdAt) {
    fail('RECOVERY_TARGET_MISMATCH');
  }
  return {
    ...projection,
    projectionSha256: sha256Canonical(projection),
  };
}

export function addonResponseToRecoveryComputeProjection(responseInput) {
  const response = requireRecord(responseInput, 'PROVIDER_RESPONSE_INVALID');
  const selected = requireRecord(
    response.selected_addons,
    'PROVIDER_RESPONSE_INVALID'
  );
  const compute = requireRecord(
    selected.compute_instance,
    'PROVIDER_RESPONSE_INVALID'
  );
  const variantId = requireString(compute.variant, 'PROVIDER_RESPONSE_INVALID');
  if (!/^[a-z][a-z0-9_]{1,63}$/u.test(variantId)) {
    fail('PROVIDER_RESPONSE_INVALID');
  }
  const tier = variantId === 'ci_large' ? 'LARGE' : variantId.toUpperCase();
  const projection = {
    verification: 'VERIFIED',
    tier,
    variantId,
    productionEquivalent: tier === 'LARGE',
  };
  return { ...projection, projectionSha256: sha256Canonical(projection) };
}

export function determineRecoveredStep01Result(input) {
  const request = requireRecord(input, 'RECOVERY_DECISION_INPUT_INVALID');
  const provider = requireRecord(
    request.providerProject,
    'RECOVERY_DECISION_INPUT_INVALID'
  );
  const database = requireRecord(
    request.database,
    'RECOVERY_DECISION_INPUT_INVALID'
  );
  const compute = requireRecord(
    request.compute,
    'RECOVERY_DECISION_INPUT_INVALID'
  );
  if (
    provider.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    provider.organizationId !== PR12_RECOVERY_TARGET.organizationId ||
    provider.organizationSlug !== PR12_RECOVERY_TARGET.organizationSlug ||
    provider.projectName !== PR12_RECOVERY_TARGET.projectName ||
    provider.region !== PR12_RECOVERY_TARGET.region ||
    provider.directHost !== PR12_RECOVERY_TARGET.directHost
  ) {
    fail('RECOVERY_TARGET_MISMATCH');
  }
  if (provider.status !== 'ACTIVE_HEALTHY') {
    fail('ISOLATED_PROJECT_NOT_READY');
  }
  if (
    database.status !== 'REACHABLE' ||
    database.connectionMode !== 'DIRECT' ||
    database.projectRef !== PR12_RECOVERY_TARGET.projectRef ||
    !SYSTEM_IDENTIFIER_PATTERN.test(database.systemIdentifier ?? '')
  ) {
    fail('DIRECT_DATABASE_UNREACHABLE');
  }
  if (
    !['VERIFIED', 'UNVERIFIED'].includes(compute.verification) ||
    (compute.verification === 'VERIFIED' &&
      (typeof compute.tier !== 'string' || compute.tier.length === 0)) ||
    (compute.verification === 'UNVERIFIED' && compute.tier !== null)
  ) {
    fail('COMPUTE_OBSERVATION_INVALID');
  }
  const computeTier =
    compute.verification === 'VERIFIED' ? compute.tier : 'UNVERIFIED';
  const performanceDeferred = computeTier !== 'LARGE';
  const result = {
    step: '01',
    canonicalStep: 'staging clone/isolated project',
    result: 'PASS',
    projectRef: PR12_RECOVERY_TARGET.projectRef,
    providerStatus: provider.status,
    databaseStatus: database.status,
    systemIdentifier: database.systemIdentifier,
    historicalAction003Disposition: 'RECOVERED_WITH_TOOLING_DEFECT',
    toolingDefect: 'PROVIDER_RESPONSE_INVALID',
    computeTier,
    functionalReplayAuthorizedByOwnerDecision: true,
    productionEquivalentPerformanceQualificationDeferred: performanceDeferred,
    nextStep: '02',
  };
  return { ...result, resultSha256: sha256Canonical(result) };
}
