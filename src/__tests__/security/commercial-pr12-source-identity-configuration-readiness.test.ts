import * as fs from 'node:fs';
import * as path from 'node:path';

import { repoRoot, runPr12Module } from './pr12-local-module-test-helpers';

const MODULE =
  'scripts/commercial-hardening/pr12-source-identity-configuration-contract.mjs';
const CA_SHA = 'a'.repeat(64);
const RAW_SHA = 'b'.repeat(64);
const PROJECT_REF = 'abcdefghijklmnopqrst';
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const DIRECT_URL =
  `postgresql://postgres@${DIRECT_HOST}:5432/postgres` +
  '?sslmode=verify-full&sslrootcert=C%3A%5Cpr12%5Cca.pem';

function evaluate(source: string) {
  return runPr12Module(MODULE, source);
}

function readinessInput(overrides = ''): string {
  return `{
    target: {
      projectRef: ${JSON.stringify(PROJECT_REF)},
      projectUrl: ${JSON.stringify(`https://${PROJECT_REF}.supabase.co`)},
      directHost: ${JSON.stringify(DIRECT_HOST)},
      directDatabaseUrl: ${JSON.stringify(DIRECT_URL)},
      caBundle: {
        path: "C:\\\\pr12\\\\ca.pem",
        sha256: ${JSON.stringify(CA_SHA)}
      }
    },
    runtime: {
      psqlPath: "C:\\\\Program Files\\\\PostgreSQL\\\\17\\\\bin\\\\psql.exe",
      externalWorkdir: "C:\\\\tmp\\\\pr12-source-identity",
      isolatedEnvironmentKeys: [
        "DO_NOT_TRACK",
        "SUPABASE_TELEMETRY_DISABLED",
        "SUPABASE_HOME",
        "SUPABASE_NO_KEYRING",
        "DOCKER_CONFIG",
        "SystemRoot",
        "TEMP",
        "TMP",
        "PATH",
        "PGPASSWORD"
      ],
      shell: false,
      stdin: "ignore",
      wrapperRetryCount: 0,
      maxDispatchesPerObservation: 1
    }
    ${overrides}
  }`;
}

function validObservation(overrides = ''): string {
  return `{
    commandId: "PR12-CMD-004A",
    projectRef: ${JSON.stringify(PROJECT_REF)},
    projectUrl: ${JSON.stringify(`https://${PROJECT_REF}.supabase.co`)},
    directHost: ${JSON.stringify(DIRECT_HOST)},
    database: {
      databaseName: "postgres",
      databaseUser: "postgres",
      connectionMode: "DIRECT",
      systemIdentifier: "7662783869098430503",
      postgresVersion: "17.6",
      serverVersionNum: "170006",
      databaseUtc: "2026-07-26T01:02:03.456Z"
    },
    configurationFamilies: {
      DATA_API: {
        transport: "PROVIDER_NATIVE_READ_ONLY",
        enabled: true,
        serviceHealthy: true,
        directEndpointReachable: true,
        exposedSchemas: ["public", "storage"],
        automaticallyExposeNewTablesAndFunctions: false,
        rawObservationSha256: ${JSON.stringify(RAW_SHA)}
      },
      AUTH: {
        transport: "PROVIDER_NATIVE_READ_ONLY",
        anonymousSignInEnabled: false,
        emailProviderConfigured: true,
        smsProviderConfigured: false,
        oauthProvidersEnabled: ["google"],
        realEmailSmsOrOAuthDeliveryConfigured: false,
        rawObservationSha256: ${JSON.stringify(RAW_SHA)}
      },
      GRAPHQL: {
        transport: "DIRECT_POSTGRES_READ_ONLY",
        installedVersion: "1.5.11",
        enabled: true,
        configuredApiSchemas: ["public"],
        exposedSchemas: ["public"],
        introspectionEnabled: false,
        rawObservationSha256: ${JSON.stringify(RAW_SHA)}
      }
    },
    observedAt: "2026-07-26T01:02:04.000Z",
    mandatoryStopObserved: true
    ${overrides}
  }`;
}

describe('PR12-CMD-004A source identity/configuration readiness', () => {
  test('compiles the exact fail-closed read-only observation plan without executing it', () => {
    const result = evaluate(`
      const plan = subject.compileSourceIdentityConfigurationReadiness(
        ${readinessInput()}
      );
      process.stdout.write(JSON.stringify(plan));
    `);

    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout) as {
      implementationStatus: string;
      executionStatus: string;
      executionAuthorized: boolean;
      remoteContactPerformed: boolean;
      commandId: string;
      observationSequence: Array<{
        id: string;
        transport: string;
        mutating: boolean;
        maxDispatchCount: number;
        wrapperRetryCount: number;
      }>;
      directPostgresCommand: {
        executable: string;
        args: string[];
        childProcess: {
          shell: boolean;
          stdin: string;
          inheritParentEnvironment: boolean;
        };
      };
      mandatoryStop: {
        stopAfterCommandId: string;
        automaticContinuationAuthorized: boolean;
        nextCommandAuthorized: boolean;
      };
    };

    expect(plan).toMatchObject({
      implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
      executionStatus: 'NOT_RUN',
      executionAuthorized: false,
      remoteContactPerformed: false,
      commandId: 'PR12-CMD-004A',
      mandatoryStop: {
        stopAfterCommandId: 'PR12-CMD-004A',
        automaticContinuationAuthorized: false,
        nextCommandAuthorized: false,
      },
    });
    expect(plan.observationSequence.map(item => item.id)).toEqual([
      'DIRECT_POSTGRES_IDENTITY_CLOCK',
      'DATA_API_CONFIGURATION',
      'AUTH_CONFIGURATION',
      'GRAPHQL_CONFIGURATION',
    ]);
    expect(
      plan.observationSequence.every(
        item =>
          item.mutating === false &&
          item.maxDispatchCount === 1 &&
          item.wrapperRetryCount === 0
      )
    ).toBe(true);
    expect(plan.directPostgresCommand.executable).toMatch(/psql\.exe$/i);
    expect(plan.directPostgresCommand.args).toContain('-X');
    expect(plan.directPostgresCommand.args).toContain('-w');
    expect(plan.directPostgresCommand.args).toContain('ON_ERROR_STOP=1');
    expect(plan.directPostgresCommand.args).toContain(DIRECT_URL);
    expect(plan.directPostgresCommand.childProcess).toEqual({
      shell: false,
      stdin: 'ignore',
      inheritParentEnvironment: false,
    });
    expect(JSON.stringify(plan)).not.toMatch(
      /(?:password|bearer|supabase_access_token|fetch\()/i
    );
  });

  test.each([
    [
      'password-bearing URL',
      DIRECT_URL.replace('postgres@', 'postgres:secret@'),
      'SECRET_BEARING_DATABASE_URL',
    ],
    [
      'pooler host',
      DIRECT_URL.replace(
        DIRECT_HOST,
        'aws-0-ap-northeast-1.pooler.supabase.com'
      ),
      'DIRECT_DATABASE_TARGET_INVALID',
    ],
    [
      'TLS weakening',
      DIRECT_URL.replace('verify-full', 'require'),
      'DIRECT_DATABASE_URL_INVALID',
    ],
    [
      'unbound CA',
      DIRECT_URL.replace('C%3A%5Cpr12%5Cca.pem', 'C%3A%5Cother.pem'),
      'CA_BUNDLE_URL_MISMATCH',
    ],
    [
      'production project',
      DIRECT_URL.replace(PROJECT_REF, 'qnanuoqveidwvacvbhqp'),
      'PRODUCTION_CONTACT_DENIED',
    ],
  ])('rejects %s before any dispatch', (_label, url, code) => {
    const result = evaluate(`
      try {
        subject.compileSourceIdentityConfigurationReadiness({
          ...${readinessInput()},
          target: {
            ...${readinessInput()}.target,
            directDatabaseUrl: ${JSON.stringify(url)}
          }
        });
      } catch (error) {
        process.stderr.write(error instanceof Error ? error.message : String(error));
        process.exit(23);
      }
    `);

    expect(result.status).toBe(23);
    expect(result.stderr).toContain(code);
  });

  test.each([
    [
      'ambient credential',
      'SUPABASE_ACCESS_TOKEN',
      0,
      1,
      'AMBIENT_ENVIRONMENT_FORBIDDEN',
    ],
    ['wrapper retry', 'PGPASSWORD', 1, 1, 'WRAPPER_RETRY_FORBIDDEN'],
    ['multi dispatch', 'PGPASSWORD', 0, 2, 'MULTIPLE_DISPATCH_FORBIDDEN'],
  ])(
    'rejects %s in the child-process contract',
    (_label, extraKey, retries, dispatches, code) => {
      const result = evaluate(`
        const input = ${readinessInput()};
        input.runtime.isolatedEnvironmentKeys = [
          ...input.runtime.isolatedEnvironmentKeys,
          ${JSON.stringify(extraKey)}
        ];
        input.runtime.wrapperRetryCount = ${retries};
        input.runtime.maxDispatchesPerObservation = ${dispatches};
        try {
          subject.compileSourceIdentityConfigurationReadiness(input);
        } catch (error) {
          process.stderr.write(error instanceof Error ? error.message : String(error));
          process.exit(24);
        }
      `);

      expect(result.status).toBe(24);
      expect(result.stderr).toContain(code);
    }
  );

  test('validates all three configuration families and emits only hashed provider-safe evidence', () => {
    const result = evaluate(`
      const projection = subject.validateAndProjectSourceIdentityObservation(
        ${validObservation()}
      );
      process.stdout.write(JSON.stringify(projection));
    `);

    expect(result.status).toBe(0);
    const projection = JSON.parse(result.stdout) as {
      status: string;
      commandId: string;
      projectRef: string;
      database: {
        systemIdentifier: string;
        postgresVersion: string;
        databaseUtc: string;
      };
      configurationFamilies: Record<
        string,
        {
          projectionSha256: string;
          rawObservationSha256: string;
          rawPayloadRetained: boolean;
          secretValuesCaptured: boolean;
        }
      >;
      projectionSha256: string;
    };

    expect(projection).toMatchObject({
      status: 'VALIDATED_PROVIDER_SAFE_PROJECTION',
      commandId: 'PR12-CMD-004A',
      projectRef: PROJECT_REF,
      database: {
        systemIdentifier: '7662783869098430503',
        postgresVersion: '17.6',
        databaseUtc: '2026-07-26T01:02:03.456Z',
      },
    });
    expect(Object.keys(projection.configurationFamilies)).toEqual([
      'AUTH',
      'DATA_API',
      'GRAPHQL',
    ]);
    for (const family of Object.values(projection.configurationFamilies)) {
      expect(family.projectionSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(family.rawObservationSha256).toBe(RAW_SHA);
      expect(family.rawPayloadRetained).toBe(false);
      expect(family.secretValuesCaptured).toBe(false);
    }
    expect(projection.projectionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(projection)).not.toMatch(
      /(?:providerPayload|responseBody|accessToken|password|authorization)/i
    );
  });

  test('binds a captured system identifier only to the approved readiness target', () => {
    const otherRef = 'zzzzzzzzzzzzzzzzzzzz';
    const result = evaluate(`
      const plan = subject.compileSourceIdentityConfigurationReadiness(
        ${readinessInput()}
      );
      const observation = ${validObservation()};
      observation.projectRef = ${JSON.stringify(otherRef)};
      observation.projectUrl = ${JSON.stringify(
        `https://${otherRef}.supabase.co`
      )};
      observation.directHost = ${JSON.stringify(`db.${otherRef}.supabase.co`)};
      const projection =
        subject.validateAndProjectSourceIdentityObservation(observation);
      try {
        subject.assertSourceIdentityObservationMatchesReadiness(
          plan,
          projection
        );
      } catch (error) {
        process.stderr.write(error instanceof Error ? error.message : String(error));
        process.exit(27);
      }
    `);

    expect(result.status).toBe(27);
    expect(result.stderr).toContain('APPROVED_TARGET_MISMATCH');
  });

  test.each([
    [
      'project/host mismatch',
      `input.directHost = "db.zzzzzzzzzzzzzzzzzzzz.supabase.co";`,
      'DIRECT_DATABASE_TARGET_INVALID',
    ],
    [
      'system identifier',
      `input.database.systemIdentifier = "unknown";`,
      'SYSTEM_IDENTIFIER_INVALID',
    ],
    [
      'Postgres version',
      `input.database.serverVersionNum = "160006";`,
      'POSTGRES_VERSION_INVALID',
    ],
    [
      'database UTC',
      `input.database.databaseUtc = "2026-07-26T10:02:03+09:00";`,
      'DATABASE_UTC_INVALID',
    ],
    [
      'mandatory stop',
      `input.mandatoryStopObserved = false;`,
      'MANDATORY_STOP_NOT_OBSERVED',
    ],
    [
      'unknown family',
      `input.configurationFamilies.STORAGE = {};`,
      'CONFIGURATION_FAMILIES_INVALID',
    ],
    [
      'missing role-shaping observation',
      `delete input.configurationFamilies.AUTH.anonymousSignInEnabled;`,
      'AUTH_CONFIGURATION_INVALID',
    ],
    [
      'duplicate exposed schema',
      `input.configurationFamilies.DATA_API.exposedSchemas = ["public", "public"];`,
      'DATA_API_CONFIGURATION_INVALID',
    ],
  ])('rejects invalid %s evidence', (_label, mutation, code) => {
    const result = evaluate(`
      const input = ${validObservation()};
      ${mutation}
      try {
        subject.validateAndProjectSourceIdentityObservation(input);
      } catch (error) {
        process.stderr.write(error instanceof Error ? error.message : String(error));
        process.exit(25);
      }
    `);

    expect(result.status).toBe(25);
    expect(result.stderr).toContain(code);
  });

  test('rejects raw payloads, secret-shaped fields, and secret-bearing strings', () => {
    const result = evaluate(`
      const candidates = [
        {...${validObservation()}, providerPayload: {enabled: true}},
        (() => {
          const input = ${validObservation()};
          input.configurationFamilies.AUTH.accessToken = "sbp_example_secret_material";
          return input;
        })(),
        (() => {
          const input = ${validObservation()};
          input.configurationFamilies.AUTH.oauthProvidersEnabled = [
            "Bearer abc.def.ghi"
          ];
          return input;
        })()
      ];
      const messages = [];
      for (const candidate of candidates) {
        try {
          subject.validateAndProjectSourceIdentityObservation(candidate);
        } catch (error) {
          messages.push(error instanceof Error ? error.message : String(error));
        }
      }
      process.stdout.write(JSON.stringify(messages));
    `);

    expect(result.status).toBe(0);
    const messages = JSON.parse(result.stdout) as string[];
    expect(messages).toHaveLength(3);
    expect(messages[0]).toBe('SOURCE_IDENTITY_OBSERVATION_INVALID');
    expect(messages[1]).toBe('AUTH_CONFIGURATION_INVALID');
    expect(messages[2]).toBe('SECRET_BEARING_OBSERVATION');
  });

  test('rejects a tampered provider-safe projection hash', () => {
    const result = evaluate(`
      const projection = subject.validateAndProjectSourceIdentityObservation(
        ${validObservation()}
      );
      projection.database.postgresVersion = "17.7";
      try {
        subject.assertSourceIdentityProjectionIntegrity(projection);
      } catch (error) {
        process.stderr.write(error instanceof Error ? error.message : String(error));
        process.exit(26);
      }
    `);

    expect(result.status).toBe(26);
    expect(result.stderr).toContain('PROJECTION_HASH_MISMATCH');
  });

  test('module is inert and cannot perform provider contact or credential loading', () => {
    const source = fs.readFileSync(path.join(repoRoot, ...MODULE.split('/')), {
      encoding: 'utf8',
    });

    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/from\s+['"]@supabase\//);
    expect(source).not.toMatch(/from\s+['"]dotenv/);
    expect(source).not.toMatch(/\bspawn(?:Sync)?\s*\(/);
    expect(source).not.toMatch(/\bexec(?:File)?(?:Sync)?\s*\(/);
  });
});
