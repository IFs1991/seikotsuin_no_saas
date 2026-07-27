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

interface FinalReceiptValidation {
  receipt: JsonObject;
  receiptSha256: string;
  acceptedAt: string;
  remoteContactPerformed: false;
  credentialReadPerformed: false;
}

interface ReceiptContractModule {
  requireOwnerPrivateBoundary(input: JsonObject): JsonObject;
  inspectOwnerPrivatePathAcl(input: JsonObject): JsonObject;
  validateInitialAction003ApprovalReceipt(
    receipt: JsonObject
  ): InitialReceiptValidation;
  validateFinalAction003ApprovalReceipt(
    receipt: JsonObject,
    expected: JsonObject,
    now: string
  ): FinalReceiptValidation;
  recordInitialAction003ApprovalReceiptCreateNew(input: JsonObject): JsonObject;
  recordFinalAction003ApprovalReceiptCreateNew(input: JsonObject): JsonObject;
  verifyInitialAction003ApprovalReceiptStable(input: JsonObject): JsonObject;
  verifyFinalAction003ApprovalReceiptStable(input: JsonObject): JsonObject;
}

const repoRoot = path.resolve(__dirname, '../../..');
const contractPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-action003-approval-receipt-contract.mjs'
);
const initialTemplatePath = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-initial-approval-receipt-v1.template.json'
);
const finalTemplatePath = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-final-approval-receipt-v1.template.json'
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
    schemaVersion: 1,
    recordType: 'PR12_SOURCE_PROJECT_PROVISIONING_INITIAL_APPROVAL_RECEIPT',
    decision: 'APPROVED',
    attestationStatus: 'VERIFIED',
    attestationMethod: 'SOLE_OPERATOR_EXPLICIT_INITIAL_APPROVAL',
    actionId: 'PR12-ACTION-003',
    approvedByPrincipalId: 'owner:futoshi-iwasawa',
    approvedByDisplayName: 'FUTOSHI IWASAWA',
    acceptedAt,
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
      'Externally supplied initial owner authorization receipt. Local packet preparation only.',
  };
}

function expectedFinalReceiptBinding(initialReceipt: JsonObject): JsonObject {
  return {
    initialApprovalReceipt: initialReceipt,
    bindingSha256: 'a'.repeat(64),
    bindingMaterialSha256: 'b'.repeat(64),
    payloadSha256: 'c'.repeat(64),
    credentialConfigurationSha256: 'd'.repeat(64),
    pricingEvidenceSha256: 'e'.repeat(64),
    ownerApprovalSha256: 'f'.repeat(64),
    scheduledExecutionAt: '2026-07-27T00:15:00.000Z',
    expiresAt: '2026-07-27T00:30:00.000Z',
  };
}

function validFinalReceipt(
  initialReceipt: JsonObject,
  acceptedAt = '2026-07-27T00:05:00.000Z'
): JsonObject {
  const expected = expectedFinalReceiptBinding(initialReceipt);
  return {
    schemaVersion: 1,
    recordType: 'PR12_SOURCE_PROJECT_PROVISIONING_FINAL_APPROVAL_RECEIPT',
    decision: 'APPROVED',
    attestationStatus: 'VERIFIED',
    attestationMethod: 'SOLE_OPERATOR_EXPLICIT_FINAL_HASH_RECONFIRMATION',
    actionId: 'PR12-ACTION-003',
    approvedByPrincipalId: 'owner:futoshi-iwasawa',
    approvedByDisplayName: 'FUTOSHI IWASAWA',
    acceptedAt,
    expiresAt: expected.expiresAt,
    initialApprovalReceiptSha256: canonicalFileSha256(initialReceipt),
    bindingSha256: expected.bindingSha256,
    bindingMaterialSha256: expected.bindingMaterialSha256,
    payloadSha256: expected.payloadSha256,
    credentialConfigurationSha256: expected.credentialConfigurationSha256,
    pricingEvidenceSha256: expected.pricingEvidenceSha256,
    ownerApprovalSha256: expected.ownerApprovalSha256,
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
      'Externally supplied final owner authorization receipt for the exact candidate hashes.',
  };
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
    const finalTemplate = readJsonObject(finalTemplatePath);

    expect(initialTemplate.decision).toBe('NOT_CAPTURED');
    expect(initialTemplate.action003PacketPreparationAuthorized).toBe(false);
    expect(initialTemplate.sourceProjectProvisioningAuthorized).toBe(false);
    expect(initialTemplate.unknownChargesAcknowledged).toBe(false);
    expect(finalTemplate.decision).toBe('NOT_CAPTURED');
    expect(finalTemplate.sourceProjectProvisioningAuthorized).toBe(false);
    expect(finalTemplate.unknownChargesAcknowledged).toBe(false);
    expectCode(
      () => subject.validateInitialAction003ApprovalReceipt(initialTemplate),
      'INITIAL_APPROVAL_RECEIPT_INVALID'
    );
    expectCode(
      () =>
        subject.validateFinalAction003ApprovalReceipt(
          finalTemplate,
          expectedFinalReceiptBinding(validInitialReceipt()),
          '2026-07-27T00:05:01.000Z'
        ),
      'FINAL_APPROVAL_RECEIPT_INVALID'
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
      initialApprovalReceiptSha256: canonicalFileSha256(receipt),
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
      'remote provisioning authorization',
      (receipt: JsonObject) => {
        receipt.sourceProjectProvisioningAuthorized = true;
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

  test('validates only an externally populated final receipt bound to the exact initial receipt and candidate tuple', () => {
    const initialReceipt = validInitialReceipt();
    const expected = expectedFinalReceiptBinding(initialReceipt);
    const receipt = validFinalReceipt(initialReceipt);
    const before = clone(receipt);

    const result = subject.validateFinalAction003ApprovalReceipt(
      receipt,
      expected,
      '2026-07-27T00:05:01.000Z'
    );

    expect(receipt).toEqual(before);
    expect(result.receipt).toEqual(receipt);
    expect(result.receiptSha256).toBe(canonicalFileSha256(receipt));
    expect(result.acceptedAt).toBe(receipt.acceptedAt);
    expect(result.remoteContactPerformed).toBe(false);
    expect(result.credentialReadPerformed).toBe(false);
  });

  test.each([
    [
      'wrong initial receipt hash',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.initialApprovalReceiptSha256 = '0'.repeat(64);
      },
    ],
    [
      'wrong candidate hash',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.bindingSha256 = '0'.repeat(64);
      },
    ],
    [
      'too-early final receipt',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.acceptedAt = '2026-07-27T00:04:59.999Z';
      },
    ],
    [
      'after schedule',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.acceptedAt = '2026-07-27T00:15:00.001Z';
      },
    ],
    [
      'future receipt',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.acceptedAt = '2026-07-27T00:06:00.000Z';
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
      'unknown charges not acknowledged',
      (receipt: JsonObject, _expected: JsonObject) => {
        receipt.unknownChargesAcknowledged = false;
      },
    ],
  ])('rejects an invalid final receipt: %s', (_label, mutate) => {
    const initialReceipt = validInitialReceipt();
    const expected = expectedFinalReceiptBinding(initialReceipt);
    const receipt = validFinalReceipt(initialReceipt);
    mutate(receipt, expected);
    expectCode(
      () =>
        subject.validateFinalAction003ApprovalReceipt(
          receipt,
          expected,
          '2026-07-27T00:05:01.000Z'
        ),
      'FINAL_APPROVAL_RECEIPT_INVALID'
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
      'source-project-provisioning-initial-approval-receipt-v1'
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
      recordType: 'PR12_SOURCE_PROJECT_PROVISIONING_INITIAL_APPROVAL_RECEIPT',
      fileCount: 1,
      receiptSha256: canonicalFileSha256(receipt),
      acceptedAt: receipt.acceptedAt,
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    });

    const verified = subject.verifyInitialAction003ApprovalReceiptStable({
      receiptPath: path.join(
        outputDirectory,
        'source-project-provisioning-initial-approval-receipt-v1.json'
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
          'source-project-provisioning-initial-approval-receipt-v1.json'
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
    const finalAcceptedAt = new Date(now - 30 * 1000).toISOString();
    const initialReceipt = validInitialReceipt(initialAcceptedAt);
    const expected = expectedFinalReceiptBinding(initialReceipt);
    expected.scheduledExecutionAt = new Date(
      Date.parse(initialAcceptedAt) + 15 * 60 * 1000
    ).toISOString();
    expected.expiresAt = new Date(
      Date.parse(initialAcceptedAt) + 30 * 60 * 1000
    ).toISOString();
    const receipt = validFinalReceipt(initialReceipt, finalAcceptedAt);
    receipt.expiresAt = expected.expiresAt;

    const ownerPrivateRoot = makeOwnerPrivateRoot(
      'pr12-action003-receipt-owner-'
    );
    const outputDirectory = path.join(
      ownerPrivateRoot,
      'source-project-provisioning-final-approval-receipt-v1'
    );
    const before = clone(receipt);
    const recorded = subject.recordFinalAction003ApprovalReceiptCreateNew({
      ownerPrivateRoot,
      outputDirectory,
      receipt,
      expected,
    });

    expect(receipt).toEqual(before);
    expect(recorded.status).toBe('RECORDED');
    expect(recorded.fileCount).toBe(1);
    expect(recorded.receiptSha256).toBe(canonicalFileSha256(receipt));
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

    const verified = subject.verifyFinalAction003ApprovalReceiptStable({
      ownerPrivateRoot,
      receiptPath: path.join(
        outputDirectory,
        'source-project-provisioning-final-approval-receipt-v1.json'
      ),
      expectedReceipt: receipt,
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
        subject.recordFinalAction003ApprovalReceiptCreateNew({
          ownerPrivateRoot,
          outputDirectory,
          receipt,
          expected,
        }),
      'RECEIPT_OUTPUT_ALREADY_EXISTS'
    );

    const wrongIdentity = clone(recorded.fileIdentity as JsonObject);
    wrongIdentity.contentSha256 = '0'.repeat(64);
    expectCode(
      () =>
        subject.verifyFinalAction003ApprovalReceiptStable({
          ownerPrivateRoot,
          receiptPath: path.join(
            outputDirectory,
            'source-project-provisioning-final-approval-receipt-v1.json'
          ),
          expectedReceipt: receipt,
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
        subject.verifyFinalAction003ApprovalReceiptStable({
          ownerPrivateRoot,
          receiptPath: path.join(
            outputDirectory,
            'source-project-provisioning-final-approval-receipt-v1.json'
          ),
          expectedReceipt: receipt,
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
        subject.verifyFinalAction003ApprovalReceiptStable({
          ownerPrivateRoot,
          receiptPath: path.join(
            outputDirectory,
            'source-project-provisioning-final-approval-receipt-v1.json'
          ),
          expectedReceipt: receipt,
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
        'source-project-provisioning-final-approval-receipt-v1.json'
      ),
      ' ',
      'utf8'
    );
    expectCode(
      () =>
        subject.verifyFinalAction003ApprovalReceiptStable({
          ownerPrivateRoot,
          receiptPath: path.join(
            outputDirectory,
            'source-project-provisioning-final-approval-receipt-v1.json'
          ),
          expectedReceipt: receipt,
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
        subject.recordFinalAction003ApprovalReceiptCreateNew({
          ownerPrivateRoot: path.resolve(os.tmpdir()),
          outputDirectory: path.resolve(os.tmpdir(), 'not-created'),
          receipt: validFinalReceipt(initialReceipt),
          expected: expectedFinalReceiptBinding(initialReceipt),
        }),
      'WINDOWS_ACL_CAPTURE_REQUIRED'
    );
  });
});
