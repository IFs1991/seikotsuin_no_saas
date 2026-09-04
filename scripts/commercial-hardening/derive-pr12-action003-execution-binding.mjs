import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  deriveAction003ExecutionBinding,
  recordAction003ExecutionBindingCreateNew,
  requireOwnerPrivateBoundary,
} from './pr12-action003-approval-receipt-contract.mjs';
import {
  assertSecretFreeEvidence,
  buildBindingMaterial,
  buildSecretFreeRequestProjection,
  canonicalJson,
  sha256Canonical,
  sha256Text,
} from './pr12-source-project-provisioning-contract.mjs';

const BINDING_FILENAME = 'source-project-provisioning-binding-v6.json';
const CREDENTIAL_FILENAME =
  'source-project-provisioning-credential-configuration-v2.json';
const AUTHORIZATION_PROJECTION_FILENAME =
  'source-project-provisioning-authorization-projection-v1.json';
const EXECUTION_BINDING_FILENAME =
  'source-project-provisioning-derived-execution-binding-v1.json';
const EXECUTION_BINDING_DIRECTORY =
  'source-project-provisioning-derived-execution-binding-v1';
const EXACT_CANDIDATE_FILES = Object.freeze(
  [
    BINDING_FILENAME,
    CREDENTIAL_FILENAME,
    AUTHORIZATION_PROJECTION_FILENAME,
  ].sort()
);
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const MAXIMUM_JSON_BYTES = 1_048_576;

export class Action003DerivedExecutionBindingError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Action003DerivedExecutionBindingError';
    this.code = code;
  }
}

function fail(code) {
  throw new Action003DerivedExecutionBindingError(code);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

function requireRecord(value, code) {
  requireCondition(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    code
  );
  return value;
}

function canonicalFileSha256(value) {
  return sha256Text(`${canonicalJson(value)}\n`);
}

function readCanonicalJson(filename, code) {
  requireCondition(
    typeof filename === 'string' &&
      path.isAbsolute(filename) &&
      existsSync(filename) &&
      lstatSync(filename).isFile() &&
      !lstatSync(filename).isSymbolicLink() &&
      readFileSync(filename).byteLength <= MAXIMUM_JSON_BYTES &&
      realpathSync.native(filename) === path.resolve(filename),
    code
  );
  const bytes = readFileSync(filename);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(code);
  }
  requireRecord(value, code);
  requireCondition(
    bytes.toString('utf8') === `${canonicalJson(value)}\n`,
    code
  );
  return { value, sha256: canonicalFileSha256(value) };
}

function requireOutsideRepository(value, code) {
  const relative = path.relative(REPOSITORY_ROOT, value);
  requireCondition(
    relative.startsWith('..') || path.isAbsolute(relative),
    code
  );
}

function validateInput(inputValue) {
  const input = requireRecord(inputValue, 'DERIVED_RECEIPT_INPUT_INVALID');
  const keys = [
    'candidateDirectory',
    'initialApprovalReceiptPath',
    'ownerPrivateRoot',
    'outputPath',
    'pricingEvidencePath',
    'pricingOwnerPrivateRoot',
  ];
  requireCondition(
    canonicalJson(Object.keys(input).sort()) === canonicalJson(keys.sort()),
    'DERIVED_RECEIPT_INPUT_INVALID'
  );
  for (const key of keys) {
    requireCondition(
      typeof input[key] === 'string' && path.isAbsolute(input[key]),
      'DERIVED_RECEIPT_INPUT_INVALID'
    );
  }
  const ownerPrivateRoot = path.resolve(input.ownerPrivateRoot);
  const pricingOwnerPrivateRoot = path.resolve(input.pricingOwnerPrivateRoot);
  const candidateDirectory = path.resolve(input.candidateDirectory);
  const outputPath = path.resolve(input.outputPath);
  const outputDirectory = path.dirname(outputPath);
  requireOutsideRepository(ownerPrivateRoot, 'OWNER_PRIVATE_BOUNDARY_INVALID');
  requireOutsideRepository(candidateDirectory, 'CANDIDATE_DIRECTORY_INVALID');
  requireOutsideRepository(outputPath, 'DERIVED_RECEIPT_OUTPUT_INVALID');
  requireOwnerPrivateBoundary({
    ownerPrivateRoot,
    targetPath: ownerPrivateRoot,
    kind: 'DIRECTORY',
  });
  requireOwnerPrivateBoundary({
    ownerPrivateRoot: pricingOwnerPrivateRoot,
    targetPath: pricingOwnerPrivateRoot,
    kind: 'DIRECTORY',
  });
  requireCondition(
    existsSync(candidateDirectory) &&
      lstatSync(candidateDirectory).isDirectory() &&
      !lstatSync(candidateDirectory).isSymbolicLink() &&
      realpathSync.native(candidateDirectory) === candidateDirectory &&
      path.dirname(candidateDirectory) === ownerPrivateRoot &&
      canonicalJson(readdirSync(candidateDirectory).sort()) ===
        canonicalJson(EXACT_CANDIDATE_FILES) &&
      path.dirname(outputDirectory) === ownerPrivateRoot &&
      path.basename(outputDirectory) === EXECUTION_BINDING_DIRECTORY &&
      path.basename(outputPath) === EXECUTION_BINDING_FILENAME &&
      !existsSync(outputDirectory) &&
      !existsSync(outputPath),
    'DERIVED_RECEIPT_OUTPUT_INVALID'
  );
  return {
    ownerPrivateRoot,
    candidateDirectory,
    outputDirectory,
    outputPath,
    initialApprovalReceiptPath: path.resolve(input.initialApprovalReceiptPath),
    pricingEvidencePath: path.resolve(input.pricingEvidencePath),
    pricingOwnerPrivateRoot,
  };
}

export function deriveAction003ExecutionBindingCreateNew(inputValue) {
  const input = validateInput(inputValue);
  const binding = readCanonicalJson(
    path.join(input.candidateDirectory, BINDING_FILENAME),
    'CANDIDATE_BINDING_INVALID'
  );
  const credentialConfiguration = readCanonicalJson(
    path.join(input.candidateDirectory, CREDENTIAL_FILENAME),
    'CREDENTIAL_CONFIGURATION_INVALID'
  );
  const authorizationProjection = readCanonicalJson(
    path.join(input.candidateDirectory, AUTHORIZATION_PROJECTION_FILENAME),
    'AUTHORIZATION_PROJECTION_INVALID'
  );
  const initialApprovalReceipt = readCanonicalJson(
    input.initialApprovalReceiptPath,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const pricingEvidence = readCanonicalJson(
    input.pricingEvidencePath,
    'PRICING_EVIDENCE_INVALID'
  );
  for (const boundary of [
    {
      ownerPrivateRoot: input.ownerPrivateRoot,
      targetPath: input.candidateDirectory,
      kind: 'DIRECTORY',
    },
    {
      ownerPrivateRoot: input.ownerPrivateRoot,
      targetPath: input.initialApprovalReceiptPath,
      kind: 'FILE',
    },
    {
      ownerPrivateRoot: input.pricingOwnerPrivateRoot,
      targetPath: input.pricingEvidencePath,
      kind: 'FILE',
    },
  ]) {
    requireOwnerPrivateBoundary(boundary);
  }
  const bindingValue = requireRecord(
    binding.value,
    'CANDIDATE_BINDING_INVALID'
  );
  const approval = requireRecord(
    bindingValue.approval,
    'CANDIDATE_BINDING_INVALID'
  );
  const action = requireRecord(
    bindingValue.provisioningAction,
    'CANDIDATE_BINDING_INVALID'
  );
  const approvedRequest = requireRecord(
    bindingValue.approvedRequest,
    'CANDIDATE_BINDING_INVALID'
  );
  const authorityScope = requireRecord(
    initialApprovalReceipt.value,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const target = requireRecord(
    bindingValue.target,
    'CANDIDATE_BINDING_INVALID'
  );
  const environment = requireRecord(
    bindingValue.environmentProposal,
    'CANDIDATE_BINDING_INVALID'
  );
  const cost = requireRecord(bindingValue.cost, 'CANDIDATE_BINDING_INVALID');
  const pricingBinding = requireRecord(
    cost.pricingEvidence,
    'CANDIDATE_BINDING_INVALID'
  );
  const credentialControls = requireRecord(
    bindingValue.credentialControls,
    'CANDIDATE_BINDING_INVALID'
  );
  const credentialBinding = requireRecord(
    credentialControls.provisioningCredentialConfiguration,
    'CANDIDATE_BINDING_INVALID'
  );
  const duplicatePolicy = requireRecord(
    bindingValue.duplicateAndFailurePolicy,
    'CANDIDATE_BINDING_INVALID'
  );
  const evidenceContract = requireRecord(
    bindingValue.evidenceContract,
    'CANDIDATE_BINDING_INVALID'
  );
  requireCondition(
    authorityScope.gitCommit === target.gitCommit &&
      authorityScope.organizationId === environment.organizationId &&
      authorityScope.organizationSlug === environment.organizationSlug &&
      authorityScope.projectName === environment.projectName &&
      authorityScope.region === environment.region &&
      authorityScope.tier === environment.databaseTier &&
      authorityScope.ownerAuthorizationCeilingUsdScaled ===
        cost.ownerAuthorizationCeilingUsdScaled &&
      authorityScope.credentialConfigurationSha256 ===
        credentialBinding.sha256 &&
      authorityScope.pricingEvidenceSha256 === pricingBinding.artifactSha256 &&
      authorityScope.actionJournalDirectoryPathSha256 ===
        duplicatePolicy.actionJournalDirectoryPathSha256 &&
      canonicalJson(authorityScope.actionJournalDirectoryFingerprint) ===
        canonicalJson(duplicatePolicy.actionJournalDirectoryFingerprint) &&
      authorityScope.evidenceParentDirectoryPathSha256 ===
        evidenceContract.evidenceParentDirectoryPathSha256 &&
      canonicalJson(authorityScope.evidenceParentDirectoryFingerprint) ===
        canonicalJson(evidenceContract.evidenceParentDirectoryFingerprint),
    'AUTHORITY_SCOPE_MISMATCH'
  );
  const computedBindingMaterialSha256 = sha256Canonical(
    buildBindingMaterial(bindingValue)
  );
  const computedProjection = buildSecretFreeRequestProjection(
    bindingValue,
    credentialConfiguration.value
  );
  const computedPayloadSha256 = sha256Canonical(computedProjection);
  requireCondition(
    approval.derivedBindingMaterialSha256 === computedBindingMaterialSha256 &&
      approvedRequest.sha256 === computedPayloadSha256 &&
      canonicalJson(approvedRequest.projection) ===
        canonicalJson(computedProjection) &&
      approval.evidenceSha256 === authorizationProjection.sha256,
    'CANDIDATE_DERIVATION_MISMATCH'
  );
  const generatedAt = new Date().toISOString();
  const expectedExecutionBinding = {
    authorityReceipt: initialApprovalReceipt.value,
    bindingSha256: binding.sha256,
    bindingMaterialSha256: computedBindingMaterialSha256,
    payloadSha256: computedPayloadSha256,
    credentialConfigurationSha256: credentialConfiguration.sha256,
    pricingEvidenceSha256: pricingEvidence.sha256,
    authorizationProjectionSha256: authorizationProjection.sha256,
    scheduledExecutionAt: action.scheduledExecutionAt,
    expiresAt: approval.expiresAt,
    generatedAt,
  };
  const derived = deriveAction003ExecutionBinding(expectedExecutionBinding);
  assertSecretFreeEvidence(derived.binding, []);
  const recorded = recordAction003ExecutionBindingCreateNew({
    ownerPrivateRoot: input.ownerPrivateRoot,
    outputDirectory: input.outputDirectory,
    binding: derived.binding,
    expected: expectedExecutionBinding,
  });
  requireCondition(
    recorded.executionBindingSha256 === derived.bindingSha256,
    'DERIVED_RECEIPT_READBACK_INVALID'
  );
  return {
    status: 'DERIVED_EXECUTION_BINDING_RECORDED_CREATE_NEW',
    actionId: 'PR12-ACTION-003',
    executionBindingSha256: derived.bindingSha256,
    generatedAt: derived.generatedAt,
    expiresAt: derived.binding.expiresAt,
    authorityScopeConfirmed: true,
    productionContactAuthorized: false,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    remoteContactPerformed: false,
    credentialReadPerformed: false,
  };
}

function parseArguments(argv) {
  const flags = [
    '--candidate-directory',
    '--single-action-approval-receipt',
    '--owner-private-root',
    '--output',
    '--pricing-evidence',
    '--pricing-owner-private-root',
  ];
  requireCondition(argv.length === flags.length * 2, 'USAGE_INVALID');
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    requireCondition(
      flags.includes(flag) &&
        !Object.hasOwn(values, flag) &&
        typeof value === 'string' &&
        value.length > 0,
      'USAGE_INVALID'
    );
    values[flag] = value;
  }
  return {
    ownerPrivateRoot: values['--owner-private-root'],
    candidateDirectory: values['--candidate-directory'],
    initialApprovalReceiptPath: values['--single-action-approval-receipt'],
    pricingEvidencePath: values['--pricing-evidence'],
    pricingOwnerPrivateRoot: values['--pricing-owner-private-root'],
    outputPath: values['--output'],
  };
}

async function main() {
  const result = deriveAction003ExecutionBindingCreateNew(
    parseArguments(process.argv.slice(2))
  );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(error => {
    const code =
      error instanceof Action003DerivedExecutionBindingError ||
      (error && typeof error.code === 'string')
        ? error.code
        : 'ACTION003_DERIVED_EXECUTION_BINDING_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
