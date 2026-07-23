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
export const PRODUCTION_PROJECT_REF = 'qnanuoqveidwvacvbhqp';
export const SOURCE_COMPUTE_RATE_USD_PER_PROJECT_HOUR = 0.1517;
export const SOURCE_MAXIMUM_COMPUTE_USD = 10.9224;
export const FUNDING_CEILING_USD = 50;
export const PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_SECONDS = 300;
const GOVERNANCE_RELATIVE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml';
const CONTRACT_RELATIVE_PATH =
  'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs';
const WRAPPER_RELATIVE_PATH =
  'scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs';

export const GENERIC_CREDENTIAL_NAMES = Object.freeze([
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

export function isForbiddenAmbientCredentialName(nameInput) {
  if (typeof nameInput !== 'string') return true;
  const name = nameInput.toUpperCase();
  if (
    name === 'PR12_SUPABASE_ACCESS_TOKEN' ||
    name === 'PR12_SOURCE_DB_PASSWORD'
  ) {
    return false;
  }
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
      /^[a-z0-9][a-z0-9._@+:-]*$/.test(ownerId),
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
      !/[\\\u0000-\u001f\u007f]/.test(handle),
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
      'javascript:',
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

export function journalDirectoryFingerprint(directoryInput) {
  const directory = requireConcreteString(
    directoryInput,
    'ACTION_JOURNAL_DIRECTORY_INVALID'
  );
  requireCondition(
    path.isAbsolute(directory),
    'ACTION_JOURNAL_DIRECTORY_INVALID'
  );
  const normalized = path
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

function validateBindingShape(binding) {
  assertExactKeys(
    binding,
    [
      'schemaVersion',
      'phase',
      'status',
      'authorization',
      'provisioningAction',
      'target',
      'governanceProposal',
      'implementationContracts',
      'credentialControls',
      'approvedRequest',
      'environmentProposal',
      'initialPlatformPosture',
      'duplicateAndFailurePolicy',
      'lifecycle',
      'retentionAndCleanupDecision',
      'cost',
      'approval',
      'owners',
      'separationOfDuties',
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
  ]);
  exact(binding.target, ['gitCommit', 'baseCommit', 'cleanWorktreeRequired']);
  exact(binding.governanceProposal, ['path', 'sha256']);
  exact(binding.implementationContracts, [
    'contractPath',
    'contractSha256',
    'wrapperPath',
    'wrapperSha256',
  ]);
  exact(binding.credentialControls, [
    'provisioningCredentialConfiguration',
    'managementAccessTokenSecretName',
    'databasePasswordSecretName',
    'providerConfigurationMustExistBeforeApproval',
    'secretValuesCaptured',
  ]);
  exact(binding.credentialControls.provisioningCredentialConfiguration, [
    'path',
    'sha256',
  ]);
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
    'actionJournalDirectoryPathSha256',
    'organizationProjectListAllPagesRequiredBeforePost',
    'fixedNameDuplicateAction',
    'unknownRemoteOutcomeAction',
    'reconciliationOnlyMode',
    'automaticCleanupAuthorized',
    'destructiveRecoveryAuthorized',
    'recoveryOwner',
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
    'fundingCeilingUsd',
    'fundingApprovedAmountUsd',
    'fundingSource',
    'cleanupOwner',
    'deletionApprovalRequester',
    'deletionApprovalRequestDeadline',
    'billingEscalationOwner',
    'fundedExtensionOwner',
  ]);
  exact(binding.cost, [
    'currency',
    'computeRateUsdPerProjectHour',
    'sourceMaximumBillableHours',
    'sourceMaximumComputeUsd',
    'partialHourRounding',
    'organizationCurrentPlan',
    'organizationPlanChangeRequired',
    'planIncrementalUsd',
    'computeCreditAppliedUsd',
    'taxAndOtherChargesUsd',
    'actualDashboardQuoteUsd',
    'quote',
    'proposedBudgetCeilingUsd',
  ]);
  exact(binding.cost.quote, [
    'artifactPath',
    'artifactSha256',
    'observedAt',
    'validThrough',
  ]);
  exact(binding.approval, [
    'decision',
    'attestationStatus',
    'approvedBy',
    'approvedAt',
    'expiresAt',
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
  exact(binding.separationOfDuties, [
    'approvedByMustDifferFrom',
    'provisioningOperatorMustEqual',
    'provisioningOperatorMustDifferFrom',
  ]);
  exact(binding.evidenceContract, [
    'evidenceParentDirectoryPathSha256',
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
      'secrets',
      'processBoundary',
      'approvedBy',
      'approvedAt',
      'notes',
    ],
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  assertSecretFreeEvidence(configuration, []);
  requireCondition(
    configuration.schemaVersion === 1,
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
    ['providerId', 'configurationId', 'retrievalChannel', 'ownerApproved'],
    'CREDENTIAL_PROVIDER_NOT_APPROVED'
  );
  requireConcreteString(
    provider.providerId,
    'CREDENTIAL_PROVIDER_NOT_APPROVED'
  );
  requireConcreteString(
    provider.configurationId,
    'CREDENTIAL_PROVIDER_NOT_APPROVED'
  );
  requireCondition(
    provider.retrievalChannel === 'OWNER_APPROVED_ONE_PROCESS_ENVIRONMENT' &&
      provider.ownerApproved === true,
    'CREDENTIAL_PROVIDER_NOT_APPROVED'
  );

  const secrets = assertExactKeys(
    configuration.secrets,
    ['managementAccessToken', 'databasePassword'],
    'CREDENTIAL_HANDLE_MISSING'
  );
  const managementToken = assertExactKeys(
    secrets.managementAccessToken,
    [
      'environmentVariable',
      'opaqueHandle',
      'opaqueHandleSha256',
      'credentialType',
      'requiredEndpointOAuthScopes',
      'requiredFineGrainedPermissions',
    ],
    'CREDENTIAL_HANDLE_MISSING'
  );
  const databasePassword = assertExactKeys(
    secrets.databasePassword,
    [
      'environmentVariable',
      'opaqueHandle',
      'opaqueHandleSha256',
      'minimumLength',
    ],
    'CREDENTIAL_HANDLE_MISSING'
  );
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
    managementToken.environmentVariable === 'PR12_SUPABASE_ACCESS_TOKEN' &&
      databasePassword.environmentVariable === 'PR12_SOURCE_DB_PASSWORD' &&
      databasePassword.minimumLength === 32,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
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
      'rawValueInArgvAllowed',
      'rawValueInUrlAllowed',
      'rawValueInStdoutOrStderrAllowed',
      'rawValueInLogOrEvidenceAllowed',
    ],
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  for (const field of [
    'genericOrAmbientFallbackAllowed',
    'dotenvLoadingAllowed',
    'cliLoginSessionFallbackAllowed',
    'rawValueInArgvAllowed',
    'rawValueInUrlAllowed',
    'rawValueInStdoutOrStderrAllowed',
    'rawValueInLogOrEvidenceAllowed',
  ]) {
    requireBoolean(boundary[field], false, 'CREDENTIAL_CONFIGURATION_INVALID');
  }

  requireCanonicalOwnerId(
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
    controls.managementAccessTokenSecretName ===
      managementToken.environmentVariable &&
      controls.databasePasswordSecretName ===
        databasePassword.environmentVariable &&
      controls.providerConfigurationMustExistBeforeApproval === true &&
      controls.secretValuesCaptured === false,
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
    true,
    'SOURCE_PROVISIONING_NOT_AUTHORIZED'
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
  requireCondition(binding.schemaVersion === 2, 'BINDING_SCHEMA_INVALID');
  requireCondition(
    binding.phase === 'SOURCE_PROJECT_PROVISIONING' &&
      binding.status === 'APPROVED',
    'SOURCE_PROVISIONING_NOT_AUTHORIZED'
  );
}

export function assertSourceProjectProvisioningAuthorized(bindingInput) {
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
      Number.isInteger(action.requestTimeoutMilliseconds) &&
      action.requestTimeoutMilliseconds >= 5_000 &&
      action.requestTimeoutMilliseconds <= 120_000 &&
      Number.isInteger(action.readinessObservationMaximumSeconds) &&
      action.readinessObservationMaximumSeconds >= 60 &&
      action.readinessObservationMaximumSeconds <= 1_800 &&
      Number.isInteger(action.readinessPollIntervalSeconds) &&
      action.readinessPollIntervalSeconds >= 5 &&
      action.readinessPollIntervalSeconds <= 60 &&
      action.providerCreatedAtMaximumClockSkewSeconds ===
        PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_SECONDS,
    'PROVISIONING_ACTION_INVALID'
  );
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
  requireCondition(
    !prohibitedIds.includes(organizationId) &&
      !normalizedProhibitedSlugs.includes(organizationSlug.toLowerCase()),
    'PRODUCTION_ORGANIZATION_DENIED'
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
  const requiredOwnerKeys = [
    'commercialReleaseOwner',
    'provisioningOperator',
    'supabasePlatformOwner',
    'cleanupOwner',
    'evidenceCustodian',
  ];
  requiredOwnerKeys.forEach(key =>
    requireCanonicalOwnerId(owners[key], 'OWNER_ASSIGNMENT_INVALID')
  );
  const approval = requireRecord(binding.approval, 'APPROVAL_INVALID');
  requireCanonicalOwnerId(approval.approvedBy, 'OWNER_ASSIGNMENT_INVALID');
  requireCondition(
    approval.approvedBy === owners.commercialReleaseOwner &&
      owners.provisioningOperator === owners.supabasePlatformOwner &&
      approval.approvedBy !== owners.provisioningOperator &&
      approval.approvedBy !== owners.cleanupOwner &&
      approval.approvedBy !== owners.evidenceCustodian &&
      owners.provisioningOperator !== owners.cleanupOwner &&
      owners.provisioningOperator !== owners.evidenceCustodian,
    'OWNER_SEPARATION_INVALID'
  );
  const separation = requireRecord(
    binding.separationOfDuties,
    'OWNER_SEPARATION_INVALID'
  );
  requireCondition(
    separation.provisioningOperatorMustEqual === 'supabasePlatformOwner' &&
      canonicalJson(separation.approvedByMustDifferFrom) ===
        canonicalJson([
          'provisioningOperator',
          'supabasePlatformOwner',
          'cleanupOwner',
          'evidenceCustodian',
        ]) &&
      canonicalJson(separation.provisioningOperatorMustDifferFrom) ===
        canonicalJson(['cleanupOwner', 'evidenceCustodian']),
    'OWNER_SEPARATION_INVALID'
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

function validateCostFundingAndChronology(binding, context) {
  const approval = requireRecord(binding.approval, 'APPROVAL_INVALID');
  const approvedAt = parseTimestamp(approval.approvedAt, 'APPROVAL_INVALID');
  const expiresAt = parseTimestamp(approval.expiresAt, 'APPROVAL_INVALID');
  const now = parseTimestamp(context.now, 'CURRENT_TIME_INVALID');
  requireCondition(approvedAt < expiresAt, 'APPROVAL_WINDOW_INVALID');
  requireCondition(now >= approvedAt && now < expiresAt, 'APPROVAL_EXPIRED');

  const cost = requireRecord(binding.cost, 'QUOTE_NOT_CAPTURED');
  requireCondition(cost.currency === 'USD', 'QUOTE_NOT_CAPTURED');
  const quoteUsd = requireFiniteNumber(
    cost.actualDashboardQuoteUsd,
    'QUOTE_NOT_CAPTURED'
  );
  const rate = requireFiniteNumber(
    cost.computeRateUsdPerProjectHour,
    'QUOTE_NOT_CAPTURED'
  );
  const hours = requireFiniteNumber(
    cost.sourceMaximumBillableHours,
    'QUOTE_NOT_CAPTURED'
  );
  const maximumCompute = requireFiniteNumber(
    cost.sourceMaximumComputeUsd,
    'QUOTE_NOT_CAPTURED'
  );
  const computeCredit = requireFiniteNumber(
    cost.computeCreditAppliedUsd,
    'QUOTE_NOT_CAPTURED'
  );
  const taxAndOtherCharges = requireFiniteNumber(
    cost.taxAndOtherChargesUsd,
    'QUOTE_NOT_CAPTURED'
  );
  requireCondition(
    rate === SOURCE_COMPUTE_RATE_USD_PER_PROJECT_HOUR &&
      hours === 72 &&
      maximumCompute === SOURCE_MAXIMUM_COMPUTE_USD &&
      quoteUsd >= 0 &&
      computeCredit >= 0 &&
      taxAndOtherCharges >= 0 &&
      Math.abs(rate * hours - maximumCompute) < 0.000001 &&
      cost.partialHourRounding === 'ROUNDED_UP_TO_FULL_HOUR' &&
      cost.organizationCurrentPlan === 'PRO' &&
      cost.organizationPlanChangeRequired === false &&
      cost.planIncrementalUsd === 0 &&
      cost.sourceMaximumBillableHours === 72,
    'QUOTE_ARITHMETIC_INVALID'
  );
  const ceiling = requireFiniteNumber(
    cost.proposedBudgetCeilingUsd,
    'FUNDING_NOT_CAPTURED'
  );
  requireCondition(
    ceiling === FUNDING_CEILING_USD && quoteUsd <= ceiling,
    'QUOTE_EXCEEDS_CEILING'
  );

  const quote = requireRecord(cost.quote, 'QUOTE_NOT_CAPTURED');
  requireSafeEvidencePath(quote.artifactPath, 'QUOTE_NOT_CAPTURED');
  requireSha256(quote.artifactSha256, 'QUOTE_NOT_CAPTURED');
  const quoteObservedAt = parseTimestamp(
    quote.observedAt,
    'QUOTE_NOT_CAPTURED'
  );
  const quoteValidThrough = parseTimestamp(
    quote.validThrough,
    'QUOTE_NOT_CAPTURED'
  );
  requireCondition(
    quoteObservedAt <= approvedAt && quoteValidThrough >= now,
    'QUOTE_NOT_CURRENT_AT_APPROVAL'
  );

  const cleanup = requireRecord(
    binding.retentionAndCleanupDecision,
    'FUNDING_NOT_CAPTURED'
  );
  const fundedThrough = parseTimestamp(
    cleanup.fundedThrough,
    'FUNDING_NOT_CAPTURED'
  );
  requireConcreteString(cleanup.fundingSource, 'FUNDING_NOT_CAPTURED');
  const fundedAmount = requireFiniteNumber(
    cleanup.fundingApprovedAmountUsd,
    'FUNDING_NOT_CAPTURED'
  );
  const fundingCeiling = requireFiniteNumber(
    cleanup.fundingCeilingUsd,
    'FUNDING_NOT_CAPTURED'
  );
  requireCondition(
    cleanup.sourceFundedHours === 72 &&
      fundedAmount >= 0 &&
      fundingCeiling === FUNDING_CEILING_USD &&
      fundedAmount >= quoteUsd &&
      fundedAmount <= fundingCeiling &&
      fundingCeiling === ceiling &&
      fundedThrough >= expiresAt + 72 * 60 * 60 * 1000,
    'FUNDING_NOT_CAPTURED'
  );
  const deletionApprovalRequestDeadline = parseTimestamp(
    cleanup.deletionApprovalRequestDeadline,
    'CLEANUP_DECISION_INCOMPLETE'
  );
  requireCondition(
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
  requireCondition(
    policy.atomicLocalClaimRequiredBeforeCredentialRetrieval === true &&
      policy.durableFileFlushAndReadbackRequired === true &&
      policy.postIntentDurableBeforeFetch === true &&
      policy.postIntentPermanentlyConsumesActionIdentity === true &&
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
  requireCanonicalOwnerId(policy.recoveryOwner, 'DUPLICATE_GUARD_INVALID');

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
}

function validateQuoteEvidence(binding, quoteEvidenceInput) {
  const quoteEvidence = assertExactKeys(
    quoteEvidenceInput,
    [
      'schemaVersion',
      'recordType',
      'status',
      'organizationId',
      'organizationSlug',
      'organizationPlan',
      'currency',
      'lineItems',
      'actualDashboardQuoteUsd',
      'observedAt',
      'validThrough',
      'capturedBy',
      'rawDashboardArtifactPersistedInRepository',
    ],
    'QUOTE_EVIDENCE_INVALID'
  );
  const environment = binding.environmentProposal;
  const cost = binding.cost;
  requireCondition(
    quoteEvidence.schemaVersion === 1 &&
      quoteEvidence.recordType === 'PR12_SOURCE_PROJECT_DASHBOARD_QUOTE' &&
      quoteEvidence.status === 'CAPTURED' &&
      quoteEvidence.organizationId === environment.organizationId &&
      quoteEvidence.organizationSlug === environment.organizationSlug &&
      quoteEvidence.organizationPlan === 'PRO' &&
      quoteEvidence.currency === 'USD' &&
      quoteEvidence.actualDashboardQuoteUsd === cost.actualDashboardQuoteUsd &&
      quoteEvidence.observedAt === cost.quote.observedAt &&
      quoteEvidence.validThrough === cost.quote.validThrough &&
      quoteEvidence.rawDashboardArtifactPersistedInRepository === false,
    'QUOTE_EVIDENCE_INVALID'
  );
  requireCanonicalOwnerId(quoteEvidence.capturedBy, 'QUOTE_EVIDENCE_INVALID');
  const lineItems = assertExactKeys(
    quoteEvidence.lineItems,
    [
      'planIncrementalUsd',
      'sourceComputeMaximumUsd',
      'computeCreditAppliedUsd',
      'taxAndOtherChargesUsd',
    ],
    'QUOTE_EVIDENCE_INVALID'
  );
  const calculatedTotal =
    requireFiniteNumber(
      lineItems.planIncrementalUsd,
      'QUOTE_EVIDENCE_INVALID'
    ) +
    requireFiniteNumber(
      lineItems.sourceComputeMaximumUsd,
      'QUOTE_EVIDENCE_INVALID'
    ) -
    requireFiniteNumber(
      lineItems.computeCreditAppliedUsd,
      'QUOTE_EVIDENCE_INVALID'
    ) +
    requireFiniteNumber(
      lineItems.taxAndOtherChargesUsd,
      'QUOTE_EVIDENCE_INVALID'
    );
  requireCondition(
    Math.abs(calculatedTotal - quoteEvidence.actualDashboardQuoteUsd) <
      0.000001 &&
      lineItems.planIncrementalUsd === cost.planIncrementalUsd &&
      lineItems.sourceComputeMaximumUsd === cost.sourceMaximumComputeUsd &&
      lineItems.computeCreditAppliedUsd === cost.computeCreditAppliedUsd &&
      lineItems.taxAndOtherChargesUsd === cost.taxAndOtherChargesUsd,
    'QUOTE_ARITHMETIC_INVALID'
  );
  assertSecretFreeEvidence(quoteEvidence, []);
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
      'approver',
      'actionId',
      'gitCommit',
      'bindingMaterialSha256',
      'payloadSha256',
      'credentialConfigurationSha256',
      'quoteEvidenceSha256',
      'organizationId',
      'organizationSlug',
      'projectName',
      'region',
      'tier',
      'approvedAt',
      'expiresAt',
      'phase2AndLaterAuthorized',
      'cleanupDeletionAuthorized',
    ],
    'APPROVAL_EVIDENCE_INVALID'
  );
  const approval = binding.approval;
  const environment = binding.environmentProposal;
  requireCondition(
    evidence.schemaVersion === 1 &&
      evidence.recordType ===
        'PR12_SOURCE_PROJECT_PROVISIONING_OWNER_APPROVAL' &&
      evidence.decision === 'APPROVED' &&
      evidence.attestationStatus === 'VERIFIED' &&
      evidence.attestationMethod === 'OWNER_EXPLICIT_APPROVAL_RECORD' &&
      evidence.approver === approval.approvedBy &&
      evidence.actionId === ACTION_ID &&
      evidence.gitCommit === binding.target.gitCommit &&
      evidence.bindingMaterialSha256 === bindingMaterialSha256 &&
      evidence.payloadSha256 === payloadSha256 &&
      evidence.credentialConfigurationSha256 ===
        binding.credentialControls.provisioningCredentialConfiguration.sha256 &&
      evidence.quoteEvidenceSha256 === binding.cost.quote.artifactSha256 &&
      evidence.organizationId === environment.organizationId &&
      evidence.organizationSlug === environment.organizationSlug &&
      evidence.projectName === environment.projectName &&
      evidence.region === environment.region &&
      evidence.tier === environment.databaseTier &&
      evidence.approvedAt === approval.approvedAt &&
      evidence.expiresAt === approval.expiresAt &&
      evidence.phase2AndLaterAuthorized === false &&
      evidence.cleanupDeletionAuthorized === false,
    'APPROVAL_EVIDENCE_INVALID'
  );
  assertSecretFreeEvidence(evidence, []);
}

export function validateOfflineApproval(
  bindingInput,
  credentialConfigurationInput,
  contextInput
) {
  const binding = requireRecord(bindingInput, 'BINDING_INVALID');
  const context = requireRecord(contextInput, 'VALIDATION_CONTEXT_INVALID');
  validateBindingShape(binding);
  assertSecretFreeEvidence(binding, []);
  validateApprovalStatus(binding);

  const approval = requireRecord(binding.approval, 'APPROVAL_INVALID');
  requireCondition(
    approval.decision === 'APPROVED' &&
      approval.attestationStatus === 'VERIFIED' &&
      approval.approvedActionId === ACTION_ID,
    'APPROVAL_ATTESTATION_INVALID'
  );
  requireCanonicalOwnerId(approval.approvedBy, 'APPROVAL_ATTESTATION_INVALID');
  requireSafeEvidencePath(
    approval.evidencePath,
    'APPROVAL_ATTESTATION_INVALID'
  );
  requireSha256(approval.evidenceSha256, 'APPROVAL_ATTESTATION_INVALID');

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
  validateInitialPosture(binding);
  validateOwnersAndCleanup(binding);
  validateCostFundingAndChronology(binding, context);
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
    binding.evidenceContract.evidenceParentDirectoryPathSha256 ===
      requireSha256(
        context.evidenceParentDirectoryPathSha256,
        'EVIDENCE_DIRECTORY_MISMATCH'
      ),
    'EVIDENCE_DIRECTORY_MISMATCH'
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
      requireSha256(
        contracts.contractSha256,
        'IMPLEMENTATION_HASH_MISMATCH'
      ) ===
        requireSha256(context.contractSha256, 'IMPLEMENTATION_HASH_MISMATCH') &&
      requireSha256(contracts.wrapperSha256, 'IMPLEMENTATION_HASH_MISMATCH') ===
        requireSha256(context.wrapperSha256, 'IMPLEMENTATION_HASH_MISMATCH'),
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
  requireCondition(
    approval.evidenceSha256 ===
      requireSha256(
        context.approvalEvidenceSha256,
        'APPROVAL_EVIDENCE_HASH_MISMATCH'
      ),
    'APPROVAL_EVIDENCE_HASH_MISMATCH'
  );
  const quote = requireRecord(binding.cost.quote, 'QUOTE_NOT_CAPTURED');
  requireCondition(
    quote.artifactSha256 ===
      requireSha256(
        context.quoteEvidenceSha256,
        'QUOTE_EVIDENCE_HASH_MISMATCH'
      ),
    'QUOTE_EVIDENCE_HASH_MISMATCH'
  );

  const bindingMaterialSha256 = sha256Canonical(buildBindingMaterial(binding));
  requireCondition(
    approval.approvedBindingMaterialSha256 === bindingMaterialSha256,
    'BINDING_MATERIAL_HASH_MISMATCH'
  );
  validateQuoteEvidence(binding, context.quoteEvidence);
  validateApprovalEvidence(
    binding,
    context.approvalEvidence,
    bindingMaterialSha256,
    projectionSha256
  );
  requireNoUnresolvedValues(
    {
      approval: binding.approval,
      approvedRequest: binding.approvedRequest,
      cost: binding.cost,
      credentialControls: binding.credentialControls,
      duplicateAndFailurePolicy: binding.duplicateAndFailurePolicy,
      environmentProposal: binding.environmentProposal,
      governanceProposal: binding.governanceProposal,
      implementationContracts: binding.implementationContracts,
      lifecycle: binding.lifecycle,
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
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
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
      PROJECT_REF_PATTERN.test(project.ref) &&
        typeof project.name === 'string' &&
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
    requireCondition(
      !prohibitedProjectRefs.includes(project.ref),
      'PRODUCTION_TARGET_DENIED'
    );
    return {
      projectRef: project.ref,
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
  };
}

export function organizationResponseToSafeProjection(
  responseInput,
  bindingInput
) {
  const response = assertExactKeys(
    responseInput,
    ['id', 'name', 'plan', 'opt_in_tags', 'allowed_release_channels'],
    'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
  );
  const binding = requireRecord(bindingInput, 'BINDING_INVALID');
  const environment = requireRecord(
    binding.environmentProposal,
    'ENVIRONMENT_PROPOSAL_INVALID'
  );
  requireCondition(
    response.id === environment.organizationId &&
      typeof response.name === 'string' &&
      response.plan === 'pro' &&
      Array.isArray(response.opt_in_tags) &&
      response.opt_in_tags.every(value => typeof value === 'string') &&
      Array.isArray(response.allowed_release_channels) &&
      response.allowed_release_channels.every(
        value => typeof value === 'string'
      ),
    'ORGANIZATION_ENTITLEMENT_MISMATCH'
  );
  return {
    organizationId: response.id,
    organizationSlug: environment.organizationSlug,
    plan: 'PRO',
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
    PROJECT_REF_PATTERN.test(projectRef),
    'PROVIDER_RESPONSE_INVALID'
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
      'claimedAt',
      'state',
    ],
    'ACTION_JOURNAL_CLAIM_INVALID'
  );
  requireCondition(
    claim.actionId === ACTION_ID &&
      SHA256_PATTERN.test(claim.bindingMaterialSha256) &&
      SHA256_PATTERN.test(claim.payloadSha256) &&
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
