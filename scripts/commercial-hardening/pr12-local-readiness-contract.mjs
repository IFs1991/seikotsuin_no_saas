import {
  PINNED_PR12_TOOLCHAIN,
  SOURCE_REPLAY_COMMAND_SEQUENCE,
  assertStageRuntimeBinding,
} from './pr12-stage-command-runtime.mjs';
import {
  compileFreshCatalogSnapshotFromSqlObservation,
  readAndVerifyFrozenMigrationInventory,
} from './pr12-source-replay-catalog-contract.mjs';
import { compareHostedTypes } from './pr12-hosted-types-parity.mjs';
import {
  buildAdvisorCommandDescriptor,
  diffAdvisorSnapshots,
  normalizeAdvisorSnapshot,
} from './pr12-advisor-diff.mjs';
import {
  REPRESENTATIVE_FIXTURE_ACTOR_TOPOLOGY_SHA256,
  REPRESENTATIVE_FIXTURE_PAYLOAD_AGGREGATE_SHA256,
  compileRepresentativeFixturePlan,
} from './pr12-representative-fixture-contract.mjs';
import {
  createRepresentativeFixtureAdapterReadiness,
  validateRepresentativeFixtureAdapterReadiness,
} from './pr12-representative-fixture-adapter.mjs';
import { compileAllRoleSmokePlan } from './pr12-all-role-smoke-contract.mjs';
import {
  createAllRoleSmokeReadinessEnvelope,
  validateAllRoleSmokeReadinessEnvelope,
} from './pr12-all-role-smoke-adapter.mjs';
import { compileSourceIdentityConfigurationReadiness } from './pr12-source-identity-configuration-contract.mjs';

const FIXTURE_PLAN_SHA256 =
  'a2446817c50b1d2ada0c4701acedc7abd2e00623c2ba503873f325a78d421028';
const SMOKE_PLAN_SHA256 =
  '2574c864141b1028b711595600f49cf5053554884941c07fc5786d3b61ebf8e3';
const MIGRATION_SET_SHA256 =
  '82aee8f14e126997b8361837587159a179964c460c0d3d18b975c3af17371c07';
const SAFE_PROJECT_REF = 'abcdefghijklmnopqrst';
const SAFE_DIRECT_HOST = `db.${SAFE_PROJECT_REF}.supabase.co`;
const SAFE_BINDING_SHA256 = 'b'.repeat(64);
const SAFE_GIT_COMMIT = 'c'.repeat(40);
const SAFE_DATABASE_SYSTEM_IDENTIFIER = '7662783869098430503';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyPinnedConstants() {
  assert(
    PINNED_PR12_TOOLCHAIN.supabase.version === '2.109.0' &&
      PINNED_PR12_TOOLCHAIN.supabase.sha256 ===
        '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118' &&
      PINNED_PR12_TOOLCHAIN.supabaseGo.version === '2.109.0' &&
      PINNED_PR12_TOOLCHAIN.supabaseGo.sha256 ===
        '59cd06ac674fdf5d6add75206408ada0a24b1dcb796d099c13b1f2aaf3f463f0' &&
      PINNED_PR12_TOOLCHAIN.psql.version === '17.9' &&
      PINNED_PR12_TOOLCHAIN.psql.sha256 ===
        '6a4b5cd854ee1c0e50646e7612a9e769c9ae86aa97bf94c50342dad058c2b531',
    'PR12 local readiness toolchain drift'
  );
  assert(
    JSON.stringify(SOURCE_REPLAY_COMMAND_SEQUENCE) ===
      JSON.stringify([
        'PR12-CMD-003',
        'PR12-CMD-004',
        'PR12-CMD-005',
        'PR12-CMD-006',
        'PR12-CMD-007',
        'PR12-CMD-007A',
        'PR12-CMD-008A',
      ]),
    'PR12 local readiness source replay order drift'
  );
}

function verifyStageRuntimeBindingReadiness() {
  const caBundle = {
    path: 'C:\\pr12\\ca.pem',
    sha256: 'a'.repeat(64),
  };
  return assertStageRuntimeBinding(
    {
      schemaVersion: 1,
      status: 'APPROVED_NOT_EXECUTED',
      approval: { expiresAt: '2026-07-27T00:00:00.000Z' },
      target: {
        gitCommit: SAFE_GIT_COMMIT,
        projectRef: SAFE_PROJECT_REF,
        directHost: SAFE_DIRECT_HOST,
        directDatabaseUrl:
          `postgresql://postgres@${SAFE_DIRECT_HOST}:5432/postgres` +
          '?sslmode=verify-full&sslrootcert=C%3A%5Cpr12%5Cca.pem',
        databaseSystemIdentifier: SAFE_DATABASE_SYSTEM_IDENTIFIER,
        caBundle,
      },
      productionDenylist: {
        projectRefs: ['qnanuoqveidwvacvbhqp'],
        hosts: ['db.qnanuoqveidwvacvbhqp.supabase.co'],
        databaseSystemIdentifiers: ['production-system-denied'],
      },
      commandSequence: SOURCE_REPLAY_COMMAND_SEQUENCE,
    },
    {
      currentHead: SAFE_GIT_COMMIT,
      now: '2026-07-26T00:00:00.000Z',
      expectedCommandSequence: SOURCE_REPLAY_COMMAND_SEQUENCE,
      caBundleObservation: caBundle,
    }
  );
}

function verifySourceIdentityReadiness() {
  const readiness = compileSourceIdentityConfigurationReadiness({
    target: {
      projectRef: SAFE_PROJECT_REF,
      projectUrl: `https://${SAFE_PROJECT_REF}.supabase.co`,
      directHost: SAFE_DIRECT_HOST,
      directDatabaseUrl:
        `postgresql://postgres@${SAFE_DIRECT_HOST}:5432/postgres` +
        '?sslmode=verify-full&sslrootcert=C%3A%5Cpr12%5Cca.pem',
      caBundle: {
        path: 'C:\\pr12\\ca.pem',
        sha256: 'a'.repeat(64),
      },
    },
    runtime: {
      psqlPath: 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
      externalWorkdir: 'C:\\tmp\\pr12-source-identity',
      isolatedEnvironmentKeys: [
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
      ],
      shell: false,
      stdin: 'ignore',
      wrapperRetryCount: 0,
      maxDispatchesPerObservation: 1,
    },
  });
  assert(
    readiness.implementationStatus === 'IMPLEMENTED_OFFLINE_VERIFIED' &&
      readiness.executionStatus === 'NOT_RUN' &&
      readiness.executionAuthorized === false &&
      readiness.remoteContactPerformed === false &&
      readiness.commandId === 'PR12-CMD-004A' &&
      readiness.mandatoryStop.automaticContinuationAuthorized === false,
    'PR12-CMD-004A readiness drift'
  );
  return readiness;
}

function verifyFixtureAndSmokeReadiness() {
  const fixture = compileRepresentativeFixturePlan();
  assert(
    fixture.planSha256 === FIXTURE_PLAN_SHA256 &&
      fixture.plan.rows.explicitTotal === 83 &&
      fixture.plan.rows.derivedTotal === 12 &&
      fixture.plan.rows.snapshotTotal === 95 &&
      fixture.plan.payloadIdentity.aggregateSha256 ===
        REPRESENTATIVE_FIXTURE_PAYLOAD_AGGREGATE_SHA256 &&
      fixture.plan.payloadIdentity.actorTopologySha256 ===
        REPRESENTATIVE_FIXTURE_ACTOR_TOPOLOGY_SHA256,
    'PR12 representative fixture readiness drift'
  );
  const fixtureAdapter = createRepresentativeFixtureAdapterReadiness(
    fixture.planSha256
  );
  validateRepresentativeFixtureAdapterReadiness(fixtureAdapter);

  const smoke = compileAllRoleSmokePlan(fixture.planSha256);
  assert(
    smoke.planSha256 === SMOKE_PLAN_SHA256 &&
      smoke.plan.restCases.length === 14 &&
      smoke.plan.browserCases.length === 16,
    'PR12 all-role smoke readiness drift'
  );
  const smokeReadiness = createAllRoleSmokeReadinessEnvelope(
    fixture.planSha256,
    smoke.planSha256
  );
  validateAllRoleSmokeReadinessEnvelope(smokeReadiness);
  return { fixture, fixtureAdapter, smoke, smokeReadiness };
}

function verifyTypesReadiness() {
  const typeText =
    'export type Json = string | number | boolean | null\n' +
    'export type Database = { public: { Tables: {} } }\n';
  return compareHostedTypes({
    generatedTypes: typeText,
    committedTypes: typeText,
    projectRef: SAFE_PROJECT_REF,
    bindingSha256: SAFE_BINDING_SHA256,
    gitCommit: SAFE_GIT_COMMIT,
    databaseSystemIdentifier: SAFE_DATABASE_SYSTEM_IDENTIFIER,
  });
}

function verifyCatalogCompilerReadiness() {
  return compileFreshCatalogSnapshotFromSqlObservation({
    projectRef: SAFE_PROJECT_REF,
    databaseSystemIdentifier: SAFE_DATABASE_SYSTEM_IDENTIFIER,
    capturedAt: '2026-07-26T00:00:00.000Z',
    observation: {
      schemaVersion: 1,
      operation: 'POST_REPLAY_CATALOG_CAPTURE',
      relations: [
        {
          schema: 'public',
          name: 'staff',
          kind: 'table',
          rlsEnabled: true,
        },
      ],
      routines: [],
      authTargets: [{ schema: 'auth', name: 'users', kind: 'table' }],
      databasePlatformSettings: [
        { role: 'authenticator', setting: 'pgrst.db_schemas=public' },
        {
          role: 'authenticator',
          setting: 'graphql.introspection_enabled=false',
        },
      ],
      graphqlDatabaseObservation: {
        extensionEnabled: false,
        defaultAssumed: false,
      },
    },
  });
}

function verifyAdvisorReadiness() {
  const commandInput = {
    supabasePath: 'C:\\pr12\\supabase.exe',
    directDatabaseUrl:
      `postgresql://postgres@${SAFE_DIRECT_HOST}:5432/postgres` +
      '?sslmode=verify-full&sslrootcert=C%3A%5Cpr12%5Cca.pem',
    externalWorkdir: 'C:\\pr12\\external-workdir',
  };
  const beforeCommand = buildAdvisorCommandDescriptor({
    ...commandInput,
    commandId: 'PR12-CMD-006',
  });
  const afterCommand = buildAdvisorCommandDescriptor({
    ...commandInput,
    commandId: 'PR12-CMD-016',
  });
  const common = {
    schemaVersion: 1,
    bindingSha256: SAFE_BINDING_SHA256,
    projectRef: SAFE_PROJECT_REF,
    databaseSystemIdentifier: SAFE_DATABASE_SYSTEM_IDENTIFIER,
    category: 'all',
    findings: [],
  };
  const before = normalizeAdvisorSnapshot({
    ...common,
    commandId: 'PR12-CMD-006',
    capturedAt: '2026-07-26T00:00:00.000Z',
  });
  const after = normalizeAdvisorSnapshot({
    ...common,
    commandId: 'PR12-CMD-016',
    capturedAt: '2026-07-26T00:00:01.000Z',
  });
  return {
    beforeCommand,
    afterCommand,
    diff: diffAdvisorSnapshots(before, after),
  };
}

export function verifyPr12LocalReadinessContracts(repositoryRoot) {
  verifyPinnedConstants();
  const runtimeBinding = verifyStageRuntimeBindingReadiness();
  const migration = readAndVerifyFrozenMigrationInventory(repositoryRoot);
  assert(
    migration.migrationCount === 61 &&
      migration.migrationHead === '20260718011731' &&
      migration.migrationSetSha256 === MIGRATION_SET_SHA256,
    'PR12 local readiness migration inventory drift'
  );
  const identity = verifySourceIdentityReadiness();
  const catalog = verifyCatalogCompilerReadiness();
  const fixtureAndSmoke = verifyFixtureAndSmokeReadiness();
  const types = verifyTypesReadiness();
  const advisor = verifyAdvisorReadiness();
  assert(
    types.status === 'GENERATED_TYPES_PARITY' &&
      advisor.beforeCommand.commandId === 'PR12-CMD-006' &&
      advisor.afterCommand.commandId === 'PR12-CMD-016' &&
      advisor.beforeCommand.executionStatus === 'NOT_RUN' &&
      advisor.afterCommand.executionStatus === 'NOT_RUN' &&
      advisor.diff.status === 'ADVISOR_DIFF_PASS' &&
      runtimeBinding.status === 'RUNTIME_BINDING_VERIFIED' &&
      catalog.status === 'FRESH_CATALOG_SQL_OBSERVATION_COMPILED' &&
      catalog.executionStatus === 'NOT_RUN' &&
      catalog.executionAuthorized === false &&
      catalog.remoteContactPerformed === false,
    'PR12 local readiness collector drift'
  );
  return {
    status: 'PR12_LOCAL_READINESS_CONTRACTS_PASS',
    executionStatus: 'NOT_RUN',
    executionAuthorized: false,
    remoteContactPerformed: false,
    identityCommandId: identity.commandId,
    runtimeBindingStatus: runtimeBinding.status,
    migrationCount: migration.migrationCount,
    migrationSetSha256: migration.migrationSetSha256,
    catalogCompilerStatus: catalog.status,
    fixturePlanSha256: fixtureAndSmoke.fixture.planSha256,
    smokePlanSha256: fixtureAndSmoke.smoke.planSha256,
    typesStatus: types.status,
    advisorStatus: advisor.diff.status,
    commGateStatus: fixtureAndSmoke.smokeReadiness.commGateStatus,
  };
}
