import { createHash } from 'node:crypto';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class RepresentativeFixtureContractError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RepresentativeFixtureContractError';
    this.code = code;
  }
}

function fail(code) {
  throw new RepresentativeFixtureContractError(code);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

function isRecord(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function requireRecord(value, code) {
  requireCondition(isRecord(value), code);
  return value;
}

function requireExactKeys(value, expectedKeys, code) {
  const record = requireRecord(value, code);
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  requireCondition(
    actualKeys.length === sortedExpectedKeys.length &&
      actualKeys.every((key, index) => key === sortedExpectedKeys[index]),
    code
  );
  return record;
}

function requireSha256(value, code) {
  requireCondition(
    typeof value === 'string' && SHA256_PATTERN.test(value),
    code
  );
  return value;
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

export function canonicalFixtureJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export const REPRESENTATIVE_FIXTURE_EXPLICIT_ROWS = Object.freeze({
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
});

export const REPRESENTATIVE_FIXTURE_DERIVED_ROWS = Object.freeze({
  'public.reservation_history': 12,
});

export const REPRESENTATIVE_FIXTURE_SNAPSHOT_ROWS = Object.freeze({
  ...REPRESENTATIVE_FIXTURE_EXPLICIT_ROWS,
  ...REPRESENTATIVE_FIXTURE_DERIVED_ROWS,
});

export const REPRESENTATIVE_FIXTURE_RELATION_ORDER = Object.freeze(
  Object.keys(REPRESENTATIVE_FIXTURE_SNAPSHOT_ROWS).sort()
);

const CLINIC_TOPOLOGY = Object.freeze([
  Object.freeze({
    clinicId: 'tenant-a-root',
    tenantId: 'tenant-a',
    parentClinicId: null,
    topologyRole: 'ROOT',
  }),
  Object.freeze({
    clinicId: 'tenant-a-child',
    tenantId: 'tenant-a',
    parentClinicId: 'tenant-a-root',
    topologyRole: 'CHILD',
  }),
  Object.freeze({
    clinicId: 'tenant-b-root',
    tenantId: 'tenant-b',
    parentClinicId: null,
    topologyRole: 'ROOT',
  }),
  Object.freeze({
    clinicId: 'tenant-b-child',
    tenantId: 'tenant-b',
    parentClinicId: 'tenant-b-root',
    topologyRole: 'CHILD',
  }),
]);

const ACTOR_TOPOLOGY = Object.freeze([
  Object.freeze({
    actorId: 'tenant-a-admin',
    role: 'admin',
    tenantId: 'tenant-a',
    clinicId: 'tenant-a-root',
    managerAssignmentClinicId: null,
    managerAssignmentActive: false,
  }),
  Object.freeze({
    actorId: 'tenant-a-clinic-admin',
    role: 'clinic_admin',
    tenantId: 'tenant-a',
    clinicId: 'tenant-a-root',
    managerAssignmentClinicId: null,
    managerAssignmentActive: false,
  }),
  Object.freeze({
    actorId: 'tenant-a-manager',
    role: 'manager',
    tenantId: 'tenant-a',
    clinicId: 'tenant-a-child',
    managerAssignmentClinicId: 'tenant-a-child',
    managerAssignmentActive: true,
  }),
  Object.freeze({
    actorId: 'tenant-a-therapist',
    role: 'therapist',
    tenantId: 'tenant-a',
    clinicId: 'tenant-a-child',
    managerAssignmentClinicId: null,
    managerAssignmentActive: false,
  }),
  Object.freeze({
    actorId: 'tenant-a-staff',
    role: 'staff',
    tenantId: 'tenant-a',
    clinicId: 'tenant-a-child',
    managerAssignmentClinicId: null,
    managerAssignmentActive: false,
  }),
  Object.freeze({
    actorId: 'tenant-b-staff',
    role: 'staff',
    tenantId: 'tenant-b',
    clinicId: 'tenant-b-child',
    managerAssignmentClinicId: null,
    managerAssignmentActive: false,
  }),
  Object.freeze({
    actorId: 'no-clinic-staff',
    role: 'staff',
    tenantId: null,
    clinicId: null,
    managerAssignmentClinicId: null,
    managerAssignmentActive: false,
  }),
]);

const EXPLICIT_RELATION_ORDER = Object.freeze(
  Object.keys(REPRESENTATIVE_FIXTURE_EXPLICIT_ROWS).sort()
);

function makeBusinessRows(relation, count, rowFactory) {
  return Array.from({ length: count }, (_, index) => ({
    fixtureRowId: `${relation}:${String(index + 1).padStart(2, '0')}`,
    fixtureClass: 'PR12_SYNTHETIC',
    ordinal: index + 1,
    ...rowFactory(index),
  }));
}

function buildRepresentativeFixturePayloadIdentity() {
  const actorRows = ACTOR_TOPOLOGY.map(actor => ({
    fixtureRowId: `actor:${actor.actorId}`,
    actorId: actor.actorId,
    role: actor.role,
    tenantId: actor.tenantId,
    clinicId: actor.clinicId,
  }));
  return {
    'auth.identities': ACTOR_TOPOLOGY.map(actor => ({
      fixtureRowId: `identity:${actor.actorId}`,
      actorId: actor.actorId,
      provider: 'email',
      providerIdentity: `pr12-synthetic:${actor.actorId}`,
    })),
    'auth.users': actorRows,
    'public.ai_comments': makeBusinessRows('public.ai_comments', 1, () => ({
      clinicId: 'tenant-a-child',
      actorId: 'tenant-a-therapist',
      subjectRef: 'reservation:01',
    })),
    'public.audit_logs': makeBusinessRows('public.audit_logs', 2, index => ({
      clinicId: 'tenant-a-child',
      actorId: index === 0 ? 'tenant-a-admin' : 'tenant-a-manager',
      eventClass: index === 0 ? 'ADMIN_READINESS' : 'MANAGER_READINESS',
    })),
    'public.clinics': CLINIC_TOPOLOGY.map(clinic => ({
      fixtureRowId: `clinic:${clinic.clinicId}`,
      clinicId: clinic.clinicId,
      tenantId: clinic.tenantId,
      parentClinicId: clinic.parentClinicId,
      topologyRole: clinic.topologyRole,
    })),
    'public.customers': makeBusinessRows('public.customers', 5, () => ({
      clinicId: 'tenant-a-child',
      tenantId: 'tenant-a',
    })),
    'public.manager_clinic_assignments': [
      {
        fixtureRowId: 'manager-assignment:tenant-a-manager:tenant-a-child',
        actorId: 'tenant-a-manager',
        clinicId: 'tenant-a-child',
        active: true,
        assignedByActorId: 'tenant-a-admin',
      },
    ],
    'public.menus': makeBusinessRows('public.menus', 2, () => ({
      clinicId: 'tenant-a-child',
      tenantId: 'tenant-a',
    })),
    'public.patients': makeBusinessRows('public.patients', 5, index => ({
      clinicId: 'tenant-a-child',
      customerRef: `public.customers:${String(index + 1).padStart(2, '0')}`,
    })),
    'public.profiles': actorRows.map(actor => ({
      ...actor,
      fixtureRowId: `profile:${actor.actorId}`,
      active: true,
    })),
    'public.reservations': makeBusinessRows(
      'public.reservations',
      12,
      index => ({
        clinicId: 'tenant-a-child',
        customerRef: `public.customers:${String((index % 5) + 1).padStart(2, '0')}`,
        resourceRef: `public.resources:${String((index % 3) + 1).padStart(2, '0')}`,
        statusClass: index < 6 ? 'SCHEDULED' : 'COMPLETED',
      })
    ),
    'public.resources': makeBusinessRows('public.resources', 3, index => ({
      clinicId: 'tenant-a-child',
      actorId: ['tenant-a-manager', 'tenant-a-therapist', 'tenant-a-staff'][
        index
      ],
    })),
    'public.security_events': makeBusinessRows(
      'public.security_events',
      2,
      index => ({
        clinicId: 'tenant-a-child',
        actorId: index === 0 ? 'tenant-a-admin' : 'tenant-a-clinic-admin',
        eventClass: index === 0 ? 'AUTH_SUCCESS' : 'AUTH_REFRESH',
      })
    ),
    'public.staff': actorRows.map(actor => ({
      ...actor,
      fixtureRowId: `staff:${actor.actorId}`,
      therapist: actor.actorId === 'tenant-a-therapist',
    })),
    'public.staff_preferences': makeBusinessRows(
      'public.staff_preferences',
      2,
      index => ({
        clinicId: 'tenant-a-child',
        actorId: index === 0 ? 'tenant-a-therapist' : 'tenant-a-staff',
      })
    ),
    'public.staff_shifts': makeBusinessRows('public.staff_shifts', 7, () => ({
      clinicId: 'tenant-a-child',
      actorId: 'tenant-a-staff',
    })),
    'public.user_permissions': ACTOR_TOPOLOGY.map(actor => ({
      fixtureRowId: `permission:${actor.actorId}`,
      actorId: actor.actorId,
      role: actor.role,
      clinicId: actor.clinicId,
      managerAssignmentClinicId: actor.managerAssignmentClinicId,
    })),
    'public.user_sessions': makeBusinessRows(
      'public.user_sessions',
      2,
      index => ({
        clinicId: 'tenant-a-child',
        actorId: index === 0 ? 'tenant-a-admin' : 'tenant-a-staff',
        sessionClass: 'SYNTHETIC_NON_SECRET',
      })
    ),
  };
}

function requirePayloadIdentityShape(payload) {
  const candidate = requireRecord(payload, 'FIXTURE_PAYLOAD_RELATIONS_INVALID');
  const actualRelations = Object.keys(candidate).sort();
  requireCondition(
    actualRelations.length === EXPLICIT_RELATION_ORDER.length &&
      actualRelations.every(
        (relation, index) => relation === EXPLICIT_RELATION_ORDER[index]
      ),
    'FIXTURE_PAYLOAD_RELATIONS_INVALID'
  );
  for (const relation of EXPLICIT_RELATION_ORDER) {
    const rows = candidate[relation];
    requireCondition(
      Array.isArray(rows) &&
        rows.length === REPRESENTATIVE_FIXTURE_EXPLICIT_ROWS[relation] &&
        rows.every(isRecord),
      'FIXTURE_PAYLOAD_ROW_COUNTS_INVALID'
    );
  }
  return candidate;
}

function fingerprintPayloadIdentity(payload) {
  const candidate = requirePayloadIdentityShape(payload);
  const byRelationSha256 = Object.fromEntries(
    EXPLICIT_RELATION_ORDER.map(relation => [
      relation,
      sha256Text(canonicalFixtureJson(candidate[relation])),
    ])
  );
  const aggregateEncoding = EXPLICIT_RELATION_ORDER.map(
    relation =>
      `${relation}\t${candidate[relation].length}\t${byRelationSha256[relation]}\n`
  ).join('');
  const actorTopologyProjection = {
    clinics: candidate['public.clinics'],
    users: candidate['auth.users'],
    profiles: candidate['public.profiles'],
    staff: candidate['public.staff'],
    permissions: candidate['public.user_permissions'],
    managerAssignments: candidate['public.manager_clinic_assignments'],
  };
  return {
    byRelationSha256,
    aggregateSha256: sha256Text(aggregateEncoding),
    actorTopologySha256: sha256Text(
      canonicalFixtureJson(actorTopologyProjection)
    ),
  };
}

const CANONICAL_PAYLOAD_IDENTITY = buildRepresentativeFixturePayloadIdentity();
const CANONICAL_PAYLOAD_FINGERPRINTS = fingerprintPayloadIdentity(
  CANONICAL_PAYLOAD_IDENTITY
);

export const REPRESENTATIVE_FIXTURE_PAYLOAD_FINGERPRINTS = Object.freeze({
  ...CANONICAL_PAYLOAD_FINGERPRINTS.byRelationSha256,
});
export const REPRESENTATIVE_FIXTURE_PAYLOAD_AGGREGATE_SHA256 =
  CANONICAL_PAYLOAD_FINGERPRINTS.aggregateSha256;
export const REPRESENTATIVE_FIXTURE_ACTOR_TOPOLOGY_SHA256 =
  CANONICAL_PAYLOAD_FINGERPRINTS.actorTopologySha256;

export function createRepresentativeFixturePayloadIdentity() {
  return cloneJson(CANONICAL_PAYLOAD_IDENTITY);
}

export function fingerprintRepresentativeFixturePayloadIdentity(payload) {
  return cloneJson(fingerprintPayloadIdentity(payload));
}

const REPRESENTATIVE_FIXTURE_PLAN = Object.freeze({
  schemaVersion: 1,
  contractId: 'PR12-REPRESENTATIVE-FIXTURE-PLAN-001',
  commandId: 'PR12-CMD-008',
  snapshotCommandId: 'PR12-CMD-009',
  classification: 'SYNTHETIC',
  implementationStatus: 'IMPLEMENTED_OFFLINE_VERIFIED',
  executionStatus: 'NOT_RUN',
  authorizedNow: false,
  productionSnapshotAllowed: false,
  patientPiiAllowed: false,
  rows: Object.freeze({
    explicitTotal: 83,
    derivedTotal: 12,
    snapshotTotal: 95,
    explicitByRelation: REPRESENTATIVE_FIXTURE_EXPLICIT_ROWS,
    derivedByRelation: REPRESENTATIVE_FIXTURE_DERIVED_ROWS,
    snapshotByRelation: REPRESENTATIVE_FIXTURE_SNAPSHOT_ROWS,
  }),
  topology: Object.freeze({
    tenantRoots: 2,
    clinics: CLINIC_TOPOLOGY,
    actors: ACTOR_TOPOLOGY,
    applicationRoles: Object.freeze([
      'admin',
      'clinic_admin',
      'manager',
      'therapist',
      'staff',
    ]),
    activeManagerAssignments: 1,
  }),
  payloadIdentity: Object.freeze({
    canonicalization:
      'SORTED_OBJECT_KEYS_PRESERVE_ARRAY_ORDER_UTF8_CANONICAL_JSON',
    byRelationSha256: REPRESENTATIVE_FIXTURE_PAYLOAD_FINGERPRINTS,
    aggregateSha256: REPRESENTATIVE_FIXTURE_PAYLOAD_AGGREGATE_SHA256,
    actorTopologySha256: REPRESENTATIVE_FIXTURE_ACTOR_TOPOLOGY_SHA256,
    operationProjection: 'RELATION_COUNT_PAYLOAD_SHA256_ONLY',
    rawRowsPersisted: false,
  }),
  loadContract: Object.freeze({
    mode: 'PR12_STRICT_HOSTED_ADAPTER',
    fixtureEpoch: 'OWNER_APPROVAL_REQUIRED',
    credentialInput: 'IN_MEMORY_ACTOR_MAP',
    warnings: 'ABORT',
    skips: 'ABORT',
    adaptiveFallback: 'ABORT',
    rawRowsPersisted: false,
    sourceFilesExecutedDirectly: false,
  }),
  snapshotHashContract: Object.freeze({
    transaction: 'REPEATABLE_READ_READ_ONLY',
    hashAlgorithm: 'SHA-256',
    relationOrder: 'UTF8_BYTEWISE_ASCENDING_QUALIFIED_RELATION',
    primaryKeyOrder: 'ASC_NULLS_FIRST_DECLARED_PRIMARY_KEY_ORDER',
    missingPrimaryKeyPolicy: 'ABORT',
    rowProjection: 'FULL_ROW_TO_JSONB',
    rowEncoding: 'UTF8_BYTE_LENGTH_COLON_JSONB_TEXT_LF',
    aggregateEncoding:
      'RELATION_TAB_ROW_COUNT_TAB_QUERY_SHA256_TAB_DIGEST_SHA256_LF',
    relationCount: 19,
    rawRowsPersisted: false,
    watermarkColumn: 'public.reservations.updated_at',
    watermarkIncluded: true,
  }),
});

function sumRowCounts(rowCounts) {
  return Object.values(rowCounts).reduce((total, count) => total + count, 0);
}

function requireExactRelationMap(value, expected, code) {
  const record = requireRecord(value, code);
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = Object.keys(expected).sort();
  requireCondition(
    actualKeys.length === expectedKeys.length &&
      actualKeys.every((key, index) => key === expectedKeys[index]) &&
      actualKeys.every(key => record[key] === expected[key]),
    code
  );
  return record;
}

function requireExactShaMap(value, code) {
  const record = requireRecord(value, code);
  const actualKeys = Object.keys(record).sort();
  requireCondition(
    actualKeys.length === REPRESENTATIVE_FIXTURE_RELATION_ORDER.length &&
      actualKeys.every(
        (key, index) =>
          key === REPRESENTATIVE_FIXTURE_RELATION_ORDER[index] &&
          typeof record[key] === 'string' &&
          SHA256_PATTERN.test(record[key])
      ),
    code
  );
  return record;
}

export function validateRepresentativeFixturePlan(plan) {
  const candidate = requireRecord(plan, 'FIXTURE_PLAN_INVALID');
  const rows = requireRecord(candidate.rows, 'FIXTURE_RELATION_COUNTS_INVALID');
  requireCondition(
    rows.explicitTotal === 83 &&
      rows.derivedTotal === 12 &&
      rows.snapshotTotal === 95,
    'FIXTURE_RELATION_COUNTS_INVALID'
  );
  requireExactRelationMap(
    rows.explicitByRelation,
    REPRESENTATIVE_FIXTURE_EXPLICIT_ROWS,
    'FIXTURE_RELATION_COUNTS_INVALID'
  );
  requireExactRelationMap(
    rows.derivedByRelation,
    REPRESENTATIVE_FIXTURE_DERIVED_ROWS,
    'FIXTURE_RELATION_COUNTS_INVALID'
  );
  requireExactRelationMap(
    rows.snapshotByRelation,
    REPRESENTATIVE_FIXTURE_SNAPSHOT_ROWS,
    'FIXTURE_RELATION_COUNTS_INVALID'
  );

  requireCondition(
    canonicalFixtureJson(candidate.topology) ===
      canonicalFixtureJson(REPRESENTATIVE_FIXTURE_PLAN.topology),
    'FIXTURE_ACTOR_TOPOLOGY_INVALID'
  );
  requireCondition(
    canonicalFixtureJson(candidate) ===
      canonicalFixtureJson(REPRESENTATIVE_FIXTURE_PLAN),
    'FIXTURE_PLAN_INVALID'
  );
  return true;
}

export function compileRepresentativeFixturePlan() {
  const plan = cloneJson(REPRESENTATIVE_FIXTURE_PLAN);
  validateRepresentativeFixturePlan(plan);
  const canonicalPlan = canonicalFixtureJson(plan);
  return {
    plan,
    canonicalPlan,
    planSha256: sha256Text(canonicalPlan),
  };
}

export function computeRepresentativeAggregateDataHash(
  rowCounts,
  querySha256ByRelation,
  relationDigests
) {
  const counts = requireExactRelationMap(
    rowCounts,
    REPRESENTATIVE_FIXTURE_SNAPSHOT_ROWS,
    'FIXTURE_SNAPSHOT_ROW_COUNTS_INVALID'
  );
  const queries = requireExactShaMap(
    querySha256ByRelation,
    'FIXTURE_SNAPSHOT_QUERY_HASHES_INVALID'
  );
  const digests = requireExactShaMap(
    relationDigests,
    'FIXTURE_SNAPSHOT_RELATION_DIGESTS_INVALID'
  );
  const aggregateEncoding = REPRESENTATIVE_FIXTURE_RELATION_ORDER.map(
    relation =>
      `${relation}\t${counts[relation]}\t${queries[relation]}\t${digests[relation]}\n`
  ).join('');
  return sha256Text(aggregateEncoding);
}

export function validateRepresentativeFixtureSnapshot(
  snapshot,
  expectedFixturePlanSha256
) {
  const expectedPlanSha256 = requireSha256(
    expectedFixturePlanSha256,
    'FIXTURE_PLAN_SHA256_INVALID'
  );
  const candidate = requireExactKeys(
    snapshot,
    [
      'schemaVersion',
      'resultType',
      'commandId',
      'fixturePlanSha256',
      'transaction',
      'relationOrder',
      'rowCounts',
      'querySha256ByRelation',
      'relationDigests',
      'aggregateDataHash',
      'aggregateSchemaHash',
      'aggregateEnvironmentPhysicalStructureHash',
      'rawRowsPersisted',
      'watermarkColumn',
      'watermarkIncluded',
    ],
    'FIXTURE_SNAPSHOT_SHAPE_INVALID'
  );
  requireCondition(
    candidate.schemaVersion === 1 &&
      candidate.resultType === 'PR12_REPRESENTATIVE_FIXTURE_SNAPSHOT' &&
      candidate.commandId === 'PR12-CMD-009' &&
      candidate.fixturePlanSha256 === expectedPlanSha256 &&
      candidate.transaction === 'REPEATABLE_READ_READ_ONLY' &&
      candidate.rawRowsPersisted === false &&
      candidate.watermarkColumn === 'public.reservations.updated_at' &&
      candidate.watermarkIncluded === true,
    'FIXTURE_SNAPSHOT_INVALID'
  );
  requireCondition(
    Array.isArray(candidate.relationOrder) &&
      canonicalFixtureJson(candidate.relationOrder) ===
        canonicalFixtureJson(REPRESENTATIVE_FIXTURE_RELATION_ORDER),
    'FIXTURE_SNAPSHOT_RELATION_ORDER_INVALID'
  );
  const rowCounts = requireExactRelationMap(
    candidate.rowCounts,
    REPRESENTATIVE_FIXTURE_SNAPSHOT_ROWS,
    'FIXTURE_SNAPSHOT_ROW_COUNTS_INVALID'
  );
  const expectedAggregateDataHash = computeRepresentativeAggregateDataHash(
    rowCounts,
    candidate.querySha256ByRelation,
    candidate.relationDigests
  );
  requireCondition(
    candidate.aggregateDataHash === expectedAggregateDataHash,
    'FIXTURE_SNAPSHOT_AGGREGATE_HASH_INVALID'
  );
  requireSha256(
    candidate.aggregateSchemaHash,
    'FIXTURE_SNAPSHOT_SCHEMA_HASH_INVALID'
  );
  requireSha256(
    candidate.aggregateEnvironmentPhysicalStructureHash,
    'FIXTURE_SNAPSHOT_PHYSICAL_HASH_INVALID'
  );
  return {
    relationCount: REPRESENTATIVE_FIXTURE_RELATION_ORDER.length,
    totalRows: sumRowCounts(rowCounts),
    aggregateDataHash: expectedAggregateDataHash,
  };
}
