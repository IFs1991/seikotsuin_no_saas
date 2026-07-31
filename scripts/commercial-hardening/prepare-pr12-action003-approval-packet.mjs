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
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildAction003ApprovalArtifacts,
  completeAction003ApprovalOutputCreateNew,
  initializeAction003ApprovalOutputCreateNew,
  verifyExistingAction003ApprovalOutput,
  verifyAction003ApprovalOutput,
} from './build-pr12-action003-approval-packet.mjs';
import { validateInitialAction003ApprovalReceipt } from './pr12-action003-approval-receipt-contract.mjs';
import {
  ACTION002_SEALED_EVIDENCE,
  APPROVED_BASE_COMMIT,
  OFFICIAL_PRICING_SOURCES,
  assertOfficialPricingSourceSemantics,
  canonicalJson,
  derivePricingExecutionFreshThrough,
  hasAsciiControlCharacter,
  isForbiddenAmbientCredentialName,
  sha256Text,
} from './pr12-source-project-provisioning-contract.mjs';
import {
  assertDpapiDirectoryIsolation,
  inspectDpapiDirectoryIdentity,
  revalidateDpapiCredentialResources,
  validateDpapiCredentialResources,
} from './pr12-windows-dpapi-credential-channel.mjs';
import {
  ORGANIZATION_IDENTITY_CAPTURE_CLAIM_FILE,
  ORGANIZATION_IDENTITY_CAPTURE_INTENT_FILE,
  ORGANIZATION_IDENTITY_CAPTURE_TERMINAL_FILE,
} from './pr12-source-organization-identity-capture-contract.mjs';
import { verifyOrganizationIdentityCaptureTerminalLinkage } from './verify-pr12-source-organization-identity-capture-evidence.mjs';

const OPERATION = 'PREPARE_PR12_ACTION003_APPROVAL_PACKET_LOCAL_ONLY';
const PREFLIGHT_MODE_VALIDATE = 'VALIDATE';
const PREFLIGHT_MODE_CREATE = 'CREATE';
const PREFLIGHT_MODE_REVALIDATE = 'REVALIDATE';
const ACTION002_SOURCE_HEAD = ACTION002_SEALED_EVIDENCE.sourceGitCommit;
const ACTION002_BINDING_SHA256 =
  ACTION002_SEALED_EVIDENCE.sourceBindingMaterialSha256;
const ACTION002_REQUEST_SHA256 = ACTION002_SEALED_EVIDENCE.sourceRequestSha256;
const ACTION002_MANIFEST_SHA256 = ACTION002_SEALED_EVIDENCE.manifestSha256;
const ACTION002_TERMINAL_SHA256 = ACTION002_SEALED_EVIDENCE.terminalSha256;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/u;
const MAXIMUM_DESCRIPTOR_BYTES = 262_144;
const MAXIMUM_JSON_ARTIFACT_BYTES = 1_048_576;
const MAXIMUM_PRICING_SOURCE_BYTES = 16 * 1_048_576;
const MODULE_REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const TRACKED_BINDING_TEMPLATE =
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-binding-v6.template.json';
const TRACKED_AUTHORIZATION_PROJECTION_TEMPLATE =
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-authorization-projection-v1.template.json';
const OWNER_PRIVATE_ACL_HELPER_RELATIVE_PATH =
  'scripts/commercial-hardening/pr12-windows-owner-private-acl.ps1';
const OWNER_PRIVATE_ACL_HELPER_PATH = path.join(
  MODULE_REPOSITORY_ROOT,
  OWNER_PRIVATE_ACL_HELPER_RELATIVE_PATH
);
const OWNER_PRIVATE_ACL_POLICY_ID =
  'WINDOWS_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_V1';
const WINDOWS_SYSTEM_SID = 'S-1-5-18';
const HASH_BOUND_TRACKED_FILES = Object.freeze({
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
const TRACKED_RUNTIME_INPUTS = Object.freeze([
  TRACKED_BINDING_TEMPLATE,
  TRACKED_AUTHORIZATION_PROJECTION_TEMPLATE,
  ...Object.values(HASH_BOUND_TRACKED_FILES),
  'scripts/commercial-hardening/build-pr12-action003-approval-packet.mjs',
  OWNER_PRIVATE_ACL_HELPER_RELATIVE_PATH,
  'scripts/commercial-hardening/pr12-windows-dpapi-credential-channel.mjs',
  'scripts/commercial-hardening/prepare-pr12-action003-approval-packet.mjs',
]);
export class Action003ApprovalPreflightError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Action003ApprovalPreflightError';
    this.code = code;
  }
}

function fail(code) {
  throw new Action003ApprovalPreflightError(code);
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

function isWindowsAbsolutePath(value) {
  return (
    typeof value === 'string' &&
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(value) &&
    !value.startsWith('\\\\')
  );
}

function resolvePortablePath(value) {
  return isWindowsAbsolutePath(value)
    ? path.win32.resolve(value)
    : path.resolve(value);
}

function normalizedPath(value) {
  if (isWindowsAbsolutePath(value)) {
    return path.win32.resolve(value).replaceAll('\\', '/').toLowerCase();
  }
  const normalized = path.resolve(value).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isWithin(parent, candidate) {
  const windowsPair =
    isWindowsAbsolutePath(parent) && isWindowsAbsolutePath(candidate);
  const relative = windowsPair
    ? path.win32.relative(parent, candidate)
    : path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') &&
      !(windowsPair
        ? path.win32.isAbsolute(relative)
        : path.isAbsolute(relative)))
  );
}

function requireNoReparsePathComponents(pathnameInput, code) {
  const pathname = path.resolve(pathnameInput);
  const root = path.parse(pathname).root;
  let current = root;
  try {
    for (const component of pathname.slice(root.length).split(path.sep)) {
      if (component.length === 0) continue;
      current = path.join(current, component);
      requireCondition(!lstatSync(current).isSymbolicLink(), code);
    }
  } catch (error) {
    if (error instanceof Action003ApprovalPreflightError) throw error;
    fail(code);
  }
}

function requireAbsolutePath(value, code) {
  requireCondition(
    typeof value === 'string' &&
      (path.isAbsolute(value) || isWindowsAbsolutePath(value)),
    code
  );
  return resolvePortablePath(value);
}

function stableReadSnapshot(filenameInput, maximumBytes, code) {
  const filename = requireAbsolutePath(filenameInput, code);
  let descriptor;
  let bytes;
  try {
    requireCondition(
      existsSync(filename) && !lstatSync(filename).isSymbolicLink(),
      code
    );
    descriptor = openSync(filename, 'r');
    const before = fstatSync(descriptor, { bigint: true });
    const resolved = realpathSync.native(filename);
    requireCondition(
      before.isFile() &&
        before.size <= BigInt(maximumBytes) &&
        normalizedPath(resolved) === normalizedPath(filename),
      code
    );
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalLinkStatus = lstatSync(filename);
    const finalResolved = realpathSync.native(filename);
    const current = statSync(filename, { bigint: true });
    requireCondition(
      after.isFile() &&
        finalLinkStatus.isFile() &&
        !finalLinkStatus.isSymbolicLink() &&
        current.isFile() &&
        normalizedPath(finalResolved) === normalizedPath(resolved) &&
        before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        after.dev === current.dev &&
        after.ino === current.ino &&
        BigInt(bytes.length) === after.size,
      `${code}_CHANGED`
    );
    return {
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      identity: {
        pathSha256: sha256Text(normalizedPath(filename)),
        resolvedPathSha256: sha256Text(normalizedPath(resolved)),
        device: String(after.dev),
        inode: String(after.ino),
        size: Number(after.size),
        modifiedAtMilliseconds: Number(after.mtimeMs),
      },
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseJsonSnapshot(snapshot, canonicalRequired, code) {
  let text;
  let parsed;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(snapshot.bytes);
    parsed = JSON.parse(text);
  } catch {
    fail(code);
  }
  requireCondition(isRecord(parsed), code);
  if (canonicalRequired) {
    requireCondition(text === `${canonicalJson(parsed)}\n`, code);
  }
  return parsed;
}

function stableReadJson(filename, maximumBytes, canonicalRequired, code) {
  const snapshot = stableReadSnapshot(filename, maximumBytes, code);
  return {
    value: parseJsonSnapshot(snapshot, canonicalRequired, code),
    snapshot,
  };
}

function assertSameSnapshot(filename, expected, maximumBytes, code) {
  const current = stableReadSnapshot(filename, maximumBytes, code);
  requireCondition(
    current.sha256 === expected.sha256 &&
      canonicalJson(current.identity) === canonicalJson(expected.identity),
    `${code}_CHANGED`
  );
}

function minimalGitEnvironment() {
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

export function requireAclBoundaryPathCount(pathnames, minimumPathCount = 10) {
  requireCondition(
    Array.isArray(pathnames) &&
      Number.isSafeInteger(minimumPathCount) &&
      minimumPathCount > 0,
    'ACL_BOUNDARY_COUNT_POLICY_INVALID'
  );
  requireCondition(
    pathnames.length >= minimumPathCount,
    'ACL_BOUNDARY_SET_INCOMPLETE'
  );
  return pathnames.length;
}

function requireAclPathKind(pathname, code) {
  let status;
  try {
    requireNoReparsePathComponents(pathname, code);
    status = lstatSync(pathname);
  } catch (error) {
    if (error instanceof Action003ApprovalPreflightError) throw error;
    fail(code);
  }
  requireCondition(!status.isSymbolicLink(), code);
  if (status.isDirectory()) return 'DIRECTORY';
  if (status.isFile()) return 'FILE';
  fail(code);
}

function runWindowsAclHelper(powershellExecutablePath, pathname, mode, code) {
  const kind = requireAclPathKind(pathname, code);
  const result = spawnSync(
    powershellExecutablePath,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      OWNER_PRIVATE_ACL_HELPER_PATH,
      '-Mode',
      mode,
      '-Kind',
      kind,
      '-LiteralPath',
      pathname,
    ],
    {
      encoding: 'utf8',
      env: minimalGitEnvironment(),
      maxBuffer: 64 * 1024,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      windowsHide: true,
    }
  );
  requireCondition(
    result.error === undefined &&
      result.signal === null &&
      result.status === 0 &&
      result.stdout.trim().length > 0 &&
      result.stderr.length === 0,
    code
  );
  let captured;
  try {
    captured = JSON.parse(result.stdout.trim());
  } catch {
    fail(code);
  }
  const proof = requireExactKeys(
    captured,
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
    proof.schemaVersion === 1 &&
      proof.aclPolicyId === OWNER_PRIVATE_ACL_POLICY_ID &&
      proof.kind === kind &&
      typeof proof.ownerSid === 'string' &&
      proof.ownerSid.length > 0 &&
      proof.ownerSid === proof.currentUserSid &&
      proof.ownerSid !== WINDOWS_SYSTEM_SID &&
      proof.systemSid === WINDOWS_SYSTEM_SID &&
      proof.accessRulesProtected === true &&
      proof.accessRuleCount === 2 &&
      Array.isArray(proof.allowedSids) &&
      proof.allowedSids.length === 2 &&
      new Set(proof.allowedSids).size === 2 &&
      proof.allowedSids.every(value => typeof value === 'string') &&
      proof.allowedSids.includes(proof.currentUserSid) &&
      proof.allowedSids.includes(WINDOWS_SYSTEM_SID) &&
      typeof proof.sddl === 'string' &&
      proof.sddl.length > 0,
    code
  );
  return {
    pathname,
    kind,
    ownerSid: proof.ownerSid,
    allowedSids: proof.allowedSids,
    sddl: proof.sddl,
  };
}

export function assertWindowsAclBoundaries(
  credentialConfiguration,
  pathnameInputs,
  minimumPathCount = 10
) {
  requireCondition(
    process.platform === 'win32',
    'WINDOWS_ACL_INSPECTION_REQUIRED'
  );
  const runtime = requireRecord(
    credentialConfiguration.runtime,
    'DPAPI_RUNTIME_BINDING_INVALID'
  );
  const powershellExecutablePath = requireAbsolutePath(
    runtime.powershellExecutablePath,
    'DPAPI_RUNTIME_BINDING_INVALID'
  );
  const pathnames = [
    ...new Set(
      pathnameInputs.map(value =>
        requireAbsolutePath(value, 'ACL_BOUNDARY_PATH_INVALID')
      )
    ),
  ];
  requireAclBoundaryPathCount(pathnames, minimumPathCount);
  const helperSnapshot = stableReadSnapshot(
    OWNER_PRIVATE_ACL_HELPER_PATH,
    MAXIMUM_JSON_ARTIFACT_BYTES,
    'ACL_HELPER_INVALID'
  );
  const captured = pathnames.map(pathname =>
    runWindowsAclHelper(
      powershellExecutablePath,
      pathname,
      'CAPTURE',
      'ACL_BOUNDARY_INVALID'
    )
  );
  assertSameSnapshot(
    OWNER_PRIVATE_ACL_HELPER_PATH,
    helperSnapshot,
    MAXIMUM_JSON_ARTIFACT_BYTES,
    'ACL_HELPER_INVALID'
  );
  const normalizedAclEntries = captured
    .map(entry => {
      const inheritanceFlags = entry.kind === 'DIRECTORY' ? 3 : 0;
      const rules = entry.allowedSids
        .map(sid => ({
          sidSha256: sha256Text(sid),
          rights: 2_032_127,
          inheritanceFlags,
          propagationFlags: 0,
          isInherited: false,
          accessControlType: 'Allow',
        }))
        .sort((left, right) =>
          canonicalJson(left).localeCompare(canonicalJson(right), 'en')
        );
      return {
        pathSha256: sha256Text(normalizedPath(entry.pathname)),
        kind: entry.kind,
        ownerSidSha256: sha256Text(entry.ownerSid),
        accessRulesProtected: true,
        normalizedAclEntries: rules,
        sddlSha256: sha256Text(entry.sddl),
      };
    })
    .sort((left, right) =>
      left.pathSha256.localeCompare(right.pathSha256, 'en')
    );
  return {
    pathCount: pathnames.length,
    aclProofSha256: sha256Text(canonicalJson(normalizedAclEntries)),
    normalizedAclEntries,
  };
}

export function protectWindowsOutputAcl(
  credentialConfiguration,
  pathnameInputs,
  expectedPathCount = 4
) {
  requireCondition(
    process.platform === 'win32',
    'WINDOWS_ACL_INSPECTION_REQUIRED'
  );
  const runtime = requireRecord(
    credentialConfiguration.runtime,
    'DPAPI_RUNTIME_BINDING_INVALID'
  );
  const powershellExecutablePath = requireAbsolutePath(
    runtime.powershellExecutablePath,
    'DPAPI_RUNTIME_BINDING_INVALID'
  );
  const pathnames = [
    ...new Set(
      pathnameInputs.map(value =>
        requireAbsolutePath(value, 'ACL_BOUNDARY_PATH_INVALID')
      )
    ),
  ];
  requireCondition(
    pathnames.length === expectedPathCount,
    'OUTPUT_ACL_SET_INVALID'
  );
  for (const pathname of pathnames) {
    requireNoReparsePathComponents(pathname, 'OUTPUT_ACL_REPARSE_FORBIDDEN');
    runWindowsAclHelper(
      powershellExecutablePath,
      pathname,
      'PROTECT_AND_CAPTURE',
      'OUTPUT_ACL_PROTECTION_FAILED'
    );
  }
  return assertWindowsAclBoundaries(
    credentialConfiguration,
    pathnames,
    pathnames.length
  );
}

function runGit(repositoryRoot, args, acceptedStatuses = [0]) {
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
      repositoryRoot,
      ...args,
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: minimalGitEnvironment(),
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

export function inspectAction003GitState(repositoryRootInput, expectedHead) {
  const repositoryRoot = requireAbsolutePath(
    repositoryRootInput,
    'REPOSITORY_ROOT_INVALID'
  );
  requireCondition(
    normalizedPath(realpathSync.native(repositoryRoot)) ===
      normalizedPath(MODULE_REPOSITORY_ROOT),
    'EXECUTING_REPOSITORY_ROOT_MISMATCH'
  );
  requireCondition(
    typeof expectedHead === 'string' && GIT_SHA_PATTERN.test(expectedHead),
    'GIT_HEAD_INVALID'
  );
  const topLevel = runGit(repositoryRoot, ['rev-parse', '--show-toplevel']);
  requireCondition(
    normalizedPath(topLevel.stdout) === normalizedPath(repositoryRoot),
    'EXECUTING_REPOSITORY_ROOT_MISMATCH'
  );
  const currentHead = runGit(repositoryRoot, ['rev-parse', 'HEAD']).stdout;
  requireCondition(currentHead === expectedHead, 'GIT_HEAD_MISMATCH');
  const currentBaseCommit = runGit(repositoryRoot, [
    'merge-base',
    currentHead,
    'origin/main',
  ]).stdout;
  requireCondition(
    currentBaseCommit === APPROVED_BASE_COMMIT,
    'GIT_BASE_INVALID'
  );
  const indexFlags = runGit(repositoryRoot, ['ls-files', '-v']).stdout;
  requireCondition(
    indexFlags.length > 0 &&
      indexFlags.split(/\r?\n/u).every(line => /^H /u.test(line)),
    'GIT_INDEX_FLAG_INVALID'
  );
  const worktreeStatus = runGit(repositoryRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]).stdout;
  for (const relativePath of TRACKED_RUNTIME_INPUTS) {
    const tracked = runGit(repositoryRoot, [
      'ls-files',
      '--error-unmatch',
      '--',
      relativePath,
    ]).stdout;
    requireCondition(tracked === relativePath, 'TRACKED_INPUT_NOT_IN_HEAD');
    const headBlob = runGit(repositoryRoot, [
      'rev-parse',
      `${currentHead}:${relativePath}`,
    ]).stdout;
    const worktreeBlob = runGit(repositoryRoot, [
      'hash-object',
      '--no-filters',
      '--',
      path.join(repositoryRoot, ...relativePath.split('/')),
    ]).stdout;
    requireCondition(
      headBlob === worktreeBlob,
      'TRACKED_INPUT_WORKTREE_HEAD_MISMATCH'
    );
  }
  const ancestor = runGit(
    repositoryRoot,
    ['merge-base', '--is-ancestor', ACTION002_SOURCE_HEAD, currentHead],
    [0, 1]
  );
  return {
    currentHead,
    currentBaseCommit,
    worktreeClean: worktreeStatus.length === 0,
    organizationIdentitySourceGitCommitIsAncestor: ancestor.status === 0,
  };
}

function inspectPriorActionState(directoryInput) {
  const directory = requireAbsolutePath(
    directoryInput,
    'ACTION_JOURNAL_DIRECTORY_INVALID'
  );
  const identity = inspectDpapiDirectoryIdentity(directory);
  const entries = readdirSync(directory);
  requireCondition(entries.length === 0, 'ACTION_ALREADY_CLAIMED');
  return { identity, priorActionState: null };
}

function requireAction002Evidence(value) {
  const evidence = requireRecord(value, 'ACTION002_SEALED_EVIDENCE_MISMATCH');
  requireCondition(
    evidence.status === 'PASS' &&
      evidence.actionId === 'PR12-ACTION-002' &&
      evidence.terminalState === 'TERMINAL_PASS' &&
      evidence.sourceGitCommit === ACTION002_SOURCE_HEAD &&
      evidence.sourceBindingMaterialSha256 === ACTION002_BINDING_SHA256 &&
      evidence.sourceRequestSha256 === ACTION002_REQUEST_SHA256 &&
      evidence.manifestSha256 === ACTION002_MANIFEST_SHA256 &&
      evidence.terminalSha256 === ACTION002_TERMINAL_SHA256 &&
      evidence.remoteContactCount === 1 &&
      evidence.requestAttemptCount === 1 &&
      evidence.automaticRetryCount === 0,
    'ACTION002_SEALED_EVIDENCE_MISMATCH'
  );
  return evidence;
}

function requireSafeRelativeArtifactPath(value) {
  const segments = typeof value === 'string' ? value.split('/') : [];
  requireCondition(
    typeof value === 'string' &&
      value.length > 0 &&
      !path.isAbsolute(value) &&
      !value.includes('\\') &&
      !value.includes(':') &&
      !hasAsciiControlCharacter(value) &&
      segments.every(
        segment => segment.length > 0 && segment !== '.' && segment !== '..'
      ),
    'PRICING_SOURCE_ARTIFACT_PATH_INVALID'
  );
  return value;
}

function inspectPricingSourceArtifacts(pricingEvidence, pricingEvidencePath) {
  const sources = pricingEvidence.officialSources;
  requireCondition(
    Array.isArray(sources) && sources.length === 3,
    'PRICING_SOURCE_ARTIFACT_SET_INVALID'
  );
  const pricingDirectory = path.dirname(pricingEvidencePath);
  const inspected = sources.map((sourceInput, index) => {
    const source = requireExactKeys(
      sourceInput,
      ['sourceId', 'url', 'retrievedAt', 'artifactPath', 'artifactSha256'],
      'PRICING_SOURCE_ARTIFACT_INVALID'
    );
    requireCondition(
      source.sourceId === OFFICIAL_PRICING_SOURCES[index].sourceId &&
        source.url === OFFICIAL_PRICING_SOURCES[index].url,
      'PRICING_SOURCE_ARTIFACT_SET_INVALID'
    );
    const relativePath = requireSafeRelativeArtifactPath(source.artifactPath);
    requireCondition(
      typeof source.artifactSha256 === 'string' &&
        SHA256_PATTERN.test(source.artifactSha256),
      'PRICING_SOURCE_ARTIFACT_INVALID'
    );
    const filename = path.resolve(pricingDirectory, ...relativePath.split('/'));
    requireCondition(
      isWithin(pricingDirectory, filename),
      'PRICING_SOURCE_ARTIFACT_PATH_INVALID'
    );
    const snapshot = stableReadSnapshot(
      filename,
      MAXIMUM_PRICING_SOURCE_BYTES,
      'PRICING_SOURCE_ARTIFACT_INVALID'
    );
    requireCondition(
      snapshot.sha256 === source.artifactSha256,
      'PRICING_SOURCE_ARTIFACT_HASH_MISMATCH'
    );
    assertOfficialPricingSourceSemantics({
      sourceId: source.sourceId,
      bytes: snapshot.bytes,
    });
    return {
      sourceId: source.sourceId,
      relativePath: relativePath.toLowerCase(),
      filename,
      snapshot,
    };
  });
  for (const values of [
    inspected.map(source => source.relativePath),
    inspected.map(source => source.snapshot.identity.resolvedPathSha256),
    inspected.map(
      source =>
        `${source.snapshot.identity.device}:${source.snapshot.identity.inode}`
    ),
    inspected.map(source => source.snapshot.sha256),
  ]) {
    requireCondition(
      new Set(values).size === inspected.length,
      'PRICING_SOURCE_ARTIFACT_IDENTITY_DUPLICATE'
    );
  }
  return inspected;
}

export function collectForbiddenAmbientCredentialNames(
  environment,
  allowPublicJestMocks
) {
  const names = Object.keys(environment).filter(name =>
    isForbiddenAmbientCredentialName(name)
  );
  if (!allowPublicJestMocks) return names;
  return names.filter(name => {
    if (
      name === 'NEXT_PUBLIC_SUPABASE_URL' &&
      environment[name] === 'http://localhost:54321'
    ) {
      return false;
    }
    return !(
      name === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' &&
      environment[name] === 'mock-anon-key'
    );
  });
}

function currentAmbientCredentialNames(testRuntimeInjected) {
  return collectForbiddenAmbientCredentialNames(
    process.env,
    testRuntimeInjected
  );
}

function requireDirectoryIdentityStable(current, expected, code) {
  requireCondition(canonicalJson(current) === canonicalJson(expected), code);
}

function externalFileIdentityFromSnapshot(snapshot) {
  return {
    ...snapshot.identity,
    contentSha256: snapshot.sha256,
  };
}

function inspectEmptyDirectoryFingerprint(directoryInput) {
  const directory = requireAbsolutePath(
    directoryInput,
    'EMPTY_DIRECTORY_FINGERPRINT_INVALID'
  );
  const identity = inspectDpapiDirectoryIdentity(directory);
  const before = statSync(directory, { bigint: true });
  const entries = readdirSync(directory);
  const after = statSync(directory, { bigint: true });
  requireCondition(
    before.isDirectory() &&
      after.isDirectory() &&
      before.dev === after.dev &&
      before.ino === after.ino &&
      before.mtimeMs === after.mtimeMs &&
      entries.length === 0,
    'EMPTY_DIRECTORY_FINGERPRINT_INVALID'
  );
  return {
    pathSha256: sha256Text(normalizedPath(directory)),
    resolvedPathSha256: identity.resolvedPathSha256,
    device: identity.device,
    inode: identity.inode,
    snapshotSha256: sha256Text(canonicalJson([])),
  };
}

function assertPairwiseDisjointDirectoryIdentities(identities) {
  const entries = Object.entries(identities);
  for (const [, identityInput] of entries) {
    const identity = requireRecord(
      identityInput,
      'EXTERNAL_DIRECTORY_IDENTITY_INVALID'
    );
    requireCondition(
      typeof identity.realPath === 'string' &&
        identity.realPath.length > 0 &&
        typeof identity.device === 'string' &&
        typeof identity.inode === 'string',
      'EXTERNAL_DIRECTORY_IDENTITY_INVALID'
    );
  }
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < entries.length;
      rightIndex += 1
    ) {
      const left = entries[leftIndex][1];
      const right = entries[rightIndex][1];
      requireCondition(
        !isWithin(left.realPath, right.realPath) &&
          !isWithin(right.realPath, left.realPath),
        'EXTERNAL_DIRECTORY_BOUNDARY_COLLISION'
      );
    }
  }
  return true;
}

function readTrackedTemplate(repositoryRoot, relativePath, code) {
  return stableReadJson(
    path.join(repositoryRoot, ...relativePath.split('/')),
    MAXIMUM_JSON_ARTIFACT_BYTES,
    false,
    code
  );
}

function buildDefaultRuntime() {
  return {
    now: Date.now,
    monotonicNow: () => performance.now(),
    inspectGitState: inspectAction003GitState,
    verifyAction002: verifyOrganizationIdentityCaptureTerminalLinkage,
    inspectDirectoryIdentity: inspectDpapiDirectoryIdentity,
    inspectEmptyDirectoryFingerprint,
    inspectPriorActionState: directory =>
      inspectPriorActionState(directory).priorActionState,
    validateDpapiResources: validateDpapiCredentialResources,
    revalidateDpapiResources: revalidateDpapiCredentialResources,
    assertAclBoundaries: assertWindowsAclBoundaries,
    protectOutputAcl: protectWindowsOutputAcl,
    buildArtifacts: buildAction003ApprovalArtifacts,
    initializeOutput: initializeAction003ApprovalOutputCreateNew,
    completeOutput: completeAction003ApprovalOutputCreateNew,
    verifyOutput: verifyAction003ApprovalOutput,
    verifyExistingOutput: verifyExistingAction003ApprovalOutput,
  };
}

function validateDescriptor(descriptor) {
  const value = requireExactKeys(
    descriptor,
    [
      'schemaVersion',
      'operation',
      'repositoryRoot',
      'expectedGitHead',
      'credentialConfigurationPath',
      'pricingEvidencePath',
      'initialApprovalReceiptPath',
      'organizationIdentityEvidenceDirectoryPath',
      'organizationIdentityTerminalPath',
      'actionJournalDirectoryPath',
      'evidenceParentDirectoryPath',
      'ownerPrivateApprovalRoot',
      'outputDirectoryPath',
      'approvalRecord',
      'knownAdditionalChargesUsdScaled',
      'fundingSource',
      'notes',
    ],
    'INPUT_DESCRIPTOR_INVALID'
  );
  requireCondition(
    value.schemaVersion === 1 && value.operation === OPERATION,
    'INPUT_DESCRIPTOR_INVALID'
  );
  for (const key of [
    'repositoryRoot',
    'credentialConfigurationPath',
    'pricingEvidencePath',
    'initialApprovalReceiptPath',
    'organizationIdentityEvidenceDirectoryPath',
    'organizationIdentityTerminalPath',
    'actionJournalDirectoryPath',
    'evidenceParentDirectoryPath',
    'ownerPrivateApprovalRoot',
    'outputDirectoryPath',
  ]) {
    requireAbsolutePath(value[key], 'INPUT_DESCRIPTOR_PATH_INVALID');
  }
  requireCondition(
    typeof value.expectedGitHead === 'string' &&
      GIT_SHA_PATTERN.test(value.expectedGitHead),
    'GIT_HEAD_INVALID'
  );
  return value;
}

function assertOperationalClock(
  approvalRecord,
  builtAt,
  now,
  requireRecentBuild
) {
  const approvedAt = Date.parse(approvalRecord.approvedAt);
  requireCondition(Number.isFinite(approvedAt), 'APPROVAL_TIMESTAMP_INVALID');
  const expiresAt = approvedAt + 60 * 60 * 1000;
  requireCondition(
    Number.isFinite(now) &&
      now >= builtAt - 5_000 &&
      (requireRecentBuild === false || now - builtAt <= 60_000) &&
      now < expiresAt,
    now >= expiresAt ? 'APPROVAL_EXPIRED' : 'BUILT_AT_CLOCK_MISMATCH'
  );
}

function prepareAction003ApprovalPacketWithRuntime(
  descriptorPathInput,
  runtimeOverrides,
  mode
) {
  requireCondition(isRecord(runtimeOverrides), 'RUNTIME_OVERRIDE_INVALID');
  const testRuntimeInjected = Object.keys(runtimeOverrides).length > 0;
  requireCondition(
    [
      PREFLIGHT_MODE_VALIDATE,
      PREFLIGHT_MODE_CREATE,
      PREFLIGHT_MODE_REVALIDATE,
    ].includes(mode) &&
      (mode === PREFLIGHT_MODE_CREATE
        ? testRuntimeInjected === false
        : mode === PREFLIGHT_MODE_VALIDATE
          ? testRuntimeInjected === true
          : true),
    'RUNTIME_OVERRIDE_INVALID'
  );
  if (testRuntimeInjected) {
    requireCondition(
      process.env.NODE_ENV === 'test' &&
        typeof process.env.JEST_WORKER_ID === 'string' &&
        /^\d+$/u.test(process.env.JEST_WORKER_ID),
      'TEST_RUNTIME_OVERRIDE_FORBIDDEN'
    );
  }
  const runtime = { ...buildDefaultRuntime(), ...runtimeOverrides };
  const revalidateExistingOutput = mode === PREFLIGHT_MODE_REVALIDATE;
  const writeEnabled = mode === PREFLIGHT_MODE_CREATE;
  requireCondition(
    typeof runtime.now === 'function' &&
      typeof runtime.monotonicNow === 'function',
    'RUNTIME_CLOCK_INVALID'
  );
  const wallClockStartedAt = runtime.now();
  const monotonicStartedAt = runtime.monotonicNow();
  requireCondition(
    Number.isFinite(wallClockStartedAt) && Number.isFinite(monotonicStartedAt),
    'RUNTIME_CLOCK_INVALID'
  );
  const descriptorPath = requireAbsolutePath(
    descriptorPathInput,
    'INPUT_DESCRIPTOR_PATH_INVALID'
  );
  const descriptorRead = stableReadJson(
    descriptorPath,
    MAXIMUM_DESCRIPTOR_BYTES,
    true,
    'INPUT_DESCRIPTOR_NOT_CANONICAL'
  );
  const descriptor = validateDescriptor(descriptorRead.value);
  const repositoryRoot = path.resolve(descriptor.repositoryRoot);
  requireCondition(
    normalizedPath(repositoryRoot) === normalizedPath(MODULE_REPOSITORY_ROOT),
    'EXECUTING_REPOSITORY_ROOT_MISMATCH'
  );
  requireCondition(
    process.version.startsWith('v24.') && process.execArgv.length === 0,
    'NODE_RUNTIME_BOUNDARY_INVALID'
  );
  const ambientCredentialNames =
    currentAmbientCredentialNames(testRuntimeInjected);
  requireCondition(
    ambientCredentialNames.length === 0,
    'AMBIENT_CREDENTIAL_FORBIDDEN'
  );
  const descriptorApprovalRecord = requireExactKeys(
    descriptor.approvalRecord,
    ['builtAt'],
    'APPROVAL_RECORD_INVALID'
  );
  const initialApprovalReceiptRead = stableReadJson(
    descriptor.initialApprovalReceiptPath,
    MAXIMUM_JSON_ARTIFACT_BYTES,
    true,
    'INITIAL_APPROVAL_RECEIPT_NOT_CANONICAL'
  );
  const initialApprovalReceiptValidation =
    validateInitialAction003ApprovalReceipt(initialApprovalReceiptRead.value);
  requireCondition(
    initialApprovalReceiptRead.snapshot.sha256 ===
      initialApprovalReceiptValidation.receiptSha256,
    'INITIAL_APPROVAL_RECEIPT_INVALID'
  );
  const approvalRecord = {
    ...initialApprovalReceiptValidation.approvalRecordFields,
    builtAt: descriptorApprovalRecord.builtAt,
  };
  const builtAt = Date.parse(descriptorApprovalRecord.builtAt);
  requireCondition(Number.isFinite(builtAt), 'APPROVAL_TIMESTAMP_INVALID');
  assertOperationalClock(
    approvalRecord,
    builtAt,
    wallClockStartedAt,
    !revalidateExistingOutput
  );

  const gitState = runtime.inspectGitState(
    repositoryRoot,
    descriptor.expectedGitHead
  );
  requireCondition(
    gitState.currentHead === descriptor.expectedGitHead,
    'GIT_HEAD_MISMATCH'
  );
  requireCondition(gitState.worktreeClean === true, 'WORKTREE_NOT_CLEAN');
  requireCondition(
    gitState.organizationIdentitySourceGitCommitIsAncestor === true,
    'ACTION002_SOURCE_HEAD_NOT_ANCESTOR'
  );
  const action002Evidence = requireAction002Evidence(
    runtime.verifyAction002(
      descriptor.organizationIdentityEvidenceDirectoryPath,
      descriptor.organizationIdentityTerminalPath
    )
  );
  const credentialRead = stableReadJson(
    descriptor.credentialConfigurationPath,
    MAXIMUM_JSON_ARTIFACT_BYTES,
    true,
    'CREDENTIAL_CONFIGURATION_NOT_CANONICAL'
  );
  const pricingRead = stableReadJson(
    descriptor.pricingEvidencePath,
    MAXIMUM_JSON_ARTIFACT_BYTES,
    true,
    'PRICING_EVIDENCE_NOT_CANONICAL'
  );
  const pricingExecutionFreshThrough = Date.parse(
    derivePricingExecutionFreshThrough(pricingRead.value)
  );
  requireCondition(
    Number.isFinite(pricingExecutionFreshThrough) &&
      wallClockStartedAt + 30_000 <= pricingExecutionFreshThrough,
    'PRICING_EVIDENCE_STALE'
  );
  const pricingSources = inspectPricingSourceArtifacts(
    pricingRead.value,
    descriptor.pricingEvidencePath
  );
  const actionJournalIdentity = runtime.inspectDirectoryIdentity(
    descriptor.actionJournalDirectoryPath
  );
  const evidenceParentIdentity = runtime.inspectDirectoryIdentity(
    descriptor.evidenceParentDirectoryPath
  );
  const actionJournalDirectoryFingerprint =
    runtime.inspectEmptyDirectoryFingerprint(
      descriptor.actionJournalDirectoryPath
    );
  const evidenceParentDirectoryFingerprint =
    runtime.inspectEmptyDirectoryFingerprint(
      descriptor.evidenceParentDirectoryPath
    );
  const action002EvidenceDirectoryIdentity = runtime.inspectDirectoryIdentity(
    descriptor.organizationIdentityEvidenceDirectoryPath
  );
  const action002JournalDirectoryIdentity = runtime.inspectDirectoryIdentity(
    path.dirname(descriptor.organizationIdentityTerminalPath)
  );
  const pricingDirectoryIdentity = runtime.inspectDirectoryIdentity(
    path.dirname(descriptor.pricingEvidencePath)
  );
  const initialApprovalReceiptDirectory = path.dirname(
    descriptor.initialApprovalReceiptPath
  );
  const initialApprovalReceiptDirectoryIdentity =
    runtime.inspectDirectoryIdentity(initialApprovalReceiptDirectory);
  const ownerPrivateApprovalRootIdentity = runtime.inspectDirectoryIdentity(
    descriptor.ownerPrivateApprovalRoot
  );
  requireCondition(
    runtime.inspectPriorActionState(descriptor.actionJournalDirectoryPath) ===
      null,
    'ACTION_ALREADY_CLAIMED'
  );
  const dpapiResources = runtime.validateDpapiResources(
    credentialRead.value,
    repositoryRoot,
    { includeDatabasePassword: true }
  );
  const providerRootIdentity = requireRecord(
    dpapiResources.providerRootIdentity,
    'DPAPI_PROVIDER_ROOT_INVALID'
  );
  const credentialProvider = requireRecord(
    credentialRead.value.provider,
    'DPAPI_PROVIDER_ROOT_INVALID'
  );
  const credentialSecrets = requireRecord(
    credentialRead.value.secrets,
    'DPAPI_CONFIGURATION_INVALID'
  );
  const managementCredential = requireRecord(
    credentialSecrets.managementAccessToken,
    'DPAPI_CONFIGURATION_INVALID'
  );
  const passwordCredential = requireRecord(
    credentialSecrets.databasePassword,
    'DPAPI_CONFIGURATION_INVALID'
  );
  const existingOutputPaths = revalidateExistingOutput
    ? [
        descriptor.outputDirectoryPath,
        path.join(
          descriptor.outputDirectoryPath,
          'source-project-provisioning-binding-v6.json'
        ),
        path.join(
          descriptor.outputDirectoryPath,
          'source-project-provisioning-credential-configuration-v2.json'
        ),
        path.join(
          descriptor.outputDirectoryPath,
          'source-project-provisioning-authorization-projection-v1.json'
        ),
      ]
    : [];
  const aclBoundPaths = [
    descriptorPath,
    initialApprovalReceiptDirectory,
    descriptor.initialApprovalReceiptPath,
    descriptor.credentialConfigurationPath,
    descriptor.pricingEvidencePath,
    ...pricingSources.map(source => source.filename),
    descriptor.organizationIdentityEvidenceDirectoryPath,
    ...[
      'action-events.json',
      'organization-identity-capture-result.json',
      'privacy-scan.json',
      'provider-export.safe.json',
      'manifest.json',
      'manifest.sha256',
    ].map(filename =>
      path.join(descriptor.organizationIdentityEvidenceDirectoryPath, filename)
    ),
    path.dirname(descriptor.organizationIdentityTerminalPath),
    path.join(
      path.dirname(descriptor.organizationIdentityTerminalPath),
      ORGANIZATION_IDENTITY_CAPTURE_CLAIM_FILE
    ),
    path.join(
      path.dirname(descriptor.organizationIdentityTerminalPath),
      ORGANIZATION_IDENTITY_CAPTURE_INTENT_FILE
    ),
    path.join(
      path.dirname(descriptor.organizationIdentityTerminalPath),
      ORGANIZATION_IDENTITY_CAPTURE_TERMINAL_FILE
    ),
    descriptor.organizationIdentityTerminalPath,
    descriptor.actionJournalDirectoryPath,
    descriptor.evidenceParentDirectoryPath,
    descriptor.ownerPrivateApprovalRoot,
    credentialProvider.providerRoot,
    path.win32.join(
      credentialProvider.providerRoot,
      managementCredential.envelopeFilename
    ),
    path.win32.join(
      credentialProvider.providerRoot,
      passwordCredential.envelopeFilename
    ),
    ...existingOutputPaths,
  ];
  const aclInspection = runtime.assertAclBoundaries(
    credentialRead.value,
    aclBoundPaths
  );
  assertDpapiDirectoryIsolation(
    providerRootIdentity,
    actionJournalIdentity,
    evidenceParentIdentity
  );
  assertPairwiseDisjointDirectoryIdentities({
    action002Evidence: action002EvidenceDirectoryIdentity,
    action002Journal: action002JournalDirectoryIdentity,
    action003Journal: actionJournalIdentity,
    action003EvidenceParent: evidenceParentIdentity,
    dpapiProviderRoot: providerRootIdentity,
    pricingRoot: pricingDirectoryIdentity,
    ownerPrivateApprovalRoot: ownerPrivateApprovalRootIdentity,
  });
  requireCondition(
    isWithin(
      ownerPrivateApprovalRootIdentity.realPath,
      normalizedPath(realpathSync.native(descriptorPath))
    ) &&
      isWithin(
        ownerPrivateApprovalRootIdentity.realPath,
        normalizedPath(
          realpathSync.native(descriptor.initialApprovalReceiptPath)
        )
      ) &&
      isWithin(
        ownerPrivateApprovalRootIdentity.realPath,
        normalizedPath(
          realpathSync.native(descriptor.credentialConfigurationPath)
        )
      ),
    'OWNER_PRIVATE_INPUT_BOUNDARY_INVALID'
  );
  requireCondition(
    path.dirname(path.resolve(descriptor.outputDirectoryPath)) ===
      path.resolve(descriptor.ownerPrivateApprovalRoot) &&
      path.dirname(
        path.dirname(path.resolve(descriptor.initialApprovalReceiptPath))
      ) === path.resolve(descriptor.ownerPrivateApprovalRoot) &&
      path.resolve(initialApprovalReceiptDirectory) !==
        path.resolve(descriptor.outputDirectoryPath) &&
      canonicalJson(readdirSync(initialApprovalReceiptDirectory).sort()) ===
        canonicalJson([
          'source-project-provisioning-single-action-approval-receipt-v2.json',
        ]) &&
      path.resolve(descriptor.initialApprovalReceiptPath) !==
        path.resolve(descriptorPath) &&
      path.resolve(descriptor.initialApprovalReceiptPath) !==
        path.resolve(descriptor.credentialConfigurationPath) &&
      (revalidateExistingOutput
        ? existsSync(descriptor.outputDirectoryPath) &&
          lstatSync(descriptor.outputDirectoryPath).isDirectory() &&
          !lstatSync(descriptor.outputDirectoryPath).isSymbolicLink() &&
          canonicalJson(readdirSync(descriptor.outputDirectoryPath).sort()) ===
            canonicalJson(
              [
                'source-project-provisioning-binding-v6.json',
                'source-project-provisioning-credential-configuration-v2.json',
                'source-project-provisioning-authorization-projection-v1.json',
              ].sort()
            )
        : !existsSync(descriptor.outputDirectoryPath)),
    'OUTPUT_DIRECTORY_BOUNDARY_INVALID'
  );

  const bindingTemplateRead = readTrackedTemplate(
    repositoryRoot,
    TRACKED_BINDING_TEMPLATE,
    'BINDING_TEMPLATE_INVALID'
  );
  const authorizationProjectionTemplateRead = readTrackedTemplate(
    repositoryRoot,
    TRACKED_AUTHORIZATION_PROJECTION_TEMPLATE,
    'AUTHORIZATION_PROJECTION_TEMPLATE_INVALID'
  );
  const repositoryHashes = Object.fromEntries(
    Object.entries(HASH_BOUND_TRACKED_FILES).map(([key, relativePath]) => [
      key,
      stableReadSnapshot(
        path.join(repositoryRoot, ...relativePath.split('/')),
        MAXIMUM_JSON_ARTIFACT_BYTES,
        'TRACKED_IMPLEMENTATION_INVALID'
      ).sha256,
    ])
  );
  const credentialConfigurationSourceIdentity = revalidateExistingOutput
    ? externalFileIdentityFromSnapshot(
        stableReadJson(
          path.join(
            descriptor.outputDirectoryPath,
            'source-project-provisioning-credential-configuration-v2.json'
          ),
          MAXIMUM_JSON_ARTIFACT_BYTES,
          true,
          'OUTPUT_CREDENTIAL_READBACK_INVALID'
        ).snapshot
      )
    : externalFileIdentityFromSnapshot(credentialRead.snapshot);
  const builderInput = {
    bindingTemplate: bindingTemplateRead.value,
    authorizationProjectionTemplate: authorizationProjectionTemplateRead.value,
    credentialConfiguration: credentialRead.value,
    credentialConfigurationArtifactSha256: credentialRead.snapshot.sha256,
    pricingEvidence: pricingRead.value,
    pricingEvidenceArtifactSha256: pricingRead.snapshot.sha256,
    initialApprovalReceipt: initialApprovalReceiptValidation.receipt,
    initialApprovalReceiptArtifactSha256:
      initialApprovalReceiptValidation.receiptSha256,
    organizationIdentityEvidence: action002Evidence,
    repositoryState: { ...gitState, ...repositoryHashes },
    runtimeBoundary: {
      nodeVersion: process.version,
      nodeExecArgv: process.execArgv,
      ambientCredentialNames,
    },
    directoryBindings: {
      actionJournalDirectoryPath: descriptor.actionJournalDirectoryPath,
      actionJournalDirectoryFingerprint,
      evidenceParentDirectoryPath: descriptor.evidenceParentDirectoryPath,
      evidenceParentDirectoryFingerprint,
      providerRootResolvedPath: providerRootIdentity.realPath,
      credentialConfigurationSourceIdentity,
      pricingEvidenceSourceIdentity: externalFileIdentityFromSnapshot(
        pricingRead.snapshot
      ),
    },
    approvalRecord,
    knownAdditionalChargesUsdScaled: descriptor.knownAdditionalChargesUsdScaled,
    fundingSource: descriptor.fundingSource,
    notes: descriptor.notes,
  };

  assertSameSnapshot(
    descriptorPath,
    descriptorRead.snapshot,
    MAXIMUM_DESCRIPTOR_BYTES,
    'INPUT_DESCRIPTOR'
  );
  assertSameSnapshot(
    descriptor.initialApprovalReceiptPath,
    initialApprovalReceiptRead.snapshot,
    MAXIMUM_JSON_ARTIFACT_BYTES,
    'INITIAL_APPROVAL_RECEIPT'
  );
  assertSameSnapshot(
    descriptor.credentialConfigurationPath,
    credentialRead.snapshot,
    MAXIMUM_JSON_ARTIFACT_BYTES,
    'CREDENTIAL_CONFIGURATION'
  );
  assertSameSnapshot(
    descriptor.pricingEvidencePath,
    pricingRead.snapshot,
    MAXIMUM_JSON_ARTIFACT_BYTES,
    'PRICING_EVIDENCE'
  );
  for (const source of pricingSources) {
    assertSameSnapshot(
      source.filename,
      source.snapshot,
      MAXIMUM_PRICING_SOURCE_BYTES,
      'PRICING_SOURCE_ARTIFACT'
    );
  }
  const finalGitState = runtime.inspectGitState(
    repositoryRoot,
    descriptor.expectedGitHead
  );
  requireCondition(
    canonicalJson(finalGitState) === canonicalJson(gitState) &&
      finalGitState.worktreeClean === true,
    'GIT_STATE_CHANGED'
  );
  const finalAction002Evidence = requireAction002Evidence(
    runtime.verifyAction002(
      descriptor.organizationIdentityEvidenceDirectoryPath,
      descriptor.organizationIdentityTerminalPath
    )
  );
  requireCondition(
    canonicalJson(finalAction002Evidence) === canonicalJson(action002Evidence),
    'ACTION002_EVIDENCE_CHANGED'
  );
  requireDirectoryIdentityStable(
    runtime.inspectDirectoryIdentity(descriptor.actionJournalDirectoryPath),
    actionJournalIdentity,
    'ACTION_JOURNAL_DIRECTORY_CHANGED'
  );
  requireDirectoryIdentityStable(
    runtime.inspectDirectoryIdentity(descriptor.evidenceParentDirectoryPath),
    evidenceParentIdentity,
    'EVIDENCE_PARENT_DIRECTORY_CHANGED'
  );
  requireCondition(
    canonicalJson(
      runtime.inspectEmptyDirectoryFingerprint(
        descriptor.actionJournalDirectoryPath
      )
    ) === canonicalJson(actionJournalDirectoryFingerprint),
    'ACTION_JOURNAL_DIRECTORY_CHANGED'
  );
  requireCondition(
    canonicalJson(
      runtime.inspectEmptyDirectoryFingerprint(
        descriptor.evidenceParentDirectoryPath
      )
    ) === canonicalJson(evidenceParentDirectoryFingerprint),
    'EVIDENCE_PARENT_DIRECTORY_CHANGED'
  );
  requireDirectoryIdentityStable(
    runtime.inspectDirectoryIdentity(
      descriptor.organizationIdentityEvidenceDirectoryPath
    ),
    action002EvidenceDirectoryIdentity,
    'ACTION002_EVIDENCE_DIRECTORY_CHANGED'
  );
  requireDirectoryIdentityStable(
    runtime.inspectDirectoryIdentity(
      path.dirname(descriptor.organizationIdentityTerminalPath)
    ),
    action002JournalDirectoryIdentity,
    'ACTION002_JOURNAL_DIRECTORY_CHANGED'
  );
  requireDirectoryIdentityStable(
    runtime.inspectDirectoryIdentity(
      path.dirname(descriptor.pricingEvidencePath)
    ),
    pricingDirectoryIdentity,
    'PRICING_DIRECTORY_CHANGED'
  );
  requireDirectoryIdentityStable(
    runtime.inspectDirectoryIdentity(descriptor.ownerPrivateApprovalRoot),
    ownerPrivateApprovalRootIdentity,
    'OWNER_PRIVATE_APPROVAL_ROOT_CHANGED'
  );
  requireDirectoryIdentityStable(
    runtime.inspectDirectoryIdentity(initialApprovalReceiptDirectory),
    initialApprovalReceiptDirectoryIdentity,
    'INITIAL_APPROVAL_RECEIPT_DIRECTORY_CHANGED'
  );
  requireCondition(
    canonicalJson(readdirSync(initialApprovalReceiptDirectory).sort()) ===
      canonicalJson([
        'source-project-provisioning-single-action-approval-receipt-v2.json',
      ]),
    'INITIAL_APPROVAL_RECEIPT_DIRECTORY_CHANGED'
  );
  requireCondition(
    runtime.inspectPriorActionState(descriptor.actionJournalDirectoryPath) ===
      null,
    'ACTION_ALREADY_CLAIMED'
  );
  runtime.revalidateDpapiResources(
    credentialRead.value,
    repositoryRoot,
    dpapiResources,
    { includeDatabasePassword: true }
  );
  requireCondition(
    canonicalJson(
      runtime.assertAclBoundaries(credentialRead.value, aclBoundPaths)
    ) === canonicalJson(aclInspection),
    'ACL_BOUNDARY_CHANGED'
  );
  const wallClockBeforeWrite = runtime.now();
  const monotonicBeforeWrite = runtime.monotonicNow();
  requireCondition(
    Number.isFinite(wallClockBeforeWrite) &&
      Number.isFinite(monotonicBeforeWrite) &&
      monotonicBeforeWrite >= monotonicStartedAt &&
      Math.abs(
        wallClockBeforeWrite -
          wallClockStartedAt -
          (monotonicBeforeWrite - monotonicStartedAt)
      ) <= 5_000,
    'MONOTONIC_CLOCK_INVALID'
  );
  requireCondition(
    wallClockBeforeWrite + 30_000 <= pricingExecutionFreshThrough,
    'PRICING_EVIDENCE_STALE'
  );
  assertOperationalClock(
    approvalRecord,
    builtAt,
    wallClockBeforeWrite,
    !revalidateExistingOutput
  );
  const prevalidatedArtifacts = runtime.buildArtifacts(builderInput);
  requireCondition(
    prevalidatedArtifacts.summary.sourceProjectProvisioningAuthorized ===
      false &&
      prevalidatedArtifacts.summary.derivedExecutionBindingRequired === true &&
      prevalidatedArtifacts.summary.remoteContactPerformed === false &&
      prevalidatedArtifacts.summary.credentialReadPerformed === false,
    'OFFLINE_VALIDATION_FAILED'
  );
  if (revalidateExistingOutput) {
    const verifiedExistingOutput = runtime.verifyExistingOutput(
      descriptor.outputDirectoryPath,
      prevalidatedArtifacts,
      descriptor.ownerPrivateApprovalRoot
    );
    requireCondition(
      verifiedExistingOutput.status === 'VERIFIED' &&
        verifiedExistingOutput.fileCount === 3 &&
        verifiedExistingOutput.bindingSha256 ===
          prevalidatedArtifacts.summary.bindingSha256 &&
        verifiedExistingOutput.credentialConfigurationSha256 ===
          prevalidatedArtifacts.summary.credentialConfigurationSha256 &&
        verifiedExistingOutput.authorizationProjectionSha256 ===
          prevalidatedArtifacts.summary.authorizationProjectionSha256 &&
        verifiedExistingOutput.remoteContactPerformed === false &&
        verifiedExistingOutput.credentialReadPerformed === false,
      'EXISTING_OUTPUT_REVALIDATION_FAILED'
    );
    return {
      status: 'REVALIDATED',
      operation: OPERATION,
      gitHead: gitState.currentHead,
      descriptorSha256: descriptorRead.snapshot.sha256,
      action002TerminalSha256: action002Evidence.terminalSha256,
      initialApprovalReceiptSha256:
        initialApprovalReceiptValidation.receiptSha256,
      bindingSha256: verifiedExistingOutput.bindingSha256,
      credentialConfigurationSha256:
        verifiedExistingOutput.credentialConfigurationSha256,
      authorizationProjectionSha256:
        verifiedExistingOutput.authorizationProjectionSha256,
      aclProofSha256: aclInspection.aclProofSha256,
      outputCreated: false,
      sourceProjectProvisioningAuthorized: false,
      derivedExecutionBindingRequired: true,
      remoteContactPerformed: false,
      credentialPlaintextReadPerformed: false,
    };
  }
  if (!writeEnabled) {
    return {
      status: 'VALIDATED_NOT_WRITTEN',
      operation: OPERATION,
      gitHead: gitState.currentHead,
      action002TerminalSha256: action002Evidence.terminalSha256,
      initialApprovalReceiptSha256:
        initialApprovalReceiptValidation.receiptSha256,
      outputCreated: false,
      sourceProjectProvisioningAuthorized: false,
      derivedExecutionBindingRequired: true,
      remoteContactPerformed: false,
      credentialPlaintextReadPerformed: false,
    };
  }
  const initialized = runtime.initializeOutput(
    descriptor.outputDirectoryPath,
    credentialRead.value,
    descriptor.ownerPrivateApprovalRoot
  );
  const protectedInitialOutputAcl = runtime.protectOutputAcl(
    credentialRead.value,
    [
      descriptor.outputDirectoryPath,
      path.join(
        descriptor.outputDirectoryPath,
        'source-project-provisioning-credential-configuration-v2.json'
      ),
    ],
    2
  );
  requireCondition(
    initialized.status === 'INITIALIZED' &&
      initialized.fileCount === 1 &&
      protectedInitialOutputAcl.pathCount === 2 &&
      isRecord(initialized.outputDirectoryIdentity) &&
      isRecord(initialized.ownerPrivateRootIdentity),
    'OUTPUT_INITIALIZATION_INVALID'
  );
  builderInput.directoryBindings.credentialConfigurationSourceIdentity =
    initialized.credentialConfigurationSourceIdentity;
  const artifacts = runtime.buildArtifacts(builderInput);
  const written = runtime.completeOutput(
    descriptor.outputDirectoryPath,
    artifacts,
    descriptor.ownerPrivateApprovalRoot,
    initialized.outputDirectoryIdentity,
    initialized.ownerPrivateRootIdentity
  );
  const protectedOutputAcl = runtime.protectOutputAcl(credentialRead.value, [
    descriptor.outputDirectoryPath,
    path.join(
      descriptor.outputDirectoryPath,
      'source-project-provisioning-binding-v6.json'
    ),
    path.join(
      descriptor.outputDirectoryPath,
      'source-project-provisioning-credential-configuration-v2.json'
    ),
    path.join(
      descriptor.outputDirectoryPath,
      'source-project-provisioning-authorization-projection-v1.json'
    ),
  ]);
  const verifiedOutput = runtime.verifyOutput(
    descriptor.outputDirectoryPath,
    artifacts,
    descriptor.ownerPrivateApprovalRoot,
    initialized.outputDirectoryIdentity,
    initialized.ownerPrivateRootIdentity
  );
  requireCondition(
    written.status === 'CREATED' &&
      written.fileCount === 3 &&
      written.remoteContactPerformed === false &&
      written.credentialReadPerformed === false &&
      protectedOutputAcl.pathCount === 4 &&
      verifiedOutput.status === 'VERIFIED' &&
      verifiedOutput.fileCount === 3 &&
      verifiedOutput.bindingSha256 === artifacts.summary.bindingSha256 &&
      verifiedOutput.credentialConfigurationSha256 ===
        artifacts.summary.credentialConfigurationSha256 &&
      verifiedOutput.authorizationProjectionSha256 ===
        artifacts.summary.authorizationProjectionSha256,
    'OUTPUT_WRITE_INVALID'
  );
  return {
    status: 'CREATED',
    operation: OPERATION,
    gitHead: gitState.currentHead,
    action002TerminalSha256: action002Evidence.terminalSha256,
    initialApprovalReceiptSha256:
      initialApprovalReceiptValidation.receiptSha256,
    bindingMaterialSha256: artifacts.summary.bindingMaterialSha256,
    payloadSha256: artifacts.summary.payloadSha256,
    credentialConfigurationSha256:
      artifacts.summary.credentialConfigurationSha256,
    pricingEvidenceSha256: artifacts.summary.pricingEvidenceSha256,
    authorizationProjectionSha256:
      artifacts.summary.authorizationProjectionSha256,
    bindingSha256: artifacts.summary.bindingSha256,
    scheduledExecutionAt: artifacts.summary.scheduledExecutionAt,
    fundedThrough: artifacts.summary.fundedThrough,
    deletionApprovalRequestDeadline:
      artifacts.summary.deletionApprovalRequestDeadline,
    expiresAt: artifacts.summary.expiresAt,
    derivedExecutionBindingRequired: true,
    sourceProjectProvisioningAuthorized: false,
    outputDirectoryPathSha256: written.outputDirectoryPathSha256,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    productionContactAuthorized: false,
    remoteContactPerformed: false,
    credentialPlaintextReadPerformed: false,
  };
}

export function validateAction003ApprovalPreflightForTest(
  descriptorPathInput,
  runtimeOverrides
) {
  return prepareAction003ApprovalPacketWithRuntime(
    descriptorPathInput,
    runtimeOverrides,
    PREFLIGHT_MODE_VALIDATE
  );
}

export function revalidateAction003ApprovalPacketForTest(
  descriptorPathInput,
  runtimeOverrides
) {
  return prepareAction003ApprovalPacketWithRuntime(
    descriptorPathInput,
    runtimeOverrides,
    PREFLIGHT_MODE_REVALIDATE
  );
}

export function revalidateAction003ApprovalPacket(descriptorPathInput) {
  return prepareAction003ApprovalPacketWithRuntime(
    descriptorPathInput,
    {},
    PREFLIGHT_MODE_REVALIDATE
  );
}

export function prepareAction003ApprovalPacket(descriptorPathInput) {
  return prepareAction003ApprovalPacketWithRuntime(
    descriptorPathInput,
    {},
    PREFLIGHT_MODE_CREATE
  );
}

function parseArguments(argv) {
  requireCondition(argv.length === 2 && argv[0] === '--input', 'USAGE_INVALID');
  return requireAbsolutePath(argv[1], 'INPUT_DESCRIPTOR_PATH_INVALID');
}

async function main() {
  const descriptorPath = parseArguments(process.argv.slice(2));
  const result = prepareAction003ApprovalPacket(descriptorPath);
  process.stdout.write(`${canonicalJson(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(error => {
    const code =
      error instanceof Action003ApprovalPreflightError ||
      (error && typeof error.code === 'string')
        ? error.code
        : 'ACTION003_APPROVAL_PREFLIGHT_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
