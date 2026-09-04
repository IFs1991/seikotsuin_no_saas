import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
  ORGANIZATION_IDENTITY_CAPTURE_CLAIM_FILE,
  ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT,
  ORGANIZATION_IDENTITY_CAPTURE_INTENT_FILE,
  ORGANIZATION_IDENTITY_CAPTURE_MAX_BODY_BYTES,
  ORGANIZATION_IDENTITY_CAPTURE_TERMINAL_FILE,
  OrganizationIdentityCaptureContractError,
  assertAllowedOrganizationIdentityCaptureRequest,
  assertNoAmbientOrganizationCaptureCredentialEnvironment,
  assertOrganizationIdentityCaptureEvidenceSecretFree,
  buildOrganizationIdentityCaptureRequestProjection,
  claimOrganizationIdentityCaptureAction,
  organizationIdentityResponseToSafeProjection,
  validateOrganizationIdentityCaptureOffline,
} from './pr12-source-organization-identity-capture-contract.mjs';
import {
  DpapiCredentialChannelError,
  assertDpapiDirectoryIsolation,
  inspectDpapiDirectoryIdentity,
  revalidateDpapiOrganizationIdentityCaptureResources,
  retrieveClaimBoundCredentials,
  validateDpapiOrganizationIdentityCaptureResources,
  windowsPathFingerprint,
} from './pr12-windows-dpapi-credential-channel.mjs';
import {
  APPROVED_BASE_COMMIT,
  PRODUCTION_PROJECT_ORIGIN,
  PRODUCTION_PROJECT_REF,
  canonicalJson,
  isJsonMediaType,
  sha256Text,
} from './pr12-source-project-provisioning-contract.mjs';
import {
  OrganizationIdentityCaptureEvidenceError,
  verifyOrganizationIdentityCaptureEvidenceDirectory,
} from './verify-pr12-source-organization-identity-capture-evidence.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const contractPath = fileURLToPath(
  new URL(
    './pr12-source-organization-identity-capture-contract.mjs',
    import.meta.url
  )
);
const credentialChannelPath = fileURLToPath(
  new URL('./pr12-windows-dpapi-credential-channel.mjs', import.meta.url)
);
const credentialBrokerPath = fileURLToPath(
  new URL('./pr12-windows-dpapi-credential-broker.ps1', import.meta.url)
);
const evidenceVerifierPath = fileURLToPath(
  new URL(
    './verify-pr12-source-organization-identity-capture-evidence.mjs',
    import.meta.url
  )
);
const sharedProvisioningContractPath = fileURLToPath(
  new URL('./pr12-source-project-provisioning-contract.mjs', import.meta.url)
);
const GOVERNANCE_RELATIVE_PATH =
  'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml';
const IMPLEMENTATION_FILES = Object.freeze([
  {
    key: 'contract',
    path: contractPath,
    relativePath:
      'scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs',
  },
  {
    key: 'sharedProvisioningContract',
    path: sharedProvisioningContractPath,
    relativePath:
      'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs',
  },
  {
    key: 'wrapper',
    path: scriptPath,
    relativePath:
      'scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs',
  },
  {
    key: 'credentialChannel',
    path: credentialChannelPath,
    relativePath:
      'scripts/commercial-hardening/pr12-windows-dpapi-credential-channel.mjs',
  },
  {
    key: 'credentialBroker',
    path: credentialBrokerPath,
    relativePath:
      'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1',
  },
  {
    key: 'evidenceVerifier',
    path: evidenceVerifierPath,
    relativePath:
      'scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs',
  },
]);
const STATIC_SECRET_MARKERS = Object.freeze([
  'sbp_',
  'service_role',
  'SUPABASE_ACCESS_TOKEN',
  'Authorization',
  'Bearer ',
  'ciphertextBase64',
]);

class IdentityCaptureExecutionError extends Error {
  constructor(code, outcome = 'PARTIAL_FAILURE') {
    super(code);
    this.name = 'IdentityCaptureExecutionError';
    this.code = code;
    this.outcome = outcome;
  }
}

function fail(code, outcome) {
  throw new IdentityCaptureExecutionError(code, outcome);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeErrorCode(error) {
  if (
    error instanceof IdentityCaptureExecutionError ||
    error instanceof OrganizationIdentityCaptureContractError ||
    error instanceof OrganizationIdentityCaptureEvidenceError ||
    error instanceof DpapiCredentialChannelError
  ) {
    return error.code;
  }
  return 'UNEXPECTED_LOCAL_FAILURE';
}

export function classifyIdentityCaptureFailureOutcome(
  remoteContactCount,
  preferredOutcome = 'PARTIAL_FAILURE'
) {
  if (
    !Number.isInteger(remoteContactCount) ||
    remoteContactCount < 0 ||
    remoteContactCount > 1 ||
    !['PARTIAL_FAILURE', 'UNKNOWN_REMOTE_OUTCOME'].includes(preferredOutcome)
  ) {
    fail('FAILURE_OUTCOME_INPUT_INVALID');
  }
  return remoteContactCount > 0 ? 'UNKNOWN_REMOTE_OUTCOME' : preferredOutcome;
}

function safeOutcome(error, remoteContactCount) {
  const preferredOutcome =
    error instanceof IdentityCaptureExecutionError
      ? error.outcome
      : 'PARTIAL_FAILURE';
  return classifyIdentityCaptureFailureOutcome(
    remoteContactCount,
    preferredOutcome
  );
}

function printHelp() {
  process.stdout.write(`PR12 source Organization identity capture

Offline validation only (no credential read, journal claim, or network):
  node scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs --offline-verify \`
    --binding <approved-binding-v1.json> \`
    --credential-config <approved-credential-config-v2.json> \`
    --approval-evidence <approved-identity-capture-owner-approval-v1.json> \`
    --journal-directory <owner-controlled-absolute-directory> \`
    --evidence-parent <owner-controlled-absolute-directory>

Future execution after a separate hash-bound approval only:
  node scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs \`
    --execute-authorized-action PR12-ACTION-002 \`
    --binding <approved-binding-v1.json> \`
    --credential-config <approved-credential-config-v2.json> \`
    --approval-evidence <approved-identity-capture-owner-approval-v1.json> \`
    --journal-directory <owner-controlled-absolute-directory> \`
    --evidence-parent <owner-controlled-absolute-directory>

This action permits one GET only. It has no retry, redirect, recovery GET,
project-list, project-create, database-password, database, or Phase 2 path.
Never place a credential in argv, environment, URL, log, or evidence.
`);
}

function parseArguments(argv) {
  if (argv.length === 0 || argv.includes('--help')) return { help: true };
  const valueFlags = new Set([
    '--execute-authorized-action',
    '--binding',
    '--credential-config',
    '--approval-evidence',
    '--journal-directory',
    '--evidence-parent',
  ]);
  const parsed = { help: false, offlineVerify: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--offline-verify') {
      if (parsed.offlineVerify) fail('DUPLICATE_ARGUMENT');
      parsed.offlineVerify = true;
      continue;
    }
    if (!valueFlags.has(flag)) fail('UNKNOWN_ARGUMENT');
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail('MISSING_ARGUMENT_VALUE');
    }
    if (Object.hasOwn(parsed, flag)) fail('DUPLICATE_ARGUMENT');
    parsed[flag] = value;
    index += 1;
  }
  const execute = parsed['--execute-authorized-action'];
  if (
    [parsed.offlineVerify === true, execute !== undefined].filter(Boolean)
      .length !== 1
  ) {
    fail('EXECUTION_MODE_INVALID');
  }
  if (
    execute !== undefined &&
    execute !== ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID
  ) {
    fail('ACTION_CONFIRMATION_INVALID');
  }
  for (const flag of [
    '--binding',
    '--credential-config',
    '--approval-evidence',
    '--journal-directory',
    '--evidence-parent',
  ]) {
    if (typeof parsed[flag] !== 'string') fail('REQUIRED_ARGUMENT_MISSING');
  }
  return parsed;
}

function fileIdentity(status) {
  return {
    device: String(status.dev),
    inode: String(status.ino),
    size: status.size,
    modifiedAtMilliseconds: status.mtimeMs,
  };
}

function stableFileSnapshot(filename, code, maximumBytes = 1_048_576) {
  let descriptor;
  try {
    if (
      !existsSync(filename) ||
      lstatSync(filename).isSymbolicLink() ||
      !statSync(filename).isFile()
    ) {
      fail(code);
    }
    descriptor = openSync(filename, 'r');
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size > maximumBytes) fail(code);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const current = statSync(filename);
    if (
      canonicalJson(fileIdentity(before)) !==
        canonicalJson(fileIdentity(after)) ||
      after.dev !== current.dev ||
      after.ino !== current.ino ||
      bytes.length !== after.size
    ) {
      fail(code);
    }
    return {
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      identity: fileIdentity(after),
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseJsonSnapshot(snapshot, code) {
  let text;
  let value;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(snapshot.bytes);
    value = JSON.parse(text);
  } catch {
    fail(code);
  }
  if (!isRecord(value)) fail(code);
  return value;
}

function resolveJsonInput(input, code) {
  const resolved = path.resolve(input);
  if (
    path.extname(resolved).toLowerCase() !== '.json' ||
    path.basename(resolved).toLowerCase().startsWith('.env') ||
    !existsSync(resolved) ||
    lstatSync(resolved).isSymbolicLink() ||
    !statSync(resolved).isFile()
  ) {
    fail(code);
  }
  return resolved;
}

function resolveExistingDirectory(input, code) {
  if (typeof input !== 'string' || !path.isAbsolute(input)) fail(code);
  const resolved = path.resolve(input);
  if (
    !existsSync(resolved) ||
    lstatSync(resolved).isSymbolicLink() ||
    !statSync(resolved).isDirectory()
  ) {
    fail(code);
  }
  return resolved;
}

function normalizedPath(filename) {
  const resolved = path.resolve(filename);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isInsideDirectory(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

export function assertSafeOrganizationIdentityCaptureNodeRuntime(
  nodeVersion,
  nodeExecArgv
) {
  if (
    typeof nodeVersion !== 'string' ||
    !/^v24\.[0-9]+\.[0-9]+(?:[-+].*)?$/.test(nodeVersion) ||
    !Array.isArray(nodeExecArgv) ||
    nodeExecArgv.length !== 0
  ) {
    fail('UNSAFE_NODE_RUNTIME');
  }
  return true;
}

export function assertCanonicalRepositoryRoot(repositoryRoot) {
  const gitTopLevel = runGit(
    repositoryRoot,
    ['rev-parse', '--show-toplevel'],
    'GIT_ROOT_INVALID'
  ).stdout;
  if (
    normalizedPath(repositoryRoot) !== normalizedPath(gitTopLevel) ||
    normalizedPath(realpathSync.native(repositoryRoot)) !==
      normalizedPath(realpathSync.native(gitTopLevel))
  ) {
    fail('EXECUTING_IMPLEMENTATION_ROOT_MISMATCH');
  }
}

export function assertOutputDirectoryOutsideRepository(
  repositoryRoot,
  outputDirectory
) {
  const repositoryLexical = path.resolve(repositoryRoot);
  const outputLexical = path.resolve(outputDirectory);
  const repositoryResolved = realpathSync.native(repositoryLexical);
  const outputResolved = realpathSync.native(outputLexical);
  if (
    isInsideDirectory(repositoryLexical, outputLexical) ||
    isInsideDirectory(repositoryResolved, outputResolved)
  ) {
    fail('RUNTIME_OUTPUT_DIRECTORY_INSIDE_REPOSITORY');
  }
}

export function captureAmbientEnvironmentSnapshot() {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(process.env).map(([name, value]) => {
        if (typeof value !== 'string') {
          fail('AMBIENT_ENVIRONMENT_INVALID');
        }
        return [name, value.length === 0 ? '' : 'PRESENT'];
      })
    )
  );
}

function minimalGitEnvironment() {
  const allowed = [
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'PATH',
    'PATHEXT',
    'TEMP',
    'TMP',
  ];
  return Object.fromEntries(
    allowed
      .filter(name => typeof process.env[name] === 'string')
      .map(name => [name, process.env[name]])
  );
}

function runGit(repositoryRoot, argumentsList, code, accepted = [0]) {
  const result = spawnSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: minimalGitEnvironment(),
    maxBuffer: 1_048_576,
    shell: false,
    windowsHide: true,
  });
  if (
    result.error !== undefined ||
    result.signal !== null ||
    !accepted.includes(result.status) ||
    typeof result.stdout !== 'string' ||
    typeof result.stderr !== 'string'
  ) {
    fail(code);
  }
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function captureImplementationSnapshots(repositoryRoot) {
  const snapshots = {};
  for (const implementation of IMPLEMENTATION_FILES) {
    const expected = path.resolve(repositoryRoot, implementation.relativePath);
    if (
      normalizedPath(expected) !== normalizedPath(implementation.path) ||
      normalizedPath(realpathSync.native(expected)) !==
        normalizedPath(realpathSync.native(implementation.path))
    ) {
      fail('EXECUTING_IMPLEMENTATION_PATH_INVALID');
    }
    snapshots[implementation.key] = stableFileSnapshot(
      implementation.path,
      'EXECUTING_IMPLEMENTATION_INVALID'
    );
  }
  return snapshots;
}

function requireSnapshotsUnchanged(current, expected, code) {
  for (const key of Object.keys(expected)) {
    if (
      current[key].sha256 !== expected[key].sha256 ||
      canonicalJson(current[key].identity) !==
        canonicalJson(expected[key].identity)
    ) {
      fail(code);
    }
  }
}

function buildOfflineInputs(parsed) {
  const repositoryRoot = path.resolve(path.dirname(scriptPath), '..', '..');
  assertCanonicalRepositoryRoot(repositoryRoot);
  const bindingPath = resolveJsonInput(
    parsed['--binding'],
    'BINDING_INPUT_INVALID'
  );
  const credentialPath = resolveJsonInput(
    parsed['--credential-config'],
    'CREDENTIAL_INPUT_INVALID'
  );
  const approvalPath = resolveJsonInput(
    parsed['--approval-evidence'],
    'APPROVAL_INPUT_INVALID'
  );
  const journalDirectory = resolveExistingDirectory(
    parsed['--journal-directory'],
    'JOURNAL_DIRECTORY_INVALID'
  );
  const evidenceParent = resolveExistingDirectory(
    parsed['--evidence-parent'],
    'EVIDENCE_PARENT_INVALID'
  );
  assertOutputDirectoryOutsideRepository(repositoryRoot, journalDirectory);
  assertOutputDirectoryOutsideRepository(repositoryRoot, evidenceParent);
  const bindingSnapshot = stableFileSnapshot(
    bindingPath,
    'BINDING_INPUT_INVALID'
  );
  const credentialSnapshot = stableFileSnapshot(
    credentialPath,
    'CREDENTIAL_INPUT_INVALID'
  );
  const approvalSnapshot = stableFileSnapshot(
    approvalPath,
    'APPROVAL_INPUT_INVALID'
  );
  const binding = parseJsonSnapshot(bindingSnapshot, 'BINDING_INPUT_INVALID');
  const credentialConfiguration = parseJsonSnapshot(
    credentialSnapshot,
    'CREDENTIAL_INPUT_INVALID'
  );
  const approval = parseJsonSnapshot(
    approvalSnapshot,
    'APPROVAL_INPUT_INVALID'
  );
  const implementationSnapshots =
    captureImplementationSnapshots(repositoryRoot);
  const governanceSnapshot = stableFileSnapshot(
    path.join(repositoryRoot, GOVERNANCE_RELATIVE_PATH),
    'GOVERNANCE_INPUT_INVALID'
  );
  const head = runGit(
    repositoryRoot,
    ['rev-parse', 'HEAD'],
    'GIT_HEAD_INVALID'
  ).stdout;
  const baseCheck = runGit(
    repositoryRoot,
    ['merge-base', '--is-ancestor', APPROVED_BASE_COMMIT, head],
    'GIT_BASE_INVALID',
    [0, 1]
  );
  const worktreeStatus = runGit(
    repositoryRoot,
    ['status', '--porcelain=v1', '--untracked-files=all'],
    'GIT_WORKTREE_INVALID'
  ).stdout;
  const journalIdentity = inspectDpapiDirectoryIdentity(journalDirectory);
  const evidenceIdentity = inspectDpapiDirectoryIdentity(evidenceParent);
  const context = {
    currentGitHead: head,
    baseCommitIsAncestor: baseCheck.status === 0,
    gitWorktreeClean: worktreeStatus.length === 0,
    governanceSha256: governanceSnapshot.sha256,
    contractSha256: implementationSnapshots.contract.sha256,
    sharedProvisioningContractSha256:
      implementationSnapshots.sharedProvisioningContract.sha256,
    wrapperSha256: implementationSnapshots.wrapper.sha256,
    credentialChannelSha256: implementationSnapshots.credentialChannel.sha256,
    credentialBrokerSha256: implementationSnapshots.credentialBroker.sha256,
    evidenceVerifierSha256: implementationSnapshots.evidenceVerifier.sha256,
    credentialConfigurationSha256: credentialSnapshot.sha256,
    approvalEvidenceSha256: approvalSnapshot.sha256,
    journalDirectoryPathSha256: windowsPathFingerprint(journalDirectory),
    journalDirectoryResolvedPathSha256: journalIdentity.resolvedPathSha256,
    journalDirectoryDevice: journalIdentity.device,
    journalDirectoryInode: journalIdentity.inode,
    evidenceParentDirectoryPathSha256: windowsPathFingerprint(evidenceParent),
    evidenceParentDirectoryResolvedPathSha256:
      evidenceIdentity.resolvedPathSha256,
    evidenceParentDirectoryDevice: evidenceIdentity.device,
    evidenceParentDirectoryInode: evidenceIdentity.inode,
    now: new Date().toISOString(),
    environment: captureAmbientEnvironmentSnapshot(),
  };
  const validation = validateOrganizationIdentityCaptureOffline(
    binding,
    credentialConfiguration,
    approval,
    context
  );
  const dpapiResources = validateDpapiOrganizationIdentityCaptureResources(
    credentialConfiguration,
    repositoryRoot
  );
  assertDpapiDirectoryIsolation(
    dpapiResources.providerRootIdentity,
    journalIdentity,
    evidenceIdentity
  );
  return {
    repositoryRoot,
    bindingPath,
    credentialPath,
    approvalPath,
    journalDirectory,
    evidenceParent,
    bindingSnapshot,
    credentialSnapshot,
    approvalSnapshot,
    binding,
    credentialConfiguration,
    approval,
    implementationSnapshots,
    governanceSnapshot,
    journalIdentity,
    evidenceIdentity,
    context,
    validation,
    dpapiResources,
  };
}

function revalidateOfflineInputs(inputs, code) {
  assertCanonicalRepositoryRoot(inputs.repositoryRoot);
  assertOutputDirectoryOutsideRepository(
    inputs.repositoryRoot,
    inputs.journalDirectory
  );
  assertOutputDirectoryOutsideRepository(
    inputs.repositoryRoot,
    inputs.evidenceParent
  );
  assertNoAmbientOrganizationCaptureCredentialEnvironment(
    captureAmbientEnvironmentSnapshot()
  );
  const currentImplementationSnapshots = captureImplementationSnapshots(
    inputs.repositoryRoot
  );
  requireSnapshotsUnchanged(
    currentImplementationSnapshots,
    inputs.implementationSnapshots,
    code
  );
  for (const [pathname, expected] of [
    [inputs.bindingPath, inputs.bindingSnapshot],
    [inputs.credentialPath, inputs.credentialSnapshot],
    [inputs.approvalPath, inputs.approvalSnapshot],
    [
      path.join(inputs.repositoryRoot, GOVERNANCE_RELATIVE_PATH),
      inputs.governanceSnapshot,
    ],
  ]) {
    const current = stableFileSnapshot(pathname, code);
    if (
      current.sha256 !== expected.sha256 ||
      canonicalJson(current.identity) !== canonicalJson(expected.identity)
    ) {
      fail(code);
    }
  }
  const journalIdentity = inspectDpapiDirectoryIdentity(
    inputs.journalDirectory
  );
  const evidenceIdentity = inspectDpapiDirectoryIdentity(inputs.evidenceParent);
  if (
    canonicalJson(journalIdentity) !== canonicalJson(inputs.journalIdentity) ||
    canonicalJson(evidenceIdentity) !== canonicalJson(inputs.evidenceIdentity)
  ) {
    fail(code);
  }
  revalidateDpapiOrganizationIdentityCaptureResources(
    inputs.credentialConfiguration,
    inputs.repositoryRoot,
    inputs.dpapiResources
  );
  const head = runGit(
    inputs.repositoryRoot,
    ['rev-parse', 'HEAD'],
    code
  ).stdout;
  const status = runGit(
    inputs.repositoryRoot,
    ['status', '--porcelain=v1', '--untracked-files=all'],
    code
  ).stdout;
  if (head !== inputs.context.currentGitHead || status.length !== 0) fail(code);
  validateOrganizationIdentityCaptureOffline(
    inputs.binding,
    inputs.credentialConfiguration,
    inputs.approval,
    {
      ...inputs.context,
      now: new Date().toISOString(),
      environment: captureAmbientEnvironmentSnapshot(),
    }
  );
}

function canonicalTimestamp(value) {
  const milliseconds = Date.parse(value);
  return (
    typeof value === 'string' &&
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function assertApprovalCurrent(expiresAt) {
  if (!canonicalTimestamp(expiresAt) || Date.parse(expiresAt) <= Date.now()) {
    fail('APPROVAL_EXPIRED_BEFORE_REMOTE_CONTACT');
  }
}

export async function performOrganizationIdentityCaptureRequest({
  accessToken,
  timeoutMilliseconds,
  approvalExpiresAt,
  onRemoteContact,
  fetchImplementation = globalThis.fetch,
}) {
  if (
    typeof accessToken !== 'string' ||
    accessToken.length < 20 ||
    accessToken.length > 4096 ||
    accessToken.includes('\0') ||
    accessToken.includes('\r') ||
    accessToken.includes('\n') ||
    typeof fetchImplementation !== 'function' ||
    typeof onRemoteContact !== 'function'
  ) {
    fail('RUNTIME_TOKEN_INVALID');
  }
  if (
    !Number.isInteger(timeoutMilliseconds) ||
    timeoutMilliseconds < 1_000 ||
    timeoutMilliseconds > 30_000
  ) {
    fail('REQUEST_TIMEOUT_INVALID');
  }
  assertAllowedOrganizationIdentityCaptureRequest({
    bodyPresent: false,
    method: 'GET',
    url: ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT,
  });
  assertApprovalCurrent(approvalExpiresAt);
  assertSafeOrganizationIdentityCaptureNodeRuntime(
    process.version,
    process.execArgv
  );
  onRemoteContact();
  return fetchImplementation(ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMilliseconds),
  });
}

function assertJsonHasNoDuplicateObjectMembers(text) {
  let index = 0;
  const skipWhitespace = () => {
    while (
      index < text.length &&
      (text[index] === ' ' ||
        text[index] === '\n' ||
        text[index] === '\r' ||
        text[index] === '\t')
    ) {
      index += 1;
    }
  };
  const parseStringToken = () => {
    if (text[index] !== '"') fail('PROVIDER_RESPONSE_INVALID_JSON');
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          fail('PROVIDER_RESPONSE_INVALID_JSON');
        }
      }
      if (character === '\\') {
        index += 1;
        if (index >= text.length) fail('PROVIDER_RESPONSE_INVALID_JSON');
        if (text[index] === 'u') {
          const escape = text.slice(index + 1, index + 5);
          if (!/^[a-fA-F0-9]{4}$/.test(escape)) {
            fail('PROVIDER_RESPONSE_INVALID_JSON');
          }
          index += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(text[index])) {
          fail('PROVIDER_RESPONSE_INVALID_JSON');
        }
        index += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) {
        fail('PROVIDER_RESPONSE_INVALID_JSON');
      }
      index += 1;
    }
    fail('PROVIDER_RESPONSE_INVALID_JSON');
  };
  const parseValue = depth => {
    if (depth > 64) fail('PROVIDER_RESPONSE_INVALID_JSON');
    skipWhitespace();
    const character = text[index];
    if (character === '"') {
      parseStringToken();
      return;
    }
    if (character === '{') {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      while (index < text.length) {
        skipWhitespace();
        const key = parseStringToken();
        if (keys.has(key)) fail('PROVIDER_RESPONSE_DUPLICATE_MEMBER');
        keys.add(key);
        skipWhitespace();
        if (text[index] !== ':') fail('PROVIDER_RESPONSE_INVALID_JSON');
        index += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (text[index] === '}') {
          index += 1;
          return;
        }
        if (text[index] !== ',') fail('PROVIDER_RESPONSE_INVALID_JSON');
        index += 1;
      }
      fail('PROVIDER_RESPONSE_INVALID_JSON');
    }
    if (character === '[') {
      index += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      while (index < text.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (text[index] === ']') {
          index += 1;
          return;
        }
        if (text[index] !== ',') fail('PROVIDER_RESPONSE_INVALID_JSON');
        index += 1;
      }
      fail('PROVIDER_RESPONSE_INVALID_JSON');
    }
    const remaining = text.slice(index);
    const literal = /^(?:true|false|null)/.exec(remaining);
    if (literal !== null) {
      index += literal[0].length;
      return;
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
      remaining
    );
    if (number !== null) {
      index += number[0].length;
      return;
    }
    fail('PROVIDER_RESPONSE_INVALID_JSON');
  };
  parseValue(0);
  skipWhitespace();
  if (index !== text.length) fail('PROVIDER_RESPONSE_INVALID_JSON');
}

export async function readBoundedOrganizationIdentityResponse(response) {
  const contentLength = response?.headers?.get?.('content-length') ?? null;
  if (
    !isRecord(response) ||
    response.status !== 200 ||
    !isJsonMediaType(response.headers?.get?.('content-type') ?? '') ||
    response.body === null ||
    typeof response.body?.getReader !== 'function'
  ) {
    fail('PROVIDER_RESPONSE_REJECTED');
  }
  if (
    contentLength !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(contentLength) ||
      Number(contentLength) > ORGANIZATION_IDENTITY_CAPTURE_MAX_BODY_BYTES)
  ) {
    fail('PROVIDER_RESPONSE_TOO_LARGE');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let streamCompleted = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        streamCompleted = true;
        break;
      }
      if (!(next.value instanceof Uint8Array)) {
        fail('PROVIDER_RESPONSE_INVALID');
      }
      total += next.value.byteLength;
      if (total > ORGANIZATION_IDENTITY_CAPTURE_MAX_BODY_BYTES) {
        fail('PROVIDER_RESPONSE_TOO_LARGE');
      }
      chunks.push(Buffer.from(next.value));
    }
    if (total === 0) fail('PROVIDER_RESPONSE_INVALID');
    const bytes = Buffer.concat(chunks, total);
    let bodyText;
    try {
      bodyText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      fail('PROVIDER_RESPONSE_INVALID_UTF8');
    }
    const normalizedBodyText = bodyText.toLowerCase();
    if (
      normalizedBodyText.includes(PRODUCTION_PROJECT_REF.toLowerCase()) ||
      normalizedBodyText.includes(PRODUCTION_PROJECT_ORIGIN.toLowerCase())
    ) {
      fail('PROVIDER_RESPONSE_PRODUCTION_IDENTIFIER_FORBIDDEN');
    }
    assertJsonHasNoDuplicateObjectMembers(bodyText);
    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      fail('PROVIDER_RESPONSE_INVALID_JSON');
    }
    const projection = organizationIdentityResponseToSafeProjection(parsed);
    return {
      bodySha256: createHash('sha256').update(bytes).digest('hex'),
      httpStatus: response.status,
      projection,
    };
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    if (!streamCompleted && typeof reader.cancel === 'function') {
      try {
        await reader.cancel();
      } catch {
        // The response is already rejected; cancellation failure cannot authorize reuse.
      }
    }
    if (typeof reader.releaseLock === 'function') reader.releaseLock();
  }
}

export async function performAndReadOrganizationIdentityCapture({
  accessToken,
  timeoutMilliseconds,
  approvalExpiresAt,
  onRemoteContact,
  fetchImplementation = globalThis.fetch,
}) {
  let attemptContactCount = 0;
  try {
    const response = await performOrganizationIdentityCaptureRequest({
      accessToken,
      timeoutMilliseconds,
      approvalExpiresAt,
      onRemoteContact: () => {
        attemptContactCount = 1;
        onRemoteContact();
      },
      fetchImplementation,
    });
    return await readBoundedOrganizationIdentityResponse(response);
  } catch (error) {
    const observedCode = safeErrorCode(error);
    const reasonCode =
      observedCode === 'UNEXPECTED_LOCAL_FAILURE'
        ? 'ORGANIZATION_IDENTITY_RESPONSE_NOT_OBSERVED'
        : observedCode;
    const preferredOutcome =
      error instanceof IdentityCaptureExecutionError
        ? error.outcome
        : 'PARTIAL_FAILURE';
    throw new IdentityCaptureExecutionError(
      reasonCode,
      classifyIdentityCaptureFailureOutcome(
        attemptContactCount,
        preferredOutcome
      )
    );
  }
}

function writeJsonExclusive(pathname, value) {
  const bytes = Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
  let descriptor;
  try {
    descriptor = openSync(pathname, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const readback = readFileSync(pathname);
  if (!readback.equals(bytes)) fail('DURABLE_WRITE_READBACK_FAILED');
  const metadata = {
    path: path.basename(pathname),
    bytes: readback.length,
    sha256: createHash('sha256').update(readback).digest('hex'),
  };
  bytes.fill(0);
  readback.fill(0);
  return metadata;
}

function writeTextExclusive(pathname, text) {
  const bytes = Buffer.from(text, 'utf8');
  let descriptor;
  try {
    descriptor = openSync(pathname, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const readback = readFileSync(pathname);
  if (!readback.equals(bytes)) fail('DURABLE_WRITE_READBACK_FAILED');
  bytes.fill(0);
  readback.fill(0);
}

function makeEvidenceDirectory(evidenceParent, startedAt, requestSha256) {
  const compact = startedAt
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('.', '-');
  const name = `pr12-action-002-${compact}-${requestSha256.slice(0, 12)}`;
  const finalDirectory = path.join(evidenceParent, name);
  const partialDirectory = path.join(
    evidenceParent,
    `${name}.partial-${process.pid}`
  );
  if (existsSync(finalDirectory) || existsSync(partialDirectory)) {
    fail('EVIDENCE_DIRECTORY_ALREADY_EXISTS');
  }
  mkdirSync(partialDirectory, { recursive: false, mode: 0o700 });
  return { finalDirectory, partialDirectory, name };
}

function buildBaseResult(inputs, startedAt, claimSha256) {
  return {
    schemaVersion: 1,
    resultType: 'SOURCE_ORGANIZATION_IDENTITY_CAPTURE_OPERATION',
    status: 'NOT_RUN',
    outcome: 'NOT_RUN',
    actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
    gitCommit: inputs.context.currentGitHead,
    baseCommit: APPROVED_BASE_COMMIT,
    bindingMaterialSha256: inputs.validation.bindingMaterialSha256,
    requestSha256: inputs.validation.requestSha256,
    credentialConfigurationSha256: inputs.context.credentialConfigurationSha256,
    approvalEvidenceSha256: inputs.context.approvalEvidenceSha256,
    claimSha256,
    getIntentSha256: null,
    approvalWindow: {
      approvedAt: inputs.approval.approvedAt,
      operatorReconfirmedAt: inputs.approval.operatorReconfirmedAt,
      expiresAt: inputs.approval.expiresAt,
      approvedBy: inputs.approval.approvedBy,
    },
    ownerControl: {
      mode: inputs.binding.ownerControl.mode,
      operator: inputs.binding.ownerControl.operator,
      approver: inputs.binding.ownerControl.approver,
      identitySeparationAvailable:
        inputs.binding.ownerControl.identitySeparationAvailable,
      independentHumanReviewClaimed:
        inputs.binding.ownerControl.independentHumanReviewClaimed,
      soleOperatorSelfApprovalRiskAccepted:
        inputs.binding.ownerControl.soleOperatorSelfApprovalRiskAccepted,
      sameUserDpapiCredentialExposureRiskAccepted:
        inputs.binding.ownerControl.sameUserDpapiCredentialExposureRiskAccepted,
    },
    request: {
      method: 'GET',
      endpoint: ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT,
      bodyPresent: false,
      redirectAllowed: false,
    },
    contact: {
      remoteContactCount: 0,
      requestAttemptCount: 0,
      automaticRetryCount: 0,
    },
    organization: null,
    providerObservation: null,
    productionBoundary: {
      organizationProjectEnumerationPerformed: false,
      productionProjectSpecificManagementApiContactCount: 0,
      productionProjectDataPlaneContactCount: 0,
      productionDatabaseContactCount: 0,
      productionCredentialAccessCount: 0,
    },
    credential: {
      brokerMode: 'ORGANIZATION_IDENTITY_CAPTURE',
      brokerInvocationCount: 0,
      managementAccessTokenRetrieved: false,
      databasePasswordRetrieved: false,
      ambientCredentialFallbackUsed: false,
      secretPersisted: false,
    },
    rawProviderBodiesPersisted: false,
    rawHttpHeadersPersisted: false,
    runtime: {
      nodeVersion: process.version,
      processExecArgvCount: process.execArgv.length,
    },
    startedAt,
    completedAt: startedAt,
    reasonCode: null,
    mandatoryStopObserved: false,
  };
}

function buildProviderExport(inputs, outcome, completedAt, response) {
  return {
    schemaVersion: 1,
    exportType: 'SUPABASE_SOURCE_ORGANIZATION_IDENTITY_SAFE_PROJECTION',
    status: outcome,
    actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
    request: {
      method: 'GET',
      endpoint: ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT,
      bodyPresent: false,
      rawHttpHeadersPersisted: false,
    },
    response,
    productionBoundary: {
      organizationProjectEnumerationPerformed: false,
      productionProjectSpecificManagementApiContactCount: 0,
      productionProjectDataPlaneContactCount: 0,
      productionDatabaseContactCount: 0,
      productionCredentialAccessCount: 0,
    },
    rawProviderBodiesPersisted: false,
    capturedAt: completedAt,
    capturedBy: inputs.validation.principalId,
  };
}

function sealEvidence({
  inputs,
  evidence,
  events,
  outcome,
  result,
  providerExport,
  accessToken,
}) {
  const artifactMetadata = [];
  const writeArtifact = (filename, value, classification) => {
    assertOrganizationIdentityCaptureEvidenceSecretFree(
      value,
      accessToken === undefined ? [] : [accessToken]
    );
    const metadata = writeJsonExclusive(
      path.join(evidence.partialDirectory, filename),
      value
    );
    artifactMetadata.push({ ...metadata, classification });
  };
  writeArtifact(
    'action-events.json',
    {
      schemaVersion: 1,
      actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
      outcome,
      events,
    },
    'INTERNAL_NO_PII'
  );
  writeArtifact(
    'organization-identity-capture-result.json',
    result,
    'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS'
  );
  writeArtifact(
    'provider-export.safe.json',
    providerExport,
    'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS'
  );
  const privacyScan = {
    schemaVersion: 1,
    scanType:
      'PR12_SOURCE_ORGANIZATION_IDENTITY_CAPTURE_PRIVACY_AND_SECRET_SCAN',
    status: outcome,
    scanner: 'pr12-source-organization-identity-capture-contract-v1',
    rawProviderBodiesPersisted: false,
    rawHttpHeadersPersisted: false,
    runtimeSecretValuesComparedAgainstArtifacts: true,
    runtimeSecretValueCount: accessToken === undefined ? 0 : 1,
    scanMode:
      accessToken === undefined
        ? 'STATIC_MARKER_EXACT_SUBSTRING_SCAN'
        : 'RUNTIME_TOKEN_AND_STATIC_MARKER_EXACT_SUBSTRING_SCAN',
    scannedArtifacts: [
      'action-events.json',
      'organization-identity-capture-result.json',
      'provider-export.safe.json',
    ],
    scannedAt: new Date().toISOString(),
  };
  for (const filename of privacyScan.scannedArtifacts) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      readFileSync(path.join(evidence.partialDirectory, filename))
    );
    if (
      STATIC_SECRET_MARKERS.some(marker => text.includes(marker)) ||
      (accessToken !== undefined && text.includes(accessToken))
    ) {
      fail('EVIDENCE_SECRET_SCAN_FAILED');
    }
  }
  writeArtifact('privacy-scan.json', privacyScan, 'INTERNAL_NO_PII');
  const sealedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    manifestType: 'PR12_SOURCE_ORGANIZATION_IDENTITY_CAPTURE_EVIDENCE',
    status: outcome,
    actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
    gitCommit: inputs.context.currentGitHead,
    bindingMaterialSha256: inputs.validation.bindingMaterialSha256,
    requestSha256: inputs.validation.requestSha256,
    artifacts: artifactMetadata,
    artifactCount: artifactMetadata.length,
    rawProviderBodiesPersisted: false,
    rawHttpHeadersPersisted: false,
    sealedAt,
  };
  const manifestMetadata = writeJsonExclusive(
    path.join(evidence.partialDirectory, 'manifest.json'),
    manifest
  );
  writeTextExclusive(
    path.join(evidence.partialDirectory, 'manifest.sha256'),
    `${manifestMetadata.sha256}\n`
  );
  verifyOrganizationIdentityCaptureEvidenceDirectory(
    evidence.partialDirectory,
    accessToken === undefined ? [] : [accessToken]
  );
  renameSync(evidence.partialDirectory, evidence.finalDirectory);
  const verified = verifyOrganizationIdentityCaptureEvidenceDirectory(
    evidence.finalDirectory,
    accessToken === undefined ? [] : [accessToken]
  );
  return {
    evidenceDirectoryName: evidence.name,
    manifestSha256: verified.manifestSha256,
    organizationId: verified.organizationId,
  };
}

function writeIntent(inputs, claimSha256) {
  const intent = {
    actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
    bindingMaterialSha256: inputs.validation.bindingMaterialSha256,
    payloadSha256: inputs.validation.requestSha256,
    getIntentAt: new Date().toISOString(),
    state: 'GET_INTENT_DURABLE',
    automaticRetryCount: 0,
    remoteContactCountBeforeGet: 0,
    claimSha256,
  };
  const metadata = writeJsonExclusive(
    path.join(
      inputs.journalDirectory,
      ORGANIZATION_IDENTITY_CAPTURE_INTENT_FILE
    ),
    intent
  );
  return { intent, metadata };
}

function revalidateIntent(
  inputs,
  expectedClaim,
  expectedClaimSha256,
  expectedIntent,
  expectedIntentSha256
) {
  revalidateOfflineInputs(inputs, 'PRE_FETCH_REVALIDATION_FAILED');
  const claimSnapshot = stableFileSnapshot(
    path.join(
      inputs.journalDirectory,
      ORGANIZATION_IDENTITY_CAPTURE_CLAIM_FILE
    ),
    'CLAIM_CHANGED'
  );
  const claim = parseJsonSnapshot(claimSnapshot, 'CLAIM_CHANGED');
  const intentSnapshot = stableFileSnapshot(
    path.join(
      inputs.journalDirectory,
      ORGANIZATION_IDENTITY_CAPTURE_INTENT_FILE
    ),
    'GET_INTENT_CHANGED'
  );
  const intent = parseJsonSnapshot(intentSnapshot, 'GET_INTENT_CHANGED');
  if (
    canonicalJson(claim) !== canonicalJson(expectedClaim) ||
    claimSnapshot.sha256 !== expectedClaimSha256 ||
    canonicalJson(intent) !== canonicalJson(expectedIntent) ||
    intentSnapshot.sha256 !== expectedIntentSha256
  ) {
    fail('GET_INTENT_CHANGED');
  }
  assertApprovalCurrent(inputs.validation.approvalExpiresAt);
}

async function executeIdentityCapture(inputs) {
  assertSafeOrganizationIdentityCaptureNodeRuntime(
    process.version,
    process.execArgv
  );
  const startedAt = new Date().toISOString();
  const claim = {
    actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
    bindingMaterialSha256: inputs.validation.bindingMaterialSha256,
    claimedAt: startedAt,
    payloadSha256: inputs.validation.requestSha256,
    state: 'CLAIMED_GET_NOT_SENT',
  };
  const claimResult = claimOrganizationIdentityCaptureAction(
    inputs.journalDirectory,
    claim
  );
  let evidence = null;
  const events = [
    {
      sequence: 1,
      state: 'CLAIMED_GET_NOT_SENT',
      at: startedAt,
      remoteContactCount: 0,
      requestAttemptCount: 0,
      automaticRetryCount: 0,
    },
  ];
  const result = buildBaseResult(inputs, startedAt, claimResult.claimSha256);
  let accessToken;
  let remoteContactCount = 0;
  let providerResponse = null;
  let sealed = null;
  let evidenceSealAttempted = false;
  try {
    evidence = makeEvidenceDirectory(
      inputs.evidenceParent,
      startedAt,
      inputs.validation.requestSha256
    );
    revalidateOfflineInputs(inputs, 'PRE_BROKER_REVALIDATION_FAILED');
    result.credential.brokerInvocationCount = 1;
    const credentials = retrieveClaimBoundCredentials({
      mode: 'ORGANIZATION_IDENTITY_CAPTURE',
      bindingMaterialSha256: inputs.validation.bindingMaterialSha256,
      payloadSha256: inputs.validation.requestSha256,
      claimSha256: claimResult.claimSha256,
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
      approvalExpiresAt: inputs.validation.approvalExpiresAt,
      resources: inputs.dpapiResources,
    });
    if (
      !isRecord(credentials) ||
      Object.keys(credentials).length !== 1 ||
      typeof credentials.managementAccessToken !== 'string' ||
      Object.hasOwn(credentials, 'databasePassword')
    ) {
      fail('TOKEN_ONLY_BROKER_CONTRACT_VIOLATION');
    }
    accessToken = credentials.managementAccessToken;
    result.credential.managementAccessTokenRetrieved = true;
    const intent = writeIntent(inputs, claimResult.claimSha256);
    result.getIntentSha256 = intent.metadata.sha256;
    events.push({
      sequence: 2,
      state: 'GET_INTENT_DURABLE',
      at: intent.intent.getIntentAt,
      remoteContactCount: 0,
      requestAttemptCount: 0,
      automaticRetryCount: 0,
    });
    revalidateIntent(
      inputs,
      claim,
      claimResult.claimSha256,
      intent.intent,
      intent.metadata.sha256
    );
    const observation = await performAndReadOrganizationIdentityCapture({
      accessToken,
      timeoutMilliseconds: inputs.binding.action.requestTimeoutMilliseconds,
      approvalExpiresAt: inputs.validation.approvalExpiresAt,
      onRemoteContact: () => {
        if (remoteContactCount !== 0) {
          fail('SECOND_REMOTE_CONTACT_FORBIDDEN');
        }
        remoteContactCount = 1;
        result.contact.remoteContactCount = 1;
        result.contact.requestAttemptCount = 1;
      },
    });
    const observedAt = new Date().toISOString();
    providerResponse = {
      httpStatus: observation.httpStatus,
      bodySha256: observation.bodySha256,
      safeProjectionSha256: sha256Text(canonicalJson(observation.projection)),
      safeProjection: observation.projection,
      observedAt,
    };
    events.push({
      sequence: 3,
      state: 'RESPONSE_ACCEPTED',
      at: observedAt,
      remoteContactCount: 1,
      requestAttemptCount: 1,
      automaticRetryCount: 0,
    });
    result.organization = observation.projection;
    result.providerObservation = {
      httpStatus: observation.httpStatus,
      bodySha256: observation.bodySha256,
      safeProjectionSha256: providerResponse.safeProjectionSha256,
      observedAt,
    };
    const completedAt = new Date().toISOString();
    events.push({
      sequence: 4,
      state: 'ORGANIZATION_IDENTITY_CAPTURED',
      at: completedAt,
      remoteContactCount: 1,
      requestAttemptCount: 1,
      automaticRetryCount: 0,
    });
    result.status = 'PASS';
    result.outcome = 'PASS';
    result.completedAt = completedAt;
    result.mandatoryStopObserved = true;
    const providerExport = buildProviderExport(
      inputs,
      'PASS',
      completedAt,
      providerResponse
    );
    evidenceSealAttempted = true;
    sealed = sealEvidence({
      inputs,
      evidence,
      events,
      outcome: 'PASS',
      result,
      providerExport,
      accessToken,
    });
    writeJsonExclusive(
      path.join(
        inputs.journalDirectory,
        ORGANIZATION_IDENTITY_CAPTURE_TERMINAL_FILE
      ),
      {
        actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
        bindingMaterialSha256: inputs.validation.bindingMaterialSha256,
        requestSha256: inputs.validation.requestSha256,
        state: 'TERMINAL_PASS',
        completedAt,
        evidenceDirectoryName: sealed.evidenceDirectoryName,
        manifestSha256: sealed.manifestSha256,
        remoteContactCount: 1,
        requestAttemptCount: 1,
        automaticRetryCount: 0,
      }
    );
    return {
      status: 'PASS',
      actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
      organizationId: sealed.organizationId,
      evidenceDirectoryName: sealed.evidenceDirectoryName,
      manifestSha256: sealed.manifestSha256,
      remoteContactCount: 1,
      requestAttemptCount: 1,
      automaticRetryCount: 0,
      mandatoryStopObserved: true,
      sourceProjectProvisioningPerformed: false,
      productionProjectContactPerformed: false,
    };
  } catch (error) {
    const reasonCode = safeErrorCode(error);
    const outcome = safeOutcome(error, remoteContactCount);
    const completedAt = new Date().toISOString();
    if (remoteContactCount === 1 && events.at(-1)?.remoteContactCount !== 1) {
      events.push({
        sequence: events.length + 1,
        state: 'GET_ATTEMPT_TERMINATED_WITHOUT_ACCEPTED_RESPONSE',
        at: completedAt,
        remoteContactCount: 1,
        requestAttemptCount: 1,
        automaticRetryCount: 0,
      });
    }
    result.status = outcome;
    result.outcome = outcome;
    result.completedAt = completedAt;
    result.reasonCode = reasonCode;
    result.mandatoryStopObserved = true;
    const providerExport = buildProviderExport(
      inputs,
      outcome,
      completedAt,
      null
    );
    if (evidence === null) {
      try {
        writeJsonExclusive(
          path.join(
            inputs.journalDirectory,
            ORGANIZATION_IDENTITY_CAPTURE_TERMINAL_FILE
          ),
          {
            actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
            bindingMaterialSha256: inputs.validation.bindingMaterialSha256,
            requestSha256: inputs.validation.requestSha256,
            state: 'TERMINAL_PARTIAL_FAILURE_EVIDENCE_NOT_CREATED',
            reasonCode,
            completedAt,
            evidenceDirectoryName: null,
            manifestSha256: null,
            remoteContactCount: 0,
            requestAttemptCount: 0,
            automaticRetryCount: 0,
          }
        );
      } catch {
        // The durable action claim remains the authoritative no-retry marker.
      }
      throw new IdentityCaptureExecutionError(reasonCode, outcome);
    }
    try {
      if (evidenceSealAttempted) throw error;
      evidenceSealAttempted = true;
      sealed = sealEvidence({
        inputs,
        evidence,
        events,
        outcome,
        result,
        providerExport,
        accessToken,
      });
      writeJsonExclusive(
        path.join(
          inputs.journalDirectory,
          ORGANIZATION_IDENTITY_CAPTURE_TERMINAL_FILE
        ),
        {
          actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
          bindingMaterialSha256: inputs.validation.bindingMaterialSha256,
          requestSha256: inputs.validation.requestSha256,
          state:
            outcome === 'UNKNOWN_REMOTE_OUTCOME'
              ? 'TERMINAL_UNKNOWN_REMOTE_OUTCOME'
              : 'TERMINAL_PARTIAL_FAILURE',
          completedAt,
          evidenceDirectoryName: sealed.evidenceDirectoryName,
          manifestSha256: sealed.manifestSha256,
          remoteContactCount,
          requestAttemptCount: remoteContactCount,
          automaticRetryCount: 0,
        }
      );
    } catch {
      // The durable claim and any partial evidence remain for owner review.
    }
    throw new IdentityCaptureExecutionError(reasonCode, outcome);
  } finally {
    accessToken = undefined;
  }
}

async function main() {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    if (parsed.help) {
      printHelp();
      return;
    }
    const inputs = buildOfflineInputs(parsed);
    if (parsed.offlineVerify) {
      process.stdout.write(
        `${canonicalJson({
          status: 'OFFLINE_APPROVAL_VALID',
          actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
          bindingMaterialSha256: inputs.validation.bindingMaterialSha256,
          requestSha256: inputs.validation.requestSha256,
          remoteContactPerformed: false,
          credentialValueReadPerformed: false,
          actionJournalClaimed: false,
        })}\n`
      );
      return;
    }
    const result = await executeIdentityCapture(inputs);
    process.stdout.write(`${canonicalJson(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `PR12 Organization identity capture stopped: ${safeErrorCode(error)}\n`
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === scriptPath) await main();

export const ORGANIZATION_IDENTITY_CAPTURE_WRAPPER_CONSTANTS = Object.freeze({
  actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
  endpoint: ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT,
  claimFile: ORGANIZATION_IDENTITY_CAPTURE_CLAIM_FILE,
  intentFile: ORGANIZATION_IDENTITY_CAPTURE_INTENT_FILE,
  terminalFile: ORGANIZATION_IDENTITY_CAPTURE_TERMINAL_FILE,
  approvedRequest: buildOrganizationIdentityCaptureRequestProjection(),
});
