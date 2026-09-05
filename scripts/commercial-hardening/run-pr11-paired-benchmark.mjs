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
const psqlExecutable = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const supabaseCliExecutable = 'C:\\tmp\\supabase-cli-2.109.0\\supabase.exe';
const supabaseCliArchive =
  'C:\\tmp\\supabase-cli-2.109.0\\supabase_windows_amd64.tar.gz';
const expectedSupabaseCliSha256 =
  '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118';
const expectedSupabaseCliArchiveSha256 =
  '4ea5b92ae679323cde0e69ca92b801c3fc705c8351bdff50cb3b8eff6926f5c7';

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

const sqlFiles = {
  normalize: 'pr11-paired-normalize.sql',
  postflight: 'pr11-paired-postflight.sql',
  physical: 'pr11-paired-physical-snapshot.sql',
  performanceBefore: 'pr11-paired-performance-before.sql',
  performanceAfter: 'pr11-performance-probe.sql',
  rlsBefore: 'pr11-paired-rls-before.sql',
  rlsAfter: 'pr11-rls-plan-probe.sql',
};

const fixedLimits = {
  performance: {
    created_by_read_100_of_20000: { executionMs: 2.851 },
    sparse_insert_10000: {
      executionMs: 435.7373,
      walBytes: 9_292_168.2,
    },
    dense_insert_10000: {
      executionMs: 521.55125,
      walBytes: 11_133_665,
    },
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
  },
  rls: {
    customer_insurance_coverages: { executionMs: 66.757 },
    menu_billing_profiles: { executionMs: 63.3855 },
  },
};

function parseArguments(argumentsList) {
  const parsed = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw new Error(
        'Usage: --mode rehearsal|official --output <new-directory>'
      );
    }
    parsed.set(key.slice(2), value);
  }
  return parsed;
}

function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function runCapture(executable, argumentsList, options = {}) {
  const result = spawnSync(executable, argumentsList, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
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

function commandEvidence(executable, argumentsList) {
  const result = runCapture(executable, argumentsList);
  return {
    command: [executable, ...argumentsList],
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    error: result.error,
  };
}

function numericOrNull(value) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function jsonLines(rawOutput) {
  return rawOutput
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line));
}

function parsePerformance(rawOutput) {
  return rawOutput
    .split(/\r?\n/)
    .map(line => line.split(fieldSeparator))
    .filter(columns => columns.length === 8)
    .map(columns => ({
      probe: columns[0],
      executionMs: numericOrNull(columns[1]),
      walRecords: numericOrNull(columns[2]),
      walBytes: numericOrNull(columns[3]),
      sharedDirtiedBlocks: numericOrNull(columns[4]),
      rootNode: columns[5] || null,
      rawPlanMd5: columns[6] || null,
      rawPlan: columns[7] ? JSON.parse(columns[7]) : null,
    }));
}

function parseRls(rawOutput) {
  const planValues = jsonLines(rawOutput).filter(
    value => typeof value.probe === 'string'
  );
  const policyValues = rawOutput
    .split(/\r?\n/)
    .map(line => line.split(fieldSeparator))
    .filter(
      columns =>
        columns.length === 3 &&
        (columns[0] === 'customer_insurance_coverages' ||
          columns[0] === 'menu_billing_profiles')
    )
    .map(columns => ({
      kind: 'policy_count',
      table: columns[0],
      selectPolicyCount: numericOrNull(columns[1]),
      selectPolicyNames: columns[2] || null,
    }));
  return [...planValues, ...policyValues];
}

function physicalKey(value) {
  if (value.kind === 'table') {
    return `table:${value.schema}.${value.name}`;
  }
  if (value.kind === 'index') {
    return `index:${value.schema}.${value.table}.${value.name}`;
  }
  return null;
}

function physicalRelationName(value) {
  if (value.kind === 'table') {
    return `${value.schema}.${value.name}`;
  }
  if (value.kind === 'index') {
    return `${value.schema}.${value.table}`;
  }
  return null;
}

function requireBoolean(value, description) {
  if (typeof value !== 'boolean') {
    throw new Error(`Missing or non-boolean ${description}`);
  }
  return value;
}

function physicalState(value) {
  if (value.kind === 'table') {
    return {
      kind: 'table',
      totalBytes: requireFiniteNumber(value.total_bytes, 'table total_bytes'),
      heapBytes: requireFiniteNumber(value.heap_bytes, 'table heap_bytes'),
      indexBytes: requireFiniteNumber(value.index_bytes, 'table index_bytes'),
      relpages: requireFiniteNumber(value.relpages, 'table relpages'),
      reltuples: requireFiniteNumber(value.reltuples, 'table reltuples'),
      liveTuples: requireFiniteNumber(value.n_live_tup, 'table n_live_tup'),
      deadTuples: requireFiniteNumber(value.n_dead_tup, 'table n_dead_tup'),
    };
  }
  if (value.kind === 'index') {
    if (typeof value.definition_md5 !== 'string' || !value.definition_md5) {
      throw new Error('Missing index definition_md5');
    }
    return {
      kind: 'index',
      bytes: requireFiniteNumber(value.bytes, 'index bytes'),
      relpages: requireFiniteNumber(value.relpages, 'index relpages'),
      reltuples: requireFiniteNumber(value.reltuples, 'index reltuples'),
      valid: requireBoolean(value.valid, 'index valid'),
      ready: requireBoolean(value.ready, 'index ready'),
      live: requireBoolean(value.live, 'index live'),
      definitionMd5: value.definition_md5,
    };
  }
  throw new Error(`Unexpected physical snapshot kind: ${String(value.kind)}`);
}

function physicalStateRecords(values, normalizedOnly = false) {
  const records = new Map();
  const normalizedTablesSeen = new Set();
  for (const value of values) {
    const key = physicalKey(value);
    const relationName = physicalRelationName(value);
    if (!key || !relationName) {
      continue;
    }
    if (normalizedOnly && !normalizedRelations.has(relationName)) {
      continue;
    }
    if (records.has(key)) {
      throw new Error(`Duplicate physical snapshot key: ${key}`);
    }
    records.set(key, physicalState(value));
    if (value.kind === 'table' && normalizedRelations.has(relationName)) {
      normalizedTablesSeen.add(relationName);
    }
  }

  if (
    normalizedOnly &&
    normalizedTablesSeen.size !== normalizedRelations.size
  ) {
    const missing = [...normalizedRelations].filter(
      relationName => !normalizedTablesSeen.has(relationName)
    );
    throw new Error(
      `Physical snapshot is missing normalized tables: ${missing.join(', ')}`
    );
  }

  return [...records.entries()]
    .map(([key, state]) => ({ key, state }))
    .sort((left, right) => left.key.localeCompare(right.key, 'en'));
}

function physicalBytes(state) {
  return state.kind === 'table' ? state.totalBytes : state.bytes;
}

function buildPhysicalDiff(beforeValues, afterValues) {
  const beforeByKey = new Map(
    physicalStateRecords(beforeValues).map(record => [record.key, record.state])
  );
  const afterByKey = new Map(
    physicalStateRecords(afterValues).map(record => [record.key, record.state])
  );

  const differences = [];
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
  for (const key of keys) {
    const beforeState = beforeByKey.get(key) ?? null;
    const afterState = afterByKey.get(key) ?? null;
    if (JSON.stringify(beforeState) !== JSON.stringify(afterState)) {
      const beforeBytes = beforeState ? physicalBytes(beforeState) : null;
      const afterBytes = afterState ? physicalBytes(afterState) : null;
      const fieldNames = new Set([
        ...Object.keys(beforeState ?? {}),
        ...Object.keys(afterState ?? {}),
      ]);
      differences.push({
        key,
        beforeBytes,
        afterBytes,
        deltaBytes:
          beforeBytes === null || afterBytes === null
            ? null
            : afterBytes - beforeBytes,
        changedFields: [...fieldNames].filter(
          fieldName => beforeState?.[fieldName] !== afterState?.[fieldName]
        ),
        beforeState,
        afterState,
      });
    }
  }
  return differences.sort((left, right) =>
    left.key.localeCompare(right.key, 'en')
  );
}

function median(values) {
  if (
    values.some(value => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw new Error('Median refused a missing or non-finite metric');
  }
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length !== 3) {
    throw new Error(
      `Expected exactly three values, received ${ordered.length}`
    );
  }
  return ordered[1];
}

function requireExactlyOne(values, description) {
  if (values.length !== 1) {
    throw new Error(
      `Expected exactly one ${description}, received ${values.length}`
    );
  }
  return values[0];
}

function requireFiniteNumber(value, description) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing or non-finite ${description}`);
  }
  return value;
}

function collectPlanIndexNames(value, names = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPlanIndexNames(item, names);
    }
    return names;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'Index Name' && typeof child === 'string') {
        names.add(child);
      }
      collectPlanIndexNames(child, names);
    }
  }
  return names;
}

function rlsFilterHasBroadStaffScope(value) {
  return (
    value ===
    "(app_private.can_access_clinic(clinic_id) AND (app_private.get_current_role() = ANY ('{admin,clinic_admin,manager,therapist,staff}'::text[])))"
  );
}

const argumentsMap = parseArguments(process.argv.slice(2));
const mode = argumentsMap.get('mode');
const outputArgument = argumentsMap.get('output');
if ((mode !== 'rehearsal' && mode !== 'official') || !outputArgument) {
  throw new Error('Usage: --mode rehearsal|official --output <new-directory>');
}

const outputDirectory = path.resolve(repoRoot, outputArgument);
if (fs.existsSync(outputDirectory)) {
  throw new Error(`Output directory already exists: ${outputDirectory}`);
}
fs.mkdirSync(outputDirectory, { recursive: true });

if (!fs.existsSync(psqlExecutable)) {
  throw new Error(`Pinned psql executable is missing: ${psqlExecutable}`);
}
if (!fs.existsSync(supabaseCliExecutable)) {
  throw new Error(`Pinned Supabase CLI is missing: ${supabaseCliExecutable}`);
}
if (!fs.existsSync(supabaseCliArchive)) {
  throw new Error(
    `Verified Supabase CLI archive is missing: ${supabaseCliArchive}`
  );
}

const startedAt = new Date().toISOString();
const manifestPath = path.join(outputDirectory, 'manifest.json');
const gitDiff = runCapture('git', ['diff', '--binary', 'HEAD']);
const manifest = {
  protocol: 'pr11-local-paired-rerun-v1',
  mode,
  startedAt,
  endedAt: null,
  status: 'running',
  localOnly: true,
  productionTouched: false,
  fixedLimits,
  fixedLimitsSha256: sha256Buffer(JSON.stringify(fixedLimits)),
  order:
    mode === 'official'
      ? ['pair1-before-after', 'pair2-after-before', 'pair3-before-after']
      : ['performance-after-rehearsal', 'rls-after-rehearsal'],
  environment: {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    cpuModel: os.cpus()[0]?.model ?? null,
    logicalCores: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytesAtStart: os.freemem(),
    nodeVersion: process.version,
    powerPlan: commandEvidence('powercfg.exe', ['/getactivescheme']),
    gitHead: commandEvidence('git', ['rev-parse', 'HEAD']),
    gitStatus: commandEvidence('git', ['status', '--short']),
    gitDiff: {
      exitCode: gitDiff.exitCode,
      byteLength: Buffer.byteLength(gitDiff.stdout, 'utf8'),
      sha256: sha256Buffer(gitDiff.stdout),
      stderr: gitDiff.stderr.trim(),
      error: gitDiff.error,
    },
    psqlVersion: commandEvidence(psqlExecutable, ['--version']),
    supabaseCliVersion: commandEvidence(supabaseCliExecutable, ['--version']),
    supabaseCliSha256: sha256File(supabaseCliExecutable),
    supabaseCliArchiveSha256: sha256File(supabaseCliArchive),
    dockerDatabase: commandEvidence('docker.exe', [
      'inspect',
      '--format',
      '{{json .Id}}|{{json .Config.Image}}|{{json .Image}}|{{json .State.StartedAt}}',
      'supabase_db_seikotsuin_management_saas',
    ]),
  },
  inputHashes: {},
  steps: [],
  samples: [],
  physicalCleanStates: [],
  databaseRuntimeStates: [],
  sampleResourceEvidence: [],
};

const inputPaths = [
  'scripts/commercial-hardening/run-pr11-paired-benchmark.mjs',
  'docs/stabilization/spec-commercial-performance-safe-indexes-rls-plan-v1.0.md',
  'docs/stabilization/evidence/commercial-hardening/pr11/rls-plan-after.json',
  'docs/stabilization/evidence/commercial-hardening/pr11/write-amplification.md',
  ...Object.values(sqlFiles).map(fileName =>
    path.relative(repoRoot, path.join(sqlDirectory, fileName))
  ),
];
for (const relativePath of inputPaths) {
  manifest.inputHashes[relativePath.replaceAll('\\', '/')] = sha256File(
    path.join(repoRoot, relativePath)
  );
}

function writeManifest() {
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
}

function requireEnvironmentCommand(evidence, description) {
  if (evidence.exitCode !== 0 || evidence.error !== null) {
    throw new Error(
      `${description} failed: ${evidence.stderr || evidence.error || 'unknown error'}`
    );
  }
}

function validateEnvironmentEvidence() {
  const environment = manifest.environment;
  requireEnvironmentCommand(environment.powerPlan, 'active power-plan capture');
  requireEnvironmentCommand(environment.gitHead, 'git HEAD capture');
  requireEnvironmentCommand(environment.psqlVersion, 'psql version capture');
  requireEnvironmentCommand(
    environment.supabaseCliVersion,
    'Supabase CLI version capture'
  );
  requireEnvironmentCommand(
    environment.dockerDatabase,
    'local database container capture'
  );
  if (
    environment.gitDiff.exitCode !== 0 ||
    environment.gitDiff.error !== null
  ) {
    throw new Error('Git diff capture failed');
  }
  if (!/^psql \(PostgreSQL\) 17\./.test(environment.psqlVersion.stdout)) {
    throw new Error(
      `Unexpected psql version: ${environment.psqlVersion.stdout}`
    );
  }
  if (environment.supabaseCliVersion.stdout !== '2.109.0') {
    throw new Error(
      `Unexpected Supabase CLI version: ${environment.supabaseCliVersion.stdout}`
    );
  }
  if (environment.supabaseCliSha256 !== expectedSupabaseCliSha256) {
    throw new Error('Pinned Supabase CLI executable hash mismatch');
  }
  if (
    environment.supabaseCliArchiveSha256 !== expectedSupabaseCliArchiveSha256
  ) {
    throw new Error('Verified Supabase CLI archive hash mismatch');
  }
  if (
    !environment.dockerDatabase.stdout.includes(
      'public.ecr.aws/supabase/postgres:17.6.1.104'
    )
  ) {
    throw new Error('Unexpected local database container image');
  }
  manifest.environmentValidation = {
    passed: true,
    psqlMajor: 17,
    supabaseCliVersion: '2.109.0',
    supabaseCliExecutableSha256: expectedSupabaseCliSha256,
    supabaseCliArchiveSha256: expectedSupabaseCliArchiveSha256,
    databaseContainerImage: 'public.ecr.aws/supabase/postgres:17.6.1.104',
  };
  writeManifest();
}

function captureSampleResourceEvidence(label) {
  const safeLabel = label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const dockerStdoutPath = path.join(
    outputDirectory,
    `${safeLabel}.docker-stats.stdout.raw`
  );
  const dockerStderrPath = path.join(
    outputDirectory,
    `${safeLabel}.docker-stats.stderr.raw`
  );
  const resourcePath = path.join(outputDirectory, `${safeLabel}.resource.json`);
  const startedAt = new Date().toISOString();
  const dockerResult = runCapture('docker.exe', [
    'stats',
    '--no-stream',
    '--format',
    '{{json .}}',
    'supabase_db_seikotsuin_management_saas',
  ]);
  fs.writeFileSync(dockerStdoutPath, dockerResult.stdout, 'utf8');
  fs.writeFileSync(dockerStderrPath, dockerResult.stderr, 'utf8');

  let dockerStats = null;
  let parseError = null;
  if (dockerResult.exitCode === 0 && dockerResult.error === null) {
    try {
      dockerStats = JSON.parse(dockerResult.stdout.trim());
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }
  const resource = {
    label,
    startedAt,
    endedAt: new Date().toISOString(),
    host: {
      loadAverage: os.loadavg(),
      freeMemoryBytes: os.freemem(),
      totalMemoryBytes: os.totalmem(),
      uptimeSeconds: os.uptime(),
      processCpuUsageMicroseconds: process.cpuUsage(),
      processMemoryBytes: process.memoryUsage(),
      logicalCpuTimes: os.cpus().map(cpu => ({
        model: cpu.model,
        speedMhz: cpu.speed,
        timesMilliseconds: cpu.times,
      })),
    },
    dockerDatabase: {
      command: [
        'docker.exe',
        'stats',
        '--no-stream',
        '--format',
        '{{json .}}',
        'supabase_db_seikotsuin_management_saas',
      ],
      exitCode: dockerResult.exitCode,
      error: dockerResult.error,
      parseError,
      stats: dockerStats,
      stdoutFile: path.basename(dockerStdoutPath),
      stdoutSha256: sha256File(dockerStdoutPath),
      stderrFile: path.basename(dockerStderrPath),
      stderrSha256: sha256File(dockerStderrPath),
    },
  };
  fs.writeFileSync(
    resourcePath,
    `${JSON.stringify(resource, null, 2)}\n`,
    'utf8'
  );
  const evidence = {
    label,
    file: path.basename(resourcePath),
    sha256: sha256File(resourcePath),
    dockerStdoutFile: path.basename(dockerStdoutPath),
    dockerStdoutSha256: sha256File(dockerStdoutPath),
    dockerStderrFile: path.basename(dockerStderrPath),
    dockerStderrSha256: sha256File(dockerStderrPath),
  };
  manifest.sampleResourceEvidence.push(evidence);
  writeManifest();

  if (
    dockerResult.exitCode !== 0 ||
    dockerResult.error !== null ||
    parseError !== null ||
    dockerStats === null
  ) {
    throw new Error(`Docker resource capture failed for ${label}`);
  }
  for (const field of ['CPUPerc', 'MemPerc', 'MemUsage', 'PIDs']) {
    if (typeof dockerStats[field] !== 'string' || !dockerStats[field]) {
      throw new Error(
        `Docker resource capture is missing ${field} for ${label}`
      );
    }
  }
  for (const field of ['CPUPerc', 'MemPerc']) {
    const percentage = Number(dockerStats[field].replace(/%$/, ''));
    if (!Number.isFinite(percentage)) {
      throw new Error(
        `Docker resource capture has invalid ${field} for ${label}`
      );
    }
  }
  if (
    dockerStats.Name !== 'supabase_db_seikotsuin_management_saas' ||
    typeof dockerStats.ID !== 'string' ||
    !manifest.environment.dockerDatabase.stdout.includes(dockerStats.ID)
  ) {
    throw new Error(`Docker resource capture identity drifted for ${label}`);
  }
  return evidence;
}

let databaseRuntimeBaseline = null;

function validateDatabaseRuntimeState(label, rawOutput) {
  const runtime = requireExactlyOne(
    jsonLines(rawOutput).filter(value => value.kind === 'runtime'),
    `${label} database runtime record`
  );
  const activeOtherClients = requireFiniteNumber(
    runtime.active_other_clients,
    `${label} active_other_clients`
  );
  const blockedOtherClients = requireFiniteNumber(
    runtime.blocked_other_clients,
    `${label} blocked_other_clients`
  );
  const vacuumProgressCount = requireFiniteNumber(
    runtime.vacuum_progress_count,
    `${label} vacuum_progress_count`
  );
  const createIndexProgressCount = requireFiniteNumber(
    runtime.create_index_progress_count,
    `${label} create_index_progress_count`
  );
  if (!Array.isArray(runtime.other_client_activity)) {
    throw new Error(`Missing ${label} other_client_activity`);
  }
  if (
    typeof runtime.postmaster_started_at !== 'string' ||
    !runtime.postmaster_started_at ||
    !runtime.checkpointer ||
    typeof runtime.checkpointer.stats_reset !== 'string' ||
    !runtime.guc ||
    typeof runtime.guc !== 'object'
  ) {
    throw new Error(`Missing ${label} stable database runtime identity`);
  }
  const stableState = {
    postmasterStartedAt: runtime.postmaster_started_at,
    checkpointerStatsReset: runtime.checkpointer.stats_reset,
    guc: Object.fromEntries(
      Object.entries(runtime.guc).sort(([left], [right]) =>
        left.localeCompare(right, 'en')
      )
    ),
  };
  const zeroLoadPass =
    activeOtherClients === 0 &&
    blockedOtherClients === 0 &&
    vacuumProgressCount === 0 &&
    createIndexProgressCount === 0 &&
    runtime.other_client_activity.length === 0;
  const stableIdentityPass =
    databaseRuntimeBaseline === null ||
    JSON.stringify(stableState) === JSON.stringify(databaseRuntimeBaseline);
  const record = {
    label,
    activeOtherClients,
    blockedOtherClients,
    vacuumProgressCount,
    createIndexProgressCount,
    otherClientActivity: runtime.other_client_activity,
    checkpointer: runtime.checkpointer,
    stableState,
    zeroLoadPass,
    stableIdentityPass,
  };
  manifest.databaseRuntimeStates.push(record);
  if (databaseRuntimeBaseline === null && zeroLoadPass) {
    databaseRuntimeBaseline = stableState;
    manifest.databaseRuntimeBaseline = stableState;
  }
  writeManifest();
  if (!zeroLoadPass) {
    throw new Error(`${label} database runtime was not quiescent`);
  }
  if (!stableIdentityPass) {
    throw new Error(`${label} database runtime identity drifted`);
  }
}

let physicalCleanBaselineRecords = null;

function recordCleanPhysicalState(label, rawOutput) {
  validateDatabaseRuntimeState(label, rawOutput);
  const records = physicalStateRecords(jsonLines(rawOutput), true);
  const sha256 = sha256Buffer(JSON.stringify(records));
  const stateRecord = {
    label,
    normalizedRelationCount: normalizedRelations.size,
    physicalRecordCount: records.length,
    sha256,
  };
  manifest.physicalCleanStates.push(stateRecord);

  if (physicalCleanBaselineRecords === null) {
    physicalCleanBaselineRecords = records;
    manifest.physicalCleanBaseline = stateRecord;
    writeManifest();
    return;
  }

  const baselineByKey = new Map(
    physicalCleanBaselineRecords.map(record => [record.key, record.state])
  );
  const currentByKey = new Map(
    records.map(record => [record.key, record.state])
  );
  const keys = new Set([...baselineByKey.keys(), ...currentByKey.keys()]);
  const differences = [...keys]
    .filter(
      key =>
        JSON.stringify(baselineByKey.get(key) ?? null) !==
        JSON.stringify(currentByKey.get(key) ?? null)
    )
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map(key => ({
      key,
      baseline: baselineByKey.get(key) ?? null,
      current: currentByKey.get(key) ?? null,
    }));
  if (
    differences.length > 0 ||
    sha256 !== manifest.physicalCleanBaseline.sha256
  ) {
    const safeLabel = label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const differencePath = path.join(
      outputDirectory,
      `${safeLabel}-clean-baseline-diff.json`
    );
    fs.writeFileSync(
      differencePath,
      `${JSON.stringify(differences, null, 2)}\n`,
      'utf8'
    );
    stateRecord.baselineDifferenceFile = path.basename(differencePath);
    stateRecord.baselineDifferenceSha256 = sha256File(differencePath);
    writeManifest();
    throw new Error(
      `${label} normalized physical state drifted in ${differences.length} records`
    );
  }
  writeManifest();
}

function runPsql(label, sqlFileName) {
  const safeLabel = label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const stdoutPath = path.join(outputDirectory, `${safeLabel}.stdout.raw`);
  const stderrPath = path.join(outputDirectory, `${safeLabel}.stderr.raw`);
  const started = new Date().toISOString();
  const result = runCapture(
    psqlExecutable,
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
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-A',
      '-t',
      '-F',
      fieldSeparator,
      '-f',
      path.join(sqlDirectory, sqlFileName),
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: 'postgres',
        PGAPPNAME: `pr11-paired-${safeLabel}`,
      },
    }
  );
  fs.writeFileSync(stdoutPath, result.stdout, 'utf8');
  fs.writeFileSync(stderrPath, result.stderr, 'utf8');
  const record = {
    label,
    sqlFile: sqlFileName,
    startedAt: started,
    endedAt: new Date().toISOString(),
    exitCode: result.exitCode,
    error: result.error,
    stdoutFile: path.basename(stdoutPath),
    stdoutSha256: sha256File(stdoutPath),
    stderrFile: path.basename(stderrPath),
    stderrSha256: sha256File(stderrPath),
    freeMemoryBytesAfter: os.freemem(),
  };
  manifest.steps.push(record);
  writeManifest();
  return { ...record, stdout: result.stdout, stderr: result.stderr };
}

function requireSuccess(result) {
  if (result.exitCode !== 0) {
    throw new Error(
      `${result.label} failed with exit ${result.exitCode}: ${result.stderr}`
    );
  }
}

function runNormalizedSample(sample) {
  requireSuccess(runPsql(`${sample.id}-preflight`, sqlFiles.postflight));
  const preResourceEvidence = captureSampleResourceEvidence(
    `${sample.id}-pre-normalize`
  );
  requireSuccess(runPsql(`${sample.id}-normalize`, sqlFiles.normalize));
  requireSuccess(
    runPsql(`${sample.id}-normalized-postflight`, sqlFiles.postflight)
  );
  const cleanPhysical = runPsql(
    `${sample.id}-physical-clean`,
    sqlFiles.physical
  );
  requireSuccess(cleanPhysical);
  recordCleanPhysicalState(`${sample.id}-physical-clean`, cleanPhysical.stdout);

  const sampleResult = runPsql(sample.id, sample.sqlFile);
  const postPhysical = runPsql(`${sample.id}-physical-post`, sqlFiles.physical);
  const postflight = runPsql(`${sample.id}-postflight`, sqlFiles.postflight);
  requireSuccess(sampleResult);
  requireSuccess(postPhysical);
  requireSuccess(postflight);
  validateDatabaseRuntimeState(
    `${sample.id}-physical-post`,
    postPhysical.stdout
  );
  const postResourceEvidence = captureSampleResourceEvidence(
    `${sample.id}-postflight`
  );

  const parsed =
    sample.family === 'performance'
      ? parsePerformance(sampleResult.stdout)
      : parseRls(sampleResult.stdout);
  const physicalDiff = buildPhysicalDiff(
    jsonLines(cleanPhysical.stdout),
    jsonLines(postPhysical.stdout)
  );
  const parsedPath = path.join(outputDirectory, `${sample.id}.parsed.json`);
  const diffPath = path.join(outputDirectory, `${sample.id}.bloat-diff.json`);
  fs.writeFileSync(parsedPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    diffPath,
    `${JSON.stringify(physicalDiff, null, 2)}\n`,
    'utf8'
  );
  manifest.samples.push({
    ...sample,
    parsedFile: path.basename(parsedPath),
    parsedSha256: sha256File(parsedPath),
    bloatDiffFile: path.basename(diffPath),
    bloatDiffSha256: sha256File(diffPath),
    resultCount: parsed.length,
    resourceEvidence: {
      pre: preResourceEvidence,
      post: postResourceEvidence,
    },
  });
  writeManifest();
}

function officialSamples() {
  const familyOrder = [
    ['pair1-before', 'before'],
    ['pair1-after', 'after'],
    ['pair2-after', 'after'],
    ['pair2-before', 'before'],
    ['pair3-before', 'before'],
    ['pair3-after', 'after'],
  ];
  return ['performance', 'rls'].flatMap(family =>
    familyOrder.map(([suffix, state]) => ({
      id: `${family}-${suffix}`,
      family,
      state,
      sqlFile:
        family === 'performance'
          ? state === 'before'
            ? sqlFiles.performanceBefore
            : sqlFiles.performanceAfter
          : state === 'before'
            ? sqlFiles.rlsBefore
            : sqlFiles.rlsAfter,
    }))
  );
}

function buildOfficialSummary() {
  const summary = {
    fixedLimits,
    primaryGateUsesOriginalFrozenLimits: true,
    pairedBeforeIsDiagnosticOnly: true,
    performance: {},
    rls: {},
    performancePlanContractPass: false,
    rlsSemanticContractPass: false,
    externalVerificationRequired: [
      'npm run commercial:red:db',
      'focused and full pgTAP',
    ],
    primaryPass: true,
  };

  const sampleData = manifest.samples.map(sample => ({
    ...sample,
    values: JSON.parse(
      fs.readFileSync(path.join(outputDirectory, sample.parsedFile), 'utf8')
    ),
  }));

  const performanceAfterSamples = sampleData.filter(
    sample => sample.family === 'performance' && sample.state === 'after'
  );
  if (performanceAfterSamples.length !== 3) {
    throw new Error('Expected exactly three performance AFTER samples');
  }
  const performanceBeforeSamples = sampleData.filter(
    sample => sample.family === 'performance' && sample.state === 'before'
  );
  if (performanceBeforeSamples.length !== 3) {
    throw new Error('Expected exactly three performance BEFORE samples');
  }
  const requiredPerformancePaths = {
    created_by_read_100_of_20000: 'blocks_created_by_idx',
    existing_recipient_customer_path:
      'patient_outreach_recipients_customer_idx',
    existing_recipient_campaign_path:
      'patient_outreach_recipients_campaign_idx',
    existing_reservation_campaign_path: 'reservations_campaign_id_idx',
  };
  summary.performancePlanContractPass = performanceAfterSamples.every(sample =>
    Object.entries(requiredPerformancePaths).every(([probe, indexName]) => {
      const value = requireExactlyOne(
        sample.values.filter(candidate => candidate.probe === probe),
        `${sample.id}/${probe}`
      );
      return collectPlanIndexNames(value.rawPlan).has(indexName);
    })
  );
  summary.primaryPass &&= summary.performancePlanContractPass;

  for (const [probe, limits] of Object.entries(fixedLimits.performance)) {
    const afterValues = performanceAfterSamples.map(sample =>
      requireExactlyOne(
        sample.values.filter(value => value.probe === probe),
        `${sample.id}/${probe}`
      )
    );
    const beforeValues = performanceBeforeSamples.map(sample =>
      requireExactlyOne(
        sample.values.filter(value => value.probe === probe),
        `${sample.id}/${probe}`
      )
    );
    const afterExecutionMedian = median(
      afterValues.map(value =>
        requireFiniteNumber(value.executionMs, `${probe} execution_ms`)
      )
    );
    const executionPass = afterExecutionMedian <= limits.executionMs;
    const walMedian =
      limits.walBytes === undefined
        ? null
        : median(
            afterValues.map(value =>
              requireFiniteNumber(value.walBytes, `${probe} wal_bytes`)
            )
          );
    const walPass =
      limits.walBytes === undefined ? null : walMedian <= limits.walBytes;
    summary.performance[probe] = {
      afterExecutionSamples: afterValues.map(value => value.executionMs),
      afterExecutionMedian,
      fixedExecutionLimit: limits.executionMs,
      executionPass,
      afterWalSamples: afterValues.map(value => value.walBytes),
      afterWalMedian: walMedian,
      fixedWalLimit: limits.walBytes ?? null,
      walPass,
      diagnosticBeforeExecutionSamples: beforeValues.map(
        value => value.executionMs
      ),
      diagnosticBeforeExecutionMedian: median(
        beforeValues.map(value =>
          requireFiniteNumber(value.executionMs, `${probe} before execution_ms`)
        )
      ),
    };
    summary.primaryPass &&= executionPass && walPass !== false;
  }

  const rlsAfterSamples = sampleData.filter(
    sample => sample.family === 'rls' && sample.state === 'after'
  );
  if (rlsAfterSamples.length !== 3) {
    throw new Error('Expected exactly three RLS AFTER samples');
  }
  const expectedRlsContract = {
    customer_insurance_coverages: {
      policyName: 'customer_insurance_coverages_select_for_staff',
      indexName: 'customer_insurance_coverages_customer_clinic_idx',
    },
    menu_billing_profiles: {
      policyName: 'menu_billing_profiles_select_for_staff',
      indexName: 'menu_billing_profiles_menu_clinic_idx',
    },
  };
  summary.rlsSemanticContractPass = rlsAfterSamples.every(sample =>
    Object.entries(expectedRlsContract).every(([tableName, contract]) => {
      const plan = requireExactlyOne(
        sample.values.filter(value => value.probe === tableName),
        `${sample.id}/${tableName} plan`
      );
      const policy = requireExactlyOne(
        sample.values.filter(
          value => value.kind === 'policy_count' && value.table === tableName
        ),
        `${sample.id}/${tableName} policy count`
      );
      return (
        requireFiniteNumber(
          plan.actual_rows,
          `${sample.id}/${tableName} actual_rows`
        ) === 250 &&
        rlsFilterHasBroadStaffScope(plan.rls_filter) &&
        plan.index_name === contract.indexName &&
        collectPlanIndexNames(plan.raw_plan).has(contract.indexName) &&
        policy.selectPolicyCount === 1 &&
        policy.selectPolicyNames === contract.policyName
      );
    })
  );
  summary.primaryPass &&= summary.rlsSemanticContractPass;

  const rlsBeforeSamples = sampleData.filter(
    sample => sample.family === 'rls' && sample.state === 'before'
  );
  if (rlsBeforeSamples.length !== 3) {
    throw new Error('Expected exactly three RLS BEFORE samples');
  }
  for (const [probe, limits] of Object.entries(fixedLimits.rls)) {
    const afterValues = rlsAfterSamples.map(sample =>
      requireExactlyOne(
        sample.values.filter(value => value.probe === probe),
        `${sample.id}/${probe} plan`
      )
    );
    const beforeValues = rlsBeforeSamples.map(sample =>
      requireExactlyOne(
        sample.values.filter(value => value.probe === probe),
        `${sample.id}/${probe} plan`
      )
    );
    const afterExecutionMedian = median(
      afterValues.map(value =>
        requireFiniteNumber(value.execution_ms, `${probe} execution_ms`)
      )
    );
    const executionPass = afterExecutionMedian <= limits.executionMs;
    summary.rls[probe] = {
      afterExecutionSamples: afterValues.map(value =>
        Number(value.execution_ms)
      ),
      afterExecutionMedian,
      fixedExecutionLimit: limits.executionMs,
      executionPass,
      diagnosticBeforeExecutionSamples: beforeValues.map(value =>
        requireFiniteNumber(value.execution_ms, `${probe} before execution_ms`)
      ),
      diagnosticBeforeExecutionMedian: median(
        beforeValues.map(value =>
          requireFiniteNumber(
            value.execution_ms,
            `${probe} before execution_ms`
          )
        )
      ),
    };
    summary.primaryPass &&= executionPass;
  }

  const summaryPath = path.join(outputDirectory, 'fixed-gate-summary.json');
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );
  manifest.fixedGateSummary = {
    file: path.basename(summaryPath),
    sha256: sha256File(summaryPath),
    primaryPass: summary.primaryPass,
  };
}

writeManifest();

try {
  validateEnvironmentEvidence();
  const samples =
    mode === 'official'
      ? officialSamples()
      : [
          {
            id: 'performance-after-rehearsal',
            family: 'performance',
            state: 'after',
            sqlFile: sqlFiles.performanceAfter,
          },
          {
            id: 'rls-after-rehearsal',
            family: 'rls',
            state: 'after',
            sqlFile: sqlFiles.rlsAfter,
          },
        ];
  for (const sample of samples) {
    runNormalizedSample(sample);
  }
  requireSuccess(runPsql('final-normalize', sqlFiles.normalize));
  requireSuccess(runPsql('final-postflight', sqlFiles.postflight));
  const finalPhysicalClean = runPsql('final-physical-clean', sqlFiles.physical);
  requireSuccess(finalPhysicalClean);
  recordCleanPhysicalState('final-physical-clean', finalPhysicalClean.stdout);
  if (mode === 'official') {
    buildOfficialSummary();
  }
  manifest.status = 'complete';
} catch (error) {
  manifest.status = 'invalid';
  manifest.failure = error instanceof Error ? error.message : String(error);
  const emergencyPostflight = runPsql(
    'emergency-postflight',
    sqlFiles.postflight
  );
  manifest.emergencyPostflightPassed = emergencyPostflight.exitCode === 0;
  if (manifest.emergencyPostflightPassed) {
    const emergencyNormalize = runPsql(
      'emergency-final-normalize',
      sqlFiles.normalize
    );
    manifest.emergencyNormalizationPassed = emergencyNormalize.exitCode === 0;
    if (manifest.emergencyNormalizationPassed) {
      const emergencyFinalPostflight = runPsql(
        'emergency-final-postflight',
        sqlFiles.postflight
      );
      manifest.emergencyFinalPostflightPassed =
        emergencyFinalPostflight.exitCode === 0;
      if (manifest.emergencyFinalPostflightPassed) {
        const emergencyFinalPhysical = runPsql(
          'emergency-final-physical-clean',
          sqlFiles.physical
        );
        manifest.emergencyFinalPhysicalCaptured =
          emergencyFinalPhysical.exitCode === 0;
      }
    }
  }
  throw error;
} finally {
  manifest.endedAt = new Date().toISOString();
  writeManifest();
}
