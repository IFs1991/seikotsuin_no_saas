/** @jest-environment node */

import { runPr12Module } from './pr12-local-module-test-helpers';

const typesModule = 'scripts/commercial-hardening/pr12-hosted-types-parity.mjs';

const generatedTypes = `export type Json = string | number | boolean | null

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12.2.0 (generated)'
  }
  public: {
    Tables: {}
  }
}
`;

describe('PR12 hosted generated-types readiness', () => {
  it('compares normalized temporary output without writing committed types', () => {
    const result = runPr12Module(
      typesModule,
      `
const generated = ${JSON.stringify(generatedTypes)};
const committed = generated.replace('12.2.0 (generated)', '12.2.0 (committed)');
const comparison = subject.compareHostedTypes({
  generatedTypes: generated,
  committedTypes: committed,
  projectRef: 'abcdefghijklmnopqrst',
  bindingSha256: '${'b'.repeat(64)}',
  gitCommit: '${'c'.repeat(40)}',
  databaseSystemIdentifier: '7662783869098430503'
});
const command = subject.buildHostedTypesCommand({
  supabasePath: 'C:\\\\tools\\\\supabase.exe',
  projectRef: 'abcdefghijklmnopqrst',
  externalWorkdir: 'C:\\\\external-pr12',
  repositoryRoot: process.cwd()
});
console.log(JSON.stringify({ comparison, command }));
`
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as {
      comparison: { status: string; parity: boolean };
      command: { args: readonly string[]; outputMode: string };
    };
    expect(output.comparison).toMatchObject({
      status: 'GENERATED_TYPES_PARITY',
      parity: true,
    });
    expect(output.command.args).toEqual([
      'gen',
      'types',
      '--lang',
      'typescript',
      '--project-id',
      'abcdefghijklmnopqrst',
      '--schema',
      'public',
    ]);
    expect(output.command.outputMode).toBe(
      'CAPTURE_STDOUT_TO_EXTERNAL_EVIDENCE'
    );
    expect(output.command.args).not.toContain('--linked');
  });

  it('rejects type drift and repository-internal workdirs', () => {
    const result = runPr12Module(
      typesModule,
      `
let drift = 'NOT_REJECTED';
try {
  subject.compareHostedTypes({
    generatedTypes: ${JSON.stringify(generatedTypes.replace('Tables: {}', 'Tables: { drift: true }'))},
    committedTypes: ${JSON.stringify(generatedTypes)},
    projectRef: 'abcdefghijklmnopqrst',
    bindingSha256: '${'b'.repeat(64)}',
    gitCommit: '${'c'.repeat(40)}',
    databaseSystemIdentifier: '7662783869098430503'
  });
} catch (error) {
  drift = error.message;
}
let internal = 'NOT_REJECTED';
try {
  subject.buildHostedTypesCommand({
    supabasePath: 'C:\\\\tools\\\\supabase.exe',
    projectRef: 'abcdefghijklmnopqrst',
    externalWorkdir: process.cwd(),
    repositoryRoot: process.cwd()
  });
} catch (error) {
  internal = error.message;
}
console.log(JSON.stringify({ drift, internal }));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      drift: 'GENERATED_TYPES_DRIFT',
      internal: 'EXTERNAL_WORKDIR_REQUIRED',
    });
  });

  it('produces a secret-free structural drift diagnostic before failing closed', () => {
    const result = runPr12Module(
      typesModule,
      `
const committed = ${JSON.stringify(generatedTypes)};
const generated = committed.replace('Tables: {}', 'Tables: { hosted_only: true }');
const diagnostic = subject.diagnoseHostedTypesParity({
  generatedTypes: generated,
  committedTypes: committed
});
console.log(JSON.stringify(diagnostic));
`
    );

    expect(result.status).toBe(0);
    const diagnostic = JSON.parse(result.stdout) as {
      status: string;
      parity: boolean;
      firstDifference: {
        generatedLineNumber: number;
        committedLineNumber: number;
        generatedLineSha256: string;
        committedLineSha256: string;
      };
      generatedSha256: string;
      committedSha256: string;
    };
    expect(diagnostic).toMatchObject({
      status: 'GENERATED_TYPES_DRIFT',
      parity: false,
      firstDifference: {
        generatedLineNumber: 8,
        committedLineNumber: 8,
      },
    });
    expect(diagnostic.generatedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(diagnostic.committedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(diagnostic.firstDifference.generatedLineSha256).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(diagnostic.firstDifference.committedLineSha256).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(result.stdout).not.toContain('hosted_only');
  });

  it('uses the isolated management-token runtime with one dispatch and fail-closed outcomes', () => {
    const result = runPr12Module(
      typesModule,
      `
const accessToken = 'unit-only-management-token';
const runtimeBinding = {
  schemaVersion: 1,
  status: 'APPROVED_NOT_EXECUTED',
  approval: { expiresAt: '2026-07-27T00:00:00.000Z' },
  target: {
    gitCommit: '${'c'.repeat(40)}',
    projectRef: 'abcdefghijklmnopqrst',
    directHost: 'db.abcdefghijklmnopqrst.supabase.co',
    directDatabaseUrl: 'postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Csecure%5Croot.crt',
    databaseSystemIdentifier: '7662783869098430503',
    caBundle: {
      path: 'C:\\\\secure\\\\root.crt',
      sha256: '${'a'.repeat(64)}'
    }
  },
  productionDenylist: {
    projectRefs: ['qnanuoqveidwvacvbhqp'],
    hosts: ['db.qnanuoqveidwvacvbhqp.supabase.co'],
    databaseSystemIdentifiers: ['7257833869098430503']
  },
  commandSequence: [
    'PR12-CMD-003',
    'PR12-CMD-004',
    'PR12-CMD-005',
    'PR12-CMD-006',
    'PR12-CMD-007',
    'PR12-CMD-007A',
    'PR12-CMD-008A'
  ]
};
const runtimeContext = {
  currentHead: '${'c'.repeat(40)}',
  now: '2026-07-26T00:00:00.000Z',
  expectedCommandSequence: runtimeBinding.commandSequence,
  caBundleObservation: {
    path: 'C:\\\\secure\\\\root.crt',
    sha256: '${'a'.repeat(64)}'
  }
};
const runtimeBindingSha256 =
  subject.computeHostedTypesRuntimeBindingSha256(runtimeBinding);
const commandApproval = {
  schemaVersion: 1,
  status: 'APPROVED_NOT_EXECUTED',
  commandId: 'PR12-CMD-010',
  authorized: true,
  gitCommit: '${'c'.repeat(40)}',
  projectRef: 'abcdefghijklmnopqrst',
  databaseSystemIdentifier: '7662783869098430503',
  bindingSha256: '${'b'.repeat(64)}',
  runtimeBindingSha256,
  prerequisiteStatus: 'SOURCE_REPLAY_PARITY_PASS',
  sourceReplayEvidenceSha256: '${'d'.repeat(64)}',
  approvedAt: '2026-07-25T23:59:00.000Z',
  expiresAt: '2026-07-26T00:30:00.000Z'
};
const base = {
  supabasePath: 'C:\\\\tools\\\\supabase.exe',
  projectRef: 'abcdefghijklmnopqrst',
  externalWorkdir: 'C:\\\\external-pr12',
  repositoryRoot: process.cwd(),
  accessToken,
  operatingSystemValues: {
    SystemRoot: 'C:\\\\Windows',
    TEMP: 'C:\\\\Temp',
    TMP: 'C:\\\\Temp',
    PATH: 'C:\\\\tools'
  },
  isolationPaths: {
    supabaseHome: 'C:\\\\external-pr12\\\\supabase-home',
    dockerConfig: 'C:\\\\external-pr12\\\\docker-config'
  },
  timeoutMs: 120000,
  committedTypes: ${JSON.stringify(generatedTypes.replace('12.2.0 (generated)', '12.2.0 (committed)'))},
  bindingSha256: '${'b'.repeat(64)}',
  gitCommit: '${'c'.repeat(40)}',
  databaseSystemIdentifier: '7662783869098430503',
  runtimeBinding,
  runtimeContext,
  commandApproval
};
let successCalls = 0;
let invocation = null;
const success = subject.dispatchHostedTypesCommandOnce(base, plan => {
  successCalls += 1;
  invocation = {
    args: plan.args,
    envKeys: Object.keys(plan.options.env).sort(),
    tokenMatches: plan.options.env.SUPABASE_ACCESS_TOKEN === accessToken,
    hasDatabaseCredential: Object.hasOwn(plan.options.env, 'PGPASSWORD'),
    shell: plan.options.shell,
    stdin: plan.options.stdio[0],
    timeout: plan.options.timeout
  };
  return {
    status: 0,
    signal: null,
    stdout: ${JSON.stringify(generatedTypes)},
    stderr: '',
    error: null
  };
});
let unknownCalls = 0;
const unknown = subject.dispatchHostedTypesCommandOnce(base, () => {
  unknownCalls += 1;
  throw new Error('synthetic timeout');
});
let drift = 'NOT_REJECTED';
try {
  subject.dispatchHostedTypesCommandOnce(base, () => ({
    status: 0,
    signal: null,
    stdout: ${JSON.stringify(generatedTypes.replace('Tables: {}', 'Tables: { drift: true }'))},
    stderr: '',
    error: null
  }));
} catch (error) {
  drift = error.message;
}
let ambientDatabaseCredential = 'NOT_REJECTED';
try {
  subject.dispatchHostedTypesCommandOnce({
    ...base,
    operatingSystemValues: {
      ...base.operatingSystemValues,
      PGPASSWORD: 'forbidden-database-credential'
    }
  }, () => {
    throw new Error('must not dispatch');
  });
} catch (error) {
  ambientDatabaseCredential = error.message;
}
let missingApprovalCalls = 0;
let missingApproval = 'NOT_REJECTED';
try {
  const { commandApproval: omittedApproval, ...withoutApproval } = base;
  void omittedApproval;
  subject.dispatchHostedTypesCommandOnce(withoutApproval, () => {
    missingApprovalCalls += 1;
    throw new Error('must not dispatch');
  });
} catch (error) {
  missingApproval = error.message;
}
let expiredApprovalCalls = 0;
let expiredApproval = 'NOT_REJECTED';
try {
  subject.dispatchHostedTypesCommandOnce({
    ...base,
    commandApproval: {
      ...base.commandApproval,
      expiresAt: '2026-07-25T23:59:59.999Z'
    }
  }, () => {
    expiredApprovalCalls += 1;
    throw new Error('must not dispatch');
  });
} catch (error) {
  expiredApproval = error.message;
}
let secretOutput = 'NOT_REJECTED';
try {
  subject.dispatchHostedTypesCommandOnce(base, () => ({
    status: 0,
    signal: null,
    stdout: accessToken,
    stderr: '',
    error: null
  }));
} catch (error) {
  secretOutput = error.message;
}
let production = 'NOT_REJECTED';
try {
  subject.dispatchHostedTypesCommandOnce({
    ...base,
    projectRef: 'qnanuoqveidwvacvbhqp'
  }, () => {
    throw new Error('must not dispatch');
  });
} catch (error) {
  production = error.message;
}
console.log(JSON.stringify({
  successCalls,
  unknownCalls,
  invocation,
  success,
  unknown,
  drift,
  missingApprovalCalls,
  missingApproval,
  expiredApprovalCalls,
  expiredApproval,
  ambientDatabaseCredential,
  secretOutput,
  production
}));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      successCalls: 1,
      unknownCalls: 1,
      invocation: {
        envKeys: expect.arrayContaining(['SUPABASE_ACCESS_TOKEN']),
        tokenMatches: true,
        hasDatabaseCredential: false,
        shell: false,
        stdin: 'ignore',
        timeout: 120000,
      },
      success: {
        commandId: 'PR12-CMD-010',
        dispatchCount: 1,
        wrapperRetryCount: 0,
        outcome: 'SUCCEEDED',
        comparison: {
          status: 'GENERATED_TYPES_PARITY',
          parity: true,
          databaseSystemIdentifier: '7662783869098430503',
        },
      },
      unknown: {
        commandId: 'PR12-CMD-010',
        dispatchCount: 1,
        wrapperRetryCount: 0,
        outcome: 'UNKNOWN_REMOTE_OUTCOME',
        comparisonStatus: 'NOT_EVALUATED',
      },
      drift: 'GENERATED_TYPES_DRIFT',
      missingApprovalCalls: 0,
      missingApproval: 'HOSTED_TYPES_DISPATCH_INVALID',
      expiredApprovalCalls: 0,
      expiredApproval: 'CMD010_APPROVAL_EXPIRED',
      ambientDatabaseCredential: 'AMBIENT_ENVIRONMENT_FORBIDDEN',
      secretOutput: 'SECRET_BEARING_PROCESS_OUTPUT',
      production: 'PRODUCTION_CONTACT_DENIED',
    });
  });
});
