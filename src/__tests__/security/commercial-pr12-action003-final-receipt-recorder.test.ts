/** @jest-environment node */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null;

interface RecorderModule {
  parseAction003FinalReceiptRecorderArguments(argv: string[]): JsonObject;
  recordAction003FinalApprovalReceiptForTest(
    input: JsonObject,
    runtime: Record<string, unknown>
  ): JsonObject;
  recordAction003InitialApprovalReceiptForTest(
    input: JsonObject,
    runtime: Record<string, unknown>
  ): JsonObject;
  recordAction003InitialApprovalReceipt(input: JsonObject): JsonObject;
}

interface RuntimeOverrides {
  [key: string]: unknown;
  now: () => number;
  inspectRepositoryState: (boundHead: string) => JsonObject;
  ambientCredentialNames: () => string[];
  inspectAclSet: (paths: JsonObject) => JsonObject[];
  inspectInitialAclSet: (paths: JsonObject) => JsonObject[];
  revalidateApprovalPacket: (descriptorPath: string) => JsonObject;
  validateCandidate: (
    binding: JsonObject,
    credentialConfiguration: JsonObject,
    context: JsonObject
  ) => JsonObject;
  validateApproval: (
    binding: JsonObject,
    credentialConfiguration: JsonObject,
    context: JsonObject
  ) => JsonObject;
  recordReceipt: (input: JsonObject) => JsonObject;
  verifyReceipt: (input: JsonObject) => JsonObject;
  recordInitialReceipt: (input: JsonObject) => JsonObject;
  verifyInitialReceipt: (input: JsonObject) => JsonObject;
}

interface Fixture {
  outerRoot: string;
  input: JsonObject;
  initialReceiptPath: string;
  initialReceipt: JsonObject;
  finalReceiptPath: string;
  finalReceipt: JsonObject;
  repositoryState: JsonObject;
}

const repositoryRoot = path.resolve(__dirname, '../../..');
const recorderPath = path.join(
  repositoryRoot,
  'scripts/commercial-hardening/record-pr12-action003-final-approval-receipt.mjs'
);
const ownerPrivateAclHelperPath = path.join(
  repositoryRoot,
  'scripts/commercial-hardening/pr12-windows-owner-private-acl.ps1'
);
const cleanupDirectories: string[] = [];
const approvedBaseCommit = '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab';
let subject: RecorderModule;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function canonicalFileSha256(value: JsonValue): string {
  return createHash('sha256')
    .update(`${canonicalJson(value)}\n`, 'utf8')
    .digest('hex');
}

function writeCanonicalJson(filename: string, value: JsonObject): void {
  fs.writeFileSync(filename, `${canonicalJson(value)}\n`, 'utf8');
}

function protectOwnerPrivatePath(
  targetPath: string,
  kind: 'DIRECTORY' | 'FILE'
): void {
  const powershellPath = [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  ].find(candidate => fs.existsSync(candidate));
  if (powershellPath === undefined) {
    throw new Error('POWERSHELL_REQUIRED');
  }
  const result = spawnSync(
    powershellPath,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      ownerPrivateAclHelperPath,
      '-Mode',
      'PROTECT_AND_CAPTURE',
      '-Kind',
      kind,
      '-LiteralPath',
      targetPath,
    ],
    {
      encoding: 'utf8',
      env: {
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
        ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      windowsHide: true,
    }
  );
  if (
    result.error !== undefined ||
    result.signal !== null ||
    result.status !== 0 ||
    result.stderr.length !== 0
  ) {
    throw new Error('OWNER_PRIVATE_ACL_PROTECTION_FAILED');
  }
}

function initialReceipt(): JsonObject {
  return {
    schemaVersion: 1,
    recordType: 'PR12_SOURCE_PROJECT_PROVISIONING_INITIAL_APPROVAL_RECEIPT',
    decision: 'APPROVED',
    attestationStatus: 'VERIFIED',
    attestationMethod: 'SOLE_OPERATOR_EXPLICIT_INITIAL_APPROVAL',
    actionId: 'PR12-ACTION-003',
    approvedByPrincipalId: 'owner:futoshi-iwasawa',
    approvedByDisplayName: 'FUTOSHI IWASAWA',
    acceptedAt: '2026-07-27T00:00:00.000Z',
    approvalPurpose: 'ACTION003_PACKET_PREPARATION_ONLY',
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
    sourceProjectProvisioningAuthorized: false,
    productionContactAuthorized: false,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    notes:
      'Owner supplied initial authorization for local ACTION-003 packet preparation only.',
  };
}

function makeFixture(): Fixture {
  const outerRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pr12-final-receipt-recorder-')
  );
  cleanupDirectories.push(outerRoot);
  const ownerPrivateRoot = path.join(outerRoot, 'owner-private');
  const candidateDirectory = path.join(ownerPrivateRoot, 'candidate');
  const pricingDirectory = path.join(outerRoot, 'pricing');
  fs.mkdirSync(ownerPrivateRoot);
  fs.mkdirSync(candidateDirectory);
  fs.mkdirSync(pricingDirectory);

  const boundHead = 'f'.repeat(40);
  const bindingMaterialSha256 = 'b'.repeat(64);
  const payloadSha256 = 'c'.repeat(64);
  const credentialConfiguration: JsonObject = {
    schemaVersion: 2,
    resultType: 'SOURCE_PROJECT_PROVISIONING_CREDENTIAL_CONFIGURATION',
    status: 'APPROVED',
    metadataOnly: true,
  };
  const ownerApproval: JsonObject = {
    schemaVersion: 4,
    recordType: 'PR12_SOURCE_PROJECT_PROVISIONING_OWNER_APPROVAL',
    decision: 'PENDING_FINAL_APPROVAL',
  };
  const rawPricingSourcePath = path.join(
    pricingDirectory,
    'official-source.html'
  );
  fs.writeFileSync(rawPricingSourcePath, 'official pricing source\n', 'utf8');
  const rawPricingSourceSha256 = createHash('sha256')
    .update(fs.readFileSync(rawPricingSourcePath))
    .digest('hex');
  const pricingEvidence: JsonObject = {
    schemaVersion: 2,
    recordType: 'PR12_SOURCE_PROJECT_OFFICIAL_PRICING_EVIDENCE',
    status: 'CAPTURED',
    officialSources: [
      {
        artifactPath: path.basename(rawPricingSourcePath),
        artifactSha256: rawPricingSourceSha256,
      },
    ],
  };
  const pricingEvidencePath = path.join(
    pricingDirectory,
    'source-project-official-pricing-evidence-v2.json'
  );
  writeCanonicalJson(pricingEvidencePath, pricingEvidence);
  const credentialConfigurationSha256 = canonicalFileSha256(
    credentialConfiguration
  );
  const pricingEvidenceSha256 = canonicalFileSha256(pricingEvidence);
  const ownerApprovalSha256 = canonicalFileSha256(ownerApproval);
  const binding: JsonObject = {
    target: { gitCommit: boundHead },
    provisioningAction: {
      scheduledExecutionAt: '2026-07-27T00:15:00.000Z',
    },
    approval: {
      expiresAt: '2026-07-27T00:30:00.000Z',
    },
    duplicateAndFailurePolicy: {
      actionJournalDirectoryPathSha256: '1'.repeat(64),
      actionJournalDirectoryFingerprint: {
        pathSha256: '1'.repeat(64),
      },
    },
    evidenceContract: {
      evidenceParentDirectoryPathSha256: '2'.repeat(64),
      evidenceParentDirectoryFingerprint: {
        pathSha256: '2'.repeat(64),
      },
    },
    organizationIdentityEvidence: {
      status: 'PASS',
    },
  };
  const bindingPath = path.join(
    candidateDirectory,
    'source-project-provisioning-binding-v5.json'
  );
  const credentialConfigurationPath = path.join(
    candidateDirectory,
    'source-project-provisioning-credential-configuration-v2.json'
  );
  const ownerApprovalPath = path.join(
    candidateDirectory,
    'source-project-provisioning-owner-approval-v4.json'
  );
  writeCanonicalJson(bindingPath, binding);
  writeCanonicalJson(credentialConfigurationPath, credentialConfiguration);
  writeCanonicalJson(ownerApprovalPath, ownerApproval);
  const preflightDescriptorPath = path.join(
    ownerPrivateRoot,
    'source-project-provisioning-action003-preflight-descriptor-v1.json'
  );
  writeCanonicalJson(preflightDescriptorPath, {
    schemaVersion: 1,
    operation: 'PREPARE_PR12_ACTION003_APPROVAL_PACKET_LOCAL_ONLY',
    outputDirectoryPath: candidateDirectory,
  });

  const initial = initialReceipt();
  const initialReceiptDirectory = path.join(
    ownerPrivateRoot,
    'source-project-provisioning-initial-approval-receipt-v1'
  );
  fs.mkdirSync(initialReceiptDirectory);
  const initialReceiptPath = path.join(
    initialReceiptDirectory,
    'source-project-provisioning-initial-approval-receipt-v1.json'
  );
  writeCanonicalJson(initialReceiptPath, initial);
  const finalReceipt: JsonObject = {
    schemaVersion: 1,
    recordType: 'PR12_SOURCE_PROJECT_PROVISIONING_FINAL_APPROVAL_RECEIPT',
    decision: 'APPROVED',
    attestationStatus: 'VERIFIED',
    attestationMethod: 'SOLE_OPERATOR_EXPLICIT_FINAL_HASH_RECONFIRMATION',
    actionId: 'PR12-ACTION-003',
    approvedByPrincipalId: 'owner:futoshi-iwasawa',
    approvedByDisplayName: 'FUTOSHI IWASAWA',
    acceptedAt: '2026-07-27T00:05:00.000Z',
    expiresAt: '2026-07-27T00:30:00.000Z',
    initialApprovalReceiptSha256: canonicalFileSha256(initial),
    bindingSha256: canonicalFileSha256(binding),
    bindingMaterialSha256,
    payloadSha256,
    credentialConfigurationSha256,
    pricingEvidenceSha256,
    ownerApprovalSha256,
    soleOperatorRiskAccepted: true,
    sameUserDpapiCredentialExposureRiskAccepted: true,
    providerSpendCapLimitationAcknowledged: true,
    sameOrganizationExceptionRiskAccepted: true,
    organizationListProductionRefObservationAccepted: true,
    sharedOrganizationIamBillingControlPlaneRiskAccepted: true,
    productionDirectContactProhibitionAcknowledged: true,
    unknownChargesAcknowledged: true,
    sourceProjectProvisioningAuthorized: true,
    productionContactAuthorized: false,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    notes:
      'Owner supplied final authorization for only the exact frozen ACTION-003 candidate tuple.',
  };
  const finalReceiptPath = path.join(
    ownerPrivateRoot,
    'source-project-provisioning-final-approval-receipt-v1.json'
  );
  writeCanonicalJson(finalReceiptPath, finalReceipt);
  const implementationHashes: JsonObject = {
    governanceSha256: '3'.repeat(64),
    contractSha256: '4'.repeat(64),
    wrapperSha256: '5'.repeat(64),
    organizationIdentityContractSha256: '6'.repeat(64),
    organizationIdentityVerifierSha256: '7'.repeat(64),
  };
  const repositoryState: JsonObject = {
    currentHead: boundHead,
    currentBaseCommit: approvedBaseCommit,
    worktreeClean: true,
    organizationIdentitySourceGitCommitIsAncestor: true,
    implementationHashes,
    trackedSnapshots: {},
  };
  return {
    outerRoot,
    input: {
      ownerPrivateRoot,
      candidateDirectory,
      preflightDescriptorPath,
      initialApprovalReceiptPath: initialReceiptPath,
      pricingEvidencePath,
      populatedFinalApprovalReceiptPath: finalReceiptPath,
    },
    initialReceiptPath,
    initialReceipt: initial,
    finalReceiptPath,
    finalReceipt,
    repositoryState,
  };
}

function makeRuntime(
  fixture: Fixture,
  overrides: Partial<RuntimeOverrides> = {}
): RuntimeOverrides {
  const receiptSha256 = canonicalFileSha256(fixture.finalReceipt);
  const initialReceiptSha256 = canonicalFileSha256(fixture.initialReceipt);
  return {
    now: () => Date.parse('2026-07-27T00:05:01.000Z'),
    inspectRepositoryState: () =>
      JSON.parse(JSON.stringify(fixture.repositoryState)),
    ambientCredentialNames: () => [],
    inspectAclSet: () => [{ stable: true }],
    inspectInitialAclSet: () => [{ stable: true }],
    revalidateApprovalPacket: descriptorPath => ({
      status: 'REVALIDATED',
      descriptorSha256: createHash('sha256')
        .update(fs.readFileSync(descriptorPath))
        .digest('hex'),
      bindingSha256: 'd'.repeat(64),
      remoteContactPerformed: false,
      credentialPlaintextReadPerformed: false,
    }),
    validateCandidate: () => ({
      bindingMaterialSha256: 'b'.repeat(64),
      payloadSha256: 'c'.repeat(64),
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    }),
    validateApproval: (
      _binding: JsonObject,
      _credentialConfiguration: JsonObject,
      context: JsonObject
    ) => ({
      sourceProjectProvisioningAuthorized: true,
      finalApprovalReceiptSha256: context.finalApprovalReceiptSha256,
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    }),
    recordReceipt: () => ({
      status: 'RECORDED',
      fileCount: 1,
      receiptSha256,
      acceptedAt: fixture.finalReceipt.acceptedAt,
      ownerPrivateRootIdentity: { stable: true },
      ownerPrivateRootAcl: { stable: true },
      fileIdentity: { contentSha256: receiptSha256 },
      fileAcl: { stable: true },
      directoryIdentity: { stable: true },
      directoryAcl: { stable: true },
      ownerPrivateRootIdentity: { stable: true },
      ownerPrivateRootAcl: { stable: true },
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    }),
    verifyReceipt: () => ({
      status: 'VERIFIED_STABLE',
      receiptSha256,
      receiptPathSha256: '8'.repeat(64),
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    }),
    recordInitialReceipt: () => ({
      status: 'RECORDED',
      fileCount: 1,
      receiptSha256: initialReceiptSha256,
      acceptedAt: fixture.initialReceipt.acceptedAt,
      ownerPrivateRootIdentity: { stable: true },
      ownerPrivateRootAcl: { stable: true },
      fileIdentity: { contentSha256: initialReceiptSha256 },
      fileAcl: { stable: true },
      directoryIdentity: { stable: true },
      directoryAcl: { stable: true },
      ownerPrivateRootIdentity: { stable: true },
      ownerPrivateRootAcl: { stable: true },
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    }),
    verifyInitialReceipt: () => ({
      status: 'VERIFIED_STABLE',
      receiptSha256: initialReceiptSha256,
      receiptPathSha256: '9'.repeat(64),
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    }),
    ...overrides,
  };
}

function expectCode(callback: () => unknown, code: string): void {
  expect(callback).toThrow(code);
}

beforeAll(async () => {
  subject = (await import(recorderPath)) as RecorderModule;
});

afterEach(() => {
  for (const directory of cleanupDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('PR12 ACTION-003 operational final approval receipt recorder', () => {
  test('records an initial receipt through the real Windows ACL and CreateNew runtime', () => {
    if (process.platform !== 'win32') return;
    const localAppData = process.env.LOCALAPPDATA;
    if (typeof localAppData !== 'string') {
      throw new Error('WINDOWS_LOCALAPPDATA_REQUIRED');
    }
    const ownerPrivateRoot = fs.mkdtempSync(
      path.join(localAppData, 'pr12-action003-recorder-default-')
    );
    cleanupDirectories.push(ownerPrivateRoot);
    const populatedInitialApprovalReceiptPath = path.join(
      ownerPrivateRoot,
      'source-project-provisioning-initial-approval-receipt-v1.json'
    );
    const receipt = initialReceipt();
    receipt.acceptedAt = new Date(Date.now() - 1_000).toISOString();
    writeCanonicalJson(populatedInitialApprovalReceiptPath, receipt);
    protectOwnerPrivatePath(ownerPrivateRoot, 'DIRECTORY');
    protectOwnerPrivatePath(populatedInitialApprovalReceiptPath, 'FILE');

    const result = subject.recordAction003InitialApprovalReceipt({
      ownerPrivateRoot,
      populatedInitialApprovalReceiptPath,
    });

    expect(result).toMatchObject({
      status: 'RECORDED_AND_VERIFIED',
      operation: 'RECORD_PR12_ACTION003_INITIAL_APPROVAL_RECEIPT_LOCAL_ONLY',
      initialApprovalReceiptSha256: canonicalFileSha256(receipt),
      action003PacketPreparationAuthorized: true,
      databasePasswordBootstrapAuthorized: false,
      sourceProjectProvisioningAuthorized: false,
      remoteContactPerformed: false,
      credentialPlaintextReadPerformed: false,
    });
    expect(
      fs.readdirSync(
        path.join(
          ownerPrivateRoot,
          'source-project-provisioning-initial-approval-receipt-v1'
        )
      )
    ).toEqual(['source-project-provisioning-initial-approval-receipt-v1.json']);
  });

  test('exposes a separate local-only initial receipt recording mode', () => {
    expect(typeof subject.recordAction003InitialApprovalReceiptForTest).toBe(
      'function'
    );
    expect(
      subject.parseAction003FinalReceiptRecorderArguments([
        '--record-initial',
        '--owner-private-root',
        'C:\\owner',
        '--populated-initial-approval-receipt',
        'C:\\owner\\source-project-provisioning-initial-approval-receipt-v1.json',
      ])
    ).toMatchObject({
      help: false,
      mode: 'INITIAL',
    });

    const fixture = makeFixture();
    const recordedInitialDirectory = path.dirname(fixture.initialReceiptPath);
    const populatedInitialReceiptPath = path.join(
      String(fixture.input.ownerPrivateRoot),
      'source-project-provisioning-initial-approval-receipt-v1.json'
    );
    fs.rmSync(recordedInitialDirectory, { recursive: true });
    writeCanonicalJson(populatedInitialReceiptPath, fixture.initialReceipt);
    const recordInitialReceipt = jest.fn(
      makeRuntime(fixture).recordInitialReceipt
    );
    const result = subject.recordAction003InitialApprovalReceiptForTest(
      {
        ownerPrivateRoot: fixture.input.ownerPrivateRoot,
        populatedInitialApprovalReceiptPath: populatedInitialReceiptPath,
      },
      makeRuntime(fixture, { recordInitialReceipt })
    );

    expect(result).toMatchObject({
      status: 'RECORDED_AND_VERIFIED',
      operation: 'RECORD_PR12_ACTION003_INITIAL_APPROVAL_RECEIPT_LOCAL_ONLY',
      actionId: 'PR12-ACTION-003',
      initialApprovalReceiptSha256: canonicalFileSha256(fixture.initialReceipt),
      initialApprovalAcceptedAt: '2026-07-27T00:00:00.000Z',
      action003PacketPreparationAuthorized: true,
      databasePasswordBootstrapAuthorized: false,
      sourceProjectProvisioningAuthorized: false,
      productionContactAuthorized: false,
      phase2AndLaterAuthorized: false,
      cleanupDeletionAuthorized: false,
      remoteContactPerformed: false,
      credentialPlaintextReadPerformed: false,
    });
    expect(recordInitialReceipt).toHaveBeenCalledTimes(1);
    const recordInput = recordInitialReceipt.mock.calls[0][0] as JsonObject;
    expect(recordInput.receipt).toEqual(fixture.initialReceipt);
  });

  test('derives the complete final tuple from stable files and records only through CreateNew receipt APIs', () => {
    const fixture = makeFixture();
    const recordReceipt = jest.fn(makeRuntime(fixture).recordReceipt);
    const validateCandidate = jest.fn(makeRuntime(fixture).validateCandidate);
    const validateApproval = jest.fn(makeRuntime(fixture).validateApproval);
    const result = subject.recordAction003FinalApprovalReceiptForTest(
      fixture.input,
      makeRuntime(fixture, {
        recordReceipt,
        validateCandidate,
        validateApproval,
      })
    );

    expect(result).toMatchObject({
      status: 'RECORDED_AND_VERIFIED',
      operation: 'RECORD_PR12_ACTION003_FINAL_APPROVAL_RECEIPT_LOCAL_ONLY',
      actionId: 'PR12-ACTION-003',
      gitHead: 'f'.repeat(40),
      bindingMaterialSha256: 'b'.repeat(64),
      payloadSha256: 'c'.repeat(64),
      finalApprovalReceiptSha256: canonicalFileSha256(fixture.finalReceipt),
      finalApprovalAcceptedAt: '2026-07-27T00:05:00.000Z',
      scheduledExecutionAt: '2026-07-27T00:15:00.000Z',
      expiresAt: '2026-07-27T00:30:00.000Z',
      sourceProjectProvisioningAuthorized: true,
      productionContactAuthorized: false,
      phase2AndLaterAuthorized: false,
      cleanupDeletionAuthorized: false,
      remoteContactPerformed: false,
      credentialPlaintextReadPerformed: false,
    });
    expect(validateCandidate).toHaveBeenCalledTimes(2);
    expect(validateApproval).toHaveBeenCalledTimes(2);
    expect(recordReceipt).toHaveBeenCalledTimes(1);
    const recordInput = recordReceipt.mock.calls[0][0] as JsonObject;
    expect(recordInput.receipt).toEqual(fixture.finalReceipt);
    expect(recordInput.expected).toMatchObject({
      bindingSha256: canonicalFileSha256(
        JSON.parse(
          fs.readFileSync(
            path.join(
              String(fixture.input.candidateDirectory),
              'source-project-provisioning-binding-v5.json'
            ),
            'utf8'
          )
        )
      ),
      bindingMaterialSha256: 'b'.repeat(64),
      payloadSha256: 'c'.repeat(64),
    });
  });

  test('rejects any candidate or receipt mutation before CreateNew and never calls the writer', () => {
    const fixture = makeFixture();
    const recordReceipt = jest.fn();
    let validationCount = 0;
    const validateApproval = (
      _binding: JsonObject,
      _credentialConfiguration: JsonObject,
      context: JsonObject
    ): JsonObject => {
      validationCount += 1;
      if (validationCount === 1) {
        const changedReceipt = {
          ...fixture.finalReceipt,
          notes:
            'Changed after validation but before the CreateNew receipt write.',
        };
        writeCanonicalJson(fixture.finalReceiptPath, changedReceipt);
      }
      return {
        sourceProjectProvisioningAuthorized: true,
        finalApprovalReceiptSha256: context.finalApprovalReceiptSha256,
        remoteContactPerformed: false,
        credentialReadPerformed: false,
      };
    };

    expectCode(
      () =>
        subject.recordAction003FinalApprovalReceiptForTest(
          fixture.input,
          makeRuntime(fixture, {
            validateApproval,
            recordReceipt,
          })
        ),
      'APPROVAL_INPUT_IDENTITY_OR_CONTENT_CHANGED'
    );
    expect(recordReceipt).not.toHaveBeenCalled();
  });

  test('rejects a fourth candidate entry before validating approval', () => {
    const fixture = makeFixture();
    fs.writeFileSync(
      path.join(String(fixture.input.candidateDirectory), 'unbound.json'),
      '{}\n',
      'utf8'
    );
    const validateCandidate = jest.fn();

    expectCode(
      () =>
        subject.recordAction003FinalApprovalReceiptForTest(
          fixture.input,
          makeRuntime(fixture, { validateCandidate })
        ),
      'CANDIDATE_FILE_SET_INVALID'
    );
    expect(validateCandidate).not.toHaveBeenCalled();
  });

  test('rejects an initial receipt copied outside its canonical one-file directory', () => {
    const fixture = makeFixture();
    const alternateDirectory = path.join(
      String(fixture.input.ownerPrivateRoot),
      'alternate-initial-receipt'
    );
    fs.renameSync(path.dirname(fixture.initialReceiptPath), alternateDirectory);
    const validateCandidate = jest.fn();

    expectCode(
      () =>
        subject.recordAction003FinalApprovalReceiptForTest(
          {
            ...fixture.input,
            initialApprovalReceiptPath: path.join(
              alternateDirectory,
              'source-project-provisioning-initial-approval-receipt-v1.json'
            ),
          },
          makeRuntime(fixture, { validateCandidate })
        ),
      'RECORDER_PATH_TOPOLOGY_INVALID'
    );
    expect(validateCandidate).not.toHaveBeenCalled();
  });

  test('rejects a preflight descriptor that points at a different candidate', () => {
    const fixture = makeFixture();
    const descriptorPath = String(fixture.input.preflightDescriptorPath);
    writeCanonicalJson(descriptorPath, {
      schemaVersion: 1,
      operation: 'PREPARE_PR12_ACTION003_APPROVAL_PACKET_LOCAL_ONLY',
      outputDirectoryPath: path.join(
        String(fixture.input.ownerPrivateRoot),
        'different-candidate'
      ),
    });
    const revalidateApprovalPacket = jest.fn();

    expectCode(
      () =>
        subject.recordAction003FinalApprovalReceiptForTest(
          fixture.input,
          makeRuntime(fixture, { revalidateApprovalPacket })
        ),
      'PREFLIGHT_DESCRIPTOR_CANDIDATE_MISMATCH'
    );
    expect(revalidateApprovalPacket).not.toHaveBeenCalled();
  });

  test('rejects external-state proof drift before the final receipt CreateNew', () => {
    const fixture = makeFixture();
    const recordReceipt = jest.fn();
    let validationCount = 0;
    const revalidateApprovalPacket = (): JsonObject => {
      validationCount += 1;
      return {
        status: 'REVALIDATED',
        descriptorSha256: String(validationCount).padStart(64, '0'),
        remoteContactPerformed: false,
        credentialPlaintextReadPerformed: false,
      };
    };

    expectCode(
      () =>
        subject.recordAction003FinalApprovalReceiptForTest(
          fixture.input,
          makeRuntime(fixture, {
            recordReceipt,
            revalidateApprovalPacket,
          })
        ),
      'ACTION003_EXTERNAL_STATE_CHANGED'
    );
    expect(recordReceipt).not.toHaveBeenCalled();
  });

  test('rejects pricing source byte drift before candidate validation', () => {
    const fixture = makeFixture();
    const pricingEvidencePath = String(fixture.input.pricingEvidencePath);
    fs.appendFileSync(
      path.join(path.dirname(pricingEvidencePath), 'official-source.html'),
      'changed\n',
      'utf8'
    );
    const validateCandidate = jest.fn();

    expectCode(
      () =>
        subject.recordAction003FinalApprovalReceiptForTest(
          fixture.input,
          makeRuntime(fixture, { validateCandidate })
        ),
      'PRICING_SOURCE_HASH_MISMATCH'
    );
    expect(validateCandidate).not.toHaveBeenCalled();
  });

  test('rejects current HEAD drift instead of accepting a CLI-supplied replacement HEAD', () => {
    const fixture = makeFixture();
    const wrongRepositoryState = {
      ...fixture.repositoryState,
      currentHead: 'e'.repeat(40),
    };

    expectCode(
      () =>
        subject.recordAction003FinalApprovalReceiptForTest(
          fixture.input,
          makeRuntime(fixture, {
            inspectRepositoryState: () => wrongRepositoryState,
          })
        ),
      'REPOSITORY_STATE_INVALID'
    );
  });

  test('rejects a non-canonical owner-supplied final receipt', () => {
    const fixture = makeFixture();
    fs.writeFileSync(
      fixture.finalReceiptPath,
      `${JSON.stringify(fixture.finalReceipt, null, 2)}\n`,
      'utf8'
    );

    expectCode(
      () =>
        subject.recordAction003FinalApprovalReceiptForTest(
          fixture.input,
          makeRuntime(fixture)
        ),
      'FINAL_APPROVAL_RECEIPT_NOT_CANONICAL'
    );
  });

  test('rejects initial receipt drift before its CreateNew write', () => {
    const fixture = makeFixture();
    const recordedInitialDirectory = path.dirname(fixture.initialReceiptPath);
    const populatedInitialReceiptPath = path.join(
      String(fixture.input.ownerPrivateRoot),
      'source-project-provisioning-initial-approval-receipt-v1.json'
    );
    fs.rmSync(recordedInitialDirectory, { recursive: true });
    writeCanonicalJson(populatedInitialReceiptPath, fixture.initialReceipt);
    const recordInitialReceipt = jest.fn();
    let aclInspectionCount = 0;
    const inspectInitialAclSet = (): JsonObject[] => {
      aclInspectionCount += 1;
      if (aclInspectionCount === 1) {
        writeCanonicalJson(populatedInitialReceiptPath, {
          ...fixture.initialReceipt,
          notes:
            'Changed after initial validation but before CreateNew recording.',
        });
      }
      return [{ stable: true }];
    };

    expectCode(
      () =>
        subject.recordAction003InitialApprovalReceiptForTest(
          {
            ownerPrivateRoot: fixture.input.ownerPrivateRoot,
            populatedInitialApprovalReceiptPath: populatedInitialReceiptPath,
          },
          makeRuntime(fixture, {
            inspectInitialAclSet,
            recordInitialReceipt,
          })
        ),
      'INITIAL_APPROVAL_RECEIPT_IDENTITY_OR_CONTENT_CHANGED'
    );
    expect(recordInitialReceipt).not.toHaveBeenCalled();
  });

  test('does not accept authoritative hash, HEAD, timestamp, risk, or authorization flags', () => {
    expectCode(
      () =>
        subject.parseAction003FinalReceiptRecorderArguments([
          '--git-head',
          'f'.repeat(40),
          '--binding-sha256',
          'a'.repeat(64),
        ]),
      'USAGE_INVALID'
    );
    expectCode(
      () =>
        subject.parseAction003FinalReceiptRecorderArguments([
          '--owner-private-root',
          'C:\\owner',
          '--candidate-directory',
          'C:\\candidate',
          '--initial-approval-receipt',
          'C:\\initial.json',
          '--pricing-evidence',
          'C:\\pricing.json',
          '--pricing-evidence',
          'C:\\different-pricing.json',
        ]),
      'USAGE_INVALID'
    );
  });

  test('contains no provider transport, credential envelope read, decrypt, or approval synthesis implementation', () => {
    const source = fs.readFileSync(recorderPath, 'utf8');

    expect(source).not.toContain('https://api.supabase.com');
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain('readCredential');
    expect(source).not.toContain('Unprotect');
    expect(source).not.toContain('.dpapi.json');
    expect(source).not.toContain('databasePasswordBootstrapAuthorized: true');
    expect(source).not.toContain('--git-head');
    expect(source).not.toContain('--binding-sha256');
    expect(source).not.toContain('--accepted-at');
    expect(source).not.toContain('--source-project-provisioning-authorized');
  });
});
