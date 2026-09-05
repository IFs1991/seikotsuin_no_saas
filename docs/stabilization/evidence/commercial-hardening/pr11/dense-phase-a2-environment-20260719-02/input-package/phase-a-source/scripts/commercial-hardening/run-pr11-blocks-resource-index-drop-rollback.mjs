import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '../..');
const sqlDirectory = path.join(scriptDirectory, 'sql');
const fieldSeparator = '\u001f';
const psql = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const supabaseCli = 'C:\\tmp\\supabase-cli-2.109.0\\supabase.exe';
const supabaseArchive =
  'C:\\tmp\\supabase-cli-2.109.0\\supabase_windows_amd64.tar.gz';

const expectedGitHead = 'aaf3837f6f8053b0379a2d4caea65880952ce027';
const expectedDatabase = 'postgres';
const expectedSystemIdentifier = '7662783869098430503';
const expectedServerVersion = '170006';
const expectedMigrationHead = '20260718011731';
const expectedSupabaseVersion = '2.109.0';
const expectedCliSha =
  '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118';
const expectedArchiveSha =
  '4ea5b92ae679323cde0e69ca92b801c3fc705c8351bdff50cb3b8eff6926f5c7';
const canonicalPerformanceProbeSha =
  '5e6ae3af19f428d63b8eaa8a56d7b659d4841fe693071e7ca11449c756c3cb65';
const expectedLogicalBaseline =
  'c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78';
const expectedPhysicalBaseline =
  '94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86';

const normalizedRelations = new Set([
  'auth.users',
  'public.clinics',
  'public.profiles',
  'public.resources',
  'public.shift_request_periods',
  'public.staff',
  'public.user_permissions',
  'public.blocks',
  'public.customers',
  'public.reservations',
  'public.reservation_history',
  'public.shift_requests',
  'public.patient_outreach_recipients',
  'public.customer_insurance_coverages',
  'public.menus',
  'public.menu_billing_profiles',
  'public.patient_outreach_campaigns',
]);

const fixedLimits = {
  created_by_read_100_of_20000: { executionMs: 2.851 },
  sparse_insert_10000: { executionMs: 435.7373, walBytes: 9_292_168.2 },
  dense_insert_10000: { executionMs: 521.55125, walBytes: 11_133_665 },
  shift_full_only_insert_2000: {
    executionMs: 198.387,
    walBytes: 1_868_505.6,
  },
  shift_full_plus_partial_insert_2000: {
    executionMs: 219.224,
    walBytes: 2_028_773.6,
  },
  recipient_sparse_composite_insert_1000: {
    executionMs: 46.665,
    walBytes: 600_946.5,
  },
  recipient_dense_composite_insert_1000: {
    executionMs: 81.761,
    walBytes: 755_065,
  },
};

const canonicalPerformanceProbes = new Set([
  ...Object.keys(fixedLimits),
  'existing_recipient_customer_path',
  'existing_recipient_campaign_path',
  'existing_reservation_campaign_path',
]);

const causalGateDefinition = {
  probes: ['sparse_insert_10000', 'dense_insert_10000'],
  candidateMedianStrictlyBelowCurrent: true,
  minimumExecutionPairWins: 2,
  pairCount: 3,
  everyPairCandidateWalRecordsAtMostCurrent: true,
  everyPairCandidateWalBytesAtMostCurrent: true,
  discardedSamplesAllowed: false,
};

const cascadeGateDefinition = {
  pairCount: 3,
  deletedRowsPerSample: 10_000,
  executionLimit:
    'candidate median <= current median + max(current median * 0.25, 50 ms)',
  walLimit: 'candidate median <= current median * 1.25',
  lockTimeoutAllowed: false,
};

const planGateDefinition = {
  appliesTo: 'candidate',
  resource_only: ['blocks_resource_clinic_idx'],
  resource_clinic: ['blocks_resource_clinic_idx'],
  active_time: ['idx_blocks_resource_time', 'blocks_resource_clinic_idx'],
  currentStatePurpose: 'diagnostic-only',
  targetSeqScanAllowed: false,
  plannerForcingAllowed: false,
  actualRowsMustEqualExpectedRows: true,
};

// Phase A SQL-team interface. These filenames are intentionally explicit so a
// missing or renamed input fails before any database sample can execute.
const sql = {
  preflight: 'pr11-blocks-resource-index-drop-preflight.sql',
  ddl: 'pr11-blocks-resource-index-drop-ddl.sql',
  performanceCurrent: 'pr11-blocks-resource-index-drop-current.sql',
  performanceCandidate: 'pr11-blocks-resource-index-drop-candidate.sql',
  planCurrent: 'pr11-blocks-resource-index-drop-plan-current.sql',
  planCandidate: 'pr11-blocks-resource-index-drop-plan-candidate.sql',
  cascadeCurrent: 'pr11-blocks-resource-index-drop-cascade-current.sql',
  cascadeCandidate: 'pr11-blocks-resource-index-drop-cascade-candidate.sql',
  integrity: 'pr11-blocks-resource-index-drop-integrity.sql',
  planProbe: 'pr11-blocks-resource-index-drop-plan-probe.sql',
  cascadeProbe: 'pr11-blocks-resource-index-drop-cascade-probe.sql',
  performanceProbe: 'pr11-performance-probe.sql',
  permanentState: 'pr11-postapply-permanent-state.sql',
  logical: 'pr11-postapply-logical-snapshot.sql',
  physical: 'pr11-paired-physical-snapshot.sql',
  normalize: 'pr11-postapply-normalize.sql',
};

const requiredPhaseASql = [
  sql.preflight,
  sql.ddl,
  sql.performanceCurrent,
  sql.performanceCandidate,
  sql.planCurrent,
  sql.planCandidate,
  sql.cascadeCurrent,
  sql.cascadeCandidate,
  sql.integrity,
];

const optionalSharedSql = [sql.planProbe, sql.cascadeProbe];

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileSha(filePath) {
  return sha(fs.readFileSync(filePath));
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 128 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
  };
}

function command(executable, args) {
  return { command: [executable, ...args], ...run(executable, args) };
}

function jsonLines(output) {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line));
}

function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}

function median(values) {
  if (values.length !== 3) throw new Error('Median requires exactly 3 values');
  return [...values].sort((left, right) => left - right)[1];
}

function firstDefined(value, keys) {
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key];
  }
  return undefined;
}

function parsedJson(value, label) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${label} is not valid JSON`);
    }
  }
  if (!value || typeof value !== 'object') {
    throw new Error(`${label} is missing`);
  }
  return value;
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit);
  } else if (value && typeof value === 'object') {
    visit(value);
    for (const child of Object.values(value)) walk(child, visit);
  }
}

function parsePerformanceRows(output) {
  const rows = output
    .split(/\r?\n/)
    .map(line => line.split(fieldSeparator))
    .filter(columns => columns.length === 8)
    .map(columns => ({
      probe: columns[0],
      executionMs: finiteNumber(columns[1], `${columns[0]} execution`),
      walRecords: finiteNumber(columns[2], `${columns[0]} WAL records`),
      walBytes: finiteNumber(columns[3], `${columns[0]} WAL bytes`),
      sharedDirtiedBlocks: finiteNumber(
        columns[4],
        `${columns[0]} dirty blocks`
      ),
      rootNode: columns[5],
      rawPlanMd5: columns[6],
      rawPlan: JSON.parse(columns[7]),
    }));
  const names = rows.map(row => row.probe);
  if (
    rows.length !== canonicalPerformanceProbes.size ||
    new Set(names).size !== rows.length ||
    names.some(name => !canonicalPerformanceProbes.has(name)) ||
    [...canonicalPerformanceProbes].some(name => !names.includes(name))
  ) {
    throw new Error('Canonical performance output probe inventory drift');
  }
  return rows;
}

function parsePlanEvidence(output) {
  const records = jsonLines(output).filter(
    value => value.kind === 'blocks_resource_index_plan'
  );
  const probes = new Set(['resource_only', 'resource_clinic', 'active_time']);
  if (
    records.length !== probes.size ||
    new Set(records.map(value => value.probe)).size !== records.length ||
    records.some(value => !probes.has(value.probe))
  ) {
    throw new Error(
      'Plan evidence must contain the exact three Phase A probes'
    );
  }
  return records.map(value => {
    const actualRows = finiteNumber(
      firstDefined(value, ['actual_rows', 'actualRows']),
      `${value.probe} actual rows`
    );
    const expectedRows = finiteNumber(
      firstDefined(value, ['expected_rows', 'expectedRows']),
      `${value.probe} expected rows`
    );
    const rawPlan = parsedJson(
      firstDefined(value, ['raw_plan', 'rawPlan', 'plan', 'plan_data']),
      `${value.probe} raw plan`
    );
    return { ...value, actualRows, expectedRows, rawPlan };
  });
}

function parseCascadeEvidence(output) {
  const records = jsonLines(output).filter(
    value => value.kind === 'blocks_resource_index_cascade'
  );
  if (records.length !== 1) {
    throw new Error('Cascade sample must emit exactly one evidence record');
  }
  const value = records[0];
  const lockTimeoutValue = firstDefined(value, [
    'lock_timeout',
    'lockTimeout',
    'lock_timeout_occurred',
  ]);
  const lockTimeoutCount = firstDefined(value, ['lock_timeout_count']);
  if (lockTimeoutValue === undefined && lockTimeoutCount === undefined) {
    throw new Error('Cascade evidence is missing lock-timeout status');
  }
  const lockTimeout =
    lockTimeoutValue === undefined
      ? finiteNumber(lockTimeoutCount, 'cascade lock timeout count') !== 0
      : lockTimeoutValue === true || lockTimeoutValue === 'true';
  return [
    {
      ...value,
      executionMs: finiteNumber(
        firstDefined(value, ['execution_ms', 'executionMs']),
        'cascade execution'
      ),
      walRecords: finiteNumber(
        firstDefined(value, ['wal_records', 'walRecords']),
        'cascade WAL records'
      ),
      walBytes: finiteNumber(
        firstDefined(value, ['wal_bytes', 'walBytes']),
        'cascade WAL bytes'
      ),
      deletedRows: finiteNumber(
        firstDefined(value, ['deleted_rows', 'deletedRows']),
        'cascade deleted rows'
      ),
      lockTimeout,
    },
  ];
}

function evidenceBoolean(value) {
  const fields = ['passed', 'pass', 'contract_pass'];
  const present = fields.filter(field => value[field] !== undefined);
  return present.length > 0 && present.every(field => value[field] === true);
}

function parseIntegrityEvidence(output) {
  const values = jsonLines(output);
  const cases = values.filter(
    value => value.kind === 'blocks_resource_index_integrity_case'
  );
  const summaries = values.filter(
    value => value.kind === 'blocks_resource_index_integrity_summary'
  );
  if (cases.length === 0 || summaries.length !== 1) {
    throw new Error('Integrity evidence inventory is incomplete');
  }
  return [...cases, summaries[0]];
}

function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
}

const outputArgIndex = process.argv.indexOf('--output');
if (outputArgIndex < 0 || !process.argv[outputArgIndex + 1]) {
  throw new Error('Usage: --output <new-directory>');
}
const outputDirectory = path.resolve(
  repoRoot,
  process.argv[outputArgIndex + 1]
);
if (fs.existsSync(outputDirectory)) {
  throw new Error(`Output exists: ${outputDirectory}`);
}
fs.mkdirSync(outputDirectory, { recursive: true });

const manifestPath = path.join(outputDirectory, 'manifest.json');
const manifest = {
  protocol: 'pr11-blocks-resource-index-drop-rollback-phase-a-v1',
  status: 'running',
  startedAt: new Date().toISOString(),
  endedAt: null,
  phase: 'A-rollback-only-causal-proof',
  localOnly: true,
  productionTouched: false,
  stagingTouched: false,
  resetUsed: false,
  volumeDeletionUsed: false,
  waiverUsed: false,
  permanentDdlApplied: false,
  expectedGitHead,
  expectedMigrationHead,
  expectedLogicalBaseline,
  expectedPhysicalBaseline,
  candidateSqlExecutionCount: 0,
  gatesFrozenBeforeCandidate: false,
  fixedLimits,
  causalGateDefinition,
  cascadeGateDefinition,
  planGateDefinition,
  sqlInterface: sql,
  environment: {
    nodeVersion: process.version,
    platform: os.platform(),
    cpu: os.cpus()[0]?.model ?? null,
    cores: os.cpus().length,
    memoryBytes: os.totalmem(),
    freeMemoryBytesAtStart: os.freemem(),
    powerPlan: command('powercfg.exe', ['/getactivescheme']),
    gitHead: command('git', ['rev-parse', 'HEAD']),
    gitStatus: command('git', ['status', '--short']),
    psqlVersion: command(psql, ['--version']),
    supabaseVersion: command(supabaseCli, ['--version']),
    dockerDatabase: command('docker.exe', [
      'inspect',
      '--format',
      '{{json .Config.Image}}|{{json .State.StartedAt}}',
      'supabase_db_seikotsuin_management_saas',
    ]),
    dockerStats: command('docker.exe', [
      'stats',
      '--no-stream',
      '--format',
      '{{json .}}',
      'supabase_db_seikotsuin_management_saas',
    ]),
    toolHashes: {},
  },
  inputHashes: {},
  inputBundleSha256: null,
  frozenGatesSha256: null,
  steps: [],
  samples: [],
};

function saveManifest() {
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
}

let frozenInputHashes = null;

function currentInputHashes(paths) {
  return Object.fromEntries(
    [...paths]
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map(relative => [relative, fileSha(path.join(repoRoot, relative))])
  );
}

function assertInputsUnchanged() {
  if (frozenInputHashes === null) return;
  const current = currentInputHashes(Object.keys(frozenInputHashes));
  if (JSON.stringify(current) !== JSON.stringify(frozenInputHashes)) {
    throw new Error('Frozen Phase A input hash drift');
  }
}

function recordProcess(label, result, metadata) {
  const safe = label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const stdoutFile = path.join(outputDirectory, `${safe}.stdout.raw`);
  const stderrFile = path.join(outputDirectory, `${safe}.stderr.raw`);
  fs.writeFileSync(stdoutFile, result.stdout, 'utf8');
  fs.writeFileSync(stderrFile, result.stderr, 'utf8');
  manifest.steps.push({
    label,
    ...metadata,
    exitCode: result.exitCode,
    error: result.error,
    stdoutFile: path.basename(stdoutFile),
    stdoutSha256: fileSha(stdoutFile),
    stderrFile: path.basename(stderrFile),
    stderrSha256: fileSha(stderrFile),
  });
  saveManifest();
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.error}`);
  }
  return result.stdout;
}

function psqlArguments(applicationName) {
  return {
    env: {
      ...process.env,
      PGPASSWORD: 'postgres',
      PGAPPNAME: applicationName,
    },
  };
}

function psqlFile(label, sqlFile) {
  assertInputsUnchanged();
  const safe = label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const result = run(
    psql,
    [
      '-X',
      '-w',
      '-h',
      '127.0.0.1',
      '-p',
      '54332',
      '-U',
      'postgres',
      '-d',
      expectedDatabase,
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-A',
      '-t',
      '-F',
      fieldSeparator,
      '-f',
      path.join(sqlDirectory, sqlFile),
    ],
    psqlArguments(`pr11-index-drop-${safe}`)
  );
  return recordProcess(label, result, { sqlFile });
}

function psqlInline(label, statement) {
  assertInputsUnchanged();
  const safe = label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const result = run(
    psql,
    [
      '-X',
      '-w',
      '-h',
      '127.0.0.1',
      '-p',
      '54332',
      '-U',
      'postgres',
      '-d',
      expectedDatabase,
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-A',
      '-t',
      '-c',
      statement,
    ],
    psqlArguments(`pr11-index-drop-${safe}`)
  );
  return recordProcess(label, result, { inlineReadOnly: true });
}

function stablePhysicalRecords(output) {
  return jsonLines(output)
    .filter(value => {
      if (value.kind === 'table') {
        return normalizedRelations.has(`${value.schema}.${value.name}`);
      }
      if (value.kind === 'index') {
        return normalizedRelations.has(`${value.schema}.${value.table}`);
      }
      return false;
    })
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right), 'en')
    );
}

function assertQuiescentRuntime(output, label) {
  const runtime = jsonLines(output).filter(value => value.kind === 'runtime');
  if (runtime.length !== 1) {
    throw new Error(`${label} did not emit exactly one runtime snapshot`);
  }
  const value = runtime[0];
  if (
    value.active_other_clients !== 0 ||
    value.blocked_other_clients !== 0 ||
    value.vacuum_progress_count !== 0 ||
    value.create_index_progress_count !== 0 ||
    !Array.isArray(value.other_client_activity) ||
    value.other_client_activity.length !== 0
  ) {
    throw new Error(`${label} database runtime was not quiescent`);
  }
}

function assertLogicalSnapshot(value, label) {
  if (
    value.kind !== 'logical_snapshot' ||
    value.database !== expectedDatabase ||
    String(value.server_version_num) !== expectedServerVersion ||
    String(value.system_identifier) !== expectedSystemIdentifier ||
    String(value.migration_head) !== expectedMigrationHead
  ) {
    throw new Error(`${label} logical snapshot identity drift`);
  }
  const relationNames = Object.keys(value.relations ?? {}).sort();
  const expectedNames = [...normalizedRelations].sort();
  if (JSON.stringify(relationNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`${label} logical snapshot does not cover 17 relations`);
  }
}

let logicalBaseline = null;
let physicalBaseline = null;

function snapshot(label, includePhysical) {
  const logicalOutput = psqlFile(`${label}-logical`, sql.logical);
  const logicalRecords = jsonLines(logicalOutput).filter(
    value => value.kind === 'logical_snapshot'
  );
  if (logicalRecords.length !== 1) {
    throw new Error(`${label} emitted an invalid logical snapshot inventory`);
  }
  assertLogicalSnapshot(logicalRecords[0], label);
  // The official PR-11 packet hashes the stable JSON-record array, even when
  // the logical snapshot contains exactly one record.
  const logicalHash = sha(JSON.stringify(logicalRecords));
  if (logicalHash !== expectedLogicalBaseline) {
    throw new Error(
      `${label} logical snapshot differs from the official PR11 baseline`
    );
  }
  if (logicalBaseline === null) logicalBaseline = logicalHash;
  if (logicalHash !== logicalBaseline) {
    throw new Error(`${label} logical/catalog/data/ACL/RLS drift`);
  }

  let physicalHash = null;
  if (includePhysical) {
    const physicalOutput = psqlFile(`${label}-physical`, sql.physical);
    assertQuiescentRuntime(physicalOutput, label);
    const physicalRecords = stablePhysicalRecords(physicalOutput);
    const tables = physicalRecords.filter(value => value.kind === 'table');
    const tableNames = new Set(
      tables.map(value => `${value.schema}.${value.name}`)
    );
    if (
      tables.length !== normalizedRelations.size ||
      tableNames.size !== normalizedRelations.size ||
      [...normalizedRelations].some(name => !tableNames.has(name))
    ) {
      throw new Error(`${label} physical snapshot does not cover 17 relations`);
    }
    physicalHash = sha(JSON.stringify(physicalRecords));
    if (physicalHash !== expectedPhysicalBaseline) {
      throw new Error(
        `${label} physical snapshot differs from the official PR11 baseline`
      );
    }
    if (physicalBaseline === null) physicalBaseline = physicalHash;
    if (physicalHash !== physicalBaseline) {
      throw new Error(`${label} normalized physical drift`);
    }
  }
  return { logicalHash, physicalHash };
}

function parseFamily(output, family) {
  if (family === 'performance') return parsePerformanceRows(output);
  if (family === 'plan') return parsePlanEvidence(output);
  if (family === 'cascade') return parseCascadeEvidence(output);
  if (family === 'integrity') return parseIntegrityEvidence(output);
  throw new Error(`Unknown sample family: ${family}`);
}

function normalizedSample({
  id,
  family,
  state,
  sqlFile,
  pair = null,
  candidate,
}) {
  psqlFile(`${id}-preflight`, sql.preflight);
  psqlFile(`${id}-normalize`, sql.normalize);
  psqlFile(`${id}-normalized-preflight`, sql.preflight);
  const before = snapshot(`${id}-before`, true);
  if (candidate) manifest.candidateSqlExecutionCount += 1;
  const output = psqlFile(id, sqlFile);
  psqlFile(`${id}-postflight`, sql.preflight);
  const afterLogical = snapshot(`${id}-after`, false);
  psqlFile(`${id}-post-normalize`, sql.normalize);
  psqlFile(`${id}-normalized-postflight`, sql.preflight);
  const normalizedAfter = snapshot(`${id}-normalized-after`, true);
  const rows = parseFamily(output, family);
  const parsedFile = path.join(outputDirectory, `${id}.parsed.json`);
  fs.writeFileSync(parsedFile, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  manifest.samples.push({
    id,
    family,
    state,
    pair,
    candidate,
    sqlFile,
    before,
    afterLogical,
    normalizedAfter,
    restorationPass:
      before.logicalHash === afterLogical.logicalHash &&
      before.logicalHash === normalizedAfter.logicalHash &&
      before.physicalHash === normalizedAfter.physicalHash,
    parsedFile: path.basename(parsedFile),
    parsedSha256: fileSha(parsedFile),
  });
  saveManifest();
}

function alternatingOrder(family, currentFile, candidateFile) {
  return [
    {
      id: `${family}-pair1-current`,
      family,
      state: 'current',
      pair: 1,
      sqlFile: currentFile,
      candidate: false,
    },
    {
      id: `${family}-pair1-candidate`,
      family,
      state: 'candidate',
      pair: 1,
      sqlFile: candidateFile,
      candidate: true,
    },
    {
      id: `${family}-pair2-candidate`,
      family,
      state: 'candidate',
      pair: 2,
      sqlFile: candidateFile,
      candidate: true,
    },
    {
      id: `${family}-pair2-current`,
      family,
      state: 'current',
      pair: 2,
      sqlFile: currentFile,
      candidate: false,
    },
    {
      id: `${family}-pair3-current`,
      family,
      state: 'current',
      pair: 3,
      sqlFile: currentFile,
      candidate: false,
    },
    {
      id: `${family}-pair3-candidate`,
      family,
      state: 'candidate',
      pair: 3,
      sqlFile: candidateFile,
      candidate: true,
    },
  ];
}

function sampleRows(family, state) {
  return manifest.samples
    .filter(sample => sample.family === family && sample.state === state)
    .map(sample => ({
      sample,
      rows: JSON.parse(
        fs.readFileSync(path.join(outputDirectory, sample.parsedFile), 'utf8')
      ),
    }));
}

function findProbe(rows, probe) {
  const row = rows.find(value => value.probe === probe);
  if (!row) throw new Error(`Missing probe ${probe}`);
  return row;
}

function indexNamesInPlan(rawPlan) {
  const names = [];
  walk(rawPlan, node => {
    const name = firstDefined(node, ['Index Name', 'index_name', 'indexName']);
    if (typeof name === 'string') names.push(name);
  });
  return [...new Set(names)];
}

function performancePlanContract(samples) {
  const requiredPaths = {
    created_by_read_100_of_20000: 'blocks_created_by_idx',
    existing_recipient_customer_path:
      'patient_outreach_recipients_customer_idx',
    existing_recipient_campaign_path:
      'patient_outreach_recipients_campaign_idx',
    existing_reservation_campaign_path: 'reservations_campaign_id_idx',
  };
  const contracts = samples.map(({ sample, rows }) => ({
    sample: sample.id,
    probes: Object.fromEntries(
      Object.entries(requiredPaths).map(([probe, expectedIndex]) => {
        const indexes = indexNamesInPlan(findProbe(rows, probe).rawPlan);
        return [
          probe,
          { expectedIndex, indexes, pass: indexes.includes(expectedIndex) },
        ];
      })
    ),
  }));
  return {
    contracts,
    pass: contracts.every(contract =>
      Object.values(contract.probes).every(value => value.pass)
    ),
  };
}

function planContract(row, state) {
  const nodes = [];
  walk(row.rawPlan, node => {
    const nodeType = firstDefined(node, ['Node Type', 'node_type', 'nodeType']);
    if (typeof nodeType === 'string') nodes.push(node);
  });
  const indexes = indexNamesInPlan(row.rawPlan);
  const expectedIndexes = planGateDefinition[row.probe];
  const targetSeqScan = nodes.some(node => {
    const nodeType = firstDefined(node, ['Node Type', 'node_type', 'nodeType']);
    const relation = firstDefined(node, [
      'Relation Name',
      'relation_name',
      'relationName',
    ]);
    return nodeType === 'Seq Scan' && relation === 'blocks';
  });
  const rowCountPass =
    row.actualRows === row.expectedRows && row.expectedRows > 0;
  const targetSeqScanPass = !targetSeqScan;
  const candidateIndexPass = expectedIndexes.some(indexName =>
    indexes.includes(indexName)
  );
  const hardGateApplicable = state === 'candidate';
  return {
    state,
    probe: row.probe,
    actualRows: row.actualRows,
    expectedRows: row.expectedRows,
    indexes,
    expectedIndexes,
    targetSeqScan,
    rowCountPass,
    targetSeqScanPass,
    candidateIndexPass: hardGateApplicable ? candidateIndexPass : null,
    hardGateApplicable,
    hardGatePass:
      hardGateApplicable &&
      rowCountPass &&
      targetSeqScanPass &&
      candidateIndexPass,
  };
}

function buildSummary() {
  const currentPerformance = sampleRows('performance', 'current');
  const candidatePerformance = sampleRows('performance', 'candidate');
  if (currentPerformance.length !== 3 || candidatePerformance.length !== 3) {
    throw new Error('Performance evidence does not contain all six samples');
  }

  const fixedPerformance = {};
  for (const [probe, limit] of Object.entries(fixedLimits)) {
    const currentRows = currentPerformance.map(({ rows }) =>
      findProbe(rows, probe)
    );
    const candidateRows = candidatePerformance.map(({ rows }) =>
      findProbe(rows, probe)
    );
    const candidateExecutionMedian = median(
      candidateRows.map(row => row.executionMs)
    );
    const candidateWalMedian =
      limit.walBytes === undefined
        ? null
        : median(candidateRows.map(row => row.walBytes));
    fixedPerformance[probe] = {
      currentExecutionValues: currentRows.map(row => row.executionMs),
      currentExecutionMedian: median(currentRows.map(row => row.executionMs)),
      candidateExecutionValues: candidateRows.map(row => row.executionMs),
      candidateExecutionMedian,
      fixedExecutionLimit: limit.executionMs,
      executionPass: candidateExecutionMedian <= limit.executionMs,
      currentWalValues: currentRows.map(row => row.walBytes),
      currentWalMedian:
        limit.walBytes === undefined
          ? null
          : median(currentRows.map(row => row.walBytes)),
      candidateWalValues: candidateRows.map(row => row.walBytes),
      candidateWalMedian,
      fixedWalLimit: limit.walBytes ?? null,
      walPass:
        limit.walBytes === undefined
          ? null
          : candidateWalMedian <= limit.walBytes,
      pass:
        candidateExecutionMedian <= limit.executionMs &&
        (limit.walBytes === undefined || candidateWalMedian <= limit.walBytes),
    };
  }

  const causal = {};
  for (const probe of causalGateDefinition.probes) {
    const pairs = [1, 2, 3].map(pair => {
      const currentSample = currentPerformance.find(
        value => value.sample.pair === pair
      );
      const candidateSample = candidatePerformance.find(
        value => value.sample.pair === pair
      );
      if (!currentSample || !candidateSample) {
        throw new Error(`Missing performance pair ${pair}`);
      }
      const current = findProbe(currentSample.rows, probe);
      const candidate = findProbe(candidateSample.rows, probe);
      return {
        pair,
        currentExecutionMs: current.executionMs,
        candidateExecutionMs: candidate.executionMs,
        executionWin: candidate.executionMs < current.executionMs,
        currentWalRecords: current.walRecords,
        candidateWalRecords: candidate.walRecords,
        walRecordsPass: candidate.walRecords <= current.walRecords,
        currentWalBytes: current.walBytes,
        candidateWalBytes: candidate.walBytes,
        walBytesPass: candidate.walBytes <= current.walBytes,
      };
    });
    const currentMedian = fixedPerformance[probe].currentExecutionMedian;
    const candidateMedian = fixedPerformance[probe].candidateExecutionMedian;
    causal[probe] = {
      currentMedian,
      candidateMedian,
      medianImprovementMs: currentMedian - candidateMedian,
      medianStrictlyImproved: candidateMedian < currentMedian,
      executionPairWins: pairs.filter(value => value.executionWin).length,
      pairCount: pairs.length,
      everyPairWalRecordsPass: pairs.every(value => value.walRecordsPass),
      everyPairWalBytesPass: pairs.every(value => value.walBytesPass),
      allSamplesAccepted: pairs.length === 3,
      pairs,
      pass:
        candidateMedian < currentMedian &&
        pairs.filter(value => value.executionWin).length >= 2 &&
        pairs.every(value => value.walRecordsPass && value.walBytesPass),
    };
  }

  const performancePlans = performancePlanContract(candidatePerformance);

  const currentPlanSamples = sampleRows('plan', 'current');
  const candidatePlanSamples = sampleRows('plan', 'candidate');
  if (currentPlanSamples.length !== 1 || candidatePlanSamples.length !== 1) {
    throw new Error('Plan evidence inventory is incomplete');
  }
  const currentPlanContracts = currentPlanSamples[0].rows.map(row =>
    planContract(row, 'current')
  );
  const candidatePlanContracts = candidatePlanSamples[0].rows.map(row =>
    planContract(row, 'candidate')
  );
  const plans = {
    current: currentPlanContracts,
    candidate: candidatePlanContracts,
    currentDiagnosticPass: currentPlanContracts.every(
      value => value.rowCountPass && value.targetSeqScanPass
    ),
    pass: candidatePlanContracts.every(value => value.hardGatePass),
  };

  const currentCascade = sampleRows('cascade', 'current');
  const candidateCascade = sampleRows('cascade', 'candidate');
  if (currentCascade.length !== 3 || candidateCascade.length !== 3) {
    throw new Error('Cascade evidence does not contain all six samples');
  }
  const currentCascadeRows = currentCascade.map(value => value.rows[0]);
  const candidateCascadeRows = candidateCascade.map(value => value.rows[0]);
  const currentCascadeExecutionMedian = median(
    currentCascadeRows.map(value => value.executionMs)
  );
  const candidateCascadeExecutionMedian = median(
    candidateCascadeRows.map(value => value.executionMs)
  );
  const currentCascadeWalMedian = median(
    currentCascadeRows.map(value => value.walBytes)
  );
  const candidateCascadeWalMedian = median(
    candidateCascadeRows.map(value => value.walBytes)
  );
  const cascadeExecutionLimit =
    currentCascadeExecutionMedian +
    Math.max(currentCascadeExecutionMedian * 0.25, 50);
  const cascadeWalLimit = currentCascadeWalMedian * 1.25;
  const cascadeSampleContractPass = [
    ...currentCascadeRows,
    ...candidateCascadeRows,
  ].every(
    value =>
      value.deletedRows === cascadeGateDefinition.deletedRowsPerSample &&
      value.lockTimeout === false
  );
  const cascade = {
    currentExecutionValues: currentCascadeRows.map(value => value.executionMs),
    currentExecutionMedian: currentCascadeExecutionMedian,
    candidateExecutionValues: candidateCascadeRows.map(
      value => value.executionMs
    ),
    candidateExecutionMedian: candidateCascadeExecutionMedian,
    candidateExecutionLimit: cascadeExecutionLimit,
    executionPass: candidateCascadeExecutionMedian <= cascadeExecutionLimit,
    currentWalValues: currentCascadeRows.map(value => value.walBytes),
    currentWalMedian: currentCascadeWalMedian,
    candidateWalValues: candidateCascadeRows.map(value => value.walBytes),
    candidateWalMedian: candidateCascadeWalMedian,
    candidateWalLimit: cascadeWalLimit,
    walPass: candidateCascadeWalMedian <= cascadeWalLimit,
    sampleContractPass: cascadeSampleContractPass,
    pass:
      candidateCascadeExecutionMedian <= cascadeExecutionLimit &&
      candidateCascadeWalMedian <= cascadeWalLimit &&
      cascadeSampleContractPass,
  };

  const integritySamples = sampleRows('integrity', 'candidate');
  if (integritySamples.length !== 1) {
    throw new Error('Integrity evidence sample is missing');
  }
  const integrityCases = integritySamples[0].rows.filter(
    value => value.kind === 'blocks_resource_index_integrity_case'
  );
  const integritySummary = integritySamples[0].rows.find(
    value => value.kind === 'blocks_resource_index_integrity_summary'
  );
  const declaredCaseCount = firstDefined(integritySummary, [
    'case_count',
    'cases',
  ]);
  const integrity = {
    cases: integrityCases.length,
    summary: integritySummary,
    pass:
      integrityCases.length > 0 &&
      integrityCases.every(evidenceBoolean) &&
      evidenceBoolean(integritySummary) &&
      (declaredCaseCount === undefined ||
        finiteNumber(declaredCaseCount, 'integrity case count') ===
          integrityCases.length),
  };

  const expectedSampleCount = 15;
  const restoration = {
    expectedSampleCount,
    actualSampleCount: manifest.samples.length,
    logicalBaseline,
    physicalBaseline,
    expectedLogicalBaseline,
    expectedPhysicalBaseline,
    allSamplesRestored: manifest.samples.every(
      sample => sample.restorationPass === true
    ),
    pass:
      manifest.samples.length === expectedSampleCount &&
      logicalBaseline === expectedLogicalBaseline &&
      physicalBaseline === expectedPhysicalBaseline &&
      manifest.samples.every(sample => sample.restorationPass === true),
  };

  const summary = {
    protocol: manifest.protocol,
    waiverUsed: false,
    fixedLimits,
    fixedGateCount: { execution: 7, wal: 6 },
    fixedPerformance,
    fixedPerformancePass: Object.values(fixedPerformance).every(
      value => value.pass
    ),
    performancePlanContract: performancePlans,
    causalGateDefinition,
    causal,
    causalPass: Object.values(causal).every(value => value.pass),
    planGateDefinition,
    plans,
    cascadeGateDefinition,
    cascade,
    integrity,
    restoration,
    candidateSqlExecutionCount: manifest.candidateSqlExecutionCount,
    expectedCandidateSqlExecutionCount: 8,
    inputBundleSha256: manifest.inputBundleSha256,
    frozenGatesSha256: manifest.frozenGatesSha256,
    permanentMigrationAuthorized: false,
    stagingOrProductionAuthorized: false,
    generalCommercialReleaseEligible: false,
  };
  summary.primaryPass =
    summary.fixedPerformancePass &&
    performancePlans.pass &&
    summary.causalPass &&
    plans.pass &&
    cascade.pass &&
    integrity.pass &&
    restoration.pass &&
    manifest.candidateSqlExecutionCount === 8;
  summary.phaseAResult = summary.primaryPass ? 'PASS' : 'FAIL';
  return summary;
}

function validateSqlInputs() {
  for (const file of requiredPhaseASql) {
    const absolute = path.join(sqlDirectory, file);
    if (!fs.existsSync(absolute))
      throw new Error(`Missing Phase A SQL: ${file}`);
  }

  const plannerGuc =
    '(?:enable_(?:seqscan|bitmapscan|indexscan|indexonlyscan)|random_page_cost|seq_page_cost|cpu_(?:tuple|index_tuple|operator)_cost|work_mem|plan_cache_mode)';
  const plannerSet = new RegExp(
    `\\bset\\s+(?:(?:local|session)\\s+)?"?${plannerGuc}"?\\s*(?:=|to\\b)`,
    'i'
  );
  const plannerSetConfig = new RegExp(
    `\\bset_config\\s*\\(\\s*['"]${plannerGuc}['"]\\s*,`,
    'i'
  );
  for (const file of [
    ...requiredPhaseASql,
    ...optionalSharedSql.filter(name =>
      fs.existsSync(path.join(sqlDirectory, name))
    ),
  ]) {
    const source = stripSqlComments(
      fs.readFileSync(path.join(sqlDirectory, file), 'utf8')
    );
    if (plannerSet.test(source) || plannerSetConfig.test(source)) {
      throw new Error(`Planner forcing is forbidden in Phase A SQL: ${file}`);
    }
    const standaloneAnalyze =
      source.match(/(?:^|;)\s*analyze\b[^;]*;/gim) ?? [];
    if (
      standaloneAnalyze.length > 0 &&
      (file !== sql.planProbe ||
        standaloneAnalyze.length !== 1 ||
        !/^analyze\s+public\.blocks\s*;$/i.test(
          standaloneAnalyze[0].replace(/^;\s*/, '').trim()
        ))
    ) {
      throw new Error(
        `Standalone ANALYZE is not approved in Phase A SQL: ${file}`
      );
    }
  }

  const ddlSource = stripSqlComments(
    fs.readFileSync(path.join(sqlDirectory, sql.ddl), 'utf8')
  ).toLowerCase();
  const expectedDrops =
    ddlSource.match(/\bdrop\s+index\s+public\.idx_blocks_resource_id\s*;/g) ??
    [];
  if (expectedDrops.length !== 1) {
    throw new Error('Candidate DDL must drop exactly idx_blocks_resource_id');
  }
  const otherDropIndex = ddlSource
    .replace(/\bdrop\s+index\s+public\.idx_blocks_resource_id\s*;/g, ' ')
    .match(/\bdrop\s+index\b/g);
  if (
    otherDropIndex ||
    /\b(drop|alter)\s+(table|constraint|trigger|policy)\b/.test(ddlSource) ||
    /\b(create\s+index|reindex|vacuum|analyze|grant|revoke)\b/.test(
      ddlSource
    ) ||
    /\brow\s+level\s+security\b/.test(ddlSource)
  ) {
    throw new Error('Candidate DDL exceeds the single-index-drop scope');
  }

  const candidateWrappers = [
    sql.performanceCandidate,
    sql.planCandidate,
    sql.cascadeCandidate,
    sql.integrity,
  ];
  for (const file of candidateWrappers) {
    const source = fs.readFileSync(path.join(sqlDirectory, file), 'utf8');
    if (!source.includes(sql.ddl)) {
      throw new Error(`${file} does not reference the exact candidate DDL`);
    }
  }
  for (const file of [
    sql.performanceCurrent,
    sql.planCurrent,
    sql.cascadeCurrent,
  ]) {
    const source = fs.readFileSync(path.join(sqlDirectory, file), 'utf8');
    if (source.includes(sql.ddl)) {
      throw new Error(`${file} unexpectedly references candidate DDL`);
    }
  }
  for (const file of [sql.performanceCurrent, sql.performanceCandidate]) {
    const source = fs.readFileSync(path.join(sqlDirectory, file), 'utf8');
    if (!source.includes(sql.performanceProbe)) {
      throw new Error(
        `${file} does not reference the canonical performance probe`
      );
    }
  }
}

function collectSqlDependencies(entryFiles) {
  const collected = new Set();
  const pending = entryFiles.map(file => path.join(sqlDirectory, file));
  while (pending.length > 0) {
    const absolute = path.resolve(pending.pop());
    const relative = path.relative(repoRoot, absolute);
    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative) ||
      !relative.endsWith('.sql')
    ) {
      throw new Error(
        `Phase A SQL include escapes the repository: ${absolute}`
      );
    }
    const repositoryRelative = relative.split(path.sep).join('/');
    if (collected.has(repositoryRelative)) continue;
    if (!fs.existsSync(absolute)) {
      throw new Error(`Missing Phase A SQL dependency: ${repositoryRelative}`);
    }
    collected.add(repositoryRelative);
    const source = fs.readFileSync(absolute, 'utf8');
    for (const match of source.matchAll(/^\\ir\s+([^\s]+)\s*$/gm)) {
      pending.push(path.resolve(path.dirname(absolute), match[1]));
    }
  }
  return [...collected].sort((left, right) => left.localeCompare(right, 'en'));
}

let exitCode = 1;
try {
  saveManifest();
  if (!process.version.startsWith('v24.')) {
    throw new Error('Node 24 is required');
  }
  for (const required of [psql, supabaseCli, supabaseArchive]) {
    if (!fs.existsSync(required)) {
      throw new Error(`Missing required tool: ${required}`);
    }
  }
  manifest.environment.toolHashes = {
    supabaseCliSha256: fileSha(supabaseCli),
    supabaseArchiveSha256: fileSha(supabaseArchive),
  };
  if (
    manifest.environment.toolHashes.supabaseCliSha256 !== expectedCliSha ||
    manifest.environment.toolHashes.supabaseArchiveSha256 !== expectedArchiveSha
  ) {
    throw new Error('Pinned Supabase CLI hash mismatch');
  }
  if (
    manifest.environment.supabaseVersion.exitCode !== 0 ||
    manifest.environment.supabaseVersion.stdout.trim() !==
      expectedSupabaseVersion
  ) {
    throw new Error('Supabase CLI 2.109.0 is required');
  }
  if (
    manifest.environment.gitHead.exitCode !== 0 ||
    manifest.environment.gitHead.stdout.trim() !== expectedGitHead
  ) {
    throw new Error('Phase A base git SHA drift');
  }

  validateSqlInputs();
  const sqlDependencies = collectSqlDependencies([
    ...requiredPhaseASql,
    sql.performanceProbe,
    sql.logical,
    sql.physical,
    sql.normalize,
  ]);
  const inputPaths = new Set([
    'scripts/commercial-hardening/run-pr11-blocks-resource-index-drop-rollback.mjs',
    'scripts/commercial-hardening/sql/pr11-performance-probe.sql',
    'scripts/commercial-hardening/sql/pr11-postapply-logical-snapshot.sql',
    'scripts/commercial-hardening/sql/pr11-paired-physical-snapshot.sql',
    'scripts/commercial-hardening/sql/pr11-postapply-normalize.sql',
    'supabase/migrations/20260718011731_commercial_pr11_fixed_performance_forward_fix.sql',
    'docs/stabilization/spec-commercial-performance-safe-indexes-rls-plan-v1.0.md',
    'docs/stabilization/spec-commercial-pr11-blocks-resource-index-retirement-v1.0.md',
    'scripts/commercial-hardening/run-red-contracts.mjs',
    'scripts/commercial-hardening/red-contracts/14_pr11_blocks_resource_index_retirement.sql',
    'src/__tests__/security/commercial-pr11-blocks-resource-index-retirement-contract.test.ts',
    ...sqlDependencies,
  ]);
  frozenInputHashes = currentInputHashes(inputPaths);
  manifest.inputHashes = frozenInputHashes;
  manifest.inputBundleSha256 = sha(JSON.stringify(frozenInputHashes));
  if (
    frozenInputHashes[
      'scripts/commercial-hardening/sql/pr11-performance-probe.sql'
    ] !== canonicalPerformanceProbeSha
  ) {
    throw new Error('Canonical performance probe hash drift');
  }

  const frozenGates = {
    protocol: manifest.protocol,
    frozenAt: new Date().toISOString(),
    expectedGitHead,
    expectedMigrationHead,
    expectedLogicalBaseline,
    expectedPhysicalBaseline,
    candidateSqlExecutionCount: manifest.candidateSqlExecutionCount,
    gatesFrozenBeforeCandidate: manifest.candidateSqlExecutionCount === 0,
    waiverUsed: false,
    inputBundleSha256: manifest.inputBundleSha256,
    inputHashes: frozenInputHashes,
    fixedLimits,
    causalGateDefinition,
    cascadeGateDefinition,
    planGateDefinition,
  };
  const frozenGatesPath = path.join(outputDirectory, 'frozen-gates.json');
  fs.writeFileSync(
    frozenGatesPath,
    `${JSON.stringify(frozenGates, null, 2)}\n`,
    'utf8'
  );
  manifest.gatesFrozenBeforeCandidate = frozenGates.gatesFrozenBeforeCandidate;
  manifest.frozenGatesSha256 = fileSha(frozenGatesPath);
  saveManifest();

  psqlFile('initial-preflight', sql.preflight);
  const identityOutput = psqlInline(
    'database-identity',
    `select jsonb_build_object('kind','runner_database_identity','database',current_database(),'server_version_num',current_setting('server_version_num'),'system_identifier',(select system_identifier::text from pg_control_system()),'migration_head',(select max(version) from supabase_migrations.schema_migrations));`
  );
  const identities = jsonLines(identityOutput).filter(
    value => value.kind === 'runner_database_identity'
  );
  if (
    identities.length !== 1 ||
    identities[0].database !== expectedDatabase ||
    String(identities[0].server_version_num) !== expectedServerVersion ||
    String(identities[0].system_identifier) !== expectedSystemIdentifier ||
    String(identities[0].migration_head) !== expectedMigrationHead
  ) {
    throw new Error('Runner database identity drift');
  }
  fs.writeFileSync(
    path.join(outputDirectory, 'database-identity.parsed.json'),
    `${JSON.stringify(identities[0], null, 2)}\n`,
    'utf8'
  );

  psqlFile('initial-normalize', sql.normalize);
  psqlFile('initial-normalized-preflight', sql.preflight);
  snapshot('initial-clean', true);

  for (const sample of alternatingOrder(
    'performance',
    sql.performanceCurrent,
    sql.performanceCandidate
  )) {
    normalizedSample(sample);
  }

  normalizedSample({
    id: 'plan-current',
    family: 'plan',
    state: 'current',
    sqlFile: sql.planCurrent,
    candidate: false,
  });
  normalizedSample({
    id: 'plan-candidate',
    family: 'plan',
    state: 'candidate',
    sqlFile: sql.planCandidate,
    candidate: true,
  });

  for (const sample of alternatingOrder(
    'cascade',
    sql.cascadeCurrent,
    sql.cascadeCandidate
  )) {
    normalizedSample(sample);
  }

  normalizedSample({
    id: 'integrity-candidate',
    family: 'integrity',
    state: 'candidate',
    sqlFile: sql.integrity,
    candidate: true,
  });

  psqlFile('final-normalize', sql.normalize);
  psqlFile('final-postflight', sql.preflight);
  snapshot('final-clean', true);

  const summary = buildSummary();
  const summaryPath = path.join(outputDirectory, 'experiment-summary.json');
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );
  manifest.summarySha256 = fileSha(summaryPath);
  manifest.status = summary.primaryPass ? 'pass' : 'gate-fail';
  exitCode = summary.primaryPass ? 0 : 2;
} catch (error) {
  manifest.status = 'safety-fail';
  manifest.error = error instanceof Error ? error.stack : String(error);
  try {
    psqlFile('emergency-postflight', sql.preflight);
    psqlFile('emergency-normalize', sql.normalize);
    snapshot('emergency-clean', true);
  } catch (recoveryError) {
    manifest.recoveryError =
      recoveryError instanceof Error
        ? recoveryError.stack
        : String(recoveryError);
  }
} finally {
  manifest.endedAt = new Date().toISOString();
  saveManifest();
}

process.exitCode = exitCode;
