/** @jest-environment node */

import { runPr12Module } from './pr12-local-module-test-helpers';

const replayModule =
  'scripts/commercial-hardening/pr12-source-replay-catalog-contract.mjs';

describe('PR12 source replay and catalog readiness', () => {
  it('matches the exact 61-migration frozen input set', () => {
    const result = runPr12Module(
      replayModule,
      `
const inventory = subject.readAndVerifyFrozenMigrationInventory(process.cwd());
console.log(JSON.stringify(inventory));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'FROZEN_MIGRATION_INPUT_VERIFIED',
      migrationCount: 61,
      migrationHead: '20260718011731',
      migrationSetSha256:
        '82aee8f14e126997b8361837587159a179964c460c0d3d18b975c3af17371c07',
    });
  });

  it('freezes config, 61 migrations, and three read-only SQL assets only', () => {
    const result = runPr12Module(
      replayModule,
      `
const manifest = subject.buildExternalReplayInputManifest({
  repoRoot: process.cwd(),
  externalWorkdir: 'C:\\\\external-pr12'
});
console.log(JSON.stringify(manifest));
`
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as {
      status: string;
      fileCount: number;
      migrationCount: number;
      collectorSqlAssetCount: number;
      files: ReadonlyArray<{ destinationRelativePath: string }>;
      exclusions: readonly string[];
      manifestSha256: string;
    };
    expect(output).toMatchObject({
      status: 'EXTERNAL_REPLAY_INPUT_READY_NOT_MATERIALIZED',
      fileCount: 65,
      migrationCount: 61,
      collectorSqlAssetCount: 3,
      exclusions: [
        '.env',
        'supabase/.temp',
        'supabase/seed.sql',
        'supabase/tests',
      ],
    });
    expect(output.files[0]?.destinationRelativePath).toBe(
      'supabase/config.toml'
    );
    expect(
      output.files.filter(file =>
        file.destinationRelativePath.startsWith('supabase/migrations/')
      )
    ).toHaveLength(61);
    expect(
      output.files.filter(file =>
        file.destinationRelativePath.startsWith('pr12/sql/')
      )
    ).toHaveLength(3);
    expect(JSON.stringify(output)).not.toContain('seed.sql","sha256');
    expect(output.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('projects replay paths to durable fingerprints without raw paths', () => {
    const result = runPr12Module(
      replayModule,
      `
const rawRepoRoot = process.cwd();
const rawExternalWorkdir = 'C:\\\\external-pr12';
const manifest = subject.buildExternalReplayInputManifest({
  repoRoot: rawRepoRoot,
  externalWorkdir: rawExternalWorkdir
});
const projection = subject.projectExternalReplayInputManifest(
  manifest,
  value => value
);
console.log(JSON.stringify({ rawRepoRoot, rawExternalWorkdir, projection }));
`
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as {
      rawRepoRoot: string;
      rawExternalWorkdir: string;
      projection: {
        status: string;
        rawPathsRetained: boolean;
        projectionSha256: string;
        repoRootFingerprint: {
          pathSha256: string;
          resolvedPathSha256: string;
        };
        externalWorkdirFingerprint: {
          pathSha256: string;
          resolvedPathSha256: string;
        };
      };
    };
    expect(output.projection).toMatchObject({
      status: 'EXTERNAL_REPLAY_INPUT_DURABLE_PROJECTION',
      rawPathsRetained: false,
      repoRootFingerprint: {
        pathSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        resolvedPathSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      externalWorkdirFingerprint: {
        pathSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        resolvedPathSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    const durable = JSON.stringify(output.projection);
    expect(durable).not.toContain(output.rawRepoRoot);
    expect(durable).not.toContain(output.rawExternalWorkdir);
    expect(durable).not.toContain('C:\\\\');
    expect(output.projection.projectionSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds the exact Stage 3 sequence without link or linked flags', () => {
    const result = runPr12Module(
      replayModule,
      `
const plan = subject.buildSourceReplayCommandPlan({
  directDatabaseUrl: 'postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Csecure%5Croot.crt',
  supabasePath: 'C:\\\\tools\\\\supabase.exe',
  psqlPath: 'C:\\\\pgsql\\\\psql.exe',
  externalWorkdir: 'C:\\\\external-pr12'
});
console.log(JSON.stringify(plan));
`
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as {
      status: string;
      commands: ReadonlyArray<{
        id: string;
        executable?: string;
        args?: readonly string[];
        timeoutMs?: number;
      }>;
    };
    expect(output.status).toBe('SOURCE_REPLAY_PLAN_READY_NOT_AUTHORIZED');
    expect(output.commands.map(command => command.id)).toEqual([
      'PR12-CMD-003',
      'PR12-CMD-004',
      'PR12-CMD-005',
      'PR12-CMD-006',
      'PR12-CMD-007',
      'PR12-CMD-007A',
      'PR12-CMD-008A',
    ]);
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('supabase link');
    expect(serialized).not.toContain('--linked');
    expect(serialized).not.toContain(':secret@');
    expect(serialized).toContain('--db-url');
    expect(serialized).toContain('verify-full');
    const psqlCommands = output.commands.filter(command =>
      command.executable?.toLowerCase().endsWith('psql.exe')
    );
    expect(psqlCommands).toHaveLength(3);
    for (const command of psqlCommands) {
      expect(command.args).toContain('--no-password');
    }
    expect(
      output.commands.find(command => command.id === 'PR12-CMD-007')?.timeoutMs
    ).toBe(900000);
    const manifest = JSON.parse(
      runPr12Module(
        replayModule,
        `
console.log(JSON.stringify(subject.buildExternalReplayInputManifest({
  repoRoot: process.cwd(),
  externalWorkdir: 'C:\\\\external-pr12'
})));
`
      ).stdout
    ) as {
      files: ReadonlyArray<{ destinationRelativePath: string }>;
    };
    const materializedPaths = new Set(
      manifest.files.map(file => file.destinationRelativePath)
    );
    const referencedSqlFiles = output.commands.flatMap(command => {
      const fileIndex = command.args?.indexOf('--file') ?? -1;
      return fileIndex >= 0 && command.args
        ? [command.args[fileIndex + 1]]
        : [];
    });
    expect(referencedSqlFiles).toHaveLength(3);
    for (const referencedFile of referencedSqlFiles) {
      expect(materializedPaths.has(referencedFile)).toBe(true);
    }
  });

  it('builds a post-apply recovery plan that cannot dispatch migration apply again', () => {
    const result = runPr12Module(
      replayModule,
      `
const plan = subject.buildPostApplyReplayRecoveryCommandPlan({
  directDatabaseUrl: 'postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Csecure%5Croot.crt',
  supabasePath: 'C:\\\\tools\\\\supabase.exe',
  psqlPath: 'C:\\\\pgsql\\\\psql.exe',
  externalWorkdir: 'C:\\\\external-pr12'
});
console.log(JSON.stringify(plan));
`
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as {
      status: string;
      commands: ReadonlyArray<{ id: string; mutation: boolean }>;
    };
    expect(output.status).toBe(
      'SOURCE_REPLAY_POST_APPLY_RECOVERY_PLAN_READY_NOT_AUTHORIZED'
    );
    expect(output.commands.map(command => command.id)).toEqual([
      'PR12-CMD-007A',
      'PR12-CMD-008A',
    ]);
    expect(output.commands.every(command => command.mutation === false)).toBe(
      true
    );
    expect(JSON.stringify(output)).not.toContain('PR12-CMD-007"');
  });

  it('validates fresh catalog shape and rejects reordered migration history', () => {
    const result = runPr12Module(
      replayModule,
      `
const inventory = subject.readAndVerifyFrozenMigrationInventory(process.cwd());
const catalog = subject.validateFreshCatalogSnapshot({
  schemaVersion: 1,
  projectRef: 'abcdefghijklmnopqrst',
  databaseSystemIdentifier: 'source-system-001',
  capturedAt: '2026-07-26T01:00:00.000Z',
  relations: [{ schema: 'public', name: 'staff', kind: 'table', rlsEnabled: true }],
  routines: [{ schema: 'public', name: 'example', identityArguments: '', securityDefiner: false }],
  authTargets: [{ schema: 'auth', name: 'users', kind: 'table' }],
  dataApi: { exposedSchemas: ['public'], defaultExposureAssumed: false },
  graphql: { enabled: false, introspectionEnabled: false, defaultAssumed: false }
});
const valid = subject.validateMigrationHistoryParity(
  inventory.migrations.map(migration => migration.version),
  inventory
);
let reordered = 'NOT_REJECTED';
const changed = inventory.migrations.map(migration => migration.version);
[changed[0], changed[1]] = [changed[1], changed[0]];
try {
  subject.validateMigrationHistoryParity(changed, inventory);
} catch (error) {
  reordered = error.message;
}
console.log(JSON.stringify({ catalog, valid, reordered }));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      catalog: {
        status: 'FRESH_CATALOG_SHAPE_VERIFIED',
        relationCount: 1,
      },
      valid: {
        status: 'MIGRATION_HISTORY_PARITY',
        migrationCount: 61,
      },
      reordered: 'MIGRATION_HISTORY_ORDER_MISMATCH',
    });
  });

  it('maps the exact SQL observation into fail-closed catalog evidence', () => {
    const result = runPr12Module(
      replayModule,
      `
const compiled = subject.compileFreshCatalogSnapshotFromSqlObservation({
  projectRef: 'abcdefghijklmnopqrst',
  databaseSystemIdentifier: 'source-system-001',
  capturedAt: '2026-07-26T01:00:00.000Z',
  observation: {
    schemaVersion: 1,
    operation: 'POST_REPLAY_CATALOG_CAPTURE',
    relations: [{ schema: 'public', name: 'staff', kind: 'table', rlsEnabled: true }],
    routines: [{ schema: 'public', name: 'example', identityArguments: '', securityDefiner: false }],
    authTargets: [{ schema: 'auth', name: 'users', kind: 'table' }],
    databasePlatformSettings: [
      { role: 'authenticator', setting: 'pgrst.db_schemas=public' },
      { role: 'authenticator', setting: 'graphql.introspection_enabled=false' }
    ],
    graphqlDatabaseObservation: { extensionEnabled: true, defaultAssumed: false }
  }
});
const failures = {};
for (const [name, settings] of Object.entries({
  missingDataApi: [{ role: 'authenticator', setting: 'graphql.introspection_enabled=false' }],
  conflictingDataApi: [
    { role: 'authenticator', setting: 'pgrst.db_schemas=public' },
    { role: 'postgres', setting: 'pgrst.db_schemas=public,private' },
    { role: 'authenticator', setting: 'graphql.introspection_enabled=false' }
  ],
  missingIntrospection: [{ role: 'authenticator', setting: 'pgrst.db_schemas=public' }]
})) {
  try {
    subject.compileFreshCatalogSnapshotFromSqlObservation({
      projectRef: 'abcdefghijklmnopqrst',
      databaseSystemIdentifier: 'source-system-001',
      capturedAt: '2026-07-26T01:00:00.000Z',
      observation: {
        schemaVersion: 1,
        operation: 'POST_REPLAY_CATALOG_CAPTURE',
        relations: [],
        routines: [],
        authTargets: [],
        databasePlatformSettings: settings,
        graphqlDatabaseObservation: { extensionEnabled: false, defaultAssumed: false }
      }
    });
  } catch (error) {
    failures[name] = error.message;
  }
}
console.log(JSON.stringify({ compiled, failures }));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      compiled: {
        status: 'FRESH_CATALOG_SQL_OBSERVATION_COMPILED',
        executionStatus: 'NOT_RUN',
        executionAuthorized: false,
        remoteContactPerformed: false,
        snapshot: {
          dataApi: {
            exposedSchemas: ['public'],
            defaultExposureAssumed: false,
          },
          graphql: {
            enabled: true,
            introspectionEnabled: false,
            defaultAssumed: false,
          },
        },
        verification: {
          status: 'FRESH_CATALOG_SHAPE_VERIFIED',
          relationCount: 1,
        },
      },
      failures: {
        missingDataApi: 'DATA_API_CONFIGURATION_NOT_OBSERVED',
        conflictingDataApi: 'DATA_API_CONFIGURATION_CONFLICT',
        missingIntrospection: 'GRAPHQL_INTROSPECTION_NOT_OBSERVED',
      },
    });
  });

  it('separates functional replay catalog proof from unobservable hosted API settings', () => {
    const result = runPr12Module(
      replayModule,
      `
const compiled = subject.compileFunctionalReplayCatalogFromSqlObservation({
  projectRef: 'abcdefghijklmnopqrst',
  databaseSystemIdentifier: 'source-system-001',
  capturedAt: '2026-08-02T04:30:15.000Z',
  observation: {
    schemaVersion: 1,
    operation: 'POST_REPLAY_CATALOG_CAPTURE',
    relations: [{ schema: 'public', name: 'staff', kind: 'table', rlsEnabled: true }],
    routines: [{ schema: 'public', name: 'example', identityArguments: '', securityDefiner: false }],
    authTargets: [{ schema: 'auth', name: 'users', kind: 'table' }],
    databasePlatformSettings: [],
    graphqlDatabaseObservation: { extensionEnabled: true, defaultAssumed: false }
  }
});
console.log(JSON.stringify(compiled));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'FUNCTIONAL_REPLAY_CATALOG_SQL_OBSERVATION_COMPILED',
      snapshot: {
        dataApi: {
          verification: 'UNVERIFIED',
          exposedSchemas: null,
          reason: 'DATABASE_ROLE_SETTING_NOT_OBSERVED',
          defaultExposureAssumed: false,
        },
        graphql: {
          enabled: true,
          introspectionVerification: 'UNVERIFIED',
          introspectionEnabled: null,
          reason: 'DATABASE_ROLE_SETTING_NOT_OBSERVED',
          defaultAssumed: false,
        },
      },
      verification: {
        status: 'FUNCTIONAL_REPLAY_CATALOG_VERIFIED',
        relationCount: 1,
        hostedApiConfigurationQualification: 'DEFERRED_UNVERIFIED',
      },
    });
  });

  it('rejects the protected production project in plans and catalog evidence', () => {
    const result = runPr12Module(
      replayModule,
      `
const rejected = {};
try {
  subject.buildSourceReplayCommandPlan({
    directDatabaseUrl: 'postgresql://postgres@db.qnanuoqveidwvacvbhqp.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Csecure%5Croot.crt',
    supabasePath: 'C:\\\\tools\\\\supabase.exe',
    psqlPath: 'C:\\\\pgsql\\\\psql.exe',
    externalWorkdir: 'C:\\\\external-pr12'
  });
} catch (error) {
  rejected.plan = error.message;
}
try {
  subject.validateFreshCatalogSnapshot({
    schemaVersion: 1,
    projectRef: 'qnanuoqveidwvacvbhqp',
    databaseSystemIdentifier: 'production-system-001',
    capturedAt: '2026-07-26T01:00:00.000Z',
    relations: [],
    routines: [],
    authTargets: [],
    dataApi: { exposedSchemas: ['public'], defaultExposureAssumed: false },
    graphql: { enabled: false, introspectionEnabled: false, defaultAssumed: false }
  });
} catch (error) {
  rejected.catalog = error.message;
}
console.log(JSON.stringify(rejected));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      plan: 'PRODUCTION_CONTACT_DENIED',
      catalog: 'PRODUCTION_CONTACT_DENIED',
    });
  });
});
