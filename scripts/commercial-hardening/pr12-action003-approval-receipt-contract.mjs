import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  ACTION_ID,
  FIXED_PROJECT_NAME,
  OWNER_AUTHORIZATION_CEILING_USD_SCALED,
  PHASE1_OWNER_PRINCIPAL_ID,
  TARGET_ORGANIZATION_SLUG,
  assertSecretFreeEvidence,
  canonicalJson,
  sha256Text,
} from './pr12-source-project-provisioning-contract.mjs';

const PRINCIPAL_DISPLAY_NAME = 'FUTOSHI IWASAWA';
const INITIAL_RECEIPT_TYPE =
  'PR12_SOURCE_PROJECT_PROVISIONING_SINGLE_ACTION_APPROVAL_RECEIPT';
const EXECUTION_BINDING_TYPE =
  'PR12_SOURCE_PROJECT_PROVISIONING_DERIVED_EXECUTION_BINDING';
const INITIAL_ATTESTATION_METHOD =
  'SOLE_OPERATOR_EXPLICIT_SINGLE_ACTION_APPROVAL';
const EXECUTION_BINDING_DERIVATION_METHOD =
  'SYSTEM_DERIVED_HASH_BINDING_FROM_SINGLE_APPROVAL';
const INITIAL_APPROVAL_PURPOSE =
  'ACTION003_PACKET_PREPARATION_AND_SOURCE_PROJECT_PROVISIONING';
const INITIAL_RECEIPT_FILENAME =
  'source-project-provisioning-single-action-approval-receipt-v2.json';
const EXECUTION_BINDING_FILENAME =
  'source-project-provisioning-derived-execution-binding-v1.json';
const INITIAL_RECEIPT_DIRECTORY =
  'source-project-provisioning-single-action-approval-receipt-v2';
const EXECUTION_BINDING_DIRECTORY =
  'source-project-provisioning-derived-execution-binding-v1';
const ACL_POLICY_ID = 'WINDOWS_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_V1';
const OWNER_PRIVATE_BOUNDARY_POLICY_ID =
  'PR12_OWNER_PRIVATE_EXTERNAL_NON_REPARSE_V1';
const SYSTEM_SID = 'S-1-5-18';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const INITIAL_TO_SCHEDULE_MILLISECONDS = 0;
const INITIAL_TO_EXPIRY_MILLISECONDS = 60 * 60 * 1000;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const ACL_HELPER_PATH = fileURLToPath(
  new URL('./pr12-windows-owner-private-acl.ps1', import.meta.url)
);
const POWERSHELL_CANDIDATES = Object.freeze([
  'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
]);
const INITIAL_RECEIPT_KEYS = Object.freeze([
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
  'approvalTtlSeconds',
  'approvalPurpose',
  'gitCommit',
  'organizationId',
  'organizationSlug',
  'projectName',
  'region',
  'tier',
  'ownerAuthorizationCeilingUsdScaled',
  'authorizedDurationHours',
  'maximumPostAttempts',
  'credentialConfigurationSha256',
  'pricingEvidenceSha256',
  'actionJournalDirectoryPathSha256',
  'actionJournalDirectoryFingerprint',
  'evidenceParentDirectoryPathSha256',
  'evidenceParentDirectoryFingerprint',
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
]);
const EXECUTION_BINDING_KEYS = Object.freeze([
  'schemaVersion',
  'recordType',
  'derivationStatus',
  'derivationMethod',
  'actionId',
  'generatedAt',
  'expiresAt',
  'authorityReceiptSha256',
  'bindingSha256',
  'bindingMaterialSha256',
  'payloadSha256',
  'credentialConfigurationSha256',
  'pricingEvidenceSha256',
  'authorizationProjectionSha256',
  'authorityScopeConfirmed',
  'productionContactAuthorized',
  'phase2AndLaterAuthorized',
  'cleanupDeletionAuthorized',
  'notes',
]);
const RISK_KEYS = Object.freeze([
  'soleOperatorRiskAccepted',
  'sameUserDpapiCredentialExposureRiskAccepted',
  'providerSpendCapLimitationAcknowledged',
  'sameOrganizationExceptionRiskAccepted',
  'organizationListProductionRefObservationAccepted',
  'sharedOrganizationIamBillingControlPlaneRiskAccepted',
  'productionDirectContactProhibitionAcknowledged',
  'unknownChargesAcknowledged',
]);

export class Action003ApprovalReceiptError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Action003ApprovalReceiptError';
    this.code = code;
  }
}

function fail(code) {
  throw new Action003ApprovalReceiptError(code);
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
  requireCondition(
    canonicalJson(Object.keys(record).sort()) ===
      canonicalJson([...expectedKeys].sort()),
    code
  );
  return record;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireSha256(value, code) {
  requireCondition(
    typeof value === 'string' && SHA256_PATTERN.test(value),
    code
  );
  return value;
}

function requireDirectoryFingerprint(value, expectedPathSha256, code) {
  const fingerprint = requireExactKeys(
    cloneJson(value),
    ['pathSha256', 'resolvedPathSha256', 'device', 'inode', 'snapshotSha256'],
    code
  );
  requireCondition(
    fingerprint.pathSha256 === expectedPathSha256 &&
      fingerprint.resolvedPathSha256 === fingerprint.pathSha256 &&
      typeof fingerprint.device === 'string' &&
      /^\d+$/u.test(fingerprint.device) &&
      typeof fingerprint.inode === 'string' &&
      /^\d+$/u.test(fingerprint.inode) &&
      typeof fingerprint.snapshotSha256 === 'string' &&
      SHA256_PATTERN.test(fingerprint.snapshotSha256),
    code
  );
  return fingerprint;
}

function parseCanonicalTimestamp(value, code) {
  requireCondition(typeof value === 'string', code);
  const milliseconds = Date.parse(value);
  requireCondition(
    Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === value,
    code
  );
  return milliseconds;
}

function requireConcreteNotes(value, code) {
  requireCondition(
    typeof value === 'string' &&
      value === value.trim() &&
      value.length >= 16 &&
      value.length <= 2048 &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
    code
  );
}

function requireAllRisksAccepted(receipt, code) {
  requireCondition(
    RISK_KEYS.every(key => receipt[key] === true),
    code
  );
}

function canonicalFileSha256(value) {
  return sha256Text(`${canonicalJson(value)}\n`);
}

function requireInitialReceiptShape(receiptInput) {
  const receipt = requireExactKeys(
    cloneJson(receiptInput),
    INITIAL_RECEIPT_KEYS,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const acceptedAt = parseCanonicalTimestamp(
    receipt.acceptedAt,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const expiresAt = parseCanonicalTimestamp(
    receipt.expiresAt,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  for (const key of [
    'credentialConfigurationSha256',
    'pricingEvidenceSha256',
    'actionJournalDirectoryPathSha256',
    'evidenceParentDirectoryPathSha256',
  ]) {
    requireSha256(receipt[key], 'INITIAL_APPROVAL_RECEIPT_INVALID');
  }
  const actionJournalDirectoryFingerprint = requireDirectoryFingerprint(
    receipt.actionJournalDirectoryFingerprint,
    receipt.actionJournalDirectoryPathSha256,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const evidenceParentDirectoryFingerprint = requireDirectoryFingerprint(
    receipt.evidenceParentDirectoryFingerprint,
    receipt.evidenceParentDirectoryPathSha256,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  requireConcreteNotes(receipt.notes, 'INITIAL_APPROVAL_RECEIPT_INVALID');
  requireCondition(
    receipt.schemaVersion === 2 &&
      receipt.recordType === INITIAL_RECEIPT_TYPE &&
      receipt.decision === 'APPROVED' &&
      receipt.attestationStatus === 'VERIFIED' &&
      receipt.attestationMethod === INITIAL_ATTESTATION_METHOD &&
      receipt.actionId === ACTION_ID &&
      receipt.approvedByPrincipalId === PHASE1_OWNER_PRINCIPAL_ID &&
      receipt.approvedByDisplayName === PRINCIPAL_DISPLAY_NAME &&
      expiresAt === acceptedAt + INITIAL_TO_EXPIRY_MILLISECONDS &&
      receipt.approvalTtlSeconds === 3600 &&
      receipt.approvalPurpose === INITIAL_APPROVAL_PURPOSE &&
      typeof receipt.gitCommit === 'string' &&
      /^[a-f0-9]{40}$/u.test(receipt.gitCommit) &&
      receipt.organizationId === TARGET_ORGANIZATION_SLUG &&
      receipt.organizationSlug === TARGET_ORGANIZATION_SLUG &&
      receipt.projectName === FIXED_PROJECT_NAME &&
      receipt.region === 'ap-northeast-1' &&
      receipt.tier === 'LARGE' &&
      receipt.ownerAuthorizationCeilingUsdScaled ===
        OWNER_AUTHORIZATION_CEILING_USD_SCALED &&
      receipt.authorizedDurationHours === 72 &&
      receipt.maximumPostAttempts === 1 &&
      receipt.action003PacketPreparationAuthorized === true &&
      receipt.databasePasswordBootstrapAuthorized === false &&
      receipt.sourceProjectProvisioningAuthorized === true &&
      receipt.productionContactAuthorized === false &&
      receipt.phase2AndLaterAuthorized === false &&
      receipt.cleanupDeletionAuthorized === false,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  requireAllRisksAccepted(receipt, 'INITIAL_APPROVAL_RECEIPT_INVALID');
  assertSecretFreeEvidence(receipt, []);
  return receipt;
}

function riskAcceptances(receipt) {
  return Object.fromEntries(RISK_KEYS.map(key => [key, receipt[key]]));
}

export function validateInitialAction003ApprovalReceipt(receiptInput) {
  const receipt = requireInitialReceiptShape(receiptInput);
  const receiptSha256 = canonicalFileSha256(receipt);
  return {
    receipt,
    receiptSha256,
    acceptedAt: receipt.acceptedAt,
    approvalRecordFields: {
      principalId: PHASE1_OWNER_PRINCIPAL_ID,
      principalDisplayName: PRINCIPAL_DISPLAY_NAME,
      approvedAt: receipt.acceptedAt,
      expiresAt: receipt.expiresAt,
      initialApprovalReceiptSha256: receiptSha256,
      authorizationScope: {
        gitCommit: receipt.gitCommit,
        organizationId: receipt.organizationId,
        organizationSlug: receipt.organizationSlug,
        projectName: receipt.projectName,
        region: receipt.region,
        tier: receipt.tier,
        ownerAuthorizationCeilingUsdScaled:
          receipt.ownerAuthorizationCeilingUsdScaled,
        authorizedDurationHours: receipt.authorizedDurationHours,
        maximumPostAttempts: receipt.maximumPostAttempts,
        credentialConfigurationSha256: receipt.credentialConfigurationSha256,
        pricingEvidenceSha256: receipt.pricingEvidenceSha256,
        actionJournalDirectoryPathSha256:
          receipt.actionJournalDirectoryPathSha256,
        actionJournalDirectoryFingerprint:
          receipt.actionJournalDirectoryFingerprint,
        evidenceParentDirectoryPathSha256:
          receipt.evidenceParentDirectoryPathSha256,
        evidenceParentDirectoryFingerprint:
          receipt.evidenceParentDirectoryFingerprint,
      },
      riskAcceptances: riskAcceptances(receipt),
    },
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
}

function requireExecutionBindingShape(bindingInput) {
  const binding = requireExactKeys(
    cloneJson(bindingInput),
    EXECUTION_BINDING_KEYS,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  parseCanonicalTimestamp(
    binding.generatedAt,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  parseCanonicalTimestamp(
    binding.expiresAt,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  for (const key of [
    'authorityReceiptSha256',
    'bindingSha256',
    'bindingMaterialSha256',
    'payloadSha256',
    'credentialConfigurationSha256',
    'pricingEvidenceSha256',
    'authorizationProjectionSha256',
  ]) {
    requireSha256(binding[key], 'DERIVED_EXECUTION_BINDING_INVALID');
  }
  requireConcreteNotes(binding.notes, 'DERIVED_EXECUTION_BINDING_INVALID');
  requireCondition(
    binding.schemaVersion === 1 &&
      binding.recordType === EXECUTION_BINDING_TYPE &&
      binding.derivationStatus === 'VERIFIED_LOCAL_DERIVATION' &&
      binding.derivationMethod === EXECUTION_BINDING_DERIVATION_METHOD &&
      binding.actionId === ACTION_ID &&
      binding.authorityScopeConfirmed === true &&
      binding.productionContactAuthorized === false &&
      binding.phase2AndLaterAuthorized === false &&
      binding.cleanupDeletionAuthorized === false,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  assertSecretFreeEvidence(binding, []);
  return binding;
}

function requireExpectedExecutionBinding(expectedInput) {
  const expected = requireExactKeys(
    cloneJson(expectedInput),
    [
      'authorityReceipt',
      'bindingSha256',
      'bindingMaterialSha256',
      'payloadSha256',
      'credentialConfigurationSha256',
      'pricingEvidenceSha256',
      'authorizationProjectionSha256',
      'scheduledExecutionAt',
      'expiresAt',
      'generatedAt',
    ],
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  const initial = validateInitialAction003ApprovalReceipt(
    expected.authorityReceipt
  );
  for (const key of [
    'bindingSha256',
    'bindingMaterialSha256',
    'payloadSha256',
    'credentialConfigurationSha256',
    'pricingEvidenceSha256',
    'authorizationProjectionSha256',
  ]) {
    requireSha256(expected[key], 'DERIVED_EXECUTION_BINDING_INVALID');
  }
  const initialAcceptedAt = parseCanonicalTimestamp(
    initial.acceptedAt,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  const scheduledExecutionAt = parseCanonicalTimestamp(
    expected.scheduledExecutionAt,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  const expiresAt = parseCanonicalTimestamp(
    expected.expiresAt,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  const generatedAt = parseCanonicalTimestamp(
    expected.generatedAt,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  requireCondition(
    scheduledExecutionAt ===
      initialAcceptedAt + INITIAL_TO_SCHEDULE_MILLISECONDS &&
      expiresAt === initialAcceptedAt + INITIAL_TO_EXPIRY_MILLISECONDS &&
      generatedAt >= initialAcceptedAt &&
      generatedAt < expiresAt &&
      initial.receipt.expiresAt === expected.expiresAt &&
      initial.receipt.credentialConfigurationSha256 ===
        expected.credentialConfigurationSha256 &&
      initial.receipt.pricingEvidenceSha256 === expected.pricingEvidenceSha256,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  return {
    expected,
    initial,
    initialAcceptedAt,
    scheduledExecutionAt,
    expiresAt,
    generatedAt,
  };
}

export function deriveAction003ExecutionBinding(expectedInput) {
  const expectedBinding = requireExpectedExecutionBinding(expectedInput);
  const binding = {
    schemaVersion: 1,
    recordType: EXECUTION_BINDING_TYPE,
    derivationStatus: 'VERIFIED_LOCAL_DERIVATION',
    derivationMethod: EXECUTION_BINDING_DERIVATION_METHOD,
    actionId: ACTION_ID,
    generatedAt: expectedBinding.expected.generatedAt,
    expiresAt: expectedBinding.expected.expiresAt,
    authorityReceiptSha256: expectedBinding.initial.receiptSha256,
    bindingSha256: expectedBinding.expected.bindingSha256,
    bindingMaterialSha256: expectedBinding.expected.bindingMaterialSha256,
    payloadSha256: expectedBinding.expected.payloadSha256,
    credentialConfigurationSha256:
      expectedBinding.expected.credentialConfigurationSha256,
    pricingEvidenceSha256: expectedBinding.expected.pricingEvidenceSha256,
    authorizationProjectionSha256:
      expectedBinding.expected.authorizationProjectionSha256,
    authorityScopeConfirmed: true,
    productionContactAuthorized: false,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    notes:
      'System-derived exact-hash execution binding. Authority remains exclusively in the single owner receipt; this artifact records no human decision or reconfirmation.',
  };
  assertSecretFreeEvidence(binding, []);
  return {
    binding,
    bindingSha256: canonicalFileSha256(binding),
    generatedAt: binding.generatedAt,
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
}

export function validateAction003ExecutionBinding(
  bindingInput,
  expectedInput,
  nowInput
) {
  const derived = requireExecutionBindingShape(bindingInput);
  const expectedBinding = requireExpectedExecutionBinding(expectedInput);
  const generatedAt = parseCanonicalTimestamp(
    derived.generatedAt,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  const now = parseCanonicalTimestamp(
    nowInput,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  requireCondition(
    generatedAt === expectedBinding.generatedAt &&
      generatedAt >= expectedBinding.initialAcceptedAt &&
      generatedAt < expectedBinding.expiresAt &&
      now >= generatedAt &&
      now < expectedBinding.expiresAt &&
      derived.expiresAt === expectedBinding.expected.expiresAt &&
      derived.authorityReceiptSha256 ===
        expectedBinding.initial.receiptSha256 &&
      derived.bindingSha256 === expectedBinding.expected.bindingSha256 &&
      derived.bindingMaterialSha256 ===
        expectedBinding.expected.bindingMaterialSha256 &&
      derived.payloadSha256 === expectedBinding.expected.payloadSha256 &&
      derived.credentialConfigurationSha256 ===
        expectedBinding.expected.credentialConfigurationSha256 &&
      derived.pricingEvidenceSha256 ===
        expectedBinding.expected.pricingEvidenceSha256 &&
      derived.authorizationProjectionSha256 ===
        expectedBinding.expected.authorizationProjectionSha256,
    'DERIVED_EXECUTION_BINDING_INVALID'
  );
  return {
    binding: derived,
    bindingSha256: canonicalFileSha256(derived),
    generatedAt: derived.generatedAt,
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
}

function normalizedPath(value) {
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

function pathFingerprint(value) {
  return sha256Text(
    path.win32.resolve(value).replaceAll('\\', '/').toLowerCase()
  );
}

function receiptDirectoryName(receiptFilename) {
  if (receiptFilename === INITIAL_RECEIPT_FILENAME) {
    return INITIAL_RECEIPT_DIRECTORY;
  }
  if (receiptFilename === EXECUTION_BINDING_FILENAME) {
    return EXECUTION_BINDING_DIRECTORY;
  }
  fail('RECEIPT_OUTPUT_BOUNDARY_INVALID');
}

function configuredWindowsTempBoundaries() {
  const candidates = [
    os.tmpdir(),
    process.env.TEMP,
    process.env.TMP,
    process.env.TMPDIR,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Temp')
      : undefined,
    path.join(process.env.SystemRoot ?? 'C:\\Windows', 'Temp'),
  ];
  return [
    ...new Set(
      candidates
        .filter(value => typeof value === 'string' && path.isAbsolute(value))
        .map(value => path.resolve(value))
    ),
  ];
}

function requireEveryExistingPathComponentNonReparse(value, code) {
  try {
    const absolute = path.resolve(value);
    const parsed = path.parse(absolute);
    const segments = absolute
      .slice(parsed.root.length)
      .split(path.sep)
      .filter(Boolean);
    let current = parsed.root;
    for (const segment of segments) {
      current = path.join(current, segment);
      requireCondition(existsSync(current), code);
      const status = lstatSync(current);
      requireCondition(
        !status.isSymbolicLink() &&
          normalizedPath(realpathSync.native(current)) ===
            normalizedPath(current),
        code
      );
    }
    return absolute;
  } catch (error) {
    if (error instanceof Action003ApprovalReceiptError) throw error;
    fail(code);
  }
}

function requireExternalOwnerPrivateRoot(ownerPrivateRootInput, code) {
  requireCondition(
    typeof ownerPrivateRootInput === 'string' &&
      path.isAbsolute(ownerPrivateRootInput),
    code
  );
  const ownerPrivateRoot = requireEveryExistingPathComponentNonReparse(
    ownerPrivateRootInput,
    code
  );
  requireCondition(
    existsSync(ownerPrivateRoot) &&
      lstatSync(ownerPrivateRoot).isDirectory() &&
      !isWithinBoundary(REPOSITORY_ROOT, ownerPrivateRoot) &&
      configuredWindowsTempBoundaries().every(
        temporaryRoot => !isWithinBoundary(temporaryRoot, ownerPrivateRoot)
      ),
    code
  );
  return ownerPrivateRoot;
}

function requireExistingOwnerPrivateTarget(
  ownerPrivateRootInput,
  targetPathInput,
  kind,
  code
) {
  requireCondition(
    (kind === 'FILE' || kind === 'DIRECTORY') &&
      typeof targetPathInput === 'string' &&
      path.isAbsolute(targetPathInput),
    code
  );
  const ownerPrivateRoot = requireExternalOwnerPrivateRoot(
    ownerPrivateRootInput,
    code
  );
  const targetPath = requireEveryExistingPathComponentNonReparse(
    targetPathInput,
    code
  );
  const targetStatus = lstatSync(targetPath);
  requireCondition(
    isWithinBoundary(ownerPrivateRoot, targetPath) &&
      (kind === 'FILE' ? targetStatus.isFile() : targetStatus.isDirectory()),
    code
  );
  return { ownerPrivateRoot, targetPath, kind };
}

function requireOwnerPrivateOutputBoundary(
  ownerPrivateRootInput,
  outputDirectoryInput,
  receiptFilename
) {
  requireCondition(
    typeof outputDirectoryInput === 'string' &&
      path.isAbsolute(outputDirectoryInput),
    'RECEIPT_OUTPUT_BOUNDARY_INVALID'
  );
  const ownerPrivateRoot = requireExternalOwnerPrivateRoot(
    ownerPrivateRootInput,
    'RECEIPT_OUTPUT_BOUNDARY_INVALID'
  );
  const outputDirectory = path.resolve(outputDirectoryInput);
  const expectedDirectoryName = receiptDirectoryName(receiptFilename);
  requireCondition(
    path.dirname(outputDirectory) === ownerPrivateRoot &&
      path.basename(outputDirectory) === expectedDirectoryName,
    'RECEIPT_OUTPUT_BOUNDARY_INVALID'
  );
  requireCondition(
    !existsSync(outputDirectory),
    'RECEIPT_OUTPUT_ALREADY_EXISTS'
  );
  return { ownerPrivateRoot, outputDirectory };
}

function requirePowerShellExecutable() {
  const executable = POWERSHELL_CANDIDATES.find(candidate =>
    existsSync(candidate)
  );
  requireCondition(
    typeof executable === 'string',
    'WINDOWS_ACL_CAPTURE_UNAVAILABLE'
  );
  return executable;
}

function windowsAclProof(pathValue, kind, mode, code) {
  let output;
  try {
    requireCondition(
      process.platform === 'win32' &&
        existsSync(ACL_HELPER_PATH) &&
        lstatSync(ACL_HELPER_PATH).isFile() &&
        !lstatSync(ACL_HELPER_PATH).isSymbolicLink(),
      code
    );
    output = execFileSync(
      requirePowerShellExecutable(),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        ACL_HELPER_PATH,
        '-Mode',
        mode,
        '-Kind',
        kind,
        '-LiteralPath',
        pathValue,
      ],
      {
        encoding: 'utf8',
        env: {
          SystemRoot: 'C:\\Windows',
          WINDIR: 'C:\\Windows',
          ComSpec: 'C:\\Windows\\System32\\cmd.exe',
        },
        maxBuffer: 64 * 1024,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
        windowsHide: true,
      }
    );
  } catch (error) {
    if (error instanceof Action003ApprovalReceiptError) throw error;
    fail(code);
  }
  let raw;
  try {
    raw = JSON.parse(output.trim());
  } catch {
    fail(code);
  }
  const capture = requireExactKeys(
    raw,
    [
      'schemaVersion',
      'aclPolicyId',
      'kind',
      'ownerSid',
      'currentUserSid',
      'systemSid',
      'accessRulesProtected',
      'accessRuleCount',
      'allowedSids',
      'sddl',
    ],
    code
  );
  requireCondition(
    capture.schemaVersion === 1 &&
      capture.aclPolicyId === ACL_POLICY_ID &&
      capture.kind === kind &&
      typeof capture.ownerSid === 'string' &&
      capture.ownerSid === capture.currentUserSid &&
      capture.systemSid === SYSTEM_SID &&
      capture.accessRulesProtected === true &&
      capture.accessRuleCount === 2 &&
      Array.isArray(capture.allowedSids) &&
      capture.allowedSids.length === 2 &&
      capture.allowedSids.includes(capture.currentUserSid) &&
      capture.allowedSids.includes(SYSTEM_SID) &&
      typeof capture.sddl === 'string' &&
      capture.sddl.length > 0,
    code
  );
  return {
    schemaVersion: 1,
    aclPolicyId: ACL_POLICY_ID,
    kind,
    ownerSidSha256: sha256Text(capture.ownerSid),
    currentUserSidSha256: sha256Text(capture.currentUserSid),
    systemSidSha256: sha256Text(capture.systemSid),
    allowedSidSha256: capture.allowedSids
      .map(value => sha256Text(value))
      .sort(),
    accessRulesProtected: true,
    accessRuleCount: 2,
    sddlSha256: sha256Text(capture.sddl),
    aclHelperSha256: sha256Text(readFileSync(ACL_HELPER_PATH, 'utf8')),
  };
}

function stableFileSnapshot(filename, expectedReceipt, code) {
  let descriptor;
  try {
    requireCondition(
      existsSync(filename) &&
        !lstatSync(filename).isSymbolicLink() &&
        lstatSync(filename).isFile(),
      code
    );
    const resolvedBefore = realpathSync.native(filename);
    descriptor = openSync(filename, 'r');
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const pathStatus = statSync(filename, { bigint: true });
    const resolvedAfter = realpathSync.native(filename);
    const expectedBytes = Buffer.from(
      `${canonicalJson(expectedReceipt)}\n`,
      'utf8'
    );
    requireCondition(
      before.isFile() &&
        String(before.dev) === String(after.dev) &&
        String(before.ino) === String(after.ino) &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        BigInt(bytes.length) === after.size &&
        pathStatus.isFile() &&
        String(pathStatus.dev) === String(after.dev) &&
        String(pathStatus.ino) === String(after.ino) &&
        normalizedPath(resolvedBefore) === normalizedPath(resolvedAfter) &&
        bytes.equals(expectedBytes),
      code
    );
    return {
      pathSha256: pathFingerprint(filename),
      resolvedPathSha256: pathFingerprint(resolvedAfter),
      device: String(after.dev),
      inode: String(after.ino),
      size: Number(after.size),
      modifiedAtMilliseconds: Number(after.mtimeMs),
      contentSha256: sha256Text(bytes.toString('utf8')),
    };
  } catch (error) {
    if (error instanceof Action003ApprovalReceiptError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function stableGenericFileIdentity(filename, code) {
  let descriptor;
  try {
    requireEveryExistingPathComponentNonReparse(filename, code);
    const resolvedBefore = realpathSync.native(filename);
    descriptor = openSync(filename, 'r');
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const pathStatus = statSync(filename, { bigint: true });
    const resolvedAfter = realpathSync.native(filename);
    requireCondition(
      before.isFile() &&
        String(before.dev) === String(after.dev) &&
        String(before.ino) === String(after.ino) &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        BigInt(bytes.length) === after.size &&
        pathStatus.isFile() &&
        String(pathStatus.dev) === String(after.dev) &&
        String(pathStatus.ino) === String(after.ino) &&
        normalizedPath(resolvedBefore) === normalizedPath(resolvedAfter),
      code
    );
    return {
      pathSha256: pathFingerprint(filename),
      resolvedPathSha256: pathFingerprint(resolvedAfter),
      device: String(after.dev),
      inode: String(after.ino),
      size: Number(after.size),
      modifiedAtMilliseconds: Number(after.mtimeMs),
      contentSha256: sha256Text(bytes.toString('utf8')),
    };
  } catch (error) {
    if (error instanceof Action003ApprovalReceiptError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function stableDirectoryIdentity(directory, code) {
  try {
    requireEveryExistingPathComponentNonReparse(directory, code);
    requireCondition(
      existsSync(directory) &&
        lstatSync(directory).isDirectory() &&
        !lstatSync(directory).isSymbolicLink(),
      code
    );
    const resolvedBefore = realpathSync.native(directory);
    const before = statSync(directory, { bigint: true });
    const resolvedAfter = realpathSync.native(directory);
    const after = statSync(directory, { bigint: true });
    requireCondition(
      before.isDirectory() &&
        after.isDirectory() &&
        String(before.dev) === String(after.dev) &&
        String(before.ino) === String(after.ino) &&
        before.mtimeMs === after.mtimeMs &&
        normalizedPath(resolvedBefore) === normalizedPath(resolvedAfter),
      code
    );
    return {
      pathSha256: pathFingerprint(directory),
      resolvedPathSha256: pathFingerprint(resolvedAfter),
      device: String(after.dev),
      inode: String(after.ino),
      modifiedAtMilliseconds: Number(after.mtimeMs),
    };
  } catch (error) {
    if (error instanceof Action003ApprovalReceiptError) throw error;
    fail(code);
  }
}

function requireExactReceiptDirectoryEntries(directory, receiptFilename, code) {
  requireCondition(
    canonicalJson(readdirSync(directory).sort()) ===
      canonicalJson([receiptFilename]),
    code
  );
}

function requireStableAcl(pathValue, kind, expectedAcl, code) {
  const before = windowsAclProof(pathValue, kind, 'CAPTURE', code);
  requireCondition(canonicalJson(before) === canonicalJson(expectedAcl), code);
  return before;
}

function requireStableIdentity(actual, expected, code) {
  requireCondition(canonicalJson(actual) === canonicalJson(expected), code);
}

function inspectExistingOwnerPrivatePath(inputValue) {
  requireCondition(
    process.platform === 'win32',
    'WINDOWS_ACL_CAPTURE_REQUIRED'
  );
  const input = requireExactKeys(
    inputValue,
    ['ownerPrivateRoot', 'targetPath', 'kind'],
    'OWNER_PRIVATE_BOUNDARY_INPUT_INVALID'
  );
  const boundary = requireExistingOwnerPrivateTarget(
    input.ownerPrivateRoot,
    input.targetPath,
    input.kind,
    'OWNER_PRIVATE_BOUNDARY_INVALID'
  );
  const ownerPrivateRootAcl = windowsAclProof(
    boundary.ownerPrivateRoot,
    'DIRECTORY',
    'CAPTURE',
    'OWNER_PRIVATE_ROOT_ACL_INVALID'
  );
  const targetAcl = windowsAclProof(
    boundary.targetPath,
    boundary.kind,
    'CAPTURE',
    'OWNER_PRIVATE_TARGET_ACL_INVALID'
  );
  const ownerPrivateRootIdentity = stableDirectoryIdentity(
    boundary.ownerPrivateRoot,
    'OWNER_PRIVATE_ROOT_IDENTITY_INVALID'
  );
  const targetIdentity =
    boundary.kind === 'FILE'
      ? stableGenericFileIdentity(
          boundary.targetPath,
          'OWNER_PRIVATE_TARGET_IDENTITY_INVALID'
        )
      : stableDirectoryIdentity(
          boundary.targetPath,
          'OWNER_PRIVATE_TARGET_IDENTITY_INVALID'
        );
  requireExistingOwnerPrivateTarget(
    boundary.ownerPrivateRoot,
    boundary.targetPath,
    boundary.kind,
    'OWNER_PRIVATE_BOUNDARY_DRIFT'
  );
  requireStableAcl(
    boundary.ownerPrivateRoot,
    'DIRECTORY',
    ownerPrivateRootAcl,
    'OWNER_PRIVATE_ROOT_ACL_DRIFT'
  );
  requireStableAcl(
    boundary.targetPath,
    boundary.kind,
    targetAcl,
    'OWNER_PRIVATE_TARGET_ACL_DRIFT'
  );
  requireStableIdentity(
    stableDirectoryIdentity(
      boundary.ownerPrivateRoot,
      'OWNER_PRIVATE_ROOT_IDENTITY_DRIFT'
    ),
    ownerPrivateRootIdentity,
    'OWNER_PRIVATE_ROOT_IDENTITY_DRIFT'
  );
  const result = {
    status: 'VERIFIED_OWNER_PRIVATE_PATH',
    boundaryPolicyId: OWNER_PRIVATE_BOUNDARY_POLICY_ID,
    kind: boundary.kind,
    ownerPrivateRootPathSha256: pathFingerprint(boundary.ownerPrivateRoot),
    targetPathSha256: pathFingerprint(boundary.targetPath),
    targetIsOwnerPrivateRoot:
      normalizedPath(boundary.ownerPrivateRoot) ===
      normalizedPath(boundary.targetPath),
    allPathComponentsNonReparse: true,
    outsideRepository: true,
    outsideWindowsTempRoots: true,
    ownerPrivateRootIdentity,
    ownerPrivateRootAcl,
    targetIdentity,
    targetAcl,
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
  assertSecretFreeEvidence(result, []);
  return result;
}

export function requireOwnerPrivateBoundary(inputValue) {
  return inspectExistingOwnerPrivatePath(inputValue);
}

export function inspectOwnerPrivatePathAcl(inputValue) {
  return inspectExistingOwnerPrivatePath(inputValue);
}

export function protectOwnerPrivatePath(inputValue) {
  requireCondition(
    process.platform === 'win32',
    'WINDOWS_ACL_CAPTURE_REQUIRED'
  );
  const input = requireExactKeys(
    inputValue,
    ['ownerPrivateRoot', 'targetPath', 'kind'],
    'OWNER_PRIVATE_BOUNDARY_INVALID'
  );
  const boundary = requireExistingOwnerPrivateTarget(
    input.ownerPrivateRoot,
    input.targetPath,
    input.kind,
    'OWNER_PRIVATE_BOUNDARY_INVALID'
  );
  windowsAclProof(
    boundary.targetPath,
    boundary.kind,
    'PROTECT_AND_CAPTURE',
    'OWNER_PRIVATE_TARGET_ACL_INVALID'
  );
  return inspectExistingOwnerPrivatePath(input);
}

function writeCanonicalReceiptCreateNew(filename, receipt) {
  let descriptor;
  try {
    descriptor = openSync(filename, 'wx', 0o600);
    writeFileSync(
      descriptor,
      Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8')
    );
    fsyncSync(descriptor);
  } catch {
    fail('RECEIPT_CREATE_NEW_WRITE_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function recordReceiptCreateNew(
  ownerPrivateRoot,
  outputDirectory,
  validation,
  receiptFilename
) {
  const artifact = validation.receipt ?? validation.binding;
  const artifactSha256 = validation.receiptSha256 ?? validation.bindingSha256;
  const recordedAt = validation.acceptedAt ?? validation.generatedAt;
  requireCondition(
    isRecord(artifact) &&
      typeof artifactSha256 === 'string' &&
      typeof recordedAt === 'string',
    'RECEIPT_RECORD_INPUT_INVALID'
  );
  const boundary = requireOwnerPrivateOutputBoundary(
    ownerPrivateRoot,
    outputDirectory,
    receiptFilename
  );

  const ownerPrivateRootAcl = windowsAclProof(
    boundary.ownerPrivateRoot,
    'DIRECTORY',
    'PROTECT_AND_CAPTURE',
    'OWNER_PRIVATE_ROOT_ACL_INVALID'
  );
  mkdirSync(boundary.outputDirectory, { recursive: false, mode: 0o700 });
  requireEveryExistingPathComponentNonReparse(
    boundary.outputDirectory,
    'RECEIPT_OUTPUT_BOUNDARY_INVALID'
  );
  const directoryAcl = windowsAclProof(
    boundary.outputDirectory,
    'DIRECTORY',
    'PROTECT_AND_CAPTURE',
    'RECEIPT_DIRECTORY_ACL_INVALID'
  );
  const receiptPath = path.join(boundary.outputDirectory, receiptFilename);
  writeCanonicalReceiptCreateNew(receiptPath, artifact);
  requireEveryExistingPathComponentNonReparse(
    receiptPath,
    'RECEIPT_OUTPUT_BOUNDARY_INVALID'
  );
  const fileAcl = windowsAclProof(
    receiptPath,
    'FILE',
    'PROTECT_AND_CAPTURE',
    'RECEIPT_FILE_ACL_INVALID'
  );
  requireExactReceiptDirectoryEntries(
    boundary.outputDirectory,
    receiptFilename,
    'RECEIPT_OUTPUT_FILE_SET_INVALID'
  );
  requireStableAcl(receiptPath, 'FILE', fileAcl, 'RECEIPT_FILE_ACL_DRIFT');
  const fileIdentity = stableFileSnapshot(
    receiptPath,
    artifact,
    'RECEIPT_READBACK_INVALID'
  );
  requireStableAcl(receiptPath, 'FILE', fileAcl, 'RECEIPT_FILE_ACL_DRIFT');
  requireStableAcl(
    boundary.outputDirectory,
    'DIRECTORY',
    directoryAcl,
    'RECEIPT_DIRECTORY_ACL_DRIFT'
  );
  const directoryIdentity = stableDirectoryIdentity(
    boundary.outputDirectory,
    'RECEIPT_DIRECTORY_IDENTITY_INVALID'
  );
  requireStableAcl(
    boundary.outputDirectory,
    'DIRECTORY',
    directoryAcl,
    'RECEIPT_DIRECTORY_ACL_DRIFT'
  );
  const ownerPrivateRootIdentity = stableDirectoryIdentity(
    boundary.ownerPrivateRoot,
    'OWNER_PRIVATE_ROOT_IDENTITY_INVALID'
  );
  requireStableAcl(
    boundary.ownerPrivateRoot,
    'DIRECTORY',
    ownerPrivateRootAcl,
    'OWNER_PRIVATE_ROOT_ACL_DRIFT'
  );
  requireCondition(
    fileIdentity.contentSha256 === artifactSha256,
    'RECEIPT_READBACK_INVALID'
  );
  requireStableIdentity(
    stableDirectoryIdentity(
      boundary.ownerPrivateRoot,
      'OWNER_PRIVATE_ROOT_IDENTITY_DRIFT'
    ),
    ownerPrivateRootIdentity,
    'OWNER_PRIVATE_ROOT_IDENTITY_DRIFT'
  );

  const result = {
    status: 'RECORDED',
    recordType: artifact.recordType,
    fileCount: 1,
    artifactSha256,
    recordedAt,
    ...(artifact.recordType === INITIAL_RECEIPT_TYPE
      ? {
          receiptSha256: artifactSha256,
          acceptedAt: recordedAt,
        }
      : {
          executionBindingSha256: artifactSha256,
          generatedAt: recordedAt,
        }),
    ownerPrivateRootPathSha256: pathFingerprint(boundary.ownerPrivateRoot),
    ownerPrivateRootIdentity,
    ownerPrivateRootAcl,
    receiptPathSha256: fileIdentity.pathSha256,
    fileIdentity,
    fileAcl,
    directoryIdentity,
    directoryAcl,
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
  assertSecretFreeEvidence(result, []);
  return result;
}

export function recordInitialAction003ApprovalReceiptCreateNew(inputValue) {
  requireCondition(
    process.platform === 'win32',
    'WINDOWS_ACL_CAPTURE_REQUIRED'
  );
  const input = requireExactKeys(
    inputValue,
    ['ownerPrivateRoot', 'outputDirectory', 'receipt'],
    'RECEIPT_RECORD_INPUT_INVALID'
  );
  const validation = validateInitialAction003ApprovalReceipt(input.receipt);
  return recordReceiptCreateNew(
    input.ownerPrivateRoot,
    input.outputDirectory,
    validation,
    INITIAL_RECEIPT_FILENAME
  );
}

export function recordAction003ExecutionBindingCreateNew(inputValue) {
  requireCondition(
    process.platform === 'win32',
    'WINDOWS_ACL_CAPTURE_REQUIRED'
  );
  const input = requireExactKeys(
    inputValue,
    ['ownerPrivateRoot', 'outputDirectory', 'binding', 'expected'],
    'RECEIPT_RECORD_INPUT_INVALID'
  );
  const validation = validateAction003ExecutionBinding(
    input.binding,
    input.expected,
    new Date().toISOString()
  );
  return recordReceiptCreateNew(
    input.ownerPrivateRoot,
    input.outputDirectory,
    validation,
    EXECUTION_BINDING_FILENAME
  );
}

function verifyReceiptStable(inputValue, receiptFilename, requireReceiptShape) {
  const input = requireExactKeys(
    inputValue,
    [
      'ownerPrivateRoot',
      'receiptPath',
      'expectedReceipt',
      'expectedOwnerPrivateRootIdentity',
      'expectedOwnerPrivateRootAcl',
      'expectedFileIdentity',
      'expectedFileAcl',
      'expectedDirectoryIdentity',
      'expectedDirectoryAcl',
    ],
    'RECEIPT_VERIFY_INPUT_INVALID'
  );
  requireCondition(
    typeof input.ownerPrivateRoot === 'string' &&
      path.isAbsolute(input.ownerPrivateRoot) &&
      typeof input.receiptPath === 'string' &&
      path.isAbsolute(input.receiptPath) &&
      path.basename(input.receiptPath) === receiptFilename,
    'RECEIPT_VERIFY_INPUT_INVALID'
  );
  const receipt = requireReceiptShape(input.expectedReceipt);
  const directory = path.dirname(path.resolve(input.receiptPath));
  const ownerPrivateRoot = path.resolve(input.ownerPrivateRoot);
  requireCondition(
    path.dirname(directory) === ownerPrivateRoot &&
      path.basename(directory) === receiptDirectoryName(receiptFilename),
    'RECEIPT_VERIFY_INPUT_INVALID'
  );
  requireExistingOwnerPrivateTarget(
    ownerPrivateRoot,
    directory,
    'DIRECTORY',
    'RECEIPT_OUTPUT_BOUNDARY_INVALID'
  );
  requireExistingOwnerPrivateTarget(
    ownerPrivateRoot,
    input.receiptPath,
    'FILE',
    'RECEIPT_OUTPUT_BOUNDARY_INVALID'
  );
  requireStableAcl(
    ownerPrivateRoot,
    'DIRECTORY',
    input.expectedOwnerPrivateRootAcl,
    'OWNER_PRIVATE_ROOT_ACL_DRIFT'
  );
  requireStableIdentity(
    stableDirectoryIdentity(
      ownerPrivateRoot,
      'OWNER_PRIVATE_ROOT_IDENTITY_DRIFT'
    ),
    input.expectedOwnerPrivateRootIdentity,
    'OWNER_PRIVATE_ROOT_IDENTITY_DRIFT'
  );
  requireExactReceiptDirectoryEntries(
    directory,
    receiptFilename,
    'RECEIPT_OUTPUT_FILE_SET_INVALID'
  );
  requireStableAcl(
    input.receiptPath,
    'FILE',
    input.expectedFileAcl,
    'RECEIPT_ACL_DRIFT'
  );
  const fileIdentity = stableFileSnapshot(
    input.receiptPath,
    receipt,
    'RECEIPT_IDENTITY_DRIFT'
  );
  requireStableAcl(
    input.receiptPath,
    'FILE',
    input.expectedFileAcl,
    'RECEIPT_ACL_DRIFT'
  );
  const directoryIdentity = stableDirectoryIdentity(
    directory,
    'RECEIPT_DIRECTORY_IDENTITY_DRIFT'
  );
  requireStableAcl(
    directory,
    'DIRECTORY',
    input.expectedDirectoryAcl,
    'RECEIPT_DIRECTORY_ACL_DRIFT'
  );
  requireStableIdentity(
    fileIdentity,
    input.expectedFileIdentity,
    'RECEIPT_IDENTITY_DRIFT'
  );
  requireStableIdentity(
    directoryIdentity,
    input.expectedDirectoryIdentity,
    'RECEIPT_DIRECTORY_IDENTITY_DRIFT'
  );
  requireStableAcl(
    ownerPrivateRoot,
    'DIRECTORY',
    input.expectedOwnerPrivateRootAcl,
    'OWNER_PRIVATE_ROOT_ACL_DRIFT'
  );
  const ownerPrivateRootIdentity = stableDirectoryIdentity(
    ownerPrivateRoot,
    'OWNER_PRIVATE_ROOT_IDENTITY_DRIFT'
  );
  requireStableIdentity(
    ownerPrivateRootIdentity,
    input.expectedOwnerPrivateRootIdentity,
    'OWNER_PRIVATE_ROOT_IDENTITY_DRIFT'
  );
  const result = {
    status: 'VERIFIED_STABLE',
    recordType: receipt.recordType,
    receiptSha256: fileIdentity.contentSha256,
    receiptPathSha256: fileIdentity.pathSha256,
    ownerPrivateRootPathSha256: pathFingerprint(ownerPrivateRoot),
    ownerPrivateRootIdentity,
    ownerPrivateRootAcl: cloneJson(input.expectedOwnerPrivateRootAcl),
    fileIdentity,
    fileAcl: cloneJson(input.expectedFileAcl),
    directoryIdentity,
    directoryAcl: cloneJson(input.expectedDirectoryAcl),
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
  assertSecretFreeEvidence(result, []);
  return result;
}

export function verifyInitialAction003ApprovalReceiptStable(inputValue) {
  requireCondition(
    process.platform === 'win32',
    'WINDOWS_ACL_CAPTURE_REQUIRED'
  );
  return verifyReceiptStable(
    inputValue,
    INITIAL_RECEIPT_FILENAME,
    requireInitialReceiptShape
  );
}

export function verifyAction003ExecutionBindingStable(inputValue) {
  requireCondition(
    process.platform === 'win32',
    'WINDOWS_ACL_CAPTURE_REQUIRED'
  );
  return verifyReceiptStable(
    inputValue,
    EXECUTION_BINDING_FILENAME,
    requireExecutionBindingShape
  );
}
