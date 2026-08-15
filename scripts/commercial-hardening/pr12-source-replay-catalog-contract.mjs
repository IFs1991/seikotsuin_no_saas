import { createHash } from 'node:crypto';
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';

import {
  SOURCE_REPLAY_COMMAND_SEQUENCE,
  fingerprintExternalPath,
  sha256Canonical,
} from './pr12-stage-command-runtime.mjs';

const MIGRATION_CONTRACT =
  'docs/stabilization/evidence/commercial-hardening/pr12/migration-input-contract.json';
const MIGRATION_DIRECTORY = 'supabase/migrations';
const REPLAY_SQL_ASSETS = Object.freeze([
  'pr12-source-clean-replay-precondition.sql',
  'pr12-post-replay-catalog-capture.sql',
  'pr12-migration-history-parity.sql',
]);
const SQL_FILENAME_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const PRODUCTION_PROJECT_REF = 'qnanuoqveidwvacvbhqp';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

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

function requireArray(value, code) {
  if (!Array.isArray(value)) fail(code);
  return value;
}

function requireExactKeys(value, expectedKeys, code) {
  const record = requireRecord(value, code);
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(code);
  }
  return record;
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isAbsoluteWindowsOrNative(value) {
  return (
    typeof value === 'string' &&
    (path.isAbsolute(value) || path.win32.isAbsolute(value))
  );
}

function isInsideRepository(repositoryRoot, candidate) {
  const useWindows =
    path.win32.isAbsolute(repositoryRoot) && path.win32.isAbsolute(candidate);
  const library = useWindows ? path.win32 : path;
  const relative = library.relative(
    library.resolve(repositoryRoot),
    library.resolve(candidate)
  );
  return (
    relative === '' ||
    (!relative.startsWith(`..${library.sep}`) &&
      relative !== '..' &&
      !library.isAbsolute(relative))
  );
}

function canonicalSqlSet(repoRoot, relativeDirectory) {
  const absoluteDirectory = path.join(
    repoRoot,
    ...relativeDirectory.split('/')
  );
  const filenames = readdirSync(absoluteDirectory)
    .filter(filename => filename.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right, 'en'));
  const migrations = filenames.map(filename => {
    const match = filename.match(SQL_FILENAME_PATTERN);
    if (!match) fail('MIGRATION_FILENAME_INVALID');
    const contents = readFileSync(path.join(absoluteDirectory, filename));
    return {
      filename,
      version: match[1],
      sha256: sha256Bytes(contents),
    };
  });
  const canonical = migrations
    .map(migration => `${migration.sha256}  ${migration.filename}`)
    .join('\n');
  return {
    migrations,
    migrationSetSha256: sha256Bytes(`${canonical}\n`),
  };
}

export function readAndVerifyFrozenMigrationInventory(repoRootInput) {
  const repoRoot = requireString(repoRootInput, 'REPOSITORY_ROOT_INVALID');
  if (!isAbsoluteWindowsOrNative(repoRoot)) fail('REPOSITORY_ROOT_INVALID');
  const contractPath = path.join(repoRoot, ...MIGRATION_CONTRACT.split('/'));
  const contract = requireRecord(
    JSON.parse(readFileSync(contractPath, 'utf8')),
    'MIGRATION_INPUT_CONTRACT_INVALID'
  );
  const inventory = canonicalSqlSet(repoRoot, MIGRATION_DIRECTORY);
  const versions = inventory.migrations.map(migration => migration.version);
  if (new Set(versions).size !== versions.length) {
    fail('MIGRATION_VERSION_DUPLICATE');
  }
  const migrationHead = versions.at(-1);
  if (
    contract.schemaVersion !== 1 ||
    contract.status !== 'FROZEN_AT_BASE' ||
    contract.migrationCount !== inventory.migrations.length ||
    contract.migrationHead !== migrationHead ||
    contract.migrationSetSha256 !== inventory.migrationSetSha256 ||
    !SHA256_PATTERN.test(contract.migrationSetSha256)
  ) {
    fail('FROZEN_MIGRATION_INPUT_MISMATCH');
  }
  const mutationPolicy = requireRecord(
    contract.mutationPolicy,
    'MIGRATION_INPUT_CONTRACT_INVALID'
  );
  for (const field of [
    'migrationChangesAuthorized',
    'rollbackChangesAuthorized',
    'generatedTypesChangesAuthorized',
    'seedChangesAuthorized',
    'dependencyChangesAuthorized',
  ]) {
    if (mutationPolicy[field] !== false) {
      fail('MIGRATION_INPUT_MUTATION_AUTHORIZED');
    }
  }
  return {
    status: 'FROZEN_MIGRATION_INPUT_VERIFIED',
    migrationCount: inventory.migrations.length,
    migrationHead,
    migrationSetSha256: inventory.migrationSetSha256,
    migrations: inventory.migrations,
  };
}

export function buildExternalReplayInputManifest(input) {
  const request = requireExactKeys(
    input,
    ['repoRoot', 'externalWorkdir'],
    'EXTERNAL_REPLAY_INPUT_INVALID'
  );
  const repoRoot = requireString(
    request.repoRoot,
    'EXTERNAL_REPLAY_INPUT_INVALID'
  );
  const externalWorkdir = requireString(
    request.externalWorkdir,
    'EXTERNAL_REPLAY_INPUT_INVALID'
  );
  if (
    !isAbsoluteWindowsOrNative(repoRoot) ||
    !isAbsoluteWindowsOrNative(externalWorkdir) ||
    isInsideRepository(repoRoot, externalWorkdir)
  ) {
    fail('EXTERNAL_WORKDIR_REQUIRED');
  }
  const inventory = readAndVerifyFrozenMigrationInventory(repoRoot);
  const contract = requireRecord(
    JSON.parse(
      readFileSync(
        path.join(repoRoot, ...MIGRATION_CONTRACT.split('/')),
        'utf8'
      )
    ),
    'MIGRATION_INPUT_CONTRACT_INVALID'
  );
  const nonMigrationInputs = requireRecord(
    contract.nonMigrationInputs,
    'MIGRATION_INPUT_CONTRACT_INVALID'
  );
  const localConfig = requireExactKeys(
    nonMigrationInputs.localConfig,
    ['path', 'sha256', 'hostedConfigurationEvidence'],
    'LOCAL_CONFIG_INPUT_INVALID'
  );
  const configPath = path.join(repoRoot, ...localConfig.path.split('/'));
  const configSha256 = sha256Bytes(readFileSync(configPath));
  if (
    localConfig.hostedConfigurationEvidence !== false ||
    localConfig.sha256 !== configSha256
  ) {
    fail('LOCAL_CONFIG_INPUT_MISMATCH');
  }
  const files = [
    {
      sourceRelativePath: localConfig.path,
      destinationRelativePath: 'supabase/config.toml',
      sha256: configSha256,
    },
    ...inventory.migrations.map(migration => ({
      sourceRelativePath: `supabase/migrations/${migration.filename}`,
      destinationRelativePath: `supabase/migrations/${migration.filename}`,
      sha256: migration.sha256,
    })),
    ...REPLAY_SQL_ASSETS.map(filename => {
      const sourceRelativePath = `scripts/commercial-hardening/sql/${filename}`;
      return {
        sourceRelativePath,
        destinationRelativePath: `pr12/sql/${filename}`,
        sha256: sha256Bytes(
          readFileSync(path.join(repoRoot, ...sourceRelativePath.split('/')))
        ),
      };
    }),
  ];
  const manifestMaterial = {
    schemaVersion: 1,
    status: 'EXTERNAL_REPLAY_INPUT_READY_NOT_MATERIALIZED',
    fileCount: files.length,
    migrationCount: inventory.migrationCount,
    collectorSqlAssetCount: REPLAY_SQL_ASSETS.length,
    migrationHead: inventory.migrationHead,
    migrationSetSha256: inventory.migrationSetSha256,
    files,
    exclusions: [
      '.env',
      'supabase/.temp',
      'supabase/seed.sql',
      'supabase/tests',
    ],
  };
  return {
    ...manifestMaterial,
    repoRoot,
    externalWorkdir,
    manifestSha256: sha256Canonical(manifestMaterial),
  };
}

function validateExternalReplayManifestStructure(manifestInput) {
  const manifest = requireExactKeys(
    manifestInput,
    [
      'schemaVersion',
      'status',
      'fileCount',
      'migrationCount',
      'collectorSqlAssetCount',
      'migrationHead',
      'migrationSetSha256',
      'files',
      'exclusions',
      'repoRoot',
      'externalWorkdir',
      'manifestSha256',
    ],
    'EXTERNAL_REPLAY_MANIFEST_INVALID'
  );
  const files = requireArray(
    manifest.files,
    'EXTERNAL_REPLAY_MANIFEST_INVALID'
  );
  const exclusions = [
    '.env',
    'supabase/.temp',
    'supabase/seed.sql',
    'supabase/tests',
  ];
  const manifestMaterial = {
    schemaVersion: manifest.schemaVersion,
    status: manifest.status,
    fileCount: manifest.fileCount,
    migrationCount: manifest.migrationCount,
    collectorSqlAssetCount: manifest.collectorSqlAssetCount,
    migrationHead: manifest.migrationHead,
    migrationSetSha256: manifest.migrationSetSha256,
    files: manifest.files,
    exclusions: manifest.exclusions,
  };
  const relativePathPattern = /^[a-zA-Z0-9._/-]+$/;
  const normalizedFiles = files.map(fileInput => {
    const file = requireExactKeys(
      fileInput,
      ['sourceRelativePath', 'destinationRelativePath', 'sha256'],
      'EXTERNAL_REPLAY_MANIFEST_INVALID'
    );
    if (
      typeof file.sourceRelativePath !== 'string' ||
      typeof file.destinationRelativePath !== 'string' ||
      !SHA256_PATTERN.test(file.sha256) ||
      !relativePathPattern.test(file.sourceRelativePath) ||
      !relativePathPattern.test(file.destinationRelativePath) ||
      file.sourceRelativePath.startsWith('/') ||
      file.destinationRelativePath.startsWith('/') ||
      file.sourceRelativePath.includes('..') ||
      file.destinationRelativePath.includes('..')
    ) {
      fail('EXTERNAL_REPLAY_MANIFEST_INVALID');
    }
    return file;
  });
  const destinations = normalizedFiles.map(
    file => file.destinationRelativePath
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.status !== 'EXTERNAL_REPLAY_INPUT_READY_NOT_MATERIALIZED' ||
    files.length !== 65 ||
    manifest.fileCount !== files.length ||
    manifest.migrationCount !== 61 ||
    manifest.collectorSqlAssetCount !== 3 ||
    manifest.migrationHead !== '20260718011731' ||
    manifest.migrationSetSha256 !==
      '82aee8f14e126997b8361837587159a179964c460c0d3d18b975c3af17371c07' ||
    !SHA256_PATTERN.test(manifest.manifestSha256) ||
    manifest.manifestSha256 !== sha256Canonical(manifestMaterial) ||
    JSON.stringify(manifest.exclusions) !== JSON.stringify(exclusions) ||
    new Set(destinations).size !== destinations.length ||
    destinations.filter(destination =>
      destination.startsWith('supabase/migrations/')
    ).length !== 61 ||
    destinations.filter(destination => destination.startsWith('pr12/sql/'))
      .length !== 3 ||
    !destinations.includes('supabase/config.toml') ||
    !isAbsoluteWindowsOrNative(manifest.repoRoot) ||
    !isAbsoluteWindowsOrNative(manifest.externalWorkdir) ||
    isInsideRepository(manifest.repoRoot, manifest.externalWorkdir)
  ) {
    fail('EXTERNAL_REPLAY_MANIFEST_INVALID');
  }
  return { manifest, files: normalizedFiles };
}

export function projectExternalReplayInputManifest(manifestInput, resolver) {
  const { manifest } = validateExternalReplayManifestStructure(manifestInput);
  const projection = {
    schemaVersion: 1,
    status: 'EXTERNAL_REPLAY_INPUT_DURABLE_PROJECTION',
    fileCount: manifest.fileCount,
    migrationCount: manifest.migrationCount,
    collectorSqlAssetCount: manifest.collectorSqlAssetCount,
    migrationHead: manifest.migrationHead,
    migrationSetSha256: manifest.migrationSetSha256,
    manifestSha256: manifest.manifestSha256,
    repoRootFingerprint: fingerprintExternalPath(manifest.repoRoot, resolver),
    externalWorkdirFingerprint: fingerprintExternalPath(
      manifest.externalWorkdir,
      resolver
    ),
    rawPathsRetained: false,
  };
  return {
    ...projection,
    projectionSha256: sha256Canonical(projection),
  };
}

export function materializeExternalReplayInputs(manifestInput) {
  const { manifest, files } =
    validateExternalReplayManifestStructure(manifestInput);
  if (existsSync(manifest.externalWorkdir)) {
    fail('EXTERNAL_WORKDIR_NOT_NEW');
  }
  mkdirSync(manifest.externalWorkdir, { recursive: false });
  mkdirSync(path.join(manifest.externalWorkdir, 'supabase'), {
    recursive: false,
  });
  mkdirSync(path.join(manifest.externalWorkdir, 'supabase', 'migrations'), {
    recursive: false,
  });
  mkdirSync(path.join(manifest.externalWorkdir, 'pr12'), {
    recursive: false,
  });
  mkdirSync(path.join(manifest.externalWorkdir, 'pr12', 'sql'), {
    recursive: false,
  });
  for (const file of files) {
    const sourcePath = path.join(
      manifest.repoRoot,
      ...file.sourceRelativePath.split('/')
    );
    const destinationPath = path.join(
      manifest.externalWorkdir,
      ...file.destinationRelativePath.split('/')
    );
    if (
      lstatSync(sourcePath).isSymbolicLink() ||
      !lstatSync(sourcePath).isFile() ||
      sha256Bytes(readFileSync(sourcePath)) !== file.sha256
    ) {
      fail('EXTERNAL_REPLAY_SOURCE_DRIFT');
    }
    copyFileSync(sourcePath, destinationPath, constants.COPYFILE_EXCL);
    if (
      lstatSync(destinationPath).isSymbolicLink() ||
      !lstatSync(destinationPath).isFile() ||
      sha256Bytes(readFileSync(destinationPath)) !== file.sha256
    ) {
      fail('EXTERNAL_REPLAY_COPY_MISMATCH');
    }
  }
  return {
    status: 'EXTERNAL_REPLAY_INPUT_MATERIALIZED',
    fileCount: files.length,
    migrationCount: manifest.migrationCount,
    migrationHead: manifest.migrationHead,
    migrationSetSha256: manifest.migrationSetSha256,
    manifestSha256: manifest.manifestSha256,
    externalWorkdirFingerprint: fingerprintExternalPath(
      manifest.externalWorkdir
    ),
    rawPathsRetained: false,
    seedCopied: false,
    testsCopied: false,
    dotenvCopied: false,
    repositoryTempCopied: false,
  };
}

function normalizeDirectDatabaseUrl(valueInput) {
  const value = requireString(valueInput, 'DIRECT_DATABASE_URL_INVALID');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('DIRECT_DATABASE_URL_INVALID');
  }
  const projectRef = parsed.hostname.match(
    /^db\.([a-z]{20})\.supabase\.co$/i
  )?.[1];
  const searchKeys = [...parsed.searchParams.keys()];
  if (
    !projectRef ||
    !PROJECT_REF_PATTERN.test(projectRef) ||
    projectRef === PRODUCTION_PROJECT_REF ||
    parsed.username !== 'postgres' ||
    parsed.password !== '' ||
    parsed.port !== '5432' ||
    parsed.pathname !== '/postgres' ||
    parsed.hash !== '' ||
    searchKeys.length !== 2 ||
    new Set(searchKeys).size !== 2 ||
    !searchKeys.includes('sslmode') ||
    !searchKeys.includes('sslrootcert') ||
    parsed.searchParams.get('sslmode') !== 'verify-full' ||
    !parsed.searchParams.get('sslrootcert') ||
    parsed.hostname.includes('pooler')
  ) {
    fail(
      projectRef === PRODUCTION_PROJECT_REF
        ? 'PRODUCTION_CONTACT_DENIED'
        : parsed.password !== ''
          ? 'SECRET_BEARING_DATABASE_URL'
          : 'DIRECT_DATABASE_URL_INVALID'
    );
  }
  return parsed.toString();
}

function commandDescriptor(id, fields) {
  return {
    id,
    authorizedNow: false,
    executionStatus: 'NOT_RUN',
    wrapperRetryCount: 0,
    ...fields,
  };
}

export function buildSourceReplayCommandPlan(input) {
  const request = requireExactKeys(
    input,
    ['directDatabaseUrl', 'supabasePath', 'psqlPath', 'externalWorkdir'],
    'SOURCE_REPLAY_PLAN_INVALID'
  );
  for (const field of ['supabasePath', 'psqlPath', 'externalWorkdir']) {
    if (!isAbsoluteWindowsOrNative(request[field])) {
      fail('SOURCE_REPLAY_PLAN_INVALID');
    }
  }
  const databaseUrl = normalizeDirectDatabaseUrl(request.directDatabaseUrl);
  const commands = [
    commandDescriptor('PR12-CMD-003', {
      transport: 'IN_PROCESS_LOCAL_MATERIALIZATION',
      operation: 'MATERIALIZE_APPROVED_SOURCE_RUNTIME_METADATA',
      implementation:
        'buildExternalReplayInputManifest+materializeExternalReplayInputs',
      remoteContact: false,
      timeoutMs: 30_000,
    }),
    commandDescriptor('PR12-CMD-004', {
      transport: 'DIRECT_POSTGRES',
      operation: 'SOURCE_CLEAN_REPLAY_PRECONDITION',
      executable: request.psqlPath,
      args: [
        '--no-psqlrc',
        '--no-password',
        '--set',
        'ON_ERROR_STOP=1',
        '--dbname',
        databaseUrl,
        '--file',
        'pr12/sql/pr12-source-clean-replay-precondition.sql',
      ],
      cwd: request.externalWorkdir,
      mutation: false,
      timeoutMs: 60_000,
    }),
    commandDescriptor('PR12-CMD-005', {
      transport: 'DIRECT_POSTGRES_VIA_SUPABASE_CLI',
      operation: 'SOURCE_MIGRATION_REPLAY_DRY_RUN',
      executable: request.supabasePath,
      args: [
        'db',
        'push',
        '--dry-run',
        '--include-all',
        '--db-url',
        databaseUrl,
      ],
      cwd: request.externalWorkdir,
      mutation: false,
      timeoutMs: 300_000,
    }),
    commandDescriptor('PR12-CMD-006', {
      transport: 'DIRECT_POSTGRES_VIA_SUPABASE_CLI',
      operation: 'SOURCE_ADVISOR_BEFORE_CAPTURE',
      executable: request.supabasePath,
      args: [
        'db',
        'advisors',
        '--db-url',
        databaseUrl,
        '--type',
        'all',
        '--level',
        'info',
        '--fail-on',
        'error',
        '--output-format',
        'json',
      ],
      cwd: request.externalWorkdir,
      mutation: false,
      timeoutMs: 300_000,
    }),
    commandDescriptor('PR12-CMD-007', {
      transport: 'DIRECT_POSTGRES_VIA_SUPABASE_CLI',
      operation: 'CLEAN_MIGRATION_REPLAY_OPERATION',
      executable: request.supabasePath,
      args: ['db', 'push', '--include-all', '--yes', '--db-url', databaseUrl],
      cwd: request.externalWorkdir,
      mutation: true,
      timeoutMs: 900_000,
    }),
    commandDescriptor('PR12-CMD-007A', {
      transport: 'DIRECT_POSTGRES',
      operation: 'POST_REPLAY_CATALOG_CAPTURE',
      executable: request.psqlPath,
      args: [
        '--no-psqlrc',
        '--no-password',
        '--set',
        'ON_ERROR_STOP=1',
        '--dbname',
        databaseUrl,
        '--file',
        'pr12/sql/pr12-post-replay-catalog-capture.sql',
      ],
      cwd: request.externalWorkdir,
      mutation: false,
      timeoutMs: 300_000,
    }),
    commandDescriptor('PR12-CMD-008A', {
      transport: 'DIRECT_POSTGRES',
      operation: 'MIGRATION_HISTORY_PARITY',
      executable: request.psqlPath,
      args: [
        '--no-psqlrc',
        '--no-password',
        '--set',
        'ON_ERROR_STOP=1',
        '--dbname',
        databaseUrl,
        '--file',
        'pr12/sql/pr12-migration-history-parity.sql',
      ],
      cwd: request.externalWorkdir,
      mutation: false,
      timeoutMs: 60_000,
    }),
  ];
  if (
    commands.length !== SOURCE_REPLAY_COMMAND_SEQUENCE.length ||
    commands.some(
      (command, index) => command.id !== SOURCE_REPLAY_COMMAND_SEQUENCE[index]
    )
  ) {
    fail('SOURCE_REPLAY_COMMAND_SEQUENCE_MISMATCH');
  }
  const serialized = JSON.stringify(commands);
  if (
    serialized.includes('"link"') ||
    serialized.includes('--linked') ||
    /postgres(?:ql)?:\/\/[^/\s"'@]+:[^@\s"']+@/i.test(serialized)
  ) {
    fail('SOURCE_REPLAY_PLAN_SECRET_OR_LINKED_TARGET');
  }
  return {
    status: 'SOURCE_REPLAY_PLAN_READY_NOT_AUTHORIZED',
    authorizedNow: false,
    executionStatus: 'NOT_RUN',
    mandatoryStopAfter: 'PR12-CMD-008A',
    representativeSeedAuthorized: false,
    commands,
  };
}

export function buildPostApplyReplayRecoveryCommandPlan(input) {
  const fullPlan = buildSourceReplayCommandPlan(input);
  const commands = fullPlan.commands.filter(command =>
    ['PR12-CMD-007A', 'PR12-CMD-008A'].includes(command.id)
  );
  if (
    commands.length !== 2 ||
    commands[0]?.id !== 'PR12-CMD-007A' ||
    commands[1]?.id !== 'PR12-CMD-008A' ||
    commands.some(command => command.mutation !== false)
  ) {
    fail('SOURCE_REPLAY_POST_APPLY_RECOVERY_PLAN_INVALID');
  }
  return {
    status: 'SOURCE_REPLAY_POST_APPLY_RECOVERY_PLAN_READY_NOT_AUTHORIZED',
    authorizedNow: false,
    executionStatus: 'NOT_RUN',
    wrapperRetryCount: 0,
    migrationApplyRedispatchAllowed: false,
    commands,
  };
}

function normalizedUniqueRecords(valuesInput, keys, code, keyBuilder) {
  const values = requireArray(valuesInput, code).map(value =>
    requireExactKeys(value, keys, code)
  );
  const keyed = values.map(value => ({
    value,
    key: keyBuilder(value),
  }));
  if (
    keyed.some(item => item.key.length === 0) ||
    new Set(keyed.map(item => item.key)).size !== keyed.length
  ) {
    fail(code);
  }
  keyed.sort((left, right) => left.key.localeCompare(right.key, 'en'));
  return keyed.map(item => item.value);
}

function compileObservedSettingValues(settings, prefix, code) {
  const values = [
    ...new Set(
      settings
        .filter(setting => setting.setting.startsWith(prefix))
        .map(setting => setting.setting.slice(prefix.length))
    ),
  ];
  if (
    values.length !== 1 ||
    typeof values[0] !== 'string' ||
    values[0].length === 0
  ) {
    fail(values.length === 0 ? `${code}_NOT_OBSERVED` : `${code}_CONFLICT`);
  }
  return values[0];
}

function compileObservedGraphqlIntrospection(settings) {
  const values = [
    ...new Set(
      settings
        .filter(setting => {
          const separator = setting.setting.indexOf('=');
          const key =
            separator < 0
              ? setting.setting
              : setting.setting.slice(0, separator);
          return key.startsWith('graphql.') && key.includes('introspection');
        })
        .map(setting => setting.setting.slice(setting.setting.indexOf('=') + 1))
        .map(value => value.toLowerCase())
    ),
  ];
  if (values.length === 0) fail('GRAPHQL_INTROSPECTION_NOT_OBSERVED');
  if (values.length !== 1) fail('GRAPHQL_INTROSPECTION_CONFLICT');
  if (['true', 'on', '1'].includes(values[0])) return true;
  if (['false', 'off', '0'].includes(values[0])) return false;
  fail('GRAPHQL_INTROSPECTION_INVALID');
}

export function compileFreshCatalogSnapshotFromSqlObservation(input) {
  const request = requireExactKeys(
    input,
    ['projectRef', 'databaseSystemIdentifier', 'capturedAt', 'observation'],
    'CATALOG_SQL_OBSERVATION_INVALID'
  );
  const observation = requireExactKeys(
    request.observation,
    [
      'schemaVersion',
      'operation',
      'relations',
      'routines',
      'authTargets',
      'databasePlatformSettings',
      'graphqlDatabaseObservation',
    ],
    'CATALOG_SQL_OBSERVATION_INVALID'
  );
  if (
    observation.schemaVersion !== 1 ||
    observation.operation !== 'POST_REPLAY_CATALOG_CAPTURE'
  ) {
    fail('CATALOG_SQL_OBSERVATION_INVALID');
  }
  const settings = normalizedUniqueRecords(
    observation.databasePlatformSettings,
    ['role', 'setting'],
    'CATALOG_PLATFORM_SETTING_INVALID',
    value => {
      if (
        typeof value.role !== 'string' ||
        value.role.length === 0 ||
        typeof value.setting !== 'string' ||
        value.setting.length === 0 ||
        !value.setting.includes('=')
      ) {
        fail('CATALOG_PLATFORM_SETTING_INVALID');
      }
      return `${value.role}\u0000${value.setting}`;
    }
  );
  const exposedSchemasText = compileObservedSettingValues(
    settings,
    'pgrst.db_schemas=',
    'DATA_API_CONFIGURATION'
  );
  const exposedSchemas = exposedSchemasText
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);
  if (
    exposedSchemas.length === 0 ||
    new Set(exposedSchemas).size !== exposedSchemas.length
  ) {
    fail('DATA_API_CONFIGURATION_INVALID');
  }
  const graphqlObservation = requireExactKeys(
    observation.graphqlDatabaseObservation,
    ['extensionEnabled', 'defaultAssumed'],
    'GRAPHQL_CONFIGURATION_INVALID'
  );
  if (
    typeof graphqlObservation.extensionEnabled !== 'boolean' ||
    graphqlObservation.defaultAssumed !== false
  ) {
    fail('GRAPHQL_CONFIGURATION_INVALID');
  }
  const snapshot = {
    schemaVersion: 1,
    projectRef: request.projectRef,
    databaseSystemIdentifier: request.databaseSystemIdentifier,
    capturedAt: request.capturedAt,
    relations: observation.relations,
    routines: observation.routines,
    authTargets: observation.authTargets,
    dataApi: {
      exposedSchemas,
      defaultExposureAssumed: false,
    },
    graphql: {
      enabled: graphqlObservation.extensionEnabled,
      introspectionEnabled: compileObservedGraphqlIntrospection(settings),
      defaultAssumed: false,
    },
  };
  const verification = validateFreshCatalogSnapshot(snapshot);
  return {
    status: 'FRESH_CATALOG_SQL_OBSERVATION_COMPILED',
    implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
    executionStatus: 'NOT_RUN',
    executionAuthorized: false,
    remoteContactPerformed: false,
    snapshot,
    verification,
  };
}

export function compileFunctionalReplayCatalogFromSqlObservation(input) {
  const request = requireExactKeys(
    input,
    ['projectRef', 'databaseSystemIdentifier', 'capturedAt', 'observation'],
    'CATALOG_SQL_OBSERVATION_INVALID'
  );
  const observation = requireExactKeys(
    request.observation,
    [
      'schemaVersion',
      'operation',
      'relations',
      'routines',
      'authTargets',
      'databasePlatformSettings',
      'graphqlDatabaseObservation',
    ],
    'CATALOG_SQL_OBSERVATION_INVALID'
  );
  if (
    observation.schemaVersion !== 1 ||
    observation.operation !== 'POST_REPLAY_CATALOG_CAPTURE'
  ) {
    fail('CATALOG_SQL_OBSERVATION_INVALID');
  }
  const settings = normalizedUniqueRecords(
    observation.databasePlatformSettings,
    ['role', 'setting'],
    'CATALOG_PLATFORM_SETTING_INVALID',
    value => {
      if (
        typeof value.role !== 'string' ||
        value.role.length === 0 ||
        typeof value.setting !== 'string' ||
        value.setting.length === 0 ||
        !value.setting.includes('=')
      ) {
        fail('CATALOG_PLATFORM_SETTING_INVALID');
      }
      return `${value.role}\u0000${value.setting}`;
    }
  );
  const exposedSchemaValues = [
    ...new Set(
      settings
        .filter(setting => setting.setting.startsWith('pgrst.db_schemas='))
        .map(setting => setting.setting.slice('pgrst.db_schemas='.length))
    ),
  ];
  if (exposedSchemaValues.length > 1) {
    fail('DATA_API_CONFIGURATION_CONFLICT');
  }
  let exposedSchemas = null;
  if (exposedSchemaValues.length === 1) {
    exposedSchemas = exposedSchemaValues[0]
      .split(',')
      .map(value => value.trim())
      .filter(value => value.length > 0);
    if (
      exposedSchemas.length === 0 ||
      new Set(exposedSchemas).size !== exposedSchemas.length
    ) {
      fail('DATA_API_CONFIGURATION_INVALID');
    }
  }
  const introspectionValues = [
    ...new Set(
      settings
        .filter(setting => {
          const separator = setting.setting.indexOf('=');
          const key = setting.setting.slice(0, separator);
          return key.startsWith('graphql.') && key.includes('introspection');
        })
        .map(setting => setting.setting.slice(setting.setting.indexOf('=') + 1))
        .map(value => value.toLowerCase())
    ),
  ];
  if (introspectionValues.length > 1) {
    fail('GRAPHQL_INTROSPECTION_CONFLICT');
  }
  let introspectionEnabled = null;
  if (introspectionValues.length === 1) {
    if (['true', 'on', '1'].includes(introspectionValues[0])) {
      introspectionEnabled = true;
    } else if (['false', 'off', '0'].includes(introspectionValues[0])) {
      introspectionEnabled = false;
    } else {
      fail('GRAPHQL_INTROSPECTION_INVALID');
    }
  }
  const graphqlObservation = requireExactKeys(
    observation.graphqlDatabaseObservation,
    ['extensionEnabled', 'defaultAssumed'],
    'GRAPHQL_CONFIGURATION_INVALID'
  );
  if (
    typeof graphqlObservation.extensionEnabled !== 'boolean' ||
    graphqlObservation.defaultAssumed !== false
  ) {
    fail('GRAPHQL_CONFIGURATION_INVALID');
  }
  const coreVerification = validateFreshCatalogSnapshot({
    schemaVersion: 1,
    projectRef: request.projectRef,
    databaseSystemIdentifier: request.databaseSystemIdentifier,
    capturedAt: request.capturedAt,
    relations: observation.relations,
    routines: observation.routines,
    authTargets: observation.authTargets,
    dataApi: {
      exposedSchemas: exposedSchemas ?? [],
      defaultExposureAssumed: false,
    },
    graphql: {
      enabled: graphqlObservation.extensionEnabled,
      introspectionEnabled: introspectionEnabled ?? false,
      defaultAssumed: false,
    },
  });
  const hostedApiConfigurationQualification =
    exposedSchemas === null || introspectionEnabled === null
      ? 'DEFERRED_UNVERIFIED'
      : 'VERIFIED';
  const snapshot = {
    schemaVersion: 1,
    projectRef: request.projectRef,
    databaseSystemIdentifier: request.databaseSystemIdentifier,
    capturedAt: new Date(request.capturedAt).toISOString(),
    relations: observation.relations,
    routines: observation.routines,
    authTargets: observation.authTargets,
    dataApi: {
      verification: exposedSchemas === null ? 'UNVERIFIED' : 'VERIFIED',
      exposedSchemas,
      reason:
        exposedSchemas === null ? 'DATABASE_ROLE_SETTING_NOT_OBSERVED' : null,
      defaultExposureAssumed: false,
    },
    graphql: {
      enabled: graphqlObservation.extensionEnabled,
      introspectionVerification:
        introspectionEnabled === null ? 'UNVERIFIED' : 'VERIFIED',
      introspectionEnabled,
      reason:
        introspectionEnabled === null
          ? 'DATABASE_ROLE_SETTING_NOT_OBSERVED'
          : null,
      defaultAssumed: false,
    },
  };
  return {
    status: 'FUNCTIONAL_REPLAY_CATALOG_SQL_OBSERVATION_COMPILED',
    implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
    executionStatus: 'NOT_RUN',
    executionAuthorized: false,
    remoteContactPerformed: false,
    snapshot,
    verification: {
      status: 'FUNCTIONAL_REPLAY_CATALOG_VERIFIED',
      relationCount: coreVerification.relationCount,
      routineCount: coreVerification.routineCount,
      authTargetCount: coreVerification.authTargetCount,
      hostedApiConfigurationQualification,
      catalogSha256: sha256Canonical(snapshot),
    },
  };
}

export function validateFreshCatalogSnapshot(input) {
  const snapshot = requireExactKeys(
    input,
    [
      'schemaVersion',
      'projectRef',
      'databaseSystemIdentifier',
      'capturedAt',
      'relations',
      'routines',
      'authTargets',
      'dataApi',
      'graphql',
    ],
    'CATALOG_SNAPSHOT_INVALID'
  );
  if (
    snapshot.schemaVersion !== 1 ||
    !PROJECT_REF_PATTERN.test(snapshot.projectRef) ||
    snapshot.projectRef === PRODUCTION_PROJECT_REF ||
    !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
    snapshot.databaseSystemIdentifier === 'NOT_CAPTURED'
  ) {
    fail(
      snapshot.projectRef === PRODUCTION_PROJECT_REF
        ? 'PRODUCTION_CONTACT_DENIED'
        : 'CATALOG_SNAPSHOT_INVALID'
    );
  }
  const relations = normalizedUniqueRecords(
    snapshot.relations,
    ['schema', 'name', 'kind', 'rlsEnabled'],
    'CATALOG_RELATION_INVALID',
    value => {
      if (
        typeof value.schema !== 'string' ||
        typeof value.name !== 'string' ||
        !['table', 'view', 'materialized_view', 'partitioned_table'].includes(
          value.kind
        ) ||
        typeof value.rlsEnabled !== 'boolean'
      ) {
        fail('CATALOG_RELATION_INVALID');
      }
      return `${value.schema}.${value.name}.${value.kind}`;
    }
  );
  const routines = normalizedUniqueRecords(
    snapshot.routines,
    ['schema', 'name', 'identityArguments', 'securityDefiner'],
    'CATALOG_ROUTINE_INVALID',
    value => {
      if (
        typeof value.schema !== 'string' ||
        typeof value.name !== 'string' ||
        typeof value.identityArguments !== 'string' ||
        typeof value.securityDefiner !== 'boolean'
      ) {
        fail('CATALOG_ROUTINE_INVALID');
      }
      return `${value.schema}.${value.name}(${value.identityArguments})`;
    }
  );
  const authTargets = normalizedUniqueRecords(
    snapshot.authTargets,
    ['schema', 'name', 'kind'],
    'CATALOG_AUTH_TARGET_INVALID',
    value => {
      if (
        value.schema !== 'auth' ||
        typeof value.name !== 'string' ||
        !['table', 'view', 'routine'].includes(value.kind)
      ) {
        fail('CATALOG_AUTH_TARGET_INVALID');
      }
      return `${value.schema}.${value.name}.${value.kind}`;
    }
  );
  const dataApi = requireExactKeys(
    snapshot.dataApi,
    ['exposedSchemas', 'defaultExposureAssumed'],
    'DATA_API_CONFIGURATION_INVALID'
  );
  const exposedSchemas = requireArray(
    dataApi.exposedSchemas,
    'DATA_API_CONFIGURATION_INVALID'
  );
  if (
    dataApi.defaultExposureAssumed !== false ||
    exposedSchemas.some(
      schema => typeof schema !== 'string' || schema.length === 0
    ) ||
    new Set(exposedSchemas).size !== exposedSchemas.length
  ) {
    fail('DATA_API_CONFIGURATION_INVALID');
  }
  const graphql = requireExactKeys(
    snapshot.graphql,
    ['enabled', 'introspectionEnabled', 'defaultAssumed'],
    'GRAPHQL_CONFIGURATION_INVALID'
  );
  if (
    typeof graphql.enabled !== 'boolean' ||
    typeof graphql.introspectionEnabled !== 'boolean' ||
    graphql.defaultAssumed !== false
  ) {
    fail('GRAPHQL_CONFIGURATION_INVALID');
  }
  const normalized = {
    schemaVersion: 1,
    projectRef: snapshot.projectRef,
    databaseSystemIdentifier: snapshot.databaseSystemIdentifier,
    capturedAt: new Date(snapshot.capturedAt).toISOString(),
    relations,
    routines,
    authTargets,
    dataApi: {
      exposedSchemas: [...exposedSchemas].sort((left, right) =>
        left.localeCompare(right, 'en')
      ),
      defaultExposureAssumed: false,
    },
    graphql: {
      enabled: graphql.enabled,
      introspectionEnabled: graphql.introspectionEnabled,
      defaultAssumed: false,
    },
  };
  return {
    status: 'FRESH_CATALOG_SHAPE_VERIFIED',
    relationCount: relations.length,
    routineCount: routines.length,
    authTargetCount: authTargets.length,
    catalogSha256: sha256Canonical(normalized),
  };
}

export function validateMigrationHistoryParity(
  observedVersionsInput,
  inventoryInput
) {
  const observedVersions = requireArray(
    observedVersionsInput,
    'MIGRATION_HISTORY_INVALID'
  );
  const inventory = requireRecord(
    inventoryInput,
    'MIGRATION_INVENTORY_INVALID'
  );
  const migrations = requireArray(
    inventory.migrations,
    'MIGRATION_INVENTORY_INVALID'
  );
  const expectedVersions = migrations.map(migration => {
    const record = requireRecord(migration, 'MIGRATION_INVENTORY_INVALID');
    return requireString(record.version, 'MIGRATION_INVENTORY_INVALID');
  });
  if (
    observedVersions.length !== expectedVersions.length ||
    observedVersions.some(
      (version, index) =>
        typeof version !== 'string' || version !== expectedVersions[index]
    )
  ) {
    fail('MIGRATION_HISTORY_ORDER_MISMATCH');
  }
  return {
    status: 'MIGRATION_HISTORY_PARITY',
    migrationCount: expectedVersions.length,
    migrationHead: expectedVersions.at(-1),
    migrationSetSha256: inventory.migrationSetSha256,
  };
}
