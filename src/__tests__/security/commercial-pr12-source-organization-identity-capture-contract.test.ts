/** @jest-environment node */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(__dirname, '../../..');
const contractPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs'
);
const wrapperPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs'
);
const verifierPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs'
);
const dpapiChannelPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-windows-dpapi-credential-channel.mjs'
);
const dpapiBrokerPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1'
);
const evidenceRoot = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12'
);
const contractUrl = pathToFileURL(contractPath).href;
const wrapperUrl = pathToFileURL(wrapperPath).href;
const verifierUrl = pathToFileURL(verifierPath).href;
const dpapiChannelUrl = pathToFileURL(dpapiChannelPath).href;

const endpoint =
  'https://api.supabase.com/v1/organizations/kbnsntifrawhimhfjrug';
const baseCommit = '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab';

type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null;

interface HarnessResult {
  ok: boolean;
  code?: string;
  value?: unknown;
}

function isHarnessResult(value: unknown): value is HarnessResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.ok === 'boolean' &&
    (candidate.code === undefined || typeof candidate.code === 'string')
  );
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

function canonicalJson(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalSha256(value: JsonValue): string {
  return createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}

function invokeModule(
  moduleUrl: string,
  method: string,
  args: JsonValue[]
): HarnessResult {
  const harness = `
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const module = await import(input.moduleUrl);
    try {
      const value = await module[input.method](...input.args);
      process.stdout.write(JSON.stringify({ ok: true, value }));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' ? error.code : 'UNEXPECTED_ERROR';
      process.stdout.write(JSON.stringify({ ok: false, code }));
      process.exitCode = 2;
    }
  `;
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', harness],
    {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
      input: JSON.stringify({ moduleUrl, method, args }),
      encoding: 'utf8',
    }
  );
  expect(child.stderr).toBe('');
  const parsed: unknown = JSON.parse(child.stdout);
  expect(isHarnessResult(parsed)).toBe(true);
  if (!isHarnessResult(parsed)) {
    throw new Error('organization capture harness returned an invalid result');
  }
  return parsed;
}

function invokeContract(method: string, args: JsonValue[]): HarnessResult {
  return invokeModule(contractUrl, method, args);
}

function makeValidFixture() {
  const approvedRequestProjection = {
    bodyPresent: false,
    method: 'GET',
    url: endpoint,
  };
  const credentialConfiguration = {
    schemaVersion: 2,
    resultType: 'SOURCE_PROJECT_PROVISIONING_CREDENTIAL_CONFIGURATION',
    status: 'READY',
    provider: {
      providerId: 'WINDOWS_DPAPI_CURRENT_USER_V1',
      configurationId: 'pr12-source-provisioning-dpapi-v1',
      retrievalChannel: 'CLAIM_BOUND_CAPTURED_STDOUT_BINARY_V1',
      ownerApproved: true,
      protectionScope: 'CURRENT_USER',
      ownerSidSha256: '1'.repeat(64),
      machineNameSha256: '2'.repeat(64),
      providerRoot: 'C:\\PR12\\credentials',
      providerRootPathSha256: '3'.repeat(64),
      providerRootResolvedPathSha256: '4'.repeat(64),
    },
    runtime: {
      bootstrapScriptSha256: '5'.repeat(64),
    },
    protocol: {
      requestMaximumBytes: 16_384,
      responseMaximumBytes: 8_192,
    },
    secrets: {
      managementAccessToken: {
        role: 'MANAGEMENT_ACCESS_TOKEN',
        credentialType: 'SUPABASE_FINE_GRAINED_ACCESS_TOKEN',
        opaqueHandle:
          'windows-dpapi-cu://pr12-source-project/management-access-token/v1',
        opaqueHandleSha256: '6'.repeat(64),
        envelopeFilename: `${'6'.repeat(64)}.dpapi.json`,
        envelopeSha256: '7'.repeat(64),
        requiredEndpointOAuthScopes: ['organizations:read'],
        requiredFineGrainedPermissions: ['organization_admin_read'],
        minimumBytes: 20,
        maximumBytes: 4096,
      },
      databasePassword: {
        role: 'DATABASE_PASSWORD',
        opaqueHandle:
          'windows-dpapi-cu://pr12-source-project/database-password/v1',
        opaqueHandleSha256: '8'.repeat(64),
        envelopeFilename: `${'8'.repeat(64)}.dpapi.json`,
        envelopeSha256: '9'.repeat(64),
        minimumBytes: 32,
        maximumBytes: 256,
      },
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
    },
    bootstrap: {
      realCredentialBootstrapCompleted: true,
      separateInteractiveAuthorizationRequired: true,
    },
  };
  const binding = {
    schemaVersion: 1,
    phase: 'SOURCE_ORGANIZATION_IDENTITY_CAPTURE',
    status: 'APPROVED_NOT_RUN',
    authorization: {
      organizationIdentityCaptureAuthorized: true,
      sourceProjectProvisioningAuthorized: false,
      sourceProjectCreationAuthorized: false,
      productionProjectDirectContactAuthorized: false,
      databaseConnectionAuthorized: false,
      phase2AndLaterAuthorized: false,
      readyTransitionAuthorized: false,
      mergeAuthorized: false,
      commercialReleaseAuthorized: false,
    },
    action: {
      actionId: 'PR12-ACTION-002',
      endpoint,
      httpMethod: 'GET',
      maximumRemoteContactCount: 1,
      maximumRequestAttempts: 1,
      automaticRetryAllowed: false,
      redirectAllowed: false,
      requestBodyAllowed: false,
      requestTimeoutMilliseconds: 10_000,
      remoteContact: true,
      mutating: false,
      mutationScope: 'NONE',
      mandatoryStopAfterEvidenceSeal: true,
    },
    approvedRequest: {
      projection: approvedRequestProjection,
      sha256: canonicalSha256(approvedRequestProjection),
    },
    target: {
      gitCommit: 'a'.repeat(40),
      baseCommit,
      cleanWorktreeRequired: true,
    },
    governance: {
      path: 'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml',
      sha256: 'b'.repeat(64),
    },
    implementationContracts: {
      contractPath:
        'scripts/commercial-hardening/pr12-source-organization-identity-capture-contract.mjs',
      contractSha256: 'c'.repeat(64),
      sharedProvisioningContractPath:
        'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs',
      sharedProvisioningContractSha256: '7'.repeat(64),
      wrapperPath:
        'scripts/commercial-hardening/run-pr12-source-organization-identity-capture.mjs',
      wrapperSha256: 'd'.repeat(64),
      credentialChannelPath:
        'scripts/commercial-hardening/pr12-windows-dpapi-credential-channel.mjs',
      credentialChannelSha256: 'e'.repeat(64),
      credentialBrokerPath:
        'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1',
      credentialBrokerSha256: 'f'.repeat(64),
      evidenceVerifierPath:
        'scripts/commercial-hardening/verify-pr12-source-organization-identity-capture-evidence.mjs',
      evidenceVerifierSha256: '0'.repeat(64),
    },
    runtimeControls: {
      requiredNodeMajor: 24,
      processExecArgvMustBeEmpty: true,
      runtimeRecordedInEvidence: true,
    },
    credentialControls: {
      credentialConfigurationPath:
        'source-project-provisioning-credential-configuration-v2.json',
      credentialConfigurationSha256: '1'.repeat(64),
      requiredProviderId: 'WINDOWS_DPAPI_CURRENT_USER_V1',
      requiredRetrievalChannel: 'CLAIM_BOUND_CAPTURED_STDOUT_BINARY_V1',
      managementAccessTokenRetrievalAllowed: true,
      databasePasswordRetrievalAllowed: false,
      credentialBootstrapCompleted: true,
      credentialRetrievalAfterDurableClaimOnly: true,
      secretValuesCaptured: false,
    },
    expectedOrganization: {
      organizationId: 'DISCOVER_FROM_APPROVED_RESPONSE',
      organizationIdCaptureMode: 'DISCOVER_ONCE_BIND_FUTURE_PR12_ACTION_003',
      organizationName: "IFs1991's Org",
      organizationSlug: 'kbnsntifrawhimhfjrug',
      organizationPlan: 'PRO',
    },
    productionBoundary: {
      productionProjectRef: 'qnanuoqveidwvacvbhqp',
      productionProjectOrigin: 'https://qnanuoqveidwvacvbhqp.supabase.co',
      organizationProjectEnumerationAuthorized: false,
      productionProjectSpecificManagementApiContactAuthorized: false,
      productionProjectDataPlaneContactAuthorized: false,
      productionDatabaseContactAuthorized: false,
      productionCredentialAccessAuthorized: false,
    },
    ownerControl: {
      mode: 'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1',
      principalDisplayName: 'FUTOSHI IWASAWA',
      principalId: 'owner:futoshi-iwasawa',
      principalIdType: 'OWNER_DECLARED_STABLE_PRINCIPAL_ID',
      operator: 'owner:futoshi-iwasawa',
      approver: 'owner:futoshi-iwasawa',
      identitySeparationAvailable: false,
      independentHumanReviewClaimed: false,
      soleOperatorSelfApprovalRiskAccepted: true,
      sameUserDpapiCredentialExposureRiskAccepted: true,
      minimumCoolingOffSeconds: 300,
      maximumApprovalWindowSeconds: 1800,
    },
    journalAndEvidence: {
      journalDirectoryPathSha256: '2'.repeat(64),
      journalDirectoryResolvedPathSha256: '3'.repeat(64),
      journalDirectoryDevice: '101',
      journalDirectoryInode: '102',
      evidenceParentDirectoryPathSha256: '4'.repeat(64),
      evidenceParentDirectoryResolvedPathSha256: '5'.repeat(64),
      evidenceParentDirectoryDevice: '201',
      evidenceParentDirectoryInode: '202',
      directoriesMustBeDisjoint: true,
      strictAclRequired: true,
    },
    evidenceContract: {
      requiredFiles: [
        'action-events.json',
        'organization-identity-capture-result.json',
        'privacy-scan.json',
        'provider-export.safe.json',
        'manifest.json',
        'manifest.sha256',
      ],
      rawProviderBodiesPersisted: false,
      rawHttpHeadersPersisted: false,
      secretFreeProjectionOnly: true,
      privacyAndSecretScanRequired: true,
      sha256ManifestRequired: true,
      atomicPartialThenRenameRequired: true,
      automaticResealAllowed: false,
      remoteRecoveryAllowed: false,
    },
    approval: {
      evidencePath: 'owner-private/pr12-action-002-approval.json',
      evidenceSha256: '6'.repeat(64),
    },
    notes: 'Synthetic approved fixture. No remote contact is performed.',
  };
  const bindingMaterial = {
    schemaVersion: binding.schemaVersion,
    phase: binding.phase,
    action: binding.action,
    authorization: binding.authorization,
    approvedRequest: binding.approvedRequest,
    target: binding.target,
    governance: binding.governance,
    implementationContracts: binding.implementationContracts,
    runtimeControls: binding.runtimeControls,
    credentialControls: binding.credentialControls,
    expectedOrganization: binding.expectedOrganization,
    productionBoundary: binding.productionBoundary,
    ownerControl: binding.ownerControl,
    journalAndEvidence: binding.journalAndEvidence,
    evidenceContract: binding.evidenceContract,
  };
  const approval = {
    schemaVersion: 1,
    recordType: 'PR12_SOURCE_ORGANIZATION_IDENTITY_CAPTURE_APPROVAL',
    actionId: 'PR12-ACTION-002',
    decision: 'APPROVED',
    attestationStatus: 'VERIFIED',
    approvedBy: 'owner:futoshi-iwasawa',
    approvedAt: '2026-07-25T00:00:00.000Z',
    operatorReconfirmedAt: '2026-07-25T00:05:00.000Z',
    expiresAt: '2026-07-25T00:20:00.000Z',
    approvedGitCommit: binding.target.gitCommit,
    approvedEndpoint: endpoint,
    approvedBindingMaterialSha256: canonicalSha256(bindingMaterial),
    approvedCredentialConfigurationSha256:
      binding.credentialControls.credentialConfigurationSha256,
    maximumRemoteContactCount: 1,
    maximumRequestAttempts: 1,
    automaticRetryAllowed: false,
    redirectAllowed: false,
    requestBodyAllowed: false,
    tokenOnlyCredentialRetrievalAuthorized: true,
    databasePasswordRetrievalAuthorized: false,
    sourceProjectProvisioningAuthorized: false,
    productionProjectDirectContactAuthorized: false,
    soleOperatorSelfApprovalRiskAccepted: true,
    sameUserDpapiCredentialExposureRiskAccepted: true,
    productionContactProhibitionAcknowledged: true,
  };
  const context = {
    currentGitHead: binding.target.gitCommit,
    baseCommitIsAncestor: true,
    gitWorktreeClean: true,
    contractSha256: binding.implementationContracts.contractSha256,
    sharedProvisioningContractSha256:
      binding.implementationContracts.sharedProvisioningContractSha256,
    wrapperSha256: binding.implementationContracts.wrapperSha256,
    credentialChannelSha256:
      binding.implementationContracts.credentialChannelSha256,
    credentialBrokerSha256:
      binding.implementationContracts.credentialBrokerSha256,
    evidenceVerifierSha256:
      binding.implementationContracts.evidenceVerifierSha256,
    governanceSha256: binding.governance.sha256,
    credentialConfigurationSha256:
      binding.credentialControls.credentialConfigurationSha256,
    approvalEvidenceSha256: binding.approval.evidenceSha256,
    journalDirectoryPathSha256:
      binding.journalAndEvidence.journalDirectoryPathSha256,
    journalDirectoryResolvedPathSha256:
      binding.journalAndEvidence.journalDirectoryResolvedPathSha256,
    journalDirectoryDevice: binding.journalAndEvidence.journalDirectoryDevice,
    journalDirectoryInode: binding.journalAndEvidence.journalDirectoryInode,
    evidenceParentDirectoryPathSha256:
      binding.journalAndEvidence.evidenceParentDirectoryPathSha256,
    evidenceParentDirectoryResolvedPathSha256:
      binding.journalAndEvidence.evidenceParentDirectoryResolvedPathSha256,
    evidenceParentDirectoryDevice:
      binding.journalAndEvidence.evidenceParentDirectoryDevice,
    evidenceParentDirectoryInode:
      binding.journalAndEvidence.evidenceParentDirectoryInode,
    now: '2026-07-25T00:06:00.000Z',
    environment: {},
  };
  return { binding, credentialConfiguration, approval, context };
}

function expectOfflineRejected(
  fixture: ReturnType<typeof makeValidFixture>,
  code: string
) {
  expect(
    invokeContract('validateOrganizationIdentityCaptureOffline', [
      fixture.binding,
      fixture.credentialConfiguration,
      fixture.approval,
      fixture.context,
    ])
  ).toEqual({ ok: false, code });
}

function writeCanonicalArtifact(
  directory: string,
  filename: string,
  value: JsonValue
) {
  const contents = `${canonicalJson(value)}\n`;
  fs.writeFileSync(path.join(directory, filename), contents, 'utf8');
  return {
    path: filename,
    bytes: Buffer.byteLength(contents, 'utf8'),
    sha256: createHash('sha256').update(contents, 'utf8').digest('hex'),
    classification: [
      'provider-export.safe.json',
      'organization-identity-capture-result.json',
    ].includes(filename)
      ? 'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS'
      : 'INTERNAL_NO_PII',
  };
}

function readJsonObject(filename: string): JsonObject {
  const parsed: unknown = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!isJsonObject(parsed)) {
    throw new Error(`expected JSON object: ${filename}`);
  }
  return parsed;
}

function makeSyntheticEvidenceBundle(
  organizationId = 'org-source-001'
): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pr12-org-identity-evidence-')
  );
  const at = '2026-07-25T00:10:00.000Z';
  const projection = {
    organizationId,
    organizationName: "IFs1991's Org",
    organizationSlug: 'kbnsntifrawhimhfjrug',
    plan: 'PRO',
  };
  const projectionSha256 = canonicalSha256(projection);
  const productionBoundary = {
    organizationProjectEnumerationPerformed: false,
    productionProjectSpecificManagementApiContactCount: 0,
    productionProjectDataPlaneContactCount: 0,
    productionDatabaseContactCount: 0,
    productionCredentialAccessCount: 0,
  };
  const metadata = [
    writeCanonicalArtifact(directory, 'action-events.json', {
      schemaVersion: 1,
      actionId: 'PR12-ACTION-002',
      outcome: 'PASS',
      events: [
        {
          sequence: 1,
          state: 'CLAIMED_GET_NOT_SENT',
          at,
          remoteContactCount: 0,
          requestAttemptCount: 0,
          automaticRetryCount: 0,
        },
        {
          sequence: 2,
          state: 'GET_INTENT_DURABLE',
          at,
          remoteContactCount: 0,
          requestAttemptCount: 0,
          automaticRetryCount: 0,
        },
        {
          sequence: 3,
          state: 'RESPONSE_ACCEPTED',
          at,
          remoteContactCount: 1,
          requestAttemptCount: 1,
          automaticRetryCount: 0,
        },
        {
          sequence: 4,
          state: 'ORGANIZATION_IDENTITY_CAPTURED',
          at,
          remoteContactCount: 1,
          requestAttemptCount: 1,
          automaticRetryCount: 0,
        },
      ],
    }),
    writeCanonicalArtifact(
      directory,
      'organization-identity-capture-result.json',
      {
        schemaVersion: 1,
        resultType: 'SOURCE_ORGANIZATION_IDENTITY_CAPTURE_OPERATION',
        status: 'PASS',
        outcome: 'PASS',
        actionId: 'PR12-ACTION-002',
        gitCommit: 'a'.repeat(40),
        baseCommit,
        bindingMaterialSha256: 'b'.repeat(64),
        requestSha256: 'c'.repeat(64),
        credentialConfigurationSha256: 'd'.repeat(64),
        approvalEvidenceSha256: 'e'.repeat(64),
        claimSha256: 'f'.repeat(64),
        getIntentSha256: '0'.repeat(64),
        approvalWindow: {
          approvedAt: '2026-07-25T00:00:00.000Z',
          operatorReconfirmedAt: '2026-07-25T00:05:00.000Z',
          expiresAt: '2026-07-25T00:20:00.000Z',
          approvedBy: 'owner:futoshi-iwasawa',
        },
        ownerControl: {
          mode: 'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1',
          operator: 'owner:futoshi-iwasawa',
          approver: 'owner:futoshi-iwasawa',
          identitySeparationAvailable: false,
          independentHumanReviewClaimed: false,
          soleOperatorSelfApprovalRiskAccepted: true,
          sameUserDpapiCredentialExposureRiskAccepted: true,
        },
        request: {
          method: 'GET',
          endpoint,
          bodyPresent: false,
          redirectAllowed: false,
        },
        contact: {
          remoteContactCount: 1,
          requestAttemptCount: 1,
          automaticRetryCount: 0,
        },
        organization: projection,
        providerObservation: {
          httpStatus: 200,
          bodySha256: '1'.repeat(64),
          safeProjectionSha256: projectionSha256,
          observedAt: at,
        },
        productionBoundary,
        credential: {
          brokerMode: 'ORGANIZATION_IDENTITY_CAPTURE',
          brokerInvocationCount: 1,
          managementAccessTokenRetrieved: true,
          databasePasswordRetrieved: false,
          ambientCredentialFallbackUsed: false,
          secretPersisted: false,
        },
        rawProviderBodiesPersisted: false,
        rawHttpHeadersPersisted: false,
        runtime: {
          nodeVersion: 'v24.0.0',
          processExecArgvCount: 0,
        },
        startedAt: at,
        completedAt: at,
        reasonCode: null,
        mandatoryStopObserved: true,
      }
    ),
    writeCanonicalArtifact(directory, 'provider-export.safe.json', {
      schemaVersion: 1,
      exportType: 'SUPABASE_SOURCE_ORGANIZATION_IDENTITY_SAFE_PROJECTION',
      status: 'PASS',
      actionId: 'PR12-ACTION-002',
      request: {
        method: 'GET',
        endpoint,
        bodyPresent: false,
        rawHttpHeadersPersisted: false,
      },
      response: {
        httpStatus: 200,
        bodySha256: '1'.repeat(64),
        safeProjectionSha256: projectionSha256,
        safeProjection: projection,
        observedAt: at,
      },
      productionBoundary,
      rawProviderBodiesPersisted: false,
      capturedAt: at,
      capturedBy: 'owner:futoshi-iwasawa',
    }),
    writeCanonicalArtifact(directory, 'privacy-scan.json', {
      schemaVersion: 1,
      scanType:
        'PR12_SOURCE_ORGANIZATION_IDENTITY_CAPTURE_PRIVACY_AND_SECRET_SCAN',
      status: 'PASS',
      scanner: 'pr12-source-organization-identity-capture-contract-v1',
      rawProviderBodiesPersisted: false,
      rawHttpHeadersPersisted: false,
      runtimeSecretValuesComparedAgainstArtifacts: true,
      runtimeSecretValueCount: 1,
      scanMode: 'RUNTIME_TOKEN_AND_STATIC_MARKER_EXACT_SUBSTRING_SCAN',
      scannedArtifacts: [
        'action-events.json',
        'organization-identity-capture-result.json',
        'provider-export.safe.json',
      ],
      scannedAt: at,
    }),
  ];
  const manifestContents = `${canonicalJson({
    schemaVersion: 1,
    manifestType: 'PR12_SOURCE_ORGANIZATION_IDENTITY_CAPTURE_EVIDENCE',
    status: 'PASS',
    actionId: 'PR12-ACTION-002',
    gitCommit: 'a'.repeat(40),
    bindingMaterialSha256: 'b'.repeat(64),
    requestSha256: 'c'.repeat(64),
    artifacts: metadata,
    artifactCount: metadata.length,
    rawProviderBodiesPersisted: false,
    rawHttpHeadersPersisted: false,
    sealedAt: at,
  })}\n`;
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    manifestContents,
    'utf8'
  );
  fs.writeFileSync(
    path.join(directory, 'manifest.sha256'),
    `${createHash('sha256').update(manifestContents, 'utf8').digest('hex')}\n`,
    'utf8'
  );
  return directory;
}

function makeSyntheticPartialEvidenceBundle(): string {
  const directory = makeSyntheticEvidenceBundle();
  const events = readJsonObject(path.join(directory, 'action-events.json'));
  const eventList = events.events;
  if (!Array.isArray(eventList) || !isJsonObject(eventList[0])) {
    throw new Error('synthetic action event shape is invalid');
  }
  events.outcome = 'PARTIAL_FAILURE';
  events.events = [eventList[0]];

  const result = readJsonObject(
    path.join(directory, 'organization-identity-capture-result.json')
  );
  result.status = 'PARTIAL_FAILURE';
  result.outcome = 'PARTIAL_FAILURE';
  result.getIntentSha256 = null;
  result.organization = null;
  result.providerObservation = null;
  result.reasonCode = 'PRE_BROKER_REVALIDATION_FAILED';
  const contact = result.contact;
  const credential = result.credential;
  if (!isJsonObject(contact) || !isJsonObject(credential)) {
    throw new Error('synthetic partial result shape is invalid');
  }
  contact.remoteContactCount = 0;
  contact.requestAttemptCount = 0;
  credential.brokerInvocationCount = 0;
  credential.managementAccessTokenRetrieved = false;

  const provider = readJsonObject(
    path.join(directory, 'provider-export.safe.json')
  );
  provider.status = 'PARTIAL_FAILURE';
  provider.response = null;

  const privacy = readJsonObject(path.join(directory, 'privacy-scan.json'));
  privacy.status = 'PARTIAL_FAILURE';
  privacy.runtimeSecretValueCount = 0;
  privacy.scanMode = 'STATIC_MARKER_EXACT_SUBSTRING_SCAN';

  const metadata = [
    ['action-events.json', events],
    ['organization-identity-capture-result.json', result],
    ['provider-export.safe.json', provider],
    ['privacy-scan.json', privacy],
  ].map(([filename, value]) => {
    if (typeof filename !== 'string' || !isJsonObject(value)) {
      throw new Error('synthetic artifact update is invalid');
    }
    return writeCanonicalArtifact(directory, filename, value);
  });
  const manifestContents = `${canonicalJson({
    schemaVersion: 1,
    manifestType: 'PR12_SOURCE_ORGANIZATION_IDENTITY_CAPTURE_EVIDENCE',
    status: 'PARTIAL_FAILURE',
    actionId: 'PR12-ACTION-002',
    gitCommit: 'a'.repeat(40),
    bindingMaterialSha256: 'b'.repeat(64),
    requestSha256: 'c'.repeat(64),
    artifacts: metadata,
    artifactCount: metadata.length,
    rawProviderBodiesPersisted: false,
    rawHttpHeadersPersisted: false,
    sealedAt: '2026-07-25T00:10:00.000Z',
  })}\n`;
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    manifestContents,
    'utf8'
  );
  fs.writeFileSync(
    path.join(directory, 'manifest.sha256'),
    `${createHash('sha256').update(manifestContents, 'utf8').digest('hex')}\n`,
    'utf8'
  );
  return directory;
}

function rewriteSyntheticEvidenceBundle(
  directory: string,
  status: string,
  sealedAt: string
): void {
  const metadata = [
    'action-events.json',
    'organization-identity-capture-result.json',
    'provider-export.safe.json',
    'privacy-scan.json',
  ].map(filename =>
    writeCanonicalArtifact(
      directory,
      filename,
      readJsonObject(path.join(directory, filename))
    )
  );
  const manifestContents = `${canonicalJson({
    schemaVersion: 1,
    manifestType: 'PR12_SOURCE_ORGANIZATION_IDENTITY_CAPTURE_EVIDENCE',
    status,
    actionId: 'PR12-ACTION-002',
    gitCommit: 'a'.repeat(40),
    bindingMaterialSha256: 'b'.repeat(64),
    requestSha256: 'c'.repeat(64),
    artifacts: metadata,
    artifactCount: metadata.length,
    rawProviderBodiesPersisted: false,
    rawHttpHeadersPersisted: false,
    sealedAt,
  })}\n`;
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    manifestContents,
    'utf8'
  );
  fs.writeFileSync(
    path.join(directory, 'manifest.sha256'),
    `${createHash('sha256').update(manifestContents, 'utf8').digest('hex')}\n`,
    'utf8'
  );
}

function makeSyntheticUnknownEvidenceBundle(): string {
  const directory = makeSyntheticEvidenceBundle();
  const completedAt = '2026-07-25T00:11:00.000Z';
  const events = readJsonObject(path.join(directory, 'action-events.json'));
  const eventList = events.events;
  if (
    !Array.isArray(eventList) ||
    !isJsonObject(eventList[0]) ||
    !isJsonObject(eventList[1])
  ) {
    throw new Error('synthetic unknown event shape is invalid');
  }
  events.outcome = 'UNKNOWN_REMOTE_OUTCOME';
  events.events = [
    eventList[0],
    eventList[1],
    {
      sequence: 3,
      state: 'GET_ATTEMPT_TERMINATED_WITHOUT_ACCEPTED_RESPONSE',
      at: completedAt,
      remoteContactCount: 1,
      requestAttemptCount: 1,
      automaticRetryCount: 0,
    },
  ];
  const result = readJsonObject(
    path.join(directory, 'organization-identity-capture-result.json')
  );
  result.status = 'UNKNOWN_REMOTE_OUTCOME';
  result.outcome = 'UNKNOWN_REMOTE_OUTCOME';
  result.organization = null;
  result.providerObservation = null;
  result.reasonCode = 'ORGANIZATION_IDENTITY_RESPONSE_NOT_OBSERVED';
  result.completedAt = completedAt;
  const provider = readJsonObject(
    path.join(directory, 'provider-export.safe.json')
  );
  provider.status = 'UNKNOWN_REMOTE_OUTCOME';
  provider.response = null;
  provider.capturedAt = completedAt;
  const privacy = readJsonObject(path.join(directory, 'privacy-scan.json'));
  privacy.status = 'UNKNOWN_REMOTE_OUTCOME';
  privacy.scannedAt = '2026-07-25T00:12:00.000Z';
  writeCanonicalArtifact(directory, 'action-events.json', events);
  writeCanonicalArtifact(
    directory,
    'organization-identity-capture-result.json',
    result
  );
  writeCanonicalArtifact(directory, 'provider-export.safe.json', provider);
  writeCanonicalArtifact(directory, 'privacy-scan.json', privacy);
  rewriteSyntheticEvidenceBundle(
    directory,
    'UNKNOWN_REMOTE_OUTCOME',
    '2026-07-25T00:13:00.000Z'
  );
  return directory;
}

function runFetchHarness(mode: 'success' | 'failure' | 'expired') {
  const harness = `
    const wrapper = await import(${JSON.stringify(wrapperUrl)});
    const mode = process.argv[2];
    let fetchCount = 0;
    let contactCount = 0;
    let request = null;
    const token = 's'.repeat(40);
    const fetchImplementation = async (url, options) => {
      fetchCount += 1;
      request = {
        url,
        method: options.method,
        redirect: options.redirect,
        hasExpectedAuthorization: options.headers.Authorization === \`Bearer \${token}\`,
        accept: options.headers.Accept,
        bodyPresent: Object.hasOwn(options, 'body')
      };
      if (mode === 'failure') throw new Error('synthetic network failure');
      return { synthetic: true };
    };
    try {
      await wrapper.performOrganizationIdentityCaptureRequest({
        accessToken: token,
        timeoutMilliseconds: 5000,
        approvalExpiresAt:
          mode === 'expired'
            ? '2000-01-01T00:00:00.000Z'
            : '2999-01-01T00:00:00.000Z',
        onRemoteContact: () => { contactCount += 1; },
        fetchImplementation
      });
      process.stdout.write(JSON.stringify({ ok: true, fetchCount, contactCount, request }));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' ? error.code : 'UNEXPECTED_ERROR';
      process.stdout.write(JSON.stringify({ ok: false, code, fetchCount, contactCount, request }));
    }
  `;
  const harnessDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pr12-org-fetch-harness-')
  );
  const harnessPath = path.join(harnessDirectory, 'fetch-harness.mjs');
  fs.writeFileSync(harnessPath, harness, 'utf8');
  try {
    const child = spawnSync(process.execPath, [harnessPath, mode], {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
      encoding: 'utf8',
    });
    expect(child.stderr).toBe('');
    const result: unknown = JSON.parse(child.stdout);
    expect(typeof result).toBe('object');
    return result;
  } finally {
    fs.rmSync(harnessDirectory, { recursive: true, force: true });
  }
}

function runResponseHarness(
  mode:
    | 'valid'
    | 'duplicate-members'
    | 'production-ref'
    | 'extra-field'
    | 'wrong-content-type'
    | 'oversize'
    | 'redirect'
) {
  const harness = `
    const wrapper = await import(${JSON.stringify(wrapperUrl)});
    const mode = process.argv[1];
    const valid = {
      id: 'org-source-001',
      name: "IFs1991's Org",
      plan: 'pro',
      opt_in_tags: [],
      allowed_release_channels: ['ga']
    };
    const body = mode === 'extra-field'
      ? JSON.stringify({ ...valid, unexpected: true })
      : mode === 'duplicate-members'
        ? '{"id":"org-shadowed","id":"org-source-001","name":"IFs1991\\'s Org","plan":"free","plan":"pro","opt_in_tags":[],"allowed_release_channels":["ga"]}'
        : mode === 'production-ref'
          ? JSON.stringify({ ...valid, opt_in_tags: ['qnanuoqveidwvacvbhqp'] })
          : JSON.stringify(valid);
    const chunks = mode === 'oversize'
      ? [new Uint8Array(65537)]
      : [new TextEncoder().encode(body)];
    let index = 0;
    const response = {
      status: mode === 'redirect' ? 302 : 200,
      headers: {
        get(name) {
          if (name.toLowerCase() !== 'content-type') return null;
          return mode === 'wrong-content-type'
            ? 'text/plain'
            : 'application/json';
        }
      },
      body: {
        getReader() {
          return {
            async read() {
              if (index >= chunks.length) {
                return { done: true, value: undefined };
              }
              const value = chunks[index];
              index += 1;
              return { done: false, value };
            },
            releaseLock() {}
          };
        }
      }
    };
    try {
      const value = await wrapper.readBoundedOrganizationIdentityResponse(response);
      process.stdout.write(JSON.stringify({ ok: true, value }));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' ? error.code : 'UNEXPECTED_ERROR';
      process.stdout.write(JSON.stringify({ ok: false, code }));
    }
  `;
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', harness, mode],
    {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
      encoding: 'utf8',
    }
  );
  expect(child.stderr).toBe('');
  const result: unknown = JSON.parse(child.stdout);
  expect(typeof result).toBe('object');
  return result;
}

function runIntegratedAttemptHarness(
  mode: 'network' | 'timeout' | 'non-200' | 'oversize' | 'invalid-schema'
) {
  const harness = `
    const wrapper = await import(${JSON.stringify(wrapperUrl)});
    const mode = process.argv[2];
    let fetchCount = 0;
    let contactCount = 0;
    const fetchImplementation = async () => {
      fetchCount += 1;
      if (mode === 'network') throw new Error('synthetic network failure');
      if (mode === 'timeout') {
        const error = new Error('synthetic timeout');
        error.name = 'TimeoutError';
        throw error;
      }
      const valid = {
        id: 'org-source-001',
        name: "IFs1991's Org",
        plan: 'pro',
        opt_in_tags: [],
        allowed_release_channels: ['ga']
      };
      const body = mode === 'invalid-schema'
        ? JSON.stringify({ ...valid, unexpected: true })
        : JSON.stringify(valid);
      const chunks = mode === 'oversize'
        ? [new Uint8Array(65537)]
        : [new TextEncoder().encode(body)];
      let index = 0;
      return {
        status: mode === 'non-200' ? 500 : 200,
        headers: {
          get(name) {
            return name.toLowerCase() === 'content-type'
              ? 'application/json'
              : null;
          }
        },
        body: {
          getReader() {
            return {
              async read() {
                if (index >= chunks.length) {
                  return { done: true, value: undefined };
                }
                const value = chunks[index];
                index += 1;
                return { done: false, value };
              },
              async cancel() {},
              releaseLock() {}
            };
          }
        }
      };
    };
    try {
      await wrapper.performAndReadOrganizationIdentityCapture({
        accessToken: 's'.repeat(40),
        timeoutMilliseconds: 5000,
        approvalExpiresAt: '2999-01-01T00:00:00.000Z',
        onRemoteContact: () => { contactCount += 1; },
        fetchImplementation
      });
      process.stdout.write(JSON.stringify({ ok: true, fetchCount, contactCount }));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' ? error.code : 'UNEXPECTED_ERROR';
      const outcome = error && typeof error === 'object' && 'outcome' in error &&
        typeof error.outcome === 'string' ? error.outcome : 'UNEXPECTED_OUTCOME';
      process.stdout.write(JSON.stringify({ ok: false, code, outcome, fetchCount, contactCount }));
    }
  `;
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pr12-org-attempt-harness-')
  );
  const harnessPath = path.join(directory, 'attempt-harness.mjs');
  fs.writeFileSync(harnessPath, harness, 'utf8');
  try {
    const child = spawnSync(process.execPath, [harnessPath, mode], {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
      encoding: 'utf8',
    });
    expect(child.stderr).toBe('');
    const result: unknown = JSON.parse(child.stdout);
    expect(typeof result).toBe('object');
    return result;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe('PR12 source Organization identity capture contract', () => {
  test('accepts only the exact authorized GET route without a body', () => {
    expect(
      invokeContract('assertAllowedOrganizationIdentityCaptureRequest', [
        { bodyPresent: false, method: 'GET', url: endpoint },
      ])
    ).toEqual({ ok: true, value: true });

    for (const request of [
      { bodyPresent: false, method: 'POST', url: endpoint },
      { bodyPresent: true, method: 'GET', url: endpoint },
      { bodyPresent: false, method: 'GET', url: `${endpoint}?select=id` },
      { bodyPresent: false, method: 'GET', url: `${endpoint}#fragment` },
      {
        bodyPresent: false,
        method: 'GET',
        url: endpoint.replace('api.supabase.com', 'api.supabase.com:443'),
      },
      {
        bodyPresent: false,
        method: 'GET',
        url: endpoint.replace('api.supabase.com', 'api.supabase.com:0443'),
      },
      {
        bodyPresent: false,
        method: 'GET',
        url: endpoint.replace('api.supabase.com', 'API.SUPABASE.COM'),
      },
      {
        bodyPresent: false,
        method: 'GET',
        url: endpoint.replace('https://', 'https://@'),
      },
      {
        bodyPresent: false,
        method: 'GET',
        url: endpoint.replace('https://', 'https://:@'),
      },
      {
        bodyPresent: false,
        method: 'GET',
        url: endpoint.replace('https://', 'http://'),
      },
      {
        bodyPresent: false,
        method: 'GET',
        url: 'https://api.supabase.com/v1/organizations/other',
      },
      {
        bodyPresent: false,
        method: 'GET',
        url: 'https://api.supabase.com/v1/projects',
      },
      {
        bodyPresent: false,
        method: 'GET',
        url: `https://api.supabase.com/v1/organizations/${encodeURIComponent(
          'qnanuoqveidwvacvbhqp'
        )}`,
      },
      {
        bodyPresent: false,
        method: 'GET',
        url: endpoint,
        redirectAllowed: true,
      },
    ]) {
      expect(
        invokeContract('assertAllowedOrganizationIdentityCaptureRequest', [
          request,
        ]).ok
      ).toBe(false);
    }
  });

  test('accepts only the exact expected Organization response schema', () => {
    const response = {
      id: 'org-source-001',
      name: "IFs1991's Org",
      plan: 'pro',
      opt_in_tags: [],
      allowed_release_channels: ['ga'],
    };
    expect(
      invokeContract('organizationIdentityResponseToSafeProjection', [response])
    ).toEqual({
      ok: true,
      value: {
        organizationId: 'org-source-001',
        organizationName: "IFs1991's Org",
        organizationSlug: 'kbnsntifrawhimhfjrug',
        plan: 'PRO',
      },
    });
    for (const changed of [
      { ...response, name: 'different' },
      { ...response, plan: 'free' },
      { ...response, id: 'qnanuoqveidwvacvbhqp' },
      { ...response, unexpected: true },
      { ...response, allowed_release_channels: [1] },
    ]) {
      expect(
        invokeContract('organizationIdentityResponseToSafeProjection', [
          changed,
        ]).ok
      ).toBe(false);
    }
  });

  test('validates the fully bound, cooling-off owner approval offline', () => {
    const fixture = makeValidFixture();
    expect(
      invokeContract('validateOrganizationIdentityCaptureOffline', [
        fixture.binding,
        fixture.credentialConfiguration,
        fixture.approval,
        fixture.context,
      ])
    ).toMatchObject({
      ok: true,
      value: {
        actionId: 'PR12-ACTION-002',
        principalId: 'owner:futoshi-iwasawa',
      },
    });
  });

  test.each([
    'unsigned binding',
    'expired approval',
    'wrong head',
    'changed payload',
    'production target',
    'owner separation violation',
    'sole-operator risk not accepted',
    'missing secret-store handle',
    'ambient credential fallback',
    'database password retrieval',
    'source project provisioning',
    'implementation hash mismatch',
    'shared dependency hash mismatch',
    'unsafe runtime binding',
  ])('fails closed for %s', scenario => {
    const fixture = makeValidFixture();
    let code = 'BINDING_INVALID';
    if (scenario === 'unsigned binding') {
      fixture.binding.status = 'NOT_RUN';
    } else if (scenario === 'expired approval') {
      fixture.context.now = fixture.approval.expiresAt;
      code = 'APPROVAL_INVALID';
    } else if (scenario === 'wrong head') {
      fixture.context.currentGitHead = '9'.repeat(40);
      code = 'TARGET_BINDING_INVALID';
    } else if (scenario === 'changed payload') {
      fixture.binding.approvedRequest.projection.url = `${endpoint}?changed=1`;
      code = 'REQUEST_BINDING_INVALID';
    } else if (scenario === 'production target') {
      fixture.binding.action.endpoint =
        'https://api.supabase.com/v1/projects/qnanuoqveidwvacvbhqp';
      code = 'ACTION_CONTRACT_INVALID';
    } else if (scenario === 'owner separation violation') {
      fixture.binding.ownerControl.operator = 'owner:someone-else';
      code = 'OWNER_CONTROL_INVALID';
    } else if (scenario === 'sole-operator risk not accepted') {
      fixture.binding.ownerControl.soleOperatorSelfApprovalRiskAccepted = false;
      code = 'OWNER_CONTROL_INVALID';
    } else if (scenario === 'missing secret-store handle') {
      fixture.credentialConfiguration.secrets.managementAccessToken.opaqueHandle =
        '';
      code = 'CREDENTIAL_CONFIGURATION_INVALID';
    } else if (scenario === 'ambient credential fallback') {
      fixture.context.environment = {
        SUPABASE_ACCESS_TOKEN: 'synthetic-forbidden-value',
      };
      code = 'AMBIENT_CREDENTIAL_OR_TRANSPORT_ENVIRONMENT_FORBIDDEN';
    } else if (scenario === 'database password retrieval') {
      fixture.binding.credentialControls.databasePasswordRetrievalAllowed = true;
      code = 'CREDENTIAL_CONTROL_INVALID';
    } else if (scenario === 'source project provisioning') {
      fixture.binding.authorization.sourceProjectProvisioningAuthorized = true;
      code = 'AUTHORIZATION_INVALID';
    } else if (scenario === 'implementation hash mismatch') {
      fixture.context.wrapperSha256 = '8'.repeat(64);
      code = 'IMPLEMENTATION_HASH_MISMATCH';
    } else if (scenario === 'shared dependency hash mismatch') {
      fixture.context.sharedProvisioningContractSha256 = '8'.repeat(64);
      code = 'IMPLEMENTATION_HASH_MISMATCH';
    } else {
      fixture.binding.runtimeControls.processExecArgvMustBeEmpty = false;
      code = 'RUNTIME_CONTROL_INVALID';
    }
    expectOfflineRejected(fixture, code);
  });

  test('atomically refuses a duplicate action claim', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-org-identity-claim-')
    );
    const claim = {
      actionId: 'PR12-ACTION-002',
      bindingMaterialSha256: 'a'.repeat(64),
      claimedAt: '2026-07-25T00:00:00.000Z',
      payloadSha256: 'b'.repeat(64),
      state: 'CLAIMED_GET_NOT_SENT',
    };
    try {
      expect(
        invokeContract('claimOrganizationIdentityCaptureAction', [
          directory,
          claim,
        ]).ok
      ).toBe(true);
      expect(
        invokeContract('claimOrganizationIdentityCaptureAction', [
          directory,
          claim,
        ])
      ).toEqual({ ok: false, code: 'ACTION_ALREADY_CLAIMED' });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('builds a token-only DPAPI request for PR12-ACTION-002', () => {
    const fixture = makeValidFixture();
    const result = invokeModule(
      dpapiChannelUrl,
      'buildCredentialBrokerRequest',
      [
        {
          mode: 'ORGANIZATION_IDENTITY_CAPTURE',
          bindingMaterialSha256: 'a'.repeat(64),
          payloadSha256: 'b'.repeat(64),
          claimSha256: 'c'.repeat(64),
          credentialConfigurationSha256: 'd'.repeat(64),
          credentialConfiguration: fixture.credentialConfiguration,
          journalDirectory: 'C:\\PR12\\journal',
          journalDirectoryPathSha256: 'e'.repeat(64),
          evidenceParentDirectory: 'C:\\PR12\\evidence',
          evidenceParentDirectoryPathSha256: 'f'.repeat(64),
          approvalExpiresAt: '2026-07-25T00:20:00.000Z',
          requestNonce: '0'.repeat(64),
        },
      ]
    );
    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(result.value);
    expect(serialized).toContain('"actionId":"PR12-ACTION-002"');
    expect(serialized).toContain('"mode":"ORGANIZATION_IDENTITY_CAPTURE"');
    expect(serialized).toContain('"role":"MANAGEMENT_ACCESS_TOKEN"');
    expect(serialized).not.toContain('"role":"DATABASE_PASSWORD"');

    const channelSource = fs.readFileSync(dpapiChannelPath, 'utf8');
    const brokerSource = fs.readFileSync(dpapiBrokerPath, 'utf8');
    expect(channelSource).toContain('{ includeDatabasePassword: false }');
    expect(brokerSource).toContain("'ORGANIZATION_IDENTITY_CAPTURE'");
    expect(brokerSource).toMatch(
      /\$ResponseBuffer\[9\]\s*=\s*if[\s\S]*?else\s*\{\s*3\s*\}/
    );
    expect(brokerSource).not.toMatch(/\bWrite-(?:Host|Output|Error|Warning)\b/);
    expect(brokerSource.indexOf('$entries = @($request.entries)')).toBeLessThan(
      brokerSource.indexOf(
        'Assert-NoReparsePathComponents -Value $request.providerRoot'
      )
    );
  });

  const testOnWindows = process.platform === 'win32' ? test : test.skip;

  testOnWindows(
    'rejects a database-password broker entry before provider-path access',
    () => {
      const injectedRequest = {
        schemaVersion: 1,
        protocol: 'PR12_DPAPI_BROKER_REQUEST_V1',
        actionId: 'PR12-ACTION-002',
        mode: 'ORGANIZATION_IDENTITY_CAPTURE',
        providerId: 'WINDOWS_DPAPI_CURRENT_USER_V1',
        configurationId: 'synthetic',
        approvalExpiresAt: '2999-01-01T00:00:00.000Z',
        bindingMaterialSha256: 'a'.repeat(64),
        bootstrapScriptSha256: 'b'.repeat(64),
        claimSha256: 'c'.repeat(64),
        credentialConfigurationSha256: 'd'.repeat(64),
        evidenceParentDirectory: 'C:\\does-not-exist\\evidence',
        evidenceParentDirectoryPathSha256: 'e'.repeat(64),
        journalDirectory: 'C:\\does-not-exist\\journal',
        journalDirectoryPathSha256: 'f'.repeat(64),
        payloadSha256: '0'.repeat(64),
        providerRoot: 'C:\\does-not-exist\\provider',
        providerRootPathSha256: '1'.repeat(64),
        providerRootResolvedPathSha256: '2'.repeat(64),
        requestNonce: '3'.repeat(64),
        entries: [
          { role: 'MANAGEMENT_ACCESS_TOKEN' },
          { role: 'DATABASE_PASSWORD' },
        ],
      };
      const brokerResult = spawnSync(
        'pwsh.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', dpapiBrokerPath],
        {
          cwd: repoRoot,
          env: {
            PATH: process.env.PATH,
            PATHEXT: process.env.PATHEXT,
            SYSTEMROOT: process.env.SYSTEMROOT,
          },
          input: `${JSON.stringify(injectedRequest)}\n`,
          encoding: null,
        }
      );
      expect(brokerResult.error).toBeUndefined();
      expect(brokerResult.status).toBe(70);
      expect(brokerResult.stdout).toHaveLength(0);
      expect(brokerResult.stderr).toHaveLength(0);
    }
  );

  test('contacts the exact endpoint once with redirect errors and no body', () => {
    expect(runFetchHarness('success')).toEqual({
      ok: true,
      fetchCount: 1,
      contactCount: 1,
      request: {
        url: endpoint,
        method: 'GET',
        redirect: 'error',
        hasExpectedAuthorization: true,
        accept: 'application/json',
        bodyPresent: false,
      },
    });
    expect(runFetchHarness('failure')).toMatchObject({
      ok: false,
      fetchCount: 1,
      contactCount: 1,
    });
    expect(runFetchHarness('expired')).toEqual({
      ok: false,
      code: 'APPROVAL_EXPIRED_BEFORE_REMOTE_CONTACT',
      fetchCount: 0,
      contactCount: 0,
      request: null,
    });
    const source = fs.readFileSync(wrapperPath, 'utf8');
    expect(source.match(/\bfetchImplementation\(/g)).toHaveLength(1);
    expect(source).toContain("redirect: 'error'");
    expect(source).not.toContain("method: 'POST'");
    expect(source).not.toContain('/v1/projects/');
  });

  test('rejects Node preload flags before any remote-contact callback', () => {
    expect(
      invokeModule(
        wrapperUrl,
        'assertSafeOrganizationIdentityCaptureNodeRuntime',
        ['v24.0.0', []]
      )
    ).toEqual({ ok: true, value: true });
    expect(
      invokeModule(
        wrapperUrl,
        'assertSafeOrganizationIdentityCaptureNodeRuntime',
        ['v24.0.0', ['--require', 'synthetic-preload.cjs']]
      )
    ).toEqual({ ok: false, code: 'UNSAFE_NODE_RUNTIME' });
    expect(
      invokeModule(
        wrapperUrl,
        'assertSafeOrganizationIdentityCaptureNodeRuntime',
        ['v23.11.0', []]
      )
    ).toEqual({ ok: false, code: 'UNSAFE_NODE_RUNTIME' });

    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-org-preload-')
    );
    const preloadPath = path.join(directory, 'preload.cjs');
    const executionPath = path.join(directory, 'execution.mjs');
    fs.writeFileSync(
      preloadPath,
      'globalThis.syntheticFetchCount = 0; globalThis.fetch = async () => { globalThis.syntheticFetchCount += 1; throw new Error("must not run"); };',
      'utf8'
    );
    fs.writeFileSync(
      executionPath,
      `
        const wrapper = await import(${JSON.stringify(wrapperUrl)});
        let contactCount = 0;
        try {
          await wrapper.performOrganizationIdentityCaptureRequest({
            accessToken: 's'.repeat(40),
            timeoutMilliseconds: 5000,
            approvalExpiresAt: '2999-01-01T00:00:00.000Z',
            onRemoteContact: () => { contactCount += 1; }
          });
          process.stdout.write(JSON.stringify({ ok: true, contactCount, fetchCount: globalThis.syntheticFetchCount }));
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error &&
            typeof error.code === 'string' ? error.code : 'UNEXPECTED_ERROR';
          process.stdout.write(JSON.stringify({ ok: false, code, contactCount, fetchCount: globalThis.syntheticFetchCount }));
        }
      `,
      'utf8'
    );
    try {
      const child = spawnSync(
        process.execPath,
        ['--require', preloadPath, executionPath],
        {
          cwd: repoRoot,
          env: {
            PATH: process.env.PATH,
            PATHEXT: process.env.PATHEXT,
            SYSTEMROOT: process.env.SYSTEMROOT,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
          },
          encoding: 'utf8',
        }
      );
      expect(child.stderr).toBe('');
      expect(JSON.parse(child.stdout)).toEqual({
        ok: false,
        code: 'UNSAFE_NODE_RUNTIME',
        contactCount: 0,
        fetchCount: 0,
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('requires the canonical Git top-level and repository-external outputs', () => {
    expect(
      invokeModule(wrapperUrl, 'assertCanonicalRepositoryRoot', [repoRoot])
    ).toEqual({ ok: true });
    expect(
      invokeModule(wrapperUrl, 'assertCanonicalRepositoryRoot', [
        path.join(repoRoot, 'scripts'),
      ])
    ).toEqual({
      ok: false,
      code: 'EXECUTING_IMPLEMENTATION_ROOT_MISMATCH',
    });
    expect(
      invokeModule(wrapperUrl, 'assertOutputDirectoryOutsideRepository', [
        repoRoot,
        evidenceRoot,
      ])
    ).toEqual({
      ok: false,
      code: 'RUNTIME_OUTPUT_DIRECTORY_INSIDE_REPOSITORY',
    });
  });

  test('bounds and schema-validates the provider response before projection', () => {
    expect(runResponseHarness('valid')).toMatchObject({
      ok: true,
      value: {
        httpStatus: 200,
        projection: {
          organizationId: 'org-source-001',
          organizationName: "IFs1991's Org",
          organizationSlug: 'kbnsntifrawhimhfjrug',
          plan: 'PRO',
        },
      },
    });
    expect(runResponseHarness('extra-field')).toEqual({
      ok: false,
      code: 'ORGANIZATION_RESPONSE_INVALID',
    });
    expect(runResponseHarness('wrong-content-type')).toEqual({
      ok: false,
      code: 'PROVIDER_RESPONSE_REJECTED',
    });
    expect(runResponseHarness('redirect')).toEqual({
      ok: false,
      code: 'PROVIDER_RESPONSE_REJECTED',
    });
    expect(runResponseHarness('oversize')).toEqual({
      ok: false,
      code: 'PROVIDER_RESPONSE_TOO_LARGE',
    });
    expect(runResponseHarness('duplicate-members')).toEqual({
      ok: false,
      code: 'PROVIDER_RESPONSE_DUPLICATE_MEMBER',
    });
    expect(runResponseHarness('production-ref')).toEqual({
      ok: false,
      code: 'PROVIDER_RESPONSE_PRODUCTION_IDENTIFIER_FORBIDDEN',
    });
  });

  test.each([
    ['network', 'ORGANIZATION_IDENTITY_RESPONSE_NOT_OBSERVED'],
    ['timeout', 'ORGANIZATION_IDENTITY_RESPONSE_NOT_OBSERVED'],
    ['non-200', 'PROVIDER_RESPONSE_REJECTED'],
    ['oversize', 'PROVIDER_RESPONSE_TOO_LARGE'],
    ['invalid-schema', 'ORGANIZATION_RESPONSE_INVALID'],
  ] as const)(
    'integrates %s failure into a one-contact unknown outcome',
    (mode, code) => {
      expect(runIntegratedAttemptHarness(mode)).toEqual({
        ok: false,
        code,
        outcome: 'UNKNOWN_REMOTE_OUTCOME',
        fetchCount: 1,
        contactCount: 1,
      });
    }
  );

  test('verifies a complete secret-free evidence bundle and rejects tampering', () => {
    const directory = makeSyntheticEvidenceBundle();
    try {
      expect(
        invokeModule(
          verifierUrl,
          'verifyOrganizationIdentityCaptureEvidenceDirectory',
          [directory, ['synthetic-runtime-token-not-in-evidence']]
        )
      ).toMatchObject({
        ok: true,
        value: {
          actionOutcome: 'PASS',
          actionId: 'PR12-ACTION-002',
          organizationId: 'org-source-001',
          remoteContactCount: 1,
          requestAttemptCount: 1,
          automaticRetryCount: 0,
        },
      });
      fs.appendFileSync(
        path.join(directory, 'provider-export.safe.json'),
        ' ',
        'utf8'
      );
      expect(
        invokeModule(
          verifierUrl,
          'verifyOrganizationIdentityCaptureEvidenceDirectory',
          [directory]
        ).ok
      ).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('accepts a pre-broker partial-failure bundle with zero secret retrieval', () => {
    const directory = makeSyntheticPartialEvidenceBundle();
    try {
      expect(
        invokeModule(
          verifierUrl,
          'verifyOrganizationIdentityCaptureEvidenceDirectory',
          [directory]
        )
      ).toMatchObject({
        ok: true,
        value: {
          actionOutcome: 'PARTIAL_FAILURE',
          organizationId: null,
          remoteContactCount: 0,
          requestAttemptCount: 0,
          automaticRetryCount: 0,
        },
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('classifies every post-contact failure as an unknown remote outcome', () => {
    for (const preferred of ['PARTIAL_FAILURE', 'UNKNOWN_REMOTE_OUTCOME']) {
      expect(
        invokeModule(wrapperUrl, 'classifyIdentityCaptureFailureOutcome', [
          1,
          preferred,
        ])
      ).toEqual({ ok: true, value: 'UNKNOWN_REMOTE_OUTCOME' });
    }
    expect(
      invokeModule(wrapperUrl, 'classifyIdentityCaptureFailureOutcome', [
        0,
        'PARTIAL_FAILURE',
      ])
    ).toEqual({ ok: true, value: 'PARTIAL_FAILURE' });
  });

  test('verifies the runtime-producible post-contact unknown outcome sequence', () => {
    const directory = makeSyntheticUnknownEvidenceBundle();
    try {
      expect(
        invokeModule(
          verifierUrl,
          'verifyOrganizationIdentityCaptureEvidenceDirectory',
          [directory]
        )
      ).toMatchObject({
        ok: true,
        value: {
          actionOutcome: 'UNKNOWN_REMOTE_OUTCOME',
          organizationId: null,
          remoteContactCount: 1,
          requestAttemptCount: 1,
          automaticRetryCount: 0,
        },
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test.each([
    'actor mismatch',
    'cooling interval too short',
    'non-monotonic events',
    'scan after seal',
    'unsafe recorded runtime',
  ])('rejects recomputed evidence with %s', scenario => {
    const directory = makeSyntheticUnknownEvidenceBundle();
    try {
      if (scenario === 'actor mismatch') {
        const provider = readJsonObject(
          path.join(directory, 'provider-export.safe.json')
        );
        provider.capturedBy = 'owner:someone-else';
        writeCanonicalArtifact(
          directory,
          'provider-export.safe.json',
          provider
        );
      } else if (scenario === 'cooling interval too short') {
        const result = readJsonObject(
          path.join(directory, 'organization-identity-capture-result.json')
        );
        const window = result.approvalWindow;
        if (!isJsonObject(window)) {
          throw new Error('synthetic approval window is invalid');
        }
        window.operatorReconfirmedAt = '2026-07-25T00:04:59.000Z';
        writeCanonicalArtifact(
          directory,
          'organization-identity-capture-result.json',
          result
        );
      } else if (scenario === 'non-monotonic events') {
        const events = readJsonObject(
          path.join(directory, 'action-events.json')
        );
        const eventList = events.events;
        if (!Array.isArray(eventList) || !isJsonObject(eventList[1])) {
          throw new Error('synthetic events are invalid');
        }
        eventList[1].at = '2026-07-25T00:09:59.000Z';
        writeCanonicalArtifact(directory, 'action-events.json', events);
      } else if (scenario === 'scan after seal') {
        const privacy = readJsonObject(
          path.join(directory, 'privacy-scan.json')
        );
        privacy.scannedAt = '2026-07-25T00:14:00.000Z';
        writeCanonicalArtifact(directory, 'privacy-scan.json', privacy);
      } else {
        const result = readJsonObject(
          path.join(directory, 'organization-identity-capture-result.json')
        );
        const runtime = result.runtime;
        if (!isJsonObject(runtime)) {
          throw new Error('synthetic runtime is invalid');
        }
        runtime.processExecArgvCount = 1;
        writeCanonicalArtifact(
          directory,
          'organization-identity-capture-result.json',
          result
        );
      }
      rewriteSyntheticEvidenceBundle(
        directory,
        'UNKNOWN_REMOTE_OUTCOME',
        '2026-07-25T00:13:00.000Z'
      );
      expect(
        invokeModule(
          verifierUrl,
          'verifyOrganizationIdentityCaptureEvidenceDirectory',
          [directory]
        ).ok
      ).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('rejects secret-bearing evidence even when its hashes are internally valid', () => {
    const secret = 'token-secret-12345678901234567890';
    const directory = makeSyntheticEvidenceBundle(secret);
    try {
      expect(
        invokeModule(
          verifierUrl,
          'verifyOrganizationIdentityCaptureEvidenceDirectory',
          [directory, [secret]]
        )
      ).toEqual({
        ok: false,
        code: 'SECRET_BEARING_EVIDENCE',
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('keeps every committed template non-executable and secret-free', () => {
    for (const filename of [
      'source-organization-identity-capture-binding-v1.template.json',
      'source-organization-identity-capture-owner-approval-v1.template.json',
      'source-organization-identity-capture-action-journal.template.json',
      'source-organization-identity-capture-result-v1.template.json',
      'source-organization-identity-provider-safe-projection-v1.template.json',
      'source-organization-identity-capture-evidence-manifest-v1.template.json',
      'source-organization-identity-capture-privacy-scan-v1.template.json',
    ]) {
      const text = fs.readFileSync(path.join(evidenceRoot, filename), 'utf8');
      const parsed: unknown = JSON.parse(text);
      expect(text).not.toMatch(/Bearer\s+/i);
      expect(text).not.toContain('SUPABASE_ACCESS_TOKEN=');
      expect(parsed).toBeTruthy();
    }
    const binding: unknown = JSON.parse(
      fs.readFileSync(
        path.join(
          evidenceRoot,
          'source-organization-identity-capture-binding-v1.template.json'
        ),
        'utf8'
      )
    );
    expect(isJsonObject(binding)).toBe(true);
    if (!isJsonObject(binding)) {
      throw new Error('identity capture binding template must be an object');
    }
    expect(binding.status).toBe('NOT_RUN');
    const authorization = binding.authorization;
    expect(isJsonObject(authorization)).toBe(true);
    if (!isJsonObject(authorization)) {
      throw new Error('identity capture authorization must be an object');
    }
    expect(Object.values(authorization).every(value => value === false)).toBe(
      true
    );
  });
});
