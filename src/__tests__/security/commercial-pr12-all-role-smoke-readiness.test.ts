/** @jest-environment node */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(__dirname, '../../..');
const fixtureContractPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-representative-fixture-contract.mjs'
);
const smokeContractPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-all-role-smoke-contract.mjs'
);
const smokeAdapterPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-all-role-smoke-adapter.mjs'
);
const fixtureContractUrl = pathToFileURL(fixtureContractPath).href;
const smokeContractUrl = pathToFileURL(smokeContractPath).href;
const smokeAdapterUrl = pathToFileURL(smokeAdapterPath).href;

type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null;

interface HarnessResult {
  ok: boolean;
  code?: string;
  value?: JsonValue;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: JsonValue | undefined): JsonObject {
  expect(isJsonObject(value)).toBe(true);
  if (!isJsonObject(value)) throw new Error('expected a JSON object');
  return value;
}

function cloneJson(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function invokeModule(
  moduleUrl: string,
  method: string,
  args: JsonValue[] = []
): HarnessResult {
  const harness = `
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    try {
      const module = await import(input.moduleUrl);
      const value = await module[input.method](...input.args);
      process.stdout.write(JSON.stringify({ ok: true, value }));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' ? error.code : 'UNEXPECTED_ERROR';
      process.stdout.write(JSON.stringify({ ok: false, code }));
      process.exitCode = 2;
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', harness],
    {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
      input: JSON.stringify({ moduleUrl, method, args }),
      encoding: 'utf8',
    }
  );

  expect(result.stderr).toBe('');
  const parsed: unknown = JSON.parse(result.stdout);
  expect(isJsonObject(parsed)).toBe(true);
  if (!isJsonObject(parsed) || typeof parsed.ok !== 'boolean') {
    throw new Error('all-role smoke harness returned an invalid result');
  }
  return {
    ok: parsed.ok,
    ...(typeof parsed.code === 'string' ? { code: parsed.code } : {}),
    ...(parsed.value !== undefined ? { value: parsed.value as JsonValue } : {}),
  };
}

function fixturePlanSha256(): string {
  const compiled = requireObject(
    invokeModule(fixtureContractUrl, 'compileRepresentativeFixturePlan').value
  );
  return String(compiled.planSha256);
}

function invokeSmokeLocalExecutor(
  mode: 'success' | 'cross-tenant-leak' | 'secret-result'
): HarnessResult {
  const harness = `
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    let dispatchCount = 0;
    const fingerprint = '3'.repeat(64);
    try {
      const fixtureContract = await import(input.fixtureContractUrl);
      const smokeContract = await import(input.smokeContractUrl);
      const smokeAdapter = await import(input.smokeAdapterUrl);
      const fixture = fixtureContract.compileRepresentativeFixturePlan();
      const smoke = smokeContract.compileAllRoleSmokePlan(
        fixture.planSha256
      );
      const adapterPlan = smokeAdapter.compileAllRoleSmokeAdapterPlan(
        smoke.plan,
        smoke.planSha256
      );
      const count = () => {
        dispatchCount += 1;
      };
      const value = await smokeAdapter.executeAllRoleSmokeLocalContract(
        adapterPlan,
        {
          authSignIn: async () => {
            count();
            if (input.mode === 'secret-result') {
              return {
                outcome: 'SIGNED_IN',
                fingerprintSha256: fingerprint,
                rawJwt: 'eyJheader.payload.signature'
              };
            }
            return {
              outcome: 'SIGNED_IN',
              fingerprintSha256: fingerprint
            };
          },
          authRefresh: async () => {
            count();
            return {
              outcome: 'REFRESHED',
              fingerprintSha256: fingerprint
            };
          },
          authProfile: async operation => {
            count();
            return {
              outcome: 'PROFILE_MATCHED',
              role: operation.role,
              clinicCount: operation.actorId === 'no-clinic-staff' ? 0 : 1,
              fingerprintSha256: fingerprint
            };
          },
          restStaffSelect: async operation => {
            count();
            const crossTenantLeak =
              input.mode === 'cross-tenant-leak' &&
              operation.expectedRows === 0;
            return {
              outcome: 'ROW_COUNT',
              rowCount: crossTenantLeak ? 1 : operation.expectedRows,
              fingerprintSha256: fingerprint
            };
          },
          browserRoute: async operation => {
            count();
            return {
              outcome: operation.expected,
              fingerprintSha256: fingerprint
            };
          },
          serviceRoleClientBoundary: async operation => {
            count();
            return {
              outcome: operation.expected,
              fingerprintSha256: fingerprint
            };
          }
        }
      );
      process.stdout.write(JSON.stringify({
        ok: true,
        value: { ...value, dispatchCount }
      }));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' ? error.code : 'UNEXPECTED_ERROR';
      process.stdout.write(JSON.stringify({
        ok: false,
        code,
        value: { dispatchCount }
      }));
      process.exitCode = 2;
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', harness],
    {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
      input: JSON.stringify({
        fixtureContractUrl,
        smokeContractUrl,
        smokeAdapterUrl,
        mode,
      }),
      encoding: 'utf8',
    }
  );
  expect(result.stderr).toBe('');
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isJsonObject(parsed) || typeof parsed.ok !== 'boolean') {
    throw new Error('smoke local executor harness returned invalid output');
  }
  return {
    ok: parsed.ok,
    ...(typeof parsed.code === 'string' ? { code: parsed.code } : {}),
    ...(parsed.value !== undefined ? { value: parsed.value as JsonValue } : {}),
  };
}

describe('PR12 all-role smoke readiness contract', () => {
  test('freezes all eight role classes and the seven real application actors', () => {
    const compiled = invokeModule(smokeContractUrl, 'compileAllRoleSmokePlan', [
      fixturePlanSha256(),
    ]);
    expect(compiled.ok).toBe(true);
    const plan = requireObject(requireObject(compiled.value).plan);

    expect(plan.roleClasses).toEqual([
      'anon',
      'authenticated',
      'service_role',
      'admin',
      'clinic_admin',
      'manager',
      'therapist',
      'staff',
    ]);
    expect(plan.applicationRoles).toEqual([
      'admin',
      'clinic_admin',
      'manager',
      'therapist',
      'staff',
    ]);
    expect(plan.actorIds).toEqual([
      'tenant-a-admin',
      'tenant-a-clinic-admin',
      'tenant-a-manager',
      'tenant-a-therapist',
      'tenant-a-staff',
      'tenant-b-staff',
      'no-clinic-staff',
    ]);
    expect(plan.restTargetBinding).toEqual({
      relation: 'public.staff',
      catalogSource: 'PR12-CMD-007A_FRESH_POST_REPLAY_CATALOG',
      ownerClassificationRequired: true,
      dataApiExposure: 'OBSERVE_DO_NOT_ASSUME',
      grants: 'OBSERVE_DO_NOT_ASSUME',
      rlsRequired: true,
      missingOrAmbiguous: 'ABORT',
    });
  });

  test('freezes 14 public.staff REST cases and 16 browser cases', () => {
    const compiled = requireObject(
      invokeModule(smokeContractUrl, 'compileAllRoleSmokePlan', [
        fixturePlanSha256(),
      ]).value
    );
    const plan = requireObject(compiled.plan);
    const restCases = plan.restCases;
    const browserCases = plan.browserCases;

    expect(Array.isArray(restCases)).toBe(true);
    expect(Array.isArray(browserCases)).toBe(true);
    if (!Array.isArray(restCases) || !Array.isArray(browserCases)) {
      throw new Error('invalid all-role smoke matrix');
    }
    expect(restCases).toHaveLength(14);
    expect(
      new Set(restCases.map(testCase => requireObject(testCase).id)).size
    ).toBe(14);
    expect(
      restCases.every(
        testCase => requireObject(testCase).relation === 'public.staff'
      )
    ).toBe(true);
    expect(
      restCases.map(testCase => {
        const record = requireObject(testCase);
        return {
          id: record.id,
          actorId: record.actorId,
          clinicId: record.clinicId,
          expectedRows: record.expectedRows,
        };
      })
    ).toEqual([
      {
        id: 'rest-tenant-a-admin-a-child-allow',
        actorId: 'tenant-a-admin',
        clinicId: 'tenant-a-child',
        expectedRows: 3,
      },
      {
        id: 'rest-tenant-a-admin-b-child-deny',
        actorId: 'tenant-a-admin',
        clinicId: 'tenant-b-child',
        expectedRows: 0,
      },
      {
        id: 'rest-tenant-a-clinic-admin-a-child-allow',
        actorId: 'tenant-a-clinic-admin',
        clinicId: 'tenant-a-child',
        expectedRows: 3,
      },
      {
        id: 'rest-tenant-a-clinic-admin-b-child-deny',
        actorId: 'tenant-a-clinic-admin',
        clinicId: 'tenant-b-child',
        expectedRows: 0,
      },
      {
        id: 'rest-tenant-a-manager-a-child-allow',
        actorId: 'tenant-a-manager',
        clinicId: 'tenant-a-child',
        expectedRows: 3,
      },
      {
        id: 'rest-tenant-a-manager-b-child-deny',
        actorId: 'tenant-a-manager',
        clinicId: 'tenant-b-child',
        expectedRows: 0,
      },
      {
        id: 'rest-tenant-a-therapist-a-child-allow',
        actorId: 'tenant-a-therapist',
        clinicId: 'tenant-a-child',
        expectedRows: 3,
      },
      {
        id: 'rest-tenant-a-therapist-b-child-deny',
        actorId: 'tenant-a-therapist',
        clinicId: 'tenant-b-child',
        expectedRows: 0,
      },
      {
        id: 'rest-tenant-a-staff-a-child-allow',
        actorId: 'tenant-a-staff',
        clinicId: 'tenant-a-child',
        expectedRows: 3,
      },
      {
        id: 'rest-tenant-a-staff-b-child-deny',
        actorId: 'tenant-a-staff',
        clinicId: 'tenant-b-child',
        expectedRows: 0,
      },
      {
        id: 'rest-tenant-b-staff-b-child-allow',
        actorId: 'tenant-b-staff',
        clinicId: 'tenant-b-child',
        expectedRows: 1,
      },
      {
        id: 'rest-tenant-b-staff-a-child-deny',
        actorId: 'tenant-b-staff',
        clinicId: 'tenant-a-child',
        expectedRows: 0,
      },
      {
        id: 'rest-no-clinic-staff-a-child-deny',
        actorId: 'no-clinic-staff',
        clinicId: 'tenant-a-child',
        expectedRows: 0,
      },
      {
        id: 'rest-no-clinic-staff-b-child-deny',
        actorId: 'no-clinic-staff',
        clinicId: 'tenant-b-child',
        expectedRows: 0,
      },
    ]);

    expect(browserCases).toHaveLength(16);
    expect(
      new Set(browserCases.map(testCase => requireObject(testCase).id)).size
    ).toBe(16);
    expect(
      browserCases.filter(
        testCase => requireObject(testCase).role === 'service_role'
      )
    ).toHaveLength(0);
    expect(
      browserCases.filter(testCase => requireObject(testCase).role === 'anon')
    ).toHaveLength(1);
  });

  test('compiles a deterministic adapter operation plan without browser or network imports', () => {
    const fixtureSha = fixturePlanSha256();
    const smoke = requireObject(
      invokeModule(smokeContractUrl, 'compileAllRoleSmokePlan', [fixtureSha])
        .value
    );
    const adapter = invokeModule(
      smokeAdapterUrl,
      'compileAllRoleSmokeAdapterPlan',
      [requireObject(smoke.plan), String(smoke.planSha256)]
    );
    expect(adapter.ok).toBe(true);
    const adapterEnvelope = requireObject(adapter.value);
    const operations = adapterEnvelope.operations;

    expect(Array.isArray(operations)).toBe(true);
    if (!Array.isArray(operations)) {
      throw new Error('invalid adapter operations');
    }
    expect(operations).toHaveLength(52);
    expect(
      operations.filter(
        operation => requireObject(operation).operation === 'AUTH_SIGN_IN'
      )
    ).toHaveLength(7);
    expect(
      operations.filter(
        operation => requireObject(operation).operation === 'AUTH_REFRESH'
      )
    ).toHaveLength(7);
    expect(
      operations.filter(
        operation => requireObject(operation).operation === 'AUTH_PROFILE'
      )
    ).toHaveLength(7);
    expect(
      operations.filter(
        operation => requireObject(operation).operation === 'REST_STAFF_SELECT'
      )
    ).toHaveLength(14);
    expect(
      operations.filter(
        operation => requireObject(operation).operation === 'BROWSER_ROUTE'
      )
    ).toHaveLength(16);
    expect(
      operations.filter(
        operation =>
          requireObject(operation).operation === 'SERVICE_ROLE_CLIENT_BOUNDARY'
      )
    ).toHaveLength(1);

    const source = [
      readFileSync(smokeContractPath, 'utf8'),
      readFileSync(smokeAdapterPath, 'utf8'),
    ].join('\n');
    expect(source).not.toMatch(/from ['"]@playwright\/test['"]/);
    expect(source).not.toMatch(/from ['"]@supabase\/supabase-js['"]/);
    expect(source).not.toMatch(/from ['"]dotenv['"]/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  test('keeps readiness NOT_EVALUATED and never promotes a COMM gate', () => {
    const fixtureSha = fixturePlanSha256();
    const smoke = requireObject(
      invokeModule(smokeContractUrl, 'compileAllRoleSmokePlan', [fixtureSha])
        .value
    );
    const readiness = invokeModule(
      smokeAdapterUrl,
      'createAllRoleSmokeReadinessEnvelope',
      [fixtureSha, String(smoke.planSha256)]
    );

    expect(readiness.ok).toBe(true);
    expect(readiness.value).toEqual({
      schemaVersion: 1,
      resultType: 'PR12_ALL_ROLE_SMOKE_READINESS',
      commandId: 'PR12-CMD-013',
      componentId: 'PR12-CMD-013-ALL-ROLE-SMOKE',
      fixturePlanSha256: fixtureSha,
      smokePlanSha256: String(smoke.planSha256),
      implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
      executionStatus: 'NOT_RUN',
      evaluationStatus: 'NOT_EVALUATED',
      authorizedNow: false,
      remoteContactPerformed: false,
      commGateStatus: 'NOT_RUN',
      commGatePassClaimed: false,
      retryCount: 0,
      rawJwtPersisted: false,
      rawPasswordPersisted: false,
      storageStatePersisted: false,
      responseBodyPersisted: false,
      serviceRoleBrowserExposure: 'FORBIDDEN',
    });
  });

  test('dispatches all 52 local fake operations once and retains only fingerprints/counts', () => {
    const result = invokeSmokeLocalExecutor('success');
    expect(result.ok).toBe(true);
    const summary = requireObject(result.value);
    expect(summary).toMatchObject({
      schemaVersion: 1,
      resultType: 'PR12_ALL_ROLE_SMOKE_LOCAL_CONTRACT_RESULT',
      implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
      executionStatus: 'NOT_RUN',
      evaluationStatus: 'NOT_EVALUATED',
      remoteContactPerformed: false,
      commGateStatus: 'NOT_RUN',
      commGatePassClaimed: false,
      retryCount: 0,
      operationCount: 52,
      dispatchCount: 52,
      rawJwtPersisted: false,
      rawPasswordPersisted: false,
      storageStatePersisted: false,
      responseBodyPersisted: false,
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\.|bearer\s+[a-z0-9._~-]+/i
    );
    expect(Object.keys(summary)).not.toEqual(
      expect.arrayContaining([
        'jwt',
        'password',
        'responseBody',
        'storageState',
      ])
    );
  });

  test('fails immediately on cross-tenant rows and secret-bearing callback results', () => {
    const crossTenant = invokeSmokeLocalExecutor('cross-tenant-leak');
    expect(crossTenant.ok).toBe(false);
    expect(crossTenant.code).toBe('ALL_ROLE_REST_ROW_COUNT_MISMATCH');
    const crossTenantState = requireObject(crossTenant.value);
    expect(Number(crossTenantState.dispatchCount)).toBeLessThan(52);

    const secret = invokeSmokeLocalExecutor('secret-result');
    expect(secret.ok).toBe(false);
    expect(secret.code).toBe('ALL_ROLE_SECRET_BEARING_EVIDENCE');
    expect(secret.value).toEqual({ dispatchCount: 1 });
  });

  test('rejects service-role browser exposure and any secret-bearing observation', () => {
    const fixtureSha = fixturePlanSha256();
    const compiled = requireObject(
      invokeModule(smokeContractUrl, 'compileAllRoleSmokePlan', [fixtureSha])
        .value
    );
    const plan = requireObject(compiled.plan);
    const exposed = requireObject(cloneJson(plan));
    if (!Array.isArray(exposed.browserCases)) {
      throw new Error('invalid browser matrix');
    }
    exposed.browserCases.push({
      id: 'browser-service-role-dashboard',
      role: 'service_role',
      actorId: 'service-role',
      route: '/dashboard',
      expected: 'ALLOW_PAGE',
    });
    expect(
      invokeModule(smokeContractUrl, 'validateAllRoleSmokePlan', [exposed])
    ).toEqual({ ok: false, code: 'ALL_ROLE_BROWSER_MATRIX_INVALID' });

    expect(
      invokeModule(smokeAdapterUrl, 'assertSecretFreeSmokeEvidence', [
        {
          evaluationStatus: 'NOT_EVALUATED',
          bearerToken: 'eyJheader.payload.signature',
        },
      ])
    ).toEqual({ ok: false, code: 'ALL_ROLE_SECRET_BEARING_EVIDENCE' });
  });

  test('rejects case removal, retry, persisted state, or PASS claims', () => {
    const fixtureSha = fixturePlanSha256();
    const compiled = requireObject(
      invokeModule(smokeContractUrl, 'compileAllRoleSmokePlan', [fixtureSha])
        .value
    );
    const plan = requireObject(compiled.plan);
    const missingCase = requireObject(cloneJson(plan));
    if (!Array.isArray(missingCase.restCases)) {
      throw new Error('invalid REST matrix');
    }
    missingCase.restCases.pop();
    expect(
      invokeModule(smokeContractUrl, 'validateAllRoleSmokePlan', [missingCase])
    ).toEqual({ ok: false, code: 'ALL_ROLE_REST_MATRIX_INVALID' });

    const readiness = requireObject(
      invokeModule(smokeAdapterUrl, 'createAllRoleSmokeReadinessEnvelope', [
        fixtureSha,
        String(compiled.planSha256),
      ]).value
    );
    readiness.retryCount = 1;
    expect(
      invokeModule(smokeAdapterUrl, 'validateAllRoleSmokeReadinessEnvelope', [
        readiness,
      ])
    ).toEqual({ ok: false, code: 'ALL_ROLE_RETRY_FORBIDDEN' });

    readiness.retryCount = 0;
    readiness.storageStatePersisted = true;
    expect(
      invokeModule(smokeAdapterUrl, 'validateAllRoleSmokeReadinessEnvelope', [
        readiness,
      ])
    ).toEqual({ ok: false, code: 'ALL_ROLE_PERSISTED_STATE_FORBIDDEN' });

    readiness.storageStatePersisted = false;
    readiness.commGateStatus = 'PASS';
    readiness.commGatePassClaimed = true;
    expect(
      invokeModule(smokeAdapterUrl, 'validateAllRoleSmokeReadinessEnvelope', [
        readiness,
      ])
    ).toEqual({ ok: false, code: 'ALL_ROLE_COMM_PASS_FORBIDDEN' });
  });
});
