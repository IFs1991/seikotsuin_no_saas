/** @jest-environment node */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null;

interface ApprovalArtifacts {
  binding: JsonObject;
  credentialConfiguration: JsonObject;
  authorizationProjection: JsonObject;
  summary: JsonObject;
}

interface BuilderModule {
  buildAction003ApprovalArtifacts(input: JsonObject): ApprovalArtifacts;
  initializeAction003ApprovalOutputCreateNew(
    outputDirectory: string,
    credentialConfiguration: JsonObject,
    ownerPrivateRoot: string
  ): JsonObject;
  completeAction003ApprovalOutputCreateNew(
    outputDirectory: string,
    artifacts: ApprovalArtifacts
  ): JsonObject;
  verifyAction003ApprovalOutput(
    outputDirectory: string,
    artifacts: ApprovalArtifacts
  ): JsonObject;
}

const repoRoot = path.resolve(__dirname, '../../..');
const builderPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/build-pr12-action003-approval-packet.mjs'
);
const bindingTemplatePath = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-binding-v6.template.json'
);
const authorizationProjectionTemplatePath = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12/source-project-provisioning-authorization-projection-v1.template.json'
);

let builder: BuilderModule;
const temporaryDirectories: string[] = [];
const win = process.platform === 'win32' ? test : test.skip;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonObject(value: JsonValue, label: string): JsonObject {
  if (!isJsonObject(value)) throw new Error(`${label}_NOT_OBJECT`);
  return value;
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

function pathFingerprint(value: string): string {
  return createHash('sha256')
    .update(
      path.win32.resolve(value).replaceAll('\\', '/').toLowerCase(),
      'utf8'
    )
    .digest('hex');
}

function makeExternalFileIdentity(
  filename: string,
  contentSha256: string,
  seed: string
): JsonObject {
  return {
    pathSha256: pathFingerprint(filename),
    resolvedPathSha256: pathFingerprint(filename),
    device: `${seed}01`,
    inode: `${seed}02`,
    size: 100 + seed.length,
    modifiedAtMilliseconds: 1_750_000_000_000 + seed.length,
    contentSha256,
  };
}

function makeDirectoryFingerprint(directory: string, seed: string): JsonObject {
  return {
    pathSha256: pathFingerprint(directory),
    resolvedPathSha256: pathFingerprint(directory),
    device: `${seed}11`,
    inode: `${seed}12`,
    snapshotSha256: seed.repeat(64).slice(0, 64),
  };
}

function makeCredentialConfiguration(): JsonObject {
  const providerRoot = 'C:\\Owner\\PR12\\credentials';
  const tokenHandle =
    'windows-dpapi-cu://pr12-source-project/management-access-token/v1';
  const passwordHandle =
    'windows-dpapi-cu://pr12-source-project/database-password/v1';
  const handleHash = (value: string) =>
    createHash('sha256').update(value, 'utf8').digest('hex');
  const tokenHandleSha256 = handleHash(tokenHandle);
  const passwordHandleSha256 = handleHash(passwordHandle);
  const tokenEnvelopeFilename = `${tokenHandleSha256}.dpapi.json`;
  const passwordEnvelopeFilename = `${passwordHandleSha256}.dpapi.json`;
  return {
    schemaVersion: 2,
    resultType: 'SOURCE_PROJECT_PROVISIONING_CREDENTIAL_CONFIGURATION',
    status: 'APPROVED',
    provider: {
      providerId: 'WINDOWS_DPAPI_CURRENT_USER_V1',
      configurationId: 'pr12-source-provisioning-dpapi-v1',
      retrievalChannel: 'CLAIM_BOUND_CAPTURED_STDOUT_BINARY_V1',
      ownerApproved: true,
      protectionScope: 'CURRENT_USER',
      ownerSidSha256: 'a'.repeat(64),
      machineNameSha256: 'b'.repeat(64),
      providerRoot,
      providerRootPathSha256: pathFingerprint(providerRoot),
      providerRootResolvedPathSha256: pathFingerprint(providerRoot),
      providerRootDevice: '12345',
      providerRootInode: '67890',
    },
    runtime: {
      platform: 'WIN32',
      powershellExecutablePath: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      powershellExecutableSha256: 'c'.repeat(64),
      powershellVersion: '7.5.2',
      requiredLanguageMode: 'FullLanguage',
      brokerScriptPath:
        'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1',
      brokerScriptSha256: 'd'.repeat(64),
      bootstrapScriptPath:
        'scripts/commercial-hardening/initialize-pr12-windows-dpapi-credentials.ps1',
      bootstrapScriptSha256: 'e'.repeat(64),
    },
    protocol: {
      requestProtocol: 'PR12_DPAPI_BROKER_REQUEST_V1',
      responseMagic: 'PR12DPB1',
      responseVersion: 1,
      requestMaximumBytes: 16384,
      responseMaximumBytes: 8192,
      brokerTimeoutMilliseconds: 30000,
      automaticRetryAllowed: false,
      requestViaCapturedStdinOnly: true,
      responseViaCapturedStdoutBinaryOnly: true,
      zeroStderrRequired: true,
    },
    secrets: {
      managementAccessToken: {
        role: 'MANAGEMENT_ACCESS_TOKEN',
        opaqueHandle: tokenHandle,
        opaqueHandleSha256: tokenHandleSha256,
        envelopeFilename: tokenEnvelopeFilename,
        envelopeSha256: 'f'.repeat(64),
        envelopeIdentity: makeExternalFileIdentity(
          path.win32.join(providerRoot, tokenEnvelopeFilename),
          'f'.repeat(64),
          '2'
        ),
        credentialType: 'SUPABASE_FINE_GRAINED_ACCESS_TOKEN',
        requiredEndpointOAuthScopes: [
          'projects:read',
          'projects:write',
          'organizations:read',
        ],
        requiredFineGrainedPermissions: [
          'organization_admin_read',
          'organization_projects_read',
          'organization_projects_create',
          'infra_add_ons_read',
        ],
        minimumBytes: 20,
        maximumBytes: 4096,
      },
      databasePassword: {
        role: 'DATABASE_PASSWORD',
        opaqueHandle: passwordHandle,
        opaqueHandleSha256: passwordHandleSha256,
        envelopeFilename: passwordEnvelopeFilename,
        envelopeSha256: '1'.repeat(64),
        envelopeIdentity: makeExternalFileIdentity(
          path.win32.join(providerRoot, passwordEnvelopeFilename),
          '1'.repeat(64),
          '3'
        ),
        minimumBytes: 32,
        maximumBytes: 256,
      },
    },
    storageBoundary: {
      outsideRepositoryRequired: true,
      outsideTemporaryDirectoriesRequired: true,
      reparsePointsAllowed: false,
      envelopeOverwriteAllowed: false,
      allowedAclPrincipals: ['CURRENT_USER', 'LOCAL_SYSTEM'],
      inheritedAclAllowed: false,
      providerRootIdentityMustRemainStable: true,
      allProviderRootPathComponentsMustBeNonReparse: true,
      resolvedProviderRootMustBeDisjointFromRepositoryTemporaryJournalAndEvidenceTrees: true,
    },
    processBoundary: {
      genericOrAmbientFallbackAllowed: false,
      dotenvLoadingAllowed: false,
      cliLoginSessionFallbackAllowed: false,
      inheritedEnvironmentAllowed: false,
      rawValueInArgvAllowed: false,
      rawValueInUrlAllowed: false,
      rawValueInEnvironmentAllowed: false,
      rawValueRelayToParentStdoutOrStderrAllowed: false,
      rawValueInLogOrEvidenceAllowed: false,
      capturedBrokerBinaryResponseException:
        'NODE_PARENT_CAPTURE_ONLY_NEVER_RELAY_OR_PERSIST',
    },
    bootstrap: {
      realCredentialBootstrapCompleted: true,
      realCredentialBootstrapAuthorizedByThisPreparation: false,
      separateInteractiveAuthorizationRequired: true,
    },
    approvedBy: 'owner:futoshi-iwasawa',
    approvedAt: '2026-07-26T23:50:00.000Z',
    notes: 'Synthetic secret-free credential metadata.',
  };
}

function makePricingEvidence(): JsonObject {
  return {
    schemaVersion: 3,
    recordType: 'PR12_SOURCE_PROJECT_OFFICIAL_PRICING_EVIDENCE',
    status: 'CAPTURED',
    provider: 'SUPABASE',
    currency: 'USD',
    moneyScale: 10000,
    officialSources: [
      {
        sourceId: 'COMPUTE_AND_DISK',
        url: 'https://supabase.com/docs/guides/platform/compute-and-disk',
        retrievedAt: '2026-07-26T23:30:00.000Z',
        artifactPath: 'official/compute-and-disk.html',
        artifactSha256: '2'.repeat(64),
      },
      {
        sourceId: 'COMPUTE_USAGE',
        url: 'https://supabase.com/docs/guides/platform/manage-your-usage/compute',
        retrievedAt: '2026-07-26T23:35:00.000Z',
        artifactPath: 'official/compute-usage.html',
        artifactSha256: '3'.repeat(64),
      },
      {
        sourceId: 'PRICING',
        url: 'https://supabase.com/pricing',
        retrievedAt: '2026-07-26T23:40:00.000Z',
        artifactPath: 'official/pricing.html',
        artifactSha256: '4'.repeat(64),
      },
    ],
    pricing: {
      requiredExistingOrganizationPlan: 'PRO',
      planPurchaseOrChangeAuthorized: false,
      planIncrementalUsdScaled: 0,
      computeTier: 'LARGE',
      desiredInstanceSize: 'large',
      computeAddonVariant: 'ci_large',
      billingUnit: 'PROJECT_HOUR',
      partialHourRounding: 'ROUNDED_UP_TO_FULL_HOUR',
      hourlyRateUsdScaled: 1517,
      maximumBillableHours: 72,
      maximumComputeUsdScaled: 109224,
    },
    conservativeTreatment: {
      creditReliance: 'NONE',
      computeCreditAppliedUsdScaled: 0,
      taxAndOtherChargesQuoted: false,
      taxAndOtherChargesEstimateUsdScaled: null,
      unallocatedAuthorizationHeadroomUsdScaled: 390776,
    },
    authorizationBoundary: {
      ownerAuthorizationCeilingUsdScaled: 500000,
      providerSpendCapEnforced: false,
      knownCostOverCeilingAction: 'ABORT_BEFORE_POST',
      ceilingMeaning: 'OWNER_GOVERNANCE_AUTHORIZATION_NOT_PROVIDER_SPEND_CAP',
    },
    freshness: {
      policy: 'LOCAL_24_HOUR_REVALIDATION_NOT_PROVIDER_QUOTE_VALIDITY',
      maximumAgeAtApprovalSeconds: 86400,
      lifetimeSeconds: 86400,
      freshThrough: '2026-07-27T23:30:00.000Z',
    },
    capturedBy: 'owner:futoshi-iwasawa',
    rawOfficialSourceArtifactsPersistedInRepository: false,
    notes: 'Synthetic official list-price evidence.',
  };
}

function makeInput(): JsonObject {
  const bindingTemplate = readJsonObject(bindingTemplatePath);
  const authorizationProjectionTemplate = readJsonObject(
    authorizationProjectionTemplatePath
  );
  const organizationIdentityEvidence = clone(
    jsonObject(
      bindingTemplate.organizationIdentityEvidence,
      'ORGANIZATION_IDENTITY'
    )
  );
  organizationIdentityEvidence.evidenceDirectoryFingerprint = {
    pathSha256: '5'.repeat(64),
    resolvedPathSha256: '6'.repeat(64),
    device: '111',
    inode: '222',
    snapshotSha256: '7'.repeat(64),
  };
  organizationIdentityEvidence.journalDirectoryFingerprint = {
    pathSha256: '8'.repeat(64),
    resolvedPathSha256: '9'.repeat(64),
    device: '333',
    inode: '444',
    snapshotSha256: 'a'.repeat(64),
  };
  const credentialConfiguration = makeCredentialConfiguration();
  const pricingEvidence = makePricingEvidence();
  const actionJournalDirectoryPath = 'C:\\Owner\\PR12\\action003-journal';
  const evidenceParentDirectoryPath = 'C:\\Owner\\PR12\\action003-evidence';
  const credentialConfigurationArtifactSha256 = canonicalFileSha256(
    credentialConfiguration
  );
  const pricingEvidenceArtifactSha256 = canonicalFileSha256(pricingEvidence);
  const actionJournalDirectoryFingerprint = makeDirectoryFingerprint(
    actionJournalDirectoryPath,
    '4'
  );
  const evidenceParentDirectoryFingerprint = makeDirectoryFingerprint(
    evidenceParentDirectoryPath,
    '5'
  );
  const initialApprovalReceipt = {
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
    gitCommit: 'b'.repeat(40),
    organizationId: 'kbnsntifrawhimhfjrug',
    organizationSlug: 'kbnsntifrawhimhfjrug',
    projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
    region: 'ap-northeast-1',
    tier: 'LARGE',
    ownerAuthorizationCeilingUsdScaled: 500000,
    authorizedDurationHours: 72,
    maximumPostAttempts: 1,
    credentialConfigurationSha256: credentialConfigurationArtifactSha256,
    pricingEvidenceSha256: pricingEvidenceArtifactSha256,
    actionJournalDirectoryPathSha256: pathFingerprint(
      actionJournalDirectoryPath
    ),
    actionJournalDirectoryFingerprint: clone(actionJournalDirectoryFingerprint),
    evidenceParentDirectoryPathSha256: pathFingerprint(
      evidenceParentDirectoryPath
    ),
    evidenceParentDirectoryFingerprint: clone(
      evidenceParentDirectoryFingerprint
    ),
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
  const initialApprovalReceiptArtifactSha256 = canonicalFileSha256(
    initialApprovalReceipt
  );
  return {
    bindingTemplate,
    authorizationProjectionTemplate,
    credentialConfiguration,
    credentialConfigurationArtifactSha256,
    pricingEvidence,
    pricingEvidenceArtifactSha256,
    initialApprovalReceipt,
    initialApprovalReceiptArtifactSha256,
    organizationIdentityEvidence,
    repositoryState: {
      currentHead: 'b'.repeat(40),
      currentBaseCommit: '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab',
      worktreeClean: true,
      organizationIdentitySourceGitCommitIsAncestor: true,
      governanceSha256: 'c'.repeat(64),
      contractSha256: 'd'.repeat(64),
      wrapperSha256: 'e'.repeat(64),
      organizationIdentityContractSha256: 'f'.repeat(64),
      organizationIdentityVerifierSha256: '1'.repeat(64),
    },
    runtimeBoundary: {
      nodeVersion: 'v24.0.0',
      nodeExecArgv: [],
      ambientCredentialNames: [],
    },
    directoryBindings: {
      actionJournalDirectoryPath,
      actionJournalDirectoryFingerprint: clone(
        actionJournalDirectoryFingerprint
      ),
      evidenceParentDirectoryPath,
      evidenceParentDirectoryFingerprint: clone(
        evidenceParentDirectoryFingerprint
      ),
      providerRootResolvedPath: 'C:\\Owner\\PR12\\credentials',
      credentialConfigurationSourceIdentity: makeExternalFileIdentity(
        'C:\\Owner\\PR12\\approval-inputs\\credential-configuration-v2.json',
        credentialConfigurationArtifactSha256,
        '6'
      ),
      pricingEvidenceSourceIdentity: makeExternalFileIdentity(
        'C:\\Owner\\PR12\\pricing\\official-pricing-evidence-v3.json',
        pricingEvidenceArtifactSha256,
        '7'
      ),
    },
    approvalRecord: {
      principalId: 'owner:futoshi-iwasawa',
      principalDisplayName: 'FUTOSHI IWASAWA',
      approvedAt: '2026-07-27T00:00:00.000Z',
      expiresAt: '2026-07-27T01:00:00.000Z',
      initialApprovalReceiptSha256: initialApprovalReceiptArtifactSha256,
      authorizationScope: {
        gitCommit: 'b'.repeat(40),
        organizationId: 'kbnsntifrawhimhfjrug',
        organizationSlug: 'kbnsntifrawhimhfjrug',
        projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
        region: 'ap-northeast-1',
        tier: 'LARGE',
        ownerAuthorizationCeilingUsdScaled: 500000,
        authorizedDurationHours: 72,
        maximumPostAttempts: 1,
        credentialConfigurationSha256: credentialConfigurationArtifactSha256,
        pricingEvidenceSha256: pricingEvidenceArtifactSha256,
        actionJournalDirectoryPathSha256: pathFingerprint(
          actionJournalDirectoryPath
        ),
        actionJournalDirectoryFingerprint: clone(
          actionJournalDirectoryFingerprint
        ),
        evidenceParentDirectoryPathSha256: pathFingerprint(
          evidenceParentDirectoryPath
        ),
        evidenceParentDirectoryFingerprint: clone(
          evidenceParentDirectoryFingerprint
        ),
      },
      builtAt: '2026-07-27T00:05:01.000Z',
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
    },
    knownAdditionalChargesUsdScaled: 0,
    fundingSource: 'OWNER_REGISTERED_ORGANIZATION_PAYMENT_METHOD',
    notes: {
      binding:
        'Owner-approved Phase 1 ACTION-003 binding; JavaScript and .NET zeroization is not guaranteed; Phase 2 remains unauthorized; no remote action performed by this builder.',
      authorizationProjection:
        'System-derived ACTION-003 authorization projection; owner accepted the residual zeroization risk; Phase 2 and cleanup remain unauthorized.',
    },
  };
}

function rebindCredentialConfigurationArtifact(input: JsonObject): void {
  const credential = jsonObject(input.credentialConfiguration, 'CREDENTIAL');
  const sha256 = canonicalFileSha256(credential);
  input.credentialConfigurationArtifactSha256 = sha256;
  const directories = jsonObject(input.directoryBindings, 'DIRECTORIES');
  const identity = jsonObject(
    directories.credentialConfigurationSourceIdentity,
    'CREDENTIAL_SOURCE_IDENTITY'
  );
  identity.contentSha256 = sha256;
  const receipt = jsonObject(
    input.initialApprovalReceipt,
    'INITIAL_APPROVAL_RECEIPT'
  );
  receipt.credentialConfigurationSha256 = sha256;
  rebindInitialApprovalReceiptArtifact(input);
}

function rebindPricingEvidenceArtifact(input: JsonObject): void {
  const pricing = jsonObject(input.pricingEvidence, 'PRICING');
  const sha256 = canonicalFileSha256(pricing);
  input.pricingEvidenceArtifactSha256 = sha256;
  const directories = jsonObject(input.directoryBindings, 'DIRECTORIES');
  const identity = jsonObject(
    directories.pricingEvidenceSourceIdentity,
    'PRICING_SOURCE_IDENTITY'
  );
  identity.contentSha256 = sha256;
  const receipt = jsonObject(
    input.initialApprovalReceipt,
    'INITIAL_APPROVAL_RECEIPT'
  );
  receipt.pricingEvidenceSha256 = sha256;
  rebindInitialApprovalReceiptArtifact(input);
}

function rebindInitialApprovalReceiptArtifact(input: JsonObject): void {
  const receipt = jsonObject(
    input.initialApprovalReceipt,
    'INITIAL_APPROVAL_RECEIPT'
  );
  const receiptSha256 = canonicalFileSha256(receipt);
  input.initialApprovalReceiptArtifactSha256 = receiptSha256;
  const approvalRecord = jsonObject(input.approvalRecord, 'APPROVAL_RECORD');
  approvalRecord.initialApprovalReceiptSha256 = receiptSha256;
  approvalRecord.approvedAt = receipt.acceptedAt;
  approvalRecord.expiresAt = receipt.expiresAt;
  approvalRecord.authorizationScope = {
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
    actionJournalDirectoryPathSha256: receipt.actionJournalDirectoryPathSha256,
    actionJournalDirectoryFingerprint:
      receipt.actionJournalDirectoryFingerprint,
    evidenceParentDirectoryPathSha256:
      receipt.evidenceParentDirectoryPathSha256,
    evidenceParentDirectoryFingerprint:
      receipt.evidenceParentDirectoryFingerprint,
  };
}

beforeAll(async () => {
  const loaded: unknown =
    await import('../../../scripts/commercial-hardening/build-pr12-action003-approval-packet.mjs');
  builder = loaded as BuilderModule;
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('PR12 ACTION-003 local-only approval builder', () => {
  test('derives the exact JIT schedule, cleanup horizon, hashes, and secret-free outputs', () => {
    const input = makeInput();
    const result = builder.buildAction003ApprovalArtifacts(input);
    const action = jsonObject(result.binding.provisioningAction, 'ACTION');
    const cleanup = jsonObject(
      result.binding.retentionAndCleanupDecision,
      'CLEANUP'
    );
    const approval = jsonObject(result.binding.approval, 'APPROVAL');
    const duplicatePolicy = jsonObject(
      result.binding.duplicateAndFailurePolicy,
      'DUPLICATE_POLICY'
    );
    const evidenceContract = jsonObject(
      result.binding.evidenceContract,
      'EVIDENCE_CONTRACT'
    );
    const credentialControls = jsonObject(
      result.binding.credentialControls,
      'CREDENTIAL_CONTROLS'
    );
    const credentialArtifact = jsonObject(
      credentialControls.provisioningCredentialConfiguration,
      'CREDENTIAL_ARTIFACT'
    );

    expect(action.requestTimeoutMilliseconds).toBe(30000);
    expect(action.readinessObservationMaximumSeconds).toBe(900);
    expect(action.readinessPollIntervalSeconds).toBe(15);
    expect(action.scheduledExecutionAt).toBe('2026-07-27T00:00:00.000Z');
    expect(cleanup.fundedThrough).toBe('2026-07-30T01:00:00.000Z');
    expect(cleanup.deletionApprovalRequestDeadline).toBe(
      '2026-07-29T22:00:00.000Z'
    );
    expect(approval.expiresAt).toBe('2026-07-27T01:00:00.000Z');
    expect(
      jsonObject(result.binding.cost, 'COST').knownAdditionalChargesUsdScaled
    ).toBe(0);
    expect(
      jsonObject(result.binding.cost, 'COST').unknownChargesAcknowledged
    ).toBe(true);
    expect(approval.unknownChargesAcknowledged).toBe(true);
    expect(result.authorizationProjection.unknownChargesAcknowledged).toBe(
      true
    );
    expect(duplicatePolicy.actionJournalDirectoryFingerprint).toEqual(
      jsonObject(
        jsonObject(input.directoryBindings, 'DIRECTORIES')
          .actionJournalDirectoryFingerprint,
        'ACTION_JOURNAL_FINGERPRINT'
      )
    );
    expect(evidenceContract.evidenceParentDirectoryFingerprint).toEqual(
      jsonObject(
        jsonObject(input.directoryBindings, 'DIRECTORIES')
          .evidenceParentDirectoryFingerprint,
        'EVIDENCE_PARENT_FINGERPRINT'
      )
    );
    expect(credentialArtifact.sourceIdentity).toEqual(
      jsonObject(
        jsonObject(input.directoryBindings, 'DIRECTORIES')
          .credentialConfigurationSourceIdentity,
        'CREDENTIAL_SOURCE_IDENTITY'
      )
    );

    const outputs = canonicalJson({
      binding: result.binding,
      authorizationProjection: result.authorizationProjection,
      summary: result.summary,
    });
    expect(outputs).not.toContain('C:/Owner');
    expect(outputs).not.toContain('C:\\\\Owner');
    expect(outputs).not.toContain('providerRoot');
    expect(result.summary).toMatchObject({
      actionId: 'PR12-ACTION-003',
      derivedExecutionBindingRequired: true,
      sourceProjectProvisioningAuthorized: false,
      remoteContactPerformed: false,
      credentialReadPerformed: false,
    });
    expect(result.binding).toMatchObject({
      status: 'PENDING_DERIVED_EXECUTION_BINDING',
      authorization: {
        sourceProjectProvisioningAuthorized: false,
      },
    });
    expect(result.authorizationProjection).toMatchObject({
      recordType: 'PR12_SOURCE_PROJECT_PROVISIONING_AUTHORIZATION_PROJECTION',
      projectionStatus: 'DERIVED',
      derivationStatus: 'VERIFIED_LOCAL_DERIVATION',
    });
  });

  test.each([
    [
      'dirty worktree',
      (input: JsonObject) => {
        jsonObject(input.repositoryState, 'REPOSITORY').worktreeClean = false;
      },
      'WORKTREE_NOT_CLEAN',
    ],
    [
      'wrong head',
      (input: JsonObject) => {
        jsonObject(input.repositoryState, 'REPOSITORY').currentHead =
          'NOT_CAPTURED';
      },
      'GIT_HEAD_INVALID',
    ],
    [
      'ACTION-002 manifest drift',
      (input: JsonObject) => {
        jsonObject(
          input.organizationIdentityEvidence,
          'ORGANIZATION_IDENTITY'
        ).manifestSha256 = '0'.repeat(64);
      },
      'ACTION002_SEALED_EVIDENCE_MISMATCH',
    ],
    [
      'legacy Management handle',
      (input: JsonObject) => {
        const credential = jsonObject(
          input.credentialConfiguration,
          'CREDENTIAL'
        );
        const secrets = jsonObject(credential.secrets, 'SECRETS');
        const token = jsonObject(
          secrets.managementAccessToken,
          'MANAGEMENT_TOKEN'
        );
        token.opaqueHandle =
          'windows-dpapi-cu://pr12-source-project/management-token/v1';
        rebindCredentialConfigurationArtifact(input);
      },
      'CREDENTIAL_CONFIGURATION_INVALID',
    ],
    [
      'missing risk acceptance',
      (input: JsonObject) => {
        const record = jsonObject(input.approvalRecord, 'APPROVAL_RECORD');
        jsonObject(
          record.riskAcceptances,
          'RISK_ACCEPTANCES'
        ).sameUserDpapiCredentialExposureRiskAccepted = false;
      },
      'RISK_ACCEPTANCE_INCOMPLETE',
    ],
    [
      'missing explicit unknown-charge acceptance',
      (input: JsonObject) => {
        const record = jsonObject(input.approvalRecord, 'APPROVAL_RECORD');
        jsonObject(
          record.riskAcceptances,
          'RISK_ACCEPTANCES'
        ).unknownChargesAcknowledged = false;
      },
      'RISK_ACCEPTANCE_INCOMPLETE',
    ],
    [
      'initial receipt without explicit unknown-charge acceptance',
      (input: JsonObject) => {
        const receipt = jsonObject(
          input.initialApprovalReceipt,
          'INITIAL_APPROVAL_RECEIPT'
        );
        receipt.unknownChargesAcknowledged = false;
        rebindInitialApprovalReceiptArtifact(input);
      },
      'INITIAL_APPROVAL_RECEIPT_INVALID',
    ],
    [
      'nonzero known additional charge',
      (input: JsonObject) => {
        input.knownAdditionalChargesUsdScaled = 1;
      },
      'KNOWN_COST_INVALID',
    ],
    [
      'initial receipt chronology drift',
      (input: JsonObject) => {
        const receipt = jsonObject(
          input.initialApprovalReceipt,
          'INITIAL_APPROVAL_RECEIPT'
        );
        receipt.acceptedAt = '2026-07-27T00:00:01.000Z';
        rebindInitialApprovalReceiptArtifact(input);
      },
      'INITIAL_APPROVAL_RECEIPT_INVALID',
    ],
    [
      'initial receipt database-password bootstrap expansion',
      (input: JsonObject) => {
        const receipt = jsonObject(
          input.initialApprovalReceipt,
          'INITIAL_APPROVAL_RECEIPT'
        );
        receipt.databasePasswordBootstrapAuthorized = true;
        rebindInitialApprovalReceiptArtifact(input);
      },
      'INITIAL_APPROVAL_RECEIPT_INVALID',
    ],
    [
      'credential artifact hash drift',
      (input: JsonObject) => {
        input.credentialConfigurationArtifactSha256 = '0'.repeat(64);
      },
      'CREDENTIAL_CONFIGURATION_INVALID',
    ],
    [
      'database-password envelope binding drift',
      (input: JsonObject) => {
        const credential = jsonObject(
          input.credentialConfiguration,
          'CREDENTIAL'
        );
        const secrets = jsonObject(credential.secrets, 'SECRETS');
        const password = jsonObject(
          secrets.databasePassword,
          'DATABASE_PASSWORD'
        );
        password.envelopeFilename = `${'0'.repeat(64)}.dpapi.json`;
        rebindCredentialConfigurationArtifact(input);
      },
      'CREDENTIAL_CONFIGURATION_INVALID',
    ],
    [
      'provider-root path fingerprint drift',
      (input: JsonObject) => {
        const credential = jsonObject(
          input.credentialConfiguration,
          'CREDENTIAL'
        );
        const provider = jsonObject(credential.provider, 'PROVIDER');
        provider.providerRootResolvedPathSha256 = '0'.repeat(64);
        rebindCredentialConfigurationArtifact(input);
      },
      'DIRECTORY_BINDING_INVALID',
    ],
    [
      'Action-003 journal resolved identity drift',
      (input: JsonObject) => {
        const directories = jsonObject(input.directoryBindings, 'DIRECTORIES');
        const fingerprint = jsonObject(
          directories.actionJournalDirectoryFingerprint,
          'ACTION_JOURNAL_FINGERPRINT'
        );
        fingerprint.resolvedPathSha256 = '0'.repeat(64);
      },
      'DIRECTORY_BINDING_INVALID',
    ],
    [
      'credential configuration source content drift',
      (input: JsonObject) => {
        const directories = jsonObject(input.directoryBindings, 'DIRECTORIES');
        const identity = jsonObject(
          directories.credentialConfigurationSourceIdentity,
          'CREDENTIAL_SOURCE_IDENTITY'
        );
        identity.contentSha256 = '0'.repeat(64);
      },
      'CREDENTIAL_CONFIGURATION_SOURCE_IDENTITY_INVALID',
    ],
    [
      'management envelope file identity drift',
      (input: JsonObject) => {
        const credential = jsonObject(
          input.credentialConfiguration,
          'CREDENTIAL'
        );
        const secrets = jsonObject(credential.secrets, 'SECRETS');
        const management = jsonObject(
          secrets.managementAccessToken,
          'MANAGEMENT'
        );
        const identity = jsonObject(
          management.envelopeIdentity,
          'ENVELOPE_IDENTITY'
        );
        identity.contentSha256 = '0'.repeat(64);
        rebindCredentialConfigurationArtifact(input);
      },
      'CREDENTIAL_CONFIGURATION_INVALID',
    ],
    [
      'Management token and database-password envelope identity reuse',
      (input: JsonObject) => {
        const credential = jsonObject(
          input.credentialConfiguration,
          'CREDENTIAL'
        );
        const secrets = jsonObject(credential.secrets, 'SECRETS');
        const management = jsonObject(
          secrets.managementAccessToken,
          'MANAGEMENT'
        );
        const password = jsonObject(
          secrets.databasePassword,
          'DATABASE_PASSWORD'
        );
        password.envelopeSha256 = management.envelopeSha256;
        const managementIdentity = jsonObject(
          management.envelopeIdentity,
          'MANAGEMENT_IDENTITY'
        );
        const passwordIdentity = jsonObject(
          password.envelopeIdentity,
          'PASSWORD_IDENTITY'
        );
        passwordIdentity.device = managementIdentity.device;
        passwordIdentity.inode = managementIdentity.inode;
        passwordIdentity.contentSha256 = management.envelopeSha256;
        rebindCredentialConfigurationArtifact(input);
      },
      'CREDENTIAL_ENVELOPE_IDENTITY_NOT_DISTINCT',
    ],
    [
      'stale pricing evidence',
      (input: JsonObject) => {
        const pricing = jsonObject(input.pricingEvidence, 'PRICING');
        const freshness = jsonObject(pricing.freshness, 'FRESHNESS');
        freshness.freshThrough = '2026-07-27T00:20:00.000Z';
        rebindPricingEvidenceArtifact(input);
      },
      'PRICING_EVIDENCE_NOT_CURRENT_AT_APPROVAL',
    ],
    [
      'pricing evidence older than 24 hours at approval',
      (input: JsonObject) => {
        const pricing = jsonObject(input.pricingEvidence, 'PRICING');
        const sources = pricing.officialSources;
        if (!Array.isArray(sources)) throw new Error('SOURCES_INVALID');
        for (const sourceInput of sources) {
          const source = jsonObject(sourceInput, 'SOURCE');
          source.retrievedAt = '2026-07-25T23:10:00.000Z';
        }
        const freshness = jsonObject(pricing.freshness, 'FRESHNESS');
        freshness.freshThrough = '2026-07-27T23:10:00.000Z';
        rebindPricingEvidenceArtifact(input);
      },
      'PRICING_EVIDENCE_FRESHNESS_INVALID',
    ],
    [
      'expired approval build',
      (input: JsonObject) => {
        const approval = jsonObject(input.approvalRecord, 'APPROVAL_RECORD');
        approval.builtAt = '2026-07-27T01:00:00.000Z';
      },
      'APPROVAL_TIMESTAMP_INVALID',
    ],
    [
      'build before the approval receipt',
      (input: JsonObject) => {
        const approval = jsonObject(input.approvalRecord, 'APPROVAL_RECORD');
        approval.builtAt = '2026-07-26T23:59:59.999Z';
      },
      'APPROVAL_TIMESTAMP_INVALID',
    ],
    [
      'wrong owner principal',
      (input: JsonObject) => {
        const approval = jsonObject(input.approvalRecord, 'APPROVAL_RECORD');
        approval.principalId = 'owner:someone-else';
      },
      'OWNER_IDENTITY_INVALID',
    ],
    [
      'secret-bearing notes',
      (input: JsonObject) => {
        const notes = jsonObject(input.notes, 'NOTES');
        notes.binding =
          'Bearer secret_value_forbidden_in_action003_approval_evidence';
      },
      'SECRET_BEARING_EVIDENCE',
    ],
  ])('rejects %s', (_label, mutate, expectedCode) => {
    const input = makeInput();
    mutate(input);
    expect(() => builder.buildAction003ApprovalArtifacts(input)).toThrow(
      expectedCode
    );
  });

  win('writes a new packet directory once and never overwrites it', () => {
    const ownerPrivateRoot = fs.mkdtempSync(
      path.join(os.homedir(), '.pr12-action003-builder-')
    );
    temporaryDirectories.push(ownerPrivateRoot);
    const output = path.join(ownerPrivateRoot, 'packet');
    const input = makeInput();
    const credentialConfiguration = jsonObject(
      input.credentialConfiguration,
      'CREDENTIAL_CONFIGURATION'
    );
    const initialized = builder.initializeAction003ApprovalOutputCreateNew(
      output,
      credentialConfiguration,
      ownerPrivateRoot
    );
    const directories = jsonObject(input.directoryBindings, 'DIRECTORIES');
    directories.credentialConfigurationSourceIdentity = jsonObject(
      initialized.credentialConfigurationSourceIdentity,
      'CREDENTIAL_SOURCE_IDENTITY'
    );
    const artifacts = builder.buildAction003ApprovalArtifacts(input);

    const written = builder.completeAction003ApprovalOutputCreateNew(
      output,
      artifacts,
      ownerPrivateRoot,
      initialized.outputDirectoryIdentity,
      initialized.ownerPrivateRootIdentity
    );
    const bindingPath = path.join(
      output,
      'source-project-provisioning-binding-v6.json'
    );
    const credentialPath = path.join(
      output,
      'source-project-provisioning-credential-configuration-v2.json'
    );
    const authorizationProjectionPath = path.join(
      output,
      'source-project-provisioning-authorization-projection-v1.json'
    );
    const before = fs.readFileSync(bindingPath);
    expect(written).toMatchObject({ status: 'CREATED', fileCount: 3 });
    expect(fs.readFileSync(credentialPath, 'utf8')).toBe(
      `${canonicalJson(artifacts.credentialConfiguration)}\n`
    );
    expect(fs.readFileSync(authorizationProjectionPath, 'utf8')).toBe(
      `${canonicalJson(artifacts.authorizationProjection)}\n`
    );
    const verified = builder.verifyAction003ApprovalOutput(
      output,
      artifacts,
      ownerPrivateRoot,
      initialized.outputDirectoryIdentity,
      initialized.ownerPrivateRootIdentity
    );
    expect(verified).toMatchObject({
      status: 'VERIFIED',
      fileCount: 3,
    });
    expect(verified.bindingSha256).toBe(artifacts.summary.bindingSha256);
    expect(() =>
      builder.initializeAction003ApprovalOutputCreateNew(
        output,
        credentialConfiguration,
        ownerPrivateRoot
      )
    ).toThrow('OUTPUT_DIRECTORY_ALREADY_EXISTS');
    expect(fs.readFileSync(bindingPath)).toEqual(before);
  });

  win('rejects a changed packet after durable canonical readback', () => {
    const ownerPrivateRoot = fs.mkdtempSync(
      path.join(os.homedir(), '.pr12-action003-builder-tamper-')
    );
    temporaryDirectories.push(ownerPrivateRoot);
    const output = path.join(ownerPrivateRoot, 'packet');
    const input = makeInput();
    const credentialConfiguration = jsonObject(
      input.credentialConfiguration,
      'CREDENTIAL_CONFIGURATION'
    );
    const initialized = builder.initializeAction003ApprovalOutputCreateNew(
      output,
      credentialConfiguration,
      ownerPrivateRoot
    );
    const directories = jsonObject(input.directoryBindings, 'DIRECTORIES');
    directories.credentialConfigurationSourceIdentity = jsonObject(
      initialized.credentialConfigurationSourceIdentity,
      'CREDENTIAL_SOURCE_IDENTITY'
    );
    const artifacts = builder.buildAction003ApprovalArtifacts(input);
    builder.completeAction003ApprovalOutputCreateNew(
      output,
      artifacts,
      ownerPrivateRoot,
      initialized.outputDirectoryIdentity,
      initialized.ownerPrivateRootIdentity
    );
    fs.appendFileSync(
      path.join(output, 'source-project-provisioning-binding-v6.json'),
      ' ',
      'utf8'
    );
    expect(() =>
      builder.verifyAction003ApprovalOutput(
        output,
        artifacts,
        ownerPrivateRoot,
        initialized.outputDirectoryIdentity,
        initialized.ownerPrivateRootIdentity
      )
    ).toThrow('OUTPUT_BINDING_READBACK_INVALID');
  });

  win('rejects output identity drift before packet completion', () => {
    const ownerPrivateRoot = fs.mkdtempSync(
      path.join(os.homedir(), '.pr12-action003-builder-identity-')
    );
    temporaryDirectories.push(ownerPrivateRoot);
    const output = path.join(ownerPrivateRoot, 'packet');
    const input = makeInput();
    const credentialConfiguration = jsonObject(
      input.credentialConfiguration,
      'CREDENTIAL_CONFIGURATION'
    );
    const initialized = builder.initializeAction003ApprovalOutputCreateNew(
      output,
      credentialConfiguration,
      ownerPrivateRoot
    );
    const directories = jsonObject(input.directoryBindings, 'DIRECTORIES');
    directories.credentialConfigurationSourceIdentity = jsonObject(
      initialized.credentialConfigurationSourceIdentity,
      'CREDENTIAL_SOURCE_IDENTITY'
    );
    const artifacts = builder.buildAction003ApprovalArtifacts(input);
    const changedIdentity = {
      ...jsonObject(
        initialized.outputDirectoryIdentity,
        'OUTPUT_DIRECTORY_IDENTITY'
      ),
      inode: '999999',
    };
    expect(() =>
      builder.completeAction003ApprovalOutputCreateNew(
        output,
        artifacts,
        ownerPrivateRoot,
        changedIdentity,
        initialized.ownerPrivateRootIdentity
      )
    ).toThrow('OUTPUT_DIRECTORY_CHANGED');
    expect(fs.readdirSync(output)).toEqual([
      'source-project-provisioning-credential-configuration-v2.json',
    ]);
  });

  test('rejects repository and temporary output boundaries', () => {
    const input = makeInput();
    const credentialConfiguration = jsonObject(
      input.credentialConfiguration,
      'CREDENTIAL_CONFIGURATION'
    );
    expect(() =>
      builder.initializeAction003ApprovalOutputCreateNew(
        path.join(repoRoot, 'forbidden-action003-packet'),
        credentialConfiguration,
        repoRoot
      )
    ).toThrow('OUTPUT_DIRECTORY_BOUNDARY_INVALID');
    expect(() =>
      builder.initializeAction003ApprovalOutputCreateNew(
        path.join(os.tmpdir(), 'forbidden-action003-packet'),
        credentialConfiguration,
        os.tmpdir()
      )
    ).toThrow('OUTPUT_DIRECTORY_BOUNDARY_INVALID');
  });

  test('rejects ambient Supabase credentials before building', () => {
    const input = makeInput();
    const runtimeBoundary = jsonObject(
      input.runtimeBoundary,
      'RUNTIME_BOUNDARY'
    );
    runtimeBoundary.ambientCredentialNames = ['SUPABASE_ACCESS_TOKEN'];
    expect(() => builder.buildAction003ApprovalArtifacts(input)).toThrow(
      'AMBIENT_CREDENTIAL_FORBIDDEN'
    );
  });

  test('contains no remote transport or credential retrieval path', () => {
    const source = fs.readFileSync(builderPath, 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain('retrieveClaimBoundCredentials');
    expect(source).not.toContain('buildCredentialBrokerRequest');
    expect(source).not.toContain('performOrganizationIdentityCaptureRequest');
  });
});
