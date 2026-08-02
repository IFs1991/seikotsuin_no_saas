import { createHash } from 'node:crypto';
import path from 'node:path';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const PRODUCTION_PROJECT_REF = 'qnanuoqveidwvacvbhqp';
const FINDING_KEYS = Object.freeze([
  'name',
  'title',
  'level',
  'facing',
  'categories',
  'description',
  'detail',
  'remediation',
  'metadata',
  'cache_key',
]);
const SNAPSHOT_KEYS = Object.freeze([
  'schemaVersion',
  'commandId',
  'bindingSha256',
  'projectRef',
  'databaseSystemIdentifier',
  'category',
  'capturedAt',
  'findings',
]);
const NORMALIZED_FINDING_KEYS = Object.freeze([
  'name',
  'title',
  'level',
  'facing',
  'categories',
  'description',
  'detail',
  'remediation',
  'metadata',
  'cacheKey',
  'stableKey',
]);
const NORMALIZED_SNAPSHOT_KEYS = Object.freeze([
  ...SNAPSHOT_KEYS,
  'findingCount',
  'snapshotSha256',
]);

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

function canonicalize(value) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('ADVISOR_FINDING_SHAPE_INVALID');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) fail('ADVISOR_FINDING_SHAPE_INVALID');
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) fail('ADVISOR_FINDING_SHAPE_INVALID');
    normalized[key] = canonicalize(value[key]);
  }
  return normalized;
}

function sha256Canonical(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function assertSecretFree(value) {
  const serialized = JSON.stringify(canonicalize(value));
  if (
    /postgres(?:ql)?:\/\/[^/\s"'@]+:[^@\s"']+@/i.test(serialized) ||
    /bearer\s+[a-z0-9._~+/=-]+/i.test(serialized) ||
    /sbp_[a-z0-9_-]{16,}/i.test(serialized) ||
    /sb_(?:secret|publishable)_[a-z0-9_-]+/i.test(serialized) ||
    /"(?:password|access_token|authorization|management_token)"\s*:/i.test(
      serialized
    )
  ) {
    fail('ADVISOR_SECRET_BEARING_EVIDENCE');
  }
}

function normalizeAdvisorDirectDatabaseUrl(valueInput) {
  const value = requireString(valueInput, 'ADVISOR_DATABASE_URL_INVALID');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('ADVISOR_DATABASE_URL_INVALID');
  }
  const projectRef = parsed.hostname.match(
    /^db\.([a-z]{20})\.supabase\.co$/i
  )?.[1];
  const queryKeys = [...parsed.searchParams.keys()];
  if (projectRef === PRODUCTION_PROJECT_REF) fail('PRODUCTION_CONTACT_DENIED');
  if (
    parsed.protocol !== 'postgresql:' ||
    !projectRef ||
    !PROJECT_REF_PATTERN.test(projectRef) ||
    parsed.username !== 'postgres' ||
    parsed.password !== '' ||
    parsed.port !== '5432' ||
    parsed.pathname !== '/postgres' ||
    parsed.hash !== '' ||
    queryKeys.length !== 2 ||
    new Set(queryKeys).size !== 2 ||
    !queryKeys.includes('sslmode') ||
    !queryKeys.includes('sslrootcert') ||
    parsed.searchParams.get('sslmode') !== 'verify-full' ||
    !parsed.searchParams.get('sslrootcert') ||
    parsed.hostname.includes('pooler')
  ) {
    fail(
      parsed.password === ''
        ? 'ADVISOR_DATABASE_URL_INVALID'
        : 'ADVISOR_SECRET_BEARING_DATABASE_URL'
    );
  }
  return parsed.toString();
}

export function buildAdvisorCommandDescriptor(input) {
  const request = requireExactKeys(
    input,
    ['commandId', 'supabasePath', 'directDatabaseUrl', 'externalWorkdir'],
    'ADVISOR_COMMAND_INPUT_INVALID'
  );
  if (!['PR12-CMD-006', 'PR12-CMD-016'].includes(request.commandId)) {
    fail('ADVISOR_COMMAND_ID_INVALID');
  }
  const supabasePath = requireString(
    request.supabasePath,
    'ADVISOR_COMMAND_INPUT_INVALID'
  );
  const externalWorkdir = requireString(
    request.externalWorkdir,
    'ADVISOR_COMMAND_INPUT_INVALID'
  );
  if (
    !(path.win32.isAbsolute(supabasePath) || path.isAbsolute(supabasePath)) ||
    !(
      path.win32.isAbsolute(externalWorkdir) || path.isAbsolute(externalWorkdir)
    )
  ) {
    fail('ADVISOR_COMMAND_INPUT_INVALID');
  }
  const directDatabaseUrl = normalizeAdvisorDirectDatabaseUrl(
    request.directDatabaseUrl
  );
  return {
    commandId: request.commandId,
    executable: supabasePath,
    args: [
      'db',
      'advisors',
      '--db-url',
      directDatabaseUrl,
      '--type',
      'all',
      '--level',
      'info',
      '--fail-on',
      'error',
      '--output-format',
      'json',
    ],
    cwd: externalWorkdir,
    shell: false,
    stdin: 'ignore',
    wrapperRetryCount: 0,
    maximumDispatchCount: 1,
    timeoutMs: 300_000,
    remoteContact: true,
    mutating: false,
    executionStatus: 'NOT_RUN',
    executionAuthorized: false,
  };
}

export function parseAdvisorCliJsonOutput(outputInput) {
  if (typeof outputInput !== 'string' || outputInput.length === 0) {
    fail('ADVISOR_OUTPUT_INVALID');
  }
  let parsed;
  try {
    parsed = JSON.parse(outputInput);
  } catch {
    fail('ADVISOR_OUTPUT_INVALID');
  }
  const envelope = requireExactKeys(
    parsed,
    ['results', 'message'],
    'ADVISOR_OUTPUT_INVALID'
  );
  if (
    envelope.message !== 'db advisors' ||
    !Array.isArray(envelope.results) ||
    `${JSON.stringify(envelope)}\n` !== outputInput
  ) {
    fail('ADVISOR_OUTPUT_INVALID');
  }
  return envelope.results;
}

function normalizeFinding(valueInput) {
  const value = requireExactKeys(
    valueInput,
    FINDING_KEYS,
    'ADVISOR_FINDING_SHAPE_INVALID'
  );
  const level = requireString(
    value.level,
    'ADVISOR_FINDING_SHAPE_INVALID'
  ).toUpperCase();
  if (!['INFO', 'WARN', 'ERROR'].includes(level)) {
    fail('ADVISOR_FINDING_SHAPE_INVALID');
  }
  if (
    !Array.isArray(value.categories) ||
    value.categories.length === 0 ||
    value.categories.some(
      category => typeof category !== 'string' || category.length === 0
    )
  ) {
    fail('ADVISOR_FINDING_SHAPE_INVALID');
  }
  const categories = [
    ...new Set(value.categories.map(category => category.toUpperCase())),
  ].sort((left, right) => left.localeCompare(right, 'en'));
  if (categories.length !== value.categories.length) {
    fail('ADVISOR_FINDING_SHAPE_INVALID');
  }
  const normalized = {
    name: requireString(value.name, 'ADVISOR_FINDING_SHAPE_INVALID'),
    title: requireString(value.title, 'ADVISOR_FINDING_SHAPE_INVALID'),
    level,
    facing: requireString(
      value.facing,
      'ADVISOR_FINDING_SHAPE_INVALID'
    ).toUpperCase(),
    categories,
    description: requireString(
      value.description,
      'ADVISOR_FINDING_SHAPE_INVALID'
    ),
    detail: requireString(value.detail, 'ADVISOR_FINDING_SHAPE_INVALID'),
    remediation: requireString(
      value.remediation,
      'ADVISOR_FINDING_SHAPE_INVALID'
    ),
    metadata: canonicalize(
      requireRecord(value.metadata, 'ADVISOR_FINDING_SHAPE_INVALID')
    ),
    cacheKey: requireString(value.cache_key, 'ADVISOR_FINDING_SHAPE_INVALID'),
  };
  if (!['EXTERNAL', 'INTERNAL'].includes(normalized.facing)) {
    fail('ADVISOR_FINDING_SHAPE_INVALID');
  }
  assertSecretFree(normalized);
  return {
    ...normalized,
    stableKey: sha256Canonical(normalized),
  };
}

export function normalizeAdvisorSnapshot(input) {
  const snapshot = requireExactKeys(
    input,
    SNAPSHOT_KEYS,
    'ADVISOR_SNAPSHOT_INVALID'
  );
  if (
    snapshot.schemaVersion !== 1 ||
    !['PR12-CMD-006', 'PR12-CMD-016'].includes(snapshot.commandId) ||
    !SHA256_PATTERN.test(snapshot.bindingSha256) ||
    !PROJECT_REF_PATTERN.test(snapshot.projectRef) ||
    snapshot.projectRef === PRODUCTION_PROJECT_REF ||
    !['security', 'performance', 'all'].includes(snapshot.category) ||
    !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
    snapshot.databaseSystemIdentifier === 'NOT_CAPTURED'
  ) {
    fail(
      snapshot.projectRef === PRODUCTION_PROJECT_REF
        ? 'PRODUCTION_CONTACT_DENIED'
        : 'ADVISOR_SNAPSHOT_INVALID'
    );
  }
  if (!Array.isArray(snapshot.findings)) fail('ADVISOR_SNAPSHOT_INVALID');
  const findings = snapshot.findings
    .map(normalizeFinding)
    .sort((left, right) => left.stableKey.localeCompare(right.stableKey, 'en'));
  if (
    new Set(findings.map(finding => finding.stableKey)).size !== findings.length
  ) {
    fail('ADVISOR_DUPLICATE_FINDING');
  }
  const normalized = {
    schemaVersion: 1,
    commandId: snapshot.commandId,
    bindingSha256: snapshot.bindingSha256,
    projectRef: snapshot.projectRef,
    databaseSystemIdentifier: requireString(
      snapshot.databaseSystemIdentifier,
      'ADVISOR_SNAPSHOT_INVALID'
    ),
    category: snapshot.category,
    capturedAt: new Date(snapshot.capturedAt).toISOString(),
    findings,
  };
  assertSecretFree(normalized);
  return {
    ...normalized,
    findingCount: findings.length,
    snapshotSha256: sha256Canonical(normalized),
  };
}

function validateNormalizedAdvisorSnapshot(input) {
  const snapshot = requireExactKeys(
    input,
    NORMALIZED_SNAPSHOT_KEYS,
    'ADVISOR_SNAPSHOT_INVALID'
  );
  if (
    snapshot.schemaVersion !== 1 ||
    !['PR12-CMD-006', 'PR12-CMD-016'].includes(snapshot.commandId) ||
    !SHA256_PATTERN.test(snapshot.bindingSha256) ||
    !PROJECT_REF_PATTERN.test(snapshot.projectRef) ||
    snapshot.projectRef === PRODUCTION_PROJECT_REF ||
    !['security', 'performance', 'all'].includes(snapshot.category) ||
    !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
    snapshot.databaseSystemIdentifier === 'NOT_CAPTURED' ||
    !Array.isArray(snapshot.findings)
  ) {
    fail('ADVISOR_SNAPSHOT_INVALID');
  }
  const findings = snapshot.findings.map(findingInput => {
    const finding = requireExactKeys(
      findingInput,
      NORMALIZED_FINDING_KEYS,
      'ADVISOR_SNAPSHOT_INTEGRITY_MISMATCH'
    );
    const recomputed = normalizeFinding({
      name: finding.name,
      title: finding.title,
      level: finding.level,
      facing: finding.facing,
      categories: finding.categories,
      description: finding.description,
      detail: finding.detail,
      remediation: finding.remediation,
      metadata: finding.metadata,
      cache_key: finding.cacheKey,
    });
    if (JSON.stringify(finding) !== JSON.stringify(recomputed)) {
      fail('ADVISOR_SNAPSHOT_INTEGRITY_MISMATCH');
    }
    return finding;
  });
  if (
    new Set(findings.map(finding => finding.stableKey)).size !==
      findings.length ||
    findings.some(
      (finding, index) =>
        index > 0 &&
        findings[index - 1].stableKey.localeCompare(finding.stableKey, 'en') >=
          0
    )
  ) {
    fail('ADVISOR_SNAPSHOT_INTEGRITY_MISMATCH');
  }
  const normalizedMaterial = {
    schemaVersion: 1,
    commandId: snapshot.commandId,
    bindingSha256: snapshot.bindingSha256,
    projectRef: snapshot.projectRef,
    databaseSystemIdentifier: snapshot.databaseSystemIdentifier,
    category: snapshot.category,
    capturedAt: new Date(snapshot.capturedAt).toISOString(),
    findings,
  };
  if (
    snapshot.findingCount !== findings.length ||
    snapshot.snapshotSha256 !== sha256Canonical(normalizedMaterial)
  ) {
    fail('ADVISOR_SNAPSHOT_INTEGRITY_MISMATCH');
  }
  return snapshot;
}

export function diffAdvisorSnapshots(beforeInput, afterInput) {
  const before = validateNormalizedAdvisorSnapshot(beforeInput);
  const after = validateNormalizedAdvisorSnapshot(afterInput);
  if (
    before.commandId !== 'PR12-CMD-006' ||
    after.commandId !== 'PR12-CMD-016'
  ) {
    fail('ADVISOR_COMMAND_SEQUENCE_MISMATCH');
  }
  for (const key of [
    'bindingSha256',
    'projectRef',
    'databaseSystemIdentifier',
    'category',
  ]) {
    if (before[key] !== after[key]) fail('ADVISOR_BINDING_MISMATCH');
  }
  if (
    !Number.isFinite(Date.parse(before.capturedAt)) ||
    !Number.isFinite(Date.parse(after.capturedAt)) ||
    Date.parse(after.capturedAt) <= Date.parse(before.capturedAt)
  ) {
    fail('ADVISOR_CAPTURE_ORDER_INVALID');
  }
  const beforeFindings = Array.isArray(before.findings)
    ? before.findings
    : fail('ADVISOR_SNAPSHOT_INVALID');
  const afterFindings = Array.isArray(after.findings)
    ? after.findings
    : fail('ADVISOR_SNAPSHOT_INVALID');
  const beforeMap = new Map(
    beforeFindings.map(finding => [finding.stableKey, finding])
  );
  const afterMap = new Map(
    afterFindings.map(finding => [finding.stableKey, finding])
  );
  const added = [...afterMap.entries()]
    .filter(([key]) => !beforeMap.has(key))
    .map(([, finding]) => finding)
    .sort((left, right) => left.stableKey.localeCompare(right.stableKey, 'en'));
  const removed = [...beforeMap.entries()]
    .filter(([key]) => !afterMap.has(key))
    .map(([, finding]) => finding)
    .sort((left, right) => left.stableKey.localeCompare(right.stableKey, 'en'));
  const unchanged = [...afterMap.entries()]
    .filter(([key]) => beforeMap.has(key))
    .map(([, finding]) => finding)
    .sort((left, right) => left.stableKey.localeCompare(right.stableKey, 'en'));
  if (added.some(finding => finding.level === 'ERROR')) {
    fail('ADVISOR_NEW_ERROR_FINDING');
  }
  const diff = {
    status: 'ADVISOR_DIFF_PASS',
    bindingSha256: before.bindingSha256,
    projectRef: before.projectRef,
    databaseSystemIdentifier: before.databaseSystemIdentifier,
    category: before.category,
    beforeSnapshotSha256: before.snapshotSha256,
    afterSnapshotSha256: after.snapshotSha256,
    added,
    removed,
    unchanged,
  };
  return {
    ...diff,
    diffSha256: sha256Canonical(diff),
  };
}
