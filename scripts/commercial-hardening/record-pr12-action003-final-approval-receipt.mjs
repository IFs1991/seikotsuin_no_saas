import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as approvalReceiptContract from './pr12-action003-approval-receipt-contract.mjs';
import { revalidateAction003ApprovalPacket } from './prepare-pr12-action003-approval-packet.mjs';
import {
  ACTION_ID,
  ACTION002_SEALED_EVIDENCE,
  APPROVED_BASE_COMMIT,
  assertSecretFreeEvidence,
  canonicalJson,
  isForbiddenAmbientCredentialName,
  sha256Text,
  validateOfflineApproval,
  validateOfflineApprovalCandidate,
} from './pr12-source-project-provisioning-contract.mjs';

const OPERATION = 'RECORD_PR12_ACTION003_FINAL_APPROVAL_RECEIPT_LOCAL_ONLY';
const ACTION002_SOURCE_HEAD = ACTION002_SEALED_EVIDENCE.sourceGitCommit;
const BINDING_FILENAME = 'source-project-provisioning-binding-v5.json';
const CREDENTIAL_CONFIGURATION_FILENAME =
  'source-project-provisioning-credential-configuration-v2.json';
const OWNER_APPROVAL_FILENAME =
  'source-project-provisioning-owner-approval-v4.json';
const INITIAL_RECEIPT_FILENAME =
  'source-project-provisioning-initial-approval-receipt-v1.json';
const RECORDED_INITIAL_RECEIPT_DIRECTORY =
  'source-project-provisioning-initial-approval-receipt-v1';
const POPULATED_FINAL_RECEIPT_FILENAME =
  'source-project-provisioning-final-approval-receipt-v1.json';
const RECORDED_RECEIPT_DIRECTORY =
  'source-project-provisioning-final-approval-receipt-v1';
const PREFLIGHT_DESCRIPTOR_FILENAME =
  'source-project-provisioning-action003-preflight-descriptor-v1.json';
const MAXIMUM_JSON_BYTES = 1_048_576;
const MAXIMUM_PRICING_SOURCE_BYTES = 16 * 1_048_576;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const HASH_BOUND_IMPLEMENTATION_PATHS = Object.freeze({
  governanceSha256:
    'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml',
  contractSha256:
    'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs',
  wrapperSha256:
    'scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs',
  organizationIdentityContractSha256:
    'scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs',
  organizationIdentityVerifierSha256:
    'scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs',
});
const RECORDER_RUNTIME_PATHS = Object.freeze([
  ...Object.values(HASH_BOUND_IMPLEMENTATION_PATHS),
  'scripts/commercial-hardening/pr12-action003-approval-receipt-contract.mjs',
  'scripts/commercial-hardening/pr12-windows-owner-private-acl.ps1',
  'scripts/commercial-hardening/build-pr12-action003-approval-packet.mjs',
  'scripts/commercial-hardening/pr12-windows-dpapi-credential-channel.mjs',
  'scripts/commercial-hardening/prepare-pr12-action003-approval-packet.mjs',
  'scripts/commercial-hardening/record-pr12-action003-final-approval-receipt.mjs',
]);

export class Action003FinalReceiptRecorderError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Action003FinalReceiptRecorderError';
    this.code = code;
  }
}

function fail(code) {
  throw new Action003FinalReceiptRecorderError(code);
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

function normalizedPath(value) {
  const normalized = path.resolve(value).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function pathFingerprint(value) {
  return sha256Text(
    path.win32.resolve(value).replaceAll('\\', '/').toLowerCase()
  );
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function requireAbsolutePath(value, code) {
  requireCondition(typeof value === 'string' && path.isAbsolute(value), code);
  return path.resolve(value);
}

function requireNoReparseComponents(pathnameInput, code) {
  const pathname = path.resolve(pathnameInput);
  const root = path.parse(pathname).root;
  let current = root;
  try {
    for (const component of pathname.slice(root.length).split(path.sep)) {
      if (component.length === 0) continue;
      current = path.join(current, component);
      const status = lstatSync(current);
      requireCondition(!status.isSymbolicLink(), code);
    }
  } catch (error) {
    if (error instanceof Action003FinalReceiptRecorderError) throw error;
    fail(code);
  }
}

function stableDirectorySnapshot(directoryInput, code) {
  const directory = requireAbsolutePath(directoryInput, code);
  let before;
  let after;
  let resolvedBefore;
  let resolvedAfter;
  let entries;
  try {
    requireNoReparseComponents(directory, code);
    before = statSync(directory);
    resolvedBefore = realpathSync.native(directory);
    entries = readdirSync(directory).sort();
    after = statSync(directory);
    resolvedAfter = realpathSync.native(directory);
  } catch (error) {
    if (error instanceof Action003FinalReceiptRecorderError) throw error;
    fail(code);
  }
  requireCondition(
    before.isDirectory() &&
      after.isDirectory() &&
      String(before.dev) === String(after.dev) &&
      String(before.ino) === String(after.ino) &&
      before.mtimeMs === after.mtimeMs &&
      normalizedPath(resolvedBefore) === normalizedPath(directory) &&
      normalizedPath(resolvedAfter) === normalizedPath(directory),
    code
  );
  return {
    pathSha256: pathFingerprint(directory),
    resolvedPathSha256: pathFingerprint(resolvedAfter),
    device: String(after.dev),
    inode: String(after.ino),
    modifiedAtMilliseconds: after.mtimeMs,
    entries,
  };
}

function stableFileSnapshot(
  filenameInput,
  maximumBytes,
  canonicalRequired,
  code
) {
  const filename = requireAbsolutePath(filenameInput, code);
  let descriptor;
  try {
    requireNoReparseComponents(filename, code);
    const resolvedBefore = realpathSync.native(filename);
    descriptor = openSync(filename, 'r');
    const before = fstatSync(descriptor);
    requireCondition(
      before.isFile() && before.size >= 0 && before.size <= maximumBytes,
      code
    );
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const current = statSync(filename);
    const resolvedAfter = realpathSync.native(filename);
    requireCondition(
      after.isFile() &&
        current.isFile() &&
        String(before.dev) === String(after.dev) &&
        String(before.ino) === String(after.ino) &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        String(current.dev) === String(after.dev) &&
        String(current.ino) === String(after.ino) &&
        bytes.length === after.size &&
        normalizedPath(resolvedBefore) === normalizedPath(filename) &&
        normalizedPath(resolvedAfter) === normalizedPath(filename),
      `${code}_CHANGED`
    );
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    let value = null;
    if (canonicalRequired) {
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        value = JSON.parse(text);
      } catch {
        fail(code);
      }
      requireCondition(
        isRecord(value) && text === `${canonicalJson(value)}\n`,
        code
      );
    }
    return {
      value,
      sha256,
      identity: {
        pathSha256: pathFingerprint(filename),
        resolvedPathSha256: pathFingerprint(resolvedAfter),
        device: String(after.dev),
        inode: String(after.ino),
        size: after.size,
        modifiedAtMilliseconds: after.mtimeMs,
        contentSha256: sha256,
      },
    };
  } catch (error) {
    if (error instanceof Action003FinalReceiptRecorderError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function requireSameSnapshot(actual, expected, code) {
  requireCondition(canonicalJson(actual) === canonicalJson(expected), code);
}

function requireSafePricingArtifactPath(value) {
  requireCondition(
    typeof value === 'string' &&
      value.length > 0 &&
      value === value.trim() &&
      !path.isAbsolute(value) &&
      !value.includes('\\') &&
      !value.split('/').includes('..'),
    'PRICING_SOURCE_PATH_INVALID'
  );
  return value;
}

function capturePricingSources(pricingEvidence, pricingEvidencePath) {
  const pricing = requireRecord(pricingEvidence, 'PRICING_EVIDENCE_INVALID');
  requireCondition(
    Array.isArray(pricing.officialSources),
    'PRICING_EVIDENCE_INVALID'
  );
  const pricingDirectory = path.dirname(pricingEvidencePath);
  return pricing.officialSources.map((sourceInput, index) => {
    const source = requireRecord(sourceInput, 'PRICING_EVIDENCE_INVALID');
    const relativePath = requireSafePricingArtifactPath(source.artifactPath);
    const filename = path.resolve(pricingDirectory, ...relativePath.split('/'));
    requireCondition(
      isWithin(pricingDirectory, filename),
      'PRICING_SOURCE_PATH_INVALID'
    );
    const snapshot = stableFileSnapshot(
      filename,
      MAXIMUM_PRICING_SOURCE_BYTES,
      false,
      'PRICING_SOURCE_INVALID'
    );
    requireCondition(
      snapshot.sha256 ===
        requireSha256(source.artifactSha256, 'PRICING_SOURCE_INVALID'),
      'PRICING_SOURCE_HASH_MISMATCH'
    );
    return {
      index,
      relativePath,
      snapshot,
    };
  });
}

function validateInputPaths(inputValue, allowTemporaryOwnerRoot = false) {
  const input = requireExactKeys(
    inputValue,
    [
      'ownerPrivateRoot',
      'candidateDirectory',
      'preflightDescriptorPath',
      'initialApprovalReceiptPath',
      'pricingEvidencePath',
      'populatedFinalApprovalReceiptPath',
    ],
    'RECORDER_INPUT_INVALID'
  );
  const ownerPrivateRoot = requireAbsolutePath(
    input.ownerPrivateRoot,
    'OWNER_PRIVATE_ROOT_INVALID'
  );
  const candidateDirectory = requireAbsolutePath(
    input.candidateDirectory,
    'CANDIDATE_DIRECTORY_INVALID'
  );
  const preflightDescriptorPath = requireAbsolutePath(
    input.preflightDescriptorPath,
    'PREFLIGHT_DESCRIPTOR_PATH_INVALID'
  );
  const initialApprovalReceiptPath = requireAbsolutePath(
    input.initialApprovalReceiptPath,
    'INITIAL_APPROVAL_RECEIPT_PATH_INVALID'
  );
  const pricingEvidencePath = requireAbsolutePath(
    input.pricingEvidencePath,
    'PRICING_EVIDENCE_PATH_INVALID'
  );
  const populatedFinalApprovalReceiptPath = requireAbsolutePath(
    input.populatedFinalApprovalReceiptPath,
    'FINAL_APPROVAL_RECEIPT_PATH_INVALID'
  );
  const initialApprovalReceiptDirectory = path.dirname(
    initialApprovalReceiptPath
  );
  const outputDirectory = path.join(
    ownerPrivateRoot,
    RECORDED_RECEIPT_DIRECTORY
  );
  const temporaryRoots = [os.tmpdir(), process.env.TEMP, process.env.TMP]
    .filter(value => typeof value === 'string')
    .map(value => path.resolve(value));
  requireCondition(
    existsSync(ownerPrivateRoot) &&
      path.dirname(candidateDirectory) === ownerPrivateRoot &&
      path.dirname(initialApprovalReceiptDirectory) === ownerPrivateRoot &&
      path.basename(initialApprovalReceiptDirectory) ===
        RECORDED_INITIAL_RECEIPT_DIRECTORY &&
      isWithin(ownerPrivateRoot, initialApprovalReceiptPath) &&
      isWithin(ownerPrivateRoot, populatedFinalApprovalReceiptPath) &&
      !isWithin(REPOSITORY_ROOT, ownerPrivateRoot) &&
      (allowTemporaryOwnerRoot ||
        temporaryRoots.every(root => !isWithin(root, ownerPrivateRoot))) &&
      path.basename(initialApprovalReceiptPath) === INITIAL_RECEIPT_FILENAME &&
      path.basename(preflightDescriptorPath) ===
        PREFLIGHT_DESCRIPTOR_FILENAME &&
      isWithin(ownerPrivateRoot, preflightDescriptorPath) &&
      !isWithin(candidateDirectory, preflightDescriptorPath) &&
      path.basename(populatedFinalApprovalReceiptPath) ===
        POPULATED_FINAL_RECEIPT_FILENAME &&
      !isWithin(candidateDirectory, initialApprovalReceiptPath) &&
      !isWithin(candidateDirectory, populatedFinalApprovalReceiptPath) &&
      !isWithin(REPOSITORY_ROOT, pricingEvidencePath) &&
      !isWithin(ownerPrivateRoot, pricingEvidencePath) &&
      !isWithin(path.dirname(pricingEvidencePath), ownerPrivateRoot) &&
      normalizedPath(initialApprovalReceiptPath) !==
        normalizedPath(populatedFinalApprovalReceiptPath) &&
      normalizedPath(preflightDescriptorPath) !==
        normalizedPath(populatedFinalApprovalReceiptPath) &&
      normalizedPath(pricingEvidencePath) !==
        normalizedPath(populatedFinalApprovalReceiptPath) &&
      !existsSync(outputDirectory),
    'RECORDER_PATH_TOPOLOGY_INVALID'
  );
  return {
    ownerPrivateRoot,
    candidateDirectory,
    preflightDescriptorPath,
    initialApprovalReceiptDirectory,
    initialApprovalReceiptPath,
    pricingEvidencePath,
    populatedFinalApprovalReceiptPath,
    outputDirectory,
  };
}

function captureInputBundle(paths) {
  const ownerRootSnapshot = stableDirectorySnapshot(
    paths.ownerPrivateRoot,
    'OWNER_PRIVATE_ROOT_INVALID'
  );
  const candidateDirectorySnapshot = stableDirectorySnapshot(
    paths.candidateDirectory,
    'CANDIDATE_DIRECTORY_INVALID'
  );
  requireCondition(
    canonicalJson(candidateDirectorySnapshot.entries) ===
      canonicalJson(
        [
          BINDING_FILENAME,
          CREDENTIAL_CONFIGURATION_FILENAME,
          OWNER_APPROVAL_FILENAME,
        ].sort()
      ),
    'CANDIDATE_FILE_SET_INVALID'
  );
  const initialReceiptDirectorySnapshot = stableDirectorySnapshot(
    paths.initialApprovalReceiptDirectory,
    'INITIAL_APPROVAL_RECEIPT_DIRECTORY_INVALID'
  );
  const preflightDescriptor = stableFileSnapshot(
    paths.preflightDescriptorPath,
    MAXIMUM_JSON_BYTES,
    true,
    'PREFLIGHT_DESCRIPTOR_NOT_CANONICAL'
  );
  const preflightDescriptorValue = requireRecord(
    preflightDescriptor.value,
    'PREFLIGHT_DESCRIPTOR_INVALID'
  );
  requireCondition(
    preflightDescriptorValue.operation ===
      'PREPARE_PR12_ACTION003_APPROVAL_PACKET_LOCAL_ONLY' &&
      typeof preflightDescriptorValue.outputDirectoryPath === 'string' &&
      path.isAbsolute(preflightDescriptorValue.outputDirectoryPath) &&
      normalizedPath(preflightDescriptorValue.outputDirectoryPath) ===
        normalizedPath(paths.candidateDirectory),
    'PREFLIGHT_DESCRIPTOR_CANDIDATE_MISMATCH'
  );
  requireCondition(
    canonicalJson(initialReceiptDirectorySnapshot.entries) ===
      canonicalJson([INITIAL_RECEIPT_FILENAME]),
    'INITIAL_APPROVAL_RECEIPT_FILE_SET_INVALID'
  );
  const binding = stableFileSnapshot(
    path.join(paths.candidateDirectory, BINDING_FILENAME),
    MAXIMUM_JSON_BYTES,
    true,
    'CANDIDATE_BINDING_NOT_CANONICAL'
  );
  const credentialConfiguration = stableFileSnapshot(
    path.join(paths.candidateDirectory, CREDENTIAL_CONFIGURATION_FILENAME),
    MAXIMUM_JSON_BYTES,
    true,
    'CANDIDATE_CREDENTIAL_CONFIGURATION_NOT_CANONICAL'
  );
  const ownerApproval = stableFileSnapshot(
    path.join(paths.candidateDirectory, OWNER_APPROVAL_FILENAME),
    MAXIMUM_JSON_BYTES,
    true,
    'CANDIDATE_OWNER_APPROVAL_NOT_CANONICAL'
  );
  const initialReceipt = stableFileSnapshot(
    paths.initialApprovalReceiptPath,
    MAXIMUM_JSON_BYTES,
    true,
    'INITIAL_APPROVAL_RECEIPT_NOT_CANONICAL'
  );
  const pricingEvidence = stableFileSnapshot(
    paths.pricingEvidencePath,
    MAXIMUM_JSON_BYTES,
    true,
    'PRICING_EVIDENCE_NOT_CANONICAL'
  );
  const populatedFinalReceipt = stableFileSnapshot(
    paths.populatedFinalApprovalReceiptPath,
    MAXIMUM_JSON_BYTES,
    true,
    'FINAL_APPROVAL_RECEIPT_NOT_CANONICAL'
  );
  const pricingSources = capturePricingSources(
    pricingEvidence.value,
    paths.pricingEvidencePath
  );
  return {
    ownerRootSnapshot,
    candidateDirectorySnapshot,
    initialReceiptDirectorySnapshot,
    preflightDescriptor,
    binding,
    credentialConfiguration,
    ownerApproval,
    initialReceipt,
    pricingEvidence,
    populatedFinalReceipt,
    pricingSources,
  };
}

function captureComparableBundle(bundle) {
  return {
    ownerRootSnapshot: bundle.ownerRootSnapshot,
    candidateDirectorySnapshot: bundle.candidateDirectorySnapshot,
    initialReceiptDirectorySnapshot: bundle.initialReceiptDirectorySnapshot,
    preflightDescriptor: {
      sha256: bundle.preflightDescriptor.sha256,
      identity: bundle.preflightDescriptor.identity,
    },
    binding: {
      sha256: bundle.binding.sha256,
      identity: bundle.binding.identity,
    },
    credentialConfiguration: {
      sha256: bundle.credentialConfiguration.sha256,
      identity: bundle.credentialConfiguration.identity,
    },
    ownerApproval: {
      sha256: bundle.ownerApproval.sha256,
      identity: bundle.ownerApproval.identity,
    },
    initialReceipt: {
      sha256: bundle.initialReceipt.sha256,
      identity: bundle.initialReceipt.identity,
    },
    pricingEvidence: {
      sha256: bundle.pricingEvidence.sha256,
      identity: bundle.pricingEvidence.identity,
    },
    populatedFinalReceipt: {
      sha256: bundle.populatedFinalReceipt.sha256,
      identity: bundle.populatedFinalReceipt.identity,
    },
    pricingSources: bundle.pricingSources.map(source => ({
      index: source.index,
      relativePath: source.relativePath,
      sha256: source.snapshot.sha256,
      identity: source.snapshot.identity,
    })),
  };
}

function minimalChildEnvironment() {
  const allowed = [
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'PATH',
    'Path',
    'PATHEXT',
    'TEMP',
    'TMP',
  ];
  return {
    ...Object.fromEntries(
      allowed
        .filter(name => typeof process.env[name] === 'string')
        .map(name => [name, process.env[name]])
    ),
    GIT_OPTIONAL_LOCKS: '0',
  };
}

function runGit(args, acceptedStatuses = [0]) {
  const result = spawnSync(
    'git',
    [
      '--no-optional-locks',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.untrackedCache=false',
      '-c',
      'core.preloadindex=false',
      '-C',
      REPOSITORY_ROOT,
      ...args,
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: minimalChildEnvironment(),
      maxBuffer: 1_048_576,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
      windowsHide: true,
    }
  );
  requireCondition(
    result.error === undefined &&
      result.signal === null &&
      acceptedStatuses.includes(result.status) &&
      typeof result.stdout === 'string' &&
      typeof result.stderr === 'string' &&
      result.stderr.trim().length === 0,
    'GIT_STATE_INSPECTION_FAILED'
  );
  return { status: result.status, stdout: result.stdout.trim() };
}

function inspectRepositoryState(boundHeadInput) {
  const boundHead = requireGitSha(boundHeadInput, 'GIT_HEAD_INVALID');
  const topLevel = runGit(['rev-parse', '--show-toplevel']).stdout;
  requireCondition(
    normalizedPath(topLevel) === normalizedPath(REPOSITORY_ROOT),
    'EXECUTING_REPOSITORY_ROOT_MISMATCH'
  );
  const currentHead = runGit(['rev-parse', 'HEAD']).stdout;
  requireCondition(currentHead === boundHead, 'GIT_HEAD_MISMATCH');
  const currentBaseCommit = runGit([
    'merge-base',
    currentHead,
    'origin/main',
  ]).stdout;
  requireCondition(
    currentBaseCommit === APPROVED_BASE_COMMIT,
    'GIT_BASE_INVALID'
  );
  const status = runGit([
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]).stdout;
  requireCondition(status.length === 0, 'WORKTREE_NOT_CLEAN');
  const indexFlags = runGit(['ls-files', '-v']).stdout;
  requireCondition(
    indexFlags.length > 0 &&
      indexFlags.split(/\r?\n/u).every(line => /^H /u.test(line)),
    'GIT_INDEX_FLAG_INVALID'
  );
  const ancestor = runGit(
    ['merge-base', '--is-ancestor', ACTION002_SOURCE_HEAD, currentHead],
    [0, 1]
  );
  requireCondition(ancestor.status === 0, 'ACTION002_SOURCE_HEAD_NOT_ANCESTOR');
  const trackedSnapshots = {};
  for (const relativePath of RECORDER_RUNTIME_PATHS) {
    const tracked = runGit([
      'ls-files',
      '--error-unmatch',
      '--',
      relativePath,
    ]).stdout;
    requireCondition(tracked === relativePath, 'TRACKED_INPUT_NOT_IN_HEAD');
    const filename = path.join(REPOSITORY_ROOT, ...relativePath.split('/'));
    const snapshot = stableFileSnapshot(
      filename,
      MAXIMUM_PRICING_SOURCE_BYTES,
      false,
      'TRACKED_IMPLEMENTATION_INVALID'
    );
    const headBlob = runGit([
      'rev-parse',
      `${currentHead}:${relativePath}`,
    ]).stdout;
    const worktreeBlob = runGit([
      'hash-object',
      '--no-filters',
      '--',
      filename,
    ]).stdout;
    requireCondition(
      headBlob === worktreeBlob,
      'TRACKED_INPUT_WORKTREE_HEAD_MISMATCH'
    );
    trackedSnapshots[relativePath] = {
      sha256: snapshot.sha256,
      identity: snapshot.identity,
      gitBlob: headBlob,
    };
  }
  const implementationHashes = Object.fromEntries(
    Object.entries(HASH_BOUND_IMPLEMENTATION_PATHS).map(
      ([key, relativePath]) => [key, trackedSnapshots[relativePath].sha256]
    )
  );
  return {
    currentHead,
    currentBaseCommit,
    worktreeClean: true,
    organizationIdentitySourceGitCommitIsAncestor: true,
    implementationHashes,
    trackedSnapshots,
  };
}

function currentAmbientCredentialNames() {
  return Object.keys(process.env)
    .filter(isForbiddenAmbientCredentialName)
    .sort();
}

function defaultInspectAclSet(paths) {
  requireCondition(
    typeof approvalReceiptContract.inspectOwnerPrivatePathAcl === 'function',
    'OWNER_PRIVATE_ACL_INSPECTOR_UNAVAILABLE'
  );
  const targets = [
    { targetPath: paths.ownerPrivateRoot, kind: 'DIRECTORY' },
    { targetPath: paths.candidateDirectory, kind: 'DIRECTORY' },
    {
      targetPath: path.join(paths.candidateDirectory, BINDING_FILENAME),
      kind: 'FILE',
    },
    {
      targetPath: path.join(
        paths.candidateDirectory,
        CREDENTIAL_CONFIGURATION_FILENAME
      ),
      kind: 'FILE',
    },
    {
      targetPath: path.join(paths.candidateDirectory, OWNER_APPROVAL_FILENAME),
      kind: 'FILE',
    },
    {
      targetPath: paths.initialApprovalReceiptDirectory,
      kind: 'DIRECTORY',
    },
    { targetPath: paths.initialApprovalReceiptPath, kind: 'FILE' },
    { targetPath: paths.preflightDescriptorPath, kind: 'FILE' },
    {
      targetPath: paths.populatedFinalApprovalReceiptPath,
      kind: 'FILE',
    },
  ];
  return targets.map(target =>
    approvalReceiptContract.inspectOwnerPrivatePathAcl({
      ownerPrivateRoot: paths.ownerPrivateRoot,
      ...target,
    })
  );
}

function defaultInspectInitialAclSet(paths) {
  requireCondition(
    typeof approvalReceiptContract.inspectOwnerPrivatePathAcl === 'function',
    'OWNER_PRIVATE_ACL_INSPECTOR_UNAVAILABLE'
  );
  return [
    { targetPath: paths.ownerPrivateRoot, kind: 'DIRECTORY' },
    {
      targetPath: paths.populatedInitialApprovalReceiptPath,
      kind: 'FILE',
    },
  ].map(target =>
    approvalReceiptContract.inspectOwnerPrivatePathAcl({
      ownerPrivateRoot: paths.ownerPrivateRoot,
      ...target,
    })
  );
}

function buildDefaultRuntime() {
  return {
    now: () => Date.now(),
    inspectRepositoryState,
    ambientCredentialNames: currentAmbientCredentialNames,
    inspectAclSet: defaultInspectAclSet,
    inspectInitialAclSet: defaultInspectInitialAclSet,
    validateCandidate: validateOfflineApprovalCandidate,
    validateApproval: validateOfflineApproval,
    validateInitialReceipt:
      approvalReceiptContract.validateInitialAction003ApprovalReceipt,
    validateFinalReceipt:
      approvalReceiptContract.validateFinalAction003ApprovalReceipt,
    revalidateApprovalPacket: revalidateAction003ApprovalPacket,
    recordReceipt:
      approvalReceiptContract.recordFinalAction003ApprovalReceiptCreateNew,
    verifyReceipt:
      approvalReceiptContract.verifyFinalAction003ApprovalReceiptStable,
    recordInitialReceipt:
      approvalReceiptContract.recordInitialAction003ApprovalReceiptCreateNew,
    verifyInitialReceipt:
      approvalReceiptContract.verifyInitialAction003ApprovalReceiptStable,
  };
}

function requireRepositoryState(value, boundHead) {
  const state = requireExactKeys(
    value,
    [
      'currentHead',
      'currentBaseCommit',
      'worktreeClean',
      'organizationIdentitySourceGitCommitIsAncestor',
      'implementationHashes',
      'trackedSnapshots',
    ],
    'REPOSITORY_STATE_INVALID'
  );
  requireCondition(
    state.currentHead === boundHead &&
      state.currentBaseCommit === APPROVED_BASE_COMMIT &&
      state.worktreeClean === true &&
      state.organizationIdentitySourceGitCommitIsAncestor === true,
    'REPOSITORY_STATE_INVALID'
  );
  const hashes = requireExactKeys(
    state.implementationHashes,
    Object.keys(HASH_BOUND_IMPLEMENTATION_PATHS),
    'IMPLEMENTATION_HASH_INVALID'
  );
  for (const value of Object.values(hashes)) {
    requireSha256(value, 'IMPLEMENTATION_HASH_INVALID');
  }
  requireRecord(state.trackedSnapshots, 'REPOSITORY_STATE_INVALID');
  return state;
}

function buildValidationContext(
  bundle,
  repositoryState,
  nowIso,
  ambientCredentialNames
) {
  const binding = requireRecord(
    bundle.binding.value,
    'CANDIDATE_BINDING_INVALID'
  );
  const target = requireRecord(binding.target, 'CANDIDATE_BINDING_INVALID');
  const duplicatePolicy = requireRecord(
    binding.duplicateAndFailurePolicy,
    'CANDIDATE_BINDING_INVALID'
  );
  const evidenceContract = requireRecord(
    binding.evidenceContract,
    'CANDIDATE_BINDING_INVALID'
  );
  return {
    currentHead: repositoryState.currentHead,
    currentBaseCommit: repositoryState.currentBaseCommit,
    worktreeClean: repositoryState.worktreeClean,
    nodeVersion: process.version,
    nodeExecArgv: process.execArgv,
    now: nowIso,
    ...repositoryState.implementationHashes,
    credentialConfigurationSha256: bundle.credentialConfiguration.sha256,
    approvalEvidenceSha256: bundle.ownerApproval.sha256,
    pricingEvidenceSha256: bundle.pricingEvidence.sha256,
    approvalEvidence: bundle.ownerApproval.value,
    initialApprovalReceipt: bundle.initialReceipt.value,
    initialApprovalReceiptSha256: bundle.initialReceipt.sha256,
    pricingEvidence: bundle.pricingEvidence.value,
    organizationIdentityEvidence: binding.organizationIdentityEvidence,
    organizationIdentitySourceGitCommitIsAncestor:
      repositoryState.organizationIdentitySourceGitCommitIsAncestor,
    ambientCredentialNames,
    priorActionState: null,
    approvalStage: 'PRE_CLAIM',
    actionJournalDirectoryPathSha256:
      duplicatePolicy.actionJournalDirectoryPathSha256,
    actionJournalDirectoryFingerprint:
      duplicatePolicy.actionJournalDirectoryFingerprint,
    evidenceParentDirectoryPathSha256:
      evidenceContract.evidenceParentDirectoryPathSha256,
    evidenceParentDirectoryFingerprint:
      evidenceContract.evidenceParentDirectoryFingerprint,
    credentialConfigurationSourceIdentity:
      bundle.credentialConfiguration.identity,
    pricingEvidenceSourceIdentity: bundle.pricingEvidence.identity,
    boundHead: target.gitCommit,
  };
}

function contextWithoutRecorderOnlyField(context) {
  const { boundHead: _boundHead, ...contractContext } = context;
  return contractContext;
}

function validateFrozenCandidate(bundle, repositoryState, nowIso, runtime) {
  const initial = runtime.validateInitialReceipt(bundle.initialReceipt.value);
  requireCondition(
    initial.receiptSha256 === bundle.initialReceipt.sha256,
    'INITIAL_APPROVAL_RECEIPT_HASH_MISMATCH'
  );
  const context = buildValidationContext(
    bundle,
    repositoryState,
    nowIso,
    runtime.ambientCredentialNames()
  );
  requireCondition(
    Array.isArray(context.ambientCredentialNames) &&
      context.ambientCredentialNames.length === 0,
    'AMBIENT_CREDENTIAL_FORBIDDEN'
  );
  const candidate = runtime.validateCandidate(
    bundle.binding.value,
    bundle.credentialConfiguration.value,
    contextWithoutRecorderOnlyField(context)
  );
  requireCondition(
    candidate.remoteContactPerformed === false &&
      candidate.credentialReadPerformed === false,
    'OFFLINE_CANDIDATE_VALIDATION_INVALID'
  );
  const binding = bundle.binding.value;
  const expected = {
    initialApprovalReceipt: initial.receipt,
    bindingSha256: bundle.binding.sha256,
    bindingMaterialSha256: requireSha256(
      candidate.bindingMaterialSha256,
      'BINDING_MATERIAL_HASH_INVALID'
    ),
    payloadSha256: requireSha256(
      candidate.payloadSha256,
      'PAYLOAD_HASH_INVALID'
    ),
    credentialConfigurationSha256: bundle.credentialConfiguration.sha256,
    pricingEvidenceSha256: bundle.pricingEvidence.sha256,
    ownerApprovalSha256: bundle.ownerApproval.sha256,
    scheduledExecutionAt: requireRecord(
      binding.provisioningAction,
      'CANDIDATE_BINDING_INVALID'
    ).scheduledExecutionAt,
    expiresAt: requireRecord(binding.approval, 'CANDIDATE_BINDING_INVALID')
      .expiresAt,
  };
  const finalReceipt = runtime.validateFinalReceipt(
    bundle.populatedFinalReceipt.value,
    expected,
    nowIso
  );
  requireCondition(
    finalReceipt.receiptSha256 === bundle.populatedFinalReceipt.sha256 &&
      finalReceipt.remoteContactPerformed === false &&
      finalReceipt.credentialReadPerformed === false,
    'FINAL_APPROVAL_RECEIPT_VALIDATION_INVALID'
  );
  const finalContext = {
    ...contextWithoutRecorderOnlyField(context),
    bindingSha256: bundle.binding.sha256,
    finalApprovalReceipt: finalReceipt.receipt,
    finalApprovalReceiptSha256: finalReceipt.receiptSha256,
  };
  const approval = runtime.validateApproval(
    bundle.binding.value,
    bundle.credentialConfiguration.value,
    finalContext
  );
  requireCondition(
    approval.remoteContactPerformed === false &&
      approval.credentialReadPerformed === false &&
      approval.sourceProjectProvisioningAuthorized === true &&
      approval.finalApprovalReceiptSha256 === finalReceipt.receiptSha256,
    'OFFLINE_FINAL_APPROVAL_VALIDATION_INVALID'
  );
  return { initial, candidate, expected, finalReceipt, approval };
}

function revalidateFrozenInputs(paths, expectedBundle) {
  const current = captureInputBundle(paths);
  requireSameSnapshot(
    captureComparableBundle(current),
    captureComparableBundle(expectedBundle),
    'APPROVAL_INPUT_IDENTITY_OR_CONTENT_CHANGED'
  );
  return current;
}

function recordWithRuntime(inputValue, runtimeOverrides) {
  requireCondition(isRecord(runtimeOverrides), 'RUNTIME_OVERRIDE_INVALID');
  const testRuntimeInjected = Object.keys(runtimeOverrides).length > 0;
  if (testRuntimeInjected) {
    requireCondition(
      process.env.NODE_ENV === 'test' &&
        typeof process.env.JEST_WORKER_ID === 'string' &&
        /^\d+$/u.test(process.env.JEST_WORKER_ID),
      'RUNTIME_OVERRIDE_FORBIDDEN'
    );
  }
  const runtime = { ...buildDefaultRuntime(), ...runtimeOverrides };
  for (const key of [
    'now',
    'inspectRepositoryState',
    'ambientCredentialNames',
    'inspectAclSet',
    'validateCandidate',
    'validateApproval',
    'validateInitialReceipt',
    'validateFinalReceipt',
    'revalidateApprovalPacket',
    'recordReceipt',
    'verifyReceipt',
  ]) {
    requireCondition(typeof runtime[key] === 'function', 'RUNTIME_INVALID');
  }
  const paths = validateInputPaths(inputValue, testRuntimeInjected);
  const bundle = captureInputBundle(paths);
  const binding = requireRecord(
    bundle.binding.value,
    'CANDIDATE_BINDING_INVALID'
  );
  const target = requireRecord(binding.target, 'CANDIDATE_BINDING_INVALID');
  const boundHead = requireGitSha(
    target.gitCommit,
    'CANDIDATE_BINDING_INVALID'
  );
  const repositoryState = requireRepositoryState(
    runtime.inspectRepositoryState(boundHead),
    boundHead
  );
  const ambientCredentialNames = runtime.ambientCredentialNames();
  requireCondition(
    Array.isArray(ambientCredentialNames) &&
      ambientCredentialNames.length === 0,
    'AMBIENT_CREDENTIAL_FORBIDDEN'
  );
  const startedAt = runtime.now();
  requireCondition(Number.isFinite(startedAt), 'RUNTIME_CLOCK_INVALID');
  const startedAtIso = new Date(startedAt).toISOString();
  validateFrozenCandidate(bundle, repositoryState, startedAtIso, {
    ...runtime,
    ambientCredentialNames: () => ambientCredentialNames,
  });
  const externalStateProof = runtime.revalidateApprovalPacket(
    paths.preflightDescriptorPath
  );
  requireCondition(
    isRecord(externalStateProof) &&
      externalStateProof.status === 'REVALIDATED' &&
      externalStateProof.remoteContactPerformed === false &&
      externalStateProof.credentialPlaintextReadPerformed === false,
    'ACTION003_EXTERNAL_STATE_REVALIDATION_FAILED'
  );
  const aclProof = runtime.inspectAclSet(paths);
  requireCondition(Array.isArray(aclProof), 'ACL_BOUNDARY_INVALID');

  const currentBundle = revalidateFrozenInputs(paths, bundle);
  const currentRepositoryState = requireRepositoryState(
    runtime.inspectRepositoryState(boundHead),
    boundHead
  );
  requireSameSnapshot(
    currentRepositoryState,
    repositoryState,
    'REPOSITORY_STATE_CHANGED'
  );
  const beforeCreateNew = runtime.now();
  requireCondition(
    Number.isFinite(beforeCreateNew) &&
      beforeCreateNew >= startedAt &&
      beforeCreateNew - startedAt <= 60_000,
    'RUNTIME_CLOCK_INVALID'
  );
  const beforeCreateNewIso = new Date(beforeCreateNew).toISOString();
  const finalValidation = validateFrozenCandidate(
    currentBundle,
    currentRepositoryState,
    beforeCreateNewIso,
    {
      ...runtime,
      ambientCredentialNames: () => ambientCredentialNames,
    }
  );
  const finalExternalStateProof = runtime.revalidateApprovalPacket(
    paths.preflightDescriptorPath
  );
  requireSameSnapshot(
    finalExternalStateProof,
    externalStateProof,
    'ACTION003_EXTERNAL_STATE_CHANGED'
  );
  const finalAclProof = runtime.inspectAclSet(paths);
  requireSameSnapshot(finalAclProof, aclProof, 'ACL_BOUNDARY_CHANGED');
  const immediatelyBeforeCreateNew = revalidateFrozenInputs(
    paths,
    currentBundle
  );
  requireSameSnapshot(
    requireRepositoryState(
      runtime.inspectRepositoryState(boundHead),
      boundHead
    ),
    repositoryState,
    'REPOSITORY_STATE_CHANGED'
  );
  requireSameSnapshot(
    runtime.revalidateApprovalPacket(paths.preflightDescriptorPath),
    externalStateProof,
    'ACTION003_EXTERNAL_STATE_CHANGED'
  );

  const recorded = runtime.recordReceipt({
    ownerPrivateRoot: paths.ownerPrivateRoot,
    outputDirectory: paths.outputDirectory,
    receipt: immediatelyBeforeCreateNew.populatedFinalReceipt.value,
    expected: finalValidation.expected,
  });
  const recordedReceiptPath = path.join(
    paths.outputDirectory,
    POPULATED_FINAL_RECEIPT_FILENAME
  );
  const verified = runtime.verifyReceipt({
    ownerPrivateRoot: paths.ownerPrivateRoot,
    receiptPath: recordedReceiptPath,
    expectedReceipt: immediatelyBeforeCreateNew.populatedFinalReceipt.value,
    expectedOwnerPrivateRootIdentity: recorded.ownerPrivateRootIdentity,
    expectedOwnerPrivateRootAcl: recorded.ownerPrivateRootAcl,
    expectedFileIdentity: recorded.fileIdentity,
    expectedFileAcl: recorded.fileAcl,
    expectedDirectoryIdentity: recorded.directoryIdentity,
    expectedDirectoryAcl: recorded.directoryAcl,
    ownerPrivateRoot: paths.ownerPrivateRoot,
    expectedOwnerPrivateRootIdentity: recorded.ownerPrivateRootIdentity,
    expectedOwnerPrivateRootAcl: recorded.ownerPrivateRootAcl,
  });
  requireCondition(
    recorded.status === 'RECORDED' &&
      recorded.fileCount === 1 &&
      recorded.receiptSha256 === finalValidation.finalReceipt.receiptSha256 &&
      recorded.remoteContactPerformed === false &&
      recorded.credentialReadPerformed === false &&
      verified.status === 'VERIFIED_STABLE' &&
      verified.receiptSha256 === recorded.receiptSha256 &&
      verified.remoteContactPerformed === false &&
      verified.credentialReadPerformed === false,
    'RECORDED_RECEIPT_VERIFICATION_INVALID'
  );
  const result = {
    status: 'RECORDED_AND_VERIFIED',
    operation: OPERATION,
    actionId: ACTION_ID,
    gitHead: repositoryState.currentHead,
    initialApprovalReceiptSha256: finalValidation.initial.receiptSha256,
    bindingSha256: bundle.binding.sha256,
    bindingMaterialSha256: finalValidation.candidate.bindingMaterialSha256,
    payloadSha256: finalValidation.candidate.payloadSha256,
    credentialConfigurationSha256: bundle.credentialConfiguration.sha256,
    pricingEvidenceSha256: bundle.pricingEvidence.sha256,
    ownerApprovalSha256: bundle.ownerApproval.sha256,
    finalApprovalReceiptSha256: recorded.receiptSha256,
    finalApprovalAcceptedAt: finalValidation.finalReceipt.acceptedAt,
    scheduledExecutionAt: finalValidation.expected.scheduledExecutionAt,
    expiresAt: finalValidation.expected.expiresAt,
    recordedReceiptPathSha256: verified.receiptPathSha256,
    sourceProjectProvisioningAuthorized: true,
    productionContactAuthorized: false,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    remoteContactPerformed: false,
    credentialPlaintextReadPerformed: false,
  };
  assertSecretFreeEvidence(result, []);
  return result;
}

export function recordAction003FinalApprovalReceiptForTest(
  inputValue,
  runtimeOverrides
) {
  return recordWithRuntime(inputValue, runtimeOverrides);
}

export function recordAction003FinalApprovalReceipt(inputValue) {
  return recordWithRuntime(inputValue, {});
}

function validateInitialRecorderPaths(
  inputValue,
  allowTemporaryOwnerRoot = false
) {
  const input = requireExactKeys(
    inputValue,
    ['ownerPrivateRoot', 'populatedInitialApprovalReceiptPath'],
    'INITIAL_RECORDER_INPUT_INVALID'
  );
  const ownerPrivateRoot = requireAbsolutePath(
    input.ownerPrivateRoot,
    'OWNER_PRIVATE_ROOT_INVALID'
  );
  const populatedInitialApprovalReceiptPath = requireAbsolutePath(
    input.populatedInitialApprovalReceiptPath,
    'INITIAL_APPROVAL_RECEIPT_PATH_INVALID'
  );
  const outputDirectory = path.join(
    ownerPrivateRoot,
    RECORDED_INITIAL_RECEIPT_DIRECTORY
  );
  const temporaryRoots = [os.tmpdir(), process.env.TEMP, process.env.TMP]
    .filter(value => typeof value === 'string')
    .map(value => path.resolve(value));
  requireCondition(
    existsSync(ownerPrivateRoot) &&
      isWithin(ownerPrivateRoot, populatedInitialApprovalReceiptPath) &&
      path.basename(populatedInitialApprovalReceiptPath) ===
        INITIAL_RECEIPT_FILENAME &&
      !isWithin(REPOSITORY_ROOT, ownerPrivateRoot) &&
      (allowTemporaryOwnerRoot ||
        temporaryRoots.every(root => !isWithin(root, ownerPrivateRoot))) &&
      normalizedPath(populatedInitialApprovalReceiptPath) !==
        normalizedPath(outputDirectory) &&
      !isWithin(outputDirectory, populatedInitialApprovalReceiptPath) &&
      !existsSync(outputDirectory),
    'INITIAL_RECORDER_PATH_TOPOLOGY_INVALID'
  );
  return {
    ownerPrivateRoot,
    populatedInitialApprovalReceiptPath,
    outputDirectory,
  };
}

function captureInitialRecorderBundle(paths) {
  return {
    ownerRootSnapshot: stableDirectorySnapshot(
      paths.ownerPrivateRoot,
      'OWNER_PRIVATE_ROOT_INVALID'
    ),
    populatedInitialReceipt: stableFileSnapshot(
      paths.populatedInitialApprovalReceiptPath,
      MAXIMUM_JSON_BYTES,
      true,
      'INITIAL_APPROVAL_RECEIPT_NOT_CANONICAL'
    ),
  };
}

function comparableInitialRecorderBundle(bundle) {
  return {
    ownerRootSnapshot: bundle.ownerRootSnapshot,
    populatedInitialReceipt: {
      sha256: bundle.populatedInitialReceipt.sha256,
      identity: bundle.populatedInitialReceipt.identity,
    },
  };
}

function recordInitialWithRuntime(inputValue, runtimeOverrides) {
  requireCondition(isRecord(runtimeOverrides), 'RUNTIME_OVERRIDE_INVALID');
  const testRuntimeInjected = Object.keys(runtimeOverrides).length > 0;
  if (testRuntimeInjected) {
    requireCondition(
      process.env.NODE_ENV === 'test' &&
        typeof process.env.JEST_WORKER_ID === 'string' &&
        /^\d+$/u.test(process.env.JEST_WORKER_ID),
      'RUNTIME_OVERRIDE_FORBIDDEN'
    );
  }
  const runtime = { ...buildDefaultRuntime(), ...runtimeOverrides };
  for (const key of [
    'now',
    'inspectInitialAclSet',
    'validateInitialReceipt',
    'recordInitialReceipt',
    'verifyInitialReceipt',
  ]) {
    requireCondition(typeof runtime[key] === 'function', 'RUNTIME_INVALID');
  }
  const paths = validateInitialRecorderPaths(inputValue, testRuntimeInjected);
  const bundle = captureInitialRecorderBundle(paths);
  const startedAt = runtime.now();
  requireCondition(Number.isFinite(startedAt), 'RUNTIME_CLOCK_INVALID');
  const validation = runtime.validateInitialReceipt(
    bundle.populatedInitialReceipt.value
  );
  requireCondition(
    validation.receiptSha256 === bundle.populatedInitialReceipt.sha256 &&
      validation.remoteContactPerformed === false &&
      validation.credentialReadPerformed === false &&
      requireCanonicalTimestamp(
        validation.acceptedAt,
        'INITIAL_APPROVAL_RECEIPT_INVALID'
      ) <= startedAt,
    'INITIAL_APPROVAL_RECEIPT_VALIDATION_INVALID'
  );
  const aclProof = runtime.inspectInitialAclSet(paths);
  requireCondition(Array.isArray(aclProof), 'ACL_BOUNDARY_INVALID');
  const currentBundle = captureInitialRecorderBundle(paths);
  requireSameSnapshot(
    comparableInitialRecorderBundle(currentBundle),
    comparableInitialRecorderBundle(bundle),
    'INITIAL_APPROVAL_RECEIPT_IDENTITY_OR_CONTENT_CHANGED'
  );
  const beforeCreateNew = runtime.now();
  requireCondition(
    Number.isFinite(beforeCreateNew) &&
      beforeCreateNew >= startedAt &&
      beforeCreateNew - startedAt <= 60_000 &&
      requireCanonicalTimestamp(
        validation.acceptedAt,
        'INITIAL_APPROVAL_RECEIPT_INVALID'
      ) <= beforeCreateNew,
    'RUNTIME_CLOCK_INVALID'
  );
  const finalValidation = runtime.validateInitialReceipt(
    currentBundle.populatedInitialReceipt.value
  );
  requireCondition(
    finalValidation.receiptSha256 === validation.receiptSha256 &&
      finalValidation.acceptedAt === validation.acceptedAt &&
      finalValidation.remoteContactPerformed === false &&
      finalValidation.credentialReadPerformed === false,
    'INITIAL_APPROVAL_RECEIPT_VALIDATION_INVALID'
  );
  const finalAclProof = runtime.inspectInitialAclSet(paths);
  requireSameSnapshot(finalAclProof, aclProof, 'ACL_BOUNDARY_CHANGED');
  const immediatelyBeforeCreateNew = captureInitialRecorderBundle(paths);
  requireSameSnapshot(
    comparableInitialRecorderBundle(immediatelyBeforeCreateNew),
    comparableInitialRecorderBundle(bundle),
    'INITIAL_APPROVAL_RECEIPT_IDENTITY_OR_CONTENT_CHANGED'
  );
  const recorded = runtime.recordInitialReceipt({
    ownerPrivateRoot: paths.ownerPrivateRoot,
    outputDirectory: paths.outputDirectory,
    receipt: immediatelyBeforeCreateNew.populatedInitialReceipt.value,
  });
  const recordedReceiptPath = path.join(
    paths.outputDirectory,
    INITIAL_RECEIPT_FILENAME
  );
  const verified = runtime.verifyInitialReceipt({
    ownerPrivateRoot: paths.ownerPrivateRoot,
    receiptPath: recordedReceiptPath,
    expectedReceipt: immediatelyBeforeCreateNew.populatedInitialReceipt.value,
    expectedOwnerPrivateRootIdentity: recorded.ownerPrivateRootIdentity,
    expectedOwnerPrivateRootAcl: recorded.ownerPrivateRootAcl,
    expectedFileIdentity: recorded.fileIdentity,
    expectedFileAcl: recorded.fileAcl,
    expectedDirectoryIdentity: recorded.directoryIdentity,
    expectedDirectoryAcl: recorded.directoryAcl,
    ownerPrivateRoot: paths.ownerPrivateRoot,
    expectedOwnerPrivateRootIdentity: recorded.ownerPrivateRootIdentity,
    expectedOwnerPrivateRootAcl: recorded.ownerPrivateRootAcl,
  });
  requireCondition(
    recorded.status === 'RECORDED' &&
      recorded.fileCount === 1 &&
      recorded.receiptSha256 === validation.receiptSha256 &&
      recorded.acceptedAt === validation.acceptedAt &&
      recorded.remoteContactPerformed === false &&
      recorded.credentialReadPerformed === false &&
      verified.status === 'VERIFIED_STABLE' &&
      verified.receiptSha256 === recorded.receiptSha256 &&
      verified.remoteContactPerformed === false &&
      verified.credentialReadPerformed === false,
    'RECORDED_RECEIPT_VERIFICATION_INVALID'
  );
  const result = {
    status: 'RECORDED_AND_VERIFIED',
    operation: 'RECORD_PR12_ACTION003_INITIAL_APPROVAL_RECEIPT_LOCAL_ONLY',
    actionId: ACTION_ID,
    initialApprovalReceiptSha256: recorded.receiptSha256,
    initialApprovalAcceptedAt: recorded.acceptedAt,
    recordedReceiptPathSha256: verified.receiptPathSha256,
    action003PacketPreparationAuthorized: true,
    databasePasswordBootstrapAuthorized: false,
    sourceProjectProvisioningAuthorized: false,
    productionContactAuthorized: false,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    remoteContactPerformed: false,
    credentialPlaintextReadPerformed: false,
  };
  assertSecretFreeEvidence(result, []);
  return result;
}

export function recordAction003InitialApprovalReceiptForTest(
  inputValue,
  runtimeOverrides
) {
  return recordInitialWithRuntime(inputValue, runtimeOverrides);
}

export function recordAction003InitialApprovalReceipt(inputValue) {
  return recordInitialWithRuntime(inputValue, {});
}

export function parseAction003FinalReceiptRecorderArguments(argvInput) {
  requireCondition(Array.isArray(argvInput), 'USAGE_INVALID');
  if (argvInput.length === 1 && argvInput[0] === '--help') {
    return { help: true };
  }
  if (argvInput[0] === '--record-initial') {
    const initialArguments = argvInput.slice(1);
    requireCondition(initialArguments.length === 4, 'USAGE_INVALID');
    const values = {};
    for (let index = 0; index < initialArguments.length; index += 2) {
      const flag = initialArguments[index];
      const value = initialArguments[index + 1];
      requireCondition(
        [
          '--owner-private-root',
          '--populated-initial-approval-receipt',
        ].includes(flag) &&
          !Object.hasOwn(values, flag) &&
          typeof value === 'string' &&
          value.length > 0,
        'USAGE_INVALID'
      );
      values[flag] = value;
    }
    requireCondition(Object.keys(values).length === 2, 'USAGE_INVALID');
    return {
      help: false,
      mode: 'INITIAL',
      input: {
        ownerPrivateRoot: values['--owner-private-root'],
        populatedInitialApprovalReceiptPath:
          values['--populated-initial-approval-receipt'],
      },
    };
  }
  const expectedFlags = [
    '--owner-private-root',
    '--candidate-directory',
    '--preflight-descriptor',
    '--initial-approval-receipt',
    '--pricing-evidence',
    '--populated-final-approval-receipt',
  ];
  requireCondition(
    argvInput.length === expectedFlags.length * 2,
    'USAGE_INVALID'
  );
  const values = {};
  for (let index = 0; index < argvInput.length; index += 2) {
    const flag = argvInput[index];
    const value = argvInput[index + 1];
    requireCondition(
      expectedFlags.includes(flag) &&
        !Object.hasOwn(values, flag) &&
        typeof value === 'string' &&
        value.length > 0,
      'USAGE_INVALID'
    );
    values[flag] = value;
  }
  requireCondition(
    Object.keys(values).length === expectedFlags.length,
    'USAGE_INVALID'
  );
  return {
    help: false,
    mode: 'FINAL',
    input: {
      ownerPrivateRoot: values['--owner-private-root'],
      candidateDirectory: values['--candidate-directory'],
      preflightDescriptorPath: values['--preflight-descriptor'],
      initialApprovalReceiptPath: values['--initial-approval-receipt'],
      pricingEvidencePath: values['--pricing-evidence'],
      populatedFinalApprovalReceiptPath:
        values['--populated-final-approval-receipt'],
    },
  };
}

function usage() {
  return (
    'Initial receipt: fnm exec --using=24 node ' +
    'scripts/commercial-hardening/record-pr12-action003-final-approval-receipt.mjs ' +
    '--record-initial ' +
    '--owner-private-root <absolute-owner-private-root> ' +
    '--populated-initial-approval-receipt <absolute-owner-populated-initial-receipt-v1.json>\n' +
    'Final receipt: fnm exec --using=24 node ' +
    'scripts/commercial-hardening/record-pr12-action003-final-approval-receipt.mjs ' +
    '--owner-private-root <absolute-owner-private-root> ' +
    '--candidate-directory <absolute-exact-three-file-candidate-directory> ' +
    '--preflight-descriptor <absolute-canonical-preflight-descriptor-v1.json> ' +
    '--initial-approval-receipt <absolute-initial-receipt-v1.json> ' +
    '--pricing-evidence <absolute-official-pricing-evidence-v2.json> ' +
    '--populated-final-approval-receipt <absolute-owner-populated-final-receipt-v1.json>\n' +
    'Local-only: derives all hashes and the bound HEAD from files, records one CreateNew receipt, and performs no provider contact or credential plaintext access.\n'
  );
}

async function main() {
  const parsed = parseAction003FinalReceiptRecorderArguments(
    process.argv.slice(2)
  );
  if (parsed.help) {
    process.stdout.write(usage());
    return;
  }
  const result =
    parsed.mode === 'INITIAL'
      ? recordAction003InitialApprovalReceipt(parsed.input)
      : recordAction003FinalApprovalReceipt(parsed.input);
  process.stdout.write(`${canonicalJson(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(error => {
    const code =
      error instanceof Action003FinalReceiptRecorderError ||
      (error && typeof error.code === 'string')
        ? error.code
        : 'ACTION003_FINAL_RECEIPT_RECORDER_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
