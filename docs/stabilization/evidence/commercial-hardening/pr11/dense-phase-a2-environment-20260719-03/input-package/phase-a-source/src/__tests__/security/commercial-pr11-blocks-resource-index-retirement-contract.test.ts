/** @jest-environment node */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

const SPEC_PATH =
  'docs/stabilization/spec-commercial-pr11-blocks-resource-index-retirement-v1.0.md';
const RED_CONTRACT_PATH =
  'scripts/commercial-hardening/red-contracts/14_pr11_blocks_resource_index_retirement.sql';
const RED_RUNNER_PATH = 'scripts/commercial-hardening/run-red-contracts.mjs';
const PHASE_A_RUNNER_PATH =
  'scripts/commercial-hardening/run-pr11-blocks-resource-index-drop-rollback.mjs';
const PHASE_A_SQL_ROOT = 'scripts/commercial-hardening/sql';
const PHASE_A_SQL = [
  'pr11-blocks-resource-index-drop-preflight.sql',
  'pr11-blocks-resource-index-drop-ddl.sql',
  'pr11-blocks-resource-index-drop-current.sql',
  'pr11-blocks-resource-index-drop-candidate.sql',
  'pr11-blocks-resource-index-drop-plan-current.sql',
  'pr11-blocks-resource-index-drop-plan-candidate.sql',
  'pr11-blocks-resource-index-drop-plan-probe.sql',
  'pr11-blocks-resource-index-drop-cascade-current.sql',
  'pr11-blocks-resource-index-drop-cascade-candidate.sql',
  'pr11-blocks-resource-index-drop-cascade-probe.sql',
  'pr11-blocks-resource-index-drop-integrity.sql',
] as const;
const EVIDENCE_ROOT = 'docs/stabilization/evidence/commercial-hardening/pr11';

const EXPECTED_REMAINING_INDEXES = new Map([
  ['blocks_created_by_idx', '5f624c3641d5a072b4ba31b8f55d7b66'],
  ['blocks_deleted_by_idx', 'ea5d67f947607c944013ee74bbfc3e89'],
  ['blocks_pkey', '6402aea3cabc01c46abe24ca5c0c7e37'],
  ['blocks_resource_clinic_idx', '9901fe5e728a0fe29c3ca32c6759b736'],
  ['idx_blocks_clinic_id', '4580a4a6e6c32a839fed49967e419de0'],
  ['idx_blocks_clinic_time', '0a58b803eedf010dacb7150def44cf82'],
  ['idx_blocks_end_time', '9a9e11de00f110134b3308be3b82d829'],
  ['idx_blocks_is_active', '14d85b4af0f28f37f02740078496e4f6'],
  ['idx_blocks_resource_time', '1a97e824b3a7803be36164abb577192b'],
  ['idx_blocks_start_time', '6ce577adfe6bfcf4041badfdf38a848f'],
] as const);

const IMMUTABLE_PR11_SQL = new Map([
  [
    'supabase/migrations/20260716160342_commercial_performance_safe_fk_indexes.sql',
    'D638168DF8B5B525AA6410B96CC7584215F012AA651628A641FD318985E924CA',
  ],
  [
    'supabase/migrations/20260716160402_commercial_rls_plan_cleanup.sql',
    '061178CE97700AE0105832BD645E4C1D053FF39D59D8718C283964842BB12CAE',
  ],
  [
    'supabase/migrations/20260718011731_commercial_pr11_fixed_performance_forward_fix.sql',
    '15FDE71CFDBA9D335239ED77A11F12216B9754FC0F75F2A8FCB992005159660B',
  ],
  [
    'supabase/rollbacks/20260716160342_commercial_performance_safe_fk_indexes_rollback.sql',
    '40C7AEEF24FACE1C0F2837F9EE59AC18AE2802EB186212377E9FDA4B8D79B47A',
  ],
  [
    'supabase/rollbacks/20260716160402_commercial_rls_plan_cleanup_rollback.sql',
    '176FE002A66243098B037641A3738895BF6E757B1E3E1703752692F0A62B5325',
  ],
  [
    'supabase/rollbacks/20260718011731_commercial_pr11_fixed_performance_forward_fix_rollback.sql',
    'C994A796C49BB4A4F1AC840BD98E28F8A9B69EEA17D56F53327E53A9746F6263',
  ],
] as const);

const IMMUTABLE_ROOT_EVIDENCE = new Map([
  [
    'advisor-performance-after.json',
    'D94ACE9CE753EB437C7A863D12A450566D3A948CF81A1FD536676C0F0CE0162E',
  ],
  [
    'advisor-performance-before.json',
    'DCFBD972259476F1B9E22C55CD5590914D6BCC55675FCB1C0D5B25E97179A90E',
  ],
  [
    'fk-index-decision-matrix.csv',
    '4998B6CE120D392E2460E8AC5D7B8A83FEF63053B9334702EF7669F4BC3C6501',
  ],
  [
    'fk-residual-exception-matrix.csv',
    'F170542D47CFA5577FA9DF2D56F769515F6E1C8A2759D0BB957880369D6C3851',
  ],
  [
    'pilot-performance-waiver.yaml',
    '85D3DA719047B6AF80B77026C7CA6D7172319F140AAD6099331D86A38698F622',
  ],
  [
    'README.md',
    'FEE22F982F6A8BF81A09DE230AFC2691DC8A5F709CD7A033A1486103081D86EE',
  ],
  [
    'representative-query-plans.md',
    'A26D13BC4167479070271AF229AF9BDEE3893CB0053BDD77991EA2255D7677FF',
  ],
  [
    'rls-plan-after.json',
    '774F511EA1A92CFCF394841C5D2056DA4088858C5BC5B10AA5382F62B29F1909',
  ],
  [
    'rls-plan-before.json',
    'E16F144AEE4569EDFF9C2B13BA8B7B5B93F2345440148FACECD54B6851571296',
  ],
  [
    'rls-policy-decision-matrix.csv',
    '478F1E4662D90541843E7EE6CFD1895C84908A73377AFC3BC9E1E4A0EC5F6A31',
  ],
  [
    'rls-residual-exception-matrix.csv',
    '195123BC6113F4F5655192405D18924A5110F57CC9989F2F67AFA488E336BCBE',
  ],
  [
    'write-amplification.md',
    '4B0EA759A985974D05E7D64B376DE968B2C73FF0638823727A262C554DF0374E',
  ],
] as const);

interface DirectoryFingerprint {
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly sha256: string;
}

const IMMUTABLE_EVIDENCE_PACKETS = new Map<string, DirectoryFingerprint>([
  [
    'paired-local-rerun-20260717-0815',
    {
      fileCount: 272,
      totalBytes: 5_274_971,
      sha256:
        'A1D63D00DF4D0C8F4C295248CB01B2A89D21972AC87B1F49D86B712649EEE955',
    },
  ],
  [
    'forward-fix-rehearsal-20260718-01',
    {
      fileCount: 446,
      totalBytes: 5_310_314,
      sha256:
        '4C4186D49D2DDD832D400D5D61C4F1341F02A781E98DECA0F9FC450353B163FB',
    },
  ],
  [
    'forward-fix-postapply-official-attempt-20260718-01',
    {
      fileCount: 5,
      totalBytes: 16_630,
      sha256:
        '0DC03D3AB988B216500B8DAC61B6AF581A3B661BD7D11DAFC2DD4117A750C368',
    },
  ],
  [
    'forward-fix-postapply-official-20260718-02',
    {
      fileCount: 446,
      totalBytes: 5_274_080,
      sha256:
        'B1102070357F1A3055FCE5C7732A6D1DE17F04E0A151D29D583E5C835094B7D3',
    },
  ],
]);

const repoRoot = path.resolve(__dirname, '../../..');

function repositoryPath(relativePath: string): string {
  return path.join(repoRoot, relativePath);
}

function readRepositoryFile(relativePath: string): string {
  return fs.readFileSync(repositoryPath(relativePath), 'utf8');
}

function sha256Bytes(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

function repositoryFileSha256(relativePath: string): string {
  return sha256Bytes(fs.readFileSync(repositoryPath(relativePath)));
}

function normalizeExecutableSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function collectRelativeFiles(
  rootDirectory: string,
  relativeDirectory = ''
): string[] {
  const absoluteDirectory = path.join(
    repositoryPath(rootDirectory),
    ...relativeDirectory.split('/').filter(Boolean)
  );

  return fs
    .readdirSync(absoluteDirectory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap(entry => {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        return collectRelativeFiles(rootDirectory, relativePath);
      }
      if (!entry.isFile()) {
        throw new Error(`Unsupported evidence entry: ${relativePath}`);
      }
      return [relativePath];
    });
}

function fingerprintDirectory(relativeDirectory: string): DirectoryFingerprint {
  const files = collectRelativeFiles(relativeDirectory);
  const digest = createHash('sha256');
  let totalBytes = 0;

  for (const relativeFile of files) {
    const bytes = fs.readFileSync(
      path.join(repositoryPath(relativeDirectory), ...relativeFile.split('/'))
    );
    totalBytes += bytes.length;
    digest.update(relativeFile, 'utf8');
    digest.update(Buffer.from([0]));
    digest.update(bytes);
    digest.update(Buffer.from([0]));
  }

  return {
    fileCount: files.length,
    totalBytes,
    sha256: digest.digest('hex').toUpperCase(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('commercial PR-11 blocks resource singleton-index retirement Phase A', () => {
  const specification = readRepositoryFile(SPEC_PATH);
  const redContract = readRepositoryFile(RED_CONTRACT_PATH);
  const normalizedRedContract = normalizeExecutableSql(redContract);

  it('ships the Phase A specification, validation contract, and rollback harness', () => {
    for (const requiredPath of [
      SPEC_PATH,
      RED_CONTRACT_PATH,
      RED_RUNNER_PATH,
      PHASE_A_RUNNER_PATH,
      ...PHASE_A_SQL.map(file => `${PHASE_A_SQL_ROOT}/${file}`),
    ]) {
      expect(fs.existsSync(repositoryPath(requiredPath))).toBe(true);
    }

    const unauthorizedMigrationNames = fs
      .readdirSync(repositoryPath('supabase/migrations'))
      .filter(file => file.includes('blocks_resource_index_retirement'));
    const unauthorizedRecoveryNames = fs
      .readdirSync(repositoryPath('supabase/rollbacks'))
      .filter(file => file.includes('blocks_resource_index_retirement'));

    expect(unauthorizedMigrationNames).toEqual([]);
    expect(unauthorizedRecoveryNames).toEqual([]);
    expect(specification).toContain('Phase A (ROLLBACK-only comparison)');
    expect(specification).toContain(
      'Permanent migration and recovery SQL: deliberately not authored'
    );
    expect(specification).toMatch(/permanent\s+local apply is not authorized/);
  });

  it('defines one exact rollback-only candidate without weakening fixed gates', () => {
    expect(specification).toContain(
      'drop index public.idx_blocks_resource_id;'
    );
    expect(specification).toContain('`IF EXISTS`, `CASCADE`, `CONCURRENTLY`');
    expect(specification).toContain('ends in `ROLLBACK`');
    expect(specification).toContain('`current/candidate`');
    expect(specification).toContain('`candidate/current`');
    expect(specification).toContain('`<= 435.7373 ms`');
    expect(specification).toContain('`<= 521.55125 ms`');
    expect(specification).toContain('`<= 9,292,168.2`');
    expect(specification).toContain('`<= 11,133,665`');
    for (const frozenValue of [
      '`<= 2.851 ms`',
      '`<= 198.387 ms`',
      '`<= 219.224 ms`',
      '`<= 46.665 ms`',
      '`<= 81.761 ms`',
    ]) {
      expect(specification).toContain(frozenValue);
    }
    expect(specification).toMatch(/no threshold may\s+be recalculated/);
    expect(specification).toContain('database reset');
    expect(specification).toContain('Docker volume deletion');
    expect(specification).toMatch(/no\s+staging\/production connection/);
    expect(specification).toContain('Node 24');
    expect(specification).toContain('Supabase CLI `2.109.0`');
  });

  it('registers the new contract as intentionally RED before permanent DDL', () => {
    const redRunner = readRepositoryFile(RED_RUNNER_PATH);
    expect(redRunner).toContain('14_pr11_blocks_resource_index_retirement.sql');
    expect(redRunner).toContain("marker: 'RED COMM-PERF-005'");
    expect(redRunner).toMatch(
      /14_pr11_blocks_resource_index_retirement\.sql'[\s\S]*outcome: 'red'/
    );
  });

  it('keeps the comparison runner local, frozen, and fail-closed', () => {
    const runner = readRepositoryFile(PHASE_A_RUNNER_PATH);
    for (const frozenValue of [
      'aaf3837f6f8053b0379a2d4caea65880952ce027',
      '20260718011731',
      '2.109.0',
      '435.7373',
      '521.55125',
      '9_292_168.2',
      '11_133_665',
      'c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78',
      '94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86',
    ]) {
      expect(runner).toContain(frozenValue);
    }
    expect(runner).toContain('minimumExecutionPairWins: 2');
    expect(runner).toContain('sha(JSON.stringify(logicalRecords))');
    expect(runner).toContain('everyPairCandidateWalRecordsAtMostCurrent: true');
    expect(runner).toContain('everyPairCandidateWalBytesAtMostCurrent: true');
    expect(runner).toContain('discardedSamplesAllowed: false');
    expect(runner).toContain('manifest.candidateSqlExecutionCount === 8');
    expect(runner).toContain('summary.phaseAResult =');
    expect(runner).not.toMatch(/db\s+reset|volume\s+(delete|remove)/i);
  });

  it('limits candidate schema DDL to one transaction-local index drop', () => {
    const ddl = normalizeExecutableSql(
      readRepositoryFile(
        `${PHASE_A_SQL_ROOT}/pr11-blocks-resource-index-drop-ddl.sql`
      )
    );
    expect(
      ddl.match(/\bdrop\s+index\s+public\.idx_blocks_resource_id\s*;/g)
    ).toHaveLength(1);
    expect(ddl).not.toMatch(
      /\bdrop\s+index\s+(if\s+exists\s+)?(?!public\.idx_blocks_resource_id)/
    );
    expect(ddl).not.toMatch(/\bconcurrently\b|\bcascade\b|\bcommit\b/);

    for (const state of [
      'candidate',
      'plan-candidate',
      'cascade-candidate',
    ] as const) {
      const wrapper = readRepositoryFile(
        `${PHASE_A_SQL_ROOT}/pr11-blocks-resource-index-drop-${state}.sql`
      );
      expect(wrapper).toContain('begin;');
      expect(wrapper).toContain('pr11-blocks-resource-index-drop-ddl.sql');
      if (state === 'candidate') {
        expect(wrapper).toContain('pr11-performance-probe.sql');
        expect(
          readRepositoryFile(`${PHASE_A_SQL_ROOT}/pr11-performance-probe.sql`)
        ).toMatch(/\brollback\s*;/i);
      } else {
        expect(wrapper).toContain('rollback;');
      }
      expect(wrapper).toContain('pr11-postapply-permanent-state.sql');
      expect(wrapper).toContain(
        'pr11-blocks-resource-index-drop-preflight.sql'
      );
    }
  });

  it('freezes natural plans, cascade volume, and the 15-case compatibility matrix', () => {
    const planProbe = readRepositoryFile(
      `${PHASE_A_SQL_ROOT}/pr11-blocks-resource-index-drop-plan-probe.sql`
    );
    const cascadeProbe = readRepositoryFile(
      `${PHASE_A_SQL_ROOT}/pr11-blocks-resource-index-drop-cascade-probe.sql`
    );
    const integrity = readRepositoryFile(
      `${PHASE_A_SQL_ROOT}/pr11-blocks-resource-index-drop-integrity.sql`
    );
    expect(planProbe).toContain('generate_series(1, 200)');
    expect(planProbe).toContain('generate_series(1, 100)');
    expect(planProbe).toContain("'blocks_resource_clinic_idx'");
    expect(planProbe).toContain("'idx_blocks_resource_time'");
    expect(planProbe).not.toMatch(/\bset\s+(local\s+)?enable_/i);
    expect(planProbe).not.toMatch(
      /node_data ->> 'Relation Name' = 'blocks'\s+and node_data ->> 'Index Name'/
    );
    expect(cascadeProbe).toContain('generate_series(1, 10000)');
    expect(cascadeProbe).toContain("'deleted_rows', deleted_rows");
    expect(integrity).toContain("'paired_cases', 15");
    expect(integrity).toContain("'diagnostic_cases', 10");
    expect(integrity).toContain("'behavior_cases', 5");
    for (const diagnostic of [
      'returned_sqlstate',
      'message_text',
      'detail_text',
      'hint_text',
      'schema_name',
      'table_name',
      'column_name',
      'constraint_name',
    ]) {
      expect(integrity).toContain(diagnostic);
    }
  });

  it('is RED while the exact singleton exists and GREEN only after its absence', () => {
    expect(redContract).toContain('RED COMM-PERF-005');
    expect(redContract).toContain(
      "to_regclass('public.idx_blocks_resource_id') is not null"
    );
    expect(redContract).toContain('7a4092df4bfffa0e82d7936ba6384362');
    expect(redContract).toContain(
      'redundant singleton blocks resource index remains'
    );
    expect(redContract).toContain('exact candidate blocks index set drift');
    expect(redContract).toContain('where expected_indexes.index_name is null');

    expect(EXPECTED_REMAINING_INDEXES.size).toBe(10);
    for (const [indexName, definitionHash] of EXPECTED_REMAINING_INDEXES) {
      expect(redContract).toContain(`'${indexName}'`);
      expect(redContract).toContain(`'${definitionHash}'`);
    }

    expect(redContract).toContain('index_data.indnkeyatts = 1');
    expect(redContract).toContain('index_data.indnatts = 1');
    expect(redContract).toContain('index_data.indpred is null');
    expect(redContract).toContain('index_data.indexprs is null');
    expect(redContract).toContain('constraint_data.conindid');
  });

  it('keeps the RED contract validation-only and single-variable', () => {
    expect(normalizedRedContract).not.toMatch(
      /\b(drop|create|alter)\s+(index|table|constraint|policy|function)\b/
    );
    expect(normalizedRedContract).not.toMatch(/\bgrant\b|\brevoke\b/);
    expect(normalizedRedContract).not.toMatch(
      /\b(insert\s+into|update|delete\s+from|truncate)\b/
    );
    expect(normalizedRedContract).not.toMatch(/\bcommit\b|\brollback\b/);
    expect(normalizedRedContract).not.toMatch(
      /disable\s+row\s+level\s+security/
    );
  });

  it('freezes the composite FK, trigger, ACL/RLS, helpers, and catalog hashes', () => {
    for (const expectedValue of [
      '9901fe5e728a0fe29c3ca32c6759b736',
      'a3e490b595d9cf3153c16f482e053df3',
      '6c2d9cf01a89532d7a688b7d4a43b242',
      '39c16618a7c772d6b9ecd1a541d0c2a5',
      'fe160976fe22dac01208d155ebf16984',
      '0b0844aa406026a93c399db93c0307eb',
      '3019ca607039201b5c8f73aad280424d',
      'bbcc63179bc72b3cada981ebfc158553',
      'cf8d035d1b3ad5c1834b45794d5f1574',
      'bf45366a67070170d788938279dc36e8',
      '23922d2c0ddc8c7a0df144df722c43ca',
      'fc66b0426f2e950d2b5e9b3189466177',
      'b3c029146da59fb99daee65de36e9657',
    ]) {
      expect(redContract).toContain(expectedValue);
      expect(specification).toContain(expectedValue);
    }

    expect(specification).toContain(
      'c1ab040ce4be526ae6ca38082a1b8be6a364635d9e7f40f1f7b5cc865d7a0f78'
    );
    expect(specification).toContain(
      '94760df8826defb0dc30eb4445c80178d890537b8fcaedcc536b08219b231f86'
    );

    expect(redContract).toContain("constraint_data.confmatchtype = 's'");
    expect(redContract).toContain("constraint_data.confupdtype = 'a'");
    expect(redContract).toContain("constraint_data.confdeltype = 'c'");
    expect(redContract).toContain('not constraint_data.condeferrable');
    expect(redContract).toContain("trigger_data.tgenabled = 'O'");
    expect(redContract).toContain('relation_data.relrowsecurity');
    expect(redContract).toContain('not relation_data.relforcerowsecurity');
    expect(redContract).toContain('app_private.get_current_role()');
    expect(redContract).toContain('app_private.can_access_clinic(uuid)');
    expect(redContract).toContain(
      'app_private.get_current_accessible_clinic_ids()'
    );
    expect(redContract).toContain(
      "count(*) from pg_policies where schemaname = 'public') <> 183"
    );
    expect(redContract).toContain('max(version)');
    expect(redContract).toContain("'20260718011731'");
  });

  it('keeps every applied PR-11 migration and recovery guard byte-identical', () => {
    for (const [relativePath, expectedSha256] of IMMUTABLE_PR11_SQL) {
      expect(repositoryFileSha256(relativePath)).toBe(expectedSha256);
    }
  });

  it('keeps all root PR-11 evidence and the pilot waiver byte-identical', () => {
    const actualRootFiles = fs
      .readdirSync(repositoryPath(EVIDENCE_ROOT), { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right, 'en'));
    const expectedRootFiles = [...IMMUTABLE_ROOT_EVIDENCE.keys()].sort(
      (left, right) => left.localeCompare(right, 'en')
    );

    expect(actualRootFiles).toEqual(expectedRootFiles);
    for (const [fileName, expectedSha256] of IMMUTABLE_ROOT_EVIDENCE) {
      expect(repositoryFileSha256(`${EVIDENCE_ROOT}/${fileName}`)).toBe(
        expectedSha256
      );
    }

    const waiver = readRepositoryFile(
      `${EVIDENCE_ROOT}/pilot-performance-waiver.yaml`
    );
    expect(waiver).toContain('status: PASS_WITH_RISK');
    expect(waiver).toContain('primary_measurement_pass: false');
    expect(waiver).toContain('authorizes_general_commercial_release: false');
  });

  it('keeps every completed PR-11 evidence packet byte-identical', () => {
    for (const [
      directoryName,
      expectedFingerprint,
    ] of IMMUTABLE_EVIDENCE_PACKETS) {
      expect(fingerprintDirectory(`${EVIDENCE_ROOT}/${directoryName}`)).toEqual(
        expectedFingerprint
      );
    }
  });

  it('does not change package dependencies or the npm lock graph', () => {
    const parsedManifest: unknown = JSON.parse(
      readRepositoryFile('package.json')
    );
    if (!isRecord(parsedManifest)) {
      throw new Error('package.json must contain an object');
    }

    const dependencyContract = {
      dependencies: parsedManifest.dependencies ?? null,
      devDependencies: parsedManifest.devDependencies ?? null,
      peerDependencies: parsedManifest.peerDependencies ?? null,
      optionalDependencies: parsedManifest.optionalDependencies ?? null,
      overrides: parsedManifest.overrides ?? null,
      engines: parsedManifest.engines ?? null,
    };

    expect(sha256Bytes(JSON.stringify(dependencyContract))).toBe(
      'F8D0B5A02C4622F03F760FD0736619868D944127DAE81FC69FAD479BABF50EC4'
    );
    expect(repositoryFileSha256('package-lock.json')).toBe(
      '098EE73C073FF2B5882E08405526B431B9A8A0619E06F256B06D7609AAE26EDF'
    );
  });
});
