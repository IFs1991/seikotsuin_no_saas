import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTION_ID,
  CREATE_ENDPOINT,
  MAX_PROVIDER_BODY_BYTES,
  OFFICIAL_PRICING_SOURCES,
  ProvisioningContractError,
  addonResponseToSafeProjection,
  assertAllowedManagementApiRequest,
  assertOfficialPricingSourceSemantics,
  assertProviderBodyEnvelope,
  assertSecretFreeEvidence,
  assertSourceProjectProvisioningCandidate,
  availableRegionsToSafeProjection,
  buildBindingMaterial,
  buildSecretFreeRequestProjection,
  canonicalJson,
  claimActionJournal,
  derivePricingExecutionFreshThrough,
  hasAsciiControlCharacter,
  journalDirectoryFingerprint,
  isForbiddenAmbientCredentialName,
  isJsonMediaType,
  organizationProjectPageToSafeProjection,
  projectCreateResponseToSafeProjection,
  sha256Canonical,
  sha256Text,
  validateOfflineApproval,
} from './pr12-source-project-provisioning-contract.mjs';
import {
  DpapiCredentialChannelError,
  assertDpapiDirectoryIsolation,
  revalidateDpapiCredentialResources,
  retrieveClaimBoundCredentials,
  validateDpapiCredentialResources,
  windowsPathFingerprint,
} from './pr12-windows-dpapi-credential-channel.mjs';
import { inspectOwnerPrivatePathAcl } from './pr12-action003-approval-receipt-contract.mjs';
import {
  OrganizationIdentityCaptureEvidenceError,
  verifyOrganizationIdentityCaptureTerminalLinkage,
} from './verify-pr12-source-organization-identity-capture-evidence.mjs';
import { verifyProvisioningEvidenceDirectory } from './verify-pr12-source-project-provisioning-evidence.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const contractPath = fileURLToPath(
  new URL('./pr12-source-project-provisioning-contract.mjs', import.meta.url)
);
const credentialChannelPath = fileURLToPath(
  new URL('./pr12-windows-dpapi-credential-channel.mjs', import.meta.url)
);
const approvalReceiptContractPath = fileURLToPath(
  new URL('./pr12-action003-approval-receipt-contract.mjs', import.meta.url)
);
const ownerPrivateAclHelperPath = fileURLToPath(
  new URL('./pr12-windows-owner-private-acl.ps1', import.meta.url)
);
const evidenceVerifierPath = fileURLToPath(
  new URL(
    './verify-pr12-source-project-provisioning-evidence.mjs',
    import.meta.url
  )
);
const organizationIdentityContractPath = fileURLToPath(
  new URL(
    './pr12-source-organization-identity-capture-contract.mjs',
    import.meta.url
  )
);
const organizationIdentityVerifierPath = fileURLToPath(
  new URL(
    './verify-pr12-source-organization-identity-capture-evidence.mjs',
    import.meta.url
  )
);
const CANDIDATE_BINDING_FILENAME =
  'source-project-provisioning-binding-v6.json';
const CANDIDATE_CREDENTIAL_FILENAME =
  'source-project-provisioning-credential-configuration-v2.json';
const CANDIDATE_AUTHORIZATION_PROJECTION_FILENAME =
  'source-project-provisioning-authorization-projection-v1.json';
const SINGLE_ACTION_APPROVAL_RECEIPT_FILENAME =
  'source-project-provisioning-single-action-approval-receipt-v2.json';
const DERIVED_EXECUTION_BINDING_FILENAME =
  'source-project-provisioning-derived-execution-binding-v1.json';
const SINGLE_ACTION_APPROVAL_RECEIPT_DIRECTORY =
  'source-project-provisioning-single-action-approval-receipt-v2';
const DERIVED_EXECUTION_BINDING_DIRECTORY =
  'source-project-provisioning-derived-execution-binding-v1';
const EXECUTING_IMPLEMENTATION_FILES = [
  {
    key: 'wrapper',
    relativePath:
      'scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs',
    actualPath: scriptPath,
  },
  {
    key: 'contract',
    relativePath:
      'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs',
    actualPath: contractPath,
  },
  {
    key: 'credentialChannel',
    relativePath:
      'scripts/commercial-hardening/pr12-windows-dpapi-credential-channel.mjs',
    actualPath: credentialChannelPath,
  },
  {
    key: 'approvalReceiptContract',
    relativePath:
      'scripts/commercial-hardening/pr12-action003-approval-receipt-contract.mjs',
    actualPath: approvalReceiptContractPath,
  },
  {
    key: 'ownerPrivateAclHelper',
    relativePath:
      'scripts/commercial-hardening/pr12-windows-owner-private-acl.ps1',
    actualPath: ownerPrivateAclHelperPath,
  },
  {
    key: 'evidenceVerifier',
    relativePath:
      'scripts/commercial-hardening/verify-pr12-source-project-provisioning-evidence.mjs',
    actualPath: evidenceVerifierPath,
  },
  {
    key: 'organizationIdentityContract',
    relativePath:
      'scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs',
    actualPath: organizationIdentityContractPath,
  },
  {
    key: 'organizationIdentityVerifier',
    relativePath:
      'scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs',
    actualPath: organizationIdentityVerifierPath,
  },
];
const CLAIM_FILE = 'source-project-provisioning-action.claim.json';
const DISPATCH_FILE = 'source-project-provisioning-post-intent.json';
const OUTCOME_FILE = 'source-project-provisioning-terminal-outcome.json';
const GOVERNANCE_RELATIVE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml';

class SafeExecutionError extends Error {
  constructor(code, state = 'PRECHECK_ABORTED') {
    super(code);
    this.name = 'SafeExecutionError';
    this.code = code;
    this.state = state;
  }
}

class EvidenceSealError extends SafeExecutionError {
  constructor(code, retainedPartialEvidenceDirectoryName) {
    super(code, 'PARTIAL_FAILURE');
    this.name = 'EvidenceSealError';
    this.retainedPartialEvidenceDirectoryName =
      retainedPartialEvidenceDirectoryName;
  }
}

function fail(code, state) {
  throw new SafeExecutionError(code, state);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function safeErrorCode(error) {
  if (
    error instanceof SafeExecutionError ||
    error instanceof ProvisioningContractError ||
    error instanceof DpapiCredentialChannelError ||
    error instanceof OrganizationIdentityCaptureEvidenceError
  ) {
    return error.code;
  }
  return 'UNEXPECTED_LOCAL_FAILURE';
}

function retainedPartialEvidenceDirectoryName(error) {
  return error instanceof EvidenceSealError
    ? error.retainedPartialEvidenceDirectoryName
    : null;
}

function safeErrorState(error, postAttemptCount, createResponseAccepted) {
  if (
    error instanceof SafeExecutionError &&
    error.state !== 'PRECHECK_ABORTED'
  ) {
    return error.state;
  }
  if (postAttemptCount > 0) {
    return createResponseAccepted
      ? 'PARTIAL_FAILURE'
      : 'UNKNOWN_REMOTE_OUTCOME';
  }
  return 'PRECHECK_ABORTED';
}

function printHelp() {
  process.stdout.write(`PR12 Phase 1 source project provisioning wrapper

This wrapper is fail-closed. It performs no action unless the current,
hash-bound Phase 1 candidate tuple, single owner approval, and system-derived
exact-hash receipt pass offline validation.

Offline validation only (no credential value read, no network, no journal claim):
  node scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs --offline-verify \`
    --binding <candidate-binding.json> \`
    --credential-config <candidate-credential-config.json> \`
    --approval-evidence <owner-approval-candidate.json> \`
    --single-action-approval-receipt <single-action-approval-receipt.json> \`
    --derived-execution-binding <derived-execution-binding.json> \`
    --owner-private-approval-root <owner-private-absolute-directory> \`
    --pricing-evidence <official-pricing-evidence.json> \`
    --organization-identity-evidence-directory <sealed-action-002-directory> \`
    --organization-identity-terminal <action-002-terminal-outcome.json> \`
    --journal-directory <owner-controlled-absolute-directory> \`
    --evidence-parent <owner-controlled-absolute-directory>

Future execution after separate explicit approval only:
  node scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs \`
    --execute-authorized-action PR12-ACTION-003 \`
    --binding <candidate-binding.json> \`
    --credential-config <candidate-credential-config.json> \`
    --approval-evidence <owner-approval-candidate.json> \`
    --single-action-approval-receipt <single-action-approval-receipt.json> \`
    --derived-execution-binding <derived-execution-binding.json> \`
    --owner-private-approval-root <owner-private-absolute-directory> \`
    --pricing-evidence <official-pricing-evidence.json> \`
    --organization-identity-evidence-directory <sealed-action-002-directory> \`
    --organization-identity-terminal <action-002-terminal-outcome.json> \`
    --journal-directory <owner-controlled-absolute-directory> \`
    --evidence-parent <owner-controlled-absolute-directory>

Read-only recovery after a durable POST intent and process interruption only:
  node scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs \`
    --reconcile-dispatched-action PR12-ACTION-003 \`
    --binding <candidate-binding.json> \`
    --credential-config <candidate-credential-config.json> \`
    --approval-evidence <owner-approval-candidate.json> \`
    --single-action-approval-receipt <single-action-approval-receipt.json> \`
    --derived-execution-binding <derived-execution-binding.json> \`
    --owner-private-approval-root <owner-private-absolute-directory> \`
    --pricing-evidence <official-pricing-evidence.json> \`
    --organization-identity-evidence-directory <sealed-action-002-directory> \`
    --organization-identity-terminal <action-002-terminal-outcome.json> \`
    --journal-directory <owner-controlled-absolute-directory> \`
    --evidence-parent <owner-controlled-absolute-directory>

Never place a secret in an argument, URL, filename, log, or evidence file.
`);
}

function parseArguments(argv) {
  if (argv.length === 0 || argv.includes('--help')) return { help: true };
  const valueFlags = new Set([
    '--execute-authorized-action',
    '--reconcile-dispatched-action',
    '--binding',
    '--credential-config',
    '--approval-evidence',
    '--single-action-approval-receipt',
    '--derived-execution-binding',
    '--owner-private-approval-root',
    '--pricing-evidence',
    '--organization-identity-evidence-directory',
    '--organization-identity-terminal',
    '--journal-directory',
    '--evidence-parent',
  ]);
  const parsed = { help: false, offlineVerify: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--offline-verify') {
      if (parsed.offlineVerify === true) fail('DUPLICATE_ARGUMENT');
      parsed.offlineVerify = true;
      continue;
    }
    if (!valueFlags.has(flag)) fail('UNKNOWN_ARGUMENT');
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--'))
      fail('MISSING_ARGUMENT_VALUE');
    if (Object.hasOwn(parsed, flag)) fail('DUPLICATE_ARGUMENT');
    parsed[flag] = value;
    index += 1;
  }
  const executeAction = parsed['--execute-authorized-action'];
  const reconcileAction = parsed['--reconcile-dispatched-action'];
  const hasExecute = executeAction !== undefined;
  const hasReconcile = reconcileAction !== undefined;
  if (
    [parsed.offlineVerify === true, hasExecute, hasReconcile].filter(Boolean)
      .length !== 1
  ) {
    fail('EXECUTION_MODE_INVALID');
  }
  if (hasExecute && executeAction !== ACTION_ID)
    fail('ACTION_CONFIRMATION_INVALID');
  if (hasReconcile && reconcileAction !== ACTION_ID)
    fail('ACTION_CONFIRMATION_INVALID');
  for (const flag of [
    '--binding',
    '--credential-config',
    '--approval-evidence',
    '--single-action-approval-receipt',
    '--derived-execution-binding',
    '--owner-private-approval-root',
    '--pricing-evidence',
    '--organization-identity-evidence-directory',
    '--organization-identity-terminal',
    '--journal-directory',
    '--evidence-parent',
  ]) {
    if (typeof parsed[flag] !== 'string') fail('REQUIRED_ARGUMENT_MISSING');
  }
  return parsed;
}

function resolveJsonInput(inputPath, code) {
  const resolved = path.resolve(inputPath);
  if (path.extname(resolved).toLowerCase() !== '.json') fail(code);
  if (path.basename(resolved).toLowerCase().startsWith('.env')) fail(code);
  if (
    !existsSync(resolved) ||
    lstatSync(resolved).isSymbolicLink() ||
    !statSync(resolved).isFile()
  ) {
    fail(code);
  }
  return resolved;
}

function resolveExistingDirectory(inputPath, code) {
  if (typeof inputPath !== 'string' || !path.isAbsolute(inputPath)) fail(code);
  const resolved = path.resolve(inputPath);
  if (
    !existsSync(resolved) ||
    lstatSync(resolved).isSymbolicLink() ||
    !statSync(resolved).isDirectory()
  ) {
    fail(code);
  }
  return resolved;
}

function fileIdentityFromStatus(status) {
  return {
    device: String(status.dev),
    inode: String(status.ino),
    size: Number(status.size),
    modifiedAtMilliseconds: Number(status.mtimeMs),
  };
}

function readFileSnapshot(pathname, code) {
  let descriptor;
  try {
    if (lstatSync(pathname).isSymbolicLink()) fail(code);
    const resolvedBefore = normalizedFilesystemPath(
      realpathSync.native(pathname)
    );
    descriptor = openSync(pathname, 'r');
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) fail(code);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const beforeIdentity = fileIdentityFromStatus(before);
    const afterIdentity = fileIdentityFromStatus(after);
    if (
      canonicalJson(beforeIdentity) !== canonicalJson(afterIdentity) ||
      BigInt(bytes.length) !== after.size ||
      lstatSync(pathname).isSymbolicLink()
    ) {
      fail(code);
    }
    const pathStatus = statSync(pathname, { bigint: true });
    const resolvedAfter = normalizedFilesystemPath(
      realpathSync.native(pathname)
    );
    if (
      !pathStatus.isFile() ||
      String(pathStatus.dev) !== String(after.dev) ||
      String(pathStatus.ino) !== String(after.ino) ||
      resolvedAfter !== resolvedBefore
    ) {
      fail(code);
    }
    return {
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      identity: afterIdentity,
    };
  } catch (error) {
    if (error instanceof SafeExecutionError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseJsonSnapshot(snapshot, code) {
  let parsed;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      snapshot.bytes
    );
    parsed = JSON.parse(text);
  } catch {
    fail(code);
  }
  if (!isRecord(parsed)) fail(code);
  return parsed;
}

function readJson(pathname, code) {
  return parseJsonSnapshot(readFileSnapshot(pathname, code), code);
}

function normalizedFilesystemPath(pathname) {
  const resolved = path.resolve(pathname);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function captureExecutingImplementationSnapshots(repositoryRoot, code) {
  const snapshots = {};
  for (const implementation of EXECUTING_IMPLEMENTATION_FILES) {
    const expectedPath = path.resolve(
      repositoryRoot,
      implementation.relativePath
    );
    if (
      normalizedFilesystemPath(implementation.actualPath) !==
      normalizedFilesystemPath(expectedPath)
    ) {
      fail(code);
    }
    let actualRealPath;
    let expectedRealPath;
    try {
      actualRealPath = realpathSync.native(implementation.actualPath);
      expectedRealPath = realpathSync.native(expectedPath);
    } catch {
      fail(code);
    }
    if (
      normalizedFilesystemPath(actualRealPath) !==
      normalizedFilesystemPath(expectedRealPath)
    ) {
      fail(code);
    }
    const snapshot = readFileSnapshot(implementation.actualPath, code);
    snapshots[implementation.key] = {
      repositoryRelativePath: implementation.relativePath,
      realPath: normalizedFilesystemPath(actualRealPath),
      sha256: snapshot.sha256,
      identity: snapshot.identity,
    };
  }
  return snapshots;
}

function requireSameExecutingImplementationSnapshots(inputs, code) {
  const current = captureExecutingImplementationSnapshots(
    inputs.repositoryRoot,
    code
  );
  if (
    canonicalJson(current) !==
    canonicalJson(inputs.executingImplementationSnapshots)
  ) {
    fail(code);
  }
  return current;
}

function sha256File(pathname) {
  return createHash('sha256').update(readFileSync(pathname)).digest('hex');
}

export function snapshotOfficialPricingSources(inputs) {
  const sources = inputs.context.pricingEvidence?.officialSources;
  if (
    !Array.isArray(sources) ||
    sources.length !== OFFICIAL_PRICING_SOURCES.length
  ) {
    fail('PRICING_SOURCE_ARTIFACT_INVALID');
  }
  const evidenceDirectory = path.dirname(inputs.pricingPath);
  requireNoReparseDirectoryComponents(
    evidenceDirectory,
    'PRICING_SOURCE_ARTIFACT_INVALID'
  );
  const resolvedEvidenceDirectory = realpathSync.native(evidenceDirectory);
  const resolvedRepositoryRoot = realpathSync.native(inputs.repositoryRoot);
  const snapshots = {};
  const relativePaths = new Set();
  const resolvedPaths = new Set();
  const filesystemIdentities = new Set();
  const contentHashes = new Set();
  for (const [index, source] of sources.entries()) {
    const expectedSource = OFFICIAL_PRICING_SOURCES[index];
    const sourceKeys = isRecord(source) ? Object.keys(source).sort() : [];
    if (
      !isRecord(source) ||
      canonicalJson(sourceKeys) !==
        canonicalJson(
          [
            'sourceId',
            'url',
            'retrievedAt',
            'artifactPath',
            'artifactSha256',
          ].sort()
        ) ||
      source.sourceId !== expectedSource.sourceId ||
      source.url !== expectedSource.url ||
      typeof source.retrievedAt !== 'string' ||
      typeof source.artifactPath !== 'string' ||
      typeof source.artifactSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(source.artifactSha256) ||
      path.isAbsolute(source.artifactPath) ||
      source.artifactPath.includes('\\') ||
      source.artifactPath.includes(':') ||
      hasAsciiControlCharacter(source.artifactPath) ||
      source.artifactPath
        .split('/')
        .some(
          component =>
            component.length === 0 || component === '.' || component === '..'
        )
    ) {
      fail('PRICING_SOURCE_ARTIFACT_INVALID');
    }
    const artifactPath = path.resolve(evidenceDirectory, source.artifactPath);
    requireNoReparseDirectoryComponents(
      path.dirname(artifactPath),
      'PRICING_SOURCE_ARTIFACT_INVALID'
    );
    const resolvedArtifactPath = realpathSync.native(artifactPath);
    const relativeToEvidence = path.relative(evidenceDirectory, artifactPath);
    const resolvedRelativeToEvidence = path.relative(
      resolvedEvidenceDirectory,
      resolvedArtifactPath
    );
    const relativeToRepository = path.relative(
      inputs.repositoryRoot,
      artifactPath
    );
    const resolvedRelativeToRepository = path.relative(
      resolvedRepositoryRoot,
      resolvedArtifactPath
    );
    if (
      relativeToEvidence === '' ||
      relativeToEvidence.startsWith('..') ||
      path.isAbsolute(relativeToEvidence) ||
      resolvedRelativeToEvidence === '' ||
      resolvedRelativeToEvidence.startsWith('..') ||
      path.isAbsolute(resolvedRelativeToEvidence) ||
      relativeToRepository === '' ||
      (!relativeToRepository.startsWith('..') &&
        !path.isAbsolute(relativeToRepository)) ||
      resolvedRelativeToRepository === '' ||
      (!resolvedRelativeToRepository.startsWith('..') &&
        !path.isAbsolute(resolvedRelativeToRepository))
    ) {
      fail('PRICING_SOURCE_ARTIFACT_INVALID');
    }
    const snapshot = readFileSnapshot(
      artifactPath,
      'PRICING_SOURCE_ARTIFACT_INVALID'
    );
    if (snapshot.sha256 !== source.artifactSha256) {
      fail('PRICING_SOURCE_ARTIFACT_HASH_MISMATCH');
    }
    assertOfficialPricingSourceSemantics({
      sourceId: source.sourceId,
      bytes: snapshot.bytes,
    });
    const normalizedRelativePath = source.artifactPath.toLowerCase();
    const normalizedResolvedPath =
      normalizedFilesystemPath(resolvedArtifactPath);
    const filesystemIdentity = `${snapshot.identity.device}:${snapshot.identity.inode}`;
    for (const [set, value] of [
      [relativePaths, normalizedRelativePath],
      [resolvedPaths, normalizedResolvedPath],
      [filesystemIdentities, filesystemIdentity],
      [contentHashes, snapshot.sha256],
    ]) {
      if (set.has(value)) {
        fail('PRICING_SOURCE_ARTIFACT_IDENTITY_DUPLICATE');
      }
      set.add(value);
    }
    snapshots[source.sourceId] = {
      path: artifactPath,
      resolvedPath: resolvedArtifactPath,
      sha256: snapshot.sha256,
      identity: snapshot.identity,
    };
  }
  if (Object.keys(snapshots).length !== OFFICIAL_PRICING_SOURCES.length) {
    fail('PRICING_SOURCE_ARTIFACT_INVALID');
  }
  return snapshots;
}

function revalidateOfficialPricingSources(inputs) {
  const current = snapshotOfficialPricingSources(inputs);
  if (canonicalJson(current) !== canonicalJson(inputs.pricingSourceArtifacts)) {
    fail('PRICING_SOURCE_ARTIFACT_CHANGED');
  }
  return current;
}

function cleanGitEnvironment() {
  const allowed = [
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'WINDIR',
    'SYSTEMDRIVE',
    'COMSPEC',
    'TEMP',
    'TMP',
  ];
  return Object.fromEntries(
    allowed
      .filter(name => typeof process.env[name] === 'string')
      .map(name => [name, process.env[name]])
  );
}

function runGit(args, code) {
  const safeDirectory = path.resolve(process.cwd()).replaceAll('\\', '/');
  const result = spawnSync(
    'git',
    ['-c', `safe.directory=${safeDirectory}`, ...args],
    {
      cwd: process.cwd(),
      env: cleanGitEnvironment(),
      encoding: 'utf8',
      windowsHide: true,
    }
  );
  if (result.status !== 0 || typeof result.stdout !== 'string') fail(code);
  return result.stdout.trim();
}

function isGitAncestor(ancestor, descendant) {
  const safeDirectory = path.resolve(process.cwd()).replaceAll('\\', '/');
  const result = spawnSync(
    'git',
    [
      '-c',
      `safe.directory=${safeDirectory}`,
      'merge-base',
      '--is-ancestor',
      ancestor,
      descendant,
    ],
    {
      cwd: process.cwd(),
      env: cleanGitEnvironment(),
      encoding: 'utf8',
      windowsHide: true,
    }
  );
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  fail('GIT_ANCESTRY_UNAVAILABLE');
}

function inspectPriorActionState(journalDirectory) {
  const entries = readdirSync(journalDirectory);
  const allowedEntries = new Set([CLAIM_FILE, DISPATCH_FILE, OUTCOME_FILE]);
  if (entries.some(entry => !allowedEntries.has(entry))) {
    return 'JOURNAL_DIRECTORY_NOT_EMPTY';
  }
  const claimExists = existsSync(path.join(journalDirectory, CLAIM_FILE));
  const dispatchExists = existsSync(path.join(journalDirectory, DISPATCH_FILE));
  const outcomeExists = existsSync(path.join(journalDirectory, OUTCOME_FILE));
  if (!claimExists && (dispatchExists || outcomeExists)) {
    return 'ORPHANED_ACTION_JOURNAL_STATE';
  }
  if (!claimExists) return null;
  if (outcomeExists) {
    return 'TERMINAL_OUTCOME_RECORDED';
  }
  if (dispatchExists) {
    return 'POST_INTENT_DURABLE_OUTCOME_UNRESOLVED';
  }
  return 'CLAIMED_POST_NOT_SENT';
}

function requireNoReparseDirectoryComponents(directory, code) {
  const resolved = path.resolve(directory);
  const root = path.parse(resolved).root;
  let current = root;
  for (const component of resolved.slice(root.length).split(path.sep)) {
    if (component.length === 0) continue;
    current = path.join(current, component);
    let status;
    try {
      status = lstatSync(current);
    } catch {
      fail(code);
    }
    if (!status.isDirectory() || status.isSymbolicLink()) fail(code);
  }
}

function directoryIdentity(directory, code) {
  let resolved;
  let status;
  try {
    requireNoReparseDirectoryComponents(directory, code);
    resolved = realpathSync.native(directory);
    status = statSync(resolved, { bigint: true });
  } catch (error) {
    if (error instanceof SafeExecutionError) throw error;
    fail(code);
  }
  if (!status.isDirectory()) fail(code);
  return {
    realPath: resolved.replaceAll('\\', '/').toLowerCase(),
    device: String(status.dev),
    inode: String(status.ino),
  };
}

function requireSameDirectoryIdentity(directory, expected, code) {
  if (
    canonicalJson(directoryIdentity(directory, code)) !==
    canonicalJson(expected)
  ) {
    fail(code);
  }
}

function isPathWithinOrEqual(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function requireExactDirectoryEntries(directory, expectedEntries, code) {
  let before;
  let after;
  let entries;
  try {
    before = statSync(directory);
    entries = readdirSync(directory).sort();
    after = statSync(directory);
  } catch {
    fail(code);
  }
  if (
    !before.isDirectory() ||
    !after.isDirectory() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.mtimeMs !== after.mtimeMs ||
    canonicalJson(entries) !== canonicalJson([...expectedEntries].sort())
  ) {
    fail(code);
  }
  return entries;
}

function captureApprovalInputTopology({
  ownerPrivateApprovalRoot,
  repositoryRoot,
  bindingPath,
  credentialPath,
  approvalPath,
  singleActionApprovalReceiptPath,
  derivedExecutionBindingPath,
  allowTemporaryRootForTest = false,
}) {
  if (
    allowTemporaryRootForTest === true &&
    !(
      process.env.NODE_ENV === 'test' &&
      typeof process.env.JEST_WORKER_ID === 'string' &&
      /^\d+$/u.test(process.env.JEST_WORKER_ID)
    )
  ) {
    fail('TEST_APPROVAL_TOPOLOGY_OVERRIDE_FORBIDDEN');
  }
  const root = path.resolve(ownerPrivateApprovalRoot);
  const candidateDirectory = path.dirname(bindingPath);
  const authorityReceiptDirectory = path.dirname(
    singleActionApprovalReceiptPath
  );
  const executionBindingDirectory = path.dirname(derivedExecutionBindingPath);
  if (
    path.basename(bindingPath) !== CANDIDATE_BINDING_FILENAME ||
    path.basename(credentialPath) !== CANDIDATE_CREDENTIAL_FILENAME ||
    path.basename(approvalPath) !==
      CANDIDATE_AUTHORIZATION_PROJECTION_FILENAME ||
    path.basename(singleActionApprovalReceiptPath) !==
      SINGLE_ACTION_APPROVAL_RECEIPT_FILENAME ||
    path.basename(derivedExecutionBindingPath) !==
      DERIVED_EXECUTION_BINDING_FILENAME ||
    path.basename(authorityReceiptDirectory) !==
      SINGLE_ACTION_APPROVAL_RECEIPT_DIRECTORY ||
    path.basename(executionBindingDirectory) !==
      DERIVED_EXECUTION_BINDING_DIRECTORY ||
    path.dirname(credentialPath) !== candidateDirectory ||
    path.dirname(approvalPath) !== candidateDirectory ||
    path.dirname(candidateDirectory) !== root ||
    path.dirname(authorityReceiptDirectory) !== root ||
    path.dirname(executionBindingDirectory) !== root ||
    new Set([
      normalizedFilesystemPath(candidateDirectory),
      normalizedFilesystemPath(authorityReceiptDirectory),
      normalizedFilesystemPath(executionBindingDirectory),
    ]).size !== 3
  ) {
    fail('APPROVAL_INPUT_TOPOLOGY_INVALID');
  }
  for (const directory of [
    root,
    candidateDirectory,
    authorityReceiptDirectory,
    executionBindingDirectory,
  ]) {
    requireNoReparseDirectoryComponents(
      directory,
      'APPROVAL_INPUT_TOPOLOGY_INVALID'
    );
  }
  requireExactDirectoryEntries(
    candidateDirectory,
    [
      CANDIDATE_BINDING_FILENAME,
      CANDIDATE_CREDENTIAL_FILENAME,
      CANDIDATE_AUTHORIZATION_PROJECTION_FILENAME,
    ],
    'APPROVAL_CANDIDATE_FILE_SET_INVALID'
  );
  requireExactDirectoryEntries(
    authorityReceiptDirectory,
    [SINGLE_ACTION_APPROVAL_RECEIPT_FILENAME],
    'SINGLE_ACTION_APPROVAL_RECEIPT_FILE_SET_INVALID'
  );
  requireExactDirectoryEntries(
    executionBindingDirectory,
    [DERIVED_EXECUTION_BINDING_FILENAME],
    'DERIVED_EXECUTION_BINDING_FILE_SET_INVALID'
  );
  const rootIdentity = directoryIdentity(
    root,
    'OWNER_PRIVATE_APPROVAL_ROOT_INVALID'
  );
  const candidateDirectoryIdentity = directoryIdentity(
    candidateDirectory,
    'APPROVAL_INPUT_TOPOLOGY_INVALID'
  );
  const authorityReceiptDirectoryIdentity = directoryIdentity(
    authorityReceiptDirectory,
    'APPROVAL_INPUT_TOPOLOGY_INVALID'
  );
  const executionBindingDirectoryIdentity = directoryIdentity(
    executionBindingDirectory,
    'APPROVAL_INPUT_TOPOLOGY_INVALID'
  );
  const resolvedRoot = rootIdentity.realPath;
  for (const directoryIdentityValue of [
    candidateDirectoryIdentity,
    authorityReceiptDirectoryIdentity,
    executionBindingDirectoryIdentity,
  ]) {
    if (path.dirname(directoryIdentityValue.realPath) !== resolvedRoot) {
      fail('APPROVAL_INPUT_TOPOLOGY_INVALID');
    }
  }
  const repositoryRealPath = normalizedFilesystemPath(
    realpathSync.native(repositoryRoot)
  );
  if (
    isPathWithinOrEqual(repositoryRoot, root) ||
    isPathWithinOrEqual(repositoryRealPath, resolvedRoot)
  ) {
    fail('OWNER_PRIVATE_APPROVAL_ROOT_INSIDE_REPOSITORY');
  }
  if (!allowTemporaryRootForTest) {
    const temporaryRoots = new Set(
      [os.tmpdir(), process.env.TEMP, process.env.TMP]
        .filter(value => typeof value === 'string' && value.length > 0)
        .map(value => normalizedFilesystemPath(value))
    );
    for (const temporaryRoot of temporaryRoots) {
      if (
        isPathWithinOrEqual(temporaryRoot, root) ||
        isPathWithinOrEqual(temporaryRoot, resolvedRoot)
      ) {
        fail('OWNER_PRIVATE_APPROVAL_ROOT_INSIDE_TEMPORARY_ROOT');
      }
    }
  }
  const fileProofs = Object.fromEntries(
    [
      ['binding', bindingPath],
      ['credentialConfiguration', credentialPath],
      ['authorizationProjection', approvalPath],
      ['singleActionApprovalReceipt', singleActionApprovalReceiptPath],
      ['derivedExecutionBinding', derivedExecutionBindingPath],
    ].map(([key, pathname]) => {
      const snapshot = readFileSnapshot(
        pathname,
        'APPROVAL_INPUT_TOPOLOGY_INVALID'
      );
      return [
        key,
        {
          pathname: normalizedFilesystemPath(pathname),
          resolvedPath: normalizedFilesystemPath(realpathSync.native(pathname)),
          sha256: snapshot.sha256,
          identity: snapshot.identity,
        },
      ];
    })
  );
  if (
    new Set(
      Object.values(fileProofs).map(
        proof => `${proof.identity.device}:${proof.identity.inode}`
      )
    ).size !== 5
  ) {
    fail('APPROVAL_INPUT_FILE_IDENTITY_COLLISION');
  }
  const aclProofs = Object.fromEntries(
    [
      ['ownerPrivateApprovalRoot', root, 'DIRECTORY'],
      ['candidateDirectory', candidateDirectory, 'DIRECTORY'],
      ['binding', bindingPath, 'FILE'],
      ['credentialConfiguration', credentialPath, 'FILE'],
      ['authorizationProjection', approvalPath, 'FILE'],
      ['authorityReceiptDirectory', authorityReceiptDirectory, 'DIRECTORY'],
      ['singleActionApprovalReceipt', singleActionApprovalReceiptPath, 'FILE'],
      ['executionBindingDirectory', executionBindingDirectory, 'DIRECTORY'],
      ['derivedExecutionBinding', derivedExecutionBindingPath, 'FILE'],
    ].map(([key, targetPath, kind]) => [
      key,
      inspectOwnerPrivatePathAcl({
        ownerPrivateRoot: root,
        targetPath,
        kind,
      }),
    ])
  );
  return {
    ownerPrivateApprovalRoot: rootIdentity,
    candidateDirectory: candidateDirectoryIdentity,
    authorityReceiptDirectory: authorityReceiptDirectoryIdentity,
    executionBindingDirectory: executionBindingDirectoryIdentity,
    candidateEntries: [
      CANDIDATE_BINDING_FILENAME,
      CANDIDATE_CREDENTIAL_FILENAME,
      CANDIDATE_AUTHORIZATION_PROJECTION_FILENAME,
    ].sort(),
    authorityReceiptEntries: [SINGLE_ACTION_APPROVAL_RECEIPT_FILENAME],
    executionBindingEntries: [DERIVED_EXECUTION_BINDING_FILENAME],
    files: fileProofs,
    aclProofs,
  };
}

function revalidateApprovalInputTopology(
  inputs,
  code = 'APPROVAL_INPUT_TOPOLOGY_CHANGED'
) {
  const current = captureApprovalInputTopology({
    ownerPrivateApprovalRoot: inputs.ownerPrivateApprovalRoot,
    repositoryRoot: inputs.repositoryRoot,
    bindingPath: inputs.bindingPath,
    credentialPath: inputs.credentialPath,
    approvalPath: inputs.approvalPath,
    singleActionApprovalReceiptPath: inputs.singleActionApprovalReceiptPath,
    derivedExecutionBindingPath: inputs.derivedExecutionBindingPath,
  });
  if (canonicalJson(current) !== canonicalJson(inputs.approvalInputTopology)) {
    fail(code);
  }
  return current;
}

function directoryFingerprintFromIdentity(directory, identity, snapshotSha256) {
  return {
    pathSha256: windowsPathFingerprint(directory),
    resolvedPathSha256: sha256Text(identity.realPath),
    device: identity.device,
    inode: identity.inode,
    snapshotSha256,
  };
}

function emptyDirectoryFingerprint(directory, identity, code) {
  const before = statSync(directory);
  const entries = readdirSync(directory);
  const after = statSync(directory);
  if (
    !before.isDirectory() ||
    !after.isDirectory() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.mtimeMs !== after.mtimeMs ||
    entries.length !== 0
  ) {
    fail(code);
  }
  return directoryFingerprintFromIdentity(
    directory,
    identity,
    sha256Text(canonicalJson([]))
  );
}

function externalFileIdentity(pathname, snapshot) {
  const resolved = realpathSync.native(pathname);
  return {
    pathSha256: windowsPathFingerprint(pathname),
    resolvedPathSha256: windowsPathFingerprint(resolved),
    ...snapshot.identity,
    contentSha256: snapshot.sha256,
  };
}

function requireExactJournalRecord({
  directory,
  expectedEntries,
  expectedFilename,
  expectedRecord,
  expectedSha256,
  code,
}) {
  const entries = readdirSync(directory).sort();
  if (canonicalJson(entries) !== canonicalJson([...expectedEntries].sort())) {
    fail(code);
  }
  const pathname = path.join(directory, expectedFilename);
  if (lstatSync(pathname).isSymbolicLink() || !statSync(pathname).isFile()) {
    fail(code);
  }
  const contents = readFileSync(pathname, 'utf8');
  if (
    contents !== `${canonicalJson(expectedRecord)}\n` ||
    sha256Text(contents) !== expectedSha256
  ) {
    fail(code);
  }
}

function readCanonicalJournalRecord(directory, filename, expectedKeys, code) {
  const pathname = path.join(directory, filename);
  if (
    !existsSync(pathname) ||
    lstatSync(pathname).isSymbolicLink() ||
    !statSync(pathname).isFile()
  ) {
    fail(code);
  }
  const contents = readFileSync(pathname, 'utf8');
  let record;
  try {
    record = JSON.parse(contents);
  } catch {
    fail(code);
  }
  if (
    !isRecord(record) ||
    canonicalJson(Object.keys(record).sort()) !==
      canonicalJson([...expectedKeys].sort()) ||
    contents !== `${canonicalJson(record)}\n`
  ) {
    fail(code);
  }
  return { record, sha256: sha256Text(contents) };
}

export function readAndValidateJournalState(
  journalDirectory,
  expectedBindingMaterialSha256,
  expectedPayloadSha256,
  expectedDerivedExecutionBindingSha256
) {
  if (
    !/^[a-f0-9]{64}$/.test(expectedBindingMaterialSha256) ||
    !/^[a-f0-9]{64}$/.test(expectedPayloadSha256) ||
    !/^[a-f0-9]{64}$/.test(expectedDerivedExecutionBindingSha256)
  ) {
    fail('ACTION_JOURNAL_BINDING_INVALID');
  }
  const entries = readdirSync(journalDirectory).sort();
  const allowed = new Set([CLAIM_FILE, DISPATCH_FILE, OUTCOME_FILE]);
  if (entries.some(entry => !allowed.has(entry))) {
    fail('ACTION_JOURNAL_FILE_SET_INVALID');
  }
  if (!entries.includes(CLAIM_FILE)) {
    fail('ACTION_JOURNAL_CLAIM_MISSING');
  }
  const claim = readCanonicalJournalRecord(
    journalDirectory,
    CLAIM_FILE,
    [
      'actionId',
      'bindingMaterialSha256',
      'payloadSha256',
      'derivedExecutionBindingSha256',
      'claimedAt',
      'state',
    ],
    'ACTION_JOURNAL_CLAIM_INVALID'
  );
  if (
    claim.record.actionId !== ACTION_ID ||
    claim.record.bindingMaterialSha256 !== expectedBindingMaterialSha256 ||
    claim.record.payloadSha256 !== expectedPayloadSha256 ||
    claim.record.derivedExecutionBindingSha256 !==
      expectedDerivedExecutionBindingSha256 ||
    claim.record.state !== 'CLAIMED_POST_NOT_SENT' ||
    !isCanonicalTimestamp(claim.record.claimedAt)
  ) {
    fail('ACTION_JOURNAL_CLAIM_INVALID');
  }
  let postIntent = null;
  if (entries.includes(DISPATCH_FILE)) {
    postIntent = readCanonicalJournalRecord(
      journalDirectory,
      DISPATCH_FILE,
      [
        'actionId',
        'bindingMaterialSha256',
        'payloadSha256',
        'derivedExecutionBindingSha256',
        'postIntentAt',
        'state',
        'automaticRetryCount',
        'remoteContactCountBeforePost',
      ],
      'ACTION_JOURNAL_POST_INTENT_INVALID'
    );
    if (
      postIntent.record.actionId !== ACTION_ID ||
      postIntent.record.bindingMaterialSha256 !==
        expectedBindingMaterialSha256 ||
      postIntent.record.payloadSha256 !== expectedPayloadSha256 ||
      postIntent.record.derivedExecutionBindingSha256 !==
        expectedDerivedExecutionBindingSha256 ||
      postIntent.record.state !== 'POST_INTENT_DURABLE' ||
      postIntent.record.automaticRetryCount !== 0 ||
      !Number.isInteger(postIntent.record.remoteContactCountBeforePost) ||
      postIntent.record.remoteContactCountBeforePost < 2 ||
      !isCanonicalTimestamp(postIntent.record.postIntentAt) ||
      Date.parse(postIntent.record.postIntentAt) <
        Date.parse(claim.record.claimedAt)
    ) {
      fail('ACTION_JOURNAL_POST_INTENT_INVALID');
    }
  }
  if (entries.includes(OUTCOME_FILE)) {
    const terminal = readCanonicalJournalRecord(
      journalDirectory,
      OUTCOME_FILE,
      [
        'actionId',
        'bindingMaterialSha256',
        'payloadSha256',
        'derivedExecutionBindingSha256',
        'state',
        'reasonCode',
        'completedAt',
        'projectRef',
        'createPostAttemptCount',
        'automaticRetryCount',
        'automaticCleanupPerformed',
        'readOnlyReconciliation',
        'evidenceDirectoryName',
        'manifestSha256',
        'partialEvidenceDirectoryName',
      ],
      'ACTION_JOURNAL_TERMINAL_INVALID'
    );
    const allowedTerminalStates = new Set([
      'PASS_EVIDENCE_SEALED',
      'PRECHECK_ABORTED',
      'DUPLICATE_FOUND',
      'UNKNOWN_REMOTE_OUTCOME',
      'PARTIAL_FAILURE',
      'EVIDENCE_SEAL_FAILED_OWNER_DECISION_REQUIRED',
    ]);
    const evidenceDirectoryName = buildEvidenceDirectoryName(
      claim.record.claimedAt,
      claim.record.payloadSha256
    );
    const terminalHasSealedEvidence =
      terminal.record.evidenceDirectoryName !== null ||
      terminal.record.manifestSha256 !== null;
    const terminalHasPartialEvidence =
      terminal.record.partialEvidenceDirectoryName !== null;
    if (
      terminal.record.actionId !== ACTION_ID ||
      terminal.record.bindingMaterialSha256 !== expectedBindingMaterialSha256 ||
      terminal.record.payloadSha256 !== expectedPayloadSha256 ||
      terminal.record.derivedExecutionBindingSha256 !==
        expectedDerivedExecutionBindingSha256 ||
      !allowedTerminalStates.has(terminal.record.state) ||
      !isCanonicalTimestamp(terminal.record.completedAt) ||
      Date.parse(terminal.record.completedAt) <
        Date.parse(claim.record.claimedAt) ||
      ![0, 1].includes(terminal.record.createPostAttemptCount) ||
      terminal.record.automaticRetryCount !== 0 ||
      terminal.record.automaticCleanupPerformed !== false ||
      (terminal.record.projectRef !== null &&
        !/^[a-z]{20}$/.test(terminal.record.projectRef)) ||
      (terminal.record.reasonCode !== null &&
        (typeof terminal.record.reasonCode !== 'string' ||
          terminal.record.reasonCode.length === 0)) ||
      (terminal.record.createPostAttemptCount === 1 && postIntent === null) ||
      (terminal.record.createPostAttemptCount === 0 &&
        terminal.record.readOnlyReconciliation !== null) ||
      terminalHasSealedEvidence !==
        (terminal.record.evidenceDirectoryName !== null &&
          terminal.record.manifestSha256 !== null) ||
      (terminalHasSealedEvidence &&
        (terminal.record.evidenceDirectoryName !== evidenceDirectoryName ||
          !/^[a-f0-9]{64}$/.test(terminal.record.manifestSha256) ||
          terminalHasPartialEvidence)) ||
      (terminalHasPartialEvidence &&
        (typeof terminal.record.partialEvidenceDirectoryName !== 'string' ||
          !terminal.record.partialEvidenceDirectoryName.startsWith(
            `${evidenceDirectoryName}.partial-`
          ) ||
          terminalHasSealedEvidence))
    ) {
      fail('ACTION_JOURNAL_TERMINAL_INVALID');
    }
    if (
      terminal.record.state === 'PASS_EVIDENCE_SEALED'
        ? terminal.record.createPostAttemptCount !== 1 ||
          terminal.record.projectRef === null ||
          !terminalHasSealedEvidence ||
          ![null, 'PROCESS_INTERRUPTION_AFTER_EVIDENCE_SEAL'].includes(
            terminal.record.reasonCode
          ) ||
          terminal.record.readOnlyReconciliation !== null
        : terminal.record.reasonCode === null
    ) {
      fail('ACTION_JOURNAL_TERMINAL_INVALID');
    }
    if (
      terminal.record.state === 'EVIDENCE_SEAL_FAILED_OWNER_DECISION_REQUIRED'
        ? !terminalHasPartialEvidence || terminalHasSealedEvidence
        : terminalHasPartialEvidence
    ) {
      fail('ACTION_JOURNAL_TERMINAL_INVALID');
    }
    if (
      ['UNKNOWN_REMOTE_OUTCOME', 'PARTIAL_FAILURE'].includes(
        terminal.record.state
      ) &&
      (terminal.record.createPostAttemptCount !== 1 ||
        terminal.record.readOnlyReconciliation === null)
    ) {
      fail('ACTION_JOURNAL_TERMINAL_INVALID');
    }
    if (
      ['PRECHECK_ABORTED', 'DUPLICATE_FOUND'].includes(terminal.record.state) &&
      terminal.record.createPostAttemptCount !== 0
    ) {
      fail('ACTION_JOURNAL_TERMINAL_INVALID');
    }
    assertSecretFreeEvidence(terminal.record, []);
  }
  return {
    state: entries.includes(OUTCOME_FILE)
      ? 'TERMINAL_OUTCOME_RECORDED'
      : postIntent === null
        ? 'CLAIMED_POST_NOT_SENT'
        : 'POST_INTENT_DURABLE_OUTCOME_UNRESOLVED',
    claim: claim.record,
    claimSha256: claim.sha256,
    postIntent: postIntent?.record ?? null,
    postIntentSha256: postIntent?.sha256 ?? null,
  };
}

function ambientCredentialNames() {
  return Object.keys(process.env)
    .filter(isForbiddenAmbientCredentialName)
    .sort();
}

export function validateRuntimeCredentialValues(
  accessToken,
  databasePassword,
  minimumPasswordLength
) {
  if (typeof accessToken !== 'string' || accessToken.length < 20) {
    fail('MANAGEMENT_TOKEN_UNAVAILABLE');
  }
  if (
    typeof databasePassword !== 'string' ||
    databasePassword.length < minimumPasswordLength
  ) {
    fail('DATABASE_PASSWORD_UNAVAILABLE');
  }
  if (accessToken === databasePassword) {
    fail('CREDENTIAL_VALUES_MISWIRED');
  }
  return true;
}

function buildOfflineInputs(args) {
  const bindingPath = resolveJsonInput(
    args['--binding'],
    'BINDING_FILE_INVALID'
  );
  const bindingSnapshot = readFileSnapshot(bindingPath, 'BINDING_FILE_INVALID');
  const binding = parseJsonSnapshot(bindingSnapshot, 'BINDING_FILE_INVALID');
  assertSourceProjectProvisioningCandidate(binding);
  if (binding.governanceProposal?.path !== GOVERNANCE_RELATIVE_PATH) {
    fail('GOVERNANCE_PATH_INVALID');
  }
  const credentialPath = resolveJsonInput(
    args['--credential-config'],
    'CREDENTIAL_CONFIGURATION_FILE_INVALID'
  );
  const approvalPath = resolveJsonInput(
    args['--approval-evidence'],
    'APPROVAL_EVIDENCE_FILE_INVALID'
  );
  const singleActionApprovalReceiptPath = resolveJsonInput(
    args['--single-action-approval-receipt'],
    'SINGLE_ACTION_APPROVAL_RECEIPT_FILE_INVALID'
  );
  const derivedExecutionBindingPath = resolveJsonInput(
    args['--derived-execution-binding'],
    'DERIVED_EXECUTION_BINDING_FILE_INVALID'
  );
  const pricingPath = resolveJsonInput(
    args['--pricing-evidence'],
    'PRICING_EVIDENCE_FILE_INVALID'
  );
  if (
    !path.isAbsolute(args['--organization-identity-evidence-directory']) ||
    !path.isAbsolute(args['--organization-identity-terminal'])
  ) {
    fail('ORGANIZATION_IDENTITY_EVIDENCE_PATH_INVALID');
  }
  const organizationIdentityEvidenceDirectory = resolveExistingDirectory(
    args['--organization-identity-evidence-directory'],
    'ORGANIZATION_IDENTITY_EVIDENCE_DIRECTORY_INVALID'
  );
  const organizationIdentityTerminalPath = resolveJsonInput(
    args['--organization-identity-terminal'],
    'ORGANIZATION_IDENTITY_TERMINAL_INVALID'
  );
  const organizationIdentityJournalDirectory = path.dirname(
    organizationIdentityTerminalPath
  );
  const journalDirectory = resolveExistingDirectory(
    args['--journal-directory'],
    'ACTION_JOURNAL_DIRECTORY_INVALID'
  );
  const evidenceParent = resolveExistingDirectory(
    args['--evidence-parent'],
    'EVIDENCE_DIRECTORY_INVALID'
  );
  const ownerPrivateApprovalRoot = resolveExistingDirectory(
    args['--owner-private-approval-root'],
    'OWNER_PRIVATE_APPROVAL_ROOT_INVALID'
  );
  const repositoryRoot = runGit(
    ['rev-parse', '--show-toplevel'],
    'GIT_ROOT_INVALID'
  );
  const normalizedRepositoryRoot = path.resolve(repositoryRoot);
  const executingImplementationSnapshots =
    captureExecutingImplementationSnapshots(
      normalizedRepositoryRoot,
      'EXECUTING_IMPLEMENTATION_ROOT_MISMATCH'
    );
  for (const directory of [
    journalDirectory,
    evidenceParent,
    organizationIdentityEvidenceDirectory,
    organizationIdentityJournalDirectory,
    ownerPrivateApprovalRoot,
  ]) {
    const relative = path.relative(normalizedRepositoryRoot, directory);
    if (
      relative === '' ||
      (!relative.startsWith('..') && !path.isAbsolute(relative))
    ) {
      fail('RUNTIME_OUTPUT_DIRECTORY_INSIDE_REPOSITORY');
    }
  }
  const journalDirectoryIdentity = directoryIdentity(
    journalDirectory,
    'ACTION_JOURNAL_DIRECTORY_INVALID'
  );
  const evidenceParentDirectoryIdentity = directoryIdentity(
    evidenceParent,
    'EVIDENCE_DIRECTORY_INVALID'
  );
  const organizationIdentityEvidenceDirectoryIdentity = directoryIdentity(
    organizationIdentityEvidenceDirectory,
    'ORGANIZATION_IDENTITY_EVIDENCE_DIRECTORY_INVALID'
  );
  const organizationIdentityJournalDirectoryIdentity = directoryIdentity(
    organizationIdentityJournalDirectory,
    'ORGANIZATION_IDENTITY_TERMINAL_INVALID'
  );
  const ownerPrivateApprovalRootIdentity = directoryIdentity(
    ownerPrivateApprovalRoot,
    'OWNER_PRIVATE_APPROVAL_ROOT_INVALID'
  );
  const normalizedRepositoryRealPath = realpathSync
    .native(normalizedRepositoryRoot)
    .replaceAll('\\', '/')
    .toLowerCase();
  for (const identity of [
    journalDirectoryIdentity,
    evidenceParentDirectoryIdentity,
    organizationIdentityEvidenceDirectoryIdentity,
    organizationIdentityJournalDirectoryIdentity,
    ownerPrivateApprovalRootIdentity,
  ]) {
    const relative = path.relative(
      normalizedRepositoryRealPath,
      identity.realPath
    );
    if (
      relative === '' ||
      (!relative.startsWith('..') && !path.isAbsolute(relative))
    ) {
      fail('RUNTIME_OUTPUT_DIRECTORY_INSIDE_REPOSITORY');
    }
  }
  const directoryIdentities = [
    journalDirectoryIdentity,
    evidenceParentDirectoryIdentity,
    organizationIdentityEvidenceDirectoryIdentity,
    organizationIdentityJournalDirectoryIdentity,
    ownerPrivateApprovalRootIdentity,
  ];
  if (
    new Set(directoryIdentities.map(identity => canonicalJson(identity)))
      .size !== directoryIdentities.length
  ) {
    fail('RUNTIME_OUTPUT_DIRECTORIES_MUST_DIFFER');
  }
  const recoveryMode = args['--reconcile-dispatched-action'] === ACTION_ID;
  const actionJournalDirectoryFingerprint = recoveryMode
    ? directoryFingerprintFromIdentity(
        journalDirectory,
        journalDirectoryIdentity,
        binding.duplicateAndFailurePolicy?.actionJournalDirectoryFingerprint
          ?.snapshotSha256
      )
    : emptyDirectoryFingerprint(
        journalDirectory,
        journalDirectoryIdentity,
        'ACTION_JOURNAL_DIRECTORY_NOT_EMPTY'
      );
  const evidenceParentDirectoryFingerprint = recoveryMode
    ? directoryFingerprintFromIdentity(
        evidenceParent,
        evidenceParentDirectoryIdentity,
        binding.evidenceContract?.evidenceParentDirectoryFingerprint
          ?.snapshotSha256
      )
    : emptyDirectoryFingerprint(
        evidenceParent,
        evidenceParentDirectoryIdentity,
        'EVIDENCE_DIRECTORY_NOT_EMPTY'
      );
  const credentialSnapshot = readFileSnapshot(
    credentialPath,
    'CREDENTIAL_CONFIGURATION_FILE_INVALID'
  );
  const approvalSnapshot = readFileSnapshot(
    approvalPath,
    'APPROVAL_EVIDENCE_FILE_INVALID'
  );
  const singleActionApprovalReceiptSnapshot = readFileSnapshot(
    singleActionApprovalReceiptPath,
    'SINGLE_ACTION_APPROVAL_RECEIPT_FILE_INVALID'
  );
  const derivedExecutionBindingSnapshot = readFileSnapshot(
    derivedExecutionBindingPath,
    'DERIVED_EXECUTION_BINDING_FILE_INVALID'
  );
  const pricingSnapshot = readFileSnapshot(
    pricingPath,
    'PRICING_EVIDENCE_FILE_INVALID'
  );
  const organizationIdentityTerminalSnapshot = readFileSnapshot(
    organizationIdentityTerminalPath,
    'ORGANIZATION_IDENTITY_TERMINAL_INVALID'
  );
  const organizationIdentityVerified =
    verifyOrganizationIdentityCaptureTerminalLinkage(
      organizationIdentityEvidenceDirectory,
      organizationIdentityTerminalPath
    );
  if (
    organizationIdentityVerified.terminalSha256 !==
    organizationIdentityTerminalSnapshot.sha256
  ) {
    fail('ORGANIZATION_IDENTITY_TERMINAL_CHANGED');
  }
  const organizationIdentityEvidence = organizationIdentityVerified;
  const credentialConfiguration = parseJsonSnapshot(
    credentialSnapshot,
    'CREDENTIAL_CONFIGURATION_FILE_INVALID'
  );
  const approvalEvidence = parseJsonSnapshot(
    approvalSnapshot,
    'APPROVAL_EVIDENCE_FILE_INVALID'
  );
  const singleActionApprovalReceipt = parseJsonSnapshot(
    singleActionApprovalReceiptSnapshot,
    'SINGLE_ACTION_APPROVAL_RECEIPT_FILE_INVALID'
  );
  const derivedExecutionBinding = parseJsonSnapshot(
    derivedExecutionBindingSnapshot,
    'DERIVED_EXECUTION_BINDING_FILE_INVALID'
  );
  const pricingEvidence = parseJsonSnapshot(
    pricingSnapshot,
    'PRICING_EVIDENCE_FILE_INVALID'
  );
  const currentHead = runGit(['rev-parse', 'HEAD'], 'GIT_HEAD_UNAVAILABLE');
  const currentBaseCommit = runGit(
    ['merge-base', 'HEAD', 'origin/main'],
    'GIT_BASE_UNAVAILABLE'
  );
  const worktreeStatus = runGit(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    'GIT_STATUS_UNAVAILABLE'
  );
  const context = {
    currentHead,
    currentBaseCommit,
    worktreeClean: worktreeStatus.length === 0,
    nodeVersion: process.version,
    nodeExecArgv: [...process.execArgv],
    now: new Date().toISOString(),
    governanceSha256: sha256File(
      path.resolve(normalizedRepositoryRoot, GOVERNANCE_RELATIVE_PATH)
    ),
    contractSha256: executingImplementationSnapshots.contract.sha256,
    wrapperSha256: executingImplementationSnapshots.wrapper.sha256,
    organizationIdentityContractSha256:
      executingImplementationSnapshots.organizationIdentityContract.sha256,
    organizationIdentityVerifierSha256:
      executingImplementationSnapshots.organizationIdentityVerifier.sha256,
    credentialConfigurationSha256: credentialSnapshot.sha256,
    approvalEvidenceSha256: approvalSnapshot.sha256,
    bindingSha256: bindingSnapshot.sha256,
    initialApprovalReceiptSha256: singleActionApprovalReceiptSnapshot.sha256,
    derivedExecutionBindingSha256: derivedExecutionBindingSnapshot.sha256,
    pricingEvidenceSha256: pricingSnapshot.sha256,
    approvalEvidence,
    initialApprovalReceipt: singleActionApprovalReceipt,
    derivedExecutionBinding,
    pricingEvidence,
    organizationIdentityEvidence,
    organizationIdentitySourceGitCommitIsAncestor: isGitAncestor(
      organizationIdentityEvidence.sourceGitCommit,
      currentHead
    ),
    ambientCredentialNames: ambientCredentialNames(),
    priorActionState: inspectPriorActionState(journalDirectory),
    approvalStage: 'PRE_CLAIM',
    actionJournalDirectoryPathSha256:
      journalDirectoryFingerprint(journalDirectory),
    actionJournalDirectoryFingerprint,
    evidenceParentDirectoryPathSha256:
      journalDirectoryFingerprint(evidenceParent),
    evidenceParentDirectoryFingerprint,
    credentialConfigurationSourceIdentity: externalFileIdentity(
      credentialPath,
      credentialSnapshot
    ),
    pricingEvidenceSourceIdentity: externalFileIdentity(
      pricingPath,
      pricingSnapshot
    ),
  };
  const approvalInputTopology = captureApprovalInputTopology({
    ownerPrivateApprovalRoot,
    repositoryRoot: normalizedRepositoryRoot,
    bindingPath,
    credentialPath,
    approvalPath,
    singleActionApprovalReceiptPath,
    derivedExecutionBindingPath,
  });
  if (
    approvalInputTopology.files.binding.sha256 !== bindingSnapshot.sha256 ||
    approvalInputTopology.files.credentialConfiguration.sha256 !==
      credentialSnapshot.sha256 ||
    approvalInputTopology.files.authorizationProjection.sha256 !==
      approvalSnapshot.sha256 ||
    approvalInputTopology.files.singleActionApprovalReceipt.sha256 !==
      singleActionApprovalReceiptSnapshot.sha256 ||
    approvalInputTopology.files.derivedExecutionBinding.sha256 !==
      derivedExecutionBindingSnapshot.sha256
  ) {
    fail('APPROVAL_INPUT_TOPOLOGY_CHANGED');
  }
  return {
    approvalPath,
    singleActionApprovalReceiptPath,
    derivedExecutionBindingPath,
    binding,
    bindingPath,
    context,
    credentialConfiguration,
    credentialPath,
    evidenceParent,
    journalDirectory,
    organizationIdentityEvidenceDirectory,
    organizationIdentityJournalDirectory,
    organizationIdentityTerminalPath,
    ownerPrivateApprovalRoot,
    pricingPath,
    repositoryRoot: normalizedRepositoryRoot,
    immutableInputHashes: {
      binding: bindingSnapshot.sha256,
      credentialConfiguration: context.credentialConfigurationSha256,
      approvalEvidence: context.approvalEvidenceSha256,
      singleActionApprovalReceipt: context.initialApprovalReceiptSha256,
      derivedExecutionBinding: context.derivedExecutionBindingSha256,
      pricingEvidence: context.pricingEvidenceSha256,
      organizationIdentityTerminal: organizationIdentityTerminalSnapshot.sha256,
    },
    immutableInputIdentities: {
      binding: bindingSnapshot.identity,
      credentialConfiguration: credentialSnapshot.identity,
      approvalEvidence: approvalSnapshot.identity,
      singleActionApprovalReceipt: singleActionApprovalReceiptSnapshot.identity,
      derivedExecutionBinding: derivedExecutionBindingSnapshot.identity,
      pricingEvidence: pricingSnapshot.identity,
      organizationIdentityTerminal:
        organizationIdentityTerminalSnapshot.identity,
    },
    journalDirectoryIdentity,
    evidenceParentDirectoryIdentity,
    organizationIdentityEvidenceDirectoryIdentity,
    organizationIdentityJournalDirectoryIdentity,
    ownerPrivateApprovalRootIdentity,
    approvalInputTopology,
    executingImplementationSnapshots,
  };
}

function revalidateOrganizationIdentityEvidence(inputs) {
  requireSameDirectoryIdentity(
    inputs.organizationIdentityEvidenceDirectory,
    inputs.organizationIdentityEvidenceDirectoryIdentity,
    'ORGANIZATION_IDENTITY_EVIDENCE_CHANGED'
  );
  requireSameDirectoryIdentity(
    inputs.organizationIdentityJournalDirectory,
    inputs.organizationIdentityJournalDirectoryIdentity,
    'ORGANIZATION_IDENTITY_EVIDENCE_CHANGED'
  );
  const terminalSnapshot = readFileSnapshot(
    inputs.organizationIdentityTerminalPath,
    'ORGANIZATION_IDENTITY_TERMINAL_INVALID'
  );
  if (
    terminalSnapshot.sha256 !==
      inputs.immutableInputHashes.organizationIdentityTerminal ||
    canonicalJson(terminalSnapshot.identity) !==
      canonicalJson(
        inputs.immutableInputIdentities.organizationIdentityTerminal
      )
  ) {
    fail('ORGANIZATION_IDENTITY_EVIDENCE_CHANGED');
  }
  const verified = verifyOrganizationIdentityCaptureTerminalLinkage(
    inputs.organizationIdentityEvidenceDirectory,
    inputs.organizationIdentityTerminalPath
  );
  const current = verified;
  if (
    canonicalJson(current) !==
    canonicalJson(inputs.context.organizationIdentityEvidence)
  ) {
    fail('ORGANIZATION_IDENTITY_EVIDENCE_CHANGED');
  }
  return current;
}

function prepareValidatedLocalResources(inputs) {
  requireSameExecutingImplementationSnapshots(
    inputs,
    'EXECUTING_IMPLEMENTATION_CHANGED'
  );
  requireSameDirectoryIdentity(
    inputs.ownerPrivateApprovalRoot,
    inputs.ownerPrivateApprovalRootIdentity,
    'OWNER_PRIVATE_APPROVAL_ROOT_CHANGED'
  );
  revalidateApprovalInputTopology(inputs);
  revalidateOrganizationIdentityEvidence(inputs);
  inputs.pricingSourceArtifacts = snapshotOfficialPricingSources(inputs);
  inputs.dpapiResources = validateDpapiCredentialResources(
    inputs.credentialConfiguration,
    inputs.repositoryRoot
  );
  assertDpapiDirectoryIsolation(
    inputs.dpapiResources.providerRootIdentity,
    inputs.journalDirectoryIdentity,
    inputs.evidenceParentDirectoryIdentity
  );
  assertDpapiDirectoryIsolation(
    inputs.dpapiResources.providerRootIdentity,
    inputs.organizationIdentityEvidenceDirectoryIdentity,
    inputs.organizationIdentityJournalDirectoryIdentity
  );
  assertDpapiDirectoryIsolation(
    inputs.journalDirectoryIdentity,
    inputs.organizationIdentityEvidenceDirectoryIdentity,
    inputs.organizationIdentityJournalDirectoryIdentity
  );
  assertDpapiDirectoryIsolation(
    inputs.evidenceParentDirectoryIdentity,
    inputs.organizationIdentityEvidenceDirectoryIdentity,
    inputs.organizationIdentityJournalDirectoryIdentity
  );
  return inputs;
}

function revalidatePreparedLocalResources(inputs) {
  const currentImplementationSnapshots =
    requireSameExecutingImplementationSnapshots(
      inputs,
      'EXECUTING_IMPLEMENTATION_CHANGED'
    );
  requireSameDirectoryIdentity(
    inputs.journalDirectory,
    inputs.journalDirectoryIdentity,
    'ACTION_JOURNAL_DIRECTORY_CHANGED'
  );
  requireSameDirectoryIdentity(
    inputs.evidenceParent,
    inputs.evidenceParentDirectoryIdentity,
    'EVIDENCE_DIRECTORY_CHANGED'
  );
  requireSameDirectoryIdentity(
    inputs.ownerPrivateApprovalRoot,
    inputs.ownerPrivateApprovalRootIdentity,
    'OWNER_PRIVATE_APPROVAL_ROOT_CHANGED'
  );
  revalidateApprovalInputTopology(inputs);
  revalidateOrganizationIdentityEvidence(inputs);
  revalidateOfficialPricingSources(inputs);
  inputs.dpapiResources = revalidateDpapiCredentialResources(
    inputs.credentialConfiguration,
    inputs.repositoryRoot,
    inputs.dpapiResources
  );
  assertDpapiDirectoryIsolation(
    inputs.dpapiResources.providerRootIdentity,
    inputs.journalDirectoryIdentity,
    inputs.evidenceParentDirectoryIdentity
  );
  assertDpapiDirectoryIsolation(
    inputs.dpapiResources.providerRootIdentity,
    inputs.organizationIdentityEvidenceDirectoryIdentity,
    inputs.organizationIdentityJournalDirectoryIdentity
  );
  assertDpapiDirectoryIsolation(
    inputs.journalDirectoryIdentity,
    inputs.organizationIdentityEvidenceDirectoryIdentity,
    inputs.organizationIdentityJournalDirectoryIdentity
  );
  assertDpapiDirectoryIsolation(
    inputs.evidenceParentDirectoryIdentity,
    inputs.organizationIdentityEvidenceDirectoryIdentity,
    inputs.organizationIdentityJournalDirectoryIdentity
  );
  return currentImplementationSnapshots;
}

function revalidateImmutableApprovalInputs(
  inputs,
  code = 'APPROVAL_INPUT_CHANGED_BEFORE_REMOTE_CONTACT'
) {
  const currentSnapshots = {
    binding: readFileSnapshot(inputs.bindingPath, 'BINDING_FILE_INVALID'),
    credentialConfiguration: readFileSnapshot(
      inputs.credentialPath,
      'CREDENTIAL_CONFIGURATION_FILE_INVALID'
    ),
    approvalEvidence: readFileSnapshot(
      inputs.approvalPath,
      'APPROVAL_EVIDENCE_FILE_INVALID'
    ),
    singleActionApprovalReceipt: readFileSnapshot(
      inputs.singleActionApprovalReceiptPath,
      'SINGLE_ACTION_APPROVAL_RECEIPT_FILE_INVALID'
    ),
    derivedExecutionBinding: readFileSnapshot(
      inputs.derivedExecutionBindingPath,
      'DERIVED_EXECUTION_BINDING_FILE_INVALID'
    ),
    pricingEvidence: readFileSnapshot(
      inputs.pricingPath,
      'PRICING_EVIDENCE_FILE_INVALID'
    ),
    organizationIdentityTerminal: readFileSnapshot(
      inputs.organizationIdentityTerminalPath,
      'ORGANIZATION_IDENTITY_TERMINAL_INVALID'
    ),
  };
  const currentHashes = {
    binding: currentSnapshots.binding.sha256,
    credentialConfiguration: currentSnapshots.credentialConfiguration.sha256,
    approvalEvidence: currentSnapshots.approvalEvidence.sha256,
    singleActionApprovalReceipt:
      currentSnapshots.singleActionApprovalReceipt.sha256,
    derivedExecutionBinding: currentSnapshots.derivedExecutionBinding.sha256,
    pricingEvidence: currentSnapshots.pricingEvidence.sha256,
    organizationIdentityTerminal:
      currentSnapshots.organizationIdentityTerminal.sha256,
  };
  const currentIdentities = {
    binding: currentSnapshots.binding.identity,
    credentialConfiguration: currentSnapshots.credentialConfiguration.identity,
    approvalEvidence: currentSnapshots.approvalEvidence.identity,
    singleActionApprovalReceipt:
      currentSnapshots.singleActionApprovalReceipt.identity,
    derivedExecutionBinding: currentSnapshots.derivedExecutionBinding.identity,
    pricingEvidence: currentSnapshots.pricingEvidence.identity,
    organizationIdentityTerminal:
      currentSnapshots.organizationIdentityTerminal.identity,
  };
  if (
    canonicalJson(currentHashes) !==
      canonicalJson(inputs.immutableInputHashes) ||
    canonicalJson(currentIdentities) !==
      canonicalJson(inputs.immutableInputIdentities)
  ) {
    fail(code);
  }
  return true;
}

function revalidateExecutionStateBeforeRemoteContact(inputs) {
  revalidateImmutableApprovalInputs(inputs);
  const currentImplementationSnapshots =
    revalidatePreparedLocalResources(inputs);
  const currentHead = runGit(['rev-parse', 'HEAD'], 'GIT_HEAD_UNAVAILABLE');
  const currentBaseCommit = runGit(
    ['merge-base', 'HEAD', 'origin/main'],
    'GIT_BASE_UNAVAILABLE'
  );
  const worktreeStatus = runGit(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    'GIT_STATUS_UNAVAILABLE'
  );
  const priorActionState = inspectPriorActionState(inputs.journalDirectory);
  const approvalStage =
    priorActionState === 'CLAIMED_POST_NOT_SENT'
      ? 'POST_CLAIM'
      : priorActionState === 'POST_INTENT_DURABLE_OUTCOME_UNRESOLVED'
        ? 'RECOVERY'
        : null;
  if (approvalStage === null) {
    fail('ACTION_JOURNAL_STATE_INVALID');
  }
  return validateOfflineApproval(
    inputs.binding,
    inputs.credentialConfiguration,
    {
      ...inputs.context,
      now: new Date().toISOString(),
      currentHead,
      currentBaseCommit,
      worktreeClean: worktreeStatus.length === 0,
      governanceSha256: sha256File(
        path.resolve(inputs.repositoryRoot, GOVERNANCE_RELATIVE_PATH)
      ),
      contractSha256: currentImplementationSnapshots.contract.sha256,
      wrapperSha256: currentImplementationSnapshots.wrapper.sha256,
      organizationIdentityContractSha256:
        currentImplementationSnapshots.organizationIdentityContract.sha256,
      organizationIdentityVerifierSha256:
        currentImplementationSnapshots.organizationIdentityVerifier.sha256,
      organizationIdentitySourceGitCommitIsAncestor: isGitAncestor(
        inputs.context.organizationIdentityEvidence.sourceGitCommit,
        currentHead
      ),
      ambientCredentialNames: ambientCredentialNames(),
      priorActionState,
      approvalStage,
    }
  );
}

function revalidateImmediatelyBeforePost(
  inputs,
  expectedClaim,
  expectedClaimSha256
) {
  const currentImplementationSnapshots =
    requireSameExecutingImplementationSnapshots(
      inputs,
      'EXECUTING_IMPLEMENTATION_CHANGED'
    );
  requireSameDirectoryIdentity(
    inputs.journalDirectory,
    inputs.journalDirectoryIdentity,
    'ACTION_JOURNAL_DIRECTORY_CHANGED'
  );
  requireSameDirectoryIdentity(
    inputs.evidenceParent,
    inputs.evidenceParentDirectoryIdentity,
    'EVIDENCE_DIRECTORY_CHANGED'
  );
  requireExactJournalRecord({
    directory: inputs.journalDirectory,
    expectedEntries: [CLAIM_FILE],
    expectedFilename: CLAIM_FILE,
    expectedRecord: expectedClaim,
    expectedSha256: expectedClaimSha256,
    code: 'ACTION_JOURNAL_CLAIM_CHANGED',
  });
  revalidateImmutableApprovalInputs(
    inputs,
    'APPROVAL_INPUT_CHANGED_BEFORE_POST'
  );
  revalidatePreparedLocalResources(inputs);
  const currentHead = runGit(['rev-parse', 'HEAD'], 'GIT_HEAD_UNAVAILABLE');
  const currentBaseCommit = runGit(
    ['merge-base', 'HEAD', 'origin/main'],
    'GIT_BASE_UNAVAILABLE'
  );
  const worktreeStatus = runGit(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    'GIT_STATUS_UNAVAILABLE'
  );
  const validation = validateOfflineApproval(
    inputs.binding,
    inputs.credentialConfiguration,
    {
      ...inputs.context,
      now: new Date().toISOString(),
      currentHead,
      currentBaseCommit,
      worktreeClean: worktreeStatus.length === 0,
      governanceSha256: sha256File(
        path.resolve(inputs.repositoryRoot, GOVERNANCE_RELATIVE_PATH)
      ),
      contractSha256: currentImplementationSnapshots.contract.sha256,
      wrapperSha256: currentImplementationSnapshots.wrapper.sha256,
      organizationIdentityContractSha256:
        currentImplementationSnapshots.organizationIdentityContract.sha256,
      organizationIdentityVerifierSha256:
        currentImplementationSnapshots.organizationIdentityVerifier.sha256,
      organizationIdentitySourceGitCommitIsAncestor: isGitAncestor(
        inputs.context.organizationIdentityEvidence.sourceGitCommit,
        currentHead
      ),
      ambientCredentialNames: ambientCredentialNames(),
      priorActionState: inspectPriorActionState(inputs.journalDirectory),
      approvalStage: 'POST_CLAIM',
    }
  );
  requireSameDirectoryIdentity(
    inputs.journalDirectory,
    inputs.journalDirectoryIdentity,
    'ACTION_JOURNAL_DIRECTORY_CHANGED'
  );
  requireExactJournalRecord({
    directory: inputs.journalDirectory,
    expectedEntries: [CLAIM_FILE],
    expectedFilename: CLAIM_FILE,
    expectedRecord: expectedClaim,
    expectedSha256: expectedClaimSha256,
    code: 'ACTION_JOURNAL_CLAIM_CHANGED',
  });
  if (
    Date.parse(inputs.binding.approval.expiresAt) - Date.now() <=
    inputs.binding.provisioningAction.requestTimeoutMilliseconds
  ) {
    fail('APPROVAL_EXPIRY_MARGIN_INSUFFICIENT');
  }
  return validation;
}

function validatePostIntentImmediatelyBeforeFetch({
  inputs,
  expectedClaim,
  expectedClaimSha256,
  expectedIntent,
  expectedIntentSha256,
}) {
  revalidateExecutionStateBeforeRemoteContact(inputs);
  requireSameDirectoryIdentity(
    inputs.journalDirectory,
    inputs.journalDirectoryIdentity,
    'ACTION_JOURNAL_DIRECTORY_CHANGED'
  );
  requireExactJournalRecord({
    directory: inputs.journalDirectory,
    expectedEntries: [CLAIM_FILE, DISPATCH_FILE],
    expectedFilename: CLAIM_FILE,
    expectedRecord: expectedClaim,
    expectedSha256: expectedClaimSha256,
    code: 'ACTION_JOURNAL_CLAIM_CHANGED',
  });
  requireExactJournalRecord({
    directory: inputs.journalDirectory,
    expectedEntries: [CLAIM_FILE, DISPATCH_FILE],
    expectedFilename: DISPATCH_FILE,
    expectedRecord: expectedIntent,
    expectedSha256: expectedIntentSha256,
    code: 'ACTION_JOURNAL_POST_INTENT_CHANGED',
  });
  revalidateOfficialPricingSources(inputs);
  if (Date.now() >= Date.parse(inputs.binding.approval.expiresAt)) {
    fail('APPROVAL_EXPIRED_BEFORE_POST');
  }
}

function writeJsonExclusive(pathname, value, forbiddenValues = []) {
  assertSecretFreeEvidence(value, forbiddenValues);
  const contents = `${canonicalJson(value)}\n`;
  writeFileSync(pathname, contents, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
    flush: true,
  });
  const metadata = {
    bytes: Buffer.byteLength(contents, 'utf8'),
    sha256: sha256Text(contents),
  };
  if (
    lstatSync(pathname).isSymbolicLink() ||
    !statSync(pathname).isFile() ||
    statSync(pathname).size !== metadata.bytes ||
    sha256File(pathname) !== metadata.sha256
  ) {
    fail('DURABLE_WRITE_VERIFICATION_FAILED');
  }
  return metadata;
}

function writeJournalEvent(journalDirectory, filename, value) {
  return writeJsonExclusive(path.join(journalDirectory, filename), value, []);
}

async function readBoundedProviderBody(response) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(contentLength.trim())) {
      fail('PROVIDER_CONTENT_LENGTH_INVALID');
    }
    if (Number(contentLength) > MAX_PROVIDER_BODY_BYTES) {
      fail('PROVIDER_BODY_SIZE_INVALID');
    }
  }
  if (response.body === null) {
    return { bodyText: '', bodySha256: sha256Text('') };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) {
        fail('PROVIDER_RESPONSE_READ_FAILED');
      }
      totalBytes += item.value.byteLength;
      if (totalBytes > MAX_PROVIDER_BODY_BYTES) {
        try {
          await reader.cancel('PROVIDER_BODY_SIZE_INVALID');
        } catch {
          // The bounded reader is already fail-closed; cancellation is best effort.
        }
        fail('PROVIDER_BODY_SIZE_INVALID');
      }
      chunks.push(Buffer.from(item.value));
    }
  } catch (error) {
    if (error instanceof SafeExecutionError) throw error;
    fail('PROVIDER_RESPONSE_READ_FAILED');
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already be errored or cancelled.
    }
  }
  const bytes = Buffer.concat(chunks, totalBytes);
  let bodyText;
  try {
    bodyText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('PROVIDER_RESPONSE_INVALID_UTF8');
  }
  return {
    bodyText,
    bodySha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export async function readJsonProviderResponse(response, expectedStatus) {
  if (response.status !== expectedStatus) {
    return {
      accepted: false,
      bodySha256: null,
      httpStatus: response.status,
      parsed: null,
    };
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!isJsonMediaType(contentType)) {
    fail('PROVIDER_CONTENT_TYPE_INVALID');
  }
  const { bodyText, bodySha256 } = await readBoundedProviderBody(response);
  const parsed = assertProviderBodyEnvelope(contentType, bodyText);
  return {
    accepted: true,
    bodySha256,
    httpStatus: response.status,
    parsed,
  };
}

export function assertRemoteContactWithinApproval(
  expiresAt,
  now,
  minimumRemainingMilliseconds = 0
) {
  if (
    !isCanonicalTimestamp(expiresAt) ||
    !isCanonicalTimestamp(now) ||
    !Number.isInteger(minimumRemainingMilliseconds) ||
    minimumRemainingMilliseconds < 0 ||
    Date.parse(expiresAt) - Date.parse(now) <= minimumRemainingMilliseconds
  ) {
    fail('APPROVAL_EXPIRED_BEFORE_REMOTE_CONTACT');
  }
  return true;
}

export function assertMutationPricingCurrent(
  pricingFreshThrough,
  now,
  requestTimeoutMilliseconds
) {
  if (
    !isCanonicalTimestamp(pricingFreshThrough) ||
    !isCanonicalTimestamp(now) ||
    !Number.isInteger(requestTimeoutMilliseconds) ||
    requestTimeoutMilliseconds < 1 ||
    Date.parse(pricingFreshThrough) - Date.parse(now) <=
      requestTimeoutMilliseconds
  ) {
    fail('PRICING_EVIDENCE_EXPIRED_BEFORE_POST');
  }
  return true;
}

async function providerFetch(
  url,
  options,
  accessToken,
  timeoutMilliseconds,
  approvalExpiresAt,
  onRemoteContact,
  pricingFreshThrough = null,
  binding,
  createdProjectRef = null,
  beforeRemoteContact
) {
  if (
    typeof beforeRemoteContact !== 'function' ||
    typeof onRemoteContact !== 'function'
  ) {
    fail('REMOTE_CONTACT_GUARD_REQUIRED');
  }
  assertAllowedManagementApiRequest({
    url,
    method: options.method,
    binding,
    createdProjectRef,
  });
  beforeRemoteContact();
  const remoteContactAt = new Date().toISOString();
  assertRemoteContactWithinApproval(
    approvalExpiresAt,
    remoteContactAt,
    options.method === 'POST' ? timeoutMilliseconds : 0
  );
  if (options.method === 'POST') {
    assertMutationPricingCurrent(
      pricingFreshThrough,
      remoteContactAt,
      timeoutMilliseconds
    );
  }
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    ...(options.body === undefined
      ? {}
      : { 'Content-Type': 'application/json' }),
  };
  onRemoteContact();
  return fetch(url, {
    ...options,
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMilliseconds),
  });
}

async function fetchReadOnlyProjection({
  url,
  accessToken,
  timeoutMilliseconds,
  approvalExpiresAt,
  onRemoteContact,
  beforeRemoteContact,
  projector,
  binding,
  createdProjectRef = null,
}) {
  let response;
  try {
    response = await providerFetch(
      url,
      { method: 'GET' },
      accessToken,
      timeoutMilliseconds,
      approvalExpiresAt,
      onRemoteContact,
      null,
      binding,
      createdProjectRef,
      beforeRemoteContact
    );
  } catch (error) {
    if (error instanceof SafeExecutionError) throw error;
    fail('READ_ONLY_PROVIDER_CONTACT_FAILED');
  }
  const envelope = await readJsonProviderResponse(response, 200);
  if (!envelope.accepted) fail('READ_ONLY_PROVIDER_RESPONSE_REJECTED');
  return {
    bodySha256: envelope.bodySha256,
    httpStatus: envelope.httpStatus,
    projection: projector(envelope.parsed),
  };
}

export function advanceProjectPaginationState(stateInput, projectionInput) {
  if (!isRecord(stateInput) || !isRecord(projectionInput)) {
    fail('PROJECT_LIST_PAGINATION_INVALID');
  }
  const pagination = projectionInput.pagination;
  const projects = projectionInput.projects;
  if (
    !isRecord(pagination) ||
    !Array.isArray(projects) ||
    !Array.isArray(stateInput.seenProjectRefs) ||
    !Number.isInteger(stateInput.nextOffset) ||
    stateInput.nextOffset < 0 ||
    (stateInput.expectedCount !== null &&
      (!Number.isInteger(stateInput.expectedCount) ||
        stateInput.expectedCount < 0)) ||
    !Number.isInteger(pagination.count) ||
    pagination.count < 0 ||
    !Number.isInteger(pagination.offset) ||
    pagination.offset !== stateInput.nextOffset ||
    !Number.isInteger(pagination.limit) ||
    pagination.limit < 1 ||
    projects.length > pagination.limit ||
    pagination.offset + projects.length > pagination.count ||
    (stateInput.expectedCount !== null &&
      pagination.count !== stateInput.expectedCount)
  ) {
    fail('PROJECT_LIST_PAGINATION_INVALID');
  }
  const seen = new Set(stateInput.seenProjectRefs);
  if (seen.size !== stateInput.seenProjectRefs.length) {
    fail('PROJECT_LIST_PAGINATION_INVALID');
  }
  for (const project of projects) {
    if (
      !isRecord(project) ||
      typeof project.projectRef !== 'string' ||
      seen.has(project.projectRef)
    ) {
      fail('PROJECT_LIST_PAGINATION_INVALID');
    }
    seen.add(project.projectRef);
  }
  return {
    expectedCount: pagination.count,
    nextOffset: pagination.offset + projects.length,
    seenProjectRefs: [...seen],
  };
}

async function listAllOrganizationProjects(
  binding,
  accessToken,
  timeoutMilliseconds,
  onRemoteContact,
  beforeRemoteContact
) {
  if (
    typeof beforeRemoteContact !== 'function' ||
    typeof onRemoteContact !== 'function'
  ) {
    fail('REMOTE_CONTACT_GUARD_REQUIRED');
  }
  const organizationSlug = binding.environmentProposal.organizationSlug;
  const pages = [];
  const targetMatches = [];
  let protectedProductionProjectCount = 0;
  let paginationState = {
    expectedCount: null,
    nextOffset: 0,
    seenProjectRefs: [],
  };
  for (let pageNumber = 0; pageNumber < 1_000; pageNumber += 1) {
    const url = new URL(
      `/v1/organizations/${encodeURIComponent(organizationSlug)}/projects`,
      'https://api.supabase.com'
    );
    url.searchParams.set('offset', String(paginationState.nextOffset));
    url.searchParams.set('limit', '100');
    url.searchParams.set('sort', 'name_asc');
    const result = await fetchReadOnlyProjection({
      url,
      accessToken,
      timeoutMilliseconds,
      approvalExpiresAt: binding.approval.expiresAt,
      onRemoteContact,
      beforeRemoteContact,
      projector: body => organizationProjectPageToSafeProjection(body, binding),
      binding,
    });
    const projection = result.projection;
    paginationState = advanceProjectPaginationState(
      paginationState,
      projection
    );
    const currentMatches = projection.projects.filter(
      project =>
        project.projectName === binding.environmentProposal.projectName &&
        project.isBranch === false
    );
    targetMatches.push(...currentMatches);
    protectedProductionProjectCount +=
      projection.protectedProductionProjectCount;
    pages.push({
      bodySha256: result.bodySha256,
      httpStatus: result.httpStatus,
      offset: projection.pagination.offset,
      limit: projection.pagination.limit,
      totalCount: projection.pagination.count,
      returnedCount: projection.projects.length,
      protectedProductionProjectCount:
        projection.protectedProductionProjectCount,
      safeProjectionSha256: sha256Canonical(projection),
    });
    if (paginationState.nextOffset >= paginationState.expectedCount) break;
    if (projection.projects.length === 0)
      fail('PROJECT_LIST_PAGINATION_INVALID');
  }
  if (
    paginationState.expectedCount === null ||
    paginationState.nextOffset < paginationState.expectedCount
  ) {
    fail('PROJECT_LIST_PAGINATION_INCOMPLETE');
  }
  if (protectedProductionProjectCount !== 1) {
    fail('PRODUCTION_PROJECT_NOT_UNIQUELY_OBSERVED');
  }
  return {
    pages,
    targetMatches,
    totalCount: paginationState.expectedCount,
    protectedProductionProjectCount,
  };
}

async function reconcileAfterPostAttempt({
  accessToken,
  binding,
  expectedProjectRef,
  onRemoteContact,
  beforeRemoteContact,
  timeoutMilliseconds,
}) {
  const observedAt = new Date().toISOString();
  try {
    const observation = await listAllOrganizationProjects(
      binding,
      accessToken,
      timeoutMilliseconds,
      onRemoteContact,
      beforeRemoteContact
    );
    const matches = observation.targetMatches;
    let state = 'PROJECT_NOT_OBSERVED_OWNER_DECISION_REQUIRED';
    if (matches.length > 1) {
      state = 'MULTIPLE_PROJECTS_OBSERVED_OWNER_DECISION_REQUIRED';
    } else if (matches.length === 1) {
      state =
        expectedProjectRef !== null &&
        matches[0].projectRef !== expectedProjectRef
          ? 'PROJECT_IDENTITY_MISMATCH_OWNER_DECISION_REQUIRED'
          : 'PROJECT_OBSERVED_OWNER_DECISION_REQUIRED';
    }
    return {
      state,
      observedAt,
      projectCount: observation.totalCount,
      protectedProductionProjectCount:
        observation.protectedProductionProjectCount,
      matchingProjects: matches,
      projectListPages: observation.pages,
      automaticPostRetryPerformed: false,
      automaticCleanupPerformed: false,
    };
  } catch (error) {
    return {
      state: 'READ_ONLY_RECONCILIATION_FAILED_OWNER_DECISION_REQUIRED',
      observedAt,
      reasonCode: safeErrorCode(error),
      projectCount: null,
      protectedProductionProjectCount: 0,
      matchingProjects: [],
      projectListPages: [],
      automaticPostRetryPerformed: false,
      automaticCleanupPerformed: false,
    };
  }
}

function buildEvidenceDirectoryName(timestamp, payloadSha256) {
  const compactTimestamp = timestamp
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('.', '-');
  return `pr12-action-003-${compactTimestamp}-${payloadSha256.slice(0, 12)}`;
}

function makeEvidenceDirectory(evidenceParent, timestamp, payloadSha256) {
  const directoryName = buildEvidenceDirectoryName(timestamp, payloadSha256);
  const finalDirectory = path.join(evidenceParent, directoryName);
  if (existsSync(finalDirectory)) fail('EVIDENCE_DIRECTORY_ALREADY_EXISTS');
  const partialDirectoryName = `${directoryName}.partial-${process.pid}`;
  const directory = path.join(evidenceParent, partialDirectoryName);
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  return {
    directory,
    directoryName,
    finalDirectory,
    partialDirectoryName,
  };
}

export function retainEvidenceAfterSealFailure(
  partialDirectory,
  finalDirectory,
  renamedToFinal
) {
  if (
    typeof partialDirectory !== 'string' ||
    typeof finalDirectory !== 'string' ||
    typeof renamedToFinal !== 'boolean' ||
    !path.isAbsolute(partialDirectory) ||
    !path.isAbsolute(finalDirectory)
  ) {
    return null;
  }
  try {
    if (renamedToFinal) {
      if (existsSync(partialDirectory) || !existsSync(finalDirectory)) {
        return null;
      }
      renameSync(finalDirectory, partialDirectory);
    }
    if (
      !existsSync(partialDirectory) ||
      lstatSync(partialDirectory).isSymbolicLink() ||
      !statSync(partialDirectory).isDirectory()
    ) {
      return null;
    }
    return path.basename(partialDirectory);
  } catch {
    return null;
  }
}

function sealEvidence({
  binding,
  directory,
  events,
  outcome,
  providerExport,
  result,
  forbiddenValues,
  finalDirectory,
}) {
  let renamedToFinal = false;
  try {
    const availableRuntimeSecretValues = forbiddenValues.filter(
      value => typeof value === 'string' && value.length > 0
    );
    const artifactMetadata = [];
    const writeArtifact = (
      filename,
      value,
      classification = 'INTERNAL_NO_PII'
    ) => {
      const metadata = writeJsonExclusive(
        path.join(directory, filename),
        value,
        forbiddenValues
      );
      artifactMetadata.push({
        path: filename,
        bytes: metadata.bytes,
        sha256: metadata.sha256,
        classification,
      });
      return metadata;
    };
    writeArtifact('action-events.json', {
      schemaVersion: 1,
      actionId: ACTION_ID,
      outcome,
      events,
    });
    const providerMetadata = writeArtifact(
      'provider-export.safe.json',
      providerExport,
      'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS'
    );
    result.providerEvidence = {
      path: 'provider-export.safe.json',
      sha256: providerMetadata.sha256,
    };
    writeArtifact(
      'provisioning-result.json',
      result,
      'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS'
    );
    const privacyScan = {
      schemaVersion: 1,
      scanType: 'PR12_PHASE1_EVIDENCE_PRIVACY_AND_SECRET_SCAN',
      status: 'PASS',
      scanner: 'pr12-source-project-provisioning-contract-v1',
      rawProviderBodiesPersisted: false,
      rawHttpHeadersPersisted: false,
      runtimeSecretValuesComparedAgainstArtifacts: true,
      runtimeSecretValueCount: availableRuntimeSecretValues.length,
      scanMode:
        availableRuntimeSecretValues.length === 0
          ? 'STRUCTURAL_ONLY_NO_RUNTIME_VALUES_AVAILABLE'
          : 'STRUCTURAL_AND_AVAILABLE_RUNTIME_VALUES',
      scannedArtifacts: artifactMetadata.map(artifact => ({
        path: artifact.path,
        bytes: artifact.bytes,
        sha256: artifact.sha256,
      })),
      scannedAt: new Date().toISOString(),
    };
    writeArtifact('privacy-scan.json', privacyScan);
    const manifest = {
      schemaVersion: 1,
      manifestType: 'PR12_PHASE1_SOURCE_PROJECT_PROVISIONING_EVIDENCE',
      status: outcome,
      actionId: ACTION_ID,
      gitCommit: binding.target.gitCommit,
      bindingMaterialSha256: binding.approval.derivedBindingMaterialSha256,
      payloadSha256: binding.approvedRequest.sha256,
      derivedExecutionBindingSha256:
        result.approvalWindow.derivedExecutionBindingSha256,
      fundingSource: binding.retentionAndCleanupDecision.fundingSource,
      artifacts: artifactMetadata,
      artifactCount: artifactMetadata.length,
      rawProviderBodiesPersisted: false,
      rawHttpHeadersPersisted: false,
      sealedAt: new Date().toISOString(),
    };
    const manifestMetadata = writeJsonExclusive(
      path.join(directory, 'manifest.json'),
      manifest,
      forbiddenValues
    );
    writeFileSync(
      path.join(directory, 'manifest.sha256'),
      `${manifestMetadata.sha256}  manifest.json\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600, flush: true }
    );
    verifyProvisioningEvidenceDirectory(
      directory,
      availableRuntimeSecretValues
    );
    if (existsSync(finalDirectory)) fail('EVIDENCE_DIRECTORY_ALREADY_EXISTS');
    renameSync(directory, finalDirectory);
    renamedToFinal = true;
    verifyProvisioningEvidenceDirectory(
      finalDirectory,
      availableRuntimeSecretValues
    );
    return {
      artifactCount: artifactMetadata.length + 2,
      evidenceDirectory: finalDirectory,
      manifestSha256: manifestMetadata.sha256,
    };
  } catch (error) {
    const retainedPartialEvidenceDirectoryName = retainEvidenceAfterSealFailure(
      directory,
      finalDirectory,
      renamedToFinal
    );
    throw new EvidenceSealError(
      safeErrorCode(error),
      retainedPartialEvidenceDirectoryName
    );
  }
}

function makeBaseResult(binding, validation, startedAt, claimSha256) {
  return {
    schemaVersion: 6,
    phase: 'SOURCE_PROJECT_PROVISIONING_RESULT',
    resultType: 'SOURCE_PROJECT_PROVISIONING_OPERATION',
    status: 'NOT_RUN',
    actionId: ACTION_ID,
    gitCommit: binding.target.gitCommit,
    bindingMaterialSha256: validation.bindingMaterialSha256,
    payloadSha256: validation.payloadSha256,
    operator: binding.owners.provisioningOperator,
    approver: binding.approval.authorityPrincipalId,
    operatorDisplayName: binding.operatorControl.principalDisplayName,
    operatorControlMode: binding.operatorControl.mode,
    identitySeparationAvailable: false,
    independentHumanReviewClaimed: false,
    actionStartedAt: startedAt,
    actionCompletedAt: null,
    remoteContactCount: 0,
    createPostAttemptCount: 0,
    automaticRetryCount: 0,
    credentialBrokerInvocationCount: 0,
    credentialBrokerMode: null,
    duplicateState: 'NOT_CHECKED',
    partialFailureState: null,
    readOnlyReconciliation: null,
    recoveryOwner: binding.duplicateAndFailurePolicy.recoveryOwner,
    cleanupDeletionAuthorized: false,
    databaseConnectionPerformed: false,
    phase2AndLaterAuthorized: false,
    organizationIdentityEvidence: binding.organizationIdentityEvidence,
    productionBoundary: {
      exceptionMode: binding.sameOrganizationException.mode,
      targetOrganizationSlug:
        binding.sameOrganizationException.targetOrganizationSlug,
      productionProjectRef:
        binding.sameOrganizationException.productionProjectRef,
      organizationProjectEnumerationAllowed: true,
      directProductionProjectManagementApiContactCount: 0,
      productionProjectDataPlaneContactCount: 0,
      productionDatabaseContactCount: 0,
      productionCredentialAccessCount: 0,
    },
    createdEnvironment: null,
    providerEvidence: null,
    pricingAndFunding: {
      currency: binding.cost.currency,
      moneyScale: binding.cost.moneyScale,
      pricingEvidenceFreshThrough: binding.cost.pricingEvidence.freshThrough,
      sourceMaximumBillableHours: binding.cost.sourceMaximumBillableHours,
      sourceMaximumComputeUsdScaled: binding.cost.sourceMaximumComputeUsdScaled,
      unallocatedAuthorizationHeadroomUsdScaled:
        binding.cost.unallocatedAuthorizationHeadroomUsdScaled,
      ownerAuthorizationCeilingUsdScaled:
        binding.cost.ownerAuthorizationCeilingUsdScaled,
      providerSpendCapEnforced: false,
      fundingSource: binding.retentionAndCleanupDecision.fundingSource,
      fundingApprovedAmountUsdScaled:
        binding.retentionAndCleanupDecision.fundingApprovedAmountUsdScaled,
      scheduledExecutionAt: binding.provisioningAction.scheduledExecutionAt,
      fundedThrough: binding.retentionAndCleanupDecision.fundedThrough,
    },
    approvalWindow: {
      authorityAcceptedAt: validation.authorityAcceptedAt,
      derivedExecutionBindingGeneratedAt:
        validation.derivedExecutionBindingGeneratedAt,
      expiresAt: binding.approval.expiresAt,
      approvalEvidenceSha256: binding.approval.evidenceSha256,
      derivedExecutionBindingSha256: validation.derivedExecutionBindingSha256,
    },
    cleanupBoundary: {
      disposition: binding.retentionAndCleanupDecision.disposition,
      cleanupOwner: binding.retentionAndCleanupDecision.cleanupOwner,
      deletionApprovalRequester:
        binding.retentionAndCleanupDecision.deletionApprovalRequester,
      deletionApprovalRequestDeadline:
        binding.retentionAndCleanupDecision.deletionApprovalRequestDeadline,
      billingEscalationOwner:
        binding.retentionAndCleanupDecision.billingEscalationOwner,
      fundedExtensionOwner:
        binding.retentionAndCleanupDecision.fundedExtensionOwner,
      automaticDeletionAuthorized: false,
    },
    journalEvidence: {
      actionJournalDirectoryPathSha256:
        binding.duplicateAndFailurePolicy.actionJournalDirectoryPathSha256,
      claimSha256,
      postIntentSha256: null,
    },
  };
}

function makeTerminalRecord({
  validation,
  state,
  reasonCode,
  completedAt,
  projectRef,
  createPostAttemptCount,
  readOnlyReconciliation,
  evidenceDirectoryName,
  manifestSha256,
  partialEvidenceDirectoryName,
}) {
  return {
    actionId: ACTION_ID,
    bindingMaterialSha256: validation.bindingMaterialSha256,
    payloadSha256: validation.payloadSha256,
    derivedExecutionBindingSha256: validation.derivedExecutionBindingSha256,
    state,
    reasonCode,
    completedAt,
    projectRef,
    createPostAttemptCount,
    automaticRetryCount: 0,
    automaticCleanupPerformed: false,
    readOnlyReconciliation,
    evidenceDirectoryName,
    manifestSha256,
    partialEvidenceDirectoryName,
  };
}

async function executeProvisioning(inputs, validation) {
  const { binding, credentialConfiguration, evidenceParent, journalDirectory } =
    inputs;
  requireSameExecutingImplementationSnapshots(
    inputs,
    'EXECUTING_IMPLEMENTATION_CHANGED'
  );
  if (
    Date.now() < Date.parse(binding.provisioningAction.scheduledExecutionAt)
  ) {
    fail('SCHEDULED_EXECUTION_NOT_REACHED');
  }
  const startedAt = new Date().toISOString();
  const claim = {
    actionId: ACTION_ID,
    bindingMaterialSha256: validation.bindingMaterialSha256,
    payloadSha256: validation.payloadSha256,
    derivedExecutionBindingSha256: validation.derivedExecutionBindingSha256,
    claimedAt: startedAt,
    state: 'CLAIMED_POST_NOT_SENT',
  };
  const claimResult = claimActionJournal(journalDirectory, claim);
  let evidence = null;
  const events = [
    {
      sequence: 1,
      state: 'CLAIMED_POST_NOT_SENT',
      at: startedAt,
      claimSha256: claimResult.claimSha256,
      remoteContactCount: 0,
      createPostAttemptCount: 0,
    },
  ];
  const result = makeBaseResult(
    binding,
    validation,
    startedAt,
    claimResult.claimSha256
  );
  const providerExport = {
    schemaVersion: 4,
    exportType: 'SUPABASE_SOURCE_PROJECT_PROVIDER_SAFE_PROJECTION',
    status: 'NOT_RUN',
    actionId: ACTION_ID,
    request: {
      endpoint: CREATE_ENDPOINT,
      httpMethod: 'POST',
      secretFreeProjection: binding.approvedRequest.projection,
      secretFreeProjectionSha256: binding.approvedRequest.sha256,
      rawWireBodyPersisted: false,
      rawHttpHeadersPersisted: false,
    },
    organizationIdentityEvidence: binding.organizationIdentityEvidence,
    preflight: null,
    createResponse: null,
    readinessObservation: null,
    computeObservation: null,
    reconciliation: null,
    productionBoundary: {
      exceptionMode: binding.sameOrganizationException.mode,
      targetOrganizationSlug:
        binding.sameOrganizationException.targetOrganizationSlug,
      productionProjectRef:
        binding.sameOrganizationException.productionProjectRef,
      organizationProjectEnumerationAllowed: true,
      directProductionProjectManagementApiContactCount: 0,
      productionProjectDataPlaneContactCount: 0,
      productionDatabaseContactCount: 0,
      productionCredentialAccessCount: 0,
    },
    rawProviderBodiesPersisted: false,
    capturedAt: null,
    capturedBy: binding.owners.provisioningOperator,
  };
  let accessToken;
  let databasePassword;
  let remoteContactCount = 0;
  let postAttemptCount = 0;
  let createProjection = null;
  let readOnlyReconciliation = null;
  let evidenceSealAttempted = false;
  let sealedEvidence = null;
  const revalidateBeforeRemoteContact = () => {
    revalidateExecutionStateBeforeRemoteContact(inputs);
  };
  const registerRemoteContact = () => {
    remoteContactCount += 1;
  };
  try {
    evidence = makeEvidenceDirectory(
      evidenceParent,
      startedAt,
      validation.payloadSha256
    );
    revalidateImmediatelyBeforePost(inputs, claim, claimResult.claimSha256);
    result.credentialBrokerInvocationCount = 1;
    result.credentialBrokerMode = 'EXECUTE';
    const credentials = retrieveClaimBoundCredentials({
      mode: 'EXECUTE',
      bindingMaterialSha256: validation.bindingMaterialSha256,
      payloadSha256: validation.payloadSha256,
      claimSha256: claimResult.claimSha256,
      credentialConfigurationSha256:
        inputs.context.credentialConfigurationSha256,
      credentialConfiguration,
      journalDirectory,
      journalDirectoryPathSha256: windowsPathFingerprint(journalDirectory),
      evidenceParentDirectory: evidenceParent,
      evidenceParentDirectoryPathSha256: windowsPathFingerprint(evidenceParent),
      approvalExpiresAt: binding.approval.expiresAt,
      resources: inputs.dpapiResources,
    });
    accessToken = credentials.managementAccessToken;
    databasePassword = credentials.databasePassword;
    validateRuntimeCredentialValues(
      accessToken,
      databasePassword,
      credentialConfiguration.secrets.databasePassword.minimumBytes
    );
    const timeout = binding.provisioningAction.requestTimeoutMilliseconds;
    const organizationSlug = binding.environmentProposal.organizationSlug;
    const regionsUrl = new URL(
      '/v1/projects/available-regions',
      'https://api.supabase.com'
    );
    regionsUrl.searchParams.set('organization_slug', organizationSlug);
    regionsUrl.searchParams.set('desired_instance_size', 'large');
    const region = await fetchReadOnlyProjection({
      url: regionsUrl,
      accessToken,
      timeoutMilliseconds: timeout,
      approvalExpiresAt: binding.approval.expiresAt,
      onRemoteContact: registerRemoteContact,
      beforeRemoteContact: revalidateBeforeRemoteContact,
      projector: body => availableRegionsToSafeProjection(body, binding),
      binding,
    });
    const projectPreflight = await listAllOrganizationProjects(
      binding,
      accessToken,
      timeout,
      registerRemoteContact,
      revalidateBeforeRemoteContact
    );
    result.remoteContactCount = remoteContactCount;
    result.duplicateState =
      projectPreflight.targetMatches.length === 0
        ? 'ABSENT_ALL_PAGES'
        : 'DUPLICATE_FOUND';
    providerExport.preflight = {
      region: region.projection,
      regionResponseBodySha256: region.bodySha256,
      projectListPages: projectPreflight.pages,
      projectCount: projectPreflight.totalCount,
      duplicateMatchCount: projectPreflight.targetMatches.length,
      protectedProductionProjectCount:
        projectPreflight.protectedProductionProjectCount,
      observedAt: new Date().toISOString(),
    };
    if (projectPreflight.targetMatches.length > 0) {
      fail('DUPLICATE_PROJECT_FOUND', 'DUPLICATE_FOUND');
    }

    revalidateImmediatelyBeforePost(inputs, claim, claimResult.claimSha256);
    const wireProjection = buildSecretFreeRequestProjection(
      binding,
      credentialConfiguration
    );
    if (sha256Canonical(wireProjection) !== validation.payloadSha256) {
      fail('REQUEST_PAYLOAD_HASH_MISMATCH');
    }
    const postIntentAt = new Date().toISOString();
    const postIntent = {
      actionId: ACTION_ID,
      bindingMaterialSha256: validation.bindingMaterialSha256,
      payloadSha256: validation.payloadSha256,
      derivedExecutionBindingSha256: validation.derivedExecutionBindingSha256,
      postIntentAt,
      state: 'POST_INTENT_DURABLE',
      automaticRetryCount: 0,
      remoteContactCountBeforePost: remoteContactCount,
    };
    const postIntentMetadata = writeJournalEvent(
      journalDirectory,
      DISPATCH_FILE,
      postIntent
    );
    result.journalEvidence.postIntentSha256 = postIntentMetadata.sha256;
    events.push({
      sequence: events.length + 1,
      state: 'POST_INTENT_DURABLE',
      at: postIntentAt,
      postIntentSha256: postIntentMetadata.sha256,
      remoteContactCount,
      createPostAttemptCount: 0,
    });

    const wireBody = {
      db_pass: databasePassword,
      desired_instance_size: wireProjection.desired_instance_size,
      name: wireProjection.name,
      organization_slug: wireProjection.organization_slug,
      region_selection: wireProjection.region_selection,
    };
    let createResponse;
    validatePostIntentImmediatelyBeforeFetch({
      inputs,
      expectedClaim: claim,
      expectedClaimSha256: claimResult.claimSha256,
      expectedIntent: postIntent,
      expectedIntentSha256: postIntentMetadata.sha256,
    });
    try {
      createResponse = await providerFetch(
        CREATE_ENDPOINT,
        { method: 'POST', body: JSON.stringify(wireBody) },
        accessToken,
        timeout,
        binding.approval.expiresAt,
        () => {
          postAttemptCount = 1;
          result.createPostAttemptCount = 1;
          remoteContactCount += 1;
          result.remoteContactCount = remoteContactCount;
        },
        derivePricingExecutionFreshThrough(inputs.context.pricingEvidence),
        binding,
        null,
        revalidateBeforeRemoteContact
      );
    } catch (error) {
      if (error instanceof SafeExecutionError) throw error;
      fail('CREATE_RESPONSE_NOT_OBSERVED', 'UNKNOWN_REMOTE_OUTCOME');
    }
    const createEnvelope = await readJsonProviderResponse(createResponse, 201);
    if (!createEnvelope.accepted) {
      providerExport.createResponse = {
        httpStatus: createEnvelope.httpStatus,
        safeProjection: null,
        responseBodySha256: null,
      };
      fail('CREATE_RESPONSE_REJECTED', 'UNKNOWN_REMOTE_OUTCOME');
    }
    createProjection = projectCreateResponseToSafeProjection(
      createEnvelope.parsed,
      binding
    );
    providerExport.createResponse = {
      httpStatus: createEnvelope.httpStatus,
      safeProjection: createProjection,
      responseBodySha256: createEnvelope.bodySha256,
    };
    events.push({
      sequence: events.length + 1,
      state: 'RESPONSE_ACCEPTED',
      at: new Date().toISOString(),
      projectRef: createProjection.projectRef,
      remoteContactCount,
      createPostAttemptCount: 1,
    });

    const readyDeadline =
      Date.now() +
      binding.provisioningAction.readinessObservationMaximumSeconds * 1000;
    let readyProject = null;
    const readinessPolls = [];
    while (Date.now() <= readyDeadline) {
      const observation = await listAllOrganizationProjects(
        binding,
        accessToken,
        timeout,
        registerRemoteContact,
        revalidateBeforeRemoteContact
      );
      result.remoteContactCount = remoteContactCount;
      readinessPolls.push({
        observedAt: new Date().toISOString(),
        pages: observation.pages,
        matchCount: observation.targetMatches.length,
      });
      if (observation.targetMatches.length > 1) {
        fail('DUPLICATE_PROJECT_FOUND_AFTER_POST', 'PARTIAL_FAILURE');
      }
      if (observation.targetMatches.length === 1) {
        const observed = observation.targetMatches[0];
        if (observed.projectRef !== createProjection.projectRef) {
          fail('CREATED_PROJECT_IDENTITY_MISMATCH', 'PARTIAL_FAILURE');
        }
        if (observed.status === 'ACTIVE_HEALTHY') {
          readyProject = observed;
          break;
        }
        if (
          [
            'INIT_FAILED',
            'REMOVED',
            'RESTORE_FAILED',
            'ACTIVE_UNHEALTHY',
          ].includes(observed.status)
        ) {
          fail('CREATED_PROJECT_UNHEALTHY', 'PARTIAL_FAILURE');
        }
      }
      await new Promise(resolve =>
        setTimeout(
          resolve,
          binding.provisioningAction.readinessPollIntervalSeconds * 1000
        )
      );
    }
    if (readyProject === null) {
      fail('READINESS_DEADLINE_EXCEEDED', 'PARTIAL_FAILURE');
    }
    providerExport.readinessObservation = {
      project: readyProject,
      pollCount: readinessPolls.length,
      polls: readinessPolls,
      finalStatus: 'ACTIVE_HEALTHY',
    };

    const addon = await fetchReadOnlyProjection({
      url: new URL(
        `/v1/projects/${encodeURIComponent(
          createProjection.projectRef
        )}/billing/addons`,
        'https://api.supabase.com'
      ),
      accessToken,
      timeoutMilliseconds: timeout,
      approvalExpiresAt: binding.approval.expiresAt,
      onRemoteContact: registerRemoteContact,
      beforeRemoteContact: revalidateBeforeRemoteContact,
      projector: body =>
        addonResponseToSafeProjection(body, createProjection.projectRef),
      binding,
      createdProjectRef: createProjection.projectRef,
    });
    result.remoteContactCount = remoteContactCount;
    providerExport.computeObservation = {
      ...addon.projection,
      responseBodySha256: addon.bodySha256,
      httpStatus: addon.httpStatus,
      observedAt: new Date().toISOString(),
    };

    const createdAtMs = Date.parse(createProjection.createdAt);
    const fundedThroughMs = Date.parse(
      binding.retentionAndCleanupDecision.fundedThrough
    );
    const projectDeadline = new Date(
      Math.min(createdAtMs + 72 * 60 * 60 * 1000, fundedThroughMs)
    ).toISOString();
    providerExport.status = 'PASS';
    providerExport.capturedAt = new Date().toISOString();
    result.status = 'PASS';
    result.actionCompletedAt = providerExport.capturedAt;
    result.remoteContactCount = remoteContactCount;
    result.createdEnvironment = {
      organizationId: createProjection.organizationId,
      organizationSlug: createProjection.organizationSlug,
      organizationPlan: 'PRO',
      projectRef: createProjection.projectRef,
      projectName: createProjection.projectName,
      region: createProjection.region,
      databaseTier: 'LARGE',
      createdAt: createProjection.createdAt,
      status: 'ACTIVE_HEALTHY',
      projectDeadline,
      dataApiAuthGraphQlIntegrationState: 'NOT_OBSERVED_PHASE2_REQUIRED',
    };
    events.push({
      sequence: events.length + 1,
      state: 'PROVIDER_RECONCILED',
      at: result.actionCompletedAt,
      projectRef: createProjection.projectRef,
      remoteContactCount,
      createPostAttemptCount: 1,
    });
    evidenceSealAttempted = true;
    sealedEvidence = sealEvidence({
      binding,
      directory: evidence.directory,
      finalDirectory: evidence.finalDirectory,
      events,
      outcome: 'PASS',
      providerExport,
      result,
      forbiddenValues: [accessToken, databasePassword],
    });
    writeJournalEvent(
      journalDirectory,
      OUTCOME_FILE,
      makeTerminalRecord({
        validation,
        state: 'PASS_EVIDENCE_SEALED',
        reasonCode: null,
        completedAt: result.actionCompletedAt,
        projectRef: createProjection.projectRef,
        createPostAttemptCount: 1,
        readOnlyReconciliation: null,
        evidenceDirectoryName: evidence.directoryName,
        manifestSha256: sealedEvidence.manifestSha256,
        partialEvidenceDirectoryName: null,
      })
    );
    return {
      status: 'PASS',
      actionId: ACTION_ID,
      projectRef: createProjection.projectRef,
      evidenceDirectoryName: evidence.directoryName,
      manifestSha256: sealedEvidence.manifestSha256,
      phase2AndLaterAuthorized: false,
    };
  } catch (error) {
    if (sealedEvidence !== null) {
      throw new SafeExecutionError(
        'TERMINAL_OUTCOME_WRITE_FAILED',
        'PARTIAL_FAILURE'
      );
    }
    if (evidenceSealAttempted) {
      const sealFailureAt = new Date().toISOString();
      const retainedPartialDirectoryName =
        retainedPartialEvidenceDirectoryName(error);
      if (retainedPartialDirectoryName !== null) {
        try {
          writeJournalEvent(
            journalDirectory,
            OUTCOME_FILE,
            makeTerminalRecord({
              validation,
              state: 'EVIDENCE_SEAL_FAILED_OWNER_DECISION_REQUIRED',
              reasonCode: safeErrorCode(error),
              completedAt: sealFailureAt,
              projectRef: createProjection?.projectRef ?? null,
              createPostAttemptCount: postAttemptCount,
              readOnlyReconciliation,
              evidenceDirectoryName: null,
              manifestSha256: null,
              partialEvidenceDirectoryName: retainedPartialDirectoryName,
            })
          );
        } catch {
          // A create-once terminal write failure is left for local recovery.
        }
      }
      throw new SafeExecutionError('EVIDENCE_SEAL_FAILED', 'PARTIAL_FAILURE');
    }
    const code = safeErrorCode(error);
    const state = safeErrorState(
      error,
      postAttemptCount,
      createProjection !== null
    );
    if (postAttemptCount === 1 && typeof accessToken === 'string') {
      readOnlyReconciliation = await reconcileAfterPostAttempt({
        accessToken,
        binding,
        expectedProjectRef: createProjection?.projectRef ?? null,
        onRemoteContact: registerRemoteContact,
        beforeRemoteContact: revalidateBeforeRemoteContact,
        timeoutMilliseconds:
          binding.provisioningAction.requestTimeoutMilliseconds,
      });
      providerExport.reconciliation = readOnlyReconciliation;
      result.readOnlyReconciliation = readOnlyReconciliation;
      events.push({
        sequence: events.length + 1,
        state: 'READ_ONLY_RECONCILIATION_COMPLETED',
        at: new Date().toISOString(),
        reconciliationState: readOnlyReconciliation.state,
        remoteContactCount,
        createPostAttemptCount: postAttemptCount,
        automaticRetryCount: 0,
      });
    }
    result.status = state;
    result.actionCompletedAt = new Date().toISOString();
    result.remoteContactCount = remoteContactCount;
    result.createPostAttemptCount = postAttemptCount;
    result.partialFailureState = code;
    events.push({
      sequence: events.length + 1,
      state,
      at: result.actionCompletedAt,
      reasonCode: code,
      remoteContactCount,
      createPostAttemptCount: postAttemptCount,
      automaticRetryCount: 0,
    });
    providerExport.status = state;
    providerExport.capturedAt = result.actionCompletedAt;
    if (evidence === null) {
      try {
        writeJournalEvent(
          journalDirectory,
          OUTCOME_FILE,
          makeTerminalRecord({
            validation,
            state,
            reasonCode: code,
            completedAt: result.actionCompletedAt,
            projectRef: createProjection?.projectRef ?? null,
            createPostAttemptCount: postAttemptCount,
            readOnlyReconciliation,
            evidenceDirectoryName: null,
            manifestSha256: null,
            partialEvidenceDirectoryName: null,
          })
        );
      } catch {
        // A create-once terminal write failure remains fail-closed.
      }
      throw new SafeExecutionError(code, state);
    }
    evidenceSealAttempted = true;
    try {
      sealedEvidence = sealEvidence({
        binding,
        directory: evidence.directory,
        finalDirectory: evidence.finalDirectory,
        events,
        outcome: state,
        providerExport,
        result,
        forbiddenValues: [accessToken, databasePassword].filter(
          value => typeof value === 'string'
        ),
      });
    } catch (sealError) {
      const retainedPartialDirectoryName =
        retainedPartialEvidenceDirectoryName(sealError);
      if (retainedPartialDirectoryName !== null) {
        try {
          writeJournalEvent(
            journalDirectory,
            OUTCOME_FILE,
            makeTerminalRecord({
              validation,
              state: 'EVIDENCE_SEAL_FAILED_OWNER_DECISION_REQUIRED',
              reasonCode: safeErrorCode(sealError),
              completedAt: new Date().toISOString(),
              projectRef: createProjection?.projectRef ?? null,
              createPostAttemptCount: postAttemptCount,
              readOnlyReconciliation,
              evidenceDirectoryName: null,
              manifestSha256: null,
              partialEvidenceDirectoryName: retainedPartialDirectoryName,
            })
          );
        } catch {
          // A create-once terminal write failure remains fail-closed.
        }
      }
      throw new SafeExecutionError('EVIDENCE_SEAL_FAILED', 'PARTIAL_FAILURE');
    }
    try {
      writeJournalEvent(
        journalDirectory,
        OUTCOME_FILE,
        makeTerminalRecord({
          validation,
          state,
          reasonCode: code,
          completedAt: result.actionCompletedAt,
          projectRef: createProjection?.projectRef ?? null,
          createPostAttemptCount: postAttemptCount,
          readOnlyReconciliation,
          evidenceDirectoryName: evidence.directoryName,
          manifestSha256: sealedEvidence.manifestSha256,
          partialEvidenceDirectoryName: null,
        })
      );
    } catch {
      throw new SafeExecutionError(
        'TERMINAL_OUTCOME_WRITE_FAILED',
        'PARTIAL_FAILURE'
      );
    }
    throw new SafeExecutionError(code, state);
  } finally {
    accessToken = undefined;
    databasePassword = undefined;
  }
}

export function validateLocalCompletionJournalBinding(
  result,
  verified,
  journalState,
  binding,
  derivedExecutionBinding
) {
  if (
    !isRecord(result) ||
    !isRecord(verified) ||
    !isRecord(journalState) ||
    !isRecord(binding) ||
    !isRecord(derivedExecutionBinding)
  ) {
    fail('SEALED_EVIDENCE_JOURNAL_BINDING_MISMATCH');
  }
  const resultJournal = result.journalEvidence;
  if (
    (journalState.postIntent === null) !==
    (journalState.postIntentSha256 === null)
  ) {
    fail('SEALED_EVIDENCE_JOURNAL_BINDING_MISMATCH');
  }
  const intentPresent =
    journalState.postIntent !== null && journalState.postIntentSha256 !== null;
  const postIntentMatches =
    intentPresent &&
    resultJournal?.postIntentSha256 === journalState.postIntentSha256;
  const zeroPostConsumedIntent =
    result.createPostAttemptCount === 0 &&
    verified.outcome === 'PRECHECK_ABORTED' &&
    intentPresent &&
    postIntentMatches;
  const expectedJournalState =
    result.createPostAttemptCount === 1 || zeroPostConsumedIntent
      ? 'POST_INTENT_DURABLE_OUTCOME_UNRESOLVED'
      : 'CLAIMED_POST_NOT_SENT';
  const expectedPricingAndFunding = {
    currency: binding.cost?.currency,
    moneyScale: binding.cost?.moneyScale,
    pricingEvidenceFreshThrough: binding.cost?.pricingEvidence?.freshThrough,
    sourceMaximumBillableHours: binding.cost?.sourceMaximumBillableHours,
    sourceMaximumComputeUsdScaled: binding.cost?.sourceMaximumComputeUsdScaled,
    unallocatedAuthorizationHeadroomUsdScaled:
      binding.cost?.unallocatedAuthorizationHeadroomUsdScaled,
    ownerAuthorizationCeilingUsdScaled:
      binding.cost?.ownerAuthorizationCeilingUsdScaled,
    providerSpendCapEnforced: false,
    fundingSource: binding.retentionAndCleanupDecision?.fundingSource,
    fundingApprovedAmountUsdScaled:
      binding.retentionAndCleanupDecision?.fundingApprovedAmountUsdScaled,
    scheduledExecutionAt: binding.provisioningAction?.scheduledExecutionAt,
    fundedThrough: binding.retentionAndCleanupDecision?.fundedThrough,
  };
  const expectedApprovalWindow = {
    authorityAcceptedAt: binding.approval?.authorityAcceptedAt,
    derivedExecutionBindingGeneratedAt: derivedExecutionBinding.generatedAt,
    expiresAt: binding.approval?.expiresAt,
    approvalEvidenceSha256: binding.approval?.evidenceSha256,
    derivedExecutionBindingSha256:
      journalState.claim?.derivedExecutionBindingSha256,
  };
  const expectedCleanupBoundary = {
    disposition: binding.retentionAndCleanupDecision?.disposition,
    cleanupOwner: binding.retentionAndCleanupDecision?.cleanupOwner,
    deletionApprovalRequester:
      binding.retentionAndCleanupDecision?.deletionApprovalRequester,
    deletionApprovalRequestDeadline:
      binding.retentionAndCleanupDecision?.deletionApprovalRequestDeadline,
    billingEscalationOwner:
      binding.retentionAndCleanupDecision?.billingEscalationOwner,
    fundedExtensionOwner:
      binding.retentionAndCleanupDecision?.fundedExtensionOwner,
    automaticDeletionAuthorized: false,
  };
  if (
    verified.outcome !== result.status ||
    journalState.state !== expectedJournalState ||
    result.operator !== binding.owners?.provisioningOperator ||
    result.approver !== binding.approval?.authorityPrincipalId ||
    result.operatorDisplayName !==
      binding.operatorControl?.principalDisplayName ||
    result.operatorControlMode !== binding.operatorControl?.mode ||
    result.identitySeparationAvailable !== false ||
    result.independentHumanReviewClaimed !== false ||
    result.recoveryOwner !== binding.duplicateAndFailurePolicy?.recoveryOwner ||
    canonicalJson(result.organizationIdentityEvidence) !==
      canonicalJson(binding.organizationIdentityEvidence) ||
    canonicalJson(result.pricingAndFunding) !==
      canonicalJson(expectedPricingAndFunding) ||
    canonicalJson(result.approvalWindow) !==
      canonicalJson(expectedApprovalWindow) ||
    canonicalJson(result.cleanupBoundary) !==
      canonicalJson(expectedCleanupBoundary) ||
    resultJournal?.claimSha256 !== journalState.claimSha256 ||
    result.approvalWindow?.derivedExecutionBindingSha256 !==
      journalState.claim?.derivedExecutionBindingSha256 ||
    result.actionStartedAt !== journalState.claim?.claimedAt ||
    resultJournal?.actionJournalDirectoryPathSha256 !==
      binding.duplicateAndFailurePolicy?.actionJournalDirectoryPathSha256 ||
    (result.createPostAttemptCount === 1 && !postIntentMatches) ||
    (result.createPostAttemptCount === 0 &&
      !zeroPostConsumedIntent &&
      (intentPresent || resultJournal?.postIntentSha256 !== null)) ||
    (verified.outcome === 'PASS' &&
      (result.createPostAttemptCount !== 1 || !postIntentMatches))
  ) {
    fail('SEALED_EVIDENCE_JOURNAL_BINDING_MISMATCH');
  }
  return true;
}

export function selectKnownProjectRefForLocalCompletion(result, provider) {
  if (!isRecord(result) || !isRecord(provider)) {
    fail('SEALED_EVIDENCE_PROJECT_REF_INVALID');
  }
  const providerProjectRef =
    provider.createResponse?.safeProjection?.projectRef;
  const resultProjectRef = result.createdEnvironment?.projectRef;
  const reconciliationMatches = result.readOnlyReconciliation?.matchingProjects;
  if (
    reconciliationMatches !== undefined &&
    !Array.isArray(reconciliationMatches)
  ) {
    fail('SEALED_EVIDENCE_PROJECT_REF_INVALID');
  }
  const reconciliationProjectRef =
    Array.isArray(reconciliationMatches) && reconciliationMatches.length === 1
      ? reconciliationMatches[0]?.projectRef
      : undefined;
  for (const projectRef of [
    providerProjectRef,
    resultProjectRef,
    reconciliationProjectRef,
  ]) {
    if (
      projectRef !== undefined &&
      (typeof projectRef !== 'string' || !/^[a-z]{20}$/.test(projectRef))
    ) {
      fail('SEALED_EVIDENCE_PROJECT_REF_INVALID');
    }
  }
  const knownProjectRefs = [
    providerProjectRef,
    resultProjectRef,
    reconciliationProjectRef,
  ].filter(projectRef => projectRef !== undefined);
  if (new Set(knownProjectRefs).size > 1) {
    fail('SEALED_EVIDENCE_PROJECT_REF_INVALID');
  }
  return (
    providerProjectRef ?? resultProjectRef ?? reconciliationProjectRef ?? null
  );
}

function completeTerminalFromExistingEvidence(inputs, journalState) {
  const bindingMaterialSha256 = sha256Canonical(
    buildBindingMaterial(inputs.binding)
  );
  const payloadSha256 = sha256Canonical(
    buildSecretFreeRequestProjection(
      inputs.binding,
      inputs.credentialConfiguration
    )
  );
  if (
    bindingMaterialSha256 !== journalState.claim.bindingMaterialSha256 ||
    bindingMaterialSha256 !==
      inputs.binding.approval?.derivedBindingMaterialSha256 ||
    payloadSha256 !== journalState.claim.payloadSha256 ||
    payloadSha256 !== inputs.binding.approvedRequest?.sha256 ||
    payloadSha256 !== inputs.binding.approval?.derivedPayloadSha256 ||
    journalState.claim.derivedExecutionBindingSha256 !==
      inputs.context.derivedExecutionBindingSha256
  ) {
    fail('LOCAL_COMPLETION_BINDING_MISMATCH');
  }
  const directoryName = buildEvidenceDirectoryName(
    journalState.claim.claimedAt,
    journalState.claim.payloadSha256
  );
  const directory = path.join(inputs.evidenceParent, directoryName);
  if (!existsSync(directory)) return null;
  const verified = verifyProvisioningEvidenceDirectory(directory);
  if (
    verified.bindingMaterialSha256 !==
      journalState.claim.bindingMaterialSha256 ||
    verified.payloadSha256 !== journalState.claim.payloadSha256 ||
    verified.derivedExecutionBindingSha256 !==
      journalState.claim.derivedExecutionBindingSha256 ||
    verified.gitCommit !== inputs.binding.target?.gitCommit
  ) {
    fail('SEALED_EVIDENCE_JOURNAL_BINDING_MISMATCH');
  }
  const result = verified.trustedResult;
  const provider = verified.trustedProvider;
  if (!isRecord(result) || !isRecord(provider)) {
    fail('SEALED_EVIDENCE_TRUSTED_SNAPSHOT_MISSING');
  }
  validateLocalCompletionJournalBinding(
    result,
    verified,
    journalState,
    inputs.binding,
    inputs.context.derivedExecutionBinding
  );
  writeJournalEvent(
    inputs.journalDirectory,
    OUTCOME_FILE,
    makeTerminalRecord({
      validation: {
        bindingMaterialSha256: journalState.claim.bindingMaterialSha256,
        payloadSha256: journalState.claim.payloadSha256,
        derivedExecutionBindingSha256:
          journalState.claim.derivedExecutionBindingSha256,
      },
      state:
        verified.outcome === 'PASS' ? 'PASS_EVIDENCE_SEALED' : verified.outcome,
      reasonCode: 'PROCESS_INTERRUPTION_AFTER_EVIDENCE_SEAL',
      completedAt: new Date().toISOString(),
      projectRef: selectKnownProjectRefForLocalCompletion(result, provider),
      createPostAttemptCount: result.createPostAttemptCount,
      readOnlyReconciliation: result.readOnlyReconciliation,
      evidenceDirectoryName: directoryName,
      manifestSha256: verified.manifestSha256,
      partialEvidenceDirectoryName: null,
    })
  );
  return {
    status: 'TERMINAL_COMPLETED_FROM_VERIFIED_EVIDENCE',
    actionId: ACTION_ID,
    outcome: verified.outcome,
    evidenceDirectoryName: directoryName,
    manifestSha256: verified.manifestSha256,
    remoteContactPerformed: false,
    createPostAttemptCountAdded: 0,
  };
}

async function executeReadOnlyRecovery(inputs, validation, journalState) {
  if (
    journalState.state !== 'POST_INTENT_DURABLE_OUTCOME_UNRESOLVED' ||
    journalState.postIntent === null ||
    journalState.postIntentSha256 === null
  ) {
    fail('RECOVERY_JOURNAL_STATE_INVALID');
  }
  requireSameDirectoryIdentity(
    inputs.journalDirectory,
    inputs.journalDirectoryIdentity,
    'ACTION_JOURNAL_DIRECTORY_CHANGED'
  );
  let accessToken;
  const evidence = makeEvidenceDirectory(
    inputs.evidenceParent,
    journalState.claim.claimedAt,
    validation.payloadSha256
  );
  const result = makeBaseResult(
    inputs.binding,
    validation,
    journalState.claim.claimedAt,
    journalState.claimSha256
  );
  result.createPostAttemptCount = 1;
  result.journalEvidence.postIntentSha256 = journalState.postIntentSha256;
  const providerExport = {
    schemaVersion: 4,
    exportType: 'SUPABASE_SOURCE_PROJECT_PROVIDER_SAFE_PROJECTION',
    status: 'UNKNOWN_REMOTE_OUTCOME',
    actionId: ACTION_ID,
    request: {
      endpoint: CREATE_ENDPOINT,
      httpMethod: 'POST',
      secretFreeProjection: inputs.binding.approvedRequest.projection,
      secretFreeProjectionSha256: inputs.binding.approvedRequest.sha256,
      rawWireBodyPersisted: false,
      rawHttpHeadersPersisted: false,
    },
    organizationIdentityEvidence: inputs.binding.organizationIdentityEvidence,
    preflight: null,
    createResponse: null,
    readinessObservation: null,
    computeObservation: null,
    reconciliation: null,
    productionBoundary: {
      exceptionMode: inputs.binding.sameOrganizationException.mode,
      targetOrganizationSlug:
        inputs.binding.sameOrganizationException.targetOrganizationSlug,
      productionProjectRef:
        inputs.binding.sameOrganizationException.productionProjectRef,
      organizationProjectEnumerationAllowed: true,
      directProductionProjectManagementApiContactCount: 0,
      productionProjectDataPlaneContactCount: 0,
      productionDatabaseContactCount: 0,
      productionCredentialAccessCount: 0,
    },
    rawProviderBodiesPersisted: false,
    capturedAt: null,
    capturedBy: inputs.binding.owners.provisioningOperator,
  };
  let remoteContactCount =
    journalState.postIntent.remoteContactCountBeforePost + 1;
  const revalidateBeforeRecoveryRemoteContact = () => {
    revalidateExecutionStateBeforeRemoteContact(inputs);
  };
  const registerRecoveryRemoteContact = () => {
    remoteContactCount += 1;
  };
  const events = [
    {
      sequence: 1,
      state: 'CLAIMED_POST_NOT_SENT',
      at: journalState.claim.claimedAt,
      claimSha256: journalState.claimSha256,
      remoteContactCount: 0,
      createPostAttemptCount: 0,
    },
    {
      sequence: 2,
      state: 'POST_INTENT_DURABLE',
      at: journalState.postIntent.postIntentAt,
      postIntentSha256: journalState.postIntentSha256,
      remoteContactCount: journalState.postIntent.remoteContactCountBeforePost,
      createPostAttemptCount: 0,
    },
  ];
  let reconciliation;
  let sealedEvidence = null;
  try {
    revalidateImmutableApprovalInputs(inputs);
    revalidatePreparedLocalResources(inputs);
    result.credentialBrokerInvocationCount = 1;
    result.credentialBrokerMode = 'RECOVERY';
    const credentials = retrieveClaimBoundCredentials({
      mode: 'RECOVERY',
      bindingMaterialSha256: validation.bindingMaterialSha256,
      payloadSha256: validation.payloadSha256,
      claimSha256: journalState.claimSha256,
      credentialConfigurationSha256:
        inputs.context.credentialConfigurationSha256,
      credentialConfiguration: inputs.credentialConfiguration,
      journalDirectory: inputs.journalDirectory,
      journalDirectoryPathSha256: windowsPathFingerprint(
        inputs.journalDirectory
      ),
      evidenceParentDirectory: inputs.evidenceParent,
      evidenceParentDirectoryPathSha256: windowsPathFingerprint(
        inputs.evidenceParent
      ),
      approvalExpiresAt: inputs.binding.approval.expiresAt,
      resources: inputs.dpapiResources,
    });
    accessToken = credentials.managementAccessToken;
    if (typeof accessToken !== 'string' || accessToken.length < 20) {
      fail('MANAGEMENT_TOKEN_UNAVAILABLE');
    }
    reconciliation = await reconcileAfterPostAttempt({
      accessToken,
      binding: inputs.binding,
      expectedProjectRef: null,
      onRemoteContact: registerRecoveryRemoteContact,
      beforeRemoteContact: revalidateBeforeRecoveryRemoteContact,
      timeoutMilliseconds:
        inputs.binding.provisioningAction.requestTimeoutMilliseconds,
    });
    providerExport.reconciliation = reconciliation;
    result.readOnlyReconciliation = reconciliation;
    events.push({
      sequence: 3,
      state: 'READ_ONLY_RECONCILIATION_COMPLETED',
      at: new Date().toISOString(),
      reconciliationState: reconciliation.state,
      remoteContactCount,
      createPostAttemptCount: 1,
      automaticRetryCount: 0,
    });
    result.status = 'UNKNOWN_REMOTE_OUTCOME';
    result.partialFailureState =
      'PROCESS_INTERRUPTION_AFTER_POST_INTENT_OWNER_DECISION_REQUIRED';
    result.remoteContactCount = remoteContactCount;
    result.actionCompletedAt = new Date().toISOString();
    providerExport.capturedAt = result.actionCompletedAt;
    events.push({
      sequence: 4,
      state: 'UNKNOWN_REMOTE_OUTCOME',
      at: result.actionCompletedAt,
      reasonCode: result.partialFailureState,
      remoteContactCount,
      createPostAttemptCount: 1,
      automaticRetryCount: 0,
    });
    sealedEvidence = sealEvidence({
      binding: inputs.binding,
      directory: evidence.directory,
      finalDirectory: evidence.finalDirectory,
      events,
      outcome: 'UNKNOWN_REMOTE_OUTCOME',
      providerExport,
      result,
      forbiddenValues: [accessToken],
    });
    writeJournalEvent(
      inputs.journalDirectory,
      OUTCOME_FILE,
      makeTerminalRecord({
        validation,
        state: 'UNKNOWN_REMOTE_OUTCOME',
        reasonCode: result.partialFailureState,
        completedAt: result.actionCompletedAt,
        projectRef: selectKnownProjectRefForLocalCompletion(
          result,
          providerExport
        ),
        createPostAttemptCount: 1,
        readOnlyReconciliation: reconciliation,
        evidenceDirectoryName: evidence.directoryName,
        manifestSha256: sealedEvidence.manifestSha256,
        partialEvidenceDirectoryName: null,
      })
    );
    return {
      status: 'READ_ONLY_RECONCILIATION_COMPLETED',
      actionId: ACTION_ID,
      reconciliationState: reconciliation.state,
      evidenceDirectoryName: evidence.directoryName,
      manifestSha256: sealedEvidence.manifestSha256,
      postPerformed: false,
      automaticCleanupPerformed: false,
    };
  } catch (error) {
    if (sealedEvidence !== null) {
      throw new SafeExecutionError(
        'TERMINAL_OUTCOME_WRITE_FAILED',
        'PARTIAL_FAILURE'
      );
    }
    const retainedPartialDirectoryName =
      retainedPartialEvidenceDirectoryName(error) ??
      retainEvidenceAfterSealFailure(
        evidence.directory,
        evidence.finalDirectory,
        false
      );
    if (retainedPartialDirectoryName !== null) {
      try {
        writeJournalEvent(
          inputs.journalDirectory,
          OUTCOME_FILE,
          makeTerminalRecord({
            validation,
            state: 'EVIDENCE_SEAL_FAILED_OWNER_DECISION_REQUIRED',
            reasonCode: safeErrorCode(error),
            completedAt: new Date().toISOString(),
            projectRef: null,
            createPostAttemptCount: 1,
            readOnlyReconciliation: reconciliation ?? null,
            evidenceDirectoryName: null,
            manifestSha256: null,
            partialEvidenceDirectoryName: retainedPartialDirectoryName,
          })
        );
      } catch {
        // A create-once terminal write failure remains fail-closed.
      }
    }
    throw new SafeExecutionError(
      'RECOVERY_EVIDENCE_OR_TERMINAL_FAILED',
      'PARTIAL_FAILURE'
    );
  } finally {
    accessToken = undefined;
  }
}

async function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv.slice(2));
    if (parsed.help) {
      printHelp();
      return;
    }
    const inputs = buildOfflineInputs(parsed);
    requireSameExecutingImplementationSnapshots(
      inputs,
      'EXECUTING_IMPLEMENTATION_CHANGED'
    );
    if (parsed['--reconcile-dispatched-action'] === ACTION_ID) {
      const journalState = readAndValidateJournalState(
        inputs.journalDirectory,
        inputs.binding.approval?.derivedBindingMaterialSha256,
        inputs.binding.approvedRequest?.sha256,
        inputs.context.derivedExecutionBindingSha256
      );
      if (journalState.state === 'TERMINAL_OUTCOME_RECORDED') {
        fail('ACTION_ALREADY_TERMINAL');
      }
      const localCompletion = completeTerminalFromExistingEvidence(
        inputs,
        journalState
      );
      if (localCompletion !== null) {
        process.stdout.write(`${canonicalJson(localCompletion)}\n`);
        return;
      }
      if (journalState.state === 'CLAIMED_POST_NOT_SENT') {
        fail('CLAIM_ONLY_OWNER_DECISION_REQUIRED');
      }
      const recoveryValidation = validateOfflineApproval(
        inputs.binding,
        inputs.credentialConfiguration,
        {
          ...inputs.context,
          approvalStage: 'RECOVERY',
          priorActionState: journalState.state,
          now: new Date().toISOString(),
        }
      );
      prepareValidatedLocalResources(inputs);
      const recoveryOutcome = await executeReadOnlyRecovery(
        inputs,
        recoveryValidation,
        journalState
      );
      process.stdout.write(`${canonicalJson(recoveryOutcome)}\n`);
      return;
    }
    const validation = validateOfflineApproval(
      inputs.binding,
      inputs.credentialConfiguration,
      inputs.context
    );
    prepareValidatedLocalResources(inputs);
    if (parsed.offlineVerify) {
      process.stdout.write(
        `${canonicalJson({
          status: 'OFFLINE_APPROVAL_VALID',
          actionId: ACTION_ID,
          bindingMaterialSha256: validation.bindingMaterialSha256,
          payloadSha256: validation.payloadSha256,
          remoteContactPerformed: false,
          credentialValueReadPerformed: false,
        })}\n`
      );
      return;
    }
    const outcome = await executeProvisioning(inputs, validation);
    process.stdout.write(`${canonicalJson(outcome)}\n`);
  } catch (error) {
    const code = safeErrorCode(error);
    process.stderr.write(`PR12 Phase 1 stopped: ${code}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === scriptPath) await main();
