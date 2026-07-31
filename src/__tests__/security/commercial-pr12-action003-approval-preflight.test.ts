/** @jest-environment node */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null;

interface PreflightRuntime {
  now(): number;
  monotonicNow(): number;
  inspectGitState(repositoryRoot: string, expectedHead: string): JsonObject;
  verifyAction002(evidenceDirectory: string, terminalPath: string): JsonObject;
  inspectDirectoryIdentity(directory: string): JsonObject;
  inspectEmptyDirectoryFingerprint(directory: string): JsonObject;
  inspectPriorActionState(directory: string): string | null;
  validateDpapiResources(
    credentialConfiguration: JsonObject,
    repositoryRoot: string,
    options: { includeDatabasePassword: boolean }
  ): JsonObject;
  revalidateDpapiResources(
    credentialConfiguration: JsonObject,
    repositoryRoot: string,
    expected: JsonObject,
    options: { includeDatabasePassword: boolean }
  ): JsonObject;
  assertAclBoundaries(
    credentialConfiguration: JsonObject,
    pathnames: string[]
  ): JsonObject;
  protectOutputAcl(
    credentialConfiguration: JsonObject,
    pathnames: string[],
    expectedPathCount?: number
  ): JsonObject;
  buildArtifacts(input: JsonObject): {
    binding: JsonObject;
    credentialConfiguration: JsonObject;
    authorizationProjection: JsonObject;
    summary: JsonObject;
  };
  initializeOutput(
    outputDirectory: string,
    credentialConfiguration: JsonObject,
    ownerPrivateApprovalRoot: string
  ): JsonObject;
  completeOutput(
    outputDirectory: string,
    artifacts: ApprovalArtifacts
  ): JsonObject;
  verifyOutput(
    outputDirectory: string,
    artifacts: ApprovalArtifacts
  ): JsonObject;
  verifyExistingOutput(
    outputDirectory: string,
    artifacts: ApprovalArtifacts,
    ownerPrivateApprovalRoot: string
  ): JsonObject;
}

interface ApprovalArtifacts {
  binding: JsonObject;
  credentialConfiguration: JsonObject;
  authorizationProjection: JsonObject;
  summary: JsonObject;
}

interface PreflightModule {
  assertWindowsAclBoundaries(
    credentialConfiguration: JsonObject,
    pathnames: string[],
    minimumPathCount?: number
  ): JsonObject;
  protectWindowsOutputAcl(
    credentialConfiguration: JsonObject,
    pathnames: string[],
    expectedPathCount?: number
  ): JsonObject;
  requireAclBoundaryPathCount(
    pathnames: string[],
    minimumPathCount?: number
  ): number;
  collectForbiddenAmbientCredentialNames(
    environment: NodeJS.ProcessEnv,
    allowPublicJestMocks: boolean
  ): string[];
  validateAction003ApprovalPreflightForTest(
    descriptorPath: string,
    runtimeOverrides: Partial<PreflightRuntime>
  ): JsonObject;
  revalidateAction003ApprovalPacketForTest(
    descriptorPath: string,
    runtimeOverrides: Partial<PreflightRuntime>
  ): JsonObject;
}

const repositoryRoot = path.resolve(__dirname, '../../..');
const preflightPath = path.join(
  repositoryRoot,
  'scripts/commercial-hardening/prepare-pr12-action003-approval-packet.mjs'
);
const expectedHead = 'b'.repeat(40);
const action002SourceHead = '6edd6733756dd73e458cf705675895a5666c76e6';
const action002BindingSha256 =
  '56b07d3eb802d546df25be3b487e32b9c30f0aa7ac1f896bba483cb5e207eb3c';
const action002RequestSha256 =
  '95149b0f64407700298cbe842cbd15780300e9e357dc492f5d4d56e490490a8e';
const action002ManifestSha256 =
  '66db9ed2b7fdb7573b76e79273c71d95551cdb7385e0ca8ee21724c56399f582';
const action002TerminalSha256 =
  '3fec7d3156c52e862602e9adb115e460c6959caeba38d5a1b290abe41513782e';

let preflight: PreflightModule;
const cleanupDirectories: string[] = [];
const savedAmbientEnvironment = new Map<string, string>();
const win = process.platform === 'win32' ? test : test.skip;

function isForbiddenAmbientNameForTest(nameInput: string): boolean {
  const name = nameInput.toUpperCase();
  return (
    [
      'PR12_SUPABASE_ACCESS_TOKEN',
      'PR12_SOURCE_DB_PASSWORD',
      'SUPABASE_ACCESS_TOKEN',
      'SUPABASE_DB_PASSWORD',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'DATABASE_URL',
      'DIRECT_URL',
      'PGPASSWORD',
      'POSTGRES_PASSWORD',
      'NODE_TLS_REJECT_UNAUTHORIZED',
      'NODE_USE_ENV_PROXY',
      'NODE_OPTIONS',
      'NODE_DEBUG',
      'NODE_DEBUG_NATIVE',
      'NODE_USE_SYSTEM_CA',
      'UNDICI_DEBUG',
    ].includes(name) ||
    /^(?:HTTP|HTTPS|ALL|NO)_PROXY$/u.test(name) ||
    /^(?:NPM_CONFIG|YARN|PNPM)_(?:HTTP|HTTPS|ALL|NO_)?PROXY$/u.test(name) ||
    name.includes('SUPABASE') ||
    /(?:^|_)(?:POSTGRES|POSTGRESQL|DATABASE|DB)(?:_|$)/u.test(name) ||
    /^PG[A-Z0-9_]+$/u.test(name) ||
    /(?:^|_)(?:DIRECT_URL|PRISMA_URL)(?:_|$)/u.test(name) ||
    (/^PR12_/u.test(name) &&
      /(?:TOKEN|PASSWORD|PASS|KEY|SECRET|CREDENTIAL|URL|URI|HOST|PORT|USER)/u.test(
        name
      ))
  );
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireJsonObject(value: JsonValue, label: string): JsonObject {
  if (!isJsonObject(value)) throw new Error(`${label}_NOT_OBJECT`);
  return value;
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isJsonObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

function sha256Bytes(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalFileSha256(value: JsonObject): string {
  return sha256Bytes(`${canonicalJson(value)}\n`);
}

function pathFingerprint(value: string): string {
  return sha256Bytes(
    path.win32.resolve(value).replaceAll('\\', '/').toLowerCase()
  );
}

function writeCanonicalJson(filename: string, value: JsonObject): void {
  fs.writeFileSync(filename, `${canonicalJson(value)}\n`, 'utf8');
}

function findPowerShellExecutable(): string {
  const powershellPath = [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  ].find(candidate => fs.existsSync(candidate));
  if (powershellPath === undefined) throw new Error('POWERSHELL_REQUIRED');
  return powershellPath;
}

function action002Evidence(): JsonObject {
  return {
    status: 'PASS',
    actionId: 'PR12-ACTION-002',
    terminalState: 'TERMINAL_PASS',
    sourceGitCommit: action002SourceHead,
    sourceBindingMaterialSha256: action002BindingSha256,
    sourceRequestSha256: action002RequestSha256,
    manifestSha256: action002ManifestSha256,
    terminalSha256: action002TerminalSha256,
    remoteContactCount: 1,
    requestAttemptCount: 1,
    automaticRetryCount: 0,
    evidenceDirectoryFingerprint: {
      pathSha256: '1'.repeat(64),
      resolvedPathSha256: '2'.repeat(64),
      device: '11',
      inode: '12',
      snapshotSha256: '3'.repeat(64),
    },
    journalDirectoryFingerprint: {
      pathSha256: '4'.repeat(64),
      resolvedPathSha256: '5'.repeat(64),
      device: '21',
      inode: '22',
      snapshotSha256: '6'.repeat(64),
    },
  };
}

function makeIdentity(realPath: string): JsonObject {
  return {
    realPath,
    resolvedPathSha256: sha256Bytes(realPath),
    device: '1',
    inode: BigInt(`0x${sha256Bytes(realPath).slice(0, 12)}`).toString(10),
  };
}

function normalizedRuntimeIdentityPath(value: string): string {
  if (/^[A-Za-z]:[\\/]/u.test(value)) {
    return path.win32.resolve(value).replaceAll('\\', '/').toLowerCase();
  }
  return path.resolve(value).replaceAll('\\', '/');
}

function makeFixture(): {
  descriptor: JsonObject;
  descriptorPath: string;
  outputDirectory: string;
  ownerPrivateApprovalRoot: string;
  pricingRawPaths: string[];
} {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pr12-action003-preflight-')
  );
  cleanupDirectories.push(directory);
  const pricingDirectory = path.join(directory, 'pricing');
  const ownerPrivateApprovalRoot = path.join(directory, 'owner-private');
  fs.mkdirSync(pricingDirectory);
  fs.mkdirSync(ownerPrivateApprovalRoot);
  const initialApprovalReceiptDirectory = path.join(
    ownerPrivateApprovalRoot,
    'source-project-provisioning-single-action-approval-receipt-v2'
  );
  fs.mkdirSync(initialApprovalReceiptDirectory);
  const actionJournalDirectoryPath = 'C:\\Owner\\PR12\\action003-journal';
  const evidenceParentDirectoryPath = 'C:\\Owner\\PR12\\action003-evidence';
  const actionJournalRealPath = normalizedRuntimeIdentityPath(
    actionJournalDirectoryPath
  );
  const evidenceParentRealPath = normalizedRuntimeIdentityPath(
    evidenceParentDirectoryPath
  );
  const actionJournalDirectoryFingerprint = {
    pathSha256: sha256Bytes(actionJournalRealPath),
    resolvedPathSha256: sha256Bytes(actionJournalRealPath),
    device: '1',
    inode: BigInt(
      `0x${sha256Bytes(actionJournalRealPath).slice(0, 12)}`
    ).toString(10),
    snapshotSha256: sha256Bytes('[]'),
  };
  const evidenceParentDirectoryFingerprint = {
    pathSha256: sha256Bytes(evidenceParentRealPath),
    resolvedPathSha256: sha256Bytes(evidenceParentRealPath),
    device: '1',
    inode: BigInt(
      `0x${sha256Bytes(evidenceParentRealPath).slice(0, 12)}`
    ).toString(10),
    snapshotSha256: sha256Bytes('[]'),
  };
  const initialApprovalReceiptPath = path.join(
    initialApprovalReceiptDirectory,
    'source-project-provisioning-single-action-approval-receipt-v2.json'
  );
  const initialApprovalReceipt: JsonObject = {
    schemaVersion: 2,
    recordType:
      'PR12_SOURCE_PROJECT_PROVISIONING_SINGLE_ACTION_APPROVAL_RECEIPT',
    decision: 'APPROVED',
    attestationStatus: 'VERIFIED',
    attestationMethod: 'SOLE_OPERATOR_EXPLICIT_SINGLE_ACTION_APPROVAL',
    actionId: 'PR12-ACTION-003',
    approvedByPrincipalId: 'owner:futoshi-iwasawa',
    approvedByDisplayName: 'FUTOSHI IWASAWA',
    acceptedAt: '2026-07-27T00:00:00.000Z',
    expiresAt: '2026-07-27T01:00:00.000Z',
    approvalTtlSeconds: 3600,
    approvalPurpose:
      'ACTION003_PACKET_PREPARATION_AND_SOURCE_PROJECT_PROVISIONING',
    gitCommit: expectedHead,
    organizationId: 'kbnsntifrawhimhfjrug',
    organizationSlug: 'kbnsntifrawhimhfjrug',
    projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
    region: 'ap-northeast-1',
    tier: 'LARGE',
    ownerAuthorizationCeilingUsdScaled: 500000,
    authorizedDurationHours: 72,
    maximumPostAttempts: 1,
    credentialConfigurationSha256: '0'.repeat(64),
    pricingEvidenceSha256: '0'.repeat(64),
    actionJournalDirectoryPathSha256: pathFingerprint(
      actionJournalDirectoryPath
    ),
    actionJournalDirectoryFingerprint,
    evidenceParentDirectoryPathSha256: pathFingerprint(
      evidenceParentDirectoryPath
    ),
    evidenceParentDirectoryFingerprint,
    soleOperatorRiskAccepted: true,
    sameUserDpapiCredentialExposureRiskAccepted: true,
    providerSpendCapLimitationAcknowledged: true,
    sameOrganizationExceptionRiskAccepted: true,
    organizationListProductionRefObservationAccepted: true,
    sharedOrganizationIamBillingControlPlaneRiskAccepted: true,
    productionDirectContactProhibitionAcknowledged: true,
    unknownChargesAcknowledged: true,
    action003PacketPreparationAuthorized: true,
    databasePasswordBootstrapAuthorized: false,
    sourceProjectProvisioningAuthorized: true,
    productionContactAuthorized: false,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    notes:
      'Synthetic owner receipt authorizing local ACTION-003 packet preparation only.',
  };
  const pricingSourceBodies = [
    '<html><body>Pro plan compute: Large costs $0.1517 per hour. Partial hours are rounded up to one full hour.</body></html>',
    '<html><body>Pro compute pricing: Large is $0.1517 per project hour, and partial hours are rounded up to a full hour.</body></html>',
    '<html><body>The Pro plan offers Large compute at $0.1517 per hour; partial hours are rounded up.</body></html>',
  ];
  const pricingRawPaths = pricingSourceBodies.map((body, index) => {
    const filename = path.join(
      pricingDirectory,
      `official-source-${String(index + 1)}.html`
    );
    fs.writeFileSync(filename, `${body}\n`, 'utf8');
    return filename;
  });
  const pricingEvidence: JsonObject = {
    freshness: {
      maximumAgeAtApprovalSeconds: 86400,
    },
    officialSources: [
      {
        sourceId: 'COMPUTE_AND_DISK',
        url: 'https://supabase.com/docs/guides/platform/compute-and-disk',
      },
      {
        sourceId: 'COMPUTE_USAGE',
        url: 'https://supabase.com/docs/guides/platform/manage-your-usage/compute',
      },
      {
        sourceId: 'PRICING',
        url: 'https://supabase.com/pricing',
      },
    ].map((source, index) => ({
      ...source,
      retrievedAt: `2026-07-26T23:${String(30 + index * 5).padStart(
        2,
        '0'
      )}:00.000Z`,
      artifactPath: path.basename(pricingRawPaths[index]),
      artifactSha256: sha256Bytes(fs.readFileSync(pricingRawPaths[index])),
    })),
  };
  const pricingEvidencePath = path.join(pricingDirectory, 'pricing.json');
  writeCanonicalJson(pricingEvidencePath, pricingEvidence);
  const credentialConfiguration: JsonObject = {
    provider: {
      providerRoot: 'C:\\Owner\\PR12\\credentials',
    },
    secrets: {
      managementAccessToken: {
        envelopeFilename: `${'7'.repeat(64)}.dpapi.json`,
        envelopeSha256: '8'.repeat(64),
      },
      databasePassword: {
        envelopeFilename: `${'9'.repeat(64)}.dpapi.json`,
        envelopeSha256: 'a'.repeat(64),
      },
    },
  };
  const credentialConfigurationPath = path.join(
    ownerPrivateApprovalRoot,
    'credential-configuration.json'
  );
  writeCanonicalJson(credentialConfigurationPath, credentialConfiguration);
  initialApprovalReceipt.credentialConfigurationSha256 = canonicalFileSha256(
    credentialConfiguration
  );
  initialApprovalReceipt.pricingEvidenceSha256 =
    canonicalFileSha256(pricingEvidence);
  writeCanonicalJson(initialApprovalReceiptPath, initialApprovalReceipt);
  const outputDirectory = path.join(ownerPrivateApprovalRoot, 'packet');
  const descriptor: JsonObject = {
    schemaVersion: 1,
    operation: 'PREPARE_PR12_ACTION003_APPROVAL_PACKET_LOCAL_ONLY',
    repositoryRoot,
    expectedGitHead: expectedHead,
    credentialConfigurationPath,
    pricingEvidencePath,
    initialApprovalReceiptPath,
    organizationIdentityEvidenceDirectoryPath:
      'C:\\Owner\\PR12\\action002-evidence',
    organizationIdentityTerminalPath:
      'C:/Owner/PR12/action002-journal/source-organization-identity-capture-action.terminal.json',
    actionJournalDirectoryPath,
    evidenceParentDirectoryPath,
    ownerPrivateApprovalRoot,
    outputDirectoryPath: outputDirectory,
    approvalRecord: {
      builtAt: '2026-07-27T00:05:01.000Z',
    },
    knownAdditionalChargesUsdScaled: 0,
    fundingSource: 'OWNER_REGISTERED_ORGANIZATION_PAYMENT_METHOD',
    notes: {
      binding:
        'Phase 1 only; zeroization residual risk accepted; Phase 2 remains unauthorized.',
      authorizationProjection:
        'System-derived ACTION-003 authorization projection; zeroization residual risk accepted; Phase 2 remains unauthorized.',
    },
  };
  const descriptorPath = path.join(ownerPrivateApprovalRoot, 'descriptor.json');
  writeCanonicalJson(descriptorPath, descriptor);
  return {
    descriptor,
    descriptorPath,
    outputDirectory,
    ownerPrivateApprovalRoot,
    pricingRawPaths,
  };
}

function makeRuntime(
  overrides: Partial<PreflightRuntime> = {}
): Partial<PreflightRuntime> {
  const dpapiResources: JsonObject = {
    providerRootIdentity: makeIdentity('c:/owner/pr12/credentials'),
    tokenEnvelopeSnapshot: {
      sha256: '8'.repeat(64),
      identity: { device: '1', inode: '2', size: 100 },
    },
    passwordEnvelopeSnapshot: {
      sha256: 'a'.repeat(64),
      identity: { device: '1', inode: '3', size: 100 },
    },
  };
  return {
    now: () => Date.parse('2026-07-27T00:05:01.000Z'),
    monotonicNow: () => 1_000,
    inspectGitState: (_root, head) => ({
      currentHead: head,
      currentBaseCommit: '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab',
      worktreeClean: true,
      organizationIdentitySourceGitCommitIsAncestor: true,
    }),
    verifyAction002: () => action002Evidence(),
    inspectDirectoryIdentity: directory => {
      return makeIdentity(normalizedRuntimeIdentityPath(directory));
    },
    inspectEmptyDirectoryFingerprint: directory => {
      const realPath = normalizedRuntimeIdentityPath(directory);
      return {
        pathSha256: sha256Bytes(realPath),
        resolvedPathSha256: sha256Bytes(realPath),
        device: '1',
        inode: sha256Bytes(realPath).slice(0, 12),
        snapshotSha256: sha256Bytes('[]'),
      };
    },
    inspectPriorActionState: () => null,
    validateDpapiResources: (_configuration, _root, options) => {
      expect(options).toEqual({ includeDatabasePassword: true });
      return dpapiResources;
    },
    revalidateDpapiResources: (_configuration, _root, expected, options) => {
      expect(options).toEqual({ includeDatabasePassword: true });
      expect(expected).toBe(dpapiResources);
      return dpapiResources;
    },
    assertAclBoundaries: (_configuration, pathnames) => {
      expect(pathnames.length).toBeGreaterThanOrEqual(20);
      return {
        pathCount: pathnames.length,
        aclProofSha256: 'c'.repeat(64),
        normalizedAclEntries: [],
      };
    },
    protectOutputAcl: () => {
      throw new Error('TEST_READ_ONLY_SEAM_MUST_NOT_PROTECT_OUTPUT');
    },
    buildArtifacts: () => ({
      binding: {},
      credentialConfiguration: {},
      authorizationProjection: {},
      summary: {
        bindingSha256: 'd'.repeat(64),
        credentialConfigurationSha256: 'e'.repeat(64),
        authorizationProjectionSha256: 'f'.repeat(64),
        sourceProjectProvisioningAuthorized: false,
        derivedExecutionBindingRequired: true,
        remoteContactPerformed: false,
        credentialReadPerformed: false,
      },
    }),
    initializeOutput: () => {
      throw new Error('TEST_READ_ONLY_SEAM_MUST_NOT_INITIALIZE_OUTPUT');
    },
    completeOutput: () => {
      throw new Error('TEST_READ_ONLY_SEAM_MUST_NOT_COMPLETE_OUTPUT');
    },
    verifyOutput: () => {
      throw new Error('TEST_READ_ONLY_SEAM_MUST_NOT_VERIFY_OUTPUT');
    },
    verifyExistingOutput: () => {
      throw new Error('TEST_VALIDATE_SEAM_MUST_NOT_VERIFY_EXISTING_OUTPUT');
    },
    ...overrides,
  };
}

beforeAll(async () => {
  const loaded: unknown =
    await import('../../../scripts/commercial-hardening/prepare-pr12-action003-approval-packet.mjs');
  preflight = loaded as PreflightModule;
});

beforeEach(() => {
  for (const name of Object.keys(process.env)) {
    if (!isForbiddenAmbientNameForTest(name)) continue;
    const value = process.env[name];
    if (typeof value === 'string') savedAmbientEnvironment.set(name, value);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of Object.keys(process.env)) {
    if (isForbiddenAmbientNameForTest(name)) delete process.env[name];
  }
  for (const [name, value] of savedAmbientEnvironment) {
    process.env[name] = value;
  }
  savedAmbientEnvironment.clear();
  for (const directory of cleanupDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('PR12 ACTION-003 operational approval preflight', () => {
  test('keeps the Windows journal fixture segment-aware under the host path runtime', () => {
    const fixture = makeFixture();
    const terminalPath = String(
      fixture.descriptor.organizationIdentityTerminalPath
    );

    expect(terminalPath).toBe(
      'C:/Owner/PR12/action002-journal/source-organization-identity-capture-action.terminal.json'
    );
    expect(normalizedRuntimeIdentityPath(path.dirname(terminalPath))).toBe(
      'c:/owner/pr12/action002-journal'
    );
  });

  test('stable-reads local inputs and validates both envelope resources without writing', () => {
    const fixture = makeFixture();
    const result = preflight.validateAction003ApprovalPreflightForTest(
      fixture.descriptorPath,
      makeRuntime()
    );
    expect(result).toMatchObject({
      status: 'VALIDATED_NOT_WRITTEN',
      operation: 'PREPARE_PR12_ACTION003_APPROVAL_PACKET_LOCAL_ONLY',
      gitHead: expectedHead,
      action002TerminalSha256,
      outputCreated: false,
      derivedExecutionBindingRequired: true,
      sourceProjectProvisioningAuthorized: false,
      remoteContactPerformed: false,
      credentialPlaintextReadPerformed: false,
    });
    expect(fs.existsSync(fixture.outputDirectory)).toBe(false);
    expect(canonicalJson(result)).not.toContain('C:\\\\Owner');
    expect(canonicalJson(result)).not.toContain(
      fixture.ownerPrivateApprovalRoot
    );
  });

  test('revalidates the exact existing three-file packet and external state without writing', () => {
    const fixture = makeFixture();
    fs.mkdirSync(fixture.outputDirectory);
    for (const filename of [
      'source-project-provisioning-binding-v6.json',
      'source-project-provisioning-credential-configuration-v2.json',
      'source-project-provisioning-authorization-projection-v1.json',
    ]) {
      writeCanonicalJson(path.join(fixture.outputDirectory, filename), {});
    }
    const verifyExistingOutput = jest.fn(() => ({
      status: 'VERIFIED',
      fileCount: 3,
      bindingSha256: 'd'.repeat(64),
      credentialConfigurationSha256: 'e'.repeat(64),
      authorizationProjectionSha256: 'f'.repeat(64),
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    }));
    const result = preflight.revalidateAction003ApprovalPacketForTest(
      fixture.descriptorPath,
      makeRuntime({
        now: () => Date.parse('2026-07-27T00:08:00.000Z'),
        verifyExistingOutput,
      })
    );

    expect(result).toMatchObject({
      status: 'REVALIDATED',
      operation: 'PREPARE_PR12_ACTION003_APPROVAL_PACKET_LOCAL_ONLY',
      gitHead: expectedHead,
      action002TerminalSha256,
      bindingSha256: 'd'.repeat(64),
      credentialConfigurationSha256: 'e'.repeat(64),
      authorizationProjectionSha256: 'f'.repeat(64),
      aclProofSha256: 'c'.repeat(64),
      outputCreated: false,
      sourceProjectProvisioningAuthorized: false,
      derivedExecutionBindingRequired: true,
      remoteContactPerformed: false,
      credentialPlaintextReadPerformed: false,
    });
    expect(verifyExistingOutput).toHaveBeenCalledTimes(1);
  });

  test('rejects non-canonical descriptor bytes before operational checks', () => {
    const fixture = makeFixture();
    fs.writeFileSync(
      fixture.descriptorPath,
      `${JSON.stringify(fixture.descriptor, null, 2)}\n`,
      'utf8'
    );
    expect(() =>
      preflight.validateAction003ApprovalPreflightForTest(
        fixture.descriptorPath,
        makeRuntime()
      )
    ).toThrow('INPUT_DESCRIPTOR_NOT_CANONICAL');
  });

  test('rejects an initial receipt that expands into database-password bootstrap', () => {
    const fixture = makeFixture();
    const receiptPath = String(fixture.descriptor.initialApprovalReceiptPath);
    const receiptValue: unknown = JSON.parse(
      fs.readFileSync(receiptPath, 'utf8')
    );
    if (!isJsonObject(receiptValue)) {
      throw new Error('INITIAL_RECEIPT_NOT_OBJECT');
    }
    receiptValue.databasePasswordBootstrapAuthorized = true;
    writeCanonicalJson(receiptPath, receiptValue);
    expect(() =>
      preflight.validateAction003ApprovalPreflightForTest(
        fixture.descriptorPath,
        makeRuntime()
      )
    ).toThrow('INITIAL_APPROVAL_RECEIPT_INVALID');
    expect(fs.existsSync(fixture.outputDirectory)).toBe(false);
  });

  test('rejects dirty Git state and Action-002 terminal drift', () => {
    for (const [runtime, code] of [
      [
        makeRuntime({
          inspectGitState: (_root, head) => ({
            currentHead: head,
            currentBaseCommit: '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab',
            worktreeClean: false,
            organizationIdentitySourceGitCommitIsAncestor: true,
          }),
        }),
        'WORKTREE_NOT_CLEAN',
      ],
      [
        makeRuntime({
          verifyAction002: () => ({
            ...action002Evidence(),
            terminalSha256: '0'.repeat(64),
          }),
        }),
        'ACTION002_SEALED_EVIDENCE_MISMATCH',
      ],
    ] as const) {
      const fixture = makeFixture();
      expect(() =>
        preflight.validateAction003ApprovalPreflightForTest(
          fixture.descriptorPath,
          runtime
        )
      ).toThrow(code);
    }
  });

  test('rejects changed official pricing bytes and ambient credentials', () => {
    const pricingFixture = makeFixture();
    fs.appendFileSync(pricingFixture.pricingRawPaths[0], 'drift', 'utf8');
    expect(() =>
      preflight.validateAction003ApprovalPreflightForTest(
        pricingFixture.descriptorPath,
        makeRuntime()
      )
    ).toThrow('PRICING_SOURCE_ARTIFACT_HASH_MISMATCH');

    const ambientFixture = makeFixture();
    process.env.SUPABASE_ACCESS_TOKEN = 'not-read-by-preflight';
    expect(() =>
      preflight.validateAction003ApprovalPreflightForTest(
        ambientFixture.descriptorPath,
        makeRuntime()
      )
    ).toThrow('AMBIENT_CREDENTIAL_FORBIDDEN');

    delete process.env.SUPABASE_ACCESS_TOKEN;
    for (const forbiddenName of [
      'DIRECT_URL',
      'PGPASSFILE',
      'NODE_OPTIONS',
      'HTTPS_PROXY',
    ]) {
      const fixture = makeFixture();
      process.env[forbiddenName] = 'not-read-by-preflight';
      expect(() =>
        preflight.validateAction003ApprovalPreflightForTest(
          fixture.descriptorPath,
          makeRuntime()
        )
      ).toThrow('AMBIENT_CREDENTIAL_FORBIDDEN');
      delete process.env[forbiddenName];
    }
  });

  test('rejects pricing evidence after its exact 24-hour reuse window', () => {
    const fixture = makeFixture();
    const pricingPath = String(fixture.descriptor.pricingEvidencePath);
    const pricingValue: unknown = JSON.parse(
      fs.readFileSync(pricingPath, 'utf8')
    );
    if (!isJsonObject(pricingValue)) throw new Error('PRICING_NOT_OBJECT');
    const sources = pricingValue.officialSources;
    if (!Array.isArray(sources)) throw new Error('PRICING_SOURCES_INVALID');
    for (const source of sources) {
      if (!isJsonObject(source)) throw new Error('PRICING_SOURCE_INVALID');
      source.retrievedAt = '2026-07-25T23:59:59.999Z';
    }
    writeCanonicalJson(pricingPath, pricingValue);

    expect(() =>
      preflight.validateAction003ApprovalPreflightForTest(
        fixture.descriptorPath,
        makeRuntime()
      )
    ).toThrow('PRICING_EVIDENCE_STALE');
  });

  test('applies the explicit main and four-path output ACL count policies', () => {
    expect(() =>
      preflight.requireAclBoundaryPathCount(['a', 'b', 'c', 'd'])
    ).toThrow('ACL_BOUNDARY_SET_INCOMPLETE');
    expect(preflight.requireAclBoundaryPathCount(['a', 'b', 'c', 'd'], 4)).toBe(
      4
    );
    expect(() =>
      preflight.requireAclBoundaryPathCount(['a', 'b', 'c'], 4)
    ).toThrow('ACL_BOUNDARY_SET_INCOMPLETE');
    expect(
      preflight.requireAclBoundaryPathCount(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
        10
      )
    ).toBe(10);
  });

  win('captures a content-bound ACL proof through the Windows runtime', () => {
    const cleanupRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-acl-proof-')
    );
    cleanupDirectories.push(cleanupRoot);
    const root = path.join(
      cleanupRoot,
      'owner path;Write-Output PR12_PATH_INJECTION_CANARY'
    );
    fs.mkdirSync(root);
    const filename = path.join(root, 'bound-input.json');
    writeCanonicalJson(filename, { safe: true });
    const credentialConfiguration = {
      runtime: { powershellExecutablePath: findPowerShellExecutable() },
    };
    const protectedProof = preflight.protectWindowsOutputAcl(
      credentialConfiguration,
      [root, filename],
      2
    );
    const proof = preflight.assertWindowsAclBoundaries(
      credentialConfiguration,
      [root, filename],
      2
    );

    expect(proof).toEqual(protectedProof);
    expect(proof).toMatchObject({
      pathCount: 2,
      aclProofSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    const entries = proof.normalizedAclEntries;
    if (!Array.isArray(entries)) throw new Error('ACL_PROOF_ENTRIES_INVALID');
    expect(entries).toHaveLength(2);
  });

  test('rejects duplicate official pricing artifacts and external tree overlap', () => {
    const pricingFixture = makeFixture();
    const pricingPath = String(pricingFixture.descriptor.pricingEvidencePath);
    const pricingValue: unknown = JSON.parse(
      fs.readFileSync(pricingPath, 'utf8')
    );
    if (!isJsonObject(pricingValue)) throw new Error('PRICING_NOT_OBJECT');
    const sources = pricingValue.officialSources;
    if (!Array.isArray(sources) || sources.length !== 3) {
      throw new Error('PRICING_SOURCES_INVALID');
    }
    const first = requireJsonObject(sources[0], 'PRICING_SOURCE_0');
    const second = requireJsonObject(sources[1], 'PRICING_SOURCE_1');
    second.artifactPath = first.artifactPath;
    second.artifactSha256 = first.artifactSha256;
    writeCanonicalJson(pricingPath, pricingValue);
    expect(() =>
      preflight.validateAction003ApprovalPreflightForTest(
        pricingFixture.descriptorPath,
        makeRuntime()
      )
    ).toThrow('PRICING_SOURCE_ARTIFACT_IDENTITY_DUPLICATE');

    const overlapFixture = makeFixture();
    overlapFixture.descriptor.organizationIdentityEvidenceDirectoryPath =
      overlapFixture.ownerPrivateApprovalRoot;
    writeCanonicalJson(
      overlapFixture.descriptorPath,
      overlapFixture.descriptor
    );
    expect(() =>
      preflight.validateAction003ApprovalPreflightForTest(
        overlapFixture.descriptorPath,
        makeRuntime()
      )
    ).toThrow('EXTERNAL_DIRECTORY_BOUNDARY_COLLISION');
  });

  test('rejects stale and non-monotonic operational clocks under the Jest seam', () => {
    for (const [runtime, code] of [
      [
        makeRuntime({
          now: () => Date.parse('2026-07-27T01:00:00.000Z'),
        }),
        'APPROVAL_EXPIRED',
      ],
      [
        makeRuntime({
          monotonicNow: (() => {
            let callCount = 0;
            return () => (callCount++ === 0 ? 2_000 : 1_000);
          })(),
        }),
        'MONOTONIC_CLOCK_INVALID',
      ],
    ] as const) {
      const fixture = makeFixture();
      expect(() =>
        preflight.validateAction003ApprovalPreflightForTest(
          fixture.descriptorPath,
          runtime
        )
      ).toThrow(code);
    }
  });

  test('rejects an ACL boundary failure before packet creation', () => {
    const fixture = makeFixture();
    expect(() =>
      preflight.validateAction003ApprovalPreflightForTest(
        fixture.descriptorPath,
        makeRuntime({
          assertAclBoundaries: () => {
            throw new Error('ACL_BOUNDARY_INVALID');
          },
        })
      )
    ).toThrow('ACL_BOUNDARY_INVALID');
    expect(fs.existsSync(fixture.outputDirectory)).toBe(false);
  });

  test('does not expose a writable output seam to test runtime overrides', () => {
    const fixture = makeFixture();
    const result = preflight.validateAction003ApprovalPreflightForTest(
      fixture.descriptorPath,
      makeRuntime()
    );
    expect(result.status).toBe('VALIDATED_NOT_WRITTEN');
    expect(fs.existsSync(fixture.outputDirectory)).toBe(false);
  });

  test('contains no network, credential retrieval, or shell execution path', () => {
    const source = fs.readFileSync(preflightPath, 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain('retrieveClaimBoundCredentials');
    expect(source).not.toContain('buildCredentialBrokerRequest');
    expect(source).not.toContain('--execute-authorized-action');
    expect(source).not.toContain('performProvisioningRequest');
    expect(source).not.toContain('shell: true');
    expect(source).toContain('shell: false');
    expect(source).not.toContain("'-Command'");
    expect(source).toContain("'-File'");
    expect(source).toContain('pr12-windows-owner-private-acl.ps1');
    expect(source).toContain('includeDatabasePassword: true');
    expect(source).toContain('assertWindowsAclBoundaries');
    expect(source).toContain('protectWindowsOutputAcl');
    expect(source).toContain('ACL_BOUNDARY_INVALID');
    expect(source).toContain('aclProofSha256');
    expect(source).toContain('normalizedAclEntries');
    expect(source).not.toContain('return { pathCount: pathnames.length };');
    expect(source).toContain('initializeAction003ApprovalOutputCreateNew');
    expect(source).toContain('completeAction003ApprovalOutputCreateNew');
    expect(source).toContain('verifyAction003ApprovalOutput');
    expect(source).toContain('requireNoReparsePathComponents');
    const prevalidateIndex = source.indexOf(
      'const prevalidatedArtifacts = runtime.buildArtifacts(builderInput)'
    );
    const initializeIndex = source.indexOf(
      'const initialized = runtime.initializeOutput('
    );
    expect(prevalidateIndex).toBeGreaterThan(0);
    expect(initializeIndex).toBeGreaterThan(prevalidateIndex);
    expect(source).not.toContain(
      'export function prepareAction003ApprovalPacketWithRuntime'
    );
    expect(source).toContain("status: 'VALIDATED_NOT_WRITTEN'");
  });
});
