import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const SOURCE_REPLAY_COMMAND_SEQUENCE = Object.freeze([
  'PR12-CMD-003',
  'PR12-CMD-004',
  'PR12-CMD-005',
  'PR12-CMD-006',
  'PR12-CMD-007',
  'PR12-CMD-007A',
  'PR12-CMD-008A',
]);

export const PINNED_PR12_TOOLCHAIN = Object.freeze({
  supabase: Object.freeze({
    executableName: 'supabase.exe',
    version: '2.109.0',
    sha256: '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118',
  }),
  supabaseGo: Object.freeze({
    executableName: 'supabase-go.exe',
    version: '2.109.0',
    sha256: '59cd06ac674fdf5d6add75206408ada0a24b1dcb796d099c13b1f2aaf3f463f0',
  }),
  psql: Object.freeze({
    executableName: 'psql.exe',
    version: '17.9',
    sha256: '6a4b5cd854ee1c0e50646e7612a9e769c9ae86aa97bf94c50342dad058c2b531',
  }),
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const SYSTEM_IDENTIFIER_PATTERN = /^(?:0|[1-9][0-9]{0,19})$/u;
const PRODUCTION_PROJECT_REF = 'qnanuoqveidwvacvbhqp';
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-z]:\\/i;
const SYSTEM_ENV_KEYS = Object.freeze(['SystemRoot', 'TEMP', 'TMP', 'PATH']);
const TELEMETRY_ENV = Object.freeze({
  DO_NOT_TRACK: '1',
  SUPABASE_TELEMETRY_DISABLED: '1',
});

function fail(code) {
  throw new Error(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value, code) {
  if (!isRecord(value)) fail(code);
  return value;
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.length === 0) fail(code);
  return value;
}

function requireExactKeys(recordInput, keys, code) {
  const record = requireRecord(recordInput, code);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(code);
  }
  return record;
}

function requireStringArray(value, code) {
  if (
    !Array.isArray(value) ||
    value.some(item => typeof item !== 'string' || item.length === 0)
  ) {
    fail(code);
  }
  return value;
}

function isAbsoluteWindowsOrNative(value) {
  return (
    typeof value === 'string' &&
    (path.isAbsolute(value) ||
      path.win32.isAbsolute(value) ||
      WINDOWS_ABSOLUTE_PATH_PATTERN.test(value))
  );
}

function normalizeExternalPathLexically(valueInput) {
  const value = requireString(valueInput, 'EXTERNAL_PATH_INVALID');
  if (!isAbsoluteWindowsOrNative(value)) fail('EXTERNAL_PATH_INVALID');
  if (path.win32.isAbsolute(value)) {
    return {
      canonicalization: 'win32-lowercase-backslash-absolute-v1',
      normalized: path.win32
        .normalize(value)
        .replace(/\//g, '\\')
        .toLowerCase(),
    };
  }
  return {
    canonicalization: 'native-posix-absolute-v1',
    normalized: path.normalize(value),
  };
}

export function fingerprintExternalPath(
  pathInput,
  resolver = realpathSync.native
) {
  if (typeof resolver !== 'function') fail('EXTERNAL_PATH_RESOLVER_INVALID');
  const lexical = normalizeExternalPathLexically(pathInput);
  let resolvedPath;
  try {
    resolvedPath = resolver(pathInput);
  } catch {
    fail('EXTERNAL_PATH_RESOLUTION_FAILED');
  }
  const resolved = normalizeExternalPathLexically(resolvedPath);
  if (lexical.canonicalization !== resolved.canonicalization) {
    fail('EXTERNAL_PATH_RESOLUTION_PLATFORM_MISMATCH');
  }
  const pathSha256 = sha256Text(
    `${lexical.canonicalization}:${lexical.normalized}`
  );
  const resolvedPathSha256 = sha256Text(
    `${resolved.canonicalization}:${resolved.normalized}`
  );
  return {
    schemaVersion: 1,
    canonicalization: lexical.canonicalization,
    pathSha256,
    resolvedPathSha256,
    lexicalAndResolvedPathMatch: pathSha256 === resolvedPathSha256,
    rawPathRetained: false,
  };
}

export function buildExternalPathFingerprintProjection(input, resolver) {
  const paths = requireExactKeys(
    input,
    [
      'supabasePath',
      'supabaseGoPath',
      'psqlPath',
      'caBundlePath',
      'externalWorkdir',
      'supabaseHome',
      'dockerConfig',
    ],
    'EXTERNAL_PATH_SET_INVALID'
  );
  if (
    Object.values(paths).some(
      value => typeof value !== 'string' || !isAbsoluteWindowsOrNative(value)
    )
  ) {
    fail('EXTERNAL_PATH_SET_INVALID');
  }
  if (
    path.win32.dirname(paths.supabasePath).toLowerCase() !==
    path.win32.dirname(paths.supabaseGoPath).toLowerCase()
  ) {
    fail('SUPABASE_GO_NOT_ADJACENT');
  }
  const entries = {};
  for (const key of Object.keys(paths).sort()) {
    entries[key] = fingerprintExternalPath(paths[key], resolver);
  }
  const projection = {
    schemaVersion: 1,
    status: 'EXTERNAL_PATH_FINGERPRINTS_CAPTURED',
    entries,
    rawPathsRetained: false,
  };
  return {
    ...projection,
    projectionSha256: sha256Canonical(projection),
  };
}

function canonicalize(value) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('CANONICAL_EVIDENCE_INVALID');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) fail('CANONICAL_EVIDENCE_INVALID');

  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) fail('CANONICAL_EVIDENCE_INVALID');
    result[key] = canonicalize(value[key]);
  }
  return result;
}

export function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Canonical(value) {
  return sha256Text(JSON.stringify(canonicalize(value)));
}

function collectStrings(value, result = []) {
  if (typeof value === 'string') {
    result.push(value);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectStrings(item, result));
    return result;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, nested]) => {
      result.push(key);
      collectStrings(nested, result);
    });
  }
  return result;
}

function assertSecretFree(value, forbiddenValues) {
  const strings = collectStrings(value);
  const serialized = JSON.stringify(canonicalize(value));
  const secretKeyPattern =
    /^(?:access_token|authorization|database_password|management_token|password|pgpassword|supabase_access_token)$/i;
  const secretUrlPattern = /postgres(?:ql)?:\/\/[^/\s"'@]+:[^@\s"']+@/i;
  const tokenPatterns = [
    /bearer\s+[a-z0-9._~+/=-]+/i,
    /eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/i,
    /sb_(?:secret|publishable)_[a-z0-9_-]+/i,
    /sbp_[a-z0-9_-]{16,}/i,
  ];
  const hasSecretScalar = (() => {
    const visit = candidate => {
      if (Array.isArray(candidate)) return candidate.some(visit);
      if (!isRecord(candidate)) return false;
      return Object.entries(candidate).some(([key, nested]) => {
        if (
          secretKeyPattern.test(key) &&
          nested !== null &&
          !isRecord(nested) &&
          !Array.isArray(nested)
        ) {
          return true;
        }
        return visit(nested);
      });
    };
    return visit(value);
  })();
  const namedSecret = requireStringArray(
    forbiddenValues,
    'SECRET_SCAN_INPUT_INVALID'
  ).some(
    secret =>
      secret.length > 0 &&
      (serialized.includes(secret) ||
        strings.some(candidate => candidate.includes(secret)))
  );
  if (
    hasSecretScalar ||
    namedSecret ||
    secretUrlPattern.test(serialized) ||
    strings.some(candidate => secretUrlPattern.test(candidate)) ||
    tokenPatterns.some(
      pattern =>
        pattern.test(serialized) ||
        strings.some(candidate => pattern.test(candidate))
    )
  ) {
    fail('SECRET_BEARING_EVIDENCE');
  }
}

export function serializeCanonicalEvidence(value, forbiddenValues = []) {
  assertSecretFree(value, forbiddenValues);
  return `${JSON.stringify(canonicalize(value))}\n`;
}

function validateToolObservation(observationInput, expected, code) {
  const observation = requireExactKeys(
    observationInput,
    ['path', 'version', 'sha256'],
    code
  );
  const observedPath = requireString(observation.path, code);
  if (
    !isAbsoluteWindowsOrNative(observedPath) ||
    path.win32.basename(observedPath).toLowerCase() !== expected.executableName
  ) {
    fail(code);
  }
  if (
    observation.version !== expected.version ||
    observation.sha256 !== expected.sha256 ||
    !SHA256_PATTERN.test(observation.sha256)
  ) {
    fail(code);
  }
  return {
    path: observedPath,
    version: observation.version,
    sha256: observation.sha256,
  };
}

export function assertPinnedToolchainObservation(observationInput) {
  const observation = requireExactKeys(
    observationInput,
    ['supabase', 'supabaseGo', 'psql'],
    'TOOLCHAIN_OBSERVATION_INVALID'
  );
  const supabase = validateToolObservation(
    observation.supabase,
    PINNED_PR12_TOOLCHAIN.supabase,
    'SUPABASE_TOOLCHAIN_MISMATCH'
  );
  const supabaseGo = validateToolObservation(
    observation.supabaseGo,
    PINNED_PR12_TOOLCHAIN.supabaseGo,
    'SUPABASE_TOOLCHAIN_MISMATCH'
  );
  const psql = validateToolObservation(
    observation.psql,
    PINNED_PR12_TOOLCHAIN.psql,
    'PSQL_TOOLCHAIN_MISMATCH'
  );
  if (
    path.win32.dirname(supabase.path).toLowerCase() !==
    path.win32.dirname(supabaseGo.path).toLowerCase()
  ) {
    fail('SUPABASE_GO_NOT_ADJACENT');
  }
  return {
    status: 'PINNED_TOOLCHAIN_VERIFIED',
    supabase,
    supabaseGo,
    psql,
  };
}

export function projectPinnedToolchainObservation(observationInput, resolver) {
  const verified = assertPinnedToolchainObservation(observationInput);
  const projection = {
    schemaVersion: 1,
    status: verified.status,
    tools: {
      psql: {
        version: verified.psql.version,
        sha256: verified.psql.sha256,
        pathFingerprint: fingerprintExternalPath(verified.psql.path, resolver),
      },
      supabase: {
        version: verified.supabase.version,
        sha256: verified.supabase.sha256,
        pathFingerprint: fingerprintExternalPath(
          verified.supabase.path,
          resolver
        ),
      },
      supabaseGo: {
        version: verified.supabaseGo.version,
        sha256: verified.supabaseGo.sha256,
        pathFingerprint: fingerprintExternalPath(
          verified.supabaseGo.path,
          resolver
        ),
      },
    },
    rawPathsRetained: false,
  };
  return {
    ...projection,
    projectionSha256: sha256Canonical(projection),
  };
}

function defaultVersionObserver(executable, tool) {
  const environment = { ...TELEMETRY_ENV };
  for (const key of ['SystemRoot', 'TEMP', 'TMP']) {
    if (typeof process.env[key] === 'string' && process.env[key].length > 0) {
      environment[key] = process.env[key];
    }
  }
  const output = execFileSync(executable, ['--version'], {
    encoding: 'utf8',
    env: environment,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    windowsHide: true,
  }).trim();
  if (tool === 'psql') {
    const match = output.match(/\b(\d+\.\d+)(?:\.\d+)?\b/u);
    if (!match) fail('PSQL_TOOLCHAIN_MISMATCH');
    return match[1];
  }
  const match = output.match(/\b(\d+\.\d+\.\d+)\b/u);
  if (!match) fail('SUPABASE_TOOLCHAIN_MISMATCH');
  return match[1];
}

export function observeAndAssertPinnedToolchainFiles(input, adapters = {}) {
  const request = requireExactKeys(
    input,
    ['supabasePath', 'psqlPath'],
    'TOOLCHAIN_PATHS_INVALID'
  );
  const supabasePath = requireString(
    request.supabasePath,
    'TOOLCHAIN_PATHS_INVALID'
  );
  const psqlPath = requireString(request.psqlPath, 'TOOLCHAIN_PATHS_INVALID');
  if (
    !isAbsoluteWindowsOrNative(supabasePath) ||
    !isAbsoluteWindowsOrNative(psqlPath)
  ) {
    fail('TOOLCHAIN_PATHS_INVALID');
  }
  const adapterRecord = requireRecord(adapters, 'TOOLCHAIN_ADAPTER_INVALID');
  if (
    Object.keys(adapterRecord).some(
      key => !['readFile', 'readVersion'].includes(key)
    )
  ) {
    fail('TOOLCHAIN_ADAPTER_INVALID');
  }
  const readFile =
    typeof adapterRecord.readFile === 'function'
      ? adapterRecord.readFile
      : readFileSync;
  const readVersion =
    typeof adapterRecord.readVersion === 'function'
      ? adapterRecord.readVersion
      : defaultVersionObserver;
  const supabaseGoPath = path.win32.join(
    path.win32.dirname(supabasePath),
    'supabase-go.exe'
  );
  const hashFile = filePath => {
    const contents = readFile(filePath);
    if (!Buffer.isBuffer(contents) && !(contents instanceof Uint8Array)) {
      fail('TOOLCHAIN_FILE_OBSERVATION_INVALID');
    }
    return createHash('sha256').update(contents).digest('hex');
  };
  const observation = {
    supabase: {
      path: supabasePath,
      version: readVersion(supabasePath, 'supabase'),
      sha256: hashFile(supabasePath),
    },
    supabaseGo: {
      path: supabaseGoPath,
      version: PINNED_PR12_TOOLCHAIN.supabaseGo.version,
      sha256: hashFile(supabaseGoPath),
    },
    psql: {
      path: psqlPath,
      version: readVersion(psqlPath, 'psql'),
      sha256: hashFile(psqlPath),
    },
  };
  return assertPinnedToolchainObservation(observation);
}

export function observeCaBundle(caBundlePathInput, readFile = readFileSync) {
  const caBundlePath = requireString(
    caBundlePathInput,
    'CA_BUNDLE_BINDING_INVALID'
  );
  if (
    !isAbsoluteWindowsOrNative(caBundlePath) ||
    typeof readFile !== 'function'
  ) {
    fail('CA_BUNDLE_BINDING_INVALID');
  }
  const contents = readFile(caBundlePath);
  if (!Buffer.isBuffer(contents) && !(contents instanceof Uint8Array)) {
    fail('CA_BUNDLE_OBSERVATION_INVALID');
  }
  return {
    path: caBundlePath,
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
}

export function projectCaBundleObservation(observationInput, resolver) {
  const observation = requireExactKeys(
    observationInput,
    ['path', 'sha256'],
    'CA_BUNDLE_OBSERVATION_INVALID'
  );
  if (
    !isAbsoluteWindowsOrNative(observation.path) ||
    !SHA256_PATTERN.test(observation.sha256)
  ) {
    fail('CA_BUNDLE_OBSERVATION_INVALID');
  }
  const projection = {
    schemaVersion: 1,
    status: 'CA_BUNDLE_OBSERVATION_CAPTURED',
    sha256: observation.sha256,
    pathFingerprint: fingerprintExternalPath(observation.path, resolver),
    rawPathRetained: false,
  };
  return {
    ...projection,
    projectionSha256: sha256Canonical(projection),
  };
}

function validateDirectDatabaseTarget(target, denylist) {
  const projectRef = requireString(
    target.projectRef,
    'TARGET_IDENTITY_INVALID'
  );
  const directHost = requireString(
    target.directHost,
    'TARGET_IDENTITY_INVALID'
  ).toLowerCase();
  const systemIdentifier = requireString(
    target.databaseSystemIdentifier,
    'TARGET_IDENTITY_INVALID'
  );
  const caBundle = requireExactKeys(
    target.caBundle,
    ['path', 'sha256'],
    'CA_BUNDLE_BINDING_INVALID'
  );
  const caPath = requireString(caBundle.path, 'CA_BUNDLE_BINDING_INVALID');
  if (!SYSTEM_IDENTIFIER_PATTERN.test(systemIdentifier)) {
    fail('SYSTEM_IDENTIFIER_INVALID');
  }
  if (
    !PROJECT_REF_PATTERN.test(projectRef) ||
    !isAbsoluteWindowsOrNative(caPath) ||
    !SHA256_PATTERN.test(caBundle.sha256)
  ) {
    fail('TARGET_IDENTITY_INVALID');
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(target.directDatabaseUrl);
  } catch {
    fail('DIRECT_DATABASE_URL_INVALID');
  }
  if (
    databaseUrl.protocol !== 'postgresql:' &&
    databaseUrl.protocol !== 'postgres:'
  ) {
    fail('DIRECT_DATABASE_URL_INVALID');
  }
  if (databaseUrl.password.length > 0) fail('SECRET_BEARING_DATABASE_URL');
  const searchKeys = [...databaseUrl.searchParams.keys()];
  if (
    databaseUrl.username !== 'postgres' ||
    databaseUrl.hostname.toLowerCase() !== directHost ||
    databaseUrl.port !== '5432' ||
    databaseUrl.pathname !== '/postgres' ||
    databaseUrl.hash !== '' ||
    searchKeys.length !== 2 ||
    new Set(searchKeys).size !== 2 ||
    !searchKeys.includes('sslmode') ||
    !searchKeys.includes('sslrootcert') ||
    databaseUrl.searchParams.get('sslmode') !== 'verify-full' ||
    databaseUrl.searchParams.get('sslrootcert') !== caPath
  ) {
    fail('DIRECT_DATABASE_URL_INVALID');
  }
  if (
    directHost !== `db.${projectRef}.supabase.co` ||
    directHost.includes('pooler') ||
    directHost.includes('pooling')
  ) {
    fail('DIRECT_DATABASE_HOST_REQUIRED');
  }
  const projectRefs = requireStringArray(
    denylist.projectRefs,
    'PRODUCTION_DENYLIST_INVALID'
  );
  const hosts = requireStringArray(
    denylist.hosts,
    'PRODUCTION_DENYLIST_INVALID'
  ).map(host => host.toLowerCase());
  const systemIdentifiers = requireStringArray(
    denylist.databaseSystemIdentifiers,
    'PRODUCTION_DENYLIST_INVALID'
  );
  if (
    !projectRefs.includes(PRODUCTION_PROJECT_REF) ||
    projectRefs.includes(projectRef) ||
    hosts.includes(directHost) ||
    systemIdentifiers.includes(systemIdentifier)
  ) {
    fail('PRODUCTION_CONTACT_DENIED');
  }

  return {
    projectRef,
    directHost,
    directDatabaseUrl: databaseUrl.toString(),
    databaseSystemIdentifier: systemIdentifier,
    caBundle: { path: caPath, sha256: caBundle.sha256 },
  };
}

export function assertStageRuntimeBinding(bindingInput, contextInput) {
  const binding = requireExactKeys(
    bindingInput,
    [
      'schemaVersion',
      'status',
      'approval',
      'target',
      'productionDenylist',
      'commandSequence',
    ],
    'RUNTIME_BINDING_INVALID'
  );
  const context = requireExactKeys(
    contextInput,
    ['currentHead', 'now', 'expectedCommandSequence', 'caBundleObservation'],
    'RUNTIME_CONTEXT_INVALID'
  );
  if (
    binding.schemaVersion !== 1 ||
    binding.status !== 'APPROVED_NOT_EXECUTED'
  ) {
    fail('RUNTIME_BINDING_INVALID');
  }
  const currentHead = requireString(context.currentHead, 'GIT_HEAD_INVALID');
  const target = requireExactKeys(
    binding.target,
    [
      'gitCommit',
      'projectRef',
      'directHost',
      'directDatabaseUrl',
      'databaseSystemIdentifier',
      'caBundle',
    ],
    'TARGET_IDENTITY_INVALID'
  );
  if (!GIT_SHA_PATTERN.test(currentHead) || target.gitCommit !== currentHead) {
    fail('GIT_HEAD_MISMATCH');
  }
  const approval = requireExactKeys(
    binding.approval,
    ['expiresAt'],
    'APPROVAL_INVALID'
  );
  const now = Date.parse(requireString(context.now, 'RUNTIME_CLOCK_INVALID'));
  const expiry = Date.parse(
    requireString(approval.expiresAt, 'APPROVAL_INVALID')
  );
  if (!Number.isFinite(now) || !Number.isFinite(expiry)) {
    fail('APPROVAL_INVALID');
  }
  if (now >= expiry) fail('APPROVAL_EXPIRED');

  const expectedSequence = requireStringArray(
    context.expectedCommandSequence,
    'COMMAND_SEQUENCE_INVALID'
  );
  const actualSequence = requireStringArray(
    binding.commandSequence,
    'COMMAND_SEQUENCE_INVALID'
  );
  if (
    expectedSequence.length !== SOURCE_REPLAY_COMMAND_SEQUENCE.length ||
    expectedSequence.some(
      (id, index) => id !== SOURCE_REPLAY_COMMAND_SEQUENCE[index]
    ) ||
    actualSequence.length !== SOURCE_REPLAY_COMMAND_SEQUENCE.length ||
    actualSequence.some(
      (id, index) => id !== SOURCE_REPLAY_COMMAND_SEQUENCE[index]
    )
  ) {
    fail('COMMAND_SEQUENCE_MISMATCH');
  }
  const denylist = requireExactKeys(
    binding.productionDenylist,
    ['projectRefs', 'hosts', 'databaseSystemIdentifiers'],
    'PRODUCTION_DENYLIST_INVALID'
  );
  const normalizedTarget = validateDirectDatabaseTarget(target, denylist);
  const caBundleObservation = requireExactKeys(
    context.caBundleObservation,
    ['path', 'sha256'],
    'CA_BUNDLE_OBSERVATION_INVALID'
  );
  if (
    caBundleObservation.path !== normalizedTarget.caBundle.path ||
    caBundleObservation.sha256 !== normalizedTarget.caBundle.sha256
  ) {
    fail('CA_BUNDLE_HASH_MISMATCH');
  }
  return {
    status: 'RUNTIME_BINDING_VERIFIED',
    gitCommit: currentHead,
    projectRef: normalizedTarget.projectRef,
    directHost: normalizedTarget.directHost,
    databaseSystemIdentifier: normalizedTarget.databaseSystemIdentifier,
    expiresAt: new Date(expiry).toISOString(),
    commandSequence: [...actualSequence],
  };
}

export function buildIsolatedChildEnvironment(input) {
  const request = requireExactKeys(
    input,
    [
      'credentialKind',
      'credentialValues',
      'operatingSystemValues',
      'isolationPaths',
    ],
    'CHILD_ENVIRONMENT_INVALID'
  );
  const operatingSystemValues = requireRecord(
    request.operatingSystemValues,
    'CHILD_ENVIRONMENT_INVALID'
  );
  if (
    Object.keys(operatingSystemValues).some(
      key => !SYSTEM_ENV_KEYS.includes(key)
    )
  ) {
    fail('AMBIENT_ENVIRONMENT_FORBIDDEN');
  }
  const environment = { ...TELEMETRY_ENV };
  for (const key of SYSTEM_ENV_KEYS) {
    const value = operatingSystemValues[key];
    if (value !== undefined) {
      environment[key] = requireString(value, 'CHILD_ENVIRONMENT_INVALID');
    }
  }
  const isolationPaths = requireExactKeys(
    request.isolationPaths,
    ['supabaseHome', 'dockerConfig'],
    'CLI_ISOLATION_PATH_INVALID'
  );
  const supabaseHome = requireString(
    isolationPaths.supabaseHome,
    'CLI_ISOLATION_PATH_INVALID'
  );
  const dockerConfig = requireString(
    isolationPaths.dockerConfig,
    'CLI_ISOLATION_PATH_INVALID'
  );
  if (
    !isAbsoluteWindowsOrNative(supabaseHome) ||
    !isAbsoluteWindowsOrNative(dockerConfig) ||
    supabaseHome.toLowerCase() === dockerConfig.toLowerCase()
  ) {
    fail('CLI_ISOLATION_PATH_INVALID');
  }
  environment.SUPABASE_HOME = supabaseHome;
  environment.SUPABASE_NO_KEYRING = '1';
  environment.DOCKER_CONFIG = dockerConfig;
  const credentials = requireRecord(
    request.credentialValues,
    'CREDENTIAL_ENVIRONMENT_INVALID'
  );
  const expectedCredentialKeys =
    request.credentialKind === 'database'
      ? ['PGPASSWORD']
      : request.credentialKind === 'management-types'
        ? ['SUPABASE_ACCESS_TOKEN']
        : null;
  if (
    expectedCredentialKeys === null ||
    Object.keys(credentials).length !== expectedCredentialKeys.length ||
    Object.keys(credentials).some(key => !expectedCredentialKeys.includes(key))
  ) {
    fail('CREDENTIAL_ENVIRONMENT_INVALID');
  }
  for (const key of expectedCredentialKeys) {
    const value = requireString(
      credentials[key],
      'CREDENTIAL_ENVIRONMENT_INVALID'
    );
    if (value === 'NOT_CAPTURED' || value === 'UNRESOLVED') {
      fail('CREDENTIAL_ENVIRONMENT_INVALID');
    }
    environment[key] = value;
  }
  return environment;
}

function assertSpawnEnvironment(environmentInput) {
  const environment = requireRecord(
    environmentInput,
    'SPAWN_ENVIRONMENT_INVALID'
  );
  const requiredKeys = [
    'DO_NOT_TRACK',
    'SUPABASE_TELEMETRY_DISABLED',
    'SUPABASE_HOME',
    'SUPABASE_NO_KEYRING',
    'DOCKER_CONFIG',
  ];
  const allowedKeys = new Set([
    ...requiredKeys,
    ...SYSTEM_ENV_KEYS,
    'PGPASSWORD',
    'SUPABASE_ACCESS_TOKEN',
  ]);
  if (
    Object.keys(environment).some(key => !allowedKeys.has(key)) ||
    requiredKeys.some(key => typeof environment[key] !== 'string') ||
    environment.DO_NOT_TRACK !== '1' ||
    environment.SUPABASE_TELEMETRY_DISABLED !== '1' ||
    environment.SUPABASE_NO_KEYRING !== '1' ||
    !isAbsoluteWindowsOrNative(environment.SUPABASE_HOME) ||
    !isAbsoluteWindowsOrNative(environment.DOCKER_CONFIG)
  ) {
    fail('AMBIENT_ENVIRONMENT_FORBIDDEN');
  }
  const credentialKeys = ['PGPASSWORD', 'SUPABASE_ACCESS_TOKEN'].filter(
    key => environment[key] !== undefined
  );
  if (
    credentialKeys.length !== 1 ||
    typeof environment[credentialKeys[0]] !== 'string' ||
    environment[credentialKeys[0]].length === 0
  ) {
    fail('CREDENTIAL_ENVIRONMENT_INVALID');
  }
  return environment;
}

export function buildPinnedSpawnContract(input) {
  const request = requireRecord(input, 'SPAWN_CONTRACT_INVALID');
  const allowedKeys = [
    'executable',
    'args',
    'cwd',
    'env',
    'timeoutMs',
    'retries',
  ];
  if (Object.keys(request).some(key => !allowedKeys.includes(key))) {
    fail('SPAWN_CONTRACT_INVALID');
  }
  if (request.retries !== undefined && request.retries !== 0) {
    fail('WRAPPER_RETRY_FORBIDDEN');
  }
  const executable = requireString(
    request.executable,
    'SPAWN_CONTRACT_INVALID'
  );
  const cwd = requireString(request.cwd, 'SPAWN_CONTRACT_INVALID');
  if (
    !isAbsoluteWindowsOrNative(executable) ||
    !isAbsoluteWindowsOrNative(cwd)
  ) {
    fail('SPAWN_CONTRACT_INVALID');
  }
  const args = requireStringArray(request.args, 'SPAWN_CONTRACT_INVALID');
  if (
    args.includes('link') ||
    args.includes('--linked') ||
    args.some(arg => /postgres(?:ql)?:\/\/[^/\s"'@]+:[^@\s"']+@/i.test(arg))
  ) {
    fail('LINKED_OR_SECRET_ARGUMENT_FORBIDDEN');
  }
  const timeoutMs = request.timeoutMs;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 900_000
  ) {
    fail('SPAWN_TIMEOUT_INVALID');
  }
  const env = assertSpawnEnvironment(request.env);
  return {
    executable,
    args: [...args],
    options: {
      cwd,
      encoding: 'utf8',
      env: { ...env },
      maxBuffer: 64 * 1024 * 1024,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      windowsHide: true,
    },
    wrapperRetryCount: 0,
  };
}

function outputContainsSecret(output, environment) {
  const secretValues = [
    environment.PGPASSWORD,
    environment.SUPABASE_ACCESS_TOKEN,
  ].filter(value => typeof value === 'string' && value.length > 0);
  return secretValues.some(secret => output.includes(secret));
}

export function dispatchPinnedCommandOnce(planInput, dispatcher) {
  const plan = requireRecord(planInput, 'SPAWN_CONTRACT_INVALID');
  if (typeof dispatcher !== 'function') fail('DISPATCHER_INVALID');
  let result;
  try {
    result = dispatcher({
      executable: plan.executable,
      args: [...plan.args],
      options: {
        ...plan.options,
        env: { ...plan.options.env },
        stdio: [...plan.options.stdio],
      },
    });
  } catch {
    return {
      dispatchCount: 1,
      wrapperRetryCount: 0,
      stdoutByteLength: 0,
      stdoutSha256: sha256Text(''),
      stderrByteLength: 0,
      stderrSha256: sha256Text(''),
      outcome: 'UNKNOWN_REMOTE_OUTCOME',
    };
  }
  const observation = requireRecord(result, 'DISPATCH_RESULT_INVALID');
  const stdout =
    typeof observation.stdout === 'string' ? observation.stdout : '';
  const stderr =
    typeof observation.stderr === 'string' ? observation.stderr : '';
  if (
    outputContainsSecret(stdout, plan.options.env) ||
    outputContainsSecret(stderr, plan.options.env)
  ) {
    fail('SECRET_BEARING_PROCESS_OUTPUT');
  }
  const base = {
    dispatchCount: 1,
    wrapperRetryCount: 0,
    stdoutByteLength: Buffer.byteLength(stdout, 'utf8'),
    stdoutSha256: sha256Text(stdout),
    stderrByteLength: Buffer.byteLength(stderr, 'utf8'),
    stderrSha256: sha256Text(stderr),
  };
  if (observation.status === null || observation.error !== null) {
    return { ...base, outcome: 'UNKNOWN_REMOTE_OUTCOME' };
  }
  if (!Number.isInteger(observation.status)) fail('DISPATCH_RESULT_INVALID');
  return {
    ...base,
    outcome: observation.status === 0 ? 'SUCCEEDED' : 'FAILED_DETERMINISTIC',
    exitCode: observation.status,
  };
}
