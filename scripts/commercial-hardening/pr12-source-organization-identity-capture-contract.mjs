import { createHash } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  APPROVED_BASE_COMMIT,
  DPAPI_PROVIDER_ID,
  DPAPI_RETRIEVAL_CHANNEL,
  PRODUCTION_PROJECT_ORIGIN,
  PRODUCTION_PROJECT_REF,
  TARGET_ORGANIZATION_NAME,
  TARGET_ORGANIZATION_SLUG,
  assertProviderBodyEnvelope,
  assertSecretFreeEvidence,
  canonicalJson,
  isForbiddenAmbientCredentialName,
  sha256Text,
} from './pr12-source-project-provisioning-contract.mjs';

export const ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID = 'PR12-ACTION-002';
export const ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT = `https://api.supabase.com/v1/organizations/${TARGET_ORGANIZATION_SLUG}`;
export const ORGANIZATION_IDENTITY_CAPTURE_CLAIM_FILE =
  'source-organization-identity-capture-action.claim.json';
export const ORGANIZATION_IDENTITY_CAPTURE_INTENT_FILE =
  'source-organization-identity-capture-get-intent.json';
export const ORGANIZATION_IDENTITY_CAPTURE_TERMINAL_FILE =
  'source-organization-identity-capture-terminal-outcome.json';
export const ORGANIZATION_IDENTITY_CAPTURE_MAX_BODY_BYTES = 65_536;
export const ORGANIZATION_IDENTITY_CAPTURE_MAX_APPROVAL_WINDOW_SECONDS = 1_800;
export const ORGANIZATION_IDENTITY_CAPTURE_MINIMUM_COOLING_SECONDS = 300;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const CANONICAL_OWNER_PATTERN = /^[a-z0-9][a-z0-9._@+:-]*$/;
const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const UNRESOLVED = new Set([
  '',
  'NOT_CAPTURED',
  'NOT_IMPLEMENTED',
  'NOT_RUN',
  'UNASSIGNED',
  'UNKNOWN',
]);

export class OrganizationIdentityCaptureContractError extends Error {
  constructor(code) {
    super(code);
    this.name = 'OrganizationIdentityCaptureContractError';
    this.code = code;
  }
}

function fail(code) {
  throw new OrganizationIdentityCaptureContractError(code);
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

function requireExactKeys(value, expectedKeys, code) {
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

function requireString(value, code) {
  requireCondition(
    typeof value === 'string' &&
      value.length > 0 &&
      value === value.trim() &&
      !UNRESOLVED.has(value.toUpperCase()),
    code
  );
  return value;
}

function requireSha256(value, code) {
  const text = requireString(value, code);
  requireCondition(SHA256_PATTERN.test(text), code);
  return text;
}

function requireGitSha(value, code) {
  const text = requireString(value, code);
  requireCondition(GIT_SHA_PATTERN.test(text), code);
  return text;
}

function requireCanonicalOwnerId(value, code) {
  const text = requireString(value, code);
  requireCondition(
    text === text.toLowerCase() && CANONICAL_OWNER_PATTERN.test(text),
    code
  );
  return text;
}

function timestampMilliseconds(value, code) {
  const text = requireString(value, code);
  const milliseconds = Date.parse(text);
  requireCondition(
    Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === text,
    code
  );
  return milliseconds;
}

function requireBoolean(value, expected, code) {
  requireCondition(value === expected, code);
}

function requireNoForbiddenTransportEnvironment(environment) {
  requireRecord(environment, 'AMBIENT_ENVIRONMENT_INVALID');
  for (const [name, value] of Object.entries(environment)) {
    if (
      typeof value === 'string' &&
      value.length > 0 &&
      isForbiddenAmbientCredentialName(name)
    ) {
      fail('AMBIENT_CREDENTIAL_OR_TRANSPORT_ENVIRONMENT_FORBIDDEN');
    }
  }
}

function assertImplementationBinding(binding, context) {
  const implementation = requireExactKeys(
    binding.implementationContracts,
    [
      'contractPath',
      'contractSha256',
      'sharedProvisioningContractPath',
      'sharedProvisioningContractSha256',
      'wrapperPath',
      'wrapperSha256',
      'credentialChannelPath',
      'credentialChannelSha256',
      'credentialBrokerPath',
      'credentialBrokerSha256',
      'evidenceVerifierPath',
      'evidenceVerifierSha256',
    ],
    'IMPLEMENTATION_BINDING_INVALID'
  );
  const expected = {
    contractPath:
      'scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs',
    contractSha256: context.contractSha256,
    sharedProvisioningContractPath:
      'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs',
    sharedProvisioningContractSha256: context.sharedProvisioningContractSha256,
    wrapperPath:
      'scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs',
    wrapperSha256: context.wrapperSha256,
    credentialChannelPath:
      'scripts/commercial-hardening/pr12-windows-dpapi-credential-channel.mjs',
    credentialChannelSha256: context.credentialChannelSha256,
    credentialBrokerPath:
      'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1',
    credentialBrokerSha256: context.credentialBrokerSha256,
    evidenceVerifierPath:
      'scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs',
    evidenceVerifierSha256: context.evidenceVerifierSha256,
  };
  requireCondition(
    canonicalJson(implementation) === canonicalJson(expected),
    'IMPLEMENTATION_HASH_MISMATCH'
  );
}

function validateCredentialConfiguration(configuration, expectedSha256) {
  const config = requireRecord(
    configuration,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    config.schemaVersion === 2 &&
      config.resultType ===
        'SOURCE_PROJECT_PROVISIONING_CREDENTIAL_CONFIGURATION' &&
      config.status === 'READY',
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  const provider = requireRecord(
    config.provider,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    provider.providerId === DPAPI_PROVIDER_ID &&
      provider.retrievalChannel === DPAPI_RETRIEVAL_CHANNEL &&
      provider.ownerApproved === true &&
      provider.protectionScope === 'CURRENT_USER',
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  [
    provider.ownerSidSha256,
    provider.machineNameSha256,
    provider.providerRootPathSha256,
    provider.providerRootResolvedPathSha256,
  ].forEach(value => requireSha256(value, 'CREDENTIAL_CONFIGURATION_INVALID'));
  requireString(provider.configurationId, 'CREDENTIAL_CONFIGURATION_INVALID');
  requireString(provider.providerRoot, 'CREDENTIAL_CONFIGURATION_INVALID');

  const token = requireRecord(
    requireRecord(config.secrets, 'CREDENTIAL_CONFIGURATION_INVALID')
      .managementAccessToken,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    token.role === 'MANAGEMENT_ACCESS_TOKEN' &&
      token.credentialType === 'SUPABASE_FINE_GRAINED_ACCESS_TOKEN' &&
      token.minimumBytes === 20 &&
      token.maximumBytes === 4096,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireString(token.opaqueHandle, 'CREDENTIAL_CONFIGURATION_INVALID');
  requireSha256(token.opaqueHandleSha256, 'CREDENTIAL_CONFIGURATION_INVALID');
  requireString(token.envelopeFilename, 'CREDENTIAL_CONFIGURATION_INVALID');
  requireSha256(token.envelopeSha256, 'CREDENTIAL_CONFIGURATION_INVALID');
  requireCondition(
    Array.isArray(token.requiredEndpointOAuthScopes) &&
      token.requiredEndpointOAuthScopes.includes('organizations:read') &&
      Array.isArray(token.requiredFineGrainedPermissions) &&
      token.requiredFineGrainedPermissions.includes('organization_admin_read'),
    'CREDENTIAL_PERMISSION_CONTRACT_INVALID'
  );

  const processBoundary = requireRecord(
    config.processBoundary,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  for (const key of [
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
    requireBoolean(
      processBoundary[key],
      false,
      'CREDENTIAL_CONFIGURATION_INVALID'
    );
  }
  const bootstrap = requireRecord(
    config.bootstrap,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    bootstrap.realCredentialBootstrapCompleted === true &&
      bootstrap.separateInteractiveAuthorizationRequired === true,
    'CREDENTIAL_BOOTSTRAP_INCOMPLETE'
  );
  requireSha256(expectedSha256, 'CREDENTIAL_CONFIGURATION_INVALID');
  return config;
}

export function buildOrganizationIdentityCaptureBindingMaterial(bindingInput) {
  const binding = requireRecord(bindingInput, 'BINDING_INVALID');
  return {
    schemaVersion: binding.schemaVersion,
    phase: binding.phase,
    action: binding.action,
    authorization: binding.authorization,
    approvedRequest: binding.approvedRequest,
    target: binding.target,
    governance: binding.governance,
    implementationContracts: binding.implementationContracts,
    runtimeControls: binding.runtimeControls,
    credentialControls: binding.credentialControls,
    expectedOrganization: binding.expectedOrganization,
    productionBoundary: binding.productionBoundary,
    ownerControl: binding.ownerControl,
    journalAndEvidence: binding.journalAndEvidence,
    evidenceContract: binding.evidenceContract,
  };
}

export function buildOrganizationIdentityCaptureRequestProjection() {
  return {
    bodyPresent: false,
    method: 'GET',
    url: ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT,
  };
}

export function assertAllowedOrganizationIdentityCaptureRequest(requestInput) {
  const request = requireExactKeys(
    requestInput,
    ['bodyPresent', 'method', 'url'],
    'OUTBOUND_REQUEST_INVALID'
  );
  requireCondition(
    request.method === 'GET' && request.bodyPresent === false,
    'OUTBOUND_ROUTE_NOT_ALLOWED'
  );
  requireCondition(typeof request.url === 'string', 'OUTBOUND_URL_INVALID');
  requireCondition(
    request.url === ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT,
    'OUTBOUND_ROUTE_NOT_ALLOWED'
  );
  let url;
  try {
    url = new URL(request.url);
  } catch {
    fail('OUTBOUND_URL_INVALID');
  }
  const raw = String(request.url);
  let decoded = raw;
  for (let count = 0; count < 3; count += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      fail('OUTBOUND_URL_INVALID');
    }
  }
  const forbidden = [
    PRODUCTION_PROJECT_REF,
    PRODUCTION_PROJECT_ORIGIN,
    '/v1/projects',
    '/projects',
    '/billing',
    '/available-regions',
  ];
  requireCondition(
    forbidden.every(
      value =>
        !raw.toLowerCase().includes(value.toLowerCase()) &&
        !decoded.toLowerCase().includes(value.toLowerCase())
    ),
    'PRODUCTION_OR_PROJECT_ROUTE_FORBIDDEN'
  );
  requireCondition(
    url.href === ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT &&
      url.protocol === 'https:' &&
      url.hostname === 'api.supabase.com' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === `/v1/organizations/${TARGET_ORGANIZATION_SLUG}` &&
      url.search === '' &&
      url.hash === '',
    'OUTBOUND_ROUTE_NOT_ALLOWED'
  );
  return true;
}

export function organizationIdentityResponseToSafeProjection(responseInput) {
  const response = requireExactKeys(
    responseInput,
    ['allowed_release_channels', 'id', 'name', 'opt_in_tags', 'plan'],
    'ORGANIZATION_RESPONSE_INVALID'
  );
  const organizationId = requireString(
    response.id,
    'ORGANIZATION_RESPONSE_INVALID'
  );
  requireCondition(
    organizationId.length <= 256 &&
      ORGANIZATION_ID_PATTERN.test(organizationId) &&
      organizationId !== PRODUCTION_PROJECT_REF,
    'ORGANIZATION_RESPONSE_INVALID'
  );
  requireCondition(
    response.name === TARGET_ORGANIZATION_NAME && response.plan === 'pro',
    'ORGANIZATION_IDENTITY_OR_PLAN_MISMATCH'
  );
  for (const value of [
    response.opt_in_tags,
    response.allowed_release_channels,
  ]) {
    requireCondition(
      Array.isArray(value) &&
        value.length <= 256 &&
        value.every(
          entry =>
            typeof entry === 'string' &&
            entry.length <= 256 &&
            !entry.includes(PRODUCTION_PROJECT_REF) &&
            !entry.includes(PRODUCTION_PROJECT_ORIGIN)
        ),
      'ORGANIZATION_RESPONSE_INVALID'
    );
  }
  requireCondition(
    !canonicalJson(response).includes(PRODUCTION_PROJECT_REF) &&
      !canonicalJson(response).includes(PRODUCTION_PROJECT_ORIGIN),
    'PRODUCTION_IDENTITY_IN_RESPONSE_FORBIDDEN'
  );
  return {
    organizationId,
    organizationName: TARGET_ORGANIZATION_NAME,
    organizationSlug: TARGET_ORGANIZATION_SLUG,
    plan: 'PRO',
  };
}

export function parseOrganizationIdentityProviderBody(contentType, bodyText) {
  const parsed = assertProviderBodyEnvelope(contentType, bodyText);
  return organizationIdentityResponseToSafeProjection(parsed);
}

export function validateOrganizationIdentityCaptureOffline(
  bindingInput,
  credentialConfigurationInput,
  approvalInput,
  contextInput
) {
  const binding = requireExactKeys(
    bindingInput,
    [
      'action',
      'approval',
      'approvedRequest',
      'authorization',
      'credentialControls',
      'evidenceContract',
      'expectedOrganization',
      'governance',
      'implementationContracts',
      'journalAndEvidence',
      'notes',
      'ownerControl',
      'phase',
      'productionBoundary',
      'runtimeControls',
      'schemaVersion',
      'status',
      'target',
    ],
    'BINDING_INVALID'
  );
  const context = requireRecord(contextInput, 'VALIDATION_CONTEXT_INVALID');
  requireCondition(
    binding.schemaVersion === 1 &&
      binding.phase === 'SOURCE_ORGANIZATION_IDENTITY_CAPTURE' &&
      binding.status === 'APPROVED_NOT_RUN',
    'BINDING_INVALID'
  );
  const authorization = requireExactKeys(
    binding.authorization,
    [
      'organizationIdentityCaptureAuthorized',
      'sourceProjectProvisioningAuthorized',
      'sourceProjectCreationAuthorized',
      'productionProjectDirectContactAuthorized',
      'databaseConnectionAuthorized',
      'phase2AndLaterAuthorized',
      'readyTransitionAuthorized',
      'mergeAuthorized',
      'commercialReleaseAuthorized',
    ],
    'AUTHORIZATION_INVALID'
  );
  requireBoolean(
    authorization.organizationIdentityCaptureAuthorized,
    true,
    'AUTHORIZATION_INVALID'
  );
  for (const [key, value] of Object.entries(authorization)) {
    if (key !== 'organizationIdentityCaptureAuthorized') {
      requireBoolean(value, false, 'AUTHORIZATION_INVALID');
    }
  }
  const action = requireExactKeys(
    binding.action,
    [
      'actionId',
      'endpoint',
      'httpMethod',
      'maximumRemoteContactCount',
      'maximumRequestAttempts',
      'automaticRetryAllowed',
      'redirectAllowed',
      'requestBodyAllowed',
      'requestTimeoutMilliseconds',
      'remoteContact',
      'mutating',
      'mutationScope',
      'mandatoryStopAfterEvidenceSeal',
    ],
    'ACTION_CONTRACT_INVALID'
  );
  requireCondition(
    action.actionId === ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID &&
      action.endpoint === ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT &&
      action.httpMethod === 'GET' &&
      action.maximumRemoteContactCount === 1 &&
      action.maximumRequestAttempts === 1 &&
      action.automaticRetryAllowed === false &&
      action.redirectAllowed === false &&
      action.requestBodyAllowed === false &&
      Number.isInteger(action.requestTimeoutMilliseconds) &&
      action.requestTimeoutMilliseconds >= 1_000 &&
      action.requestTimeoutMilliseconds <= 30_000 &&
      action.remoteContact === true &&
      action.mutating === false &&
      action.mutationScope === 'NONE' &&
      action.mandatoryStopAfterEvidenceSeal === true,
    'ACTION_CONTRACT_INVALID'
  );
  const approvedRequest = requireExactKeys(
    binding.approvedRequest,
    ['projection', 'sha256'],
    'REQUEST_BINDING_INVALID'
  );
  const expectedRequestProjection =
    buildOrganizationIdentityCaptureRequestProjection();
  const requestSha256 = sha256Text(canonicalJson(expectedRequestProjection));
  requireCondition(
    canonicalJson(approvedRequest.projection) ===
      canonicalJson(expectedRequestProjection) &&
      approvedRequest.sha256 === requestSha256,
    'REQUEST_BINDING_INVALID'
  );
  const target = requireExactKeys(
    binding.target,
    ['gitCommit', 'baseCommit', 'cleanWorktreeRequired'],
    'TARGET_BINDING_INVALID'
  );
  requireGitSha(target.gitCommit, 'TARGET_BINDING_INVALID');
  requireCondition(
    target.gitCommit === context.currentGitHead &&
      target.baseCommit === APPROVED_BASE_COMMIT &&
      context.baseCommitIsAncestor === true &&
      target.cleanWorktreeRequired === true &&
      context.gitWorktreeClean === true,
    'TARGET_BINDING_INVALID'
  );
  assertImplementationBinding(binding, context);
  const runtimeControls = requireExactKeys(
    binding.runtimeControls,
    [
      'processExecArgvMustBeEmpty',
      'requiredNodeMajor',
      'runtimeRecordedInEvidence',
    ],
    'RUNTIME_CONTROL_INVALID'
  );
  requireCondition(
    runtimeControls.requiredNodeMajor === 24 &&
      runtimeControls.processExecArgvMustBeEmpty === true &&
      runtimeControls.runtimeRecordedInEvidence === true,
    'RUNTIME_CONTROL_INVALID'
  );
  const governance = requireExactKeys(
    binding.governance,
    ['path', 'sha256'],
    'GOVERNANCE_BINDING_INVALID'
  );
  requireString(governance.path, 'GOVERNANCE_BINDING_INVALID');
  requireCondition(
    requireSha256(governance.sha256, 'GOVERNANCE_BINDING_INVALID') ===
      context.governanceSha256,
    'GOVERNANCE_BINDING_INVALID'
  );
  const controls = requireExactKeys(
    binding.credentialControls,
    [
      'credentialConfigurationPath',
      'credentialConfigurationSha256',
      'requiredProviderId',
      'requiredRetrievalChannel',
      'managementAccessTokenRetrievalAllowed',
      'databasePasswordRetrievalAllowed',
      'credentialBootstrapCompleted',
      'credentialRetrievalAfterDurableClaimOnly',
      'secretValuesCaptured',
    ],
    'CREDENTIAL_CONTROL_INVALID'
  );
  requireCondition(
    requireSha256(
      controls.credentialConfigurationSha256,
      'CREDENTIAL_CONTROL_INVALID'
    ) === context.credentialConfigurationSha256 &&
      controls.requiredProviderId === DPAPI_PROVIDER_ID &&
      controls.requiredRetrievalChannel === DPAPI_RETRIEVAL_CHANNEL &&
      controls.managementAccessTokenRetrievalAllowed === true &&
      controls.databasePasswordRetrievalAllowed === false &&
      controls.credentialBootstrapCompleted === true &&
      controls.credentialRetrievalAfterDurableClaimOnly === true &&
      controls.secretValuesCaptured === false,
    'CREDENTIAL_CONTROL_INVALID'
  );
  requireString(
    controls.credentialConfigurationPath,
    'CREDENTIAL_CONTROL_INVALID'
  );
  validateCredentialConfiguration(
    credentialConfigurationInput,
    context.credentialConfigurationSha256
  );
  const expectedOrganization = requireExactKeys(
    binding.expectedOrganization,
    [
      'organizationId',
      'organizationIdCaptureMode',
      'organizationName',
      'organizationSlug',
      'organizationPlan',
    ],
    'EXPECTED_ORGANIZATION_INVALID'
  );
  requireCondition(
    expectedOrganization.organizationId === 'DISCOVER_FROM_APPROVED_RESPONSE' &&
      expectedOrganization.organizationIdCaptureMode ===
        'DISCOVER_ONCE_BIND_FUTURE_PR12_ACTION_003' &&
      expectedOrganization.organizationName === TARGET_ORGANIZATION_NAME &&
      expectedOrganization.organizationSlug === TARGET_ORGANIZATION_SLUG &&
      expectedOrganization.organizationPlan === 'PRO',
    'EXPECTED_ORGANIZATION_INVALID'
  );
  const productionBoundary = requireExactKeys(
    binding.productionBoundary,
    [
      'productionProjectRef',
      'productionProjectOrigin',
      'organizationProjectEnumerationAuthorized',
      'productionProjectSpecificManagementApiContactAuthorized',
      'productionProjectDataPlaneContactAuthorized',
      'productionDatabaseContactAuthorized',
      'productionCredentialAccessAuthorized',
    ],
    'PRODUCTION_BOUNDARY_INVALID'
  );
  requireCondition(
    productionBoundary.productionProjectRef === PRODUCTION_PROJECT_REF &&
      productionBoundary.productionProjectOrigin ===
        PRODUCTION_PROJECT_ORIGIN &&
      Object.entries(productionBoundary)
        .filter(([key]) => key.endsWith('Authorized'))
        .every(([, value]) => value === false),
    'PRODUCTION_BOUNDARY_INVALID'
  );
  const ownerControl = requireExactKeys(
    binding.ownerControl,
    [
      'mode',
      'principalDisplayName',
      'principalId',
      'principalIdType',
      'operator',
      'approver',
      'identitySeparationAvailable',
      'independentHumanReviewClaimed',
      'soleOperatorSelfApprovalRiskAccepted',
      'sameUserDpapiCredentialExposureRiskAccepted',
      'minimumCoolingOffSeconds',
      'maximumApprovalWindowSeconds',
    ],
    'OWNER_CONTROL_INVALID'
  );
  const principalId = requireCanonicalOwnerId(
    ownerControl.principalId,
    'OWNER_CONTROL_INVALID'
  );
  requireCondition(
    ownerControl.mode === 'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1' &&
      ownerControl.principalDisplayName === 'FUTOSHI IWASAWA' &&
      ownerControl.principalIdType === 'OWNER_DECLARED_STABLE_PRINCIPAL_ID' &&
      ownerControl.operator === principalId &&
      ownerControl.approver === principalId &&
      ownerControl.identitySeparationAvailable === false &&
      ownerControl.independentHumanReviewClaimed === false &&
      ownerControl.soleOperatorSelfApprovalRiskAccepted === true &&
      ownerControl.sameUserDpapiCredentialExposureRiskAccepted === true &&
      ownerControl.minimumCoolingOffSeconds ===
        ORGANIZATION_IDENTITY_CAPTURE_MINIMUM_COOLING_SECONDS &&
      ownerControl.maximumApprovalWindowSeconds ===
        ORGANIZATION_IDENTITY_CAPTURE_MAX_APPROVAL_WINDOW_SECONDS,
    'OWNER_CONTROL_INVALID'
  );
  const directories = requireExactKeys(
    binding.journalAndEvidence,
    [
      'journalDirectoryPathSha256',
      'journalDirectoryResolvedPathSha256',
      'journalDirectoryDevice',
      'journalDirectoryInode',
      'evidenceParentDirectoryPathSha256',
      'evidenceParentDirectoryResolvedPathSha256',
      'evidenceParentDirectoryDevice',
      'evidenceParentDirectoryInode',
      'directoriesMustBeDisjoint',
      'strictAclRequired',
    ],
    'DIRECTORY_BINDING_INVALID'
  );
  for (const value of [
    directories.journalDirectoryPathSha256,
    directories.journalDirectoryResolvedPathSha256,
    directories.evidenceParentDirectoryPathSha256,
    directories.evidenceParentDirectoryResolvedPathSha256,
  ]) {
    requireSha256(value, 'DIRECTORY_BINDING_INVALID');
  }
  requireCondition(
    directories.journalDirectoryPathSha256 ===
      context.journalDirectoryPathSha256 &&
      directories.journalDirectoryResolvedPathSha256 ===
        context.journalDirectoryResolvedPathSha256 &&
      directories.journalDirectoryDevice === context.journalDirectoryDevice &&
      directories.journalDirectoryInode === context.journalDirectoryInode &&
      directories.evidenceParentDirectoryPathSha256 ===
        context.evidenceParentDirectoryPathSha256 &&
      directories.evidenceParentDirectoryResolvedPathSha256 ===
        context.evidenceParentDirectoryResolvedPathSha256 &&
      directories.evidenceParentDirectoryDevice ===
        context.evidenceParentDirectoryDevice &&
      directories.evidenceParentDirectoryInode ===
        context.evidenceParentDirectoryInode &&
      directories.directoriesMustBeDisjoint === true &&
      directories.strictAclRequired === true,
    'DIRECTORY_BINDING_INVALID'
  );
  const evidenceContract = requireExactKeys(
    binding.evidenceContract,
    [
      'requiredFiles',
      'rawProviderBodiesPersisted',
      'rawHttpHeadersPersisted',
      'secretFreeProjectionOnly',
      'privacyAndSecretScanRequired',
      'sha256ManifestRequired',
      'atomicPartialThenRenameRequired',
      'automaticResealAllowed',
      'remoteRecoveryAllowed',
    ],
    'EVIDENCE_CONTRACT_INVALID'
  );
  requireCondition(
    canonicalJson(evidenceContract.requiredFiles) ===
      canonicalJson([
        'action-events.json',
        'organization-identity-capture-result.json',
        'privacy-scan.json',
        'provider-export.safe.json',
        'manifest.json',
        'manifest.sha256',
      ]) &&
      evidenceContract.rawProviderBodiesPersisted === false &&
      evidenceContract.rawHttpHeadersPersisted === false &&
      evidenceContract.secretFreeProjectionOnly === true &&
      evidenceContract.privacyAndSecretScanRequired === true &&
      evidenceContract.sha256ManifestRequired === true &&
      evidenceContract.atomicPartialThenRenameRequired === true &&
      evidenceContract.automaticResealAllowed === false &&
      evidenceContract.remoteRecoveryAllowed === false,
    'EVIDENCE_CONTRACT_INVALID'
  );
  const bindingMaterialSha256 = sha256Text(
    canonicalJson(buildOrganizationIdentityCaptureBindingMaterial(binding))
  );
  const approval = requireExactKeys(
    approvalInput,
    [
      'actionId',
      'approvedAt',
      'approvedBindingMaterialSha256',
      'approvedBy',
      'approvedCredentialConfigurationSha256',
      'approvedEndpoint',
      'approvedGitCommit',
      'attestationStatus',
      'automaticRetryAllowed',
      'databasePasswordRetrievalAuthorized',
      'decision',
      'expiresAt',
      'maximumRemoteContactCount',
      'maximumRequestAttempts',
      'operatorReconfirmedAt',
      'productionProjectDirectContactAuthorized',
      'recordType',
      'redirectAllowed',
      'requestBodyAllowed',
      'schemaVersion',
      'sourceProjectProvisioningAuthorized',
      'tokenOnlyCredentialRetrievalAuthorized',
      'soleOperatorSelfApprovalRiskAccepted',
      'sameUserDpapiCredentialExposureRiskAccepted',
      'productionContactProhibitionAcknowledged',
    ],
    'APPROVAL_INVALID'
  );
  const approvedAt = timestampMilliseconds(
    approval.approvedAt,
    'APPROVAL_INVALID'
  );
  const reconfirmedAt = timestampMilliseconds(
    approval.operatorReconfirmedAt,
    'APPROVAL_INVALID'
  );
  const expiresAt = timestampMilliseconds(
    approval.expiresAt,
    'APPROVAL_INVALID'
  );
  const now = timestampMilliseconds(context.now, 'APPROVAL_INVALID');
  requireCondition(
    approval.schemaVersion === 1 &&
      approval.recordType ===
        'PR12_SOURCE_ORGANIZATION_IDENTITY_CAPTURE_APPROVAL' &&
      approval.actionId === ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID &&
      approval.decision === 'APPROVED' &&
      approval.attestationStatus === 'VERIFIED' &&
      approval.approvedBy === principalId &&
      approval.approvedGitCommit === target.gitCommit &&
      approval.approvedEndpoint === ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT &&
      approval.approvedBindingMaterialSha256 === bindingMaterialSha256 &&
      approval.approvedCredentialConfigurationSha256 ===
        context.credentialConfigurationSha256 &&
      approval.maximumRemoteContactCount === 1 &&
      approval.maximumRequestAttempts === 1 &&
      approval.automaticRetryAllowed === false &&
      approval.redirectAllowed === false &&
      approval.requestBodyAllowed === false &&
      approval.tokenOnlyCredentialRetrievalAuthorized === true &&
      approval.databasePasswordRetrievalAuthorized === false &&
      approval.sourceProjectProvisioningAuthorized === false &&
      approval.productionProjectDirectContactAuthorized === false &&
      approval.soleOperatorSelfApprovalRiskAccepted === true &&
      approval.sameUserDpapiCredentialExposureRiskAccepted === true &&
      approval.productionContactProhibitionAcknowledged === true &&
      reconfirmedAt - approvedAt >=
        ORGANIZATION_IDENTITY_CAPTURE_MINIMUM_COOLING_SECONDS * 1_000 &&
      expiresAt - approvedAt <=
        ORGANIZATION_IDENTITY_CAPTURE_MAX_APPROVAL_WINDOW_SECONDS * 1_000 &&
      approvedAt < reconfirmedAt &&
      reconfirmedAt <= now &&
      now < expiresAt,
    'APPROVAL_INVALID'
  );
  const bindingApproval = requireExactKeys(
    binding.approval,
    ['evidencePath', 'evidenceSha256'],
    'APPROVAL_BINDING_INVALID'
  );
  requireString(bindingApproval.evidencePath, 'APPROVAL_BINDING_INVALID');
  requireCondition(
    requireSha256(
      bindingApproval.evidenceSha256,
      'APPROVAL_BINDING_INVALID'
    ) === context.approvalEvidenceSha256,
    'APPROVAL_BINDING_INVALID'
  );
  requireNoForbiddenTransportEnvironment(context.environment);
  return {
    actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
    bindingMaterialSha256,
    requestSha256,
    approvalExpiresAt: approval.expiresAt,
    principalId,
  };
}

export function claimOrganizationIdentityCaptureAction(
  directoryInput,
  claimInput
) {
  const directory = path.resolve(directoryInput);
  const claim = requireExactKeys(
    claimInput,
    [
      'actionId',
      'bindingMaterialSha256',
      'claimedAt',
      'payloadSha256',
      'state',
    ],
    'ACTION_CLAIM_INVALID'
  );
  requireCondition(
    claim.actionId === ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID &&
      claim.state === 'CLAIMED_GET_NOT_SENT',
    'ACTION_CLAIM_INVALID'
  );
  requireSha256(claim.bindingMaterialSha256, 'ACTION_CLAIM_INVALID');
  requireSha256(claim.payloadSha256, 'ACTION_CLAIM_INVALID');
  timestampMilliseconds(claim.claimedAt, 'ACTION_CLAIM_INVALID');
  const pathname = path.join(
    directory,
    ORGANIZATION_IDENTITY_CAPTURE_CLAIM_FILE
  );
  const bytes = Buffer.from(`${canonicalJson(claim)}\n`, 'utf8');
  let descriptor;
  try {
    descriptor = openSync(pathname, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    const status = statSync(pathname);
    requireCondition(status.isFile(), 'ACTION_CLAIM_WRITE_FAILED');
    const readback = readFileSync(pathname);
    requireCondition(readback.equals(bytes), 'ACTION_CLAIM_READBACK_MISMATCH');
    return {
      path: pathname,
      claimSha256: createHash('sha256').update(readback).digest('hex'),
    };
  } catch (error) {
    if (error instanceof OrganizationIdentityCaptureContractError) throw error;
    fail(
      error?.code === 'EEXIST'
        ? 'ACTION_ALREADY_CLAIMED'
        : 'ACTION_CLAIM_FAILED'
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    bytes.fill(0);
  }
}

export function assertOrganizationIdentityCaptureEvidenceSecretFree(
  evidence,
  forbiddenValues = []
) {
  assertSecretFreeEvidence(evidence, forbiddenValues);
  const serialized = canonicalJson(evidence).toLowerCase();
  requireCondition(
    !serialized.includes(PRODUCTION_PROJECT_REF.toLowerCase()) &&
      !serialized.includes(PRODUCTION_PROJECT_ORIGIN.toLowerCase()) &&
      !serialized.includes('authorization') &&
      !serialized.includes('bearer ') &&
      !serialized.includes('ciphertextbase64'),
    'IDENTITY_EVIDENCE_FORBIDDEN_CONTENT'
  );
  return true;
}

export function assertNoAmbientOrganizationCaptureCredentialEnvironment(
  environment
) {
  requireNoForbiddenTransportEnvironment(environment);
  return true;
}

export function assertStableOrganizationCaptureInputFile(filename, expected) {
  let descriptor;
  try {
    requireCondition(!lstatSync(filename).isSymbolicLink(), 'INPUT_INVALID');
    descriptor = openSync(filename, 'r');
    const before = statSync(filename);
    const bytes = readFileSync(descriptor);
    const after = statSync(filename);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    requireCondition(
      before.isFile() &&
        after.isFile() &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        sha256 === expected.sha256,
      'INPUT_CHANGED'
    );
    return { bytes, sha256 };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
