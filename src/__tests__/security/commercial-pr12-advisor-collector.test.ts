/** @jest-environment node */

import { runPr12Module } from './pr12-local-module-test-helpers';

const advisorModule = 'scripts/commercial-hardening/pr12-advisor-diff.mjs';

describe('PR12 Advisor snapshot readiness', () => {
  it('builds exact zero-retry before and after command descriptors', () => {
    const result = runPr12Module(
      advisorModule,
      `
const common = {
  supabasePath: 'C:\\\\tools\\\\supabase.exe',
  directDatabaseUrl: 'postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Csecure%5Croot.crt',
  externalWorkdir: 'C:\\\\external-pr12'
};
const before = subject.buildAdvisorCommandDescriptor({
  ...common,
  commandId: 'PR12-CMD-006'
});
const after = subject.buildAdvisorCommandDescriptor({
  ...common,
  commandId: 'PR12-CMD-016'
});
let production = 'NOT_REJECTED';
try {
  subject.buildAdvisorCommandDescriptor({
    ...common,
    commandId: 'PR12-CMD-016',
    directDatabaseUrl: 'postgresql://postgres@db.qnanuoqveidwvacvbhqp.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Csecure%5Croot.crt'
  });
} catch (error) {
  production = error.message;
}
console.log(JSON.stringify({ before, after, production }));
`
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      production: string;
    };
    for (const [commandId, descriptor] of [
      ['PR12-CMD-006', output.before],
      ['PR12-CMD-016', output.after],
    ] as const) {
      expect(descriptor).toMatchObject({
        commandId,
        executable: 'C:\\tools\\supabase.exe',
        args: [
          'db',
          'advisors',
          '--db-url',
          expect.stringContaining('sslmode=verify-full'),
          '--type',
          'all',
          '--level',
          'info',
          '--fail-on',
          'error',
          '--output-format',
          'json',
        ],
        cwd: 'C:\\external-pr12',
        shell: false,
        stdin: 'ignore',
        wrapperRetryCount: 0,
        maximumDispatchCount: 1,
        timeoutMs: 300000,
        executionStatus: 'NOT_RUN',
        executionAuthorized: false,
      });
    }
    expect(output.production).toBe('PRODUCTION_CONTACT_DENIED');
  });

  it('accepts only the pinned CLI 2.109.0 JSON success envelope', () => {
    const result = runPr12Module(
      advisorModule,
      `
const accepted = subject.parseAdvisorCliJsonOutput(
  '{"results":[],"message":"db advisors"}\\n'
);
const rejected = {};
for (const [name, value] of Object.entries({
  legacyArray: '[]\\n',
  legacyAdvisors: '{"advisors":[]}\\n',
  extraKey: '{"results":[],"message":"db advisors","extra":true}\\n',
  wrongMessage: '{"results":[],"message":"other"}\\n',
  nonCanonical: '{ "results": [], "message": "db advisors" }\\n',
  trailing: '{"results":[],"message":"db advisors"}\\n{}\\n'
})) {
  try {
    subject.parseAdvisorCliJsonOutput(value);
  } catch (error) {
    rejected[name] = error.message;
  }
}
console.log(JSON.stringify({ accepted, rejected }));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      accepted: [],
      rejected: {
        legacyArray: 'ADVISOR_OUTPUT_INVALID',
        legacyAdvisors: 'ADVISOR_OUTPUT_INVALID',
        extraKey: 'ADVISOR_OUTPUT_INVALID',
        wrongMessage: 'ADVISOR_OUTPUT_INVALID',
        nonCanonical: 'ADVISOR_OUTPUT_INVALID',
        trailing: 'ADVISOR_OUTPUT_INVALID',
      },
    });
  });

  it('normalizes stable finding keys and deterministic diffs', () => {
    const result = runPr12Module(
      advisorModule,
      `
const binding = '${'b'.repeat(64)}';
const common = {
  schemaVersion: 1,
  bindingSha256: binding,
  projectRef: 'abcdefghijklmnopqrst',
  databaseSystemIdentifier: 'source-system-001',
  category: 'security'
};
const baseFinding = {
  name: 'rls_disabled_in_public',
  title: 'RLS Disabled',
  level: 'WARN',
  facing: 'EXTERNAL',
  categories: ['SECURITY'],
  description: 'RLS must be enabled',
  detail: 'public.example',
  remediation: 'Enable RLS',
  metadata: { schema: 'public', table: 'example' },
  cache_key: 'public.example'
};
const before = subject.normalizeAdvisorSnapshot({
  ...common,
  commandId: 'PR12-CMD-006',
  capturedAt: '2026-07-26T01:00:00.000Z',
  findings: [baseFinding]
});
const after = subject.normalizeAdvisorSnapshot({
  ...common,
  commandId: 'PR12-CMD-016',
  capturedAt: '2026-07-26T02:00:00.000Z',
  findings: [
    baseFinding,
    {
      ...baseFinding,
      name: 'unused_index',
      title: 'Unused Index',
      level: 'INFO',
      categories: ['PERFORMANCE'],
      detail: 'public.example_idx',
      cache_key: 'public.example_idx'
    }
  ]
});
const diff = subject.diffAdvisorSnapshots(before, after);
console.log(JSON.stringify({ before, diff }));
`
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as {
      before: { findings: ReadonlyArray<{ stableKey: string }> };
      diff: {
        status: string;
        added: ReadonlyArray<{ level: string }>;
        removed: readonly unknown[];
        unchanged: readonly unknown[];
      };
    };
    expect(output.before.findings[0]?.stableKey).toMatch(/^[a-f0-9]{64}$/);
    expect(output.diff.status).toBe('ADVISOR_DIFF_PASS');
    expect(output.diff.added).toHaveLength(1);
    expect(output.diff.added[0]?.level).toBe('INFO');
    expect(output.diff.removed).toHaveLength(0);
    expect(output.diff.unchanged).toHaveLength(1);
  });

  it('rejects new errors, duplicate keys, unknown shapes, and binding mismatch', () => {
    const result = runPr12Module(
      advisorModule,
      `
const base = {
  schemaVersion: 1,
  bindingSha256: '${'b'.repeat(64)}',
  projectRef: 'abcdefghijklmnopqrst',
  databaseSystemIdentifier: 'source-system-001',
  category: 'security',
  capturedAt: '2026-07-26T01:00:00.000Z',
  findings: []
};
const errorFinding = {
  name: 'security_definer_view',
  title: 'Security Definer View',
  level: 'ERROR',
  facing: 'EXTERNAL',
  categories: ['SECURITY'],
  description: 'Unsafe view',
  detail: 'public.example',
  remediation: 'Use security_invoker',
  metadata: { schema: 'public', view: 'example' },
  cache_key: 'public.example'
};
const before = subject.normalizeAdvisorSnapshot({
  ...base,
  commandId: 'PR12-CMD-006'
});
const after = subject.normalizeAdvisorSnapshot({
  ...base,
  commandId: 'PR12-CMD-016',
  capturedAt: '2026-07-26T02:00:00.000Z',
  findings: [errorFinding]
});
const rejected = {};
try {
  subject.diffAdvisorSnapshots(before, after);
} catch (error) {
  rejected.newError = error.message;
}
try {
  subject.normalizeAdvisorSnapshot({
    ...base,
    commandId: 'PR12-CMD-006',
    findings: [errorFinding, errorFinding]
  });
} catch (error) {
  rejected.duplicate = error.message;
}
try {
  subject.normalizeAdvisorSnapshot({
    ...base,
    commandId: 'PR12-CMD-006',
    findings: [{ surprise: true }]
  });
} catch (error) {
  rejected.unknown = error.message;
}
try {
  const otherBinding = subject.normalizeAdvisorSnapshot({
    ...base,
    bindingSha256: '${'c'.repeat(64)}',
    commandId: 'PR12-CMD-016',
    capturedAt: '2026-07-26T02:00:00.000Z',
    findings: [errorFinding]
  });
  subject.diffAdvisorSnapshots(before, otherBinding);
} catch (error) {
  rejected.binding = error.message;
}
try {
  subject.diffAdvisorSnapshots(before, {
    ...after,
    snapshotSha256: '${'d'.repeat(64)}'
  });
} catch (error) {
  rejected.integrity = error.message;
}
console.log(JSON.stringify(rejected));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      newError: 'ADVISOR_NEW_ERROR_FINDING',
      duplicate: 'ADVISOR_DUPLICATE_FINDING',
      unknown: 'ADVISOR_FINDING_SHAPE_INVALID',
      binding: 'ADVISOR_BINDING_MISMATCH',
      integrity: 'ADVISOR_SNAPSHOT_INTEGRITY_MISMATCH',
    });
  });
});
