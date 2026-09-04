/** @jest-environment node */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null;

interface InitialReceiptValidation {
  receipt: JsonObject;
  receiptSha256: string;
  acceptedAt: string;
  approvalRecordFields: JsonObject;
  remoteContactPerformed: false;
  credentialReadPerformed: false;
}

interface ExecutionBindingValidation {
  binding: JsonObject;
  bindingSha256: string;
  generatedAt: string;
  remoteContactPerformed: false;
  credentialReadPerformed: false;
}

interface ReceiptContractModule {
  requireOwnerPrivateBoundary(input: JsonObject): JsonObject;
  inspectOwnerPrivatePathAcl(input: JsonObject): JsonObject;
  validateInitialAction003ApprovalReceipt(
    receipt: JsonObject
  ): InitialReceiptValidation;
  validateAction003ExecutionBinding(
    binding: JsonObject,
    expected: JsonObject,
    now: string
  ): ExecutionBindingValidation;
  deriveAction003ExecutionBinding(
    expected: JsonObject
  ): ExecutionBindingValidation;
  recordInitialAction003ApprovalReceiptCreateNew(input: JsonObject): JsonObject;
  recordAction003ExecutionBindingCreateNew(input: JsonObject): JsonObject;
  verifyInitialAction003ApprovalReceiptStable(input: JsonObject): JsonObject;
  verifyAction003ExecutionBindingStable(input: JsonObject): JsonObject;
}

const repoRoot = path.resolve(__dirname, '../../..');
const contractPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-action003-approval-receipt-contract.mjs'
);
const initialTemplatePath = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-single-action-approval-receipt-v2.template.json'
);
const finalTemplatePath = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-derived-execution-binding-v1.template.json'
);
const temporaryDirectories: string[] = [];
let subject: ReceiptContractModule;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonObject(filename: string): JsonObject {
  const parsed: unknown = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!isJsonObject(parsed)) throw new Error('JSON_OBJECT_REQUIRED');
  return parsed;
}

function clone(value: JsonObject): JsonObject {
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  if (!isJsonObject(cloned)) throw new Error('CLONE_FAILED');
  return cloned;
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

function validInitialReceipt(acceptedAt = '2026-07-27T00:00:00.000Z') {
  return {
    schemaVersion: 2,
    recordType:
      'PR12_SOURCE_PROJECT_PROVISIONING_SINGLE_ACTION_APPROVAL_RECEIPT',
    decision: 'APPROVED',
    attestationStatus: 'VERIFIED',
    attestationMethod: 'SOLE_OPERATOR_EXPLICIT_SINGLE_ACTION_APPROVAL',
    actionId: 'PR12-ACTION-003',
    approvedByPrincipalId: 'owner:futoshi-iwasawa',
    approvedByDisplayName: 'FUTOSHI IWASAWA',
    acceptedAt,
    expiresAt: new Date(Date.parse(acceptedAt) + 60 * 60 * 1000).toISOString(),
    approvalTtlSeconds: 3600,
    approvalPurpose:
      'ACTION003_PACKET_PREPARATION_AND_SOURCE_PROJECT_PROVISIONING',
    gitCommit: '1'.repeat(40),
    organizationId: 'kbnsntifrawhimhfjrug',
    organizationSlug: 'kbnsntifrawhimhfjrug',
    projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
    region: 'ap-northeast-1',
    tier: 'LARGE',
    ownerAuthorizationCeilingUsdScaled: 500000,
    authorizedDurationHours: 72,
    maximumPostAttempts: 1,
    credentialConfigurationSha256: 'd'.repeat(64),
    pricingEvidenceSha256: 'e'.repeat(64),
    actionJournalDirectoryPathSha256: '1'.repeat(64),
    actionJournalDirectoryFingerprint: {
      pathSha256: '1'.repeat(64),
      resolvedPathSha256: '1'.repeat(64),
      device: '101',
      inode: '102',
      snapshotSha256: '3'.repeat(64),
    },
    evidenceParentDirectoryPathSha256: '2'.repeat(64),
    evidenceParentDirectoryFingerprint: {
      pathSha256: '2'.repeat(64),
      resolvedPathSha256: '2'.repeat(64),
      device: '201',
      inode: '202',
      snapshotSha256: '4'.repeat(64),
    },
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
      'Single owner approval for local preparation and at most one isolated source-project provisioning POST.',
  };
}

function expectedExecutionBinding(initialReceipt: JsonObject): JsonObject {
  return {
    authorityReceipt: initialReceipt,
    bindingSha256: 'a'.repeat(64),
    bindingMaterialSha256: 'b'.repeat(64),
    payloadSha256: 'c'.repeat(64),
    credentialConfigurationSha256: 'd'.repeat(64),
    pricingEvidenceSha256: 'e'.repeat(64),
    authorizationProjectionSha256: 'f'.repeat(64),
    scheduledExecutionAt: String(initialReceipt.acceptedAt),
    expiresAt: String(initialReceipt.expiresAt),
    generatedAt: new Date(
      Date.parse(String(initialReceipt.acceptedAt)) + 1000
    ).toISOString(),
  };
}

function validExecutionBinding(initialReceipt: JsonObject): JsonObject {
  const expected = expectedExecutionBinding(initialReceipt);
  return {
    schemaVersion: 1,
    recordType: 'PR12_SOURCE_PROJECT_PROVISIONING_DERIVED_EXECUTION_BINDING',
    derivationStatus: 'VERIFIED_LOCAL_DERIVATION',
    derivationMethod: 'SYSTEM_DERIVED_HASH_BINDING_FROM_SINGLE_APPROVAL',
    actionId: 'PR12-ACTION-003',
    generatedAt: expected.generatedAt,
    expiresAt: expected.expiresAt,
    authorityReceiptSha256: canonicalFileSha256(initialReceipt),
    bindingSha256: expected.bindingSha256,
    bindingMaterialSha256: expected.bindingMaterialSha256,
    payloadSha256: expected.payloadSha256,
    credentialConfigurationSha256: expected.credentialConfigurationSha256,
    pricingEvidenceSha256: expected.pricingEvidenceSha256,
    authorizationProjectionSha256: expected.authorizationProjectionSha256,
    authorityScopeConfirmed: true,
    productionContactAuthorized: false,
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    notes:
      'System-derived exact-hash execution binding. Authority remains exclusively in the single owner receipt; this artifact records no human decision or reconfirmation.',
  };
}

function validSingleActionApprovalReceipt(
  acceptedAt = '2026-07-27T00:00:00.000Z'
): JsonObject {
  return {
    ...validInitialReceipt(acceptedAt),
    attestationMethod: 'SOLE_OPERATOR_EXPLICIT_SINGLE_ACTION_APPROVAL',
    approvalPurpose:
      'ACTION003_PACKET_PREPARATION_AND_SOURCE_PROJECT_PROVISIONING',
    sourceProjectProvisioningAuthorized: true,
    notes:
      'Single owner approval for local preparation and at most one isolated source-project provisioning POST.',
  };
}

function expectedDerivedReceiptBinding(
  singleApprovalReceipt: JsonObject
): JsonObject {
  return {
    ...expectedExecutionBinding(singleApprovalReceipt),
    scheduledExecutionAt: '2026-07-27T00:00:00.000Z',
    expiresAt: '2026-07-27T01:00:00.000Z',
  };
}

function validDerivedExecutionReceipt(
  singleApprovalReceipt: JsonObject
): JsonObject {
  return validExecutionBinding(singleApprovalReceipt);
}

function expectCode(callback: () => unknown, code: string): void {
  expect(callback).toThrow(code);
}

function makeOwnerPrivateRoot(prefix: string): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (process.platform !== 'win32' || typeof localAppData !== 'string') {
    throw new Error('WINDOWS_LOCALAPPDATA_REQUIRED');
  }
  const ownerPrivateRoot = fs.mkdtempSync(path.join(localAppData, prefix));
  temporaryDirectories.push(ownerPrivateRoot);
  return ownerPrivateRoot;
}

beforeAll(async () => {
  subject = (await import(contractPath)) as ReceiptContractModule;
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('PR12 ACTION-003 approval receipt contract', () => {
  test('uses one owner approval with an immediate relative one-hour TTL and a non-human derived hash receipt', () => {
    const singleApproval = validSingleActionApprovalReceipt();
    const initial =
      subject.validateInitialAction003ApprovalReceipt(singleApproval);
    const expected = expectedDerivedReceiptBinding(singleApproval);
    const derivedBinding =
      subject.deriveAction003ExecutionBinding(expected).binding;
    const derived = subject.validateAction003ExecutionBinding(
      derivedBinding,
      expected,
      '2026-07-27T00:00:01.000Z'
    );

    expect(initial.approvalRecordFields).toMatchObject({
      approvedAt: '2026-07-27T00:00:00.000Z',
    });
    expect(derived.generatedAt).toBe('2026-07-27T00:00:01.000Z');
    expect(expected).toMatchObject({
      scheduledExecutionAt: '2026-07-27T00:00:00.000Z',
      expiresAt: '2026-07-27T01:00:00.000Z',
    });
  });

  test('exports fail-closed owner-private boundary and read-only ACL inspectors', () => {
    expect(typeof subject.requireOwnerPrivateBoundary).toBe('function');
    expect(typeof subject.inspectOwnerPrivatePathAcl).toBe('function');

    if (process.platform !== 'win32') return;
    expectCode(
      () =>
        subject.requireOwnerPrivateBoundary({
          ownerPrivateRoot: os.tmpdir(),
          targetPath: os.tmpdir(),
          kind: 'DIRECTORY',
        }),
      'OWNER_PRIVATE_BOUNDARY_INVALID'
    );
    expectCode(
      () =>
        subject.requireOwnerPrivateBoundary({
          ownerPrivateRoot: repoRoot,
          targetPath: repoRoot,
          kind: 'DIRECTORY',
        }),
      'OWNER_PRIVATE_BOUNDARY_INVALID'
    );
  });

  test('rejects a reparse component in an owner-private path', () => {
    if (process.platform !== 'win32') return;
    const container = makeOwnerPrivateRoot('pr12-action003-reparse-container-');
    const actualRoot = path.join(container, 'actual-root');
    const junctionRoot = path.join(container, 'junction-root');
    fs.mkdirSync(actualRoot);
    fs.symlinkSync(actualRoot, junctionRoot, 'junction');

    expectCode(
      () =>
        subject.requireOwnerPrivateBoundary({
          ownerPrivateRoot: junctionRoot,
          targetPath: junctionRoot,
          kind: 'DIRECTORY',
        }),
      'OWNER_PRIVATE_BOUNDARY_INVALID'
    );
  });

  test('keeps both tracked receipt templates non-authorizing', () => {
    const initialTemplate = readJsonObject(initialTemplatePath);
    const executionBindingTemplate = readJsonObject(finalTemplatePath);

    expect(initialTemplate.decision).toBe('NOT_CAPTURED');
    expect(initialTemplate.action003PacketPreparationAuthorized).toBe(false);
    expect(initialTemplate.sourceProjectProvisioningAuthorized).toBe(false);
    expect(initialTemplate.unknownChargesAcknowledged).toBe(false);
    expect(executionBindingTemplate.derivationStatus).toBe('NOT_DERIVED');
    expect(executionBindingTemplate.authorityScopeConfirmed).toBe(false);
    expectCode(
      () => subject.validateInitialAction003ApprovalReceipt(initialTemplate),
      'INITIAL_APPROVAL_RECEIPT_INVALID'
    );
    expectCode(
      () =>
        subject.validateAction003ExecutionBinding(
          executionBindingTemplate,
          expectedExecutionBinding(validInitialReceipt()),
          '2026-07-27T00:05:01.000Z'
        ),
      'DERIVED_EXECUTION_BINDING_INVALID'
    );
  });

  test('binds initial acceptedAt into the receipt SHA and derives approvedAt only from it', () => {
    const receipt = validInitialReceipt();
    const result = subject.validateInitialAction003ApprovalReceipt(receipt);

    expect(result.receiptSha256).toBe(canonicalFileSha256(receipt));
    expect(result.acceptedAt).toBe(receipt.acceptedAt);
    expect(result.approvalRecordFields).toEqual({
      principalId: 'owner:futoshi-iwasawa',
      principalDisplayName: 'FUTOSHI IWASAWA',
      approvedAt: receipt.acceptedAt,
      expiresAt: receipt.expiresAt,
      initialApprovalReceiptSha256: canonicalFileSha256(receipt),
      authorizationScope: {
        gitCommit: receipt.gitCommit,
        organizationId: receipt.organizationId,
        organizationSlug: receipt.organizationSlug,
        projectName: receipt.projectName,
        region: receipt.region,
        tier: receipt.tier,
        ownerAuthorizationCeilingUsdScaled:
          receipt.ownerAuthorizationCeilingUsdScaled,
        authorizedDurationHours: receipt.authorizedDurationHours,
        maximumPostAttempts: receipt.maximumPostAttempts,
        credentialConfigurationSha256: receipt.credentialConfigurationSha256,
        pricingEvidenceSha256: receipt.pricingEvidenceSha256,
        actionJournalDirectoryPathSha256:
          receipt.actionJournalDirectoryPathSha256,
        actionJournalDirectoryFingerprint:
          receipt.actionJournalDirectoryFingerprint,
        evidenceParentDirectoryPathSha256:
          receipt.evidenceParentDirectoryPathSha256,
        evidenceParentDirectoryFingerprint:
          receipt.evidenceParentDirectoryFingerprint,
      },
      riskAcceptances: {
        soleOperatorRiskAccepted: true,
        sameUserDpapiCredentialExposureRiskAccepted: true,
        providerSpendCapLimitationAcknowledged: true,
        sameOrganizationExceptionRiskAccepted: true,
        organizationListProductionRefObservationAccepted: true,
        sharedOrganizationIamBillingControlPlaneRiskAccepted: true,
        productionDirectContactProhibitionAcknowledged: true,
        unknownChargesAcknowledged: true,
      },
    });
    expect(result.remoteContactPerformed).toBe(false);
    expect(result.credentialReadPerformed).toBe(false);

    const changed = validInitialReceipt('2026-07-27T00:00:00.001Z');
    const changedResult =
      subject.validateInitialAction003ApprovalReceipt(changed);
    expect(changedResult.receiptSha256).not.toBe(result.receiptSha256);
    expect(changedResult.approvalRecordFields.approvedAt).toBe(
      changed.acceptedAt
    );
  });

  test.each([
    [
      'wrong principal',
      (receipt: JsonObject) => {
        receipt.approvedByPrincipalId = 'owner:someone-else';
      },
    ],
    [
      'non-canonical timestamp',
      (receipt: JsonObject) => {
        receipt.acceptedAt = '2026-07-27T00:00:00Z';
      },
    ],
    [
      'missing risk acceptance',
      (receipt: JsonObject) => {
        receipt.soleOperatorRiskAccepted = false;
      },
    ],
    [
      'unknown charges not acknowledged',
      (receipt: JsonObject) => {
        receipt.unknownChargesAcknowledged = false;
      },
    ],
    [
      'source-project provisioning authorization missing',
      (receipt: JsonObject) => {
        receipt.sourceProjectProvisioningAuthorized = false;
      },
    ],
    [
      'database password bootstrap authorization',
      (receipt: JsonObject) => {
        receipt.databasePasswordBootstrapAuthorized = true;
      },
    ],
    [
      'extra field',
      (receipt: JsonObject) => {
        receipt.unbound = true;
      },
    ],
  ])('rejects an invalid initial receipt: %s', (_label, mutate) => {
    const receipt = validInitialReceipt();
    mutate(receipt);
    expectCode(
      () => subject.validateInitialAction003ApprovalReceipt(receipt),
      'INITIAL_APPROVAL_RECEIPT_INVALID'
    );
  });

  test('validates only a system-derived binding tied to the exact authority receipt and candidate tuple', () => {
    const initialReceipt = validInitialReceipt();
    const expected = expectedExecutionBinding(initialReceipt);
    const binding = validExecutionBinding(initialReceipt);
    const before = clone(binding);

    const result = subject.validateAction003ExecutionBinding(
      binding,
      expected,
      '2026-07-27T00:00:01.000Z'
    );

    expect(binding).toEqual(before);
    expect(result.binding).toEqual(binding);
    expect(result.bindingSha256).toBe(canonicalFileSha256(binding));
    expect(result.generatedAt).toBe(binding.generatedAt);
    expect(result.remoteContactPerformed).toBe(false);
    expect(result.credentialReadPerformed).toBe(false);
  });

  test.each([
    [
      'wrong initial receipt hash',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.authorityReceiptSha256 = '0'.repeat(64);
      },
    ],
    [
      'wrong candidate hash',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.bindingSha256 = '0'.repeat(64);
      },
    ],
    [
      'derived binding before single approval',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.generatedAt = '2026-07-26T23:59:59.999Z';
      },
    ],
    [
      'derived binding generated after the expected instant',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.generatedAt = '2026-07-27T00:00:02.000Z';
      },
    ],
    [
      'future binding',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.generatedAt = '2026-07-27T00:00:02.000Z';
      },
    ],
    [
      'expired current time',
      (_receipt: JsonObject, expected: JsonObject) => {
        expected.expiresAt = '2026-07-27T00:05:01.000Z';
      },
    ],
    [
      'production contact authorization',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.productionContactAuthorized = true;
      },
    ],
    [
      'authority scope not confirmed',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.authorityScopeConfirmed = false;
      },
    ],
  ])('rejects an invalid derived binding: %s', (_label, mutate) => {
    const initialReceipt = validInitialReceipt();
    const expected = expectedExecutionBinding(initialReceipt);
    const receipt = validExecutionBinding(initialReceipt);
    mutate(receipt, expected);
    expectCode(
      () =>
        subject.validateAction003ExecutionBinding(
          receipt,
          expected,
          '2026-07-27T00:00:01.000Z'
        ),
      'DERIVED_EXECUTION_BINDING_INVALID'
    );
  });

  test('contains no remote transport or credential read implementation', () => {
    const source = fs.readFileSync(contractPath, 'utf8');

    expect(source).not.toContain('https://api.supabase.com');
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain('readCredential');
    expect(source).not.toContain('Unprotect');
  });

  test('records and revalidates the externally populated initial receipt without changing acceptedAt or authorization', () => {
    if (process.platform !== 'win32') return;

    const receipt = validInitialReceipt(new Date().toISOString());
    const ownerPrivateRoot = makeOwnerPrivateRoot(
      'pr12-action003-initial-receipt-owner-'
    );
    const outputDirectory = path.join(
      ownerPrivateRoot,
      'source-project-provisioning-single-action-approval-receipt-v2'
    );
    const before = clone(receipt);
    const template = readJsonObject(initialTemplatePath);
    const rejectedOutputDirectory = path.join(
      ownerPrivateRoot,
      'must-not-be-created'
    );
    expectCode(
      () =>
        subject.recordInitialAction003ApprovalReceiptCreateNew({
          ownerPrivateRoot,
          outputDirectory: rejectedOutputDirectory,
          receipt: template,
        }),
      'INITIAL_APPROVAL_RECEIPT_INVALID'
    );
    expect(fs.existsSync(rejectedOutputDirectory)).toBe(false);
    expectCode(
      () =>
        subject.recordInitialAction003ApprovalReceiptCreateNew({
          ownerPrivateRoot,
          outputDirectory: rejectedOutputDirectory,
          receipt,
        }),
      'RECEIPT_OUTPUT_BOUNDARY_INVALID'
    );

    const recorded = subject.recordInitialAction003ApprovalReceiptCreateNew({
      ownerPrivateRoot,
      outputDirectory,
      receipt,
    });

    expect(receipt).toEqual(before);
    expect(recorded).toMatchObject({
      status: 'RECORDED',
      recordType:
        'PR12_SOURCE_PROJECT_PROVISIONING_SINGLE_ACTION_APPROVAL_RECEIPT',
      fileCount: 1,
      receiptSha256: canonicalFileSha256(receipt),
      acceptedAt: receipt.acceptedAt,
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    });

    const verified = subject.verifyInitialAction003ApprovalReceiptStable({
      receiptPath: path.join(
        outputDirectory,
        'source-project-provisioning-single-action-approval-receipt-v2.json'
      ),
      expectedReceipt: receipt,
      ownerPrivateRoot,
      expectedOwnerPrivateRootIdentity: recorded.ownerPrivateRootIdentity,
      expectedOwnerPrivateRootAcl: recorded.ownerPrivateRootAcl,
      expectedFileIdentity: recorded.fileIdentity,
      expectedFileAcl: recorded.fileAcl,
      expectedDirectoryIdentity: recorded.directoryIdentity,
      expectedDirectoryAcl: recorded.directoryAcl,
    });
    expect(verified).toMatchObject({
      status: 'VERIFIED_STABLE',
      receiptSha256: canonicalFileSha256(receipt),
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    });
    for (const inspect of [
      subject.requireOwnerPrivateBoundary,
      subject.inspectOwnerPrivatePathAcl,
    ]) {
      const proof = inspect({
        ownerPrivateRoot,
        targetPath: path.join(
          outputDirectory,
          'source-project-provisioning-single-action-approval-receipt-v2.json'
        ),
        kind: 'FILE',
      });
      expect(proof).toMatchObject({
        status: 'VERIFIED_OWNER_PRIVATE_PATH',
        boundaryPolicyId: 'PR12_OWNER_PRIVATE_EXTERNAL_NON_REPARSE_V1',
        kind: 'FILE',
        allPathComponentsNonReparse: true,
        outsideRepository: true,
        outsideWindowsTempRoots: true,
        ownerPrivateRootIdentity: recorded.ownerPrivateRootIdentity,
        ownerPrivateRootAcl: recorded.ownerPrivateRootAcl,
        targetIdentity: recorded.fileIdentity,
        targetAcl: recorded.fileAcl,
        remoteContactPerformed: false,
        credentialReadPerformed: false,
      });
    }

    expectCode(
      () =>
        subject.recordInitialAction003ApprovalReceiptCreateNew({
          ownerPrivateRoot,
          outputDirectory,
          receipt,
        }),
      'RECEIPT_OUTPUT_ALREADY_EXISTS'
    );
  });

  test('records create-new, flush/readback and stable Windows ACL identity without synthesizing approval', () => {
    if (process.platform !== 'win32') return;

    const now = Date.now();
    const initialAcceptedAt = new Date(now - 6 * 60 * 1000).toISOString();
    const initialReceipt = validInitialReceipt(initialAcceptedAt);
    const expected = expectedExecutionBinding(initialReceipt);
    const binding = validExecutionBinding(initialReceipt);

    const ownerPrivateRoot = makeOwnerPrivateRoot(
      'pr12-action003-execution-binding-owner-'
    );
    const outputDirectory = path.join(
      ownerPrivateRoot,
      'source-project-provisioning-derived-execution-binding-v1'
    );
    const before = clone(binding);
    const recorded = subject.recordAction003ExecutionBindingCreateNew({
      ownerPrivateRoot,
      outputDirectory,
      binding,
      expected,
    });

    expect(binding).toEqual(before);
    expect(recorded.status).toBe('RECORDED');
    expect(recorded.fileCount).toBe(1);
    expect(recorded.executionBindingSha256).toBe(canonicalFileSha256(binding));
    expect(recorded.remoteContactPerformed).toBe(false);
    expect(recorded.credentialReadPerformed).toBe(false);
    expect(recorded.fileAcl).toMatchObject({
      aclPolicyId: 'WINDOWS_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_V1',
      accessRulesProtected: true,
      accessRuleCount: 2,
    });
    expect(recorded.directoryAcl).toMatchObject({
      aclPolicyId: 'WINDOWS_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_V1',
      accessRulesProtected: true,
      accessRuleCount: 2,
    });
    expect(recorded.ownerPrivateRootAcl).toMatchObject({
      aclPolicyId: 'WINDOWS_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_V1',
      accessRulesProtected: true,
      accessRuleCount: 2,
    });

    const verified = subject.verifyAction003ExecutionBindingStable({
      ownerPrivateRoot,
      receiptPath: path.join(
        outputDirectory,
        'source-project-provisioning-derived-execution-binding-v1.json'
      ),
      expectedReceipt: binding,
      expectedOwnerPrivateRootIdentity: recorded.ownerPrivateRootIdentity,
      expectedOwnerPrivateRootAcl: recorded.ownerPrivateRootAcl,
      expectedFileIdentity: recorded.fileIdentity,
      expectedFileAcl: recorded.fileAcl,
      expectedDirectoryIdentity: recorded.directoryIdentity,
      expectedDirectoryAcl: recorded.directoryAcl,
    });
    expect(verified.status).toBe('VERIFIED_STABLE');

    expectCode(
      () =>
        subject.recordAction003ExecutionBindingCreateNew({
          ownerPrivateRoot,
          outputDirectory,
          binding,
          expected,
        }),
      'RECEIPT_OUTPUT_ALREADY_EXISTS'
    );

    const wrongIdentity = clone(recorded.fileIdentity as JsonObject);
    wrongIdentity.contentSha256 = '0'.repeat(64);
    expectCode(
      () =>
        subject.verifyAction003ExecutionBindingStable({
          ownerPrivateRoot,
          receiptPath: path.join(
            outputDirectory,
            'source-project-provisioning-derived-execution-binding-v1.json'
          ),
          expectedReceipt: binding,
          expectedOwnerPrivateRootIdentity: recorded.ownerPrivateRootIdentity,
          expectedOwnerPrivateRootAcl: recorded.ownerPrivateRootAcl,
          expectedFileIdentity: wrongIdentity,
          expectedFileAcl: recorded.fileAcl,
          expectedDirectoryIdentity: recorded.directoryIdentity,
          expectedDirectoryAcl: recorded.directoryAcl,
        }),
      'RECEIPT_IDENTITY_DRIFT'
    );

    const wrongAcl = clone(recorded.fileAcl as JsonObject);
    wrongAcl.sddlSha256 = '0'.repeat(64);
    expectCode(
      () =>
        subject.verifyAction003ExecutionBindingStable({
          ownerPrivateRoot,
          receiptPath: path.join(
            outputDirectory,
            'source-project-provisioning-derived-execution-binding-v1.json'
          ),
          expectedReceipt: binding,
          expectedOwnerPrivateRootIdentity: recorded.ownerPrivateRootIdentity,
          expectedOwnerPrivateRootAcl: recorded.ownerPrivateRootAcl,
          expectedFileIdentity: recorded.fileIdentity,
          expectedFileAcl: wrongAcl,
          expectedDirectoryIdentity: recorded.directoryIdentity,
          expectedDirectoryAcl: recorded.directoryAcl,
        }),
      'RECEIPT_ACL_DRIFT'
    );

    const wrongRootIdentity = clone(
      recorded.ownerPrivateRootIdentity as JsonObject
    );
    wrongRootIdentity.inode = 'not-the-recorded-root';
    expectCode(
      () =>
        subject.verifyAction003ExecutionBindingStable({
          ownerPrivateRoot,
          receiptPath: path.join(
            outputDirectory,
            'source-project-provisioning-derived-execution-binding-v1.json'
          ),
          expectedReceipt: binding,
          expectedOwnerPrivateRootIdentity: wrongRootIdentity,
          expectedOwnerPrivateRootAcl: recorded.ownerPrivateRootAcl,
          expectedFileIdentity: recorded.fileIdentity,
          expectedFileAcl: recorded.fileAcl,
          expectedDirectoryIdentity: recorded.directoryIdentity,
          expectedDirectoryAcl: recorded.directoryAcl,
        }),
      'OWNER_PRIVATE_ROOT_IDENTITY_DRIFT'
    );

    fs.appendFileSync(
      path.join(
        outputDirectory,
        'source-project-provisioning-derived-execution-binding-v1.json'
      ),
      ' ',
      'utf8'
    );
    expectCode(
      () =>
        subject.verifyAction003ExecutionBindingStable({
          ownerPrivateRoot,
          receiptPath: path.join(
            outputDirectory,
            'source-project-provisioning-derived-execution-binding-v1.json'
          ),
          expectedReceipt: binding,
          expectedOwnerPrivateRootIdentity: recorded.ownerPrivateRootIdentity,
          expectedOwnerPrivateRootAcl: recorded.ownerPrivateRootAcl,
          expectedFileIdentity: recorded.fileIdentity,
          expectedFileAcl: recorded.fileAcl,
          expectedDirectoryIdentity: recorded.directoryIdentity,
          expectedDirectoryAcl: recorded.directoryAcl,
        }),
      'RECEIPT_IDENTITY_DRIFT'
    );
  });

  test('fails closed outside Windows instead of claiming an ACL capture', () => {
    if (process.platform === 'win32') return;
    const initialReceipt = validInitialReceipt();

    expectCode(
      () =>
        subject.recordAction003ExecutionBindingCreateNew({
          ownerPrivateRoot: path.resolve(os.tmpdir()),
          outputDirectory: path.resolve(os.tmpdir(), 'not-created'),
          binding: validExecutionBinding(initialReceipt),
          expected: expectedExecutionBinding(initialReceipt),
        }),
      'WINDOWS_ACL_CAPTURE_REQUIRED'
    );
  });
});
