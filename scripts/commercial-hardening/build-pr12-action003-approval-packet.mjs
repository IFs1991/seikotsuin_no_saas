import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_BASE_COMMIT,
  ACTION_ID,
  ACTION002_SEALED_EVIDENCE,
  assertSecretFreeEvidence,
  buildBindingMaterial,
  buildSecretFreeRequestProjection,
  canonicalJson,
  journalDirectoryFingerprint,
  sha256Canonical,
  sha256Text,
  validateOfflineApprovalCandidate,
} from './pr12-source-project-provisioning-contract.mjs';
import { validateInitialAction003ApprovalReceipt } from './pr12-action003-approval-receipt-contract.mjs';
import { windowsPathFingerprint } from './pr12-windows-dpapi-credential-channel.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/u;
const PRINCIPAL_ID = 'owner:futoshi-iwasawa';
const PRINCIPAL_DISPLAY_NAME = 'FUTOSHI IWASAWA';
const HISTORICAL_ACTION002 = ACTION002_SEALED_EVIDENCE;
const CANONICAL_MANAGEMENT_HANDLE =
  'windows-dpapi-cu://pr12-source-project/management-access-token/v1';
const CANONICAL_DATABASE_PASSWORD_HANDLE =
  'windows-dpapi-cu://pr12-source-project/database-password/v1';
const BINDING_FILENAME = 'source-project-provisioning-binding-v5.json';
const CREDENTIAL_FILENAME =
  'source-project-provisioning-credential-configuration-v2.json';
const OWNER_APPROVAL_FILENAME =
  'source-project-provisioning-owner-approval-v4.json';
const PRICING_FILENAME = 'source-project-official-pricing-evidence-v2.json';
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

export class Action003ApprovalBuilderError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Action003ApprovalBuilderError';
    this.code = code;
  }
}

function fail(code) {
  throw new Action003ApprovalBuilderError(code);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value, code) {
  requireCondition(isRecord(value), code);
  return value;
}

function requireExactKeys(value, keys, code) {
  const record = requireRecord(value, code);
  requireCondition(
    canonicalJson(Object.keys(record).sort()) ===
      canonicalJson([...keys].sort()),
    code
  );
  return record;
}

function requireSha256(value, code) {
  requireCondition(
    typeof value === 'string' && SHA256_PATTERN.test(value),
    code
  );
  return value;
}

function requireGitSha(value, code) {
  requireCondition(
    typeof value === 'string' && GIT_SHA_PATTERN.test(value),
    code
  );
  return value;
}

function requireCanonicalTimestamp(value, code) {
  requireCondition(typeof value === 'string', code);
  const milliseconds = Date.parse(value);
  requireCondition(
    Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === value,
    code
  );
  return milliseconds;
}

function iso(milliseconds) {
  return new Date(milliseconds).toISOString();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalFileSha256(value) {
  return sha256Text(`${canonicalJson(value)}\n`);
}

function requireWindowsAbsolutePath(value, code) {
  requireCondition(
    typeof value === 'string' &&
      WINDOWS_ABSOLUTE_PATH_PATTERN.test(value) &&
      !value.startsWith('\\\\'),
    code
  );
  return value;
}

function requireDirectoryFingerprint(value, expectedPath, code) {
  const fingerprint = requireExactKeys(
    value,
    ['pathSha256', 'resolvedPathSha256', 'device', 'inode', 'snapshotSha256'],
    code
  );
  requireCondition(
    fingerprint.pathSha256 === windowsPathFingerprint(expectedPath) &&
      SHA256_PATTERN.test(fingerprint.resolvedPathSha256) &&
      typeof fingerprint.device === 'string' &&
      /^\d+$/u.test(fingerprint.device) &&
      typeof fingerprint.inode === 'string' &&
      /^\d+$/u.test(fingerprint.inode) &&
      SHA256_PATTERN.test(fingerprint.snapshotSha256),
    code
  );
  return cloneJson(fingerprint);
}

function requireExternalFileIdentity(
  value,
  expectedContentSha256,
  code,
  expectedPath = null
) {
  const identity = requireExactKeys(
    value,
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
  requireCondition(
    SHA256_PATTERN.test(identity.pathSha256) &&
      SHA256_PATTERN.test(identity.resolvedPathSha256) &&
      identity.resolvedPathSha256 === identity.pathSha256 &&
      (expectedPath === null ||
        identity.pathSha256 === windowsPathFingerprint(expectedPath)) &&
      typeof identity.device === 'string' &&
      /^\d+$/u.test(identity.device) &&
      typeof identity.inode === 'string' &&
      /^\d+$/u.test(identity.inode) &&
      Number.isSafeInteger(identity.size) &&
      identity.size >= 0 &&
      typeof identity.modifiedAtMilliseconds === 'number' &&
      Number.isFinite(identity.modifiedAtMilliseconds) &&
      identity.modifiedAtMilliseconds >= 0 &&
      identity.contentSha256 === expectedContentSha256,
    code
  );
  return cloneJson(identity);
}

function requireAction002Linkage(evidenceInput) {
  const evidence = requireRecord(
    cloneJson(evidenceInput),
    'ACTION002_SEALED_EVIDENCE_MISMATCH'
  );
  for (const [key, expected] of Object.entries(HISTORICAL_ACTION002)) {
    requireCondition(
      evidence[key] === expected,
      'ACTION002_SEALED_EVIDENCE_MISMATCH'
    );
  }
  requireCondition(
    evidence.status === 'PASS' &&
      evidence.actionId === 'PR12-ACTION-002' &&
      evidence.terminalState === 'TERMINAL_PASS' &&
      evidence.remoteContactCount === 1 &&
      evidence.requestAttemptCount === 1 &&
      evidence.automaticRetryCount === 0,
    'ACTION002_SEALED_EVIDENCE_MISMATCH'
  );
  for (const key of [
    'evidenceDirectoryFingerprint',
    'journalDirectoryFingerprint',
  ]) {
    const fingerprint = requireExactKeys(
      evidence[key],
      ['pathSha256', 'resolvedPathSha256', 'device', 'inode', 'snapshotSha256'],
      'ACTION002_DIRECTORY_FINGERPRINT_INVALID'
    );
    requireSha256(
      fingerprint.pathSha256,
      'ACTION002_DIRECTORY_FINGERPRINT_INVALID'
    );
    requireSha256(
      fingerprint.resolvedPathSha256,
      'ACTION002_DIRECTORY_FINGERPRINT_INVALID'
    );
    requireSha256(
      fingerprint.snapshotSha256,
      'ACTION002_DIRECTORY_FINGERPRINT_INVALID'
    );
    requireCondition(
      typeof fingerprint.device === 'string' &&
        fingerprint.device.length > 0 &&
        typeof fingerprint.inode === 'string' &&
        fingerprint.inode.length > 0,
      'ACTION002_DIRECTORY_FINGERPRINT_INVALID'
    );
  }
  return evidence;
}

function requireCredentialConfiguration(configurationInput, artifactSha256) {
  const configuration = requireRecord(
    cloneJson(configurationInput),
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    configuration.schemaVersion === 2 &&
      configuration.resultType ===
        'SOURCE_PROJECT_PROVISIONING_CREDENTIAL_CONFIGURATION' &&
      configuration.status === 'APPROVED' &&
      canonicalFileSha256(configuration) ===
        requireSha256(artifactSha256, 'CREDENTIAL_CONFIGURATION_HASH_MISMATCH'),
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  const provider = requireRecord(
    configuration.provider,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    provider.providerId === 'WINDOWS_DPAPI_CURRENT_USER_V1' &&
      provider.retrievalChannel === 'CLAIM_BOUND_CAPTURED_STDOUT_BINARY_V1' &&
      provider.ownerApproved === true &&
      provider.protectionScope === 'CURRENT_USER',
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  const secrets = requireRecord(
    configuration.secrets,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  const management = requireRecord(
    secrets.managementAccessToken,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  const password = requireRecord(
    secrets.databasePassword,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    management.role === 'MANAGEMENT_ACCESS_TOKEN' &&
      management.opaqueHandle === CANONICAL_MANAGEMENT_HANDLE &&
      management.opaqueHandleSha256 ===
        sha256Text(CANONICAL_MANAGEMENT_HANDLE) &&
      management.envelopeFilename ===
        `${management.opaqueHandleSha256}.dpapi.json` &&
      SHA256_PATTERN.test(management.envelopeSha256) &&
      password.role === 'DATABASE_PASSWORD' &&
      password.opaqueHandle === CANONICAL_DATABASE_PASSWORD_HANDLE &&
      password.opaqueHandleSha256 ===
        sha256Text(CANONICAL_DATABASE_PASSWORD_HANDLE) &&
      password.envelopeFilename ===
        `${password.opaqueHandleSha256}.dpapi.json` &&
      SHA256_PATTERN.test(password.envelopeSha256),
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireExternalFileIdentity(
    management.envelopeIdentity,
    management.envelopeSha256,
    'CREDENTIAL_CONFIGURATION_INVALID',
    path.win32.join(provider.providerRoot, management.envelopeFilename)
  );
  requireExternalFileIdentity(
    password.envelopeIdentity,
    password.envelopeSha256,
    'CREDENTIAL_CONFIGURATION_INVALID',
    path.win32.join(provider.providerRoot, password.envelopeFilename)
  );
  const bootstrap = requireRecord(
    configuration.bootstrap,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  requireCondition(
    bootstrap.realCredentialBootstrapCompleted === true &&
      bootstrap.realCredentialBootstrapAuthorizedByThisPreparation === false &&
      bootstrap.separateInteractiveAuthorizationRequired === true,
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  assertSecretFreeEvidence(configuration, []);
  return configuration;
}

function requirePricingEvidence(pricingInput, artifactSha256) {
  const pricing = requireRecord(
    cloneJson(pricingInput),
    'PRICING_EVIDENCE_INVALID'
  );
  requireCondition(
    pricing.schemaVersion === 2 &&
      pricing.recordType === 'PR12_SOURCE_PROJECT_OFFICIAL_PRICING_EVIDENCE' &&
      pricing.status === 'CAPTURED' &&
      canonicalFileSha256(pricing) ===
        requireSha256(artifactSha256, 'PRICING_EVIDENCE_HASH_MISMATCH'),
    'PRICING_EVIDENCE_INVALID'
  );
  assertSecretFreeEvidence(pricing, []);
  return pricing;
}

function requireRiskAcceptances(value) {
  const risks = requireExactKeys(
    value,
    [
      'soleOperatorRiskAccepted',
      'sameUserDpapiCredentialExposureRiskAccepted',
      'providerSpendCapLimitationAcknowledged',
      'sameOrganizationExceptionRiskAccepted',
      'organizationListProductionRefObservationAccepted',
      'sharedOrganizationIamBillingControlPlaneRiskAccepted',
      'productionDirectContactProhibitionAcknowledged',
      'unknownChargesAcknowledged',
    ],
    'RISK_ACCEPTANCE_INCOMPLETE'
  );
  requireCondition(
    Object.values(risks).every(item => item === true),
    'RISK_ACCEPTANCE_INCOMPLETE'
  );
  return risks;
}

function buildOwnerApproval(
  ownerTemplateInput,
  binding,
  hashes,
  approvalRecord,
  notes
) {
  const ownerApproval = requireRecord(
    cloneJson(ownerTemplateInput),
    'OWNER_APPROVAL_TEMPLATE_INVALID'
  );
  const organizationIdentity = binding.organizationIdentityEvidence;
  const environment = binding.environmentProposal;
  const sameOrganization = binding.sameOrganizationException;
  const approval = binding.approval;
  const cleanup = binding.retentionAndCleanupDecision;
  const risks = approvalRecord.riskAcceptances;

  Object.assign(ownerApproval, {
    decision: 'PENDING_FINAL_APPROVAL',
    attestationStatus: 'AWAITING_FINAL_RECEIPT',
    approverPrincipalId: PRINCIPAL_ID,
    approverDisplayName: PRINCIPAL_DISPLAY_NAME,
    operatorPrincipalId: PRINCIPAL_ID,
    operatorDisplayName: PRINCIPAL_DISPLAY_NAME,
    operatorControlMode: binding.operatorControl.mode,
    identitySeparationAvailable: false,
    independentHumanReviewClaimed: false,
    ...risks,
    actionId: ACTION_ID,
    gitCommit: binding.target.gitCommit,
    bindingMaterialSha256: hashes.bindingMaterialSha256,
    payloadSha256: hashes.payloadSha256,
    credentialConfigurationSha256: hashes.credentialConfigurationSha256,
    pricingEvidenceSha256: hashes.pricingEvidenceSha256,
    organizationIdentityManifestSha256: organizationIdentity.manifestSha256,
    organizationIdentityTerminalSha256: organizationIdentity.terminalSha256,
    organizationIdentitySourceBindingMaterialSha256:
      organizationIdentity.sourceBindingMaterialSha256,
    organizationIdentitySourceRequestSha256:
      organizationIdentity.sourceRequestSha256,
    organizationId: environment.organizationId,
    organizationSlug: environment.organizationSlug,
    sameOrganizationExceptionMode: sameOrganization.mode,
    productionOrganizationId: sameOrganization.productionOrganizationId,
    productionOrganizationSlug: sameOrganization.productionOrganizationSlug,
    productionProjectName: sameOrganization.productionProjectName,
    productionProjectRef: sameOrganization.productionProjectRef,
    productionProjectOrigin: sameOrganization.productionProjectOrigin,
    projectName: environment.projectName,
    region: environment.region,
    tier: environment.databaseTier,
    ownerAuthorizationCeilingUsdScaled:
      binding.cost.ownerAuthorizationCeilingUsdScaled,
    authorizedDurationHours: binding.lifecycle.sourceMaximumHoursFromCreation,
    scheduledExecutionAt: binding.provisioningAction.scheduledExecutionAt,
    fundedThrough: cleanup.fundedThrough,
    approvedAt: approval.approvedAt,
    operatorReconfirmedAt: 'NOT_CAPTURED',
    expiresAt: approval.expiresAt,
    initialApprovalReceiptSha256: approval.initialApprovalReceiptSha256,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    notes,
  });
  assertSecretFreeEvidence(ownerApproval, []);
  return ownerApproval;
}

export function buildAction003ApprovalArtifacts(inputValue) {
  const input = requireExactKeys(
    inputValue,
    [
      'bindingTemplate',
      'ownerApprovalTemplate',
      'credentialConfiguration',
      'credentialConfigurationArtifactSha256',
      'pricingEvidence',
      'pricingEvidenceArtifactSha256',
      'initialApprovalReceipt',
      'initialApprovalReceiptArtifactSha256',
      'organizationIdentityEvidence',
      'repositoryState',
      'runtimeBoundary',
      'directoryBindings',
      'approvalRecord',
      'knownAdditionalChargesUsdScaled',
      'fundingSource',
      'notes',
    ],
    'BUILDER_INPUT_INVALID'
  );
  assertSecretFreeEvidence(input, []);
  const runtimeBoundary = requireExactKeys(
    input.runtimeBoundary,
    ['nodeVersion', 'nodeExecArgv', 'ambientCredentialNames'],
    'NODE_RUNTIME_BOUNDARY_INVALID'
  );
  requireCondition(
    typeof runtimeBoundary.nodeVersion === 'string' &&
      /^v24\./u.test(runtimeBoundary.nodeVersion) &&
      Array.isArray(runtimeBoundary.nodeExecArgv) &&
      runtimeBoundary.nodeExecArgv.length === 0 &&
      Array.isArray(runtimeBoundary.ambientCredentialNames),
    'NODE_RUNTIME_BOUNDARY_INVALID'
  );
  requireCondition(
    runtimeBoundary.ambientCredentialNames.length === 0,
    'AMBIENT_CREDENTIAL_FORBIDDEN'
  );

  const repository = requireExactKeys(
    input.repositoryState,
    [
      'currentHead',
      'currentBaseCommit',
      'worktreeClean',
      'organizationIdentitySourceGitCommitIsAncestor',
      'governanceSha256',
      'contractSha256',
      'wrapperSha256',
      'organizationIdentityContractSha256',
      'organizationIdentityVerifierSha256',
    ],
    'REPOSITORY_STATE_INVALID'
  );
  const currentHead = requireGitSha(repository.currentHead, 'GIT_HEAD_INVALID');
  requireCondition(
    repository.currentBaseCommit === APPROVED_BASE_COMMIT,
    'GIT_BASE_INVALID'
  );
  requireCondition(repository.worktreeClean === true, 'WORKTREE_NOT_CLEAN');
  requireCondition(
    repository.organizationIdentitySourceGitCommitIsAncestor === true,
    'ACTION002_SOURCE_HEAD_NOT_ANCESTOR'
  );
  for (const key of [
    'governanceSha256',
    'contractSha256',
    'wrapperSha256',
    'organizationIdentityContractSha256',
    'organizationIdentityVerifierSha256',
  ]) {
    requireSha256(repository[key], 'REPOSITORY_STATE_INVALID');
  }

  const credentialConfiguration = requireCredentialConfiguration(
    input.credentialConfiguration,
    input.credentialConfigurationArtifactSha256
  );
  const pricingEvidence = requirePricingEvidence(
    input.pricingEvidence,
    input.pricingEvidenceArtifactSha256
  );
  const organizationIdentityEvidence = requireAction002Linkage(
    input.organizationIdentityEvidence
  );
  const initialApprovalReceiptValidation =
    validateInitialAction003ApprovalReceipt(input.initialApprovalReceipt);
  requireCondition(
    requireSha256(
      input.initialApprovalReceiptArtifactSha256,
      'INITIAL_APPROVAL_RECEIPT_INVALID'
    ) === initialApprovalReceiptValidation.receiptSha256,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const directories = requireExactKeys(
    input.directoryBindings,
    [
      'actionJournalDirectoryPath',
      'actionJournalDirectoryFingerprint',
      'evidenceParentDirectoryPath',
      'evidenceParentDirectoryFingerprint',
      'providerRootResolvedPath',
      'credentialConfigurationSourceIdentity',
      'pricingEvidenceSourceIdentity',
    ],
    'DIRECTORY_BINDING_INVALID'
  );
  const actionJournalPath = requireWindowsAbsolutePath(
    directories.actionJournalDirectoryPath,
    'DIRECTORY_BINDING_INVALID'
  );
  const evidenceParentPath = requireWindowsAbsolutePath(
    directories.evidenceParentDirectoryPath,
    'DIRECTORY_BINDING_INVALID'
  );
  const providerRootResolvedPath = requireWindowsAbsolutePath(
    directories.providerRootResolvedPath,
    'DIRECTORY_BINDING_INVALID'
  );
  const actionJournalDirectoryFingerprint = requireDirectoryFingerprint(
    directories.actionJournalDirectoryFingerprint,
    actionJournalPath,
    'DIRECTORY_BINDING_INVALID'
  );
  const evidenceParentDirectoryFingerprint = requireDirectoryFingerprint(
    directories.evidenceParentDirectoryFingerprint,
    evidenceParentPath,
    'DIRECTORY_BINDING_INVALID'
  );
  const credentialConfigurationSourceIdentity = requireExternalFileIdentity(
    directories.credentialConfigurationSourceIdentity,
    input.credentialConfigurationArtifactSha256,
    'CREDENTIAL_CONFIGURATION_SOURCE_IDENTITY_INVALID'
  );
  const pricingEvidenceSourceIdentity = requireExternalFileIdentity(
    directories.pricingEvidenceSourceIdentity,
    input.pricingEvidenceArtifactSha256,
    'PRICING_EVIDENCE_SOURCE_IDENTITY_INVALID'
  );
  const provider = credentialConfiguration.provider;
  requireCondition(
    windowsPathFingerprint(providerRootResolvedPath) ===
      provider.providerRootResolvedPathSha256 &&
      provider.providerRootResolvedPathSha256 ===
        provider.providerRootPathSha256 &&
      actionJournalDirectoryFingerprint.resolvedPathSha256 ===
        actionJournalDirectoryFingerprint.pathSha256 &&
      evidenceParentDirectoryFingerprint.resolvedPathSha256 ===
        evidenceParentDirectoryFingerprint.pathSha256 &&
      journalDirectoryFingerprint(actionJournalPath) !==
        journalDirectoryFingerprint(evidenceParentPath) &&
      journalDirectoryFingerprint(actionJournalPath) !==
        provider.providerRootResolvedPathSha256 &&
      journalDirectoryFingerprint(evidenceParentPath) !==
        provider.providerRootResolvedPathSha256,
    'DIRECTORY_BINDING_INVALID'
  );

  const approvalRecord = requireExactKeys(
    input.approvalRecord,
    [
      'principalId',
      'principalDisplayName',
      'approvedAt',
      'builtAt',
      'initialApprovalReceiptSha256',
      'riskAcceptances',
    ],
    'APPROVAL_RECORD_INVALID'
  );
  requireCondition(
    approvalRecord.principalId === PRINCIPAL_ID &&
      approvalRecord.principalDisplayName === PRINCIPAL_DISPLAY_NAME,
    'OWNER_IDENTITY_INVALID'
  );
  const risks = requireRiskAcceptances(approvalRecord.riskAcceptances);
  requireCondition(
    canonicalJson({
      principalId: approvalRecord.principalId,
      principalDisplayName: approvalRecord.principalDisplayName,
      approvedAt: approvalRecord.approvedAt,
      initialApprovalReceiptSha256: approvalRecord.initialApprovalReceiptSha256,
      riskAcceptances: risks,
    }) === canonicalJson(initialApprovalReceiptValidation.approvalRecordFields),
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const approvedAt = requireCanonicalTimestamp(
    approvalRecord.approvedAt,
    'APPROVAL_TIMESTAMP_INVALID'
  );
  const builtAt = requireCanonicalTimestamp(
    approvalRecord.builtAt,
    'APPROVAL_TIMESTAMP_INVALID'
  );
  const scheduledExecutionAt = approvedAt + 15 * 60 * 1000;
  const expiresAt = approvedAt + 30 * 60 * 1000;
  const fundedThrough = scheduledExecutionAt + 73 * 60 * 60 * 1000;
  const deletionApprovalRequestDeadline =
    scheduledExecutionAt + 70 * 60 * 60 * 1000;
  requireCondition(
    requireSha256(
      approvalRecord.initialApprovalReceiptSha256,
      'INITIAL_APPROVAL_RECEIPT_INVALID'
    ) === approvalRecord.initialApprovalReceiptSha256 &&
      builtAt >= approvedAt &&
      builtAt <= scheduledExecutionAt &&
      builtAt < expiresAt,
    'APPROVAL_TIMESTAMP_INVALID'
  );

  requireCondition(
    input.knownAdditionalChargesUsdScaled === 0,
    'KNOWN_COST_INVALID'
  );
  requireCondition(
    typeof input.fundingSource === 'string' &&
      /^[A-Z][A-Z0-9_:-]{7,127}$/u.test(input.fundingSource),
    'FUNDING_SOURCE_INVALID'
  );
  const notes = requireExactKeys(
    input.notes,
    ['binding', 'ownerApproval'],
    'NOTES_INVALID'
  );
  requireCondition(
    typeof notes.binding === 'string' &&
      notes.binding.trim().length > 0 &&
      typeof notes.ownerApproval === 'string' &&
      notes.ownerApproval.trim().length > 0 &&
      /zeroization/iu.test(`${notes.binding} ${notes.ownerApproval}`) &&
      /Phase 2/iu.test(`${notes.binding} ${notes.ownerApproval}`),
    'NOTES_INVALID'
  );

  const binding = requireRecord(
    cloneJson(input.bindingTemplate),
    'BINDING_TEMPLATE_INVALID'
  );
  binding.status = 'PENDING_FINAL_APPROVAL';
  binding.authorization.sourceProjectProvisioningAuthorized = false;
  Object.assign(binding.provisioningAction, {
    scheduledExecutionAt: iso(scheduledExecutionAt),
    requestTimeoutMilliseconds: 30000,
    readinessObservationMaximumSeconds: 900,
    readinessPollIntervalSeconds: 15,
  });
  Object.assign(binding.target, {
    gitCommit: currentHead,
    baseCommit: APPROVED_BASE_COMMIT,
    cleanWorktreeRequired: true,
  });
  binding.governanceProposal.sha256 = repository.governanceSha256;
  Object.assign(binding.implementationContracts, {
    contractSha256: repository.contractSha256,
    wrapperSha256: repository.wrapperSha256,
    organizationIdentityContractSha256:
      repository.organizationIdentityContractSha256,
    organizationIdentityVerifierSha256:
      repository.organizationIdentityVerifierSha256,
  });
  Object.assign(
    binding.credentialControls.provisioningCredentialConfiguration,
    {
      path: CREDENTIAL_FILENAME,
      sha256: input.credentialConfigurationArtifactSha256,
      sourceIdentity: credentialConfigurationSourceIdentity,
    }
  );
  binding.credentialControls.credentialBootstrapCompleted = true;
  binding.organizationIdentityEvidence = organizationIdentityEvidence;
  binding.duplicateAndFailurePolicy.actionJournalDirectoryPathSha256 =
    journalDirectoryFingerprint(actionJournalPath);
  binding.duplicateAndFailurePolicy.actionJournalDirectoryFingerprint =
    actionJournalDirectoryFingerprint;
  binding.duplicateAndFailurePolicy.recoveryOwner = PRINCIPAL_ID;
  Object.assign(binding.retentionAndCleanupDecision, {
    fundedThrough: iso(fundedThrough),
    fundingSource: input.fundingSource,
    cleanupOwner: PRINCIPAL_ID,
    deletionApprovalRequester: PRINCIPAL_ID,
    deletionApprovalRequestDeadline: iso(deletionApprovalRequestDeadline),
    billingEscalationOwner: PRINCIPAL_ID,
    fundedExtensionOwner: PRINCIPAL_ID,
  });
  Object.assign(binding.cost, {
    knownAdditionalChargesUsdScaled: input.knownAdditionalChargesUsdScaled,
    unknownChargesAcknowledged: risks.unknownChargesAcknowledged,
  });
  Object.assign(binding.cost.pricingEvidence, {
    artifactPath: PRICING_FILENAME,
    artifactSha256: input.pricingEvidenceArtifactSha256,
    freshThrough: pricingEvidence.freshness.freshThrough,
    sourceIdentity: pricingEvidenceSourceIdentity,
  });
  Object.assign(binding.approval, {
    decision: 'PENDING_FINAL_APPROVAL',
    attestationStatus: 'AWAITING_FINAL_RECEIPT',
    approvedBy: PRINCIPAL_ID,
    approvedAt: approvalRecord.approvedAt,
    operatorReconfirmedAt: 'NOT_CAPTURED',
    expiresAt: iso(expiresAt),
    initialApprovalReceiptSha256: approvalRecord.initialApprovalReceiptSha256,
    ...risks,
    evidencePath: OWNER_APPROVAL_FILENAME,
    evidenceSha256: '0'.repeat(64),
    approvedActionId: ACTION_ID,
  });
  for (const key of [
    'commercialReleaseOwner',
    'provisioningOperator',
    'supabasePlatformOwner',
    'cleanupOwner',
    'evidenceCustodian',
  ]) {
    binding.owners[key] = PRINCIPAL_ID;
  }
  Object.assign(binding.operatorControl, {
    principalDisplayName: PRINCIPAL_DISPLAY_NAME,
    principalId: PRINCIPAL_ID,
  });
  binding.evidenceContract.evidenceParentDirectoryPathSha256 =
    journalDirectoryFingerprint(evidenceParentPath);
  binding.evidenceContract.evidenceParentDirectoryFingerprint =
    evidenceParentDirectoryFingerprint;
  binding.notes = notes.binding;

  const projection = buildSecretFreeRequestProjection(
    binding,
    credentialConfiguration
  );
  const payloadSha256 = sha256Canonical(projection);
  binding.approvedRequest.projection = projection;
  binding.approvedRequest.sha256 = payloadSha256;
  binding.approval.approvedPayloadSha256 = payloadSha256;

  const bindingMaterialSha256 = sha256Canonical(buildBindingMaterial(binding));
  binding.approval.approvedBindingMaterialSha256 = bindingMaterialSha256;
  const ownerApproval = buildOwnerApproval(
    input.ownerApprovalTemplate,
    binding,
    {
      bindingMaterialSha256,
      payloadSha256,
      credentialConfigurationSha256:
        input.credentialConfigurationArtifactSha256,
      pricingEvidenceSha256: input.pricingEvidenceArtifactSha256,
    },
    { ...approvalRecord, riskAcceptances: risks },
    notes.ownerApproval
  );
  const ownerApprovalSha256 = canonicalFileSha256(ownerApproval);
  binding.approval.evidenceSha256 = ownerApprovalSha256;

  const context = {
    currentHead,
    currentBaseCommit: APPROVED_BASE_COMMIT,
    worktreeClean: true,
    nodeVersion: runtimeBoundary.nodeVersion,
    nodeExecArgv: runtimeBoundary.nodeExecArgv,
    now: approvalRecord.builtAt,
    governanceSha256: repository.governanceSha256,
    contractSha256: repository.contractSha256,
    wrapperSha256: repository.wrapperSha256,
    organizationIdentityContractSha256:
      repository.organizationIdentityContractSha256,
    organizationIdentityVerifierSha256:
      repository.organizationIdentityVerifierSha256,
    credentialConfigurationSha256: input.credentialConfigurationArtifactSha256,
    approvalEvidenceSha256: ownerApprovalSha256,
    pricingEvidenceSha256: input.pricingEvidenceArtifactSha256,
    approvalEvidence: ownerApproval,
    initialApprovalReceipt: initialApprovalReceiptValidation.receipt,
    initialApprovalReceiptSha256:
      initialApprovalReceiptValidation.receiptSha256,
    pricingEvidence,
    organizationIdentityEvidence,
    organizationIdentitySourceGitCommitIsAncestor: true,
    ambientCredentialNames: runtimeBoundary.ambientCredentialNames,
    priorActionState: null,
    approvalStage: 'PRE_CLAIM',
    actionJournalDirectoryPathSha256:
      binding.duplicateAndFailurePolicy.actionJournalDirectoryPathSha256,
    actionJournalDirectoryFingerprint,
    evidenceParentDirectoryPathSha256:
      binding.evidenceContract.evidenceParentDirectoryPathSha256,
    evidenceParentDirectoryFingerprint,
    credentialConfigurationSourceIdentity,
    pricingEvidenceSourceIdentity,
  };
  const validation = validateOfflineApprovalCandidate(
    binding,
    credentialConfiguration,
    context
  );
  requireCondition(
    validation.bindingMaterialSha256 === bindingMaterialSha256 &&
      validation.payloadSha256 === payloadSha256 &&
      validation.remoteContactPerformed === false &&
      validation.credentialReadPerformed === false,
    'OFFLINE_VALIDATION_FAILED'
  );

  const summary = {
    actionId: ACTION_ID,
    gitCommit: currentHead,
    bindingMaterialSha256,
    payloadSha256,
    credentialConfigurationSha256: input.credentialConfigurationArtifactSha256,
    pricingEvidenceSha256: input.pricingEvidenceArtifactSha256,
    ownerApprovalSha256,
    bindingSha256: canonicalFileSha256(binding),
    scheduledExecutionAt: binding.provisioningAction.scheduledExecutionAt,
    fundedThrough: binding.retentionAndCleanupDecision.fundedThrough,
    deletionApprovalRequestDeadline:
      binding.retentionAndCleanupDecision.deletionApprovalRequestDeadline,
    expiresAt: binding.approval.expiresAt,
    initialApprovalReceiptSha256: binding.approval.initialApprovalReceiptSha256,
    finalApprovalRequired: true,
    sourceProjectProvisioningAuthorized: false,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    productionContactAuthorized: false,
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
  assertSecretFreeEvidence(summary, []);
  return {
    binding,
    credentialConfiguration,
    ownerApproval,
    summary,
  };
}

function writeCanonicalJsonCreateNew(filename, value) {
  writeFileSync(filename, `${canonicalJson(value)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    flush: true,
    mode: 0o600,
  });
}

function normalizedBoundaryPath(value) {
  const normalized = path.resolve(value).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isWithinBoundary(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function requireOutputBoundary(outputDirectoryInput, ownerPrivateRootInput) {
  requireCondition(
    typeof outputDirectoryInput === 'string' &&
      path.isAbsolute(outputDirectoryInput) &&
      typeof ownerPrivateRootInput === 'string' &&
      path.isAbsolute(ownerPrivateRootInput),
    'OUTPUT_DIRECTORY_INVALID'
  );
  const ownerPrivateRoot = path.resolve(ownerPrivateRootInput);
  requireCondition(
    existsSync(ownerPrivateRoot) &&
      lstatSync(ownerPrivateRoot).isDirectory() &&
      !lstatSync(ownerPrivateRoot).isSymbolicLink() &&
      normalizedBoundaryPath(realpathSync.native(ownerPrivateRoot)) ===
        normalizedBoundaryPath(ownerPrivateRoot),
    'OUTPUT_OWNER_PRIVATE_ROOT_INVALID'
  );
  const outputDirectory = path.resolve(outputDirectoryInput);
  const normalizedRepositoryRoot = normalizedBoundaryPath(REPOSITORY_ROOT);
  const normalizedOwnerPrivateRoot = normalizedBoundaryPath(ownerPrivateRoot);
  const normalizedOutputDirectory = normalizedBoundaryPath(outputDirectory);
  const normalizedTemporaryRoots = [
    os.tmpdir(),
    process.env.TEMP,
    process.env.TMP,
  ]
    .filter(value => typeof value === 'string')
    .map(value => normalizedBoundaryPath(value));
  requireCondition(
    path.dirname(normalizedOutputDirectory) === normalizedOwnerPrivateRoot &&
      !isWithinBoundary(normalizedRepositoryRoot, normalizedOutputDirectory) &&
      normalizedTemporaryRoots.every(
        root => !isWithinBoundary(root, normalizedOutputDirectory)
      ),
    'OUTPUT_DIRECTORY_BOUNDARY_INVALID'
  );
  requireCondition(
    !existsSync(outputDirectory),
    'OUTPUT_DIRECTORY_ALREADY_EXISTS'
  );
  return {
    outputDirectory,
    ownerPrivateRoot,
    ownerPrivateRootIdentity: captureStableDirectoryIdentity(
      ownerPrivateRoot,
      'OUTPUT_OWNER_PRIVATE_ROOT_INVALID'
    ),
  };
}

function captureStableDirectoryIdentity(directoryInput, code) {
  const directory = path.resolve(directoryInput);
  try {
    const before = lstatSync(directory);
    const resolved = realpathSync.native(directory);
    const after = statSync(directory);
    requireCondition(
      before.isDirectory() &&
        !before.isSymbolicLink() &&
        after.isDirectory() &&
        String(before.dev) === String(after.dev) &&
        String(before.ino) === String(after.ino) &&
        normalizedBoundaryPath(resolved) === normalizedBoundaryPath(directory),
      code
    );
    return {
      pathSha256: windowsPathFingerprint(directory),
      resolvedPathSha256: windowsPathFingerprint(resolved),
      device: String(after.dev),
      inode: String(after.ino),
    };
  } catch (error) {
    if (error instanceof Action003ApprovalBuilderError) throw error;
    fail(code);
  }
}

function requireSameOutputBoundary(
  outputDirectoryInput,
  ownerPrivateRootInput,
  expectedOutputIdentity,
  expectedOwnerPrivateRootIdentity
) {
  const outputDirectory = path.resolve(outputDirectoryInput);
  const ownerPrivateRoot = path.resolve(ownerPrivateRootInput);
  const currentOwnerPrivateRootIdentity = captureStableDirectoryIdentity(
    ownerPrivateRoot,
    'OUTPUT_OWNER_PRIVATE_ROOT_CHANGED'
  );
  const currentOutputIdentity = captureStableDirectoryIdentity(
    outputDirectory,
    'OUTPUT_DIRECTORY_CHANGED'
  );
  requireCondition(
    canonicalJson(currentOwnerPrivateRootIdentity) ===
      canonicalJson(expectedOwnerPrivateRootIdentity) &&
      canonicalJson(currentOutputIdentity) ===
        canonicalJson(expectedOutputIdentity) &&
      path.dirname(normalizedBoundaryPath(outputDirectory)) ===
        normalizedBoundaryPath(ownerPrivateRoot) &&
      path.dirname(
        normalizedBoundaryPath(realpathSync.native(outputDirectory))
      ) === normalizedBoundaryPath(realpathSync.native(ownerPrivateRoot)),
    'OUTPUT_DIRECTORY_CHANGED'
  );
  return { outputDirectory, ownerPrivateRoot };
}

function stableCanonicalArtifactSnapshot(filename, expectedValue, code) {
  let descriptor;
  try {
    requireCondition(!lstatSync(filename).isSymbolicLink(), code);
    const resolvedBefore = realpathSync.native(filename);
    descriptor = openSync(filename, 'r');
    const before = fstatSync(descriptor);
    requireCondition(before.isFile(), code);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const pathStatus = statSync(filename);
    const resolvedAfter = realpathSync.native(filename);
    const expectedBytes = Buffer.from(
      `${canonicalJson(expectedValue)}\n`,
      'utf8'
    );
    requireCondition(
      String(before.dev) === String(after.dev) &&
        String(before.ino) === String(after.ino) &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        bytes.length === after.size &&
        pathStatus.isFile() &&
        String(pathStatus.dev) === String(after.dev) &&
        String(pathStatus.ino) === String(after.ino) &&
        normalizedBoundaryPath(resolvedBefore) ===
          normalizedBoundaryPath(filename) &&
        normalizedBoundaryPath(resolvedBefore) ===
          normalizedBoundaryPath(resolvedAfter) &&
        bytes.equals(expectedBytes),
      code
    );
    const contentSha256 = sha256Text(bytes.toString('utf8'));
    return {
      sha256: contentSha256,
      identity: {
        pathSha256: windowsPathFingerprint(filename),
        resolvedPathSha256: windowsPathFingerprint(resolvedAfter),
        device: String(after.dev),
        inode: String(after.ino),
        size: after.size,
        modifiedAtMilliseconds: after.mtimeMs,
        contentSha256,
      },
    };
  } catch (error) {
    if (error instanceof Action003ApprovalBuilderError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function requireExactOutputEntries(outputDirectory, expectedNames, code) {
  const entries = readdirSync(outputDirectory).sort();
  requireCondition(
    canonicalJson(entries) === canonicalJson([...expectedNames].sort()),
    code
  );
}

export function initializeAction003ApprovalOutputCreateNew(
  outputDirectoryInput,
  credentialConfigurationInput,
  ownerPrivateRootInput
) {
  const { outputDirectory, ownerPrivateRoot, ownerPrivateRootIdentity } =
    requireOutputBoundary(outputDirectoryInput, ownerPrivateRootInput);
  const credentialConfiguration = requireRecord(
    credentialConfigurationInput,
    'OUTPUT_ARTIFACTS_INVALID'
  );
  mkdirSync(outputDirectory, { recursive: false, mode: 0o700 });
  const outputDirectoryIdentity = captureStableDirectoryIdentity(
    outputDirectory,
    'OUTPUT_DIRECTORY_INVALID'
  );
  requireSameOutputBoundary(
    outputDirectory,
    ownerPrivateRoot,
    outputDirectoryIdentity,
    ownerPrivateRootIdentity
  );
  const credentialPath = path.join(outputDirectory, CREDENTIAL_FILENAME);
  writeCanonicalJsonCreateNew(credentialPath, credentialConfiguration);
  requireSameOutputBoundary(
    outputDirectory,
    ownerPrivateRoot,
    outputDirectoryIdentity,
    ownerPrivateRootIdentity
  );
  requireExactOutputEntries(
    outputDirectory,
    [CREDENTIAL_FILENAME],
    'OUTPUT_FILE_SET_INVALID'
  );
  const credentialSnapshot = stableCanonicalArtifactSnapshot(
    credentialPath,
    credentialConfiguration,
    'OUTPUT_CREDENTIAL_READBACK_INVALID'
  );
  return {
    status: 'INITIALIZED',
    fileCount: 1,
    outputDirectoryPathSha256: journalDirectoryFingerprint(outputDirectory),
    outputDirectoryIdentity,
    ownerPrivateRootIdentity,
    credentialConfigurationSha256: credentialSnapshot.sha256,
    credentialConfigurationSourceIdentity: credentialSnapshot.identity,
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
}

export function verifyAction003ApprovalOutput(
  outputDirectoryInput,
  artifactsInput,
  ownerPrivateRootInput,
  expectedOutputIdentity,
  expectedOwnerPrivateRootIdentity
) {
  const outputDirectory = path.resolve(outputDirectoryInput);
  const artifacts = requireExactKeys(
    artifactsInput,
    ['binding', 'credentialConfiguration', 'ownerApproval', 'summary'],
    'OUTPUT_ARTIFACTS_INVALID'
  );
  requireSameOutputBoundary(
    outputDirectory,
    ownerPrivateRootInput,
    expectedOutputIdentity,
    expectedOwnerPrivateRootIdentity
  );
  requireExactOutputEntries(
    outputDirectory,
    [BINDING_FILENAME, CREDENTIAL_FILENAME, OWNER_APPROVAL_FILENAME],
    'OUTPUT_FILE_SET_INVALID'
  );
  const bindingSnapshot = stableCanonicalArtifactSnapshot(
    path.join(outputDirectory, BINDING_FILENAME),
    artifacts.binding,
    'OUTPUT_BINDING_READBACK_INVALID'
  );
  const credentialSnapshot = stableCanonicalArtifactSnapshot(
    path.join(outputDirectory, CREDENTIAL_FILENAME),
    artifacts.credentialConfiguration,
    'OUTPUT_CREDENTIAL_READBACK_INVALID'
  );
  const ownerApprovalSnapshot = stableCanonicalArtifactSnapshot(
    path.join(outputDirectory, OWNER_APPROVAL_FILENAME),
    artifacts.ownerApproval,
    'OUTPUT_OWNER_APPROVAL_READBACK_INVALID'
  );
  requireSameOutputBoundary(
    outputDirectory,
    ownerPrivateRootInput,
    expectedOutputIdentity,
    expectedOwnerPrivateRootIdentity
  );
  requireCondition(
    canonicalJson(
      artifacts.binding.credentialControls.provisioningCredentialConfiguration
        .sourceIdentity
    ) === canonicalJson(credentialSnapshot.identity),
    'OUTPUT_CREDENTIAL_SOURCE_IDENTITY_MISMATCH'
  );
  requireCondition(
    bindingSnapshot.sha256 === artifacts.summary.bindingSha256 &&
      credentialSnapshot.sha256 ===
        artifacts.summary.credentialConfigurationSha256 &&
      ownerApprovalSnapshot.sha256 === artifacts.summary.ownerApprovalSha256,
    'OUTPUT_SUMMARY_HASH_MISMATCH'
  );
  return {
    status: 'VERIFIED',
    fileCount: 3,
    outputDirectoryPathSha256: journalDirectoryFingerprint(outputDirectory),
    bindingSha256: bindingSnapshot.sha256,
    credentialConfigurationSha256: credentialSnapshot.sha256,
    ownerApprovalSha256: ownerApprovalSnapshot.sha256,
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
}

function requireExistingOutputBoundary(
  outputDirectoryInput,
  ownerPrivateRootInput
) {
  requireCondition(
    typeof outputDirectoryInput === 'string' &&
      path.isAbsolute(outputDirectoryInput) &&
      typeof ownerPrivateRootInput === 'string' &&
      path.isAbsolute(ownerPrivateRootInput),
    'OUTPUT_DIRECTORY_INVALID'
  );
  const ownerPrivateRoot = path.resolve(ownerPrivateRootInput);
  const outputDirectory = path.resolve(outputDirectoryInput);
  requireCondition(
    existsSync(ownerPrivateRoot) &&
      lstatSync(ownerPrivateRoot).isDirectory() &&
      !lstatSync(ownerPrivateRoot).isSymbolicLink() &&
      existsSync(outputDirectory) &&
      lstatSync(outputDirectory).isDirectory() &&
      !lstatSync(outputDirectory).isSymbolicLink(),
    'OUTPUT_DIRECTORY_INVALID'
  );
  const normalizedRepositoryRoot = normalizedBoundaryPath(REPOSITORY_ROOT);
  const normalizedOwnerPrivateRoot = normalizedBoundaryPath(ownerPrivateRoot);
  const normalizedOutputDirectory = normalizedBoundaryPath(outputDirectory);
  const normalizedTemporaryRoots = [
    os.tmpdir(),
    process.env.TEMP,
    process.env.TMP,
  ]
    .filter(value => typeof value === 'string')
    .map(value => normalizedBoundaryPath(value));
  requireCondition(
    path.dirname(normalizedOutputDirectory) === normalizedOwnerPrivateRoot &&
      path.dirname(
        normalizedBoundaryPath(realpathSync.native(outputDirectory))
      ) === normalizedBoundaryPath(realpathSync.native(ownerPrivateRoot)) &&
      !isWithinBoundary(normalizedRepositoryRoot, normalizedOutputDirectory) &&
      normalizedTemporaryRoots.every(
        root => !isWithinBoundary(root, normalizedOutputDirectory)
      ),
    'OUTPUT_DIRECTORY_BOUNDARY_INVALID'
  );
  return {
    outputDirectory,
    ownerPrivateRoot,
    outputDirectoryIdentity: captureStableDirectoryIdentity(
      outputDirectory,
      'OUTPUT_DIRECTORY_INVALID'
    ),
    ownerPrivateRootIdentity: captureStableDirectoryIdentity(
      ownerPrivateRoot,
      'OUTPUT_OWNER_PRIVATE_ROOT_INVALID'
    ),
  };
}

export function verifyExistingAction003ApprovalOutput(
  outputDirectoryInput,
  artifactsInput,
  ownerPrivateRootInput
) {
  const boundary = requireExistingOutputBoundary(
    outputDirectoryInput,
    ownerPrivateRootInput
  );
  return verifyAction003ApprovalOutput(
    boundary.outputDirectory,
    artifactsInput,
    boundary.ownerPrivateRoot,
    boundary.outputDirectoryIdentity,
    boundary.ownerPrivateRootIdentity
  );
}

export function completeAction003ApprovalOutputCreateNew(
  outputDirectoryInput,
  artifactsInput,
  ownerPrivateRootInput,
  expectedOutputIdentity,
  expectedOwnerPrivateRootIdentity
) {
  const outputDirectory = path.resolve(outputDirectoryInput);
  const artifacts = requireExactKeys(
    artifactsInput,
    ['binding', 'credentialConfiguration', 'ownerApproval', 'summary'],
    'OUTPUT_ARTIFACTS_INVALID'
  );
  requireSameOutputBoundary(
    outputDirectory,
    ownerPrivateRootInput,
    expectedOutputIdentity,
    expectedOwnerPrivateRootIdentity
  );
  requireExactOutputEntries(
    outputDirectory,
    [CREDENTIAL_FILENAME],
    'OUTPUT_FILE_SET_INVALID'
  );
  stableCanonicalArtifactSnapshot(
    path.join(outputDirectory, CREDENTIAL_FILENAME),
    artifacts.credentialConfiguration,
    'OUTPUT_CREDENTIAL_READBACK_INVALID'
  );
  requireSameOutputBoundary(
    outputDirectory,
    ownerPrivateRootInput,
    expectedOutputIdentity,
    expectedOwnerPrivateRootIdentity
  );
  writeCanonicalJsonCreateNew(
    path.join(outputDirectory, BINDING_FILENAME),
    artifacts.binding
  );
  requireSameOutputBoundary(
    outputDirectory,
    ownerPrivateRootInput,
    expectedOutputIdentity,
    expectedOwnerPrivateRootIdentity
  );
  writeCanonicalJsonCreateNew(
    path.join(outputDirectory, OWNER_APPROVAL_FILENAME),
    artifacts.ownerApproval
  );
  requireSameOutputBoundary(
    outputDirectory,
    ownerPrivateRootInput,
    expectedOutputIdentity,
    expectedOwnerPrivateRootIdentity
  );
  const verified = verifyAction003ApprovalOutput(
    outputDirectory,
    artifacts,
    ownerPrivateRootInput,
    expectedOutputIdentity,
    expectedOwnerPrivateRootIdentity
  );
  return { ...verified, status: 'CREATED' };
}
