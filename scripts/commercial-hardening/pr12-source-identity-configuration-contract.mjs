import { createHash } from 'node:crypto';
import path from 'node:path';

export const PR12_SOURCE_IDENTITY_COMMAND_ID = 'PR12-CMD-004A';

export const PR12_SOURCE_IDENTITY_OBSERVATION_SEQUENCE = Object.freeze([
  'DIRECT_POSTGRES_IDENTITY_CLOCK',
  'DATA_API_CONFIGURATION',
  'AUTH_CONFIGURATION',
  'GRAPHQL_CONFIGURATION',
]);

export const PR12_SOURCE_CONFIGURATION_FAMILIES = Object.freeze([
  'DATA_API',
  'AUTH',
  'GRAPHQL',
]);

const PROJECT_REF_PATTERN = /^[a-z]{20}$/u;
const PRODUCTION_PROJECT_REF = 'qnanuoqveidwvacvbhqp';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SYSTEM_IDENTIFIER_PATTERN = /^(?:0|[1-9][0-9]{0,19})$/u;
const POSTGRES_VERSION_PATTERN = /^([1-9][0-9]*)\.([0-9]+)(?:\.([0-9]+))?$/u;
const SERVER_VERSION_NUM_PATTERN = /^[1-9][0-9]{5}$/u;
const UTC_PATTERN =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-z]:\\/iu;
const REQUIRED_ISOLATED_ENVIRONMENT_KEYS = Object.freeze([
  'DO_NOT_TRACK',
  'SUPABASE_TELEMETRY_DISABLED',
  'SUPABASE_HOME',
  'SUPABASE_NO_KEYRING',
  'DOCKER_CONFIG',
  'SystemRoot',
  'TEMP',
  'TMP',
  'PATH',
  'PGPASSWORD',
]);
const SECRET_STRING_PATTERNS = Object.freeze([
  /bearer\s+[a-z0-9._~+/=-]+/iu,
  /eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/iu,
  /sb_(?:secret|publishable)_[a-z0-9_-]+/iu,
  /sbp_[a-z0-9_-]{8,}/iu,
  /postgres(?:ql)?:\/\/[^/\s"'@]+:[^@\s"']+@/iu,
]);

const IDENTITY_SQL = [
  'select jsonb_build_object(',
  "'database_name', current_database(),",
  "'database_user', current_user,",
  "'postgres_version', current_setting('server_version'),",
  "'server_version_num', current_setting('server_version_num'),",
  "'system_identifier',",
  '(select system_identifier::text from pg_control_system()),',
  "'database_utc',",
  `to_char(clock_timestamp() at time zone 'UTC', ` +
    `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
  ');',
].join(' ');

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

function requireExactKeys(value, keys, code) {
  const record = requireRecord(value, code);
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

function requireString(value, code) {
  if (typeof value !== 'string' || value.length === 0) fail(code);
  return value;
}

function requireBoolean(value, code) {
  if (typeof value !== 'boolean') fail(code);
  return value;
}

function isAbsolutePath(value) {
  return (
    typeof value === 'string' &&
    (path.isAbsolute(value) ||
      path.win32.isAbsolute(value) ||
      WINDOWS_ABSOLUTE_PATH_PATTERN.test(value))
  );
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
    if (!Number.isFinite(value)) fail('CANONICAL_VALUE_INVALID');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) fail('CANONICAL_VALUE_INVALID');

  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) fail('CANONICAL_VALUE_INVALID');
    result[key] = canonicalize(value[key]);
  }
  return result;
}

function sha256Canonical(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function requireSha256(value, code) {
  const sha = requireString(value, code);
  if (!SHA256_PATTERN.test(sha)) fail(code);
  return sha;
}

function requireSortedUniqueStrings(value, code) {
  if (
    !Array.isArray(value) ||
    value.some(item => typeof item !== 'string' || item.length === 0)
  ) {
    fail(code);
  }
  const sorted = [...value].sort();
  if (
    new Set(value).size !== value.length ||
    sorted.some((item, index) => item !== value[index])
  ) {
    fail(code);
  }
  return [...value];
}

function assertNoSecretBearingStrings(value) {
  const visit = candidate => {
    if (typeof candidate === 'string') {
      if (SECRET_STRING_PATTERNS.some(pattern => pattern.test(candidate))) {
        fail('SECRET_BEARING_OBSERVATION');
      }
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (isRecord(candidate)) {
      Object.values(candidate).forEach(visit);
    }
  };
  visit(value);
}

function validateTargetIdentity(input, includeDatabaseUrl) {
  const expectedKeys = [
    'projectRef',
    'projectUrl',
    'directHost',
    ...(includeDatabaseUrl ? ['directDatabaseUrl', 'caBundle'] : []),
  ];
  const target = requireExactKeys(
    input,
    expectedKeys,
    'DIRECT_DATABASE_TARGET_INVALID'
  );
  const projectRef = requireString(
    target.projectRef,
    'DIRECT_DATABASE_TARGET_INVALID'
  );
  const projectUrl = requireString(
    target.projectUrl,
    'DIRECT_DATABASE_TARGET_INVALID'
  );
  const directHost = requireString(
    target.directHost,
    'DIRECT_DATABASE_TARGET_INVALID'
  ).toLowerCase();
  if (
    !PROJECT_REF_PATTERN.test(projectRef) ||
    projectUrl !== `https://${projectRef}.supabase.co` ||
    directHost !== `db.${projectRef}.supabase.co` ||
    directHost.includes('pooler') ||
    directHost.includes('pooling')
  ) {
    fail('DIRECT_DATABASE_TARGET_INVALID');
  }
  if (projectRef === PRODUCTION_PROJECT_REF) {
    fail('PRODUCTION_CONTACT_DENIED');
  }

  if (!includeDatabaseUrl) {
    return { projectRef, projectUrl, directHost };
  }

  const caBundle = requireExactKeys(
    target.caBundle,
    ['path', 'sha256'],
    'CA_BUNDLE_INVALID'
  );
  const caPath = requireString(caBundle.path, 'CA_BUNDLE_INVALID');
  const caSha256 = requireSha256(caBundle.sha256, 'CA_BUNDLE_INVALID');
  if (!isAbsolutePath(caPath)) fail('CA_BUNDLE_INVALID');

  let databaseUrl;
  try {
    databaseUrl = new URL(
      requireString(target.directDatabaseUrl, 'DIRECT_DATABASE_URL_INVALID')
    );
  } catch {
    fail('DIRECT_DATABASE_URL_INVALID');
  }
  if (databaseUrl.password.length > 0) {
    fail('SECRET_BEARING_DATABASE_URL');
  }
  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    databaseUrl.username !== 'postgres' ||
    databaseUrl.port !== '5432' ||
    databaseUrl.pathname !== '/postgres' ||
    databaseUrl.hash !== '' ||
    databaseUrl.searchParams.get('sslmode') !== 'verify-full'
  ) {
    fail('DIRECT_DATABASE_URL_INVALID');
  }
  const searchKeys = [...databaseUrl.searchParams.keys()];
  if (
    searchKeys.length !== 2 ||
    new Set(searchKeys).size !== 2 ||
    !searchKeys.includes('sslmode') ||
    !searchKeys.includes('sslrootcert')
  ) {
    fail('DIRECT_DATABASE_URL_INVALID');
  }
  if (databaseUrl.searchParams.get('sslrootcert') !== caPath) {
    fail('CA_BUNDLE_URL_MISMATCH');
  }
  if (
    databaseUrl.hostname.toLowerCase() ===
    `db.${PRODUCTION_PROJECT_REF}.supabase.co`
  ) {
    fail('PRODUCTION_CONTACT_DENIED');
  }
  if (databaseUrl.hostname.toLowerCase() !== directHost) {
    fail('DIRECT_DATABASE_TARGET_INVALID');
  }

  return {
    projectRef,
    projectUrl,
    directHost,
    directDatabaseUrl: databaseUrl.toString(),
    caBundle: { path: caPath, sha256: caSha256 },
  };
}

function validateRuntime(input) {
  const runtime = requireExactKeys(
    input,
    [
      'psqlPath',
      'externalWorkdir',
      'isolatedEnvironmentKeys',
      'shell',
      'stdin',
      'wrapperRetryCount',
      'maxDispatchesPerObservation',
    ],
    'SOURCE_IDENTITY_RUNTIME_INVALID'
  );
  if (runtime.wrapperRetryCount !== 0) fail('WRAPPER_RETRY_FORBIDDEN');
  if (runtime.maxDispatchesPerObservation !== 1) {
    fail('MULTIPLE_DISPATCH_FORBIDDEN');
  }
  const psqlPath = requireString(
    runtime.psqlPath,
    'SOURCE_IDENTITY_RUNTIME_INVALID'
  );
  const externalWorkdir = requireString(
    runtime.externalWorkdir,
    'SOURCE_IDENTITY_RUNTIME_INVALID'
  );
  if (
    !isAbsolutePath(psqlPath) ||
    path.win32.basename(psqlPath).toLowerCase() !== 'psql.exe' ||
    !isAbsolutePath(externalWorkdir) ||
    runtime.shell !== false ||
    runtime.stdin !== 'ignore'
  ) {
    fail('SOURCE_IDENTITY_RUNTIME_INVALID');
  }
  if (!Array.isArray(runtime.isolatedEnvironmentKeys)) {
    fail('AMBIENT_ENVIRONMENT_FORBIDDEN');
  }
  const environmentKeys = requireSortedUniqueStrings(
    [...new Set(runtime.isolatedEnvironmentKeys)].sort(),
    'AMBIENT_ENVIRONMENT_FORBIDDEN'
  );
  const actualEnvironmentKeys = [...new Set(runtime.isolatedEnvironmentKeys)];
  if (
    !Array.isArray(runtime.isolatedEnvironmentKeys) ||
    actualEnvironmentKeys.length !== runtime.isolatedEnvironmentKeys.length ||
    actualEnvironmentKeys.length !==
      REQUIRED_ISOLATED_ENVIRONMENT_KEYS.length ||
    REQUIRED_ISOLATED_ENVIRONMENT_KEYS.some(
      key => !actualEnvironmentKeys.includes(key)
    )
  ) {
    fail('AMBIENT_ENVIRONMENT_FORBIDDEN');
  }
  return {
    psqlPath,
    externalWorkdir,
    environmentKeyCount: environmentKeys.length,
  };
}

function observationStep(id, transport, requiredFields) {
  return {
    id,
    transport,
    mutating: false,
    maxDispatchCount: 1,
    wrapperRetryCount: 0,
    timeoutOrAmbiguousOutcome: 'UNKNOWN_REMOTE_OUTCOME_STOP',
    requiredFields,
    rawResponseBodyRetained: false,
    secretValuesCaptured: false,
  };
}

export function compileSourceIdentityConfigurationReadiness(input) {
  const request = requireExactKeys(
    input,
    ['target', 'runtime'],
    'SOURCE_IDENTITY_READINESS_INVALID'
  );
  const target = validateTargetIdentity(request.target, true);
  const runtime = validateRuntime(request.runtime);

  return {
    schemaVersion: 1,
    phase: 'ISOLATED_STAGING_SOURCE_IDENTITY_BOOTSTRAP',
    commandId: PR12_SOURCE_IDENTITY_COMMAND_ID,
    implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
    executionStatus: 'NOT_RUN',
    executionAuthorized: false,
    remoteContactPerformed: false,
    mutating: false,
    mutationScope: 'NONE',
    commandInvocationPolicy: {
      completedInvocationCount: 0,
      maximumInvocationCount: 1,
      wrapperRetryCount: 0,
      cliInternalTransportRetryCountClaimed: false,
    },
    target: {
      projectRef: target.projectRef,
      projectUrl: target.projectUrl,
      directHost: target.directHost,
      connectionMode: 'DIRECT',
      databaseUser: 'postgres',
      caBundleSha256: target.caBundle.sha256,
      caBundlePathRetainedInApprovalOnly: true,
      systemIdentifierPreKnown: false,
    },
    directPostgresCommand: {
      executable: runtime.psqlPath,
      args: [
        '-X',
        '-w',
        '-v',
        'ON_ERROR_STOP=1',
        '--dbname',
        target.directDatabaseUrl,
        '--command',
        IDENTITY_SQL,
      ],
      childProcess: {
        shell: false,
        stdin: 'ignore',
        inheritParentEnvironment: false,
      },
      externalWorkdir: runtime.externalWorkdir,
      credentialChannel: 'ISOLATED_CHILD_ENV_ONLY',
      resultProjection: 'HASHED_PROVIDER_SAFE_ONLY',
    },
    observationSequence: [
      observationStep(
        'DIRECT_POSTGRES_IDENTITY_CLOCK',
        'PSQL_DIRECT_READ_ONLY',
        [
          'database_name',
          'database_user',
          'postgres_version',
          'server_version_num',
          'system_identifier',
          'database_utc',
        ]
      ),
      observationStep('DATA_API_CONFIGURATION', 'PROVIDER_NATIVE_READ_ONLY', [
        'enabled',
        'serviceHealthy',
        'directEndpointReachable',
        'exposedSchemas',
        'automaticallyExposeNewTablesAndFunctions',
        'rawObservationSha256',
      ]),
      observationStep('AUTH_CONFIGURATION', 'PROVIDER_NATIVE_READ_ONLY', [
        'anonymousSignInEnabled',
        'emailProviderConfigured',
        'smsProviderConfigured',
        'oauthProvidersEnabled',
        'realEmailSmsOrOAuthDeliveryConfigured',
        'rawObservationSha256',
      ]),
      observationStep('GRAPHQL_CONFIGURATION', 'DIRECT_POSTGRES_READ_ONLY', [
        'installedVersion',
        'enabled',
        'configuredApiSchemas',
        'exposedSchemas',
        'introspectionEnabled',
        'rawObservationSha256',
      ]),
    ],
    defaultPlatformStateAssumed: false,
    providerConfigurationMutationAuthorized: false,
    mandatoryStop: {
      stopAfterCommandId: PR12_SOURCE_IDENTITY_COMMAND_ID,
      automaticContinuationAuthorized: false,
      nextCommandAuthorized: false,
      replayRequiresSeparatelyHashBoundApproval: true,
    },
  };
}

function validateDatabaseObservation(input) {
  const database = requireExactKeys(
    input,
    [
      'databaseName',
      'databaseUser',
      'connectionMode',
      'systemIdentifier',
      'postgresVersion',
      'serverVersionNum',
      'databaseUtc',
    ],
    'DATABASE_IDENTITY_INVALID'
  );
  if (
    database.databaseName !== 'postgres' ||
    database.databaseUser !== 'postgres' ||
    database.connectionMode !== 'DIRECT'
  ) {
    fail('DATABASE_IDENTITY_INVALID');
  }
  const systemIdentifier = requireString(
    database.systemIdentifier,
    'SYSTEM_IDENTIFIER_INVALID'
  );
  if (!SYSTEM_IDENTIFIER_PATTERN.test(systemIdentifier)) {
    fail('SYSTEM_IDENTIFIER_INVALID');
  }
  const postgresVersion = requireString(
    database.postgresVersion,
    'POSTGRES_VERSION_INVALID'
  );
  const versionMatch = postgresVersion.match(POSTGRES_VERSION_PATTERN);
  const serverVersionNum = requireString(
    database.serverVersionNum,
    'POSTGRES_VERSION_INVALID'
  );
  if (!versionMatch || !SERVER_VERSION_NUM_PATTERN.test(serverVersionNum)) {
    fail('POSTGRES_VERSION_INVALID');
  }
  const expectedMajor = Number(serverVersionNum.slice(0, -4));
  if (Number(versionMatch[1]) !== expectedMajor) {
    fail('POSTGRES_VERSION_INVALID');
  }
  const databaseUtc = requireString(
    database.databaseUtc,
    'DATABASE_UTC_INVALID'
  );
  if (
    !UTC_PATTERN.test(databaseUtc) ||
    !Number.isFinite(Date.parse(databaseUtc))
  ) {
    fail('DATABASE_UTC_INVALID');
  }
  return {
    databaseName: 'postgres',
    databaseUser: 'postgres',
    connectionMode: 'DIRECT',
    systemIdentifier,
    postgresVersion,
    serverVersionNum,
    databaseUtc,
  };
}

function validateDataApiConfiguration(input) {
  const code = 'DATA_API_CONFIGURATION_INVALID';
  const value = requireExactKeys(
    input,
    [
      'transport',
      'enabled',
      'serviceHealthy',
      'directEndpointReachable',
      'exposedSchemas',
      'automaticallyExposeNewTablesAndFunctions',
      'rawObservationSha256',
    ],
    code
  );
  if (value.transport !== 'PROVIDER_NATIVE_READ_ONLY') fail(code);
  return {
    family: 'DATA_API',
    transport: value.transport,
    enabled: requireBoolean(value.enabled, code),
    serviceHealthy: requireBoolean(value.serviceHealthy, code),
    directEndpointReachable: requireBoolean(
      value.directEndpointReachable,
      code
    ),
    exposedSchemas: requireSortedUniqueStrings(value.exposedSchemas, code),
    automaticallyExposeNewTablesAndFunctions: requireBoolean(
      value.automaticallyExposeNewTablesAndFunctions,
      code
    ),
    rawObservationSha256: requireSha256(value.rawObservationSha256, code),
  };
}

function validateAuthConfiguration(input) {
  const code = 'AUTH_CONFIGURATION_INVALID';
  const value = requireExactKeys(
    input,
    [
      'transport',
      'anonymousSignInEnabled',
      'emailProviderConfigured',
      'smsProviderConfigured',
      'oauthProvidersEnabled',
      'realEmailSmsOrOAuthDeliveryConfigured',
      'rawObservationSha256',
    ],
    code
  );
  if (value.transport !== 'PROVIDER_NATIVE_READ_ONLY') fail(code);
  return {
    family: 'AUTH',
    transport: value.transport,
    anonymousSignInEnabled: requireBoolean(value.anonymousSignInEnabled, code),
    emailProviderConfigured: requireBoolean(
      value.emailProviderConfigured,
      code
    ),
    smsProviderConfigured: requireBoolean(value.smsProviderConfigured, code),
    oauthProvidersEnabled: requireSortedUniqueStrings(
      value.oauthProvidersEnabled,
      code
    ),
    realEmailSmsOrOAuthDeliveryConfigured: requireBoolean(
      value.realEmailSmsOrOAuthDeliveryConfigured,
      code
    ),
    rawObservationSha256: requireSha256(value.rawObservationSha256, code),
  };
}

function validateGraphqlConfiguration(input) {
  const code = 'GRAPHQL_CONFIGURATION_INVALID';
  const value = requireExactKeys(
    input,
    [
      'transport',
      'installedVersion',
      'enabled',
      'configuredApiSchemas',
      'exposedSchemas',
      'introspectionEnabled',
      'rawObservationSha256',
    ],
    code
  );
  if (value.transport !== 'DIRECT_POSTGRES_READ_ONLY') fail(code);
  const installedVersion = value.installedVersion;
  if (
    installedVersion !== null &&
    (typeof installedVersion !== 'string' ||
      !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-z0-9.-]+)?$/iu.test(installedVersion))
  ) {
    fail(code);
  }
  return {
    family: 'GRAPHQL',
    transport: value.transport,
    installedVersion,
    enabled: requireBoolean(value.enabled, code),
    configuredApiSchemas: requireSortedUniqueStrings(
      value.configuredApiSchemas,
      code
    ),
    exposedSchemas: requireSortedUniqueStrings(value.exposedSchemas, code),
    introspectionEnabled: requireBoolean(value.introspectionEnabled, code),
    rawObservationSha256: requireSha256(value.rawObservationSha256, code),
  };
}

function addProjectionHash(value) {
  const projection = {
    ...value,
    rawPayloadRetained: false,
    secretValuesCaptured: false,
  };
  return {
    ...projection,
    projectionSha256: sha256Canonical(projection),
  };
}

export function validateAndProjectSourceIdentityObservation(input) {
  const observation = requireExactKeys(
    input,
    [
      'commandId',
      'projectRef',
      'projectUrl',
      'directHost',
      'database',
      'configurationFamilies',
      'observedAt',
      'mandatoryStopObserved',
    ],
    'SOURCE_IDENTITY_OBSERVATION_INVALID'
  );
  if (observation.commandId !== PR12_SOURCE_IDENTITY_COMMAND_ID) {
    fail('SOURCE_IDENTITY_OBSERVATION_INVALID');
  }
  const target = validateTargetIdentity(
    {
      projectRef: observation.projectRef,
      projectUrl: observation.projectUrl,
      directHost: observation.directHost,
    },
    false
  );
  const database = validateDatabaseObservation(observation.database);
  const families = requireExactKeys(
    observation.configurationFamilies,
    PR12_SOURCE_CONFIGURATION_FAMILIES,
    'CONFIGURATION_FAMILIES_INVALID'
  );
  const observedAt = requireString(
    observation.observedAt,
    'OBSERVED_AT_INVALID'
  );
  if (
    !UTC_PATTERN.test(observedAt) ||
    !Number.isFinite(Date.parse(observedAt))
  ) {
    fail('OBSERVED_AT_INVALID');
  }
  if (observation.mandatoryStopObserved !== true) {
    fail('MANDATORY_STOP_NOT_OBSERVED');
  }

  const normalizedFamilies = {
    AUTH: addProjectionHash(validateAuthConfiguration(families.AUTH)),
    DATA_API: addProjectionHash(
      validateDataApiConfiguration(families.DATA_API)
    ),
    GRAPHQL: addProjectionHash(validateGraphqlConfiguration(families.GRAPHQL)),
  };
  assertNoSecretBearingStrings({
    target,
    database,
    configurationFamilies: normalizedFamilies,
  });

  const projection = {
    schemaVersion: 1,
    status: 'VALIDATED_PROVIDER_SAFE_PROJECTION',
    commandId: PR12_SOURCE_IDENTITY_COMMAND_ID,
    projectRef: target.projectRef,
    projectUrl: target.projectUrl,
    directHost: target.directHost,
    database,
    configurationFamilies: normalizedFamilies,
    observedAt,
    rawResponseBodiesRetained: false,
    secretValuesCaptured: false,
    mandatoryStop: {
      stopAfterCommandId: PR12_SOURCE_IDENTITY_COMMAND_ID,
      observed: observation.mandatoryStopObserved,
      automaticContinuationAuthorized: false,
    },
  };
  return {
    ...projection,
    projectionSha256: sha256Canonical(projection),
  };
}

export function assertSourceIdentityProjectionIntegrity(input) {
  const projection = requireRecord(input, 'PROJECTION_INVALID');
  const projectionSha256 = requireSha256(
    projection.projectionSha256,
    'PROJECTION_INVALID'
  );
  const withoutHash = { ...projection };
  delete withoutHash.projectionSha256;
  if (sha256Canonical(withoutHash) !== projectionSha256) {
    fail('PROJECTION_HASH_MISMATCH');
  }
  for (const familyName of PR12_SOURCE_CONFIGURATION_FAMILIES) {
    const family = requireRecord(
      projection.configurationFamilies?.[familyName],
      'PROJECTION_INVALID'
    );
    const familyHash = requireSha256(
      family.projectionSha256,
      'PROJECTION_INVALID'
    );
    const familyWithoutHash = { ...family };
    delete familyWithoutHash.projectionSha256;
    if (sha256Canonical(familyWithoutHash) !== familyHash) {
      fail('PROJECTION_HASH_MISMATCH');
    }
  }
  assertNoSecretBearingStrings(projection);
  return {
    status: 'PROJECTION_INTEGRITY_VERIFIED',
    commandId: PR12_SOURCE_IDENTITY_COMMAND_ID,
    projectionSha256,
  };
}

export function assertSourceIdentityObservationMatchesReadiness(
  readinessInput,
  projectionInput
) {
  const readiness = requireRecord(
    readinessInput,
    'SOURCE_IDENTITY_READINESS_INVALID'
  );
  const projection = requireRecord(projectionInput, 'PROJECTION_INVALID');
  if (
    readiness.commandId !== PR12_SOURCE_IDENTITY_COMMAND_ID ||
    readiness.executionStatus !== 'NOT_RUN' ||
    readiness.executionAuthorized !== false ||
    readiness.remoteContactPerformed !== false ||
    readiness.mandatoryStop?.stopAfterCommandId !==
      PR12_SOURCE_IDENTITY_COMMAND_ID ||
    readiness.mandatoryStop?.automaticContinuationAuthorized !== false ||
    readiness.target?.projectRef !== projection.projectRef ||
    readiness.target?.projectUrl !== projection.projectUrl ||
    readiness.target?.directHost !== projection.directHost
  ) {
    fail('APPROVED_TARGET_MISMATCH');
  }
  const integrity = assertSourceIdentityProjectionIntegrity(projection);
  return {
    status: 'CAPTURE_BOUND_TO_APPROVED_READINESS_TARGET',
    commandId: PR12_SOURCE_IDENTITY_COMMAND_ID,
    projectRef: projection.projectRef,
    directHost: projection.directHost,
    capturedSystemIdentifier: projection.database.systemIdentifier,
    projectionSha256: integrity.projectionSha256,
    mandatoryStopRequired: true,
    nextCommandAuthorized: false,
  };
}
