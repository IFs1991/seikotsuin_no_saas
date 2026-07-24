import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ACTION_ID = 'PR12-ACTION-003';
const CLAIM_FILE = 'source-project-provisioning-action.claim.json';
const PROVIDER_ID = 'WINDOWS_DPAPI_CURRENT_USER_V1';
const REQUEST_PROTOCOL = 'PR12_DPAPI_BROKER_REQUEST_V1';
const RESPONSE_MAGIC = Buffer.from('PR12DPB1', 'ascii');
const BROKER_RELATIVE_PATH =
  'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1';
const BOOTSTRAP_RELATIVE_PATH =
  'scripts/commercial-hardening/initialize-pr12-windows-dpapi-credentials.ps1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const WINDOWS_DRIVE_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

export class DpapiCredentialChannelError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DpapiCredentialChannelError';
    this.code = code;
  }
}

function fail(code) {
  throw new DpapiCredentialChannelError(code);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalizedWindowsPath(value) {
  requireCondition(
    typeof value === 'string' &&
      WINDOWS_DRIVE_ABSOLUTE_PATH.test(value) &&
      !value.startsWith('\\\\'),
    'DPAPI_PATH_INVALID'
  );
  return path.win32.resolve(value).replaceAll('\\', '/').toLowerCase();
}

export function windowsPathFingerprint(value) {
  return sha256Text(normalizedWindowsPath(value));
}

function requireNoReparsePathComponents(value, code) {
  const resolved = path.win32.resolve(value);
  const root = path.win32.parse(resolved).root;
  let current = root;
  for (const component of resolved.slice(root.length).split(/[\\/]/u)) {
    if (component.length === 0) continue;
    current = path.win32.join(current, component);
    const status = lstatSync(current);
    requireCondition(status.isDirectory() && !status.isSymbolicLink(), code);
  }
}

function stableFileSnapshot(filename, code) {
  let bytes;
  try {
    requireCondition(existsSync(filename), code);
    const linkStatus = lstatSync(filename);
    requireCondition(linkStatus.isFile() && !linkStatus.isSymbolicLink(), code);
    const before = statSync(filename);
    bytes = readFileSync(filename);
    const after = statSync(filename);
    requireCondition(
      before.isFile() &&
        after.isFile() &&
        before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        bytes.length === after.size,
      code
    );
    const sha256 = sha256Bytes(bytes);
    return {
      sha256,
      identity: {
        device: String(after.dev),
        inode: String(after.ino),
        size: after.size,
        modifiedAtMilliseconds: after.mtimeMs,
      },
    };
  } catch (error) {
    if (error instanceof DpapiCredentialChannelError) throw error;
    fail(code);
  } finally {
    bytes?.fill(0);
  }
}

function requireStableDirectory(directory, code) {
  try {
    requireCondition(existsSync(directory), code);
    requireNoReparsePathComponents(directory, code);
    const normalizedPath = normalizedWindowsPath(directory);
    const realPath = realpathSync.native(directory);
    const normalizedRealPath = normalizedWindowsPath(realPath);
    requireCondition(normalizedRealPath === normalizedPath, code);
    const status = statSync(realPath, { bigint: true });
    requireCondition(status.isDirectory(), code);
    return {
      realPath: normalizedRealPath,
      resolvedPathSha256: sha256Text(normalizedRealPath),
      device: String(status.dev),
      inode: String(status.ino),
    };
  } catch (error) {
    if (error instanceof DpapiCredentialChannelError) throw error;
    fail(code);
  }
}

export function inspectDpapiDirectoryIdentity(directory) {
  return requireStableDirectory(directory, 'DPAPI_PROVIDER_ROOT_INVALID');
}

function isWithin(parent, candidate) {
  const relative = path.win32.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.win32.isAbsolute(relative))
  );
}

function directoryTreesOverlap(left, right) {
  return isWithin(left, right) || isWithin(right, left);
}

export function assertDpapiDirectoryIsolation(
  providerRootIdentity,
  journalDirectoryIdentity,
  evidenceParentDirectoryIdentity
) {
  for (const identity of [
    providerRootIdentity,
    journalDirectoryIdentity,
    evidenceParentDirectoryIdentity,
  ]) {
    requireCondition(
      isRecord(identity) &&
        typeof identity.realPath === 'string' &&
        WINDOWS_DRIVE_ABSOLUTE_PATH.test(identity.realPath),
      'DPAPI_DIRECTORY_IDENTITY_INVALID'
    );
  }
  requireCondition(
    !directoryTreesOverlap(
      providerRootIdentity.realPath,
      journalDirectoryIdentity.realPath
    ) &&
      !directoryTreesOverlap(
        providerRootIdentity.realPath,
        evidenceParentDirectoryIdentity.realPath
      ) &&
      !directoryTreesOverlap(
        journalDirectoryIdentity.realPath,
        evidenceParentDirectoryIdentity.realPath
      ),
    'DPAPI_DIRECTORY_BOUNDARY_COLLISION'
  );
  return true;
}

function resolvedBoundaryPath(value, code) {
  try {
    requireCondition(existsSync(value), code);
    return normalizedWindowsPath(realpathSync.native(value));
  } catch (error) {
    if (error instanceof DpapiCredentialChannelError) throw error;
    fail(code);
  }
}

function minimalPowerShellEnvironment() {
  const allowed = [
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'TEMP',
    'TMP',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
  ];
  return Object.fromEntries(
    allowed
      .filter(name => typeof process.env[name] === 'string')
      .map(name => [name, process.env[name]])
  );
}

function inspectBoundPowerShell(executablePath, timeoutMilliseconds) {
  const inspection =
    "$ErrorActionPreference='Stop';" +
    '$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;' +
    '$value=[ordered]@{version=$PSVersionTable.PSVersion.ToString();' +
    'languageMode=$ExecutionContext.SessionState.LanguageMode.ToString();' +
    'sidSha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData(' +
    '[Text.Encoding]::UTF8.GetBytes($sid))).ToLowerInvariant()};' +
    '[Console]::Out.Write(($value|ConvertTo-Json -Compress))';
  const result = spawnSync(
    executablePath,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', inspection],
    {
      encoding: 'utf8',
      env: minimalPowerShellEnvironment(),
      maxBuffer: 4096,
      shell: false,
      timeout: timeoutMilliseconds,
      windowsHide: true,
    }
  );
  requireCondition(
    result.error === undefined &&
      result.signal === null &&
      result.status === 0 &&
      typeof result.stdout === 'string' &&
      typeof result.stderr === 'string' &&
      result.stderr.length === 0,
    'DPAPI_POWERSHELL_IDENTITY_INVALID'
  );
  try {
    const parsed = JSON.parse(result.stdout);
    requireCondition(
      isRecord(parsed) &&
        typeof parsed.version === 'string' &&
        typeof parsed.languageMode === 'string' &&
        typeof parsed.sidSha256 === 'string' &&
        SHA256_PATTERN.test(parsed.sidSha256),
      'DPAPI_POWERSHELL_IDENTITY_INVALID'
    );
    return parsed;
  } catch (error) {
    if (error instanceof DpapiCredentialChannelError) throw error;
    fail('DPAPI_POWERSHELL_IDENTITY_INVALID');
  }
}

function assertStableSnapshot(current, expected, code) {
  requireCondition(
    current.sha256 === expected.sha256 &&
      canonicalJson(current.identity) === canonicalJson(expected.identity),
    code
  );
}

function envelopePath(providerRoot, envelopeFilename) {
  requireCondition(
    typeof envelopeFilename === 'string' &&
      /^[a-f0-9]{64}\.dpapi\.json$/.test(envelopeFilename),
    'DPAPI_ENVELOPE_FILENAME_INVALID'
  );
  return path.win32.join(providerRoot, envelopeFilename);
}

function validateRoleConfiguration(entry, role) {
  requireCondition(
    isRecord(entry) && entry.role === role,
    'DPAPI_ROLE_INVALID'
  );
  requireCondition(
    typeof entry.opaqueHandle === 'string' &&
      typeof entry.opaqueHandleSha256 === 'string' &&
      entry.opaqueHandleSha256 === sha256Text(entry.opaqueHandle) &&
      SHA256_PATTERN.test(entry.envelopeSha256) &&
      entry.envelopeFilename === `${entry.opaqueHandleSha256}.dpapi.json`,
    'DPAPI_ENVELOPE_BINDING_INVALID'
  );
}

export function validateDpapiCredentialResources(
  credentialConfiguration,
  repositoryRoot
) {
  requireCondition(
    process.platform === 'win32',
    'DPAPI_WINDOWS_PLATFORM_REQUIRED'
  );
  requireCondition(
    isRecord(credentialConfiguration) &&
      isRecord(credentialConfiguration.provider) &&
      isRecord(credentialConfiguration.runtime) &&
      isRecord(credentialConfiguration.protocol) &&
      isRecord(credentialConfiguration.secrets),
    'DPAPI_CONFIGURATION_INVALID'
  );
  const { provider, runtime, protocol, secrets } = credentialConfiguration;
  requireCondition(
    provider.providerId === PROVIDER_ID &&
      provider.protectionScope === 'CURRENT_USER' &&
      provider.retrievalChannel === 'CLAIM_BOUND_CAPTURED_STDOUT_BINARY_V1' &&
      SHA256_PATTERN.test(provider.ownerSidSha256) &&
      SHA256_PATTERN.test(provider.machineNameSha256) &&
      provider.machineNameSha256 === sha256Text(os.hostname().toLowerCase()) &&
      provider.providerRootPathSha256 ===
        windowsPathFingerprint(provider.providerRoot) &&
      SHA256_PATTERN.test(provider.providerRootResolvedPathSha256) &&
      /^\d+$/u.test(provider.providerRootDevice) &&
      /^\d+$/u.test(provider.providerRootInode),
    'DPAPI_CONFIGURATION_INVALID'
  );
  requireCondition(
    protocol.requestProtocol === REQUEST_PROTOCOL &&
      protocol.responseMagic === RESPONSE_MAGIC.toString('ascii') &&
      protocol.responseVersion === 1 &&
      protocol.requestMaximumBytes === 16384 &&
      protocol.responseMaximumBytes === 8192 &&
      Number.isInteger(protocol.brokerTimeoutMilliseconds) &&
      protocol.brokerTimeoutMilliseconds >= 1000 &&
      protocol.brokerTimeoutMilliseconds <= 30000 &&
      protocol.automaticRetryAllowed === false &&
      protocol.requestViaCapturedStdinOnly === true &&
      protocol.responseViaCapturedStdoutBinaryOnly === true &&
      protocol.zeroStderrRequired === true,
    'DPAPI_PROTOCOL_INVALID'
  );
  const normalizedRepository = normalizedWindowsPath(repositoryRoot);
  const normalizedRoot = normalizedWindowsPath(provider.providerRoot);
  const resolvedRepository = resolvedBoundaryPath(
    repositoryRoot,
    'DPAPI_REPOSITORY_ROOT_INVALID'
  );
  const temporaryRoots = [os.tmpdir(), process.env.TEMP, process.env.TMP]
    .filter(value => typeof value === 'string')
    .map(value => resolvedBoundaryPath(value, 'DPAPI_TEMPORARY_ROOT_INVALID'));
  requireCondition(
    !directoryTreesOverlap(normalizedRepository, normalizedRoot) &&
      !directoryTreesOverlap(resolvedRepository, normalizedRoot) &&
      temporaryRoots.every(
        root => !directoryTreesOverlap(root, normalizedRoot)
      ),
    'DPAPI_PROVIDER_ROOT_FORBIDDEN'
  );
  const providerRootIdentity = requireStableDirectory(
    provider.providerRoot,
    'DPAPI_PROVIDER_ROOT_INVALID'
  );
  requireCondition(
    providerRootIdentity.resolvedPathSha256 ===
      provider.providerRootResolvedPathSha256 &&
      providerRootIdentity.device === provider.providerRootDevice &&
      providerRootIdentity.inode === provider.providerRootInode,
    'DPAPI_PROVIDER_ROOT_IDENTITY_MISMATCH'
  );

  requireCondition(
    runtime.platform === 'WIN32' &&
      runtime.requiredLanguageMode === 'FullLanguage' &&
      runtime.brokerScriptPath === BROKER_RELATIVE_PATH &&
      runtime.bootstrapScriptPath === BOOTSTRAP_RELATIVE_PATH &&
      SHA256_PATTERN.test(runtime.powershellExecutableSha256) &&
      SHA256_PATTERN.test(runtime.brokerScriptSha256) &&
      SHA256_PATTERN.test(runtime.bootstrapScriptSha256),
    'DPAPI_RUNTIME_BINDING_INVALID'
  );
  const powershellPath = path.win32.resolve(runtime.powershellExecutablePath);
  requireCondition(
    normalizedWindowsPath(powershellPath) ===
      normalizedWindowsPath(runtime.powershellExecutablePath),
    'DPAPI_RUNTIME_BINDING_INVALID'
  );
  const powershellSnapshot = stableFileSnapshot(
    powershellPath,
    'DPAPI_POWERSHELL_BINARY_INVALID'
  );
  requireCondition(
    powershellSnapshot.sha256 === runtime.powershellExecutableSha256,
    'DPAPI_POWERSHELL_HASH_MISMATCH'
  );
  const brokerPath = path.resolve(repositoryRoot, runtime.brokerScriptPath);
  const bootstrapPath = path.resolve(
    repositoryRoot,
    runtime.bootstrapScriptPath
  );
  const brokerSnapshot = stableFileSnapshot(
    brokerPath,
    'DPAPI_BROKER_SCRIPT_INVALID'
  );
  const bootstrapSnapshot = stableFileSnapshot(
    bootstrapPath,
    'DPAPI_BOOTSTRAP_SCRIPT_INVALID'
  );
  requireCondition(
    brokerSnapshot.sha256 === runtime.brokerScriptSha256 &&
      bootstrapSnapshot.sha256 === runtime.bootstrapScriptSha256,
    'DPAPI_SCRIPT_HASH_MISMATCH'
  );
  const powershellIdentity = inspectBoundPowerShell(
    powershellPath,
    protocol.brokerTimeoutMilliseconds
  );
  requireCondition(
    powershellIdentity.sidSha256 === provider.ownerSidSha256 &&
      powershellIdentity.version === runtime.powershellVersion &&
      powershellIdentity.languageMode === runtime.requiredLanguageMode,
    'DPAPI_POWERSHELL_IDENTITY_INVALID'
  );

  validateRoleConfiguration(
    secrets.managementAccessToken,
    'MANAGEMENT_ACCESS_TOKEN'
  );
  validateRoleConfiguration(secrets.databasePassword, 'DATABASE_PASSWORD');
  const tokenPath = envelopePath(
    provider.providerRoot,
    secrets.managementAccessToken.envelopeFilename
  );
  const passwordPath = envelopePath(
    provider.providerRoot,
    secrets.databasePassword.envelopeFilename
  );
  const tokenEnvelopeSnapshot = stableFileSnapshot(
    tokenPath,
    'DPAPI_TOKEN_ENVELOPE_INVALID'
  );
  const passwordEnvelopeSnapshot = stableFileSnapshot(
    passwordPath,
    'DPAPI_PASSWORD_ENVELOPE_INVALID'
  );
  requireCondition(
    tokenEnvelopeSnapshot.sha256 ===
      secrets.managementAccessToken.envelopeSha256 &&
      passwordEnvelopeSnapshot.sha256 ===
        secrets.databasePassword.envelopeSha256,
    'DPAPI_ENVELOPE_HASH_MISMATCH'
  );
  return {
    providerRootIdentity,
    powershellPath,
    powershellSnapshot,
    brokerPath,
    brokerSnapshot,
    bootstrapPath,
    bootstrapSnapshot,
    tokenPath,
    tokenEnvelopeSnapshot,
    passwordPath,
    passwordEnvelopeSnapshot,
  };
}

export function revalidateDpapiCredentialResources(
  credentialConfiguration,
  repositoryRoot,
  expected
) {
  const current = validateDpapiCredentialResources(
    credentialConfiguration,
    repositoryRoot
  );
  requireCondition(
    canonicalJson(current.providerRootIdentity) ===
      canonicalJson(expected.providerRootIdentity),
    'DPAPI_PROVIDER_ROOT_CHANGED'
  );
  for (const key of [
    'powershellSnapshot',
    'brokerSnapshot',
    'bootstrapSnapshot',
    'tokenEnvelopeSnapshot',
    'passwordEnvelopeSnapshot',
  ]) {
    assertStableSnapshot(current[key], expected[key], 'DPAPI_RESOURCE_CHANGED');
  }
  return current;
}

export function buildCredentialBrokerRequest({
  mode,
  bindingMaterialSha256,
  payloadSha256,
  claimSha256,
  credentialConfigurationSha256,
  credentialConfiguration,
  journalDirectory,
  journalDirectoryPathSha256,
  evidenceParentDirectory,
  evidenceParentDirectoryPathSha256,
  approvalExpiresAt,
  requestNonce,
}) {
  requireCondition(
    mode === 'EXECUTE' || mode === 'RECOVERY',
    'DPAPI_BROKER_MODE_INVALID'
  );
  const { provider, secrets } = credentialConfiguration;
  const entries = [
    {
      role: 'MANAGEMENT_ACCESS_TOKEN',
      opaqueHandle: secrets.managementAccessToken.opaqueHandle,
      opaqueHandleSha256: secrets.managementAccessToken.opaqueHandleSha256,
      envelopeSha256: secrets.managementAccessToken.envelopeSha256,
    },
  ];
  if (mode === 'EXECUTE') {
    entries.push({
      role: 'DATABASE_PASSWORD',
      opaqueHandle: secrets.databasePassword.opaqueHandle,
      opaqueHandleSha256: secrets.databasePassword.opaqueHandleSha256,
      envelopeSha256: secrets.databasePassword.envelopeSha256,
    });
  }
  const request = {
    schemaVersion: 1,
    protocol: REQUEST_PROTOCOL,
    mode,
    actionId: ACTION_ID,
    bindingMaterialSha256,
    payloadSha256,
    claimSha256,
    credentialConfigurationSha256,
    providerId: provider.providerId,
    configurationId: provider.configurationId,
    providerRoot: provider.providerRoot,
    providerRootPathSha256: provider.providerRootPathSha256,
    providerRootResolvedPathSha256: provider.providerRootResolvedPathSha256,
    bootstrapScriptSha256:
      credentialConfiguration.runtime.bootstrapScriptSha256,
    journalDirectory,
    journalDirectoryPathSha256,
    evidenceParentDirectory,
    evidenceParentDirectoryPathSha256,
    approvalExpiresAt,
    requestNonce:
      requestNonce === undefined
        ? randomBytes(32).toString('hex')
        : requestNonce,
    entries,
  };
  requireCondition(
    /^[a-f0-9]{64}$/.test(request.requestNonce),
    'DPAPI_BROKER_NONCE_INVALID'
  );
  const bytes = Buffer.from(`${canonicalJson(request)}\n`, 'utf8');
  requireCondition(
    bytes.length <= credentialConfiguration.protocol.requestMaximumBytes,
    'DPAPI_BROKER_REQUEST_TOO_LARGE'
  );
  return { request, bytes };
}

function decodeCredential(bytes, minimum, maximum) {
  requireCondition(
    bytes.length >= minimum && bytes.length <= maximum,
    'DPAPI_BROKER_FRAME_INVALID'
  );
  let value;
  try {
    value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('DPAPI_BROKER_FRAME_INVALID');
  }
  requireCondition(
    !value.includes('\0') &&
      !value.includes('\r') &&
      !value.includes('\n') &&
      Buffer.byteLength(value, 'utf8') === bytes.length,
    'DPAPI_BROKER_FRAME_INVALID'
  );
  return value;
}

export function parseCredentialBrokerFrame(
  frame,
  requestBytes,
  mode,
  credentialConfiguration
) {
  requireCondition(Buffer.isBuffer(frame), 'DPAPI_BROKER_FRAME_INVALID');
  requireCondition(
    frame.length >= 44 &&
      frame.length <= credentialConfiguration.protocol.responseMaximumBytes &&
      frame.subarray(0, 8).equals(RESPONSE_MAGIC) &&
      frame[8] === 1 &&
      frame[9] === (mode === 'EXECUTE' ? 1 : 2) &&
      frame[10] === (mode === 'EXECUTE' ? 2 : 1) &&
      frame[11] === 0 &&
      frame
        .subarray(12, 44)
        .equals(createHash('sha256').update(requestBytes).digest()),
    'DPAPI_BROKER_FRAME_INVALID'
  );
  const expectedRoles =
    mode === 'EXECUTE'
      ? [
          {
            code: 1,
            key: 'managementAccessToken',
            minimum:
              credentialConfiguration.secrets.managementAccessToken
                .minimumBytes,
            maximum:
              credentialConfiguration.secrets.managementAccessToken
                .maximumBytes,
          },
          {
            code: 2,
            key: 'databasePassword',
            minimum:
              credentialConfiguration.secrets.databasePassword.minimumBytes,
            maximum:
              credentialConfiguration.secrets.databasePassword.maximumBytes,
          },
        ]
      : [
          {
            code: 1,
            key: 'managementAccessToken',
            minimum:
              credentialConfiguration.secrets.managementAccessToken
                .minimumBytes,
            maximum:
              credentialConfiguration.secrets.managementAccessToken
                .maximumBytes,
          },
        ];
  let offset = 44;
  const values = {};
  for (const role of expectedRoles) {
    requireCondition(offset + 5 <= frame.length, 'DPAPI_BROKER_FRAME_INVALID');
    const roleCode = frame[offset];
    const length = frame.readUInt32BE(offset + 1);
    offset += 5;
    requireCondition(
      roleCode === role.code && offset + length <= frame.length,
      'DPAPI_BROKER_FRAME_INVALID'
    );
    values[role.key] = decodeCredential(
      frame.subarray(offset, offset + length),
      role.minimum,
      role.maximum
    );
    offset += length;
  }
  requireCondition(offset === frame.length, 'DPAPI_BROKER_FRAME_INVALID');
  return values;
}

export function retrieveClaimBoundCredentials({
  mode,
  bindingMaterialSha256,
  payloadSha256,
  claimSha256,
  credentialConfigurationSha256,
  credentialConfiguration,
  journalDirectory,
  journalDirectoryPathSha256,
  evidenceParentDirectory,
  evidenceParentDirectoryPathSha256,
  approvalExpiresAt,
  resources,
}) {
  const request = buildCredentialBrokerRequest({
    mode,
    bindingMaterialSha256,
    payloadSha256,
    claimSha256,
    credentialConfigurationSha256,
    credentialConfiguration,
    journalDirectory,
    journalDirectoryPathSha256,
    evidenceParentDirectory,
    evidenceParentDirectoryPathSha256,
    approvalExpiresAt,
  });
  let stdout;
  let stderr;
  try {
    const result = spawnSync(
      resources.powershellPath,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        resources.brokerPath,
      ],
      {
        env: minimalPowerShellEnvironment(),
        input: request.bytes,
        maxBuffer: credentialConfiguration.protocol.responseMaximumBytes,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: credentialConfiguration.protocol.brokerTimeoutMilliseconds,
        windowsHide: true,
      }
    );
    stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0);
    stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0);
    requireCondition(
      result.error === undefined &&
        result.signal === null &&
        result.status === 0 &&
        stderr.length === 0 &&
        stdout.length > 0,
      'CREDENTIAL_BROKER_FAILED'
    );
    return parseCredentialBrokerFrame(
      stdout,
      request.bytes,
      mode,
      credentialConfiguration
    );
  } catch {
    fail('CREDENTIAL_BROKER_FAILED');
  } finally {
    request.bytes.fill(0);
    stdout?.fill(0);
    stderr?.fill(0);
  }
}

export const DPAPI_CHANNEL_CONSTANTS = Object.freeze({
  actionId: ACTION_ID,
  claimFile: CLAIM_FILE,
  providerId: PROVIDER_ID,
  requestProtocol: REQUEST_PROTOCOL,
  brokerRelativePath: BROKER_RELATIVE_PATH,
  bootstrapRelativePath: BOOTSTRAP_RELATIVE_PATH,
});
