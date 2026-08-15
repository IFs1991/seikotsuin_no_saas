/** @jest-environment node */

import { runPr12Module } from './pr12-local-module-test-helpers';

const runtimeModule =
  'scripts/commercial-hardening/pr12-stage-command-runtime.mjs';

function validBindingSource(): string {
  return `({
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
      databaseSystemIdentifiers: ['production-system-001']
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
  })`;
}

describe('PR12 stage command runtime', () => {
  it('accepts only the frozen toolchain including the adjacent Go helper', () => {
    const result = runPr12Module(
      runtimeModule,
      `
const observation = {
  supabase: {
    path: 'C:\\\\tools\\\\supabase.exe',
    version: '2.109.0',
    sha256: '903d7b4ba079239cecbd86e1847fef6b24f939d213d36345f34e4cd8bb137118'
  },
  supabaseGo: {
    path: 'C:\\\\tools\\\\supabase-go.exe',
    version: '2.109.0',
    sha256: '59cd06ac674fdf5d6add75206408ada0a24b1dcb796d099c13b1f2aaf3f463f0'
  },
  psql: {
    path: 'C:\\\\pgsql\\\\psql.exe',
    version: '17.9',
    sha256: '6a4b5cd854ee1c0e50646e7612a9e769c9ae86aa97bf94c50342dad058c2b531'
  }
};
const accepted = subject.assertPinnedToolchainObservation(observation);
const safeProjection = subject.projectPinnedToolchainObservation(
  accepted,
  value => value
);
let drift = 'NOT_REJECTED';
try {
  subject.assertPinnedToolchainObservation({
    ...observation,
    supabase: { ...observation.supabase, version: '2.109.1' }
  });
} catch (error) {
  drift = error.message;
}
console.log(JSON.stringify({ accepted, safeProjection, drift }));
`
    );

    expect(result.status).toBe(0);
    const output: unknown = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      accepted: { status: 'PINNED_TOOLCHAIN_VERIFIED' },
      safeProjection: {
        status: 'PINNED_TOOLCHAIN_VERIFIED',
        rawPathsRetained: false,
        projectionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      drift: 'SUPABASE_TOOLCHAIN_MISMATCH',
    });
    const safeProjection = (
      output as { safeProjection: Record<string, unknown> }
    ).safeProjection;
    expect(JSON.stringify(safeProjection)).not.toContain('C:\\\\tools');
    expect(JSON.stringify(safeProjection)).not.toContain('C:\\\\pgsql');
  });

  it('fail-closes on expiry, wrong HEAD, production identity, pooler, or password URL', () => {
    const result = runPr12Module(
      runtimeModule,
      `
const binding = ${validBindingSource()};
const accepted = subject.assertStageRuntimeBinding(binding, {
  currentHead: '${'c'.repeat(40)}',
  now: '2026-07-26T00:00:00.000Z',
  expectedCommandSequence: subject.SOURCE_REPLAY_COMMAND_SEQUENCE,
  caBundleObservation: {
    path: 'C:\\\\secure\\\\root.crt',
    sha256: '${'a'.repeat(64)}'
  }
});
const cases = {
  expired: {
    ...binding,
    approval: { expiresAt: '2026-07-25T00:00:00.000Z' }
  },
  wrongHead: {
    ...binding,
    target: { ...binding.target, gitCommit: '${'d'.repeat(40)}' }
  },
  production: {
    ...binding,
    target: {
      ...binding.target,
      projectRef: 'qnanuoqveidwvacvbhqp',
      directHost: 'db.qnanuoqveidwvacvbhqp.supabase.co',
      directDatabaseUrl: 'postgresql://postgres@db.qnanuoqveidwvacvbhqp.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Csecure%5Croot.crt'
    }
  },
  pooler: {
    ...binding,
    target: {
      ...binding.target,
      directHost: 'aws-0-ap-northeast-1.pooler.supabase.com',
      directDatabaseUrl: 'postgresql://postgres@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Csecure%5Croot.crt'
    }
  },
  password: {
    ...binding,
    target: {
      ...binding.target,
      directDatabaseUrl: 'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%5Csecure%5Croot.crt'
    }
  }
};
const rejected = {};
for (const [name, candidate] of Object.entries(cases)) {
  try {
    subject.assertStageRuntimeBinding(candidate, {
      currentHead: '${'c'.repeat(40)}',
      now: '2026-07-26T00:00:00.000Z',
      expectedCommandSequence: subject.SOURCE_REPLAY_COMMAND_SEQUENCE,
      caBundleObservation: {
        path: 'C:\\\\secure\\\\root.crt',
        sha256: '${'a'.repeat(64)}'
      }
    });
    rejected[name] = 'NOT_REJECTED';
  } catch (error) {
    rejected[name] = error.message;
  }
}
console.log(JSON.stringify({ accepted, rejected }));
`
    );

    expect(result.status).toBe(0);
    const output: unknown = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      accepted: {
        status: 'RUNTIME_BINDING_VERIFIED',
        projectRef: 'abcdefghijklmnopqrst',
      },
      rejected: {
        expired: 'APPROVAL_EXPIRED',
        wrongHead: 'GIT_HEAD_MISMATCH',
        production: 'PRODUCTION_CONTACT_DENIED',
        pooler: 'DIRECT_DATABASE_HOST_REQUIRED',
        password: 'SECRET_BEARING_DATABASE_URL',
      },
    });
  });

  it('rejects placeholder system identity and caller-colluded command order', () => {
    const result = runPr12Module(
      runtimeModule,
      `
const binding = ${validBindingSource()};
const context = {
  currentHead: '${'c'.repeat(40)}',
  now: '2026-07-26T00:00:00.000Z',
  expectedCommandSequence: subject.SOURCE_REPLAY_COMMAND_SEQUENCE,
  caBundleObservation: {
    path: 'C:\\\\secure\\\\root.crt',
    sha256: '${'a'.repeat(64)}'
  }
};
const rejected = {};
try {
  subject.assertStageRuntimeBinding({
    ...binding,
    target: {
      ...binding.target,
      databaseSystemIdentifier: 'NOT_CAPTURED'
    }
  }, context);
  rejected.placeholderSystemIdentifier = 'NOT_REJECTED';
} catch (error) {
  rejected.placeholderSystemIdentifier = error.message;
}
const colludedCommandSequence = ['PR12-CMD-003', 'PR12-CMD-005'];
try {
  subject.assertStageRuntimeBinding({
    ...binding,
    commandSequence: colludedCommandSequence
  }, {
    ...context,
    expectedCommandSequence: colludedCommandSequence
  });
  rejected.colludedCommandSequence = 'NOT_REJECTED';
} catch (error) {
  rejected.colludedCommandSequence = error.message;
}
console.log(JSON.stringify(rejected));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      placeholderSystemIdentifier: 'SYSTEM_IDENTIFIER_INVALID',
      colludedCommandSequence: 'COMMAND_SEQUENCE_MISMATCH',
    });
  });

  it('derives and checks the CA observation instead of trusting a label', () => {
    const result = runPr12Module(
      runtimeModule,
      `
const observed = subject.observeCaBundle(
  'C:\\\\secure\\\\root.crt',
  () => Buffer.from('frozen-test-ca', 'utf8')
);
const safeProjection = subject.projectCaBundleObservation(
  observed,
  value => value
);
const binding = ${validBindingSource()};
binding.target.caBundle.sha256 = observed.sha256;
const accepted = subject.assertStageRuntimeBinding(binding, {
  currentHead: '${'c'.repeat(40)}',
  now: '2026-07-26T00:00:00.000Z',
  expectedCommandSequence: subject.SOURCE_REPLAY_COMMAND_SEQUENCE,
  caBundleObservation: observed
});
let drift = 'NOT_REJECTED';
try {
  subject.assertStageRuntimeBinding(binding, {
    currentHead: '${'c'.repeat(40)}',
    now: '2026-07-26T00:00:00.000Z',
    expectedCommandSequence: subject.SOURCE_REPLAY_COMMAND_SEQUENCE,
    caBundleObservation: { ...observed, sha256: '${'f'.repeat(64)}' }
  });
} catch (error) {
  drift = error.message;
}
console.log(JSON.stringify({ observed, safeProjection, accepted, drift }));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      observed: {
        path: 'C:\\secure\\root.crt',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      safeProjection: {
        status: 'CA_BUNDLE_OBSERVATION_CAPTURED',
        rawPathRetained: false,
        projectionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      accepted: { status: 'RUNTIME_BINDING_VERIFIED' },
      drift: 'CA_BUNDLE_HASH_MISMATCH',
    });
    const safeProjection = (
      JSON.parse(result.stdout) as {
        safeProjection: Record<string, unknown>;
      }
    ).safeProjection;
    expect(JSON.stringify(safeProjection)).not.toContain('C:\\\\secure');
  });

  it('builds a scrubbed zero-retry spawn contract and dispatches at most once', () => {
    const result = runPr12Module(
      runtimeModule,
      `
const env = subject.buildIsolatedChildEnvironment({
  credentialKind: 'database',
  credentialValues: { PGPASSWORD: 'unit-only-secret' },
  operatingSystemValues: {
    SystemRoot: 'C:\\\\Windows',
    TEMP: 'C:\\\\Temp',
    TMP: 'C:\\\\Temp',
    PATH: 'C:\\\\tools'
  },
  isolationPaths: {
    supabaseHome: 'C:\\\\external-pr12\\\\supabase-home',
    dockerConfig: 'C:\\\\external-pr12\\\\docker-config'
  }
});
const plan = subject.buildPinnedSpawnContract({
  executable: 'C:\\\\pgsql\\\\psql.exe',
  args: ['--version'],
  cwd: 'C:\\\\external-pr12',
  env,
  timeoutMs: 10000
});
let calls = 0;
const success = subject.dispatchPinnedCommandOnce(plan, command => {
  calls += 1;
  return { status: 0, signal: null, stdout: 'ok', stderr: '', error: null };
});
const ambiguous = subject.dispatchPinnedCommandOnce(plan, () => {
  calls += 1;
  return { status: null, signal: 'SIGTERM', stdout: '', stderr: '', error: { code: 'ETIMEDOUT' } };
});
const thrown = subject.dispatchPinnedCommandOnce(plan, () => {
  calls += 1;
  throw new Error('dispatcher failed after an unknown boundary');
});
let retryRejected = 'NOT_REJECTED';
try {
  subject.buildPinnedSpawnContract({
    executable: 'C:\\\\pgsql\\\\psql.exe',
    args: [],
    cwd: 'C:\\\\external-pr12',
    env,
    timeoutMs: 10000,
    retries: 1
  });
} catch (error) {
  retryRejected = error.message;
}
let ambientRejected = 'NOT_REJECTED';
try {
  subject.buildIsolatedChildEnvironment({
    credentialKind: 'database',
    credentialValues: {
      PGPASSWORD: 'unit-only-secret',
      SUPABASE_DB_PASSWORD: 'forbidden-generic-secret'
    },
    operatingSystemValues: {
      SystemRoot: 'C:\\\\Windows',
      HOME: 'C:\\\\Users\\\\owner'
    },
    isolationPaths: {
      supabaseHome: 'C:\\\\external-pr12\\\\supabase-home',
      dockerConfig: 'C:\\\\external-pr12\\\\docker-config'
    }
  });
} catch (error) {
  ambientRejected = error.message;
}
let genericCredentialRejected = 'NOT_REJECTED';
try {
  subject.buildIsolatedChildEnvironment({
    credentialKind: 'database',
    credentialValues: {
      PGPASSWORD: 'unit-only-secret',
      SUPABASE_DB_PASSWORD: 'forbidden-generic-secret'
    },
    operatingSystemValues: {
      SystemRoot: 'C:\\\\Windows',
      TEMP: 'C:\\\\Temp',
      TMP: 'C:\\\\Temp',
      PATH: 'C:\\\\tools'
    },
    isolationPaths: {
      supabaseHome: 'C:\\\\external-pr12\\\\supabase-home',
      dockerConfig: 'C:\\\\external-pr12\\\\docker-config'
    }
  });
} catch (error) {
  genericCredentialRejected = error.message;
}
const longPlan = subject.buildPinnedSpawnContract({
  executable: 'C:\\\\tools\\\\supabase.exe',
  args: ['db', 'push'],
  cwd: 'C:\\\\external-pr12',
  env,
  timeoutMs: 900000
});
console.log(JSON.stringify({
  env,
  plan,
  calls,
  success,
  ambiguous,
  thrown,
  retryRejected,
  ambientRejected,
  genericCredentialRejected,
  longPlan
}));
`
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as {
      env: Record<string, string>;
      plan: {
        options: {
          shell: boolean;
          stdio: readonly string[];
          timeout: number;
        };
      };
      calls: number;
      success: { outcome: string };
      ambiguous: { outcome: string };
      thrown: { outcome: string };
      retryRejected: string;
      ambientRejected: string;
      genericCredentialRejected: string;
      longPlan: { options: { timeout: number } };
    };
    expect(Object.keys(output.env).sort()).toEqual(
      [
        'DO_NOT_TRACK',
        'DOCKER_CONFIG',
        'PATH',
        'PGPASSWORD',
        'SUPABASE_HOME',
        'SUPABASE_NO_KEYRING',
        'SUPABASE_TELEMETRY_DISABLED',
        'SystemRoot',
        'TEMP',
        'TMP',
      ].sort()
    );
    expect(output.plan.options).toMatchObject({
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    });
    expect(output.calls).toBe(3);
    expect(output.success.outcome).toBe('SUCCEEDED');
    expect(output.ambiguous.outcome).toBe('UNKNOWN_REMOTE_OUTCOME');
    expect(output.thrown.outcome).toBe('UNKNOWN_REMOTE_OUTCOME');
    expect(output.retryRejected).toBe('WRAPPER_RETRY_FORBIDDEN');
    expect(output.ambientRejected).toBe('AMBIENT_ENVIRONMENT_FORBIDDEN');
    expect(output.genericCredentialRejected).toBe(
      'CREDENTIAL_ENVIRONMENT_INVALID'
    );
    expect(output.longPlan.options.timeout).toBe(900000);
  });

  it('serializes canonical evidence without secrets', () => {
    const result = runPr12Module(
      runtimeModule,
      `
const canonical = subject.serializeCanonicalEvidence({
  z: 1,
  a: { y: true, x: 'safe' }
});
let rejected = 'NOT_REJECTED';
try {
  subject.serializeCanonicalEvidence(
    { databaseUrl: 'postgresql://postgres:unit-only-secret@example.test/postgres' },
    ['unit-only-secret']
  );
} catch (error) {
  rejected = error.message;
}
console.log(JSON.stringify({ canonical, rejected }));
`
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      canonical: '{"a":{"x":"safe","y":true},"z":1}\n',
      rejected: 'SECRET_BEARING_EVIDENCE',
    });
  });

  it('projects external paths as lexical and resolved fingerprints only', () => {
    const result = runPr12Module(
      runtimeModule,
      `
const rawPaths = {
  supabasePath: 'C:\\\\tools\\\\supabase.exe',
  supabaseGoPath: 'C:\\\\tools\\\\supabase-go.exe',
  psqlPath: 'C:\\\\pgsql\\\\psql.exe',
  caBundlePath: 'C:\\\\secure\\\\root.crt',
  externalWorkdir: 'C:\\\\external-pr12',
  supabaseHome: 'C:\\\\external-pr12\\\\supabase-home',
  dockerConfig: 'C:\\\\external-pr12\\\\docker-config'
};
const projection = subject.buildExternalPathFingerprintProjection(
  rawPaths,
  value => value.replace(/^C:\\\\\\\\/i, 'C:\\\\resolved\\\\')
);
const serialized = subject.serializeCanonicalEvidence(projection);
console.log(JSON.stringify({ rawPaths, projection, serialized }));
`
    );

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as {
      rawPaths: Record<string, string>;
      projection: {
        status: string;
        entries: Record<
          string,
          {
            pathSha256: string;
            resolvedPathSha256: string;
            rawPathRetained: boolean;
          }
        >;
        projectionSha256: string;
      };
      serialized: string;
    };
    expect(output.projection.status).toBe(
      'EXTERNAL_PATH_FINGERPRINTS_CAPTURED'
    );
    expect(Object.keys(output.projection.entries)).toHaveLength(7);
    for (const fingerprint of Object.values(output.projection.entries)) {
      expect(fingerprint.pathSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(fingerprint.resolvedPathSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(fingerprint.rawPathRetained).toBe(false);
    }
    expect(output.projection.projectionSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const rawPath of Object.values(output.rawPaths)) {
      expect(output.serialized).not.toContain(rawPath);
    }
    expect(output.serialized).not.toContain('C:\\\\');
  });
});
