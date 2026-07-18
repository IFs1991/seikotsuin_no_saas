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
const expectedCliSha =
  '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118';
const expectedArchiveSha =
  '4ea5b92ae679323cde0e69ca92b801c3fc705c8351bdff50cb3b8eff6926f5c7';
const canonicalRlsProbeSha =
  'b8377b491379afd9fbb09c156e29d8b4b12fb85c93e588ca8b1c3c47ca544279';
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
  blocks: {
    sparse_insert_10000: { executionMs: 435.7373, walBytes: 9_292_168.2 },
    dense_insert_10000: { executionMs: 521.55125, walBytes: 11_133_665 },
  },
  rlsRead: {
    customer_insurance_coverages: { executionMs: 66.757 },
    menu_billing_profiles: { executionMs: 63.3855 },
  },
  rlsWrite: {
    coverage_insert_2000: { executionMs: 124.709, walBytes: 1_220_025 },
    menu_profile_insert_2000: { executionMs: 135.944, walBytes: 1_718_510 },
  },
};

const sql = {
  preflight: 'pr11-forward-experiment-preflight.sql',
  postflight: 'pr11-forward-experiment-postflight.sql',
  logical: 'pr11-forward-experiment-logical-snapshot.sql',
  physical: 'pr11-paired-physical-snapshot.sql',
  normalize: 'pr11-paired-normalize.sql',
  blocksCurrent: 'pr11-forward-blocks-trigger-current.sql',
  blocksCandidate: 'pr11-forward-blocks-trigger-fast-path.sql',
  blocksCandidateDdl: 'pr11-forward-blocks-trigger-fast-path-ddl.sql',
  blocksIntegrity: 'pr11-forward-blocks-trigger-fast-path-integrity.sql',
  writeCurrent: 'pr11-forward-rls-write-current.sql',
  writeCandidate: 'pr11-forward-rls-write-index-candidate.sql',
  readCurrent: 'pr11-forward-rls-read-current.sql',
  readCandidate: 'pr11-forward-rls-read-index-candidate.sql',
  semanticCurrent: 'pr11-forward-rls-semantic-current.sql',
  semanticCandidate: 'pr11-forward-rls-semantic-index-candidate.sql',
  candidatePgtap: 'pr11-forward-rls-index-candidate-pgtap.sql',
  rlsCandidateDdl: 'pr11-forward-rls-statement-scope-candidate.sql',
  rlsWriteProbe: 'pr11-forward-rls-write-probe.sql',
  rlsSemanticProbe: 'pr11-forward-rls-scope-semantic-probe.sql',
  pairedPostflight: 'pr11-paired-postflight.sql',
};

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
  const result = run(executable, args);
  return { command: [executable, ...args], ...result };
}

function jsonLines(output) {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line));
}

function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}

function median(values) {
  if (values.length !== 3) throw new Error('Median requires exactly 3 values');
  return [...values].sort((a, b) => a - b)[1];
}

function parsePlanRows(output) {
  return output
    .split(/\r?\n/)
    .map(line => line.split(fieldSeparator))
    .filter(columns => columns.length === 8)
    .map(columns => ({
      probe: columns[0],
      executionMs: number(columns[1], `${columns[0]} execution`),
      walRecords: number(columns[2], `${columns[0]} WAL records`),
      walBytes: number(columns[3], `${columns[0]} WAL bytes`),
      sharedDirtiedBlocks: number(columns[4], `${columns[0]} dirty blocks`),
      rootNode: columns[5],
      rawPlanMd5: columns[6],
      rawPlan: JSON.parse(columns[7]),
    }));
}

function parseRls(output) {
  const plans = jsonLines(output)
    .filter(value => typeof value.probe === 'string')
    .map(value => ({
      probe: value.probe,
      executionMs: number(value.execution_ms, `${value.probe} execution`),
      planningMs: number(value.planning_ms, `${value.probe} planning`),
      actualRows: number(value.actual_rows, `${value.probe} rows`),
      sharedHitBlocks: number(
        value.shared_hit_blocks,
        `${value.probe} shared hits`
      ),
      indexName: value.index_name,
      rlsFilter: value.rls_filter,
      rawPlanMd5: value.raw_plan_md5,
      rawPlan: value.raw_plan,
    }));
  const policies = output
    .split(/\r?\n/)
    .map(line => line.split(fieldSeparator))
    .filter(
      columns =>
        columns.length === 3 &&
        ['customer_insurance_coverages', 'menu_billing_profiles'].includes(
          columns[0]
        )
    )
    .map(columns => ({
      kind: 'policy_count',
      table: columns[0],
      selectPolicyCount: number(columns[1], `${columns[0]} policy count`),
      selectPolicyNames: columns[2],
    }));
  return [...plans, ...policies];
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit);
  } else if (value && typeof value === 'object') {
    visit(value);
    for (const child of Object.values(value)) walk(child, visit);
  }
}

function planContract(row, state, family) {
  const nodes = [];
  const indexNames = [];
  walk(row.rawPlan, node => {
    if (typeof node['Node Type'] === 'string') nodes.push(node);
    if (typeof node['Index Name'] === 'string')
      indexNames.push(node['Index Name']);
  });
  if (family === 'blocks') {
    const triggers = row.rawPlan?.[0]?.Triggers ?? [];
    const clinic = triggers.find(
      item => item['Trigger Name'] === 'blocks_clinic_ref_check'
    );
    const composite = triggers.find(
      item => item['Constraint Name'] === 'blocks_resource_id_fkey'
    );
    return {
      pass: clinic?.Calls === 10000 && composite?.Calls === 10000,
      triggerNames: triggers.map(
        item => item['Trigger Name'] ?? item['Constraint Name']
      ),
      clinicTrigger: clinic ?? null,
      compositeForeignKey: composite ?? null,
    };
  }
  const targetIndex =
    row.probe === 'customer_insurance_coverages'
      ? 'customer_insurance_coverages_clinic_id_id_idx'
      : 'menu_billing_profiles_clinic_id_id_idx';
  const scans = nodes.filter(
    node =>
      node['Relation Name'] === row.probe && node['Index Name'] === targetIndex
  );
  const scan = scans[0];
  const targetTable = nodes.filter(node => node['Relation Name'] === row.probe);
  const root = row.rawPlan?.[0]?.Plan;
  const initPlans = nodes.filter(
    node => node['Parent Relationship'] === 'InitPlan'
  );
  return {
    pass:
      state === 'current' ||
      (row.actualRows === 250 &&
        row.indexName === targetIndex &&
        root?.['Node Type'] === 'Limit' &&
        root?.['Actual Rows'] === 250 &&
        root?.['Actual Loops'] === 1 &&
        scans.length === 1 &&
        scan?.['Node Type'] === 'Index Scan' &&
        scan?.['Actual Rows'] === 250 &&
        scan?.['Actual Loops'] === 1 &&
        String(scan?.['Index Cond'] ?? '').includes(
          'fb110000-0000-4000-8000-000000004001'
        ) &&
        (scan?.['Rows Removed by Filter'] ?? 0) === 0 &&
        !nodes.some(node => node['Node Type'] === 'Sort') &&
        !nodes.some(node =>
          ['Bitmap Index Scan', 'Bitmap Heap Scan'].includes(node['Node Type'])
        ) &&
        !targetTable.some(node => ['Seq Scan'].includes(node['Node Type'])) &&
        initPlans.length === 2 &&
        new Set(initPlans.map(node => String(node['Subplan Name'] ?? '')))
          .size === 2 &&
        initPlans.every(
          node =>
            node['Node Type'] === 'Result' &&
            node['Actual Rows'] === 1 &&
            node['Actual Loops'] === 1 &&
            /^InitPlan \d+$/.test(String(node['Subplan Name'] ?? ''))
        )),
    indexNames,
    nodeTypes: nodes.map(node => node['Node Type']),
    rootNode: root ?? null,
    initPlans,
    targetScan: scan ?? null,
  };
}

const outputArgIndex = process.argv.indexOf('--output');
if (outputArgIndex < 0 || !process.argv[outputArgIndex + 1]) {
  throw new Error('Usage: --output <new-directory>');
}
if (!process.version.startsWith('v24.')) throw new Error('Node 24 is required');
const outputDirectory = path.resolve(
  repoRoot,
  process.argv[outputArgIndex + 1]
);
if (fs.existsSync(outputDirectory))
  throw new Error(`Output exists: ${outputDirectory}`);
fs.mkdirSync(outputDirectory, { recursive: true });

const manifestPath = path.join(outputDirectory, 'manifest.json');
const manifest = {
  protocol: 'pr11-fixed-gate-resolution-local-rollback-v2',
  status: 'running',
  startedAt: new Date().toISOString(),
  endedAt: null,
  localOnly: true,
  productionTouched: false,
  resetUsed: false,
  volumeDeletionUsed: false,
  candidateSqlExecutionCount: 0,
  blocksCandidateSqlExecutionCount: 0,
  blocksCandidateKind: 'exact-compatible-fast-path-v1',
  rlsCandidateKind: 'statement-scope-helper-index-v1',
  gatesFrozenBeforeCandidate: false,
  fixedLimits,
  environment: {
    nodeVersion: process.version,
    platform: os.platform(),
    cpu: os.cpus()[0]?.model ?? null,
    cores: os.cpus().length,
    memoryBytes: os.totalmem(),
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
  },
  inputHashes: {},
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

function psqlFile(label, sqlFile) {
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
      'postgres',
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
    {
      env: {
        ...process.env,
        PGPASSWORD: 'postgres',
        PGAPPNAME: `pr11-forward-${safe}`,
      },
    }
  );
  const stdoutFile = path.join(outputDirectory, `${safe}.stdout.raw`);
  const stderrFile = path.join(outputDirectory, `${safe}.stderr.raw`);
  fs.writeFileSync(stdoutFile, result.stdout, 'utf8');
  fs.writeFileSync(stderrFile, result.stderr, 'utf8');
  const record = {
    label,
    sqlFile,
    exitCode: result.exitCode,
    error: result.error,
    stdoutFile: path.basename(stdoutFile),
    stdoutSha256: fileSha(stdoutFile),
    stderrFile: path.basename(stderrFile),
    stderrSha256: fileSha(stderrFile),
  };
  manifest.steps.push(record);
  saveManifest();
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.error}`);
  }
  return result.stdout;
}

function stableRecords(output, kinds = null) {
  const values = jsonLines(output).filter(
    value => !kinds || kinds.has(value.kind)
  );
  return values.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b), 'en')
  );
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
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
}

let logicalBaseline = null;
let physicalBaseline = null;

function snapshot(label, cleanPhysical) {
  const logical = stableRecords(psqlFile(`${label}-logical`, sql.logical));
  const logicalHash = sha(JSON.stringify(logical));
  if (logicalBaseline === null) logicalBaseline = logicalHash;
  if (logicalHash !== logicalBaseline)
    throw new Error(`${label} logical/catalog drift`);
  let physicalHash = null;
  if (cleanPhysical) {
    const physical = stablePhysicalRecords(
      psqlFile(`${label}-physical`, sql.physical)
    );
    physicalHash = sha(JSON.stringify(physical));
    if (physicalBaseline === null) physicalBaseline = physicalHash;
    if (physicalHash !== physicalBaseline)
      throw new Error(`${label} normalized physical drift`);
  }
  return { logicalHash, physicalHash };
}

function normalizedSample({ id, family, state, sqlFile, candidate = false }) {
  psqlFile(`${id}-preflight`, sql.postflight);
  psqlFile(`${id}-normalize`, sql.normalize);
  psqlFile(`${id}-normalized-postflight`, sql.postflight);
  const before = snapshot(`${id}-before`, true);
  if (candidate && family === 'blocks') {
    manifest.blocksCandidateSqlExecutionCount += 1;
  } else if (candidate) {
    manifest.candidateSqlExecutionCount += 1;
  }
  const output = psqlFile(id, sqlFile);
  psqlFile(`${id}-postflight`, sql.postflight);
  const after = snapshot(`${id}-after`, false);
  const rows =
    family === 'semantic' || family === 'integrity' || family === 'pgtap'
      ? jsonLines(output)
      : family === 'rls-read'
        ? parseRls(output)
        : parsePlanRows(output);
  const writeRowCounts = jsonLines(output).filter(
    value => value.kind === 'write_row_count'
  );
  const candidateCatalog = jsonLines(output).filter(value =>
    [
      'blocks_fast_path_candidate_catalog',
      'rls_scope_candidate_catalog',
    ].includes(value.kind)
  );
  if (
    ['write-calibration', 'rls-write'].includes(family) &&
    (writeRowCounts.length !== 2 ||
      writeRowCounts.some(value => value.inserted_rows !== 2000))
  ) {
    throw new Error(`${id} did not prove both 2,000-row writes`);
  }
  const parsedFile = path.join(outputDirectory, `${id}.parsed.json`);
  fs.writeFileSync(parsedFile, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  manifest.samples.push({
    id,
    family,
    state,
    candidate,
    before,
    after,
    parsedFile: path.basename(parsedFile),
    parsedSha256: fileSha(parsedFile),
    writeRowCounts,
    candidateCatalog,
  });
  saveManifest();
  return { output, rows };
}

function candidateOrder(family, currentFile, candidateFile) {
  return [
    [`${family}-pair1-current`, 'current', currentFile, false],
    [`${family}-pair1-candidate`, 'candidate', candidateFile, true],
    [`${family}-pair2-candidate`, 'candidate', candidateFile, true],
    [`${family}-pair2-current`, 'current', currentFile, false],
    [`${family}-pair3-current`, 'current', currentFile, false],
    [`${family}-pair3-candidate`, 'candidate', candidateFile, true],
  ];
}

function sampleValues(family, state) {
  return manifest.samples
    .filter(sample => sample.family === family && sample.state === state)
    .map(sample =>
      JSON.parse(
        fs.readFileSync(path.join(outputDirectory, sample.parsedFile), 'utf8')
      )
    );
}

function findProbe(sample, probe) {
  const row = sample.find(value => value.probe === probe);
  if (!row) throw new Error(`Missing probe ${probe}`);
  return row;
}

function finalSummary(writeGates) {
  const blocks = {};
  for (const probe of Object.keys(fixedLimits.blocks)) {
    const rows = sampleValues('blocks', 'candidate').map(sample =>
      findProbe(sample, probe)
    );
    const executionMedian = median(rows.map(row => row.executionMs));
    const walMedian = median(rows.map(row => row.walBytes));
    const contracts = rows.map(row => planContract(row, 'candidate', 'blocks'));
    const catalogContracts = manifest.samples
      .filter(
        sample => sample.family === 'blocks' && sample.state === 'candidate'
      )
      .map(sample => sample.candidateCatalog)
      .map(
        catalog =>
          catalog.length === 1 &&
          catalog[0]?.kind === 'blocks_fast_path_candidate_catalog' &&
          catalog[0]?.contract_pass === true
      );
    blocks[probe] = {
      executionValues: rows.map(row => row.executionMs),
      executionMedian,
      walValues: rows.map(row => row.walBytes),
      walMedian,
      contracts,
      catalogContracts,
      pass:
        executionMedian <= fixedLimits.blocks[probe].executionMs &&
        walMedian <= fixedLimits.blocks[probe].walBytes &&
        contracts.every(value => value.pass) &&
        catalogContracts.every(Boolean),
    };
  }
  const reads = {};
  for (const probe of Object.keys(fixedLimits.rlsRead)) {
    const rows = sampleValues('rls-read', 'candidate').map(sample =>
      findProbe(sample, probe)
    );
    const executionMedian = median(rows.map(row => row.executionMs));
    const contracts = rows.map(row => planContract(row, 'candidate', 'rls'));
    const catalogContracts = manifest.samples
      .filter(
        sample => sample.family === 'rls-read' && sample.state === 'candidate'
      )
      .map(sample => sample.candidateCatalog)
      .map(
        catalog =>
          catalog.length === 1 &&
          catalog[0]?.kind === 'rls_scope_candidate_catalog' &&
          catalog[0]?.contract_pass === true
      );
    reads[probe] = {
      executionValues: rows.map(row => row.executionMs),
      executionMedian,
      contracts,
      catalogContracts,
      pass:
        executionMedian <= fixedLimits.rlsRead[probe].executionMs &&
        contracts.every(value => value.pass) &&
        catalogContracts.every(Boolean),
    };
  }
  const writes = {};
  for (const probe of Object.keys(writeGates)) {
    const rows = sampleValues('rls-write', 'candidate').map(sample =>
      findProbe(sample, probe)
    );
    const executionMedian = median(rows.map(row => row.executionMs));
    const walMedian = median(rows.map(row => row.walBytes));
    writes[probe] = {
      executionValues: rows.map(row => row.executionMs),
      executionMedian,
      walValues: rows.map(row => row.walBytes),
      walMedian,
      gate: writeGates[probe],
      pass:
        executionMedian <= writeGates[probe].executionMs &&
        walMedian <= writeGates[probe].walBytes,
    };
  }
  const integrity = sampleValues('integrity', 'both')[0];
  const integritySummary = integrity.find(
    value => value.kind === 'blocks_integrity_summary'
  );
  const currentSemantic = sampleValues('semantic', 'current')[0];
  const candidateSemantic = sampleValues('semantic', 'candidate')[0];
  const semanticCurrentCases = currentSemantic.filter(
    value => value.kind === 'scope_semantic_case'
  );
  const semanticCandidateCases = candidateSemantic.filter(
    value => value.kind === 'scope_semantic_case'
  );
  const pgtapOutput = fs.readFileSync(
    path.join(
      outputDirectory,
      manifest.samples.find(sample => sample.family === 'pgtap').parsedFile
    ),
    'utf8'
  );
  const pgtapStep = manifest.steps.find(
    step => step.label === 'rls-candidate-pgtap'
  );
  const rawTap = fs.readFileSync(
    path.join(outputDirectory, pgtapStep.stdoutFile),
    'utf8'
  );
  const tapOk = (rawTap.match(/^ok\s+\d+/gm) ?? []).length;
  const tapNotOk = (rawTap.match(/^not ok\s+/gm) ?? []).length;
  const summary = {
    fixedLimits,
    writeGates,
    blocks,
    rlsRead: reads,
    rlsWrite: writes,
    integrity: {
      cases: integrity.filter(value => value.kind === 'blocks_integrity_case')
        .length,
      summary: integritySummary ?? null,
      pass:
        integrity.filter(value => value.kind === 'blocks_integrity_case')
          .length === 30 &&
        integritySummary?.paired_cases === 15 &&
        integritySummary?.diagnostic_cases === 10 &&
        integritySummary?.behavior_cases === 5 &&
        integritySummary?.passed === true &&
        integritySummary?.sqlstate_equivalent === true &&
        integritySummary?.message_equivalent === true &&
        integritySummary?.diagnostic_equivalent === true &&
        integritySummary?.behavior_equivalent === true,
    },
    semantic: {
      currentCases: semanticCurrentCases.length,
      candidateCases: semanticCandidateCases.length,
      exactMatch:
        JSON.stringify(semanticCurrentCases) ===
        JSON.stringify(semanticCandidateCases),
      pass:
        semanticCurrentCases.length === 27 &&
        semanticCandidateCases.length === 27 &&
        JSON.stringify(semanticCurrentCases) ===
          JSON.stringify(semanticCandidateCases),
    },
    pgtap: {
      ok: tapOk,
      notOk: tapNotOk,
      parsedEvidenceBytes: Buffer.byteLength(pgtapOutput),
      pass: tapOk === 49 && tapNotOk === 0,
    },
    logicalBaseline,
    physicalBaseline,
  };
  summary.primaryPass =
    Object.values(blocks).every(value => value.pass) &&
    Object.values(reads).every(value => value.pass) &&
    Object.values(writes).every(value => value.pass) &&
    summary.integrity.pass &&
    summary.semantic.pass &&
    summary.pgtap.pass;
  return summary;
}

let exitCode = 1;
try {
  for (const required of [psql, supabaseCli, supabaseArchive]) {
    if (!fs.existsSync(required))
      throw new Error(`Missing required tool: ${required}`);
  }
  if (
    fileSha(supabaseCli) !== expectedCliSha ||
    fileSha(supabaseArchive) !== expectedArchiveSha
  ) {
    throw new Error('Pinned Supabase CLI hash mismatch');
  }
  const inputs = [
    'scripts/commercial-hardening/run-pr11-forward-fix-experiment.mjs',
    'scripts/commercial-hardening/sql/pr11-performance-probe.sql',
    'scripts/commercial-hardening/sql/pr11-rls-plan-probe.sql',
    'supabase/tests/commercial_pr11_performance_rls_test.sql',
    'scripts/commercial-hardening/red-contracts/12_pr11_blocks_trigger_fast_path.sql',
    'scripts/commercial-hardening/red-contracts/13_pr11_rls_statement_scope.sql',
    'docs/stabilization/spec-commercial-performance-safe-indexes-rls-plan-v1.0.md',
    ...Object.values(sql).map(
      name => `scripts/commercial-hardening/sql/${name}`
    ),
  ];
  for (const relative of inputs)
    manifest.inputHashes[relative] = fileSha(path.join(repoRoot, relative));
  if (
    manifest.inputHashes[
      'scripts/commercial-hardening/sql/pr11-rls-plan-probe.sql'
    ] !== canonicalRlsProbeSha
  ) {
    throw new Error('Canonical RLS probe hash drift');
  }
  const forbiddenCandidateSql =
    /\b(analyze|enable_seqscan|enable_bitmapscan|enable_indexscan|random_page_cost|seq_page_cost|cpu_(?:tuple|index_tuple|operator)_cost|work_mem|plan_cache_mode)\b/i;
  for (const candidateInput of [
    sql.blocksCandidate,
    sql.blocksCandidateDdl,
    sql.blocksIntegrity,
    sql.readCandidate,
    sql.writeCandidate,
    sql.semanticCandidate,
    sql.candidatePgtap,
    sql.rlsCandidateDdl,
  ]) {
    const source = fs.readFileSync(
      path.join(sqlDirectory, candidateInput),
      'utf8'
    );
    if (forbiddenCandidateSql.test(source)) {
      throw new Error(
        `Candidate SQL changes canonical planner conditions: ${candidateInput}`
      );
    }
  }
  saveManifest();
  psqlFile('initial-preflight', sql.preflight);
  psqlFile('initial-postflight', sql.postflight);
  psqlFile('initial-normalize', sql.normalize);
  snapshot('initial-clean', true);

  for (const [id, state, sqlFile, candidate] of candidateOrder(
    'blocks',
    sql.blocksCurrent,
    sql.blocksCandidate
  )) {
    normalizedSample({ id, family: 'blocks', state, sqlFile, candidate });
  }
  normalizedSample({
    id: 'blocks-integrity',
    family: 'integrity',
    state: 'both',
    sqlFile: sql.blocksIntegrity,
  });

  for (let runNumber = 1; runNumber <= 3; runNumber += 1) {
    normalizedSample({
      id: `rls-write-calibration-${runNumber}`,
      family: 'write-calibration',
      state: 'current',
      sqlFile: sql.writeCurrent,
    });
  }
  const writeGates = {};
  for (const probe of ['coverage_insert_2000', 'menu_profile_insert_2000']) {
    const rows = sampleValues('write-calibration', 'current').map(sample =>
      findProbe(sample, probe)
    );
    const executionBaseline = median(rows.map(row => row.executionMs));
    const walBaseline = median(rows.map(row => row.walBytes));
    writeGates[probe] = {
      baselineExecutionMs: executionBaseline,
      baselineWalBytes: walBaseline,
      executionMs: fixedLimits.rlsWrite[probe].executionMs,
      walBytes: fixedLimits.rlsWrite[probe].walBytes,
      gateSource: 'predeclared-fixed-limit',
    };
  }
  const frozen = {
    protocol: manifest.protocol,
    frozenAt: new Date().toISOString(),
    candidateSqlExecutionCount: manifest.candidateSqlExecutionCount,
    gatesFrozenBeforeFirstRlsCandidate:
      manifest.candidateSqlExecutionCount === 0,
    blocksCandidateSqlExecutionCount: manifest.blocksCandidateSqlExecutionCount,
    note: 'Fixed write limits were declared before this run; calibration is diagnostic only and no RLS candidate SQL has executed.',
    writeGates,
  };
  fs.writeFileSync(
    path.join(outputDirectory, 'frozen-write-gates.json'),
    `${JSON.stringify(frozen, null, 2)}\n`,
    'utf8'
  );
  manifest.gatesFrozenBeforeCandidate =
    frozen.gatesFrozenBeforeFirstRlsCandidate;
  manifest.frozenWriteGatesSha256 = fileSha(
    path.join(outputDirectory, 'frozen-write-gates.json')
  );
  saveManifest();

  for (const [id, state, sqlFile, candidate] of candidateOrder(
    'rls-read',
    sql.readCurrent,
    sql.readCandidate
  )) {
    normalizedSample({ id, family: 'rls-read', state, sqlFile, candidate });
  }
  for (const [id, state, sqlFile, candidate] of candidateOrder(
    'rls-write',
    sql.writeCurrent,
    sql.writeCandidate
  )) {
    normalizedSample({ id, family: 'rls-write', state, sqlFile, candidate });
  }
  normalizedSample({
    id: 'rls-semantic-current',
    family: 'semantic',
    state: 'current',
    sqlFile: sql.semanticCurrent,
  });
  normalizedSample({
    id: 'rls-semantic-candidate',
    family: 'semantic',
    state: 'candidate',
    sqlFile: sql.semanticCandidate,
    candidate: true,
  });
  normalizedSample({
    id: 'rls-candidate-pgtap',
    family: 'pgtap',
    state: 'candidate',
    sqlFile: sql.candidatePgtap,
    candidate: true,
  });

  psqlFile('final-normalize', sql.normalize);
  psqlFile('final-postflight', sql.postflight);
  snapshot('final-clean', true);
  const summary = finalSummary(writeGates);
  fs.writeFileSync(
    path.join(outputDirectory, 'experiment-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );
  manifest.status = summary.primaryPass ? 'pass' : 'gate-fail';
  manifest.summarySha256 = fileSha(
    path.join(outputDirectory, 'experiment-summary.json')
  );
  exitCode = summary.primaryPass ? 0 : 2;
} catch (error) {
  manifest.status = 'safety-fail';
  manifest.error = error instanceof Error ? error.stack : String(error);
  try {
    psqlFile('emergency-postflight', sql.postflight);
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
