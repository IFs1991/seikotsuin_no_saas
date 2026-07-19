import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '../..');
const sqlDirectory = path.join(scriptDirectory, 'sql');
const powershell = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
const psql = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const supabaseCli = 'C:\\tmp\\supabase-cli-2.109.0\\supabase.exe';
const supabaseArchive =
  'C:\\tmp\\supabase-cli-2.109.0\\supabase_windows_amd64.tar.gz';
const targetProject = 'seikotsuin_management_saas';
const targetDatabaseContainer = `supabase_db_${targetProject}`;

const expected = {
  gitHead: 'aaf3837f6f8053b0379a2d4caea65880952ce027',
  database: 'postgres',
  serverVersion: '170006',
  systemIdentifier: '7662783869098430503',
  migrationHead: '20260718011731',
  nodeMajor: 'v24.',
  supabaseVersion: '2.109.0',
  supabaseCliSha256:
    '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118',
  supabaseArchiveSha256:
    '4ea5b92ae679323cde0e69ca92b801c3fc705c8351bdff50cb3b8eff6926f5c7',
  canonicalProbeSha256:
    '5e6ae3af19f428d63b8eaa8a56d7b659d4841fe693071e7ca11449c756c3cb65',
  logicalBaselineSha256:
    'c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78',
  physicalBaselineSha256:
    '94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86',
  balancedPowerPlan: '381b4222-f694-41f0-9685-ff5bb260df2e',
};

const validityDefinition = {
  hostSampleCount: 5,
  hostSampleIntervalMilliseconds: 1000,
  powerOnlineEverySample: true,
  dischargingSamplesAllowed: 0,
  requiredPowerPlanGuid: expected.balancedPowerPlan,
  minimumAvailableMemoryBytes: 4 * 1024 ** 3,
  minimumAvailableMemoryFraction: 0.25,
  maximumCommittedBytesInUsePercent: 80,
  maximumProcessorUtilityPercent: 10,
  minimumProcessorPerformancePercent: 90,
  maximumProcessorFrequencyCoefficientOfVariation: 0.1,
  maximumPagesInputPerSecond: 0,
  maximumPageReadsPerSecond: 0,
  maximumDpcTimePercent: 5,
  maximumInterruptTimePercent: 5,
  runningContainersOutsideTargetProjectAllowed: 0,
  restartingContainersAllowed: 0,
  maximumTargetDatabaseCpuPercent: 2,
  targetDatabaseBlockIoIncreaseAllowed: false,
  targetDatabaseHealthyRequired: true,
  checkpointerCounterIncreaseAllowed: false,
  walCounterIncreaseAllowed: false,
  activeOtherDatabaseClientsAllowed: 0,
  blockedOtherDatabaseClientsAllowed: 0,
  idleInTransactionOtherDatabaseClientsAllowed: 0,
  vacuumProgressAllowed: 0,
  createIndexProgressAllowed: 0,
};

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

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing required option: ${name}`);
  }
  return process.argv[index + 1];
}

const outputDirectory = path.resolve(repoRoot, option('--output'));
const phaseARoot = path.resolve(option('--phase-a-root'));
const handoffPath = path.resolve(option('--handoff'));
const rootCauseReportPath = path.resolve(option('--root-cause-report'));
const phaseAZipPath = path.resolve(option('--phase-a-zip'));

if (fs.existsSync(outputDirectory)) {
  throw new Error(`Output already exists: ${outputDirectory}`);
}
fs.mkdirSync(outputDirectory, { recursive: true });

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileSha(filePath) {
  return sha(fs.readFileSync(filePath));
}

function run(executable, args, environment = process.env) {
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
  return {
    command: [executable, ...args],
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
  };
}

function safeLabel(label) {
  return label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

const manifestPath = path.join(outputDirectory, 'manifest.json');
const manifest = {
  protocol: 'pr11-dense-phase-a2-environment-validity-v1',
  status: 'running',
  startedAt: new Date().toISOString(),
  endedAt: null,
  expected,
  validityDefinition,
  localOnly: true,
  readOnlyDatabaseChecks: true,
  resetUsed: false,
  volumeDeletionUsed: false,
  stagingTouched: false,
  productionTouched: false,
  permanentDdlApplied: false,
  candidateSqlExecutionCount: 0,
  d1CurrentAA: 'NOT_RUN',
  d2FourArm: 'NOT_RUN',
  d3CommittedAB: 'NOT_AUTHORIZED',
  steps: [],
};

function saveManifest() {
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
}

function record(label, result, allowFailure = false) {
  const safe = safeLabel(label);
  const stdoutPath = path.join(outputDirectory, `${safe}.stdout.raw`);
  const stderrPath = path.join(outputDirectory, `${safe}.stderr.raw`);
  fs.writeFileSync(stdoutPath, result.stdout, 'utf8');
  fs.writeFileSync(stderrPath, result.stderr, 'utf8');
  manifest.steps.push({
    label,
    command: result.command,
    exitCode: result.exitCode,
    error: result.error,
    stdoutFile: path.basename(stdoutPath),
    stdoutSha256: fileSha(stdoutPath),
    stderrFile: path.basename(stderrPath),
    stderrSha256: fileSha(stderrPath),
  });
  saveManifest();
  if (!allowFailure && result.exitCode !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.error}`);
  }
  return result.stdout;
}

function jsonLines(output) {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line));
}

function tabRows(output, fields, label) {
  return output
    .split(/\r?\n/)
    .filter(line => line.length > 0)
    .map((line, index) => {
      const values = line.split('\t');
      if (values.length !== fields.length) {
        throw new Error(`${label} row ${index + 1} has an invalid shape`);
      }
      return Object.fromEntries(
        fields.map((field, fieldIndex) => [field, values[fieldIndex]])
      );
    });
}

function copyFile(source, destination) {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Missing package input: ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function walkFiles(directory) {
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

function packageInputs() {
  const packageDirectory = path.join(outputDirectory, 'input-package');
  const phaseAEvidenceDirectory = path.join(
    phaseARoot,
    'docs/stabilization/evidence/commercial-hardening/pr11/resource-index-drop-rollback-phase-a-20260719-03'
  );
  const phaseAManifestPath = path.join(
    phaseAEvidenceDirectory,
    'manifest.json'
  );
  const phaseAManifest = JSON.parse(
    fs.readFileSync(phaseAManifestPath, 'utf8')
  );

  copyFile(
    handoffPath,
    path.join(
      packageDirectory,
      'reports/pr11_phase_a_investigation_team_handoff.md'
    )
  );
  copyFile(
    rootCauseReportPath,
    path.join(
      packageDirectory,
      'reports/report-pr11-dense-insert-gate-fail-root-cause-v0.1-20260718.md'
    )
  );
  copyFile(
    phaseAZipPath,
    path.join(
      packageDirectory,
      'phase-a-evidence/resource-index-drop-rollback-phase-a-20260719-03.zip'
    )
  );

  const evidenceFiles = [
    'manifest.json',
    'experiment-summary.json',
    'frozen-gates.json',
    'performance-evidence-audit-addendum.json',
    'contract-transition-addendum.json',
  ];
  for (const name of evidenceFiles) {
    copyFile(
      path.join(phaseAEvidenceDirectory, name),
      path.join(packageDirectory, 'phase-a-evidence', name)
    );
  }

  const sourceHashes = phaseAManifest.inputHashes;
  if (!sourceHashes || typeof sourceHashes !== 'object') {
    throw new Error('Phase A manifest is missing inputHashes');
  }
  for (const [relative, expectedSha] of Object.entries(sourceHashes)) {
    const source = path.join(phaseARoot, relative);
    if (fileSha(source) !== expectedSha) {
      throw new Error(`Phase A source hash drift: ${relative}`);
    }
    copyFile(source, path.join(packageDirectory, 'phase-a-source', relative));
  }

  const phaseA2Sources = [
    'docs/stabilization/spec-commercial-pr11-dense-phase-a2-attribution-v1.0.md',
    'scripts/commercial-hardening/collect-pr11-phase-a2-host-telemetry.ps1',
    'scripts/commercial-hardening/run-pr11-dense-phase-a2-environment.mjs',
    'scripts/commercial-hardening/sql/pr11-phase-a2-environment-preflight.sql',
    'src/__tests__/security/commercial-pr11-dense-phase-a2-environment-contract.test.ts',
  ];
  for (const relative of phaseA2Sources) {
    copyFile(
      path.join(repoRoot, relative),
      path.join(packageDirectory, 'phase-a2-source', relative)
    );
  }

  const entries = walkFiles(packageDirectory).map(absolute => ({
    path: path.relative(packageDirectory, absolute).split(path.sep).join('/'),
    bytes: fs.statSync(absolute).size,
    sha256: fileSha(absolute),
  }));
  const packageManifest = {
    kind: 'pr11_phase_a2_self_contained_input_package',
    phaseAInputCount: Object.keys(sourceHashes).length,
    phaseAInputBundleSha256: phaseAManifest.inputBundleSha256,
    files: entries,
  };
  const packageManifestPath = path.join(
    outputDirectory,
    'package-manifest.json'
  );
  fs.writeFileSync(
    packageManifestPath,
    `${JSON.stringify(packageManifest, null, 2)}\n`,
    'utf8'
  );
  return {
    packageManifestFile: path.basename(packageManifestPath),
    packageManifestSha256: fileSha(packageManifestPath),
    packagedFileCount: entries.length,
    phaseAInputCount: Object.keys(sourceHashes).length,
  };
}

function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}

function coefficientOfVariation(values) {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average === 0) return Number.POSITIVE_INFINITY;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;
  return Math.sqrt(variance) / average;
}

function parsePercent(value) {
  return number(String(value).replace('%', '').trim(), 'Docker percent');
}

function bytesFromDocker(value) {
  const match = String(value)
    .trim()
    .match(/^([0-9.]+)\s*([kmgt]?i?b)$/i);
  if (!match) throw new Error(`Invalid Docker byte value: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    b: 1,
    kb: 1000,
    mb: 1000 ** 2,
    gb: 1000 ** 3,
    tb: 1000 ** 4,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4,
  };
  return amount * multipliers[unit];
}

function blockIo(value) {
  const parts = String(value)
    .split('/')
    .map(part => part.trim());
  if (parts.length !== 2) throw new Error(`Invalid Docker BlockIO: ${value}`);
  return {
    readBytes: bytesFromDocker(parts[0]),
    writeBytes: bytesFromDocker(parts[1]),
  };
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function collectDockerEvidence() {
  const inventory = tabRows(
    record(
      'docker-inventory',
      run('docker.exe', [
        'ps',
        '-a',
        '--format',
        '{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.Label "com.supabase.cli.project"}}',
      ])
    ),
    ['Names', 'Image', 'State', 'Status', 'Project'],
    'Docker inventory'
  );
  const infoRows = tabRows(
    record(
      'docker-info',
      run('docker.exe', [
        'info',
        '--format',
        '{{.NCPU}}\t{{.MemTotal}}\t{{.OperatingSystem}}\t{{.OSType}}\t{{.Architecture}}\t{{.ServerVersion}}',
      ])
    ),
    [
      'NCPU',
      'MemTotal',
      'OperatingSystem',
      'OSType',
      'Architecture',
      'ServerVersion',
    ],
    'Docker info'
  );
  const dockerInfo = infoRows[0]
    ? {
        ...infoRows[0],
        NCPU: number(infoRows[0].NCPU, 'Docker CPU count'),
        MemTotal: number(infoRows[0].MemTotal, 'Docker memory'),
      }
    : null;
  const inspections = inventory.map((value, index) => {
    const containerName = value.Names;
    const raw = record(
      `docker-inspect-state-${index + 1}-${containerName}`,
      run('docker.exe', [
        'inspect',
        '--format',
        '{{.State.Status}}\t{{.State.Running}}\t{{.State.Restarting}}\t{{.State.OOMKilled}}\t{{.State.Dead}}\t{{.State.ExitCode}}\t{{.State.StartedAt}}\t{{.RestartCount}}\t{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
        containerName,
      ]),
      true
    ).trim();
    const parsed = tabRows(
      raw,
      [
        'status',
        'running',
        'restarting',
        'oomKilled',
        'dead',
        'exitCode',
        'startedAt',
        'restartCount',
        'healthStatus',
      ],
      `Docker inspect ${containerName}`
    )[0];
    if (!parsed) {
      return {
        name: containerName,
        inventoryState: value.State,
        inspectAvailable: false,
      };
    }
    return {
      name: containerName,
      inventoryState: value.State,
      inspectAvailable: true,
      state: {
        Status: parsed.status,
        Running: parsed.running === 'true',
        Restarting: parsed.restarting === 'true',
        OOMKilled: parsed.oomKilled === 'true',
        Dead: parsed.dead === 'true',
        ExitCode: number(parsed.exitCode, 'Docker exit code'),
        StartedAt: parsed.startedAt,
        Health:
          parsed.healthStatus === 'none'
            ? null
            : { Status: parsed.healthStatus },
      },
      restartCount: number(parsed.restartCount, 'Docker restart count'),
    };
  });
  const snapshots = [];
  for (let index = 1; index <= validityDefinition.hostSampleCount; index += 1) {
    snapshots.push(
      tabRows(
        record(
          `docker-stats-${index}`,
          run('docker.exe', [
            'stats',
            '--no-stream',
            '--format',
            '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.BlockIO}}\t{{.PIDs}}',
          ])
        ),
        ['Name', 'CPUPerc', 'MemUsage', 'BlockIO', 'PIDs'],
        `Docker stats ${index}`
      )
    );
    if (index < validityDefinition.hostSampleCount) sleep(1000);
  }
  record(
    'docker-cgroup-final',
    run('docker.exe', [
      'exec',
      targetDatabaseContainer,
      'sh',
      '-c',
      'for f in /sys/fs/cgroup/cpu.stat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.events /sys/fs/cgroup/memory.stat /sys/fs/cgroup/io.stat; do echo FILE:$f; test -r $f && cat $f; done',
    ])
  );
  return {
    inventory,
    info: dockerInfo,
    inspections,
    snapshots,
  };
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

function psqlFile(label, sqlFile) {
  return record(
    label,
    run(
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
        expected.database,
        '-v',
        'ON_ERROR_STOP=1',
        '-q',
        '-A',
        '-t',
        '-f',
        path.join(sqlDirectory, sqlFile),
      ],
      { ...process.env, PGPASSWORD: 'postgres', PGAPPNAME: safeLabel(label) }
    )
  );
}

function writeYaml(result) {
  const lines = [
    `release_decision: ${result.releaseDecision}`,
    `phase_a_original_result: FAIL`,
    `phase_a_wall_clock_validity: INCONCLUSIVE`,
    `environment_validity: ${result.environmentValidity}`,
    `d1_current_a_a: NOT_RUN`,
    `d2_four_arm: NOT_RUN`,
    `d3_committed_a_b: NOT_AUTHORIZED`,
    `candidate_sql_execution_count: 0`,
    `candidate_under_phase_a_protocol: REJECTED`,
    `rollback_only_attribution: NOT_RUN`,
    `steady_state_index_effect: NOT_PROVEN`,
    `cascade_wal: NOT_PROVEN`,
    `permanent_ddl_applied: false`,
    `next_action: ${result.nextAction}`,
  ];
  const yamlPath = path.join(outputDirectory, 'phase-a2-result.yaml');
  fs.writeFileSync(yamlPath, `${lines.join('\n')}\n`, 'utf8');
  return yamlPath;
}

function countersStable(before, after, names) {
  return names.every(name => String(before?.[name]) === String(after?.[name]));
}

let exitCode = 1;
try {
  saveManifest();
  if (!process.version.startsWith(expected.nodeMajor)) {
    throw new Error('Node 24 is required');
  }
  for (const required of [
    powershell,
    psql,
    supabaseCli,
    supabaseArchive,
    phaseARoot,
    handoffPath,
    rootCauseReportPath,
    phaseAZipPath,
  ]) {
    if (!fs.existsSync(required)) throw new Error(`Missing input: ${required}`);
  }

  const gitHead = record('git-head', run('git', ['rev-parse', 'HEAD'])).trim();
  record('git-status', run('git', ['status', '--short', '--branch']));
  if (gitHead !== expected.gitHead) throw new Error('Git HEAD drift');
  const phaseAGitHead = run('git', ['-C', phaseARoot, 'rev-parse', 'HEAD']);
  if (
    phaseAGitHead.exitCode !== 0 ||
    phaseAGitHead.stdout.trim() !== expected.gitHead
  ) {
    throw new Error('Phase A source worktree HEAD drift');
  }

  if (fileSha(supabaseCli) !== expected.supabaseCliSha256) {
    throw new Error('Supabase CLI hash drift');
  }
  if (fileSha(supabaseArchive) !== expected.supabaseArchiveSha256) {
    throw new Error('Supabase CLI archive hash drift');
  }
  const supabaseVersion = record(
    'supabase-version',
    run(supabaseCli, ['--version'])
  ).trim();
  if (supabaseVersion !== expected.supabaseVersion) {
    throw new Error('Supabase CLI version drift');
  }
  const canonicalProbePath = path.join(
    repoRoot,
    'scripts/commercial-hardening/sql/pr11-performance-probe.sql'
  );
  if (fileSha(canonicalProbePath) !== expected.canonicalProbeSha256) {
    throw new Error('Canonical performance probe hash drift');
  }

  const frozenGatesPath = path.join(
    outputDirectory,
    'frozen-phase-a2-gates.json'
  );
  fs.writeFileSync(
    frozenGatesPath,
    `${JSON.stringify(
      {
        protocol: manifest.protocol,
        frozenAt: new Date().toISOString(),
        candidateSqlExecutionCount: 0,
        expected,
        validityDefinition,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  manifest.frozenGatesSha256 = fileSha(frozenGatesPath);
  manifest.package = packageInputs();
  saveManifest();

  const databaseInitialRaw = psqlFile(
    'database-preflight-initial',
    'pr11-phase-a2-environment-preflight.sql'
  );
  const databaseInitial = jsonLines(databaseInitialRaw).find(
    value => value.kind === 'pr11_phase_a2_database_preflight'
  );
  if (!databaseInitial) {
    throw new Error('Initial database preflight output is missing');
  }

  const hostRaw = record(
    'host-telemetry',
    run(powershell, [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      path.join(scriptDirectory, 'collect-pr11-phase-a2-host-telemetry.ps1'),
      '-SampleCount',
      String(validityDefinition.hostSampleCount),
      '-IntervalMilliseconds',
      String(validityDefinition.hostSampleIntervalMilliseconds),
    ])
  );
  const host = jsonLines(hostRaw).find(
    value => value.kind === 'pr11_phase_a2_host_telemetry'
  );
  if (!host || host.samples.length !== validityDefinition.hostSampleCount) {
    throw new Error('Host telemetry inventory is incomplete');
  }

  const docker = collectDockerEvidence();
  const databaseFinalRaw = psqlFile(
    'database-preflight-final',
    'pr11-phase-a2-environment-preflight.sql'
  );
  const databaseFinal = jsonLines(databaseFinalRaw).find(
    value => value.kind === 'pr11_phase_a2_database_preflight'
  );
  if (!databaseFinal) {
    throw new Error('Final database preflight output is missing');
  }

  const logicalRaw = psqlFile(
    'logical-snapshot',
    'pr11-postapply-logical-snapshot.sql'
  );
  const logicalRecords = jsonLines(logicalRaw).filter(
    value => value.kind === 'logical_snapshot'
  );
  if (logicalRecords.length !== 1) {
    throw new Error('Logical snapshot inventory is incomplete');
  }
  const logicalRelationNames = Object.keys(logicalRecords[0].relations ?? {});
  if (
    logicalRelationNames.length !== normalizedRelations.size ||
    [...normalizedRelations].some(name => !logicalRelationNames.includes(name))
  ) {
    throw new Error('Logical snapshot does not cover the 17 frozen relations');
  }
  const logicalHash = sha(JSON.stringify(logicalRecords));
  const physicalRaw = psqlFile(
    'physical-snapshot',
    'pr11-paired-physical-snapshot.sql'
  );
  const physicalRecords = stablePhysicalRecords(physicalRaw);
  const physicalTables = physicalRecords.filter(
    value => value.kind === 'table'
  );
  const physicalTableNames = new Set(
    physicalTables.map(value => `${value.schema}.${value.name}`)
  );
  if (
    physicalTables.length !== normalizedRelations.size ||
    [...normalizedRelations].some(name => !physicalTableNames.has(name))
  ) {
    throw new Error('Physical snapshot does not cover the 17 frozen relations');
  }
  const physicalRuntime = jsonLines(physicalRaw).filter(
    value => value.kind === 'runtime'
  );
  if (physicalRuntime.length !== 1) {
    throw new Error('Physical snapshot runtime inventory is incomplete');
  }
  const physicalHash = sha(JSON.stringify(physicalRecords));

  const gates = [];
  const gate = (name, pass, observed) =>
    gates.push({ name, pass: pass === true, observed });
  const hostSamples = host.samples;
  gate(
    'power_online',
    hostSamples.every(sample => sample.powerOnline === true),
    hostSamples.map(sample => sample.powerLineStatus)
  );
  gate(
    'not_discharging',
    hostSamples.every(
      sample =>
        sample.discharging === false &&
        (sample.wmiBattery ?? []).every(battery => battery.discharging !== true)
    ),
    hostSamples.map(sample => ({
      powerLineStatus: sample.powerLineStatus,
      wmiBattery: sample.wmiBattery,
    }))
  );
  gate(
    'power_plan',
    host.powerPlanGuid === validityDefinition.requiredPowerPlanGuid,
    host.powerPlanGuid
  );
  gate(
    'available_memory',
    hostSamples.every(sample => {
      const minimum = Math.max(
        validityDefinition.minimumAvailableMemoryBytes,
        sample.totalMemoryBytes *
          validityDefinition.minimumAvailableMemoryFraction
      );
      return sample.availableMemoryBytes >= minimum;
    }),
    hostSamples.map(sample => ({
      bytes: sample.availableMemoryBytes,
      fraction: sample.availableMemoryFraction,
    }))
  );
  gate(
    'committed_memory',
    hostSamples.every(
      sample =>
        number(sample.committedBytesInUsePercent, 'commit usage') <=
        validityDefinition.maximumCommittedBytesInUsePercent
    ),
    hostSamples.map(sample => sample.committedBytesInUsePercent)
  );
  gate(
    'processor_utility',
    hostSamples.every(
      sample =>
        number(sample.processorUtilityPercent, 'processor utility') <=
        validityDefinition.maximumProcessorUtilityPercent
    ),
    hostSamples.map(sample => sample.processorUtilityPercent)
  );
  gate(
    'processor_performance',
    hostSamples.every(
      sample =>
        number(sample.processorPerformancePercent, 'processor performance') >=
        validityDefinition.minimumProcessorPerformancePercent
    ),
    hostSamples.map(sample => sample.processorPerformancePercent)
  );
  const frequencyValues = hostSamples.map(sample =>
    number(sample.processorFrequencyMhz, 'processor frequency')
  );
  gate(
    'processor_frequency_stability',
    coefficientOfVariation(frequencyValues) <=
      validityDefinition.maximumProcessorFrequencyCoefficientOfVariation,
    {
      values: frequencyValues,
      coefficientOfVariation: coefficientOfVariation(frequencyValues),
    }
  );
  gate(
    'hard_paging',
    hostSamples.every(
      sample =>
        number(sample.pagesInputPerSecond, 'pages input') <=
          validityDefinition.maximumPagesInputPerSecond &&
        number(sample.pageReadsPerSecond, 'page reads') <=
          validityDefinition.maximumPageReadsPerSecond
    ),
    hostSamples.map(sample => ({
      pagesInputPerSecond: sample.pagesInputPerSecond,
      pageReadsPerSecond: sample.pageReadsPerSecond,
    }))
  );
  gate(
    'dpc_interrupt',
    hostSamples.every(
      sample =>
        number(sample.processorDpcTimePercent, 'DPC time') <=
          validityDefinition.maximumDpcTimePercent &&
        number(sample.processorInterruptTimePercent, 'interrupt time') <=
          validityDefinition.maximumInterruptTimePercent
    ),
    hostSamples.map(sample => ({
      dpc: sample.processorDpcTimePercent,
      interrupt: sample.processorInterruptTimePercent,
    }))
  );

  const runningOutsideTarget = docker.inventory.filter(value => {
    const running = value.State === 'running' || value.State === 'restarting';
    const target = value.Project === targetProject;
    return running && !target;
  });
  gate(
    'no_running_containers_outside_target',
    runningOutsideTarget.length === 0,
    runningOutsideTarget.map(value => ({
      name: value.Names,
      state: value.State,
    }))
  );
  const restarting = docker.inventory.filter(
    value => value.State === 'restarting'
  );
  gate(
    'no_restarting_containers',
    restarting.length === 0,
    restarting.map(value => ({ name: value.Names, status: value.Status }))
  );
  const targetInspection = docker.inspections.find(
    value => value.name === targetDatabaseContainer
  );
  gate(
    'target_database_container_healthy',
    targetInspection?.inspectAvailable === true &&
      targetInspection.state?.Running === true &&
      targetInspection.state?.Restarting === false &&
      targetInspection.state?.OOMKilled === false &&
      targetInspection.state?.Dead === false &&
      targetInspection.state?.Health?.Status === 'healthy',
    targetInspection ?? null
  );
  const targetStats = docker.snapshots.map((snapshot, index) => {
    const row = snapshot.find(value => value.Name === targetDatabaseContainer);
    if (!row)
      throw new Error(`Missing target DB Docker stats sample ${index + 1}`);
    return row;
  });
  gate(
    'target_database_cpu',
    targetStats.every(
      value =>
        parsePercent(value.CPUPerc) <=
        validityDefinition.maximumTargetDatabaseCpuPercent
    ),
    targetStats.map(value => value.CPUPerc)
  );
  const firstBlockIo = blockIo(targetStats[0].BlockIO);
  const lastBlockIo = blockIo(targetStats.at(-1).BlockIO);
  gate(
    'target_database_block_io_stable',
    firstBlockIo.readBytes === lastBlockIo.readBytes &&
      firstBlockIo.writeBytes === lastBlockIo.writeBytes,
    { first: firstBlockIo, last: lastBlockIo }
  );

  gate(
    'database_identity',
    [databaseInitial, databaseFinal].every(
      database =>
        database.database === expected.database &&
        String(database.server_version_num) === expected.serverVersion &&
        String(database.system_identifier) === expected.systemIdentifier &&
        String(database.migration_head) === expected.migrationHead &&
        database.singleton_present === true
    ),
    { initial: databaseInitial, final: databaseFinal }
  );
  gate(
    'database_quiescence',
    [databaseInitial, databaseFinal, physicalRuntime[0]].every(
      database =>
        Number(database.active_other_clients) === 0 &&
        Number(database.blocked_other_clients) === 0 &&
        Number(database.idle_in_transaction_other_clients ?? 0) === 0 &&
        Number(database.vacuum_progress_count) === 0 &&
        Number(database.create_index_progress_count) === 0
    ),
    {
      initial: databaseInitial,
      final: databaseFinal,
      physicalRuntime: physicalRuntime[0],
    }
  );
  const checkpointerCounterNames = [
    'num_timed',
    'num_requested',
    'restartpoints_timed',
    'restartpoints_req',
    'restartpoints_done',
    'buffers_written',
  ];
  gate(
    'database_checkpointer_stable',
    countersStable(
      databaseInitial.checkpointer,
      databaseFinal.checkpointer,
      checkpointerCounterNames
    ),
    {
      counters: checkpointerCounterNames,
      initial: databaseInitial.checkpointer,
      final: databaseFinal.checkpointer,
    }
  );
  const walCounterNames = ['wal_records', 'wal_fpi', 'wal_bytes'];
  gate(
    'database_wal_stable',
    countersStable(databaseInitial.wal, databaseFinal.wal, walCounterNames),
    {
      counters: walCounterNames,
      initial: databaseInitial.wal,
      final: databaseFinal.wal,
    }
  );
  gate(
    'logical_baseline',
    logicalHash === expected.logicalBaselineSha256,
    logicalHash
  );
  gate(
    'physical_baseline',
    physicalHash === expected.physicalBaselineSha256,
    physicalHash
  );

  const failedGates = gates.filter(value => !value.pass);
  const environmentValidity =
    failedGates.length === 0 ? 'PASS' : 'ENVIRONMENT_INVALID';
  const result = {
    protocol: manifest.protocol,
    releaseDecision: 'FAIL_STOP',
    environmentValidity,
    phaseAOriginalResult: 'FAIL',
    phaseAWallClockValidity: 'INCONCLUSIVE',
    candidateUnderPhaseAProtocol: 'REJECTED',
    steadyStateIndexEffect: 'NOT_PROVEN',
    rollbackOnlyAttribution: 'NOT_RUN',
    cascadeWal: 'NOT_PROVEN',
    d1CurrentAA: 'NOT_RUN',
    d2FourArm: 'NOT_RUN',
    d3CommittedAB: 'NOT_AUTHORIZED',
    candidateSqlExecutionCount: 0,
    permanentDdlApplied: false,
    logicalHash,
    physicalHash,
    environmentObservations: {
      dockerInfo: docker.info,
      runningContainersOutsideTarget: runningOutsideTarget.map(value => ({
        name: value.Names,
        image: value.Image,
        state: value.State,
        status: value.Status,
      })),
      dockerInspections: docker.inspections,
      hostSamples,
      databaseInitial,
      databaseFinal,
    },
    gates,
    failedGateNames: failedGates.map(value => value.name),
    nextAction:
      environmentValidity === 'PASS'
        ? 'RUN_CURRENT_A_A_VALIDITY'
        : 'STABILIZE_HOST_THEN_RERUN_D1',
  };
  const resultPath = path.join(outputDirectory, 'phase-a2-result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const resultYamlPath = writeYaml(result);
  manifest.resultSha256 = fileSha(resultPath);
  manifest.resultYamlSha256 = fileSha(resultYamlPath);
  manifest.status =
    environmentValidity === 'PASS'
      ? 'ready-for-current-a-a'
      : 'environment-invalid';
  manifest.environmentValidity = environmentValidity;
  manifest.failedGateNames = result.failedGateNames;
  exitCode = environmentValidity === 'PASS' ? 0 : 3;
} catch (error) {
  manifest.status = 'safety-fail';
  manifest.error = error instanceof Error ? error.stack : String(error);
  exitCode = 1;
} finally {
  manifest.endedAt = new Date().toISOString();
  saveManifest();
}

process.exitCode = exitCode;
