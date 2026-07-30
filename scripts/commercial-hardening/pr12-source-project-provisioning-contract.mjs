import { createHash } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const ACTION_ID = 'PR12-ACTION-003';
export const CREATE_ENDPOINT = 'https://api.supabase.com/v1/projects';
export const PAYLOAD_SENTINEL = 'RUNTIME_SECRET_NOT_IN_EVIDENCE';
export const LARGE_ADDON_VARIANT = 'ci_large';
export const MAX_PROVIDER_BODY_BYTES = 1_048_576;
export const APPROVED_BASE_COMMIT = '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab';
export const FIXED_PROJECT_NAME =
  'seikotsuin-pr12-isolated-qualification-20260719';
export const TARGET_ORGANIZATION_NAME = "IFs1991's Org";
export const TARGET_ORGANIZATION_SLUG = 'kbnsntifrawhimhfjrug';
export const PRODUCTION_PROJECT_NAME = 'seikotsuin-management';
export const PRODUCTION_PROJECT_REF = 'qnanuoqveidwvacvbhqp';
export const PRODUCTION_PROJECT_ORIGIN =
  'https://qnanuoqveidwvacvbhqp.supabase.co';
export const SAME_ORGANIZATION_EXCEPTION_MODE =
  'PHASE1_SAME_ORGANIZATION_PRODUCTION_PROJECT_DENY_EXCEPTION_V1';
export const MONEY_SCALE = 10_000;
export const SOURCE_COMPUTE_RATE_USD_SCALED_PER_PROJECT_HOUR = 1_517;
export const SOURCE_MAXIMUM_COMPUTE_USD_SCALED = 109_224;
export const UNALLOCATED_AUTHORIZATION_HEADROOM_USD_SCALED = 390_776;
export const OWNER_AUTHORIZATION_CEILING_USD_SCALED = 500_000;
export const PHASE1_OWNER_PRINCIPAL_ID = 'owner:futoshi-iwasawa';
export const ACTION002_SEALED_EVIDENCE = Object.freeze({
  sourceGitCommit: '6edd6733756dd73e458cf705675895a5666c76e6',
  sourceBindingMaterialSha256:
    '56b07d3eb802d546df25be3b487e32b9c30f0aa7ac1f896bba483cb5e207eb3c',
  sourceRequestSha256:
    '95149b0f64407700298cbe842cbd15780300e9e357dc492f5d4d56e490490a8e',
  manifestSha256:
    '66db9ed2b7fdb7573b76e79273c71d95551cdb7385e0ca8ee21724c56399f582',
  terminalSha256:
    '3fec7d3156c52e862602e9adb115e460c6959caeba38d5a1b290abe41513782e',
});
export const OFFICIAL_PRICING_SOURCES = Object.freeze([
  Object.freeze({
    sourceId: 'COMPUTE_AND_DISK',
    url: 'https://supabase.com/docs/guides/platform/compute-and-disk',
  }),
  Object.freeze({
    sourceId: 'COMPUTE_USAGE',
    url: 'https://supabase.com/docs/guides/platform/manage-your-usage/compute',
  }),
  Object.freeze({
    sourceId: 'PRICING',
    url: 'https://supabase.com/pricing',
  }),
]);
export const PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_SECONDS = 300;
export const SOLE_OPERATOR_CONTROL_MODE =
  'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1';
export const DPAPI_PROVIDER_ID = 'WINDOWS_DPAPI_CURRENT_USER_V1';
export const DPAPI_RETRIEVAL_CHANNEL = 'CLAIM_BOUND_CAPTURED_STDOUT_BINARY_V1';
const WINDOWS_DRIVE_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const GOVERNANCE_RELATIVE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml';
const CONTRACT_RELATIVE_PATH =
  'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs';
const WRAPPER_RELATIVE_PATH =
  'scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs';
const ORGANIZATION_IDENTITY_CONTRACT_RELATIVE_PATH =
  'scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs';
const ORGANIZATION_IDENTITY_VERIFIER_RELATIVE_PATH =
  'scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs';

export const GENERIC_CREDENTIAL_NAMES = Object.freeze([
  'PR12_SUPABASE_ACCESS_TOKEN',
  'PR12_SOURCE_DB_PASSWORD',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'PGPASSWORD',
  'POSTGRES_PASSWORD',
]);
const FORBIDDEN_TRANSPORT_ENVIRONMENT_NAMES = new Set([
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'NODE_USE_ENV_PROXY',
  'NODE_OPTIONS',
  'NODE_DEBUG',
  'NODE_DEBUG_NATIVE',
  'NODE_USE_SYSTEM_CA',
  'UNDICI_DEBUG',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'GLOBAL_AGENT_HTTP_PROXY',
  'GLOBAL_AGENT_HTTPS_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'OPENSSL_CONF',
  'OPENSSL_MODULES',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'SSLKEYLOGFILE',
]);

const UNRESOLVED_VALUES = new Set([
  '',
  'NOT_CAPTURED',
  'NOT_IMPLEMENTED',
  'NOT_RUN',
  'UNASSIGNED',
  'UNKNOWN',
]);

const PROJECT_STATUSES = new Set([
  'INACTIVE',
  'ACTIVE_HEALTHY',
  'ACTIVE_UNHEALTHY',
  'COMING_UP',
  'UNKNOWN',
  'GOING_DOWN',
  'INIT_FAILED',
  'REMOVED',
  'RESTORING',
  'UPGRADING',
  'PAUSING',
  'RESTORE_FAILED',
  'RESTARTING',
  'PAUSE_FAILED',
  'RESIZING',
]);
const ADDON_TYPES = new Set([
  'custom_domain',
  'compute_instance',
  'pitr',
  'ipv4',
  'auth_mfa_phone',
  'auth_mfa_web_authn',
  'log_drain',
  'etl_pipeline',
]);
const ADDON_VARIANT_IDS = new Set([
  'ci_micro',
  'ci_small',
  'ci_medium',
  'ci_large',
  'ci_xlarge',
  'ci_2xlarge',
  'ci_4xlarge',
  'ci_8xlarge',
  'ci_12xlarge',
  'ci_16xlarge',
  'ci_24xlarge',
  'ci_24xlarge_optimized_cpu',
  'ci_24xlarge_optimized_memory',
  'ci_24xlarge_high_memory',
  'ci_48xlarge',
  'ci_48xlarge_optimized_cpu',
  'ci_48xlarge_optimized_memory',
  'ci_48xlarge_high_memory',
  'cd_default',
  'pitr_7',
  'pitr_14',
  'pitr_28',
  'ipv4_default',
  'auth_mfa_phone_default',
  'auth_mfa_web_authn_default',
  'log_drain_default',
  'etl_pipeline_default',
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const ORGANIZATION_SLUG_PATTERN = /^[A-Za-z0-9_-]+$/;
const CANONICAL_ORGANIZATION_SLUG_PATTERN = /^[a-z0-9_-]+$/;
const OPAQUE_SECRET_HANDLE_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i;
const JAVASCRIPT_SCHEME = ['java', 'script:'].join('');

export function hasAsciiControlCharacter(value) {
  if (typeof value !== 'string') return true;
  return Array.from(value).some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

export function isForbiddenAmbientCredentialName(nameInput) {
  if (typeof nameInput !== 'string') return true;
  const name = nameInput.toUpperCase();
  return (
    GENERIC_CREDENTIAL_NAMES.includes(name) ||
    FORBIDDEN_TRANSPORT_ENVIRONMENT_NAMES.has(name) ||
    /^(?:HTTP|HTTPS|ALL|NO)_PROXY$/.test(name) ||
    /^(?:NPM_CONFIG|YARN|PNPM)_(?:HTTP|HTTPS|ALL|NO_)?PROXY$/.test(name) ||
    name.includes('SUPABASE') ||
    /(?:^|_)(?:POSTGRES|POSTGRESQL|DATABASE|DB)(?:_|$)/.test(name) ||
    /^PG[A-Z0-9_]+$/.test(name) ||
    /(?:^|_)(?:DIRECT_URL|PRISMA_URL)(?:_|$)/.test(name) ||
    (/^PR12_/.test(name) &&
      /(?:TOKEN|PASSWORD|PASS|KEY|SECRET|CREDENTIAL|URL|URI|HOST|PORT|USER)/.test(
        name
      ))
  );
}

export class ProvisioningContractError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProvisioningContractError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProvisioningContractError(code);
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

function requireArray(value, code) {
  requireCondition(Array.isArray(value), code);
  return value;
}

function requireString(value, code) {
  requireCondition(typeof value === 'string', code);
  return value;
}

function requireConcreteString(value, code) {
  const text = requireString(value, code);
  requireCondition(text === text.trim(), code);
  requireCondition(!UNRESOLVED_VALUES.has(text.toUpperCase()), code);
  return text;
}

function requireCanonicalOwnerId(value, code) {
  const ownerId = requireConcreteString(value, code);
  requireCondition(
    ownerId === ownerId.toLowerCase() &&
      /^[a-z0-9][a-z0-9._@+:-]*$/.test(ownerId) &&
      ownerId === PHASE1_OWNER_PRINCIPAL_ID,
    code
  );
  return ownerId;
}

function requireSha256(value, code) {
  const text = requireConcreteString(value, code);
  requireCondition(SHA256_PATTERN.test(text), code);
  return text;
}

function requireGitSha(value, code) {
  const text = requireConcreteString(value, code);
  requireCondition(GIT_SHA_PATTERN.test(text), code);
  return text;
}

function requireBoolean(value, expected, code) {
  requireCondition(value === expected, code);
}

function requireFiniteNumber(value, code) {
  requireCondition(typeof value === 'number' && Number.isFinite(value), code);
  return value;
}

function requireNonNegativeInteger(value, code) {
  requireCondition(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    code
  );
  return value;
}

function validateExternalFileIdentity(
  identityInput,
  expectedContentSha256,
  code,
  expectedPath = null
) {
  const identity = assertExactKeys(
    identityInput,
    [
      'pathSha256',
      'resolvedPathSha256',
      'device',
      'inode',
      'size',
      'modifiedAtMilliseconds',
      'contentSha256',
    ],
    code
  );
  const expectedPathSha256 =
    expectedPath === null
      ? null
      : sha256Text(
          path.win32.resolve(expectedPath).replaceAll('\\', '/').toLowerCase()
        );
  requireCondition(
    SHA256_PATTERN.test(identity.pathSha256) &&
      SHA256_PATTERN.test(identity.resolvedPathSha256) &&
      identity.resolvedPathSha256 === identity.pathSha256 &&
      (expectedPathSha256 === null ||
        identity.pathSha256 === expectedPathSha256) &&
      /^\d+$/.test(requireConcreteString(identity.device, code)) &&
      /^\d+$/.test(requireConcreteString(identity.inode, code)) &&
      Number.isSafeInteger(identity.size) &&
      identity.size >= 0 &&
      typeof identity.modifiedAtMilliseconds === 'number' &&
      Number.isFinite(identity.modifiedAtMilliseconds) &&
      identity.modifiedAtMilliseconds >= 0 &&
      identity.contentSha256 === expectedContentSha256,
    code
  );
  return identity;
}

function validateDirectoryFingerprint(
  fingerprintInput,
  expectedPathSha256,
  code
) {
  const fingerprint = assertExactKeys(
    fingerprintInput,
    ['pathSha256', 'resolvedPathSha256', 'device', 'inode', 'snapshotSha256'],
    code
  );
  requireCondition(
    fingerprint.pathSha256 === expectedPathSha256 &&
      fingerprint.resolvedPathSha256 === fingerprint.pathSha256 &&
      /^\d+$/.test(requireConcreteString(fingerprint.device, code)) &&
      /^\d+$/.test(requireConcreteString(fingerprint.inode, code)) &&
      SHA256_PATTERN.test(fingerprint.snapshotSha256),
    code
  );
  return fingerprint;
}

function parseTimestamp(value, code) {
  const text = requireConcreteString(value, code);
  const milliseconds = Date.parse(text);
  requireCondition(
    Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === text,
    code
  );
  return milliseconds;
}

export function derivePricingExecutionFreshThrough(pricingEvidenceInput) {
  const pricingEvidence = requireRecord(
    pricingEvidenceInput,
    'PRICING_EVIDENCE_INVALID'
  );
  const sources = requireArray(
    pricingEvidence.officialSources,
    'PRICING_EVIDENCE_INVALID'
  );
  const freshness = requireRecord(
    pricingEvidence.freshness,
    'PRICING_EVIDENCE_INVALID'
  );
  requireCondition(
    sources.length === OFFICIAL_PRICING_SOURCES.length &&
      freshness.maximumAgeAtApprovalSeconds === 3600,
    'PRICING_EVIDENCE_INVALID'
  );
  const earliestRetrievedAt = Math.min(
    ...sources.map(sourceInput => {
      const source = requireRecord(sourceInput, 'PRICING_EVIDENCE_INVALID');
      return parseTimestamp(source.retrievedAt, 'PRICING_EVIDENCE_INVALID');
    })
  );
  return new Date(
    earliestRetrievedAt + freshness.maximumAgeAtApprovalSeconds * 1000
  ).toISOString();
}

function normalizeProviderTimestamp(value, code) {
  const text = requireConcreteString(value, code);
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      text
    );
  requireCondition(match !== null, code);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
  ].map(Number);
  const localCalendar = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second)
  );
  requireCondition(
    localCalendar.getUTCFullYear() === year &&
      localCalendar.getUTCMonth() === month - 1 &&
      localCalendar.getUTCDate() === day &&
      localCalendar.getUTCHours() === hour &&
      localCalendar.getUTCMinutes() === minute &&
      localCalendar.getUTCSeconds() === second,
    code
  );
  const milliseconds = Date.parse(text);
  requireCondition(Number.isFinite(milliseconds), code);
  return new Date(milliseconds).toISOString();
}

function requireOpaqueSecretHandle(value, code) {
  const handle = requireConcreteString(value, code);
  requireCondition(
    OPAQUE_SECRET_HANDLE_PATTERN.test(handle) &&
      !handle.includes('\\') &&
      !hasAsciiControlCharacter(handle),
    code
  );
  let parsed;
  try {
    parsed = new URL(handle);
  } catch {
    fail(code);
  }
  requireCondition(
    ![
      'http:',
      'https:',
      'file:',
      'data:',
      JAVASCRIPT_SCHEME,
      'ws:',
      'wss:',
    ].includes(parsed.protocol.toLowerCase()) &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.host.length > 0 &&
      parsed.pathname.length > 1,
    code
  );
  return handle;
}

function assertExactKeys(value, expectedKeys, code) {
  const record = requireRecord(value, code);
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  requireCondition(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    code
  );
  return record;
}

function assertAllowedKeys(value, allowedKeys, code) {
  const record = requireRecord(value, code);
  const allowed = new Set(allowedKeys);
  requireCondition(
    Object.keys(record).every(key => allowed.has(key)),
    code
  );
  return record;
}

export function canonicalizeJson(value) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    requireCondition(Number.isFinite(value), 'CANONICAL_JSON_INVALID');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalizeJson(value[key])])
    );
  }
  fail('CANONICAL_JSON_INVALID');
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalizeJson(value));
}

export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function sha256Canonical(value) {
  return sha256Text(canonicalJson(value));
}

function decodeUrlComponentRepeatedly(value) {
  let decoded = value;
  for (let count = 0; count < 3; count += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      fail('OUTBOUND_URL_INVALID');
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  return decoded;
}

function requireExactSearchParameters(url, expected) {
  const entries = [...url.searchParams.entries()];
  requireCondition(
    entries.length === Object.keys(expected).length,
    'OUTBOUND_ROUTE_NOT_ALLOWED'
  );
  for (const [key, expectedValue] of Object.entries(expected)) {
    const values = url.searchParams.getAll(key);
    requireCondition(
      values.length === 1 && values[0] === expectedValue,
      'OUTBOUND_ROUTE_NOT_ALLOWED'
    );
  }
}

export function assertAllowedManagementApiRequest(requestInput) {
  const request = assertExactKeys(
    requestInput,
    ['url', 'method', 'binding', 'createdProjectRef'],
    'OUTBOUND_REQUEST_INVALID'
  );
  const binding = requireRecord(request.binding, 'BINDING_INVALID');
  const environment = requireRecord(
    binding.environmentProposal,
    'ENVIRONMENT_PROPOSAL_INVALID'
  );
  validateSameOrganizationException(binding);
  requireCondition(
    environment.organizationSlug === TARGET_ORGANIZATION_SLUG,
    'TARGET_ORGANIZATION_INVALID'
  );
  const method = requireString(request.method, 'OUTBOUND_REQUEST_INVALID');
  requireCondition(
    method === 'GET' || method === 'POST',
    'OUTBOUND_ROUTE_NOT_ALLOWED'
  );
  const rawUrl =
    request.url instanceof URL
      ? request.url.href
      : requireString(request.url, 'OUTBOUND_URL_INVALID');
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail('OUTBOUND_URL_INVALID');
  }
  const productionHost = new URL(PRODUCTION_PROJECT_ORIGIN).hostname;
  const decodedRouteMaterial = decodeUrlComponentRepeatedly(
    `${url.pathname}${url.search}`
  ).toLowerCase();
  requireCondition(
    url.hostname.toLowerCase() !== productionHost &&
      !rawUrl.toLowerCase().includes(PRODUCTION_PROJECT_REF) &&
      !decodedRouteMaterial.includes(PRODUCTION_PROJECT_REF),
    'PRODUCTION_CONTACT_DENIED'
  );
  requireCondition(
    rawUrl === url.href &&
      url.protocol === 'https:' &&
      url.origin === 'https://api.supabase.com' &&
      url.hostname === 'api.supabase.com' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.hash === '',
    'OUTBOUND_URL_INVALID'
  );

  if (method === 'GET' && url.pathname === '/v1/projects/available-regions') {
    requireExactSearchParameters(url, {
      organization_slug: TARGET_ORGANIZATION_SLUG,
      desired_instance_size: 'large',
    });
    return 'TARGET_AVAILABLE_REGIONS';
  }
  if (
    method === 'GET' &&
    url.pathname === `/v1/organizations/${TARGET_ORGANIZATION_SLUG}/projects`
  ) {
    requireExactSearchParameters(url, {
      offset: url.searchParams.get('offset'),
      limit: '100',
      sort: 'name_asc',
    });
    requireCondition(
      /^(?:0|[1-9][0-9]*)$/.test(url.searchParams.get('offset') ?? ''),
      'OUTBOUND_ROUTE_NOT_ALLOWED'
    );
    return 'TARGET_ORGANIZATION_PROJECT_LIST';
  }
  if (method === 'POST' && url.href === CREATE_ENDPOINT && url.search === '') {
    requireCondition(
      request.createdProjectRef === null,
      'OUTBOUND_ROUTE_NOT_ALLOWED'
    );
    return 'CREATE_SOURCE_PROJECT';
  }
  const addonMatch = /^\/v1\/projects\/([a-z]{20})\/billing\/addons$/.exec(
    url.pathname
  );
  if (method === 'GET' && addonMatch !== null && url.search === '') {
    const createdProjectRef = requireString(
      request.createdProjectRef,
      'CREATED_PROJECT_REF_NOT_BOUND'
    );
    requireCondition(
      PROJECT_REF_PATTERN.test(createdProjectRef) &&
        createdProjectRef !== PRODUCTION_PROJECT_REF &&
        addonMatch[1] === createdProjectRef,
      addonMatch[1] === PRODUCTION_PROJECT_REF
        ? 'PRODUCTION_CONTACT_DENIED'
        : 'CREATED_PROJECT_REF_NOT_BOUND'
    );
    return 'CREATED_SOURCE_PROJECT_COMPUTE_ADDONS';
  }
  fail('OUTBOUND_ROUTE_NOT_ALLOWED');
}

export function journalDirectoryFingerprint(directoryInput) {
  const directory = requireConcreteString(
    directoryInput,
    'ACTION_JOURNAL_DIRECTORY_INVALID'
  );
  requireCondition(
    WINDOWS_DRIVE_ABSOLUTE_PATH_PATTERN.test(directory) &&
      !directory.startsWith('\\\\'),
    'ACTION_JOURNAL_DIRECTORY_INVALID'
  );
  const normalized = path.win32
    .resolve(directory)
    .replaceAll('\\', '/')
    .toLowerCase();
  return sha256Text(normalized);
}

export function buildBindingMaterial(binding) {
  const record = requireRecord(binding, 'BINDING_INVALID');
  const material = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'approval')
  );
  return canonicalizeJson(material);
}

function requireNoUnresolvedValues(value, code) {
  if (typeof value === 'string') {
    requireCondition(value === value.trim(), code);
    requireCondition(!UNRESOLVED_VALUES.has(value.toUpperCase()), code);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => requireNoUnresolvedValues(item, code));
    return;
  }
  if (isRecord(value)) {
    Object.values(value).forEach(item => requireNoUnresolvedValues(item, code));
  }
}

function requireSafeEvidencePath(value, code) {
  const text = requireConcreteString(value, code);
  requireCondition(!path.isAbsolute(text), code);
  requireCondition(!text.includes('\\'), code);
  requireCondition(!text.split('/').includes('..'), code);
  return text;
}

function validateSameOrganizationException(binding) {
  const exception = assertExactKeys(
    binding.sameOrganizationException,
    [
      'mode',
      'localPreparationAuthorized',
      'localPreparationAuthorizedOn',
      'targetOrganizationName',
      'targetOrganizationSlug',
      'productionOrganizationId',
      'productionOrganizationSlug',
      'productionProjectName',
      'productionProjectRef',
      'productionProjectOrigin',
      'organizationProjectEnumerationAllowed',
      'organizationProjectEnumerationDataMinimization',
      'productionProjectSpecificManagementApiContactAuthorized',
      'productionProjectDataPlaneContactAuthorized',
      'productionDatabaseContactAuthorized',
      'productionCredentialAccessAuthorized',
      'sharedOrganizationRiskAcceptanceRequiredForFinalAction',
    ],
    'SAME_ORGANIZATION_EXCEPTION_INVALID'
  );
  const environment = requireRecord(
    binding.environmentProposal,
    'ENVIRONMENT_PROPOSAL_INVALID'
  );
  requireCondition(
    exception.mode === SAME_ORGANIZATION_EXCEPTION_MODE &&
      exception.localPreparationAuthorized === true &&
      exception.localPreparationAuthorizedOn === '2026-07-25' &&
      exception.targetOrganizationName === TARGET_ORGANIZATION_NAME &&
      exception.targetOrganizationSlug === TARGET_ORGANIZATION_SLUG &&
      exception.productionOrganizationId === environment.organizationId &&
      exception.productionOrganizationSlug === TARGET_ORGANIZATION_SLUG &&
      exception.productionProjectName === PRODUCTION_PROJECT_NAME &&
      exception.productionProjectRef === PRODUCTION_PROJECT_REF &&
      exception.productionProjectOrigin === PRODUCTION_PROJECT_ORIGIN &&
      exception.organizationProjectEnumerationAllowed === true &&
      exception.organizationProjectEnumerationDataMinimization ===
        'PRODUCTION_REF_ONLY_IN_MEMORY_NO_RAW_BODY_OR_METADATA_PERSISTENCE' &&
      exception.productionProjectSpecificManagementApiContactAuthorized ===
        false &&
      exception.productionProjectDataPlaneContactAuthorized === false &&
      exception.productionDatabaseContactAuthorized === false &&
      exception.productionCredentialAccessAuthorized === false &&
      exception.sharedOrganizationRiskAcceptanceRequiredForFinalAction === true,
    'SAME_ORGANIZATION_EXCEPTION_INVALID'
  );
  return exception;
}

function validateBindingShape(binding) {
  assertExactKeys(
    binding,
    [
      'schemaVersion',
      'phase',
      'status',
      'authorization',
      'provisioningAction',
      'organizationIdentityEvidence',
      'target',
      'governanceProposal',
      'implementationContracts',
      'credentialControls',
      'approvedRequest',
      'environmentProposal',
      'sameOrganizationException',
      'initialPlatformPosture',
      'duplicateAndFailurePolicy',
      'lifecycle',
      'retentionAndCleanupDecision',
      'cost',
      'approval',
      'owners',
      'operatorControl',
      'evidenceContract',
      'notes',
    ],
    'BINDING_SCHEMA_INVALID'
  );
  const exact = (value, keys, code = 'BINDING_SCHEMA_INVALID') =>
    assertExactKeys(value, keys, code);
  exact(binding.authorization, [
    'sourceProjectProvisioningAuthorized',
    'isolatedStagingConnectionAuthorized',
    'isolatedStagingExecutionAuthorized',
    'restoreProjectCreationAuthorized',
    'productionConnectionAuthorized',
    'readyTransitionAuthorized',
    'mergeAuthorized',
    'commercialReleaseAuthorized',
    'indexRetirementAuthorized',
  ]);
  exact(binding.provisioningAction, [
    'actionId',
    'resultType',
    'method',
    'httpMethod',
    'endpoint',
    'maximumPostAttempts',
    'automaticPostRetryAllowed',
    'providerIdempotencyKeyDocumented',
    'remoteContact',
    'mutating',
    'mutationScope',
    'databaseConnectionAuthorized',
    'requestTimeoutMilliseconds',
    'readinessObservationMaximumSeconds',
    'readinessPollIntervalSeconds',
    'providerCreatedAtMaximumClockSkewSeconds',
    'scheduledExecutionAt',
  ]);
  exact(binding.organizationIdentityEvidence, [
    'status',
    'actionId',
    'terminalState',
    'sourceGitCommit',
    'sourceBindingMaterialSha256',
    'sourceRequestSha256',
    'evidenceDirectoryName',
    'manifestSha256',
    'terminalSha256',
    'claimSha256',
    'getIntentSha256',
    'completedAt',
    'sealedAt',
    'organization',
    'providerResponseBodySha256',
    'providerSafeProjectionSha256',
    'providerObservedAt',
    'remoteContactCount',
    'requestAttemptCount',
    'automaticRetryCount',
    'evidenceDirectoryFingerprint',
    'journalDirectoryFingerprint',
  ]);
  exact(binding.organizationIdentityEvidence.organization, [
    'organizationId',
    'organizationName',
    'organizationSlug',
    'plan',
  ]);
  for (const fingerprint of [
    binding.organizationIdentityEvidence.evidenceDirectoryFingerprint,
    binding.organizationIdentityEvidence.journalDirectoryFingerprint,
  ]) {
    exact(fingerprint, [
      'pathSha256',
      'resolvedPathSha256',
      'device',
      'inode',
      'snapshotSha256',
    ]);
  }
  exact(binding.target, ['gitCommit', 'baseCommit', 'cleanWorktreeRequired']);
  exact(binding.governanceProposal, ['path', 'sha256']);
  exact(binding.implementationContracts, [
    'contractPath',
    'contractSha256',
    'wrapperPath',
    'wrapperSha256',
    'organizationIdentityContractPath',
    'organizationIdentityContractSha256',
    'organizationIdentityVerifierPath',
    'organizationIdentityVerifierSha256',
  ]);
  exact(binding.credentialControls, [
    'provisioningCredentialConfiguration',
    'requiredProviderId',
    'requiredRetrievalChannel',
    'providerConfigurationMustExistBeforeApproval',
    'credentialBootstrapCompleted',
    'credentialBootstrapExecutionAuthorizedByThisBinding',
    'credentialRetrievalAfterDurableClaimOnly',
    'secretValuesCaptured',
  ]);
  exact(binding.credentialControls.provisioningCredentialConfiguration, [
    'path',
    'sha256',
    'sourceIdentity',
  ]);
  exact(
    binding.credentialControls.provisioningCredentialConfiguration
      .sourceIdentity,
    [
      'pathSha256',
      'resolvedPathSha256',
      'device',
      'inode',
      'size',
      'modifiedAtMilliseconds',
      'contentSha256',
    ]
  );
  exact(binding.approvedRequest, [
    'canonicalization',
    'projection',
    'sha256',
    'deprecatedOrIgnoredFieldsForbidden',
  ]);
  exact(binding.approvedRequest.projection, [
    'db_pass',
    'desired_instance_size',
    'name',
    'organization_slug',
    'region_selection',
  ]);
  exact(binding.approvedRequest.projection.region_selection, ['code', 'type']);
  exact(binding.environmentProposal, [
    'organizationId',
    'organizationSlug',
    'exactOrganizationAllowBinding',
    'organizationPlan',
    'projectName',
    'region',
    'databaseTier',
    'prohibitedProjectRefs',
    'prohibitedOrganizationIds',
    'prohibitedOrganizationSlugs',
  ]);
  exact(binding.sameOrganizationException, [
    'mode',
    'localPreparationAuthorized',
    'localPreparationAuthorizedOn',
    'targetOrganizationName',
    'targetOrganizationSlug',
    'productionOrganizationId',
    'productionOrganizationSlug',
    'productionProjectName',
    'productionProjectRef',
    'productionProjectOrigin',
    'organizationProjectEnumerationAllowed',
    'organizationProjectEnumerationDataMinimization',
    'productionProjectSpecificManagementApiContactAuthorized',
    'productionProjectDataPlaneContactAuthorized',
    'productionDatabaseContactAuthorized',
    'productionCredentialAccessAuthorized',
    'sharedOrganizationRiskAcceptanceRequiredForFinalAction',
  ]);
  exact(binding.initialPlatformPosture, [
    'mutationsIncludedInPhase1',
    'dataApiExpected',
    'graphQlExpected',
    'authExpected',
    'integrationExpected',
    'phase2ReadOnlyObservationRequired',
    'mismatchAction',
  ]);
  exact(binding.duplicateAndFailurePolicy, [
    'atomicLocalClaimRequiredBeforeCredentialRetrieval',
    'durableFileFlushAndReadbackRequired',
    'postIntentDurableBeforeFetch',
    'postIntentPermanentlyConsumesActionIdentity',
    'credentialBrokerFailureConsumesActionIdentity',
    'credentialBrokerAutomaticRetryAllowed',
    'actionJournalDirectoryPathSha256',
    'actionJournalDirectoryFingerprint',
    'organizationProjectListAllPagesRequiredBeforePost',
    'fixedNameDuplicateAction',
    'unknownRemoteOutcomeAction',
    'reconciliationOnlyMode',
    'automaticCleanupAuthorized',
    'destructiveRecoveryAuthorized',
    'recoveryOwner',
  ]);
  exact(binding.duplicateAndFailurePolicy.actionJournalDirectoryFingerprint, [
    'pathSha256',
    'resolvedPathSha256',
    'device',
    'inode',
    'snapshotSha256',
  ]);
  exact(binding.lifecycle, [
    'sourceMaximumHoursFromCreation',
    'automaticDeletionAuthorized',
    'deletionRequiresSeparateApproval',
    'paidProjectCannotBePaused',
  ]);
  exact(binding.retentionAndCleanupDecision, [
    'disposition',
    'sourceFundedHours',
    'fundedThrough',
    'fundingCeilingUsdScaled',
    'fundingApprovedAmountUsdScaled',
    'fundingSource',
    'cleanupOwner',
    'deletionApprovalRequester',
    'deletionApprovalRequestDeadline',
    'billingEscalationOwner',
    'fundedExtensionOwner',
  ]);
  exact(binding.cost, [
    'currency',
    'moneyScale',
    'computeRateUsdScaledPerProjectHour',
    'sourceMaximumBillableHours',
    'sourceMaximumComputeUsdScaled',
    'partialHourRounding',
    'organizationCurrentPlan',
    'planPurchaseOrChangeAuthorized',
    'planIncrementalUsdScaled',
    'creditReliance',
    'computeCreditAppliedUsdScaled',
    'taxAndOtherChargesQuoted',
    'unallocatedAuthorizationHeadroomUsdScaled',
    'knownAdditionalChargesUsdScaled',
    'unknownChargesAcknowledged',
    'ownerAuthorizationCeilingUsdScaled',
    'providerSpendCapEnforced',
    'ceilingMeaning',
    'pricingEvidence',
  ]);
  exact(binding.cost.pricingEvidence, [
    'artifactPath',
    'artifactSha256',
    'freshThrough',
    'sourceIdentity',
  ]);
  exact(binding.cost.pricingEvidence.sourceIdentity, [
    'pathSha256',
    'resolvedPathSha256',
    'device',
    'inode',
    'size',
    'modifiedAtMilliseconds',
    'contentSha256',
  ]);
  exact(binding.approval, [
    'decision',
    'attestationStatus',
    'approvedBy',
    'approvedAt',
    'operatorReconfirmedAt',
    'expiresAt',
    'initialApprovalReceiptSha256',
    'soleOperatorRiskAccepted',
    'sameUserDpapiCredentialExposureRiskAccepted',
    'providerSpendCapLimitationAcknowledged',
    'sameOrganizationExceptionRiskAccepted',
    'organizationListProductionRefObservationAccepted',
    'sharedOrganizationIamBillingControlPlaneRiskAccepted',
    'productionDirectContactProhibitionAcknowledged',
    'unknownChargesAcknowledged',
    'evidencePath',
    'evidenceSha256',
    'approvedActionId',
    'approvedPayloadSha256',
    'approvedBindingMaterialSha256',
  ]);
  exact(binding.owners, [
    'commercialReleaseOwner',
    'provisioningOperator',
    'supabasePlatformOwner',
    'cleanupOwner',
    'evidenceCustodian',
    'databaseMigrationOperator',
    'disasterRecoveryOperator',
    'securityTenantReviewer',
    'clinicalDataPrivacyReviewer',
    'billingMessagingSandboxOwner',
    'siteReliabilityOwner',
    'incidentCommander',
  ]);
  exact(binding.operatorControl, [
    'mode',
    'principalDisplayName',
    'principalId',
    'principalIdType',
    'samePersonRoleKeys',
    'identitySeparationAvailable',
    'independentHumanReviewClaimed',
    'localPreparationExceptionAuthorized',
    'localPreparationExceptionAuthorizedOn',
    'finalActionSelfApprovalRequired',
    'minimumCoolingOffSeconds',
    'maximumApprovalWindowSeconds',
    'compensatingControls',
  ]);
  exact(binding.evidenceContract, [
    'evidenceParentDirectoryPathSha256',
    'evidenceParentDirectoryFingerprint',
    'secretFreeProjectionOnly',
    'rawHttpHeadersPersisted',
    'rawProviderBodiesPersisted',
    'unexpectedProviderFieldsAction',
    'privacyAndSecretScanRequired',
    'sha256ManifestRequired',
    'atomicPartialThenRenameRequired',
    'evidenceSealBeforeTerminalOutcomeRequired',
    'partialEvidenceAutomaticDeletionAllowed',
    'abortDuplicateAndPartialFailureEvidenceRequired',
  ]);
  exact(binding.evidenceContract.evidenceParentDirectoryFingerprint, [
    'pathSha256',
    'resolvedPathSha256',
    'device',
    'inode',
    'snapshotSha256',
  ]);
}

export function buildSecretFreeRequestProjection(
  binding,
  credentialConfiguration
) {
  const bindingRecord = requireRecord(binding, 'BINDING_INVALID');
  const environment = requireRecord(
    bindingRecord.environmentProposal,
    'ENVIRONMENT_PROPOSAL_INVALID'
  );
  const credentials = requireRecord(
    credentialConfiguration,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  const secrets = requireRecord(
    credentials.secrets,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireRecord(secrets.databasePassword, 'CREDENTIAL_CONFIGURATION_INVALID');
  return {
    db_pass: PAYLOAD_SENTINEL,
    desired_instance_size:
      requireConcreteString(environment.databaseTier, 'TARGET_TIER_INVALID') ===
      'LARGE'
        ? 'large'
        : fail('TARGET_TIER_INVALID'),
    name: requireConcreteString(
      environment.projectName,
      'PROJECT_NAME_INVALID'
    ),
    organization_slug: requireConcreteString(
      environment.organizationSlug,
      'TARGET_ORGANIZATION_INVALID'
    ),
    region_selection: {
      code: requireConcreteString(environment.region, 'TARGET_REGION_INVALID'),
      type: 'specific',
    },
  };
}

function validateCredentialConfiguration(binding, credentialConfiguration) {
  const configuration = assertExactKeys(
    credentialConfiguration,
    [
      'schemaVersion',
      'resultType',
      'status',
      'provider',
      'runtime',
      'protocol',
      'secrets',
      'storageBoundary',
      'processBoundary',
      'bootstrap',
      'approvedBy',
      'approvedAt',
      'notes',
    ],
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  assertSecretFreeEvidence(configuration, []);
  requireCondition(
    configuration.schemaVersion === 2,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    configuration.resultType ===
      'SOURCE_PROJECT_PROVISIONING_CREDENTIAL_CONFIGURATION',
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    configuration.status === 'APPROVED',
    'CREDENTIAL_CONFIGURATION_INVALID'
  );

  const provider = assertExactKeys(
    configuration.provider,
    [
      'providerId',
      'configurationId',
      'retrievalChannel',
      'ownerApproved',
      'protectionScope',
      'ownerSidSha256',
      'machineNameSha256',
      'providerRoot',
      'providerRootPathSha256',
      'providerRootResolvedPathSha256',
      'providerRootDevice',
      'providerRootInode',
    ],
    'CREDENTIAL_PROVIDER_NOT_APPROVED'
  );
  const configurationId = requireConcreteString(
    provider.configurationId,
    'CREDENTIAL_PROVIDER_NOT_APPROVED'
  );
  requireCondition(
    /^[a-z0-9][a-z0-9._-]{7,127}$/.test(configurationId),
    'CREDENTIAL_PROVIDER_NOT_APPROVED'
  );
  const providerRoot = requireConcreteString(
    provider.providerRoot,
    'CREDENTIAL_PROVIDER_NOT_APPROVED'
  );
  requireCondition(
    /^[A-Za-z]:[\\/]/.test(providerRoot) &&
      !providerRoot.startsWith('\\\\') &&
      requireSha256(
        provider.providerRootPathSha256,
        'CREDENTIAL_PROVIDER_NOT_APPROVED'
      ) ===
        sha256Text(
          path.win32.resolve(providerRoot).replaceAll('\\', '/').toLowerCase()
        ) &&
      requireSha256(
        provider.providerRootResolvedPathSha256,
        'CREDENTIAL_PROVIDER_NOT_APPROVED'
      ) === provider.providerRootPathSha256 &&
      /^\d+$/.test(
        requireConcreteString(
          provider.providerRootDevice,
          'CREDENTIAL_PROVIDER_NOT_APPROVED'
        )
      ) &&
      /^\d+$/.test(
        requireConcreteString(
          provider.providerRootInode,
          'CREDENTIAL_PROVIDER_NOT_APPROVED'
        )
      ),
    'CREDENTIAL_PROVIDER_NOT_APPROVED'
  );
  requireCondition(
    provider.providerId === DPAPI_PROVIDER_ID &&
      provider.retrievalChannel === DPAPI_RETRIEVAL_CHANNEL &&
      provider.ownerApproved === true &&
      provider.protectionScope === 'CURRENT_USER' &&
      SHA256_PATTERN.test(provider.ownerSidSha256) &&
      SHA256_PATTERN.test(provider.machineNameSha256),
    'CREDENTIAL_PROVIDER_NOT_APPROVED'
  );

  const runtime = assertExactKeys(
    configuration.runtime,
    [
      'platform',
      'powershellExecutablePath',
      'powershellExecutableSha256',
      'powershellVersion',
      'requiredLanguageMode',
      'brokerScriptPath',
      'brokerScriptSha256',
      'bootstrapScriptPath',
      'bootstrapScriptSha256',
    ],
    'CREDENTIAL_RUNTIME_INVALID'
  );
  requireCondition(
    runtime.platform === 'WIN32' &&
      /^[A-Za-z]:[\\/]/.test(
        requireConcreteString(
          runtime.powershellExecutablePath,
          'CREDENTIAL_RUNTIME_INVALID'
        )
      ) &&
      SHA256_PATTERN.test(runtime.powershellExecutableSha256) &&
      /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(
        requireConcreteString(
          runtime.powershellVersion,
          'CREDENTIAL_RUNTIME_INVALID'
        )
      ) &&
      runtime.requiredLanguageMode === 'FullLanguage' &&
      runtime.brokerScriptPath ===
        'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1' &&
      SHA256_PATTERN.test(runtime.brokerScriptSha256) &&
      runtime.bootstrapScriptPath ===
        'scripts/commercial-hardening/initialize-pr12-windows-dpapi-credentials.ps1' &&
      SHA256_PATTERN.test(runtime.bootstrapScriptSha256),
    'CREDENTIAL_RUNTIME_INVALID'
  );

  const protocol = assertExactKeys(
    configuration.protocol,
    [
      'requestProtocol',
      'responseMagic',
      'responseVersion',
      'requestMaximumBytes',
      'responseMaximumBytes',
      'brokerTimeoutMilliseconds',
      'automaticRetryAllowed',
      'requestViaCapturedStdinOnly',
      'responseViaCapturedStdoutBinaryOnly',
      'zeroStderrRequired',
    ],
    'CREDENTIAL_PROTOCOL_INVALID'
  );
  requireCondition(
    protocol.requestProtocol === 'PR12_DPAPI_BROKER_REQUEST_V1' &&
      protocol.responseMagic === 'PR12DPB1' &&
      protocol.responseVersion === 1 &&
      protocol.requestMaximumBytes === 16_384 &&
      protocol.responseMaximumBytes === 8_192 &&
      protocol.brokerTimeoutMilliseconds === 30_000 &&
      protocol.automaticRetryAllowed === false &&
      protocol.requestViaCapturedStdinOnly === true &&
      protocol.responseViaCapturedStdoutBinaryOnly === true &&
      protocol.zeroStderrRequired === true,
    'CREDENTIAL_PROTOCOL_INVALID'
  );

  const secrets = assertExactKeys(
    configuration.secrets,
    ['managementAccessToken', 'databasePassword'],
    'CREDENTIAL_HANDLE_MISSING'
  );
  const managementToken = assertExactKeys(
    secrets.managementAccessToken,
    [
      'role',
      'opaqueHandle',
      'opaqueHandleSha256',
      'envelopeFilename',
      'envelopeSha256',
      'envelopeIdentity',
      'credentialType',
      'requiredEndpointOAuthScopes',
      'requiredFineGrainedPermissions',
      'minimumBytes',
      'maximumBytes',
    ],
    'CREDENTIAL_HANDLE_MISSING'
  );
  const databasePassword = assertExactKeys(
    secrets.databasePassword,
    [
      'role',
      'opaqueHandle',
      'opaqueHandleSha256',
      'envelopeFilename',
      'envelopeSha256',
      'envelopeIdentity',
      'minimumBytes',
      'maximumBytes',
    ],
    'CREDENTIAL_HANDLE_MISSING'
  );
  for (const identity of [
    managementToken.envelopeIdentity,
    databasePassword.envelopeIdentity,
  ]) {
    assertExactKeys(
      identity,
      [
        'pathSha256',
        'resolvedPathSha256',
        'device',
        'inode',
        'size',
        'modifiedAtMilliseconds',
        'contentSha256',
      ],
      'CREDENTIAL_HANDLE_MISSING'
    );
  }
  const tokenHandle = requireOpaqueSecretHandle(
    requireConcreteString(
      managementToken.opaqueHandle,
      'CREDENTIAL_HANDLE_MISSING'
    ),
    'CREDENTIAL_HANDLE_INVALID'
  );
  const passwordHandle = requireOpaqueSecretHandle(
    requireConcreteString(
      databasePassword.opaqueHandle,
      'CREDENTIAL_HANDLE_MISSING'
    ),
    'CREDENTIAL_HANDLE_INVALID'
  );
  requireCondition(tokenHandle !== passwordHandle, 'CREDENTIAL_HANDLE_INVALID');
  requireCondition(
    requireSha256(
      managementToken.opaqueHandleSha256,
      'CREDENTIAL_HANDLE_MISSING'
    ) === sha256Text(tokenHandle),
    'CREDENTIAL_HANDLE_FINGERPRINT_MISMATCH'
  );
  requireCondition(
    requireSha256(
      databasePassword.opaqueHandleSha256,
      'CREDENTIAL_HANDLE_MISSING'
    ) === sha256Text(passwordHandle),
    'CREDENTIAL_HANDLE_FINGERPRINT_MISMATCH'
  );
  requireCondition(
    tokenHandle ===
      'windows-dpapi-cu://pr12-source-project/management-access-token/v1' &&
      passwordHandle ===
        'windows-dpapi-cu://pr12-source-project/database-password/v1' &&
      managementToken.role === 'MANAGEMENT_ACCESS_TOKEN' &&
      databasePassword.role === 'DATABASE_PASSWORD' &&
      managementToken.envelopeFilename ===
        `${managementToken.opaqueHandleSha256}.dpapi.json` &&
      databasePassword.envelopeFilename ===
        `${databasePassword.opaqueHandleSha256}.dpapi.json` &&
      SHA256_PATTERN.test(managementToken.envelopeSha256) &&
      SHA256_PATTERN.test(databasePassword.envelopeSha256) &&
      managementToken.minimumBytes === 20 &&
      managementToken.maximumBytes === 4096 &&
      databasePassword.minimumBytes === 32 &&
      databasePassword.maximumBytes === 256,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  validateExternalFileIdentity(
    managementToken.envelopeIdentity,
    managementToken.envelopeSha256,
    'CREDENTIAL_CONFIGURATION_INVALID',
    path.win32.join(providerRoot, managementToken.envelopeFilename)
  );
  validateExternalFileIdentity(
    databasePassword.envelopeIdentity,
    databasePassword.envelopeSha256,
    'CREDENTIAL_CONFIGURATION_INVALID',
    path.win32.join(providerRoot, databasePassword.envelopeFilename)
  );
  for (const values of [
    [
      managementToken.envelopeIdentity.pathSha256,
      databasePassword.envelopeIdentity.pathSha256,
    ],
    [
      managementToken.envelopeIdentity.resolvedPathSha256,
      databasePassword.envelopeIdentity.resolvedPathSha256,
    ],
    [
      `${managementToken.envelopeIdentity.device}:${managementToken.envelopeIdentity.inode}`,
      `${databasePassword.envelopeIdentity.device}:${databasePassword.envelopeIdentity.inode}`,
    ],
    [managementToken.envelopeSha256, databasePassword.envelopeSha256],
  ]) {
    requireCondition(
      new Set(values).size === 2,
      'CREDENTIAL_ENVELOPE_IDENTITY_NOT_DISTINCT'
    );
  }
  const scopes = requireArray(
    managementToken.requiredEndpointOAuthScopes,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  const permissions = requireArray(
    managementToken.requiredFineGrainedPermissions,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    managementToken.credentialType === 'SUPABASE_FINE_GRAINED_ACCESS_TOKEN' &&
      canonicalJson(scopes) ===
        canonicalJson([
          'projects:read',
          'projects:write',
          'organizations:read',
        ]) &&
      canonicalJson(permissions) ===
        canonicalJson([
          'organization_admin_read',
          'organization_projects_read',
          'organization_projects_create',
          'infra_add_ons_read',
        ]),
    'CREDENTIAL_CONFIGURATION_INVALID'
  );

  const boundary = assertExactKeys(
    configuration.processBoundary,
    [
      'genericOrAmbientFallbackAllowed',
      'dotenvLoadingAllowed',
      'cliLoginSessionFallbackAllowed',
      'inheritedEnvironmentAllowed',
      'rawValueInArgvAllowed',
      'rawValueInUrlAllowed',
      'rawValueInEnvironmentAllowed',
      'rawValueRelayToParentStdoutOrStderrAllowed',
      'rawValueInLogOrEvidenceAllowed',
      'capturedBrokerBinaryResponseException',
    ],
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  for (const field of [
    'genericOrAmbientFallbackAllowed',
    'dotenvLoadingAllowed',
    'cliLoginSessionFallbackAllowed',
    'inheritedEnvironmentAllowed',
    'rawValueInArgvAllowed',
    'rawValueInUrlAllowed',
    'rawValueInEnvironmentAllowed',
    'rawValueRelayToParentStdoutOrStderrAllowed',
    'rawValueInLogOrEvidenceAllowed',
  ]) {
    requireBoolean(boundary[field], false, 'CREDENTIAL_CONFIGURATION_INVALID');
  }
  requireCondition(
    boundary.capturedBrokerBinaryResponseException ===
      'NODE_PARENT_CAPTURE_ONLY_NEVER_RELAY_OR_PERSIST',
    'CREDENTIAL_CONFIGURATION_INVALID'
  );

  const storage = assertExactKeys(
    configuration.storageBoundary,
    [
      'outsideRepositoryRequired',
      'outsideTemporaryDirectoriesRequired',
      'reparsePointsAllowed',
      'envelopeOverwriteAllowed',
      'allowedAclPrincipals',
      'inheritedAclAllowed',
      'providerRootIdentityMustRemainStable',
      'allProviderRootPathComponentsMustBeNonReparse',
      'resolvedProviderRootMustBeDisjointFromRepositoryTemporaryJournalAndEvidenceTrees',
    ],
    'CREDENTIAL_STORAGE_INVALID'
  );
  requireCondition(
    storage.outsideRepositoryRequired === true &&
      storage.outsideTemporaryDirectoriesRequired === true &&
      storage.reparsePointsAllowed === false &&
      storage.envelopeOverwriteAllowed === false &&
      canonicalJson(storage.allowedAclPrincipals) ===
        canonicalJson(['CURRENT_USER', 'LOCAL_SYSTEM']) &&
      storage.inheritedAclAllowed === false &&
      storage.providerRootIdentityMustRemainStable === true &&
      storage.allProviderRootPathComponentsMustBeNonReparse === true &&
      storage.resolvedProviderRootMustBeDisjointFromRepositoryTemporaryJournalAndEvidenceTrees ===
        true,
    'CREDENTIAL_STORAGE_INVALID'
  );

  const bootstrap = assertExactKeys(
    configuration.bootstrap,
    [
      'realCredentialBootstrapCompleted',
      'realCredentialBootstrapAuthorizedByThisPreparation',
      'separateInteractiveAuthorizationRequired',
    ],
    'CREDENTIAL_BOOTSTRAP_INVALID'
  );
  requireCondition(
    bootstrap.realCredentialBootstrapCompleted === true &&
      bootstrap.realCredentialBootstrapAuthorizedByThisPreparation === false &&
      bootstrap.separateInteractiveAuthorizationRequired === true,
    'CREDENTIAL_BOOTSTRAP_INVALID'
  );

  const approvedBy = requireCanonicalOwnerId(
    configuration.approvedBy,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireConcreteString(
    configuration.notes,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    parseTimestamp(
      configuration.approvedAt,
      'CREDENTIAL_APPROVAL_CHRONOLOGY_INVALID'
    ) <=
      parseTimestamp(
        requireRecord(binding.approval, 'APPROVAL_INVALID').approvedAt,
        'APPROVAL_INVALID'
      ),
    'CREDENTIAL_APPROVAL_CHRONOLOGY_INVALID'
  );

  const controls = requireRecord(
    binding.credentialControls,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    controls.requiredProviderId === provider.providerId &&
      controls.requiredRetrievalChannel === provider.retrievalChannel &&
      controls.providerConfigurationMustExistBeforeApproval === true &&
      controls.credentialBootstrapCompleted === true &&
      controls.credentialBootstrapExecutionAuthorizedByThisBinding === false &&
      controls.credentialRetrievalAfterDurableClaimOnly === true &&
      controls.secretValuesCaptured === false,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  const operatorControl = requireRecord(
    binding.operatorControl,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    approvedBy === operatorControl.principalId,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
}

function validateAuthorization(binding) {
  const authorization = requireRecord(
    binding.authorization,
    'AUTHORIZATION_SCOPE_INVALID'
  );
  requireBoolean(
    authorization.sourceProjectProvisioningAuthorized,
    false,
    'SOURCE_PROVISIONING_CANDIDATE_INVALID'
  );
  for (const field of [
    'isolatedStagingConnectionAuthorized',
    'isolatedStagingExecutionAuthorized',
    'restoreProjectCreationAuthorized',
    'productionConnectionAuthorized',
    'readyTransitionAuthorized',
    'mergeAuthorized',
    'commercialReleaseAuthorized',
    'indexRetirementAuthorized',
  ]) {
    requireBoolean(authorization[field], false, 'AUTHORIZATION_SCOPE_INVALID');
  }
}

function validateApprovalStatus(binding) {
  requireCondition(binding.schemaVersion === 5, 'BINDING_SCHEMA_INVALID');
  requireCondition(
    binding.phase === 'SOURCE_PROJECT_PROVISIONING' &&
      binding.status === 'PENDING_FINAL_APPROVAL',
    'SOURCE_PROVISIONING_CANDIDATE_INVALID'
  );
}

export function assertSourceProjectProvisioningCandidate(bindingInput) {
  const binding = requireRecord(bindingInput, 'BINDING_INVALID');
  validateApprovalStatus(binding);
  validateAuthorization(binding);
  return binding;
}

function validateAction(binding) {
  const action = requireRecord(
    binding.provisioningAction,
    'PROVISIONING_ACTION_INVALID'
  );
  parseTimestamp(action.scheduledExecutionAt, 'PROVISIONING_ACTION_INVALID');
  requireCondition(
    action.actionId === ACTION_ID &&
      action.resultType === 'SOURCE_PROJECT_PROVISIONING_OPERATION' &&
      action.method === 'OWNER_MANAGEMENT_API_CREATE_PROJECT' &&
      action.httpMethod === 'POST' &&
      action.endpoint === CREATE_ENDPOINT &&
      action.maximumPostAttempts === 1 &&
      action.automaticPostRetryAllowed === false &&
      action.providerIdempotencyKeyDocumented === false &&
      action.remoteContact === true &&
      action.mutating === true &&
      action.mutationScope === 'SOURCE_PROJECT_CREATION' &&
      action.databaseConnectionAuthorized === false &&
      action.requestTimeoutMilliseconds === 30_000 &&
      action.readinessObservationMaximumSeconds === 900 &&
      action.readinessPollIntervalSeconds === 15 &&
      action.providerCreatedAtMaximumClockSkewSeconds ===
        PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_SECONDS,
    'PROVISIONING_ACTION_INVALID'
  );
}

function validateOrganizationIdentityEvidence(binding, context) {
  const evidence = requireRecord(
    binding.organizationIdentityEvidence,
    'ORGANIZATION_IDENTITY_EVIDENCE_NOT_BOUND'
  );
  const trustedEvidence = requireRecord(
    context.organizationIdentityEvidence,
    'ORGANIZATION_IDENTITY_EVIDENCE_NOT_BOUND'
  );
  requireCondition(
    canonicalJson(evidence) === canonicalJson(trustedEvidence) &&
      context.organizationIdentitySourceGitCommitIsAncestor === true,
    'ORGANIZATION_IDENTITY_EVIDENCE_NOT_BOUND'
  );

  const organization = requireRecord(
    evidence.organization,
    'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
  );
  const environment = requireRecord(
    binding.environmentProposal,
    'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
  );
  requireCondition(
    evidence.status === 'PASS' &&
      evidence.actionId === 'PR12-ACTION-002' &&
      evidence.terminalState === 'TERMINAL_PASS' &&
      evidence.sourceGitCommit === ACTION002_SEALED_EVIDENCE.sourceGitCommit &&
      evidence.sourceBindingMaterialSha256 ===
        ACTION002_SEALED_EVIDENCE.sourceBindingMaterialSha256 &&
      evidence.sourceRequestSha256 ===
        ACTION002_SEALED_EVIDENCE.sourceRequestSha256 &&
      evidence.manifestSha256 === ACTION002_SEALED_EVIDENCE.manifestSha256 &&
      evidence.terminalSha256 === ACTION002_SEALED_EVIDENCE.terminalSha256 &&
      requireGitSha(
        evidence.sourceGitCommit,
        'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
      ) === evidence.sourceGitCommit &&
      requireSha256(
        evidence.sourceBindingMaterialSha256,
        'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
      ) === evidence.sourceBindingMaterialSha256 &&
      requireSha256(
        evidence.sourceRequestSha256,
        'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
      ) === evidence.sourceRequestSha256 &&
      requireSha256(
        evidence.manifestSha256,
        'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
      ) === evidence.manifestSha256 &&
      requireSha256(
        evidence.terminalSha256,
        'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
      ) === evidence.terminalSha256 &&
      requireSha256(
        evidence.claimSha256,
        'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
      ) === evidence.claimSha256 &&
      requireSha256(
        evidence.getIntentSha256,
        'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
      ) === evidence.getIntentSha256 &&
      requireSha256(
        evidence.providerResponseBodySha256,
        'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
      ) === evidence.providerResponseBodySha256 &&
      requireSha256(
        evidence.providerSafeProjectionSha256,
        'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
      ) === evidence.providerSafeProjectionSha256 &&
      /^[A-Za-z0-9._-]+$/.test(
        requireConcreteString(
          evidence.evidenceDirectoryName,
          'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
        )
      ) &&
      organization.organizationId === environment.organizationId &&
      organization.organizationName === TARGET_ORGANIZATION_NAME &&
      organization.organizationSlug === environment.organizationSlug &&
      organization.plan === 'PRO' &&
      evidence.remoteContactCount === 1 &&
      evidence.requestAttemptCount === 1 &&
      evidence.automaticRetryCount === 0,
    'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
  );

  for (const fingerprintInput of [
    evidence.evidenceDirectoryFingerprint,
    evidence.journalDirectoryFingerprint,
  ]) {
    const fingerprint = requireRecord(
      fingerprintInput,
      'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
    );
    for (const key of ['pathSha256', 'resolvedPathSha256', 'snapshotSha256']) {
      requireSha256(fingerprint[key], 'ORGANIZATION_IDENTITY_EVIDENCE_INVALID');
    }
    requireConcreteString(
      fingerprint.device,
      'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
    );
    requireConcreteString(
      fingerprint.inode,
      'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
    );
  }

  const completedAt = parseTimestamp(
    evidence.completedAt,
    'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
  );
  const sealedAt = parseTimestamp(
    evidence.sealedAt,
    'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
  );
  const providerObservedAt = parseTimestamp(
    evidence.providerObservedAt,
    'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
  );
  requireCondition(
    providerObservedAt <= completedAt &&
      completedAt <= sealedAt &&
      sealedAt <=
        parseTimestamp(
          binding.approval.approvedAt,
          'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
        ),
    'ORGANIZATION_IDENTITY_EVIDENCE_INVALID'
  );
  assertSecretFreeEvidence(evidence, []);
}

function validateTargetAndDenylist(binding) {
  const environment = requireRecord(
    binding.environmentProposal,
    'ENVIRONMENT_PROPOSAL_INVALID'
  );
  const organizationId = requireConcreteString(
    environment.organizationId,
    'TARGET_ORGANIZATION_INVALID'
  );
  const organizationSlug = requireConcreteString(
    environment.organizationSlug,
    'TARGET_ORGANIZATION_INVALID'
  );
  requireCondition(
    ORGANIZATION_SLUG_PATTERN.test(organizationSlug) &&
      environment.exactOrganizationAllowBinding === true &&
      environment.organizationPlan === 'PRO',
    'TARGET_ORGANIZATION_INVALID'
  );
  const prohibitedIds = requireArray(
    environment.prohibitedOrganizationIds,
    'PRODUCTION_ORGANIZATION_DENYLIST_MISSING'
  );
  const prohibitedSlugs = requireArray(
    environment.prohibitedOrganizationSlugs,
    'PRODUCTION_ORGANIZATION_DENYLIST_MISSING'
  );
  requireCondition(
    prohibitedIds.length > 0 && prohibitedSlugs.length > 0,
    'PRODUCTION_ORGANIZATION_DENYLIST_MISSING'
  );
  prohibitedIds.forEach(value =>
    requireConcreteString(value, 'PRODUCTION_ORGANIZATION_DENYLIST_MISSING')
  );
  prohibitedSlugs.forEach(value => {
    const slug = requireConcreteString(
      value,
      'PRODUCTION_ORGANIZATION_DENYLIST_MISSING'
    );
    requireCondition(
      CANONICAL_ORGANIZATION_SLUG_PATTERN.test(slug) &&
        slug === slug.toLowerCase(),
      'PRODUCTION_ORGANIZATION_DENYLIST_MISSING'
    );
  });
  const normalizedProhibitedSlugs = prohibitedSlugs.map(value =>
    value.toLowerCase()
  );
  const sameOrganizationException = validateSameOrganizationException(binding);
  requireCondition(
    organizationSlug === TARGET_ORGANIZATION_SLUG &&
      sameOrganizationException.productionOrganizationId === organizationId &&
      canonicalJson(prohibitedIds) === canonicalJson([organizationId]) &&
      canonicalJson(normalizedProhibitedSlugs) ===
        canonicalJson([TARGET_ORGANIZATION_SLUG]),
    'SAME_ORGANIZATION_EXCEPTION_INVALID'
  );
  requireCondition(
    CANONICAL_ORGANIZATION_SLUG_PATTERN.test(organizationSlug) &&
      organizationSlug === organizationSlug.toLowerCase(),
    'TARGET_ORGANIZATION_INVALID'
  );

  const prohibitedRefs = requireArray(
    environment.prohibitedProjectRefs,
    'PRODUCTION_TARGET_DENYLIST_MISSING'
  );
  requireCondition(
    prohibitedRefs.length > 0,
    'PRODUCTION_TARGET_DENYLIST_MISSING'
  );
  prohibitedRefs.forEach(value => {
    const ref = requireConcreteString(
      value,
      'PRODUCTION_TARGET_DENYLIST_MISSING'
    );
    requireCondition(
      PROJECT_REF_PATTERN.test(ref),
      'PRODUCTION_TARGET_DENYLIST_MISSING'
    );
  });
  requireCondition(
    prohibitedRefs.includes(PRODUCTION_PROJECT_REF),
    'PRODUCTION_TARGET_DENYLIST_MISSING'
  );
  const projectName = requireConcreteString(
    environment.projectName,
    'PROJECT_NAME_INVALID'
  );
  requireCondition(projectName === FIXED_PROJECT_NAME, 'PROJECT_NAME_INVALID');
  requireCondition(
    environment.region === 'ap-northeast-1' &&
      environment.databaseTier === 'LARGE',
    'ENVIRONMENT_PROPOSAL_INVALID'
  );
}

function validateInitialPosture(binding) {
  const posture = requireRecord(
    binding.initialPlatformPosture,
    'INITIAL_POSTURE_CONTRACT_INVALID'
  );
  requireCondition(
    posture.mutationsIncludedInPhase1 === false &&
      posture.dataApiExpected === 'OWNER_EXPECTATION_ONLY_NOT_OBSERVED' &&
      posture.graphQlExpected === 'OWNER_EXPECTATION_ONLY_NOT_OBSERVED' &&
      posture.authExpected === 'OWNER_EXPECTATION_ONLY_NOT_OBSERVED' &&
      posture.integrationExpected === 'OWNER_EXPECTATION_ONLY_NOT_OBSERVED' &&
      posture.phase2ReadOnlyObservationRequired === true &&
      posture.mismatchAction ===
        'STOP_NO_CONFIGURATION_MUTATION_REQUIRE_SEPARATE_APPROVAL',
    'INITIAL_POSTURE_CONTRACT_INVALID'
  );
}

function validateOwnersAndCleanup(binding) {
  const owners = requireRecord(binding.owners, 'OWNER_ASSIGNMENT_INVALID');
  const consolidatedOwnerKeys = [
    'commercialReleaseOwner',
    'provisioningOperator',
    'supabasePlatformOwner',
    'cleanupOwner',
    'evidenceCustodian',
  ];
  consolidatedOwnerKeys.forEach(key =>
    requireCanonicalOwnerId(owners[key], 'OWNER_ASSIGNMENT_INVALID')
  );
  const operatorControl = requireRecord(
    binding.operatorControl,
    'SOLE_OPERATOR_EXCEPTION_INVALID'
  );
  const principalId = requireCanonicalOwnerId(
    operatorControl.principalId,
    'SOLE_OPERATOR_EXCEPTION_INVALID'
  );
  const approval = requireRecord(binding.approval, 'APPROVAL_INVALID');
  requireCanonicalOwnerId(approval.approvedBy, 'OWNER_ASSIGNMENT_INVALID');
  requireCondition(
    operatorControl.mode === SOLE_OPERATOR_CONTROL_MODE &&
      operatorControl.principalDisplayName === 'FUTOSHI IWASAWA' &&
      operatorControl.principalIdType ===
        'OWNER_DECLARED_STABLE_PRINCIPAL_ID' &&
      canonicalJson(operatorControl.samePersonRoleKeys) ===
        canonicalJson(consolidatedOwnerKeys) &&
      operatorControl.identitySeparationAvailable === false &&
      operatorControl.independentHumanReviewClaimed === false &&
      operatorControl.localPreparationExceptionAuthorized === true &&
      operatorControl.localPreparationExceptionAuthorizedOn === '2026-07-24' &&
      operatorControl.finalActionSelfApprovalRequired === true &&
      operatorControl.minimumCoolingOffSeconds === 300 &&
      operatorControl.maximumApprovalWindowSeconds === 1800 &&
      canonicalJson(operatorControl.compensatingControls) ===
        canonicalJson([
          'EXACT_HEAD_BASE_GOVERNANCE_CONTRACT_WRAPPER_AND_PAYLOAD_HASHES',
          'ACTION_002_SEALED_EVIDENCE_AND_TERMINAL_JOURNAL_HASH_LINKAGE',
          'SAME_ORGANIZATION_LIST_ONLY_EXCEPTION_WITH_CENTRAL_PRODUCTION_CONTACT_DENY',
          'OUTBOUND_MANAGEMENT_API_ROUTE_METHOD_HOST_AND_QUERY_ALLOWLIST',
          'ONE_DURABLE_CREATE_ONCE_CLAIM_NO_POST_RETRY',
          'DPAPI_CURRENT_USER_CLAIM_BOUND_POST_CLAIM_RETRIEVAL',
          'USD_50_OWNER_AUTHORIZATION_CEILING_FOR_72_HOURS',
          'EXACT_SCHEDULED_EXECUTION_PLUS_73_HOURS_FUNDING_BINDING',
          'PHASE2_AND_CLEANUP_DELETION_REMAIN_SEPARATELY_UNAUTHORIZED',
        ]) &&
      consolidatedOwnerKeys.every(key => owners[key] === principalId) &&
      approval.approvedBy === principalId &&
      approval.soleOperatorRiskAccepted === true &&
      approval.sameUserDpapiCredentialExposureRiskAccepted === true &&
      approval.providerSpendCapLimitationAcknowledged === true &&
      approval.sameOrganizationExceptionRiskAccepted === true &&
      approval.organizationListProductionRefObservationAccepted === true &&
      approval.sharedOrganizationIamBillingControlPlaneRiskAccepted === true &&
      approval.productionDirectContactProhibitionAcknowledged === true &&
      approval.unknownChargesAcknowledged === true,
    'SOLE_OPERATOR_EXCEPTION_INVALID'
  );

  const cleanup = requireRecord(
    binding.retentionAndCleanupDecision,
    'CLEANUP_DECISION_INCOMPLETE'
  );
  for (const key of [
    'cleanupOwner',
    'deletionApprovalRequester',
    'billingEscalationOwner',
    'fundedExtensionOwner',
  ]) {
    requireCanonicalOwnerId(cleanup[key], 'CLEANUP_DECISION_INCOMPLETE');
  }
  requireCondition(
    cleanup.cleanupOwner === owners.cleanupOwner &&
      cleanup.deletionApprovalRequester === principalId &&
      cleanup.billingEscalationOwner === principalId &&
      cleanup.fundedExtensionOwner === principalId &&
      cleanup.disposition ===
        'DELETE_BEFORE_DEADLINE_OR_SEPARATELY_APPROVE_FUNDED_EXTENSION',
    'CLEANUP_DECISION_INCOMPLETE'
  );
  const lifecycle = requireRecord(
    binding.lifecycle,
    'CLEANUP_DECISION_INCOMPLETE'
  );
  requireCondition(
    lifecycle.sourceMaximumHoursFromCreation === 72 &&
      lifecycle.automaticDeletionAuthorized === false &&
      lifecycle.deletionRequiresSeparateApproval === true &&
      lifecycle.paidProjectCannotBePaused === true,
    'CLEANUP_DECISION_INCOMPLETE'
  );
}

function validateCostFundingAndChronology(
  binding,
  context,
  finalApprovalRequired
) {
  const approval = requireRecord(binding.approval, 'APPROVAL_INVALID');
  const approvedAt = parseTimestamp(approval.approvedAt, 'APPROVAL_INVALID');
  const expiresAt = parseTimestamp(approval.expiresAt, 'APPROVAL_INVALID');
  const scheduledExecutionAt = parseTimestamp(
    binding.provisioningAction.scheduledExecutionAt,
    'PROVISIONING_ACTION_INVALID'
  );
  const now = parseTimestamp(context.now, 'CURRENT_TIME_INVALID');
  const operatorControl = requireRecord(
    binding.operatorControl,
    'SOLE_OPERATOR_EXCEPTION_INVALID'
  );
  requireCondition(
    scheduledExecutionAt === approvedAt + 15 * 60 * 1000,
    'SCHEDULED_EXECUTION_TIME_INVALID'
  );
  requireCondition(
    expiresAt === approvedAt + 30 * 60 * 1000,
    'APPROVAL_EXPIRY_TIME_INVALID'
  );
  requireCondition(
    approval.operatorReconfirmedAt === 'NOT_CAPTURED' &&
      scheduledExecutionAt < expiresAt &&
      expiresAt - approvedAt <=
        operatorControl.maximumApprovalWindowSeconds * 1000 &&
      operatorControl.minimumCoolingOffSeconds === 300 &&
      requireSha256(
        approval.initialApprovalReceiptSha256,
        'INITIAL_APPROVAL_RECEIPT_INVALID'
      ) === approval.initialApprovalReceiptSha256 &&
      now >= approvedAt &&
      now < expiresAt &&
      (finalApprovalRequired || now <= scheduledExecutionAt),
    now >= expiresAt ? 'APPROVAL_EXPIRED' : 'APPROVAL_WINDOW_INVALID'
  );

  const cost = requireRecord(binding.cost, 'PRICING_EVIDENCE_NOT_CAPTURED');
  const rate = requireNonNegativeInteger(
    cost.computeRateUsdScaledPerProjectHour,
    'PRICING_ARITHMETIC_INVALID'
  );
  const hours = requireNonNegativeInteger(
    cost.sourceMaximumBillableHours,
    'PRICING_ARITHMETIC_INVALID'
  );
  const maximumCompute = requireNonNegativeInteger(
    cost.sourceMaximumComputeUsdScaled,
    'PRICING_ARITHMETIC_INVALID'
  );
  const headroom = requireNonNegativeInteger(
    cost.unallocatedAuthorizationHeadroomUsdScaled,
    'PRICING_ARITHMETIC_INVALID'
  );
  const knownAdditionalCharges = requireNonNegativeInteger(
    cost.knownAdditionalChargesUsdScaled,
    'KNOWN_COST_NOT_CAPTURED'
  );
  const ceiling = requireNonNegativeInteger(
    cost.ownerAuthorizationCeilingUsdScaled,
    'FUNDING_NOT_CAPTURED'
  );
  requireCondition(knownAdditionalCharges === 0, 'KNOWN_COST_NOT_CAPTURED');
  requireCondition(
    cost.currency === 'USD' &&
      cost.moneyScale === MONEY_SCALE &&
      rate === SOURCE_COMPUTE_RATE_USD_SCALED_PER_PROJECT_HOUR &&
      hours === 72 &&
      maximumCompute === SOURCE_MAXIMUM_COMPUTE_USD_SCALED &&
      rate * hours === maximumCompute &&
      cost.partialHourRounding === 'ROUNDED_UP_TO_FULL_HOUR' &&
      cost.organizationCurrentPlan === 'PRO' &&
      cost.planPurchaseOrChangeAuthorized === false &&
      cost.planIncrementalUsdScaled === 0 &&
      cost.creditReliance === 'NONE' &&
      cost.computeCreditAppliedUsdScaled === 0 &&
      cost.taxAndOtherChargesQuoted === false &&
      headroom === UNALLOCATED_AUTHORIZATION_HEADROOM_USD_SCALED &&
      maximumCompute + headroom === ceiling &&
      knownAdditionalCharges <= headroom &&
      cost.unknownChargesAcknowledged === true &&
      ceiling === OWNER_AUTHORIZATION_CEILING_USD_SCALED &&
      cost.providerSpendCapEnforced === false &&
      cost.ceilingMeaning ===
        'OWNER_GOVERNANCE_AUTHORIZATION_NOT_PROVIDER_SPEND_CAP',
    'PRICING_ARITHMETIC_INVALID'
  );

  const pricingEvidence = requireRecord(
    cost.pricingEvidence,
    'PRICING_EVIDENCE_NOT_CAPTURED'
  );
  requireSafeEvidencePath(
    pricingEvidence.artifactPath,
    'PRICING_EVIDENCE_NOT_CAPTURED'
  );
  requireSha256(
    pricingEvidence.artifactSha256,
    'PRICING_EVIDENCE_NOT_CAPTURED'
  );
  validateExternalFileIdentity(
    pricingEvidence.sourceIdentity,
    pricingEvidence.artifactSha256,
    'PRICING_EVIDENCE_SOURCE_IDENTITY_INVALID'
  );
  const pricingFreshThrough = parseTimestamp(
    pricingEvidence.freshThrough,
    'PRICING_EVIDENCE_NOT_CAPTURED'
  );
  requireCondition(
    pricingFreshThrough >= expiresAt && pricingFreshThrough > now,
    'PRICING_EVIDENCE_NOT_CURRENT_AT_APPROVAL'
  );

  const cleanup = requireRecord(
    binding.retentionAndCleanupDecision,
    'FUNDING_NOT_CAPTURED'
  );
  const fundedThrough = parseTimestamp(
    cleanup.fundedThrough,
    'FUNDING_NOT_CAPTURED'
  );
  const fundingSource = requireConcreteString(
    cleanup.fundingSource,
    'FUNDING_NOT_CAPTURED'
  );
  const fundedAmount = requireFiniteNumber(
    cleanup.fundingApprovedAmountUsdScaled,
    'FUNDING_NOT_CAPTURED'
  );
  const fundingCeiling = requireFiniteNumber(
    cleanup.fundingCeilingUsdScaled,
    'FUNDING_NOT_CAPTURED'
  );
  requireCondition(
    cleanup.sourceFundedHours === 72 &&
      Number.isSafeInteger(fundedAmount) &&
      Number.isSafeInteger(fundingCeiling) &&
      /^[A-Z][A-Z0-9_:-]{7,127}$/.test(fundingSource) &&
      fundingCeiling === OWNER_AUTHORIZATION_CEILING_USD_SCALED &&
      fundedAmount === OWNER_AUTHORIZATION_CEILING_USD_SCALED &&
      fundingCeiling === ceiling &&
      fundedThrough >= expiresAt + 72 * 60 * 60 * 1000,
    'FUNDING_NOT_CAPTURED'
  );
  requireCondition(
    fundedThrough === scheduledExecutionAt + 73 * 60 * 60 * 1000,
    'FUNDING_SCHEDULE_MISMATCH'
  );
  const deletionApprovalRequestDeadline = parseTimestamp(
    cleanup.deletionApprovalRequestDeadline,
    'CLEANUP_DECISION_INCOMPLETE'
  );
  requireCondition(
    deletionApprovalRequestDeadline ===
      scheduledExecutionAt + 70 * 60 * 60 * 1000 &&
      deletionApprovalRequestDeadline > now &&
      deletionApprovalRequestDeadline <= now + 72 * 60 * 60 * 1000 &&
      deletionApprovalRequestDeadline < fundedThrough,
    'CLEANUP_DECISION_INCOMPLETE'
  );
}

function validateFailureAndEvidenceContracts(binding) {
  const policy = requireRecord(
    binding.duplicateAndFailurePolicy,
    'DUPLICATE_GUARD_INVALID'
  );
  validateDirectoryFingerprint(
    policy.actionJournalDirectoryFingerprint,
    policy.actionJournalDirectoryPathSha256,
    'DUPLICATE_GUARD_INVALID'
  );
  requireCondition(
    policy.atomicLocalClaimRequiredBeforeCredentialRetrieval === true &&
      policy.durableFileFlushAndReadbackRequired === true &&
      policy.postIntentDurableBeforeFetch === true &&
      policy.postIntentPermanentlyConsumesActionIdentity === true &&
      policy.credentialBrokerFailureConsumesActionIdentity === true &&
      policy.credentialBrokerAutomaticRetryAllowed === false &&
      SHA256_PATTERN.test(policy.actionJournalDirectoryPathSha256) &&
      policy.organizationProjectListAllPagesRequiredBeforePost === true &&
      policy.fixedNameDuplicateAction === 'ABORT_POST_NOT_SENT' &&
      policy.unknownRemoteOutcomeAction ===
        'NO_RETRY_READ_ONLY_RECONCILIATION_AND_OWNER_DECISION' &&
      policy.reconciliationOnlyMode === '--reconcile-dispatched-action' &&
      policy.automaticCleanupAuthorized === false &&
      policy.destructiveRecoveryAuthorized === false,
    'DUPLICATE_GUARD_INVALID'
  );
  const recoveryOwner = requireCanonicalOwnerId(
    policy.recoveryOwner,
    'DUPLICATE_GUARD_INVALID'
  );
  const soleOperatorPrincipal = requireCanonicalOwnerId(
    binding.operatorControl?.principalId,
    'DUPLICATE_GUARD_INVALID'
  );
  requireCondition(
    recoveryOwner === soleOperatorPrincipal,
    'DUPLICATE_GUARD_INVALID'
  );

  const evidence = requireRecord(
    binding.evidenceContract,
    'EVIDENCE_CONTRACT_INVALID'
  );
  requireCondition(
    SHA256_PATTERN.test(evidence.evidenceParentDirectoryPathSha256) &&
      evidence.secretFreeProjectionOnly === true &&
      evidence.rawHttpHeadersPersisted === false &&
      evidence.rawProviderBodiesPersisted === false &&
      evidence.unexpectedProviderFieldsAction ===
        'FAIL_STOP_NO_BODY_PERSISTENCE' &&
      evidence.privacyAndSecretScanRequired === true &&
      evidence.sha256ManifestRequired === true &&
      evidence.atomicPartialThenRenameRequired === true &&
      evidence.evidenceSealBeforeTerminalOutcomeRequired === true &&
      evidence.partialEvidenceAutomaticDeletionAllowed === false &&
      evidence.abortDuplicateAndPartialFailureEvidenceRequired === true,
    'EVIDENCE_CONTRACT_INVALID'
  );
  validateDirectoryFingerprint(
    evidence.evidenceParentDirectoryFingerprint,
    evidence.evidenceParentDirectoryPathSha256,
    'EVIDENCE_CONTRACT_INVALID'
  );
}

function validatePricingEvidence(binding, pricingEvidenceInput, context) {
  const pricingEvidence = assertExactKeys(
    pricingEvidenceInput,
    [
      'schemaVersion',
      'recordType',
      'status',
      'provider',
      'currency',
      'moneyScale',
      'officialSources',
      'pricing',
      'conservativeTreatment',
      'authorizationBoundary',
      'freshness',
      'capturedBy',
      'rawOfficialSourceArtifactsPersistedInRepository',
      'notes',
    ],
    'PRICING_EVIDENCE_INVALID'
  );
  const cost = binding.cost;
  requireCondition(
    pricingEvidence.schemaVersion === 2 &&
      pricingEvidence.recordType ===
        'PR12_SOURCE_PROJECT_OFFICIAL_PRICING_EVIDENCE' &&
      pricingEvidence.status === 'CAPTURED' &&
      pricingEvidence.provider === 'SUPABASE' &&
      pricingEvidence.currency === 'USD' &&
      pricingEvidence.moneyScale === MONEY_SCALE &&
      pricingEvidence.rawOfficialSourceArtifactsPersistedInRepository === false,
    'PRICING_EVIDENCE_INVALID'
  );
  requireConcreteString(pricingEvidence.notes, 'PRICING_EVIDENCE_INVALID');
  requireCondition(
    requireCanonicalOwnerId(
      pricingEvidence.capturedBy,
      'PRICING_EVIDENCE_INVALID'
    ) === binding.operatorControl.principalId,
    'PRICING_EVIDENCE_INVALID'
  );
  const sources = requireArray(
    pricingEvidence.officialSources,
    'PRICING_EVIDENCE_INVALID'
  );
  requireCondition(
    sources.length === OFFICIAL_PRICING_SOURCES.length,
    'PRICING_EVIDENCE_INVALID'
  );
  const approval = requireRecord(binding.approval, 'APPROVAL_INVALID');
  const approvedAt = parseTimestamp(approval.approvedAt, 'APPROVAL_INVALID');
  const retrievedTimes = sources.map((sourceInput, index) => {
    const source = assertExactKeys(
      sourceInput,
      ['sourceId', 'url', 'retrievedAt', 'artifactPath', 'artifactSha256'],
      'PRICING_EVIDENCE_INVALID'
    );
    requireCondition(
      source.sourceId === OFFICIAL_PRICING_SOURCES[index].sourceId &&
        source.url === OFFICIAL_PRICING_SOURCES[index].url,
      'PRICING_EVIDENCE_INVALID'
    );
    requireSafeEvidencePath(source.artifactPath, 'PRICING_EVIDENCE_INVALID');
    requireSha256(source.artifactSha256, 'PRICING_EVIDENCE_INVALID');
    return parseTimestamp(source.retrievedAt, 'PRICING_EVIDENCE_INVALID');
  });

  const pricing = assertExactKeys(
    pricingEvidence.pricing,
    [
      'requiredExistingOrganizationPlan',
      'planPurchaseOrChangeAuthorized',
      'planIncrementalUsdScaled',
      'computeTier',
      'desiredInstanceSize',
      'computeAddonVariant',
      'billingUnit',
      'partialHourRounding',
      'hourlyRateUsdScaled',
      'maximumBillableHours',
      'maximumComputeUsdScaled',
    ],
    'PRICING_EVIDENCE_INVALID'
  );
  requireCondition(
    pricing.requiredExistingOrganizationPlan === 'PRO' &&
      pricing.planPurchaseOrChangeAuthorized === false &&
      pricing.planIncrementalUsdScaled === 0 &&
      pricing.computeTier === 'LARGE' &&
      pricing.desiredInstanceSize === 'large' &&
      pricing.computeAddonVariant === LARGE_ADDON_VARIANT &&
      pricing.billingUnit === 'PROJECT_HOUR' &&
      pricing.partialHourRounding === 'ROUNDED_UP_TO_FULL_HOUR' &&
      pricing.hourlyRateUsdScaled ===
        SOURCE_COMPUTE_RATE_USD_SCALED_PER_PROJECT_HOUR &&
      pricing.maximumBillableHours === 72 &&
      pricing.maximumComputeUsdScaled === SOURCE_MAXIMUM_COMPUTE_USD_SCALED &&
      pricing.hourlyRateUsdScaled * pricing.maximumBillableHours ===
        pricing.maximumComputeUsdScaled &&
      pricing.hourlyRateUsdScaled === cost.computeRateUsdScaledPerProjectHour &&
      pricing.maximumBillableHours === cost.sourceMaximumBillableHours &&
      pricing.maximumComputeUsdScaled === cost.sourceMaximumComputeUsdScaled,
    'PRICING_ARITHMETIC_INVALID'
  );

  const conservative = assertExactKeys(
    pricingEvidence.conservativeTreatment,
    [
      'creditReliance',
      'computeCreditAppliedUsdScaled',
      'taxAndOtherChargesQuoted',
      'taxAndOtherChargesEstimateUsdScaled',
      'unallocatedAuthorizationHeadroomUsdScaled',
    ],
    'PRICING_EVIDENCE_INVALID'
  );
  requireCondition(
    conservative.creditReliance === 'NONE' &&
      conservative.computeCreditAppliedUsdScaled === 0 &&
      conservative.taxAndOtherChargesQuoted === false &&
      conservative.taxAndOtherChargesEstimateUsdScaled === null &&
      conservative.unallocatedAuthorizationHeadroomUsdScaled ===
        UNALLOCATED_AUTHORIZATION_HEADROOM_USD_SCALED &&
      conservative.creditReliance === cost.creditReliance &&
      conservative.computeCreditAppliedUsdScaled ===
        cost.computeCreditAppliedUsdScaled &&
      conservative.taxAndOtherChargesQuoted === cost.taxAndOtherChargesQuoted &&
      conservative.unallocatedAuthorizationHeadroomUsdScaled ===
        cost.unallocatedAuthorizationHeadroomUsdScaled,
    'PRICING_ARITHMETIC_INVALID'
  );

  const boundary = assertExactKeys(
    pricingEvidence.authorizationBoundary,
    [
      'ownerAuthorizationCeilingUsdScaled',
      'providerSpendCapEnforced',
      'knownCostOverCeilingAction',
      'ceilingMeaning',
    ],
    'PRICING_EVIDENCE_INVALID'
  );
  requireCondition(
    boundary.ownerAuthorizationCeilingUsdScaled ===
      OWNER_AUTHORIZATION_CEILING_USD_SCALED &&
      boundary.providerSpendCapEnforced === false &&
      boundary.knownCostOverCeilingAction === 'ABORT_BEFORE_POST' &&
      boundary.ceilingMeaning ===
        'OWNER_GOVERNANCE_AUTHORIZATION_NOT_PROVIDER_SPEND_CAP' &&
      boundary.ownerAuthorizationCeilingUsdScaled ===
        cost.ownerAuthorizationCeilingUsdScaled &&
      boundary.providerSpendCapEnforced === cost.providerSpendCapEnforced &&
      boundary.ceilingMeaning === cost.ceilingMeaning,
    'PRICING_ARITHMETIC_INVALID'
  );

  const freshness = assertExactKeys(
    pricingEvidence.freshness,
    [
      'policy',
      'maximumAgeAtApprovalSeconds',
      'lifetimeSeconds',
      'freshThrough',
    ],
    'PRICING_EVIDENCE_INVALID'
  );
  const earliestRetrievedAt = Math.min(...retrievedTimes);
  const freshThrough = parseTimestamp(
    freshness.freshThrough,
    'PRICING_EVIDENCE_INVALID'
  );
  const executionFreshThrough = parseTimestamp(
    derivePricingExecutionFreshThrough(pricingEvidence),
    'PRICING_EVIDENCE_INVALID'
  );
  const provisioningAction = requireRecord(
    binding.provisioningAction,
    'PROVISIONING_ACTION_INVALID'
  );
  const scheduledExecutionAt = parseTimestamp(
    provisioningAction.scheduledExecutionAt,
    'PROVISIONING_ACTION_INVALID'
  );
  const requestTimeoutMilliseconds = requireNonNegativeInteger(
    provisioningAction.requestTimeoutMilliseconds,
    'PROVISIONING_ACTION_INVALID'
  );
  const validationNow = parseTimestamp(
    context.now,
    'PRICING_EVIDENCE_FRESHNESS_INVALID'
  );
  const currentFreshnessRequired =
    context.approvalStage === 'PRE_CLAIM' ||
    context.approvalStage === 'POST_CLAIM';
  requireCondition(
    freshness.policy ===
      'LOCAL_24_HOUR_REVALIDATION_NOT_PROVIDER_QUOTE_VALIDITY' &&
      freshness.maximumAgeAtApprovalSeconds === 3600 &&
      freshness.lifetimeSeconds === 86400 &&
      retrievedTimes.every(
        retrievedAt =>
          retrievedAt <= approvedAt &&
          approvedAt - retrievedAt <=
            freshness.maximumAgeAtApprovalSeconds * 1000
      ) &&
      freshThrough === earliestRetrievedAt + freshness.lifetimeSeconds * 1000 &&
      freshness.freshThrough === cost.pricingEvidence.freshThrough &&
      parseTimestamp(approval.expiresAt, 'APPROVAL_INVALID') <= freshThrough &&
      retrievedTimes.every(
        retrievedAt =>
          retrievedAt <= scheduledExecutionAt &&
          scheduledExecutionAt - retrievedAt <=
            freshness.maximumAgeAtApprovalSeconds * 1000
      ) &&
      scheduledExecutionAt + requestTimeoutMilliseconds <
        executionFreshThrough &&
      (!currentFreshnessRequired ||
        (retrievedTimes.every(
          retrievedAt =>
            retrievedAt <= validationNow &&
            validationNow - retrievedAt <=
              freshness.maximumAgeAtApprovalSeconds * 1000
        ) &&
          validationNow + requestTimeoutMilliseconds < executionFreshThrough)),
    'PRICING_EVIDENCE_FRESHNESS_INVALID'
  );
  assertSecretFreeEvidence(pricingEvidence, []);
}

function validateApprovalEvidence(
  binding,
  approvalEvidenceInput,
  bindingMaterialSha256,
  payloadSha256
) {
  const evidence = assertExactKeys(
    approvalEvidenceInput,
    [
      'schemaVersion',
      'recordType',
      'decision',
      'attestationStatus',
      'attestationMethod',
      'approverPrincipalId',
      'approverDisplayName',
      'operatorPrincipalId',
      'operatorDisplayName',
      'operatorControlMode',
      'identitySeparationAvailable',
      'independentHumanReviewClaimed',
      'soleOperatorRiskAccepted',
      'sameUserDpapiCredentialExposureRiskAccepted',
      'providerSpendCapLimitationAcknowledged',
      'sameOrganizationExceptionRiskAccepted',
      'organizationListProductionRefObservationAccepted',
      'sharedOrganizationIamBillingControlPlaneRiskAccepted',
      'productionDirectContactProhibitionAcknowledged',
      'unknownChargesAcknowledged',
      'actionId',
      'gitCommit',
      'bindingMaterialSha256',
      'payloadSha256',
      'credentialConfigurationSha256',
      'pricingEvidenceSha256',
      'organizationId',
      'organizationSlug',
      'sameOrganizationExceptionMode',
      'productionOrganizationId',
      'productionOrganizationSlug',
      'productionProjectName',
      'productionProjectRef',
      'productionProjectOrigin',
      'projectName',
      'region',
      'tier',
      'ownerAuthorizationCeilingUsdScaled',
      'authorizedDurationHours',
      'scheduledExecutionAt',
      'fundedThrough',
      'organizationIdentityManifestSha256',
      'organizationIdentityTerminalSha256',
      'organizationIdentitySourceBindingMaterialSha256',
      'organizationIdentitySourceRequestSha256',
      'approvedAt',
      'operatorReconfirmedAt',
      'expiresAt',
      'initialApprovalReceiptSha256',
      'phase2AndLaterAuthorized',
      'cleanupDeletionAuthorized',
      'notes',
    ],
    'APPROVAL_EVIDENCE_INVALID'
  );
  const approval = binding.approval;
  const environment = binding.environmentProposal;
  requireCondition(
    evidence.schemaVersion === 4 &&
      evidence.recordType ===
        'PR12_SOURCE_PROJECT_PROVISIONING_OWNER_APPROVAL' &&
      evidence.decision === 'PENDING_FINAL_APPROVAL' &&
      evidence.attestationStatus === 'AWAITING_FINAL_RECEIPT' &&
      evidence.attestationMethod ===
        'SOLE_OPERATOR_EXPLICIT_TWO_STEP_APPROVAL_RECORD' &&
      evidence.approverPrincipalId === approval.approvedBy &&
      evidence.operatorPrincipalId === binding.operatorControl.principalId &&
      evidence.approverPrincipalId === evidence.operatorPrincipalId &&
      evidence.approverDisplayName === 'FUTOSHI IWASAWA' &&
      evidence.operatorDisplayName === 'FUTOSHI IWASAWA' &&
      evidence.operatorControlMode === SOLE_OPERATOR_CONTROL_MODE &&
      evidence.identitySeparationAvailable === false &&
      evidence.independentHumanReviewClaimed === false &&
      evidence.soleOperatorRiskAccepted === true &&
      evidence.sameUserDpapiCredentialExposureRiskAccepted === true &&
      evidence.providerSpendCapLimitationAcknowledged === true &&
      evidence.sameOrganizationExceptionRiskAccepted === true &&
      evidence.organizationListProductionRefObservationAccepted === true &&
      evidence.sharedOrganizationIamBillingControlPlaneRiskAccepted === true &&
      evidence.productionDirectContactProhibitionAcknowledged === true &&
      evidence.unknownChargesAcknowledged === true &&
      evidence.unknownChargesAcknowledged ===
        binding.approval.unknownChargesAcknowledged &&
      evidence.actionId === ACTION_ID &&
      evidence.gitCommit === binding.target.gitCommit &&
      evidence.bindingMaterialSha256 === bindingMaterialSha256 &&
      evidence.payloadSha256 === payloadSha256 &&
      evidence.credentialConfigurationSha256 ===
        binding.credentialControls.provisioningCredentialConfiguration.sha256 &&
      evidence.pricingEvidenceSha256 ===
        binding.cost.pricingEvidence.artifactSha256 &&
      evidence.organizationId === environment.organizationId &&
      evidence.organizationSlug === environment.organizationSlug &&
      evidence.sameOrganizationExceptionMode ===
        SAME_ORGANIZATION_EXCEPTION_MODE &&
      evidence.productionOrganizationId ===
        binding.sameOrganizationException.productionOrganizationId &&
      evidence.productionOrganizationSlug === TARGET_ORGANIZATION_SLUG &&
      evidence.productionProjectName === PRODUCTION_PROJECT_NAME &&
      evidence.productionProjectRef === PRODUCTION_PROJECT_REF &&
      evidence.productionProjectOrigin === PRODUCTION_PROJECT_ORIGIN &&
      evidence.projectName === environment.projectName &&
      evidence.region === environment.region &&
      evidence.tier === environment.databaseTier &&
      evidence.ownerAuthorizationCeilingUsdScaled ===
        OWNER_AUTHORIZATION_CEILING_USD_SCALED &&
      evidence.authorizedDurationHours === 72 &&
      evidence.scheduledExecutionAt ===
        binding.provisioningAction.scheduledExecutionAt &&
      evidence.fundedThrough ===
        binding.retentionAndCleanupDecision.fundedThrough &&
      evidence.organizationIdentityManifestSha256 ===
        binding.organizationIdentityEvidence.manifestSha256 &&
      evidence.organizationIdentityTerminalSha256 ===
        binding.organizationIdentityEvidence.terminalSha256 &&
      evidence.organizationIdentitySourceBindingMaterialSha256 ===
        binding.organizationIdentityEvidence.sourceBindingMaterialSha256 &&
      evidence.organizationIdentitySourceRequestSha256 ===
        binding.organizationIdentityEvidence.sourceRequestSha256 &&
      evidence.approvedAt === approval.approvedAt &&
      evidence.operatorReconfirmedAt === approval.operatorReconfirmedAt &&
      evidence.expiresAt === approval.expiresAt &&
      evidence.initialApprovalReceiptSha256 ===
        approval.initialApprovalReceiptSha256 &&
      evidence.phase2AndLaterAuthorized === false &&
      evidence.cleanupDeletionAuthorized === false,
    'APPROVAL_EVIDENCE_INVALID'
  );
  requireConcreteString(evidence.notes, 'APPROVAL_EVIDENCE_INVALID');
  assertSecretFreeEvidence(evidence, []);
}

function validateInitialApprovalReceipt(binding, context) {
  const receipt = assertExactKeys(
    context.initialApprovalReceipt,
    [
      'schemaVersion',
      'recordType',
      'decision',
      'attestationStatus',
      'attestationMethod',
      'actionId',
      'approvedByPrincipalId',
      'approvedByDisplayName',
      'acceptedAt',
      'approvalPurpose',
      'soleOperatorRiskAccepted',
      'sameUserDpapiCredentialExposureRiskAccepted',
      'providerSpendCapLimitationAcknowledged',
      'sameOrganizationExceptionRiskAccepted',
      'organizationListProductionRefObservationAccepted',
      'sharedOrganizationIamBillingControlPlaneRiskAccepted',
      'productionDirectContactProhibitionAcknowledged',
      'unknownChargesAcknowledged',
      'action003PacketPreparationAuthorized',
      'databasePasswordBootstrapAuthorized',
      'sourceProjectProvisioningAuthorized',
      'productionContactAuthorized',
      'phase2AndLaterAuthorized',
      'cleanupDeletionAuthorized',
      'notes',
    ],
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const approval = requireRecord(binding.approval, 'APPROVAL_INVALID');
  const acceptedAt = parseTimestamp(
    receipt.acceptedAt,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const approvedAt = parseTimestamp(
    approval.approvedAt,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const now = parseTimestamp(context.now, 'INITIAL_APPROVAL_RECEIPT_INVALID');
  const receiptSha256 = sha256Text(`${canonicalJson(receipt)}\n`);
  requireCondition(
    receipt.schemaVersion === 1 &&
      receipt.recordType ===
        'PR12_SOURCE_PROJECT_PROVISIONING_INITIAL_APPROVAL_RECEIPT' &&
      receipt.decision === 'APPROVED' &&
      receipt.attestationStatus === 'VERIFIED' &&
      receipt.attestationMethod === 'SOLE_OPERATOR_EXPLICIT_INITIAL_APPROVAL' &&
      receipt.actionId === ACTION_ID &&
      receipt.approvedByPrincipalId === approval.approvedBy &&
      receipt.approvedByDisplayName === 'FUTOSHI IWASAWA' &&
      receipt.approvalPurpose === 'ACTION003_PACKET_PREPARATION_ONLY' &&
      acceptedAt === approvedAt &&
      acceptedAt <= now &&
      receiptSha256 ===
        requireSha256(
          context.initialApprovalReceiptSha256,
          'INITIAL_APPROVAL_RECEIPT_INVALID'
        ) &&
      receiptSha256 === approval.initialApprovalReceiptSha256 &&
      receipt.soleOperatorRiskAccepted === true &&
      receipt.sameUserDpapiCredentialExposureRiskAccepted === true &&
      receipt.providerSpendCapLimitationAcknowledged === true &&
      receipt.sameOrganizationExceptionRiskAccepted === true &&
      receipt.organizationListProductionRefObservationAccepted === true &&
      receipt.sharedOrganizationIamBillingControlPlaneRiskAccepted === true &&
      receipt.productionDirectContactProhibitionAcknowledged === true &&
      receipt.unknownChargesAcknowledged === true &&
      receipt.action003PacketPreparationAuthorized === true &&
      receipt.databasePasswordBootstrapAuthorized === false &&
      receipt.sourceProjectProvisioningAuthorized === false &&
      receipt.productionContactAuthorized === false &&
      receipt.phase2AndLaterAuthorized === false &&
      receipt.cleanupDeletionAuthorized === false,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  requireConcreteString(receipt.notes, 'INITIAL_APPROVAL_RECEIPT_INVALID');
  assertSecretFreeEvidence(receipt, []);
}

function validateFinalApprovalReceipt(
  binding,
  context,
  bindingMaterialSha256,
  payloadSha256
) {
  const receipt = assertExactKeys(
    context.finalApprovalReceipt,
    [
      'schemaVersion',
      'recordType',
      'decision',
      'attestationStatus',
      'attestationMethod',
      'actionId',
      'approvedByPrincipalId',
      'approvedByDisplayName',
      'acceptedAt',
      'expiresAt',
      'initialApprovalReceiptSha256',
      'bindingSha256',
      'bindingMaterialSha256',
      'payloadSha256',
      'credentialConfigurationSha256',
      'pricingEvidenceSha256',
      'ownerApprovalSha256',
      'soleOperatorRiskAccepted',
      'sameUserDpapiCredentialExposureRiskAccepted',
      'providerSpendCapLimitationAcknowledged',
      'sameOrganizationExceptionRiskAccepted',
      'organizationListProductionRefObservationAccepted',
      'sharedOrganizationIamBillingControlPlaneRiskAccepted',
      'productionDirectContactProhibitionAcknowledged',
      'unknownChargesAcknowledged',
      'sourceProjectProvisioningAuthorized',
      'productionContactAuthorized',
      'phase2AndLaterAuthorized',
      'cleanupDeletionAuthorized',
      'notes',
    ],
    'FINAL_APPROVAL_RECEIPT_INVALID'
  );
  const approval = binding.approval;
  const acceptedAt = parseTimestamp(
    receipt.acceptedAt,
    'FINAL_APPROVAL_RECEIPT_INVALID'
  );
  const approvedAt = parseTimestamp(
    approval.approvedAt,
    'FINAL_APPROVAL_RECEIPT_INVALID'
  );
  const scheduledExecutionAt = parseTimestamp(
    binding.provisioningAction.scheduledExecutionAt,
    'FINAL_APPROVAL_RECEIPT_INVALID'
  );
  const expiresAt = parseTimestamp(
    approval.expiresAt,
    'FINAL_APPROVAL_RECEIPT_INVALID'
  );
  const now = parseTimestamp(context.now, 'FINAL_APPROVAL_RECEIPT_INVALID');
  const bindingSha256 = sha256Text(`${canonicalJson(binding)}\n`);
  const finalReceiptSha256 = sha256Text(`${canonicalJson(receipt)}\n`);
  requireCondition(
    receipt.schemaVersion === 1 &&
      receipt.recordType ===
        'PR12_SOURCE_PROJECT_PROVISIONING_FINAL_APPROVAL_RECEIPT' &&
      receipt.decision === 'APPROVED' &&
      receipt.attestationStatus === 'VERIFIED' &&
      receipt.attestationMethod ===
        'SOLE_OPERATOR_EXPLICIT_FINAL_HASH_RECONFIRMATION' &&
      receipt.actionId === ACTION_ID &&
      receipt.approvedByPrincipalId === approval.approvedBy &&
      receipt.approvedByDisplayName === 'FUTOSHI IWASAWA' &&
      acceptedAt >= approvedAt + 5 * 60 * 1000 &&
      acceptedAt <= scheduledExecutionAt &&
      acceptedAt < expiresAt &&
      now >= acceptedAt &&
      now < expiresAt &&
      receipt.expiresAt === approval.expiresAt &&
      receipt.initialApprovalReceiptSha256 ===
        approval.initialApprovalReceiptSha256 &&
      receipt.bindingSha256 === bindingSha256 &&
      receipt.bindingSha256 ===
        requireSha256(
          context.bindingSha256,
          'FINAL_APPROVAL_RECEIPT_INVALID'
        ) &&
      receipt.bindingMaterialSha256 === bindingMaterialSha256 &&
      receipt.payloadSha256 === payloadSha256 &&
      receipt.credentialConfigurationSha256 ===
        binding.credentialControls.provisioningCredentialConfiguration.sha256 &&
      receipt.pricingEvidenceSha256 ===
        binding.cost.pricingEvidence.artifactSha256 &&
      receipt.ownerApprovalSha256 ===
        requireSha256(
          context.approvalEvidenceSha256,
          'FINAL_APPROVAL_RECEIPT_INVALID'
        ) &&
      finalReceiptSha256 ===
        requireSha256(
          context.finalApprovalReceiptSha256,
          'FINAL_APPROVAL_RECEIPT_INVALID'
        ) &&
      receipt.soleOperatorRiskAccepted === true &&
      receipt.sameUserDpapiCredentialExposureRiskAccepted === true &&
      receipt.providerSpendCapLimitationAcknowledged === true &&
      receipt.sameOrganizationExceptionRiskAccepted === true &&
      receipt.organizationListProductionRefObservationAccepted === true &&
      receipt.sharedOrganizationIamBillingControlPlaneRiskAccepted === true &&
      receipt.productionDirectContactProhibitionAcknowledged === true &&
      receipt.unknownChargesAcknowledged === true &&
      receipt.sourceProjectProvisioningAuthorized === true &&
      receipt.productionContactAuthorized === false &&
      receipt.phase2AndLaterAuthorized === false &&
      receipt.cleanupDeletionAuthorized === false,
    'FINAL_APPROVAL_RECEIPT_INVALID'
  );
  requireConcreteString(receipt.notes, 'FINAL_APPROVAL_RECEIPT_INVALID');
  assertSecretFreeEvidence(receipt, []);
}

function validateOfflineApprovalCore(
  bindingInput,
  credentialConfigurationInput,
  contextInput,
  finalApprovalRequired
) {
  const binding = requireRecord(bindingInput, 'BINDING_INVALID');
  const context = requireRecord(contextInput, 'VALIDATION_CONTEXT_INVALID');
  validateBindingShape(binding);
  assertSecretFreeEvidence(binding, []);
  validateApprovalStatus(binding);

  const approval = requireRecord(binding.approval, 'APPROVAL_INVALID');
  requireCondition(
    approval.decision === 'PENDING_FINAL_APPROVAL' &&
      approval.attestationStatus === 'AWAITING_FINAL_RECEIPT' &&
      approval.approvedActionId === ACTION_ID,
    'APPROVAL_ATTESTATION_INVALID'
  );
  requireCanonicalOwnerId(approval.approvedBy, 'APPROVAL_ATTESTATION_INVALID');
  requireSafeEvidencePath(
    approval.evidencePath,
    'APPROVAL_ATTESTATION_INVALID'
  );
  requireSha256(approval.evidenceSha256, 'APPROVAL_ATTESTATION_INVALID');
  requireSha256(
    approval.initialApprovalReceiptSha256,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  validateInitialApprovalReceipt(binding, context);

  validateAuthorization(binding);
  validateAction(binding);

  const target = requireRecord(binding.target, 'TARGET_BINDING_INVALID');
  const boundHead = requireGitSha(target.gitCommit, 'TARGET_BINDING_INVALID');
  const boundBase = requireGitSha(target.baseCommit, 'TARGET_BINDING_INVALID');
  requireCondition(
    requireGitSha(context.currentHead, 'GIT_HEAD_MISMATCH') === boundHead,
    'GIT_HEAD_MISMATCH'
  );
  requireCondition(
    boundBase === APPROVED_BASE_COMMIT &&
      requireGitSha(context.currentBaseCommit, 'GIT_BASE_MISMATCH') ===
        boundBase,
    'GIT_BASE_MISMATCH'
  );
  requireCondition(
    context.worktreeClean === true && target.cleanWorktreeRequired === true,
    'WORKTREE_NOT_CLEAN'
  );
  requireCondition(
    typeof context.nodeVersion === 'string' &&
      /^v24\./.test(context.nodeVersion) &&
      Array.isArray(context.nodeExecArgv) &&
      context.nodeExecArgv.length === 0,
    'NODE_RUNTIME_BOUNDARY_INVALID'
  );

  validateTargetAndDenylist(binding);
  validateOrganizationIdentityEvidence(binding, context);
  validateInitialPosture(binding);
  validateOwnersAndCleanup(binding);
  validateCostFundingAndChronology(binding, context, finalApprovalRequired);
  validateFailureAndEvidenceContracts(binding);
  validateCredentialConfiguration(binding, credentialConfigurationInput);

  const ambientNames = requireArray(
    context.ambientCredentialNames,
    'VALIDATION_CONTEXT_INVALID'
  );
  requireCondition(ambientNames.length === 0, 'AMBIENT_CREDENTIAL_FORBIDDEN');
  requireCondition(
    context.approvalStage === 'PRE_CLAIM' ||
      context.approvalStage === 'POST_CLAIM' ||
      context.approvalStage === 'RECOVERY',
    'VALIDATION_CONTEXT_INVALID'
  );
  if (context.approvalStage === 'PRE_CLAIM') {
    requireCondition(
      context.priorActionState === null,
      'ACTION_ALREADY_CLAIMED'
    );
  } else if (context.approvalStage === 'POST_CLAIM') {
    requireCondition(
      context.priorActionState === 'CLAIMED_POST_NOT_SENT',
      'ACTION_JOURNAL_STATE_INVALID'
    );
  } else {
    requireCondition(
      context.priorActionState === 'POST_INTENT_DURABLE_OUTCOME_UNRESOLVED',
      'ACTION_JOURNAL_STATE_INVALID'
    );
  }
  requireCondition(
    binding.duplicateAndFailurePolicy.actionJournalDirectoryPathSha256 ===
      requireSha256(
        context.actionJournalDirectoryPathSha256,
        'ACTION_JOURNAL_DIRECTORY_MISMATCH'
      ),
    'ACTION_JOURNAL_DIRECTORY_MISMATCH'
  );
  requireCondition(
    canonicalJson(
      binding.duplicateAndFailurePolicy.actionJournalDirectoryFingerprint
    ) === canonicalJson(context.actionJournalDirectoryFingerprint),
    'ACTION_JOURNAL_DIRECTORY_IDENTITY_MISMATCH'
  );
  requireCondition(
    binding.evidenceContract.evidenceParentDirectoryPathSha256 ===
      requireSha256(
        context.evidenceParentDirectoryPathSha256,
        'EVIDENCE_DIRECTORY_MISMATCH'
      ),
    'EVIDENCE_DIRECTORY_MISMATCH'
  );
  requireCondition(
    canonicalJson(
      binding.evidenceContract.evidenceParentDirectoryFingerprint
    ) === canonicalJson(context.evidenceParentDirectoryFingerprint),
    'EVIDENCE_DIRECTORY_IDENTITY_MISMATCH'
  );
  requireCondition(
    binding.duplicateAndFailurePolicy.actionJournalDirectoryPathSha256 !==
      binding.evidenceContract.evidenceParentDirectoryPathSha256,
    'RUNTIME_OUTPUT_DIRECTORIES_MUST_DIFFER'
  );

  const projection = buildSecretFreeRequestProjection(
    binding,
    credentialConfigurationInput
  );
  const approvedRequest = requireRecord(
    binding.approvedRequest,
    'REQUEST_PAYLOAD_INVALID'
  );
  requireCondition(
    approvedRequest.canonicalization === 'RFC8785_STYLE_SORTED_KEYS_UTF8_V1',
    'REQUEST_PAYLOAD_INVALID'
  );
  const projectionSha256 = sha256Canonical(projection);
  requireCondition(
    canonicalJson(approvedRequest.projection) === canonicalJson(projection) &&
      approvedRequest.sha256 === projectionSha256 &&
      approval.approvedPayloadSha256 === projectionSha256,
    'REQUEST_PAYLOAD_HASH_MISMATCH'
  );
  const forbiddenFields = requireArray(
    approvedRequest.deprecatedOrIgnoredFieldsForbidden,
    'REQUEST_PAYLOAD_INVALID'
  );
  requireCondition(
    ['organization_id', 'plan', 'region', 'kps_enabled'].every(field =>
      forbiddenFields.includes(field)
    ) &&
      Object.keys(projection).every(field => !forbiddenFields.includes(field)),
    'REQUEST_PAYLOAD_INVALID'
  );

  const governance = requireRecord(
    binding.governanceProposal,
    'GOVERNANCE_HASH_MISMATCH'
  );
  requireCondition(
    governance.path === GOVERNANCE_RELATIVE_PATH &&
      requireSha256(governance.sha256, 'GOVERNANCE_HASH_MISMATCH') ===
        requireSha256(context.governanceSha256, 'GOVERNANCE_HASH_MISMATCH'),
    'GOVERNANCE_HASH_MISMATCH'
  );
  const contracts = requireRecord(
    binding.implementationContracts,
    'IMPLEMENTATION_HASH_MISMATCH'
  );
  requireCondition(
    contracts.contractPath === CONTRACT_RELATIVE_PATH &&
      contracts.wrapperPath === WRAPPER_RELATIVE_PATH &&
      contracts.organizationIdentityContractPath ===
        ORGANIZATION_IDENTITY_CONTRACT_RELATIVE_PATH &&
      contracts.organizationIdentityVerifierPath ===
        ORGANIZATION_IDENTITY_VERIFIER_RELATIVE_PATH &&
      requireSha256(
        contracts.contractSha256,
        'IMPLEMENTATION_HASH_MISMATCH'
      ) ===
        requireSha256(context.contractSha256, 'IMPLEMENTATION_HASH_MISMATCH') &&
      requireSha256(contracts.wrapperSha256, 'IMPLEMENTATION_HASH_MISMATCH') ===
        requireSha256(context.wrapperSha256, 'IMPLEMENTATION_HASH_MISMATCH') &&
      requireSha256(
        contracts.organizationIdentityContractSha256,
        'IMPLEMENTATION_HASH_MISMATCH'
      ) ===
        requireSha256(
          context.organizationIdentityContractSha256,
          'IMPLEMENTATION_HASH_MISMATCH'
        ) &&
      requireSha256(
        contracts.organizationIdentityVerifierSha256,
        'IMPLEMENTATION_HASH_MISMATCH'
      ) ===
        requireSha256(
          context.organizationIdentityVerifierSha256,
          'IMPLEMENTATION_HASH_MISMATCH'
        ),
    'IMPLEMENTATION_HASH_MISMATCH'
  );
  const credentialControls = requireRecord(
    binding.credentialControls,
    'CREDENTIAL_CONFIGURATION_HASH_MISMATCH'
  );
  const credentialBinding = requireRecord(
    credentialControls.provisioningCredentialConfiguration,
    'CREDENTIAL_CONFIGURATION_HASH_MISMATCH'
  );
  requireCondition(
    requireSha256(
      credentialBinding.sha256,
      'CREDENTIAL_CONFIGURATION_HASH_MISMATCH'
    ) ===
      requireSha256(
        context.credentialConfigurationSha256,
        'CREDENTIAL_CONFIGURATION_HASH_MISMATCH'
      ),
    'CREDENTIAL_CONFIGURATION_HASH_MISMATCH'
  );
  validateExternalFileIdentity(
    credentialBinding.sourceIdentity,
    credentialBinding.sha256,
    'CREDENTIAL_CONFIGURATION_SOURCE_IDENTITY_INVALID'
  );
  requireCondition(
    canonicalJson(credentialBinding.sourceIdentity) ===
      canonicalJson(context.credentialConfigurationSourceIdentity),
    'CREDENTIAL_CONFIGURATION_SOURCE_IDENTITY_MISMATCH'
  );
  requireCondition(
    approval.evidenceSha256 ===
      requireSha256(
        context.approvalEvidenceSha256,
        'APPROVAL_EVIDENCE_HASH_MISMATCH'
      ),
    'APPROVAL_EVIDENCE_HASH_MISMATCH'
  );
  const pricingEvidenceBinding = requireRecord(
    binding.cost.pricingEvidence,
    'PRICING_EVIDENCE_NOT_CAPTURED'
  );
  requireCondition(
    pricingEvidenceBinding.artifactSha256 ===
      requireSha256(
        context.pricingEvidenceSha256,
        'PRICING_EVIDENCE_HASH_MISMATCH'
      ),
    'PRICING_EVIDENCE_HASH_MISMATCH'
  );
  requireCondition(
    canonicalJson(pricingEvidenceBinding.sourceIdentity) ===
      canonicalJson(context.pricingEvidenceSourceIdentity),
    'PRICING_EVIDENCE_SOURCE_IDENTITY_MISMATCH'
  );

  const bindingMaterialSha256 = sha256Canonical(buildBindingMaterial(binding));
  requireCondition(
    approval.approvedBindingMaterialSha256 === bindingMaterialSha256,
    'BINDING_MATERIAL_HASH_MISMATCH'
  );
  validatePricingEvidence(binding, context.pricingEvidence, context);
  validateApprovalEvidence(
    binding,
    context.approvalEvidence,
    bindingMaterialSha256,
    projectionSha256
  );
  if (finalApprovalRequired) {
    validateFinalApprovalReceipt(
      binding,
      context,
      bindingMaterialSha256,
      projectionSha256
    );
  }
  requireNoUnresolvedValues(
    {
      approval: Object.fromEntries(
        Object.entries(binding.approval).filter(
          ([key]) => key !== 'operatorReconfirmedAt'
        )
      ),
      approvedRequest: binding.approvedRequest,
      cost: binding.cost,
      credentialControls: binding.credentialControls,
      duplicateAndFailurePolicy: binding.duplicateAndFailurePolicy,
      environmentProposal: binding.environmentProposal,
      governanceProposal: binding.governanceProposal,
      implementationContracts: binding.implementationContracts,
      lifecycle: binding.lifecycle,
      operatorControl: binding.operatorControl,
      organizationIdentityEvidence: binding.organizationIdentityEvidence,
      phase1Owners: {
        commercialReleaseOwner: binding.owners.commercialReleaseOwner,
        provisioningOperator: binding.owners.provisioningOperator,
        supabasePlatformOwner: binding.owners.supabasePlatformOwner,
        cleanupOwner: binding.owners.cleanupOwner,
        evidenceCustodian: binding.owners.evidenceCustodian,
      },
      retentionAndCleanupDecision: binding.retentionAndCleanupDecision,
      target: binding.target,
    },
    'REQUIRED_VALUE_UNRESOLVED'
  );

  return {
    actionId: ACTION_ID,
    bindingMaterialSha256,
    payloadSha256: projectionSha256,
    projectName: binding.environmentProposal.projectName,
    organizationId: binding.environmentProposal.organizationId,
    organizationSlug: binding.environmentProposal.organizationSlug,
    region: binding.environmentProposal.region,
    tier: binding.environmentProposal.databaseTier,
    approvalExpiresAt: approval.expiresAt,
    scheduledExecutionAt: binding.provisioningAction.scheduledExecutionAt,
    organizationIdentityEvidence: binding.organizationIdentityEvidence,
    remoteContactPerformed: false,
    credentialReadPerformed: false,
    finalApprovalRequired: !finalApprovalRequired,
    sourceProjectProvisioningAuthorized: finalApprovalRequired,
    operatorReconfirmedAt: finalApprovalRequired
      ? context.finalApprovalReceipt.acceptedAt
      : 'NOT_CAPTURED',
    finalApprovalReceiptSha256: finalApprovalRequired
      ? requireSha256(
          context.finalApprovalReceiptSha256,
          'FINAL_APPROVAL_RECEIPT_INVALID'
        )
      : null,
  };
}

export function validateOfflineApprovalCandidate(
  bindingInput,
  credentialConfigurationInput,
  contextInput
) {
  return validateOfflineApprovalCore(
    bindingInput,
    credentialConfigurationInput,
    contextInput,
    false
  );
}

export function validateOfflineApproval(
  bindingInput,
  credentialConfigurationInput,
  contextInput
) {
  return validateOfflineApprovalCore(
    bindingInput,
    credentialConfigurationInput,
    contextInput,
    true
  );
}

export function projectCreateResponseToSafeProjection(
  responseInput,
  bindingInput
) {
  const response = assertExactKeys(
    responseInput,
    [
      'id',
      'ref',
      'organization_id',
      'organization_slug',
      'name',
      'region',
      'created_at',
      'status',
    ],
    'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
  );
  const binding = requireRecord(bindingInput, 'BINDING_INVALID');
  const environment = requireRecord(
    binding.environmentProposal,
    'ENVIRONMENT_PROPOSAL_INVALID'
  );
  const prohibitedProjectRefs = requireArray(
    environment.prohibitedProjectRefs,
    'PRODUCTION_TARGET_DENYLIST_MISSING'
  );
  const ref = requireString(response.ref, 'PROVIDER_RESPONSE_INVALID');
  requireCondition(PROJECT_REF_PATTERN.test(ref), 'PROVIDER_RESPONSE_INVALID');
  requireCondition(
    !prohibitedProjectRefs.includes(ref),
    'PRODUCTION_TARGET_DENIED'
  );
  const deprecatedId = requireConcreteString(
    response.id,
    'PROVIDER_RESPONSE_INVALID'
  );
  requireCondition(
    !prohibitedProjectRefs.includes(deprecatedId),
    'PRODUCTION_TARGET_DENIED'
  );
  requireCondition(
    response.organization_id === environment.organizationId &&
      response.organization_slug === environment.organizationSlug &&
      response.name === environment.projectName &&
      response.region === environment.region &&
      PROJECT_STATUSES.has(response.status),
    'PROVIDER_RESPONSE_TARGET_MISMATCH'
  );
  const createdAt = normalizeProviderTimestamp(
    response.created_at,
    'PROVIDER_RESPONSE_TARGET_MISMATCH'
  );
  const safe = {
    projectRef: ref,
    organizationId: response.organization_id,
    organizationSlug: response.organization_slug,
    projectName: response.name,
    region: response.region,
    createdAt,
    status: response.status,
  };
  assertSecretFreeEvidence(safe, []);
  return safe;
}

export function organizationProjectPageToSafeProjection(
  responseInput,
  bindingInput
) {
  const response = assertExactKeys(
    responseInput,
    ['projects', 'pagination'],
    'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
  );
  const binding = requireRecord(bindingInput, 'BINDING_INVALID');
  const environment = requireRecord(
    binding.environmentProposal,
    'ENVIRONMENT_PROPOSAL_INVALID'
  );
  const prohibitedProjectRefs = requireArray(
    environment.prohibitedProjectRefs,
    'PRODUCTION_TARGET_DENYLIST_MISSING'
  );
  const pagination = assertExactKeys(
    response.pagination,
    ['count', 'limit', 'offset'],
    'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
  );
  for (const field of ['count', 'limit', 'offset']) {
    requireCondition(
      Number.isInteger(pagination[field]) && pagination[field] >= 0,
      'PROVIDER_RESPONSE_INVALID'
    );
  }
  const projects = requireArray(
    response.projects,
    'PROVIDER_RESPONSE_INVALID'
  ).map(item => {
    const project = assertExactKeys(
      item,
      [
        'ref',
        'name',
        'cloud_provider',
        'region',
        'is_branch',
        'status',
        'inserted_at',
        'databases',
      ],
      'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
    );
    const projectRef = requireString(project.ref, 'PROVIDER_RESPONSE_INVALID');
    requireCondition(
      PROJECT_REF_PATTERN.test(projectRef) && typeof project.name === 'string',
      'PROVIDER_RESPONSE_INVALID'
    );
    if (prohibitedProjectRefs.includes(projectRef)) {
      validateSameOrganizationException(binding);
      requireCondition(
        projectRef === PRODUCTION_PROJECT_REF &&
          project.name === PRODUCTION_PROJECT_NAME,
        'PRODUCTION_PROJECT_IDENTITY_MISMATCH'
      );
      requireCondition(
        project.name !== environment.projectName,
        'PRODUCTION_TARGET_NAME_COLLISION'
      );
      return {
        projectRef,
        protectedProductionProject: true,
      };
    }
    const databases = requireArray(
      project.databases,
      'PROVIDER_RESPONSE_INVALID'
    );
    databases.forEach(database => {
      const projectedDatabase = assertAllowedKeys(
        database,
        [
          'infra_compute_size',
          'region',
          'status',
          'cloud_provider',
          'identifier',
          'type',
          'disk_volume_size_gb',
          'disk_type',
          'disk_throughput_mbps',
          'disk_last_modified_at',
        ],
        'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
      );
      requireCondition(
        typeof projectedDatabase.region === 'string' &&
          typeof projectedDatabase.status === 'string' &&
          typeof projectedDatabase.cloud_provider === 'string' &&
          typeof projectedDatabase.identifier === 'string' &&
          ['PRIMARY', 'READ_REPLICA'].includes(projectedDatabase.type),
        'PROVIDER_RESPONSE_INVALID'
      );
      for (const optionalStringField of [
        'infra_compute_size',
        'disk_type',
        'disk_last_modified_at',
      ]) {
        requireCondition(
          !Object.hasOwn(projectedDatabase, optionalStringField) ||
            typeof projectedDatabase[optionalStringField] === 'string',
          'PROVIDER_RESPONSE_INVALID'
        );
      }
      for (const optionalNumberField of [
        'disk_volume_size_gb',
        'disk_throughput_mbps',
      ]) {
        requireCondition(
          !Object.hasOwn(projectedDatabase, optionalNumberField) ||
            (typeof projectedDatabase[optionalNumberField] === 'number' &&
              Number.isFinite(projectedDatabase[optionalNumberField]) &&
              projectedDatabase[optionalNumberField] >= 0),
          'PROVIDER_RESPONSE_INVALID'
        );
      }
    });
    requireCondition(
      typeof project.cloud_provider === 'string' &&
        typeof project.region === 'string' &&
        typeof project.is_branch === 'boolean' &&
        PROJECT_STATUSES.has(project.status),
      'PROVIDER_RESPONSE_INVALID'
    );
    const insertedAt = normalizeProviderTimestamp(
      project.inserted_at,
      'PROVIDER_RESPONSE_INVALID'
    );
    return {
      projectRef,
      projectName: project.name,
      region: project.region,
      isBranch: project.is_branch,
      status: project.status,
      insertedAt,
    };
  });
  requireCondition(
    projects.length <= pagination.limit &&
      pagination.offset + projects.length <= pagination.count,
    'PROJECT_LIST_PAGINATION_INVALID'
  );
  const duplicates = projects.filter(
    project =>
      project.projectName === environment.projectName &&
      project.isBranch === false
  );
  return {
    projects,
    pagination: {
      count: pagination.count,
      limit: pagination.limit,
      offset: pagination.offset,
    },
    duplicateProjectRefs: duplicates.map(project => project.projectRef),
    protectedProductionProjectCount: projects.filter(
      project => project.protectedProductionProject === true
    ).length,
  };
}

export function availableRegionsToSafeProjection(responseInput, bindingInput) {
  const response = assertExactKeys(
    responseInput,
    ['recommendations', 'all'],
    'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
  );
  const recommendations = assertExactKeys(
    response.recommendations,
    ['smartGroup', 'specific'],
    'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
  );
  const all = assertExactKeys(
    response.all,
    ['smartGroup', 'specific'],
    'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
  );
  const validateSmartGroup = entry => {
    const smartGroup = assertExactKeys(
      entry,
      ['name', 'code', 'type'],
      'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
    );
    requireCondition(
      typeof smartGroup.name === 'string' &&
        ['americas', 'emea', 'apac'].includes(smartGroup.code) &&
        smartGroup.type === 'smartGroup',
      'PROVIDER_RESPONSE_INVALID'
    );
  };
  validateSmartGroup(recommendations.smartGroup);
  requireArray(all.smartGroup, 'PROVIDER_RESPONSE_INVALID').forEach(
    validateSmartGroup
  );
  const recommendedSpecific = requireArray(
    recommendations.specific,
    'PROVIDER_RESPONSE_INVALID'
  );
  const allSpecific = requireArray(all.specific, 'PROVIDER_RESPONSE_INVALID');
  const validateSpecificRegion = entry => {
    const region = assertAllowedKeys(
      entry,
      ['name', 'code', 'type', 'provider', 'status'],
      'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
    );
    requireCondition(
      typeof region.name === 'string' &&
        typeof region.code === 'string' &&
        region.type === 'specific' &&
        ['AWS', 'FLY', 'AWS_K8S', 'AWS_NIMBUS'].includes(region.provider) &&
        (region.status === undefined ||
          ['capacity', 'other'].includes(region.status)),
      'PROVIDER_RESPONSE_INVALID'
    );
    return region;
  };
  recommendedSpecific.forEach(validateSpecificRegion);
  allSpecific.forEach(validateSpecificRegion);
  const binding = requireRecord(bindingInput, 'BINDING_INVALID');
  const targetRegion = binding.environmentProposal.region;
  const matches = allSpecific.filter(
    entry => isRecord(entry) && entry.code === targetRegion
  );
  requireCondition(matches.length === 1, 'TARGET_REGION_UNAVAILABLE');
  const match = assertAllowedKeys(
    matches[0],
    ['name', 'code', 'type', 'provider', 'status'],
    'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
  );
  requireCondition(
    match.type === 'specific' &&
      match.code === targetRegion &&
      typeof match.name === 'string' &&
      ['AWS', 'FLY', 'AWS_K8S', 'AWS_NIMBUS'].includes(match.provider) &&
      (match.status === undefined ||
        ['capacity', 'other'].includes(match.status)),
    'TARGET_REGION_UNAVAILABLE'
  );
  return {
    regionCode: match.code,
    selectionType: match.type,
    provider: match.provider,
    capacityStatus: match.status ?? 'NOT_EXPOSED',
  };
}

export function addonResponseToSafeProjection(responseInput, projectRefInput) {
  const response = assertExactKeys(
    responseInput,
    ['selected_addons', 'available_addons'],
    'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
  );
  const projectRef = requireString(
    projectRefInput,
    'PROVIDER_RESPONSE_INVALID'
  );
  requireCondition(
    PROJECT_REF_PATTERN.test(projectRef) &&
      projectRef !== PRODUCTION_PROJECT_REF,
    projectRef === PRODUCTION_PROJECT_REF
      ? 'PRODUCTION_CONTACT_DENIED'
      : 'PROVIDER_RESPONSE_INVALID'
  );
  const addons = requireArray(
    response.selected_addons,
    'PROVIDER_RESPONSE_INVALID'
  );
  const availableAddons = requireArray(
    response.available_addons,
    'PROVIDER_RESPONSE_INVALID'
  );
  const validateVariant = variantInput => {
    const variant = assertAllowedKeys(
      variantInput,
      ['id', 'name', 'price', 'meta'],
      'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
    );
    requireCondition(
      Object.hasOwn(variant, 'id') &&
        Object.hasOwn(variant, 'name') &&
        Object.hasOwn(variant, 'price') &&
        ADDON_VARIANT_IDS.has(variant.id) &&
        typeof variant.name === 'string',
      'PROVIDER_RESPONSE_INVALID'
    );
    const price = assertExactKeys(
      variant.price,
      ['description', 'type', 'interval', 'amount'],
      'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
    );
    requireCondition(
      typeof price.description === 'string' &&
        ['fixed', 'usage'].includes(price.type) &&
        ['monthly', 'hourly'].includes(price.interval) &&
        typeof price.amount === 'number' &&
        Number.isFinite(price.amount) &&
        price.amount >= 0,
      'PROVIDER_RESPONSE_INVALID'
    );
    if (Object.hasOwn(variant, 'meta')) canonicalizeJson(variant.meta);
    return variant;
  };
  addons.forEach(item => {
    const addon = assertExactKeys(
      item,
      ['type', 'variant'],
      'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
    );
    const variant = validateVariant(addon.variant);
    requireCondition(
      ADDON_TYPES.has(addon.type) && typeof variant.id === 'string',
      'PROVIDER_RESPONSE_INVALID'
    );
  });
  availableAddons.forEach(item => {
    const addon = assertExactKeys(
      item,
      ['type', 'name', 'variants'],
      'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
    );
    requireCondition(
      ADDON_TYPES.has(addon.type) && typeof addon.name === 'string',
      'PROVIDER_RESPONSE_INVALID'
    );
    requireArray(addon.variants, 'PROVIDER_RESPONSE_INVALID').forEach(
      variant => {
        validateVariant(variant);
      }
    );
  });
  const selectedComputeAddons = addons.filter(
    item => item.type === 'compute_instance'
  );
  requireCondition(
    selectedComputeAddons.length === 1 &&
      selectedComputeAddons[0].variant.id === LARGE_ADDON_VARIANT,
    'LARGE_COMPUTE_NOT_OBSERVED'
  );
  const addon = assertExactKeys(
    selectedComputeAddons[0],
    ['type', 'variant'],
    'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
  );
  const variant = validateVariant(addon.variant);
  requireCondition(
    variant.id === LARGE_ADDON_VARIANT,
    'LARGE_COMPUTE_NOT_OBSERVED'
  );
  return {
    projectRef,
    addonType: addon.type,
    variantId: variant.id,
  };
}

export function assertSecretFreeEvidence(evidence, forbiddenValues = []) {
  const serialized = canonicalJson(evidence);
  const rawStrings = [];
  const collectRawStrings = value => {
    if (typeof value === 'string') {
      rawStrings.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collectRawStrings);
      return;
    }
    if (isRecord(value)) {
      Object.entries(value).forEach(([key, nestedValue]) => {
        rawStrings.push(key);
        collectRawStrings(nestedValue);
      });
    }
  };
  collectRawStrings(evidence);
  const containsNamedSecret = requireArray(
    forbiddenValues,
    'SECRET_SCAN_INPUT_INVALID'
  ).some(
    value =>
      typeof value === 'string' &&
      value.length > 0 &&
      (rawStrings.some(candidate => candidate.includes(value)) ||
        serialized.includes(JSON.stringify(value).slice(1, -1)))
  );
  const patterns = [
    /bearer\s+[a-z0-9._~+/=-]+/i,
    /eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/i,
    /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i,
    /sb_(?:secret|publishable)_[a-z0-9_-]+/i,
    /sbp_[a-z0-9_-]{16,}/i,
    /service_role[^\s"']*[=:][^\s,"'}]+/i,
  ];
  const secretValueKeys = new Set([
    'access_token',
    'authorization',
    'database_password',
    'management_token',
    'password',
  ]);
  const containsForbiddenSecretField = value => {
    if (Array.isArray(value)) return value.some(containsForbiddenSecretField);
    if (!isRecord(value)) return false;
    return Object.entries(value).some(([key, nestedValue]) => {
      const normalizedKey = key.toLowerCase();
      if (
        secretValueKeys.has(normalizedKey) &&
        nestedValue !== null &&
        !isRecord(nestedValue) &&
        !Array.isArray(nestedValue)
      ) {
        return true;
      }
      if (normalizedKey === 'db_pass' && nestedValue !== PAYLOAD_SENTINEL) {
        return true;
      }
      return containsForbiddenSecretField(nestedValue);
    });
  };
  requireCondition(
    !containsNamedSecret &&
      !containsForbiddenSecretField(evidence) &&
      patterns.every(
        pattern =>
          !pattern.test(serialized) &&
          rawStrings.every(candidate => !pattern.test(candidate))
      ),
    'SECRET_BEARING_EVIDENCE'
  );
  return true;
}

export function isJsonMediaType(contentTypeInput) {
  return (
    typeof contentTypeInput === 'string' &&
    /^application\/json(?:\s*;[^\r\n]*)?$/i.test(contentTypeInput.trim())
  );
}

export function claimActionJournal(directoryInput, claimInput) {
  const directory = requireConcreteString(
    directoryInput,
    'ACTION_JOURNAL_DIRECTORY_INVALID'
  );
  requireCondition(
    path.isAbsolute(directory),
    'ACTION_JOURNAL_DIRECTORY_INVALID'
  );
  const claim = assertExactKeys(
    claimInput,
    [
      'actionId',
      'bindingMaterialSha256',
      'payloadSha256',
      'finalApprovalReceiptSha256',
      'claimedAt',
      'state',
    ],
    'ACTION_JOURNAL_CLAIM_INVALID'
  );
  requireCondition(
    claim.actionId === ACTION_ID &&
      SHA256_PATTERN.test(claim.bindingMaterialSha256) &&
      SHA256_PATTERN.test(claim.payloadSha256) &&
      SHA256_PATTERN.test(claim.finalApprovalReceiptSha256) &&
      Number.isFinite(
        parseTimestamp(claim.claimedAt, 'ACTION_JOURNAL_CLAIM_INVALID')
      ) &&
      claim.state === 'CLAIMED_POST_NOT_SENT',
    'ACTION_JOURNAL_CLAIM_INVALID'
  );
  assertSecretFreeEvidence(claim, []);
  const claimPath = path.join(
    directory,
    'source-project-provisioning-action.claim.json'
  );
  const claimContents = `${canonicalJson(claim)}\n`;
  let descriptor;
  try {
    descriptor = openSync(claimPath, 'wx', 0o600);
    writeFileSync(descriptor, claimContents, {
      encoding: 'utf8',
      flush: true,
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EEXIST'
    ) {
      fail('ACTION_ALREADY_CLAIMED');
    }
    fail('ACTION_JOURNAL_CLAIM_FAILED');
  } finally {
    if (typeof descriptor === 'number') closeSync(descriptor);
  }
  requireCondition(
    !lstatSync(claimPath).isSymbolicLink() &&
      statSync(claimPath).isFile() &&
      readFileSync(claimPath, 'utf8') === claimContents,
    'ACTION_JOURNAL_CLAIM_FAILED'
  );
  return {
    actionId: ACTION_ID,
    claimPath,
    claimSha256: sha256Text(claimContents),
  };
}

export function assertProviderBodyEnvelope(contentType, bodyText) {
  requireCondition(
    isJsonMediaType(contentType),
    'PROVIDER_CONTENT_TYPE_INVALID'
  );
  requireCondition(
    typeof bodyText === 'string' &&
      Buffer.byteLength(bodyText, 'utf8') <= MAX_PROVIDER_BODY_BYTES,
    'PROVIDER_BODY_SIZE_INVALID'
  );
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    fail('PROVIDER_RESPONSE_INVALID_JSON');
  }
  return parsed;
}
