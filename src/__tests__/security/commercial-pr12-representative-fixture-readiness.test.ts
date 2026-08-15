/** @jest-environment node */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(__dirname, '../../..');
const contractUrl = pathToFileURL(
  path.join(
    repoRoot,
    'scripts/commercial-hardening/pr12-representative-fixture-contract.mjs'
  )
).href;
const adapterUrl = pathToFileURL(
  path.join(
    repoRoot,
    'scripts/commercial-hardening/pr12-representative-fixture-adapter.mjs'
  )
).href;

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
    throw new Error('fixture readiness harness returned an invalid result');
  }
  return {
    ok: parsed.ok,
    ...(typeof parsed.code === 'string' ? { code: parsed.code } : {}),
    ...(parsed.value !== undefined ? { value: parsed.value as JsonValue } : {}),
  };
}

function requireObject(value: JsonValue | undefined): JsonObject {
  expect(isJsonObject(value)).toBe(true);
  if (!isJsonObject(value)) {
    throw new Error('expected a JSON object');
  }
  return value;
}

function cloneJson(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function invokeFixtureLocalExecutor(
  mode: 'success' | 'warning'
): HarnessResult {
  const harness = `
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    let dispatchCount = 0;
    try {
      const contract = await import(input.contractUrl);
      const adapter = await import(input.adapterUrl);
      const compiled = contract.compileRepresentativeFixturePlan();
      const payload =
        contract.createRepresentativeFixturePayloadIdentity();
      const operations = adapter.compileRepresentativeFixtureLoadOperations(
        compiled.planSha256,
        compiled.plan.rows.explicitByRelation,
        payload
      );
      const value = await adapter.executeRepresentativeFixtureLocalContract(
        operations,
        payload,
        async (operation, inMemoryRows) => {
          dispatchCount += 1;
          if (inMemoryRows.length !== operation.rowCount) {
            throw new Error('raw rows were not supplied in memory');
          }
          if (input.mode === 'warning' && dispatchCount === 1) {
            return {
              status: 'APPLIED',
              affectedRows: operation.rowCount,
              warning: 'must abort'
            };
          }
          return {
            status: 'APPLIED',
            affectedRows: operation.rowCount
          };
        }
      );
      process.stdout.write(JSON.stringify({
        ok: true,
        value: {
          ...value,
          dispatchCount,
          operationRelations: operations.operations.map(
            operation => operation.relation
          ),
          operationModes: operations.operations.map(
            operation => operation.operation
          )
        }
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
      input: JSON.stringify({ contractUrl, adapterUrl, mode }),
      encoding: 'utf8',
    }
  );
  expect(result.stderr).toBe('');
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isJsonObject(parsed) || typeof parsed.ok !== 'boolean') {
    throw new Error('fixture local executor harness returned invalid output');
  }
  return {
    ok: parsed.ok,
    ...(typeof parsed.code === 'string' ? { code: parsed.code } : {}),
    ...(parsed.value !== undefined ? { value: parsed.value as JsonValue } : {}),
  };
}

const expectedExplicitRows: JsonObject = {
  'auth.identities': 7,
  'auth.users': 7,
  'public.ai_comments': 1,
  'public.audit_logs': 2,
  'public.clinics': 4,
  'public.customers': 5,
  'public.manager_clinic_assignments': 1,
  'public.menus': 2,
  'public.patients': 5,
  'public.profiles': 7,
  'public.reservations': 12,
  'public.resources': 3,
  'public.security_events': 2,
  'public.staff': 7,
  'public.staff_preferences': 2,
  'public.staff_shifts': 7,
  'public.user_permissions': 7,
  'public.user_sessions': 2,
};

describe('PR12 representative fixture readiness contract', () => {
  test('freezes exactly 83 explicit rows and 12 derived history rows', () => {
    const compiled = invokeModule(
      contractUrl,
      'compileRepresentativeFixturePlan'
    );
    expect(compiled.ok).toBe(true);
    const envelope = requireObject(compiled.value);
    const plan = requireObject(envelope.plan);
    const rows = requireObject(plan.rows);

    expect(rows.explicitTotal).toBe(83);
    expect(rows.derivedTotal).toBe(12);
    expect(rows.snapshotTotal).toBe(95);
    expect(rows.explicitByRelation).toEqual(expectedExplicitRows);
    expect(rows.derivedByRelation).toEqual({
      'public.reservation_history': 12,
    });
    expect(Object.keys(requireObject(rows.snapshotByRelation))).toHaveLength(
      19
    );
  });

  test('freezes four clinics, seven actors, five app roles, and one active manager assignment', () => {
    const compiled = invokeModule(
      contractUrl,
      'compileRepresentativeFixturePlan'
    );
    const plan = requireObject(requireObject(compiled.value).plan);
    const topology = requireObject(plan.topology);
    const clinics = topology.clinics;
    const actors = topology.actors;

    expect(Array.isArray(clinics)).toBe(true);
    expect(Array.isArray(actors)).toBe(true);
    if (!Array.isArray(clinics) || !Array.isArray(actors)) {
      throw new Error('invalid fixture topology');
    }
    expect(clinics).toHaveLength(4);
    expect(actors).toHaveLength(7);
    expect(actors.map(actor => requireObject(actor).role).sort()).toEqual(
      [
        'admin',
        'clinic_admin',
        'manager',
        'staff',
        'staff',
        'staff',
        'therapist',
      ].sort()
    );

    const manager = actors
      .map(requireObject)
      .find(actor => actor.role === 'manager');
    const clinicAdmin = actors
      .map(requireObject)
      .find(actor => actor.role === 'clinic_admin');
    expect(clinicAdmin).toMatchObject({
      actorId: 'tenant-a-clinic-admin',
      clinicId: 'tenant-a-root',
    });
    expect(manager).toMatchObject({
      actorId: 'tenant-a-manager',
      clinicId: 'tenant-a-child',
      managerAssignmentClinicId: 'tenant-a-child',
      managerAssignmentActive: true,
    });
    expect(
      actors
        .map(requireObject)
        .filter(actor => actor.clinicId === 'tenant-a-child')
        .map(actor => actor.role)
        .sort()
    ).toEqual(['manager', 'staff', 'therapist']);
  });

  test('compiles a deterministic, hash-bound plan with no fixture values or secrets', () => {
    const first = requireObject(
      invokeModule(contractUrl, 'compileRepresentativeFixturePlan').value
    );
    const second = requireObject(
      invokeModule(contractUrl, 'compileRepresentativeFixturePlan').value
    );

    expect(first.planSha256).toBe(second.planSha256);
    expect(first.canonicalPlan).toBe(second.canonicalPlan);
    expect(first.planSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(String(first.canonicalPlan)).not.toMatch(
      /password|bearer\s|eyJ[a-zA-Z0-9_-]*\./i
    );
    const plan = requireObject(first.plan);
    const payloadIdentity = requireObject(plan.payloadIdentity);
    expect(payloadIdentity.aggregateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payloadIdentity.actorTopologySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      Object.keys(requireObject(payloadIdentity.byRelationSha256))
    ).toHaveLength(18);
    expect(payloadIdentity.rawRowsPersisted).toBe(false);
  });

  test('rejects row-count drift and missing therapist coverage', () => {
    const compiled = requireObject(
      invokeModule(contractUrl, 'compileRepresentativeFixturePlan').value
    );
    const originalPlan = requireObject(compiled.plan);

    const rowDrift = requireObject(cloneJson(originalPlan));
    requireObject(requireObject(rowDrift.rows).explicitByRelation)[
      'public.staff'
    ] = 6;
    expect(
      invokeModule(contractUrl, 'validateRepresentativeFixturePlan', [rowDrift])
    ).toEqual({ ok: false, code: 'FIXTURE_RELATION_COUNTS_INVALID' });

    const missingTherapist = requireObject(cloneJson(originalPlan));
    const topology = requireObject(missingTherapist.topology);
    if (!Array.isArray(topology.actors)) {
      throw new Error('invalid fixture topology');
    }
    topology.actors = topology.actors.filter(
      actor => requireObject(actor).role !== 'therapist'
    );
    expect(
      invokeModule(contractUrl, 'validateRepresentativeFixturePlan', [
        missingTherapist,
      ])
    ).toEqual({ ok: false, code: 'FIXTURE_ACTOR_TOPOLOGY_INVALID' });
  });

  test('freezes fail-closed adapter readiness and forbids legacy seed entrypoints', () => {
    const compiled = requireObject(
      invokeModule(contractUrl, 'compileRepresentativeFixturePlan').value
    );
    const result = invokeModule(
      adapterUrl,
      'createRepresentativeFixtureAdapterReadiness',
      [String(compiled.planSha256)]
    );
    expect(result.ok).toBe(true);
    const readiness = requireObject(result.value);

    expect(readiness).toMatchObject({
      commandId: 'PR12-CMD-008',
      snapshotCommandId: 'PR12-CMD-009',
      implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
      executionStatus: 'NOT_RUN',
      authorizedNow: false,
      warningPolicy: 'ABORT',
      skipPolicy: 'ABORT',
      fallbackPolicy: 'ABORT',
      rawCredentialsPersisted: false,
      rawRowsPersisted: false,
    });
    expect(readiness.forbiddenSourceEntrypoints).toEqual([
      'scripts/e2e/seed-e2e-data.mjs',
      'supabase/seed.sql',
    ]);
  });

  test('compiles exact counts into 18 fixed parameterized operations and dispatches each once locally', () => {
    const result = invokeFixtureLocalExecutor('success');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      schemaVersion: 1,
      resultType: 'PR12_REPRESENTATIVE_FIXTURE_LOCAL_CONTRACT_RESULT',
      implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
      executionStatus: 'NOT_RUN',
      remoteContactPerformed: false,
      operationCount: 18,
      explicitRows: 83,
      payloadAggregateSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      actorTopologySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      warningCount: 0,
      skipCount: 0,
      fallbackCount: 0,
      rawRowsPersisted: false,
      rawCredentialsPersisted: false,
      dispatchCount: 18,
      operationRelations: [
        'public.clinics',
        'auth.users',
        'auth.identities',
        'public.profiles',
        'public.staff',
        'public.user_permissions',
        'public.manager_clinic_assignments',
        'public.customers',
        'public.menus',
        'public.resources',
        'public.patients',
        'public.reservations',
        'public.ai_comments',
        'public.user_sessions',
        'public.security_events',
        'public.audit_logs',
        'public.staff_shifts',
        'public.staff_preferences',
      ],
      operationModes: Array.from(
        { length: 18 },
        () => 'PARAMETERIZED_BATCH_INSERT'
      ),
    });
  });

  test('aborts on the first local fixture warning without retry', () => {
    const result = invokeFixtureLocalExecutor('warning');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('FIXTURE_LOCAL_DISPATCH_RESULT_INVALID');
    expect(result.value).toEqual({ dispatchCount: 1 });
  });

  test('rejects same-count payload drift, missing relations, and extra relations before dispatch', () => {
    const compiled = requireObject(
      invokeModule(contractUrl, 'compileRepresentativeFixturePlan').value
    );
    const plan = requireObject(compiled.plan);
    const rows = requireObject(plan.rows);
    const payloadResult = invokeModule(
      contractUrl,
      'createRepresentativeFixturePayloadIdentity'
    );
    expect(payloadResult.ok).toBe(true);
    const payload = requireObject(payloadResult.value);

    const valid = invokeModule(
      adapterUrl,
      'compileRepresentativeFixtureLoadOperations',
      [
        String(compiled.planSha256),
        requireObject(rows.explicitByRelation),
        payload,
      ]
    );
    expect(valid.ok).toBe(true);
    const operationPlan = requireObject(valid.value);
    if (!Array.isArray(operationPlan.operations)) {
      throw new Error('invalid fixture operation plan');
    }
    expect(
      operationPlan.operations.every(operation => {
        const record = requireObject(operation);
        return (
          typeof record.payloadSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(record.payloadSha256) &&
          record.rawRows === undefined
        );
      })
    ).toBe(true);
    expect(operationPlan.rawRowsPersisted).toBe(false);

    const drifted = requireObject(cloneJson(payload));
    if (!Array.isArray(drifted['public.staff'])) {
      throw new Error('invalid staff payload');
    }
    const firstStaff = requireObject(drifted['public.staff'][0]);
    firstStaff.fixtureRowId = 'same-count-but-different-row';
    expect(
      invokeModule(adapterUrl, 'compileRepresentativeFixtureLoadOperations', [
        String(compiled.planSha256),
        requireObject(rows.explicitByRelation),
        drifted,
      ])
    ).toEqual({
      ok: false,
      code: 'FIXTURE_PAYLOAD_IDENTITY_HASH_MISMATCH',
    });

    const missing = requireObject(cloneJson(payload));
    delete missing['public.menus'];
    expect(
      invokeModule(adapterUrl, 'compileRepresentativeFixtureLoadOperations', [
        String(compiled.planSha256),
        requireObject(rows.explicitByRelation),
        missing,
      ])
    ).toEqual({ ok: false, code: 'FIXTURE_PAYLOAD_RELATIONS_INVALID' });

    const extra = requireObject(cloneJson(payload));
    extra['public.extra'] = [];
    expect(
      invokeModule(adapterUrl, 'compileRepresentativeFixtureLoadOperations', [
        String(compiled.planSha256),
        requireObject(rows.explicitByRelation),
        extra,
      ])
    ).toEqual({ ok: false, code: 'FIXTURE_PAYLOAD_RELATIONS_INVALID' });
  });

  test('validates a deterministic 19-relation runtime snapshot hash contract', () => {
    const compiled = requireObject(
      invokeModule(contractUrl, 'compileRepresentativeFixturePlan').value
    );
    const plan = requireObject(compiled.plan);
    const rows = requireObject(plan.rows);
    const snapshotRows = requireObject(rows.snapshotByRelation);
    const relationNames = Object.keys(snapshotRows).sort();
    const relationDigests = Object.fromEntries(
      relationNames.map((relation, index) => [
        relation,
        createHash('sha256')
          .update(`rows:${relation}:${index}`, 'utf8')
          .digest('hex'),
      ])
    );
    const querySha256ByRelation = Object.fromEntries(
      relationNames.map((relation, index) => [
        relation,
        createHash('sha256')
          .update(`query:${relation}:${index}`, 'utf8')
          .digest('hex'),
      ])
    );
    const aggregate = invokeModule(
      contractUrl,
      'computeRepresentativeAggregateDataHash',
      [snapshotRows, querySha256ByRelation, relationDigests]
    );
    expect(aggregate.ok).toBe(true);

    const snapshot: JsonObject = {
      schemaVersion: 1,
      resultType: 'PR12_REPRESENTATIVE_FIXTURE_SNAPSHOT',
      commandId: 'PR12-CMD-009',
      fixturePlanSha256: String(compiled.planSha256),
      transaction: 'REPEATABLE_READ_READ_ONLY',
      relationOrder: relationNames,
      rowCounts: snapshotRows,
      querySha256ByRelation,
      relationDigests,
      aggregateDataHash: String(aggregate.value),
      aggregateSchemaHash: '1'.repeat(64),
      aggregateEnvironmentPhysicalStructureHash: '2'.repeat(64),
      rawRowsPersisted: false,
      watermarkColumn: 'public.reservations.updated_at',
      watermarkIncluded: true,
    };

    expect(
      invokeModule(contractUrl, 'validateRepresentativeFixtureSnapshot', [
        snapshot,
        String(compiled.planSha256),
      ])
    ).toEqual({
      ok: true,
      value: {
        relationCount: 19,
        totalRows: 95,
        aggregateDataHash: String(aggregate.value),
      },
    });

    const rawRowLeak = requireObject(cloneJson(snapshot));
    rawRowLeak.rawRows = [{ id: 'must-not-be-persisted' }];
    expect(
      invokeModule(contractUrl, 'validateRepresentativeFixtureSnapshot', [
        rawRowLeak,
        String(compiled.planSha256),
      ])
    ).toEqual({ ok: false, code: 'FIXTURE_SNAPSHOT_SHAPE_INVALID' });

    requireObject(snapshot.rowCounts)['public.reservation_history'] = 11;
    expect(
      invokeModule(contractUrl, 'validateRepresentativeFixtureSnapshot', [
        snapshot,
        String(compiled.planSha256),
      ])
    ).toEqual({ ok: false, code: 'FIXTURE_SNAPSHOT_ROW_COUNTS_INVALID' });
  });
});
