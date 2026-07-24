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
  'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs'
);
const contractUrl = pathToFileURL(contractPath).href;
const evidenceVerifierPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/verify-pr12-source-project-provisioning-evidence.mjs'
);
const evidenceVerifierUrl = pathToFileURL(evidenceVerifierPath).href;
const provisioningWrapperPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs'
);
const provisioningWrapperUrl = pathToFileURL(provisioningWrapperPath).href;
const dpapiChannelPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-windows-dpapi-credential-channel.mjs'
);
const dpapiChannelUrl = pathToFileURL(dpapiChannelPath).href;
const dpapiBrokerPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1'
);
const dpapiBootstrapPath = path.join(
  repoRoot,
  'scripts/commercial-hardening/initialize-pr12-windows-dpapi-credentials.ps1'
);
const phase1EvidenceRoot = path.join(
  repoRoot,
  'docs/stabilization/evidence/commercial-hardening/pr12'
);

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

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

function canonicalSha256(value: JsonValue): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function writeCanonicalJson(
  directory: string,
  filename: string,
  value: JsonValue
): { path: string; bytes: number; sha256: string; classification: string } {
  const contents = `${JSON.stringify(canonicalize(value))}\n`;
  fs.writeFileSync(path.join(directory, filename), contents, 'utf8');
  return {
    path: filename,
    bytes: Buffer.byteLength(contents, 'utf8'),
    sha256: createHash('sha256').update(contents, 'utf8').digest('hex'),
    classification: [
      'provider-export.safe.json',
      'provisioning-result.json',
    ].includes(filename)
      ? 'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS'
      : 'INTERNAL_NO_PII',
  };
}

function makeSyntheticEvidenceBundle(
  secretBearing: boolean,
  semanticEmpty = false
): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pr12-source-provisioning-evidence-')
  );
  const gitCommit = 'a'.repeat(40);
  const bindingMaterialSha256 = 'b'.repeat(64);
  const projectRef = 'abcdefghijklmnopqrst';
  const claimSha256 = 'd'.repeat(64);
  const postIntentSha256 = 'e'.repeat(64);
  const requestProjection = {
    db_pass: 'RUNTIME_SECRET_NOT_IN_EVIDENCE',
    desired_instance_size: 'large',
    name: 'seikotsuin-pr12-isolated-qualification-20260719',
    organization_slug: 'isolated-staging-org',
    region_selection: { code: 'ap-northeast-1', type: 'specific' },
  };
  const payloadSha256 = canonicalSha256(requestProjection);
  const page = {
    bodySha256: '1'.repeat(64),
    httpStatus: 200,
    offset: 0,
    limit: 100,
    totalCount: 0,
    returnedCount: 0,
    safeProjectionSha256: '2'.repeat(64),
  };
  const eventsMetadata = writeCanonicalJson(directory, 'action-events.json', {
    schemaVersion: 1,
    actionId: 'PR12-ACTION-003',
    outcome: 'PASS',
    events: semanticEmpty
      ? []
      : [
          {
            sequence: 1,
            state: 'CLAIMED_POST_NOT_SENT',
            at: '2026-07-23T12:00:00.000Z',
            claimSha256,
            remoteContactCount: 0,
            createPostAttemptCount: 0,
          },
          {
            sequence: 2,
            state: 'POST_INTENT_DURABLE',
            at: '2026-07-23T12:00:10.000Z',
            postIntentSha256,
            remoteContactCount: 3,
            createPostAttemptCount: 0,
          },
          {
            sequence: 3,
            state: 'RESPONSE_ACCEPTED',
            at: '2026-07-23T12:00:20.000Z',
            projectRef,
            remoteContactCount: 4,
            createPostAttemptCount: 1,
          },
          {
            sequence: 4,
            state: 'PROVIDER_RECONCILED',
            at: '2026-07-23T12:01:00.000Z',
            projectRef,
            remoteContactCount: 6,
            createPostAttemptCount: 1,
          },
        ],
  });
  const providerMetadata = writeCanonicalJson(
    directory,
    'provider-export.safe.json',
    {
      schemaVersion: 2,
      exportType: 'SUPABASE_SOURCE_PROJECT_PROVIDER_SAFE_PROJECTION',
      status: 'PASS',
      actionId: 'PR12-ACTION-003',
      request: {
        endpoint: 'https://api.supabase.com/v1/projects',
        httpMethod: 'POST',
        secretFreeProjection: requestProjection,
        secretFreeProjectionSha256: payloadSha256,
        rawWireBodyPersisted: false,
        rawHttpHeadersPersisted: false,
      },
      preflight: {
        organization: {
          organizationId: 'org-isolated-001',
          organizationSlug: 'isolated-staging-org',
          plan: 'PRO',
        },
        organizationResponseBodySha256: '3'.repeat(64),
        region: {
          regionCode: 'ap-northeast-1',
          selectionType: 'specific',
          provider: 'AWS',
          capacityStatus: 'AVAILABLE',
        },
        regionResponseBodySha256: '4'.repeat(64),
        projectListPages: [page],
        projectCount: 0,
        duplicateMatchCount: 0,
        observedAt: '2026-07-23T12:00:09.000Z',
      },
      createResponse: {
        httpStatus: 201,
        safeProjection: {
          projectRef,
          organizationId: 'org-isolated-001',
          organizationSlug: 'isolated-staging-org',
          projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
          region: 'ap-northeast-1',
          createdAt: '2026-07-23T12:00:19.000Z',
          status: 'INACTIVE',
        },
        responseBodySha256: '5'.repeat(64),
      },
      readinessObservation: {
        project: {
          projectRef,
          projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
          region: 'ap-northeast-1',
          isBranch: false,
          status: 'ACTIVE_HEALTHY',
          insertedAt: '2026-07-23T12:00:19.000Z',
        },
        pollCount: 1,
        polls: [
          {
            observedAt: '2026-07-23T12:00:40.000Z',
            pages: [
              {
                ...page,
                totalCount: 1,
                returnedCount: 1,
                safeProjectionSha256: '6'.repeat(64),
              },
            ],
            matchCount: 1,
          },
        ],
        finalStatus: 'ACTIVE_HEALTHY',
      },
      computeObservation: {
        projectRef,
        addonType: 'compute_instance',
        variantId: 'ci_large',
        responseBodySha256: '7'.repeat(64),
        httpStatus: 200,
        observedAt: '2026-07-23T12:00:59.000Z',
      },
      reconciliation: null,
      rawProviderBodiesPersisted: false,
      capturedAt: '2026-07-23T12:01:00.000Z',
      capturedBy: secretBearing
        ? 'sbp_synthetic_management_pat_1234567890'
        : 'operator@example.invalid',
    }
  );
  const resultMetadata = writeCanonicalJson(
    directory,
    'provisioning-result.json',
    {
      schemaVersion: 3,
      phase: 'SOURCE_PROJECT_PROVISIONING_RESULT',
      resultType: 'SOURCE_PROJECT_PROVISIONING_OPERATION',
      status: 'PASS',
      actionId: 'PR12-ACTION-003',
      gitCommit,
      bindingMaterialSha256,
      payloadSha256,
      operator: secretBearing
        ? 'sbp_synthetic_management_pat_1234567890'
        : 'operator@example.invalid',
      approver: secretBearing
        ? 'sbp_synthetic_management_pat_1234567890'
        : 'operator@example.invalid',
      operatorDisplayName: 'FUTOSHI IWASAWA',
      operatorControlMode: 'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1',
      identitySeparationAvailable: false,
      independentHumanReviewClaimed: false,
      actionStartedAt: '2026-07-23T12:00:00.000Z',
      actionCompletedAt: '2026-07-23T12:01:00.000Z',
      remoteContactCount: 6,
      createPostAttemptCount: 1,
      automaticRetryCount: 0,
      credentialBrokerInvocationCount: 1,
      credentialBrokerMode: 'EXECUTE',
      duplicateState: 'ABSENT_ALL_PAGES',
      partialFailureState: null,
      readOnlyReconciliation: null,
      recoveryOwner: 'operator@example.invalid',
      cleanupDeletionAuthorized: false,
      databaseConnectionPerformed: false,
      phase2AndLaterAuthorized: false,
      createdEnvironment: {
        organizationId: 'org-isolated-001',
        organizationSlug: 'isolated-staging-org',
        organizationPlan: 'PRO',
        projectRef,
        projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
        region: 'ap-northeast-1',
        databaseTier: 'LARGE',
        createdAt: '2026-07-23T12:00:19.000Z',
        status: 'ACTIVE_HEALTHY',
        projectDeadline: '2026-07-26T12:00:19.000Z',
        dataApiAuthGraphQlIntegrationState: 'NOT_OBSERVED_PHASE2_REQUIRED',
      },
      providerEvidence: {
        path: 'provider-export.safe.json',
        sha256: providerMetadata.sha256,
      },
      pricingAndFunding: {
        currency: 'USD',
        moneyScale: 10000,
        pricingEvidenceFreshThrough: '2026-07-23T13:00:00.000Z',
        sourceMaximumBillableHours: 72,
        sourceMaximumComputeUsdScaled: 109224,
        unallocatedAuthorizationHeadroomUsdScaled: 390776,
        ownerAuthorizationCeilingUsdScaled: 500000,
        providerSpendCapEnforced: false,
        fundingSource: 'OWNER_APPROVED_PERSONAL_PAYMENT_METHOD',
        fundingApprovedAmountUsdScaled: 500000,
        fundedThrough: '2026-07-26T12:05:00.000Z',
      },
      approvalWindow: {
        approvedAt: '2026-07-23T11:35:00.000Z',
        operatorReconfirmedAt: '2026-07-23T11:40:00.000Z',
        expiresAt: '2026-07-23T12:05:00.000Z',
        approvalEvidenceSha256: '8'.repeat(64),
      },
      cleanupBoundary: {
        disposition:
          'DELETE_BEFORE_DEADLINE_OR_SEPARATELY_APPROVE_FUNDED_EXTENSION',
        cleanupOwner: 'operator@example.invalid',
        deletionApprovalRequester: 'operator@example.invalid',
        deletionApprovalRequestDeadline: '2026-07-26T00:00:00.000Z',
        billingEscalationOwner: 'operator@example.invalid',
        fundedExtensionOwner: 'operator@example.invalid',
        automaticDeletionAuthorized: false,
      },
      journalEvidence: {
        actionJournalDirectoryPathSha256: '9'.repeat(64),
        claimSha256,
        postIntentSha256,
      },
    }
  );
  const metadata = [eventsMetadata, providerMetadata, resultMetadata];
  const privacyMetadata = writeCanonicalJson(directory, 'privacy-scan.json', {
    schemaVersion: 1,
    scanType: 'PR12_PHASE1_EVIDENCE_PRIVACY_AND_SECRET_SCAN',
    status: 'PASS',
    scanner: 'pr12-source-project-provisioning-contract-v1',
    rawProviderBodiesPersisted: false,
    rawHttpHeadersPersisted: false,
    runtimeSecretValuesComparedAgainstArtifacts: true,
    runtimeSecretValueCount: 2,
    scanMode: 'STRUCTURAL_AND_AVAILABLE_RUNTIME_VALUES',
    scannedArtifacts: metadata.map(({ path: itemPath, bytes, sha256 }) => ({
      path: itemPath,
      bytes,
      sha256,
    })),
    scannedAt: '2026-07-23T12:01:00.000Z',
  });
  const allMetadata = [...metadata, privacyMetadata];
  const manifest = {
    schemaVersion: 1,
    manifestType: 'PR12_PHASE1_SOURCE_PROJECT_PROVISIONING_EVIDENCE',
    status: 'PASS',
    actionId: 'PR12-ACTION-003',
    gitCommit,
    bindingMaterialSha256,
    payloadSha256,
    fundingSource: 'OWNER_APPROVED_PERSONAL_PAYMENT_METHOD',
    artifacts: allMetadata,
    artifactCount: allMetadata.length,
    rawProviderBodiesPersisted: false,
    rawHttpHeadersPersisted: false,
    sealedAt: '2026-07-23T12:01:01.000Z',
  };
  const manifestContents = `${JSON.stringify(canonicalize(manifest))}\n`;
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    manifestContents,
    'utf8'
  );
  const manifestSha256 = createHash('sha256')
    .update(manifestContents, 'utf8')
    .digest('hex');
  fs.writeFileSync(
    path.join(directory, 'manifest.sha256'),
    `${manifestSha256}  manifest.json\n`,
    'utf8'
  );
  return directory;
}

function rewriteEvidenceArtifactAndReseal(
  directory: string,
  filename:
    | 'action-events.json'
    | 'privacy-scan.json'
    | 'provider-export.safe.json'
    | 'provisioning-result.json',
  mutate: (artifact: JsonObject) => void
): void {
  const artifactPath = path.join(directory, filename);
  const artifact = JSON.parse(
    fs.readFileSync(artifactPath, 'utf8')
  ) as JsonObject;
  mutate(artifact);
  writeCanonicalJson(directory, filename, artifact);

  const privacyPath = path.join(directory, 'privacy-scan.json');
  const privacy = JSON.parse(
    fs.readFileSync(privacyPath, 'utf8')
  ) as JsonObject;
  const scannedPaths = [
    'action-events.json',
    'provider-export.safe.json',
    'provisioning-result.json',
  ];
  privacy.scannedArtifacts = scannedPaths.map(itemPath => {
    const contents = fs.readFileSync(path.join(directory, itemPath));
    return {
      path: itemPath,
      bytes: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
    };
  });
  writeCanonicalJson(directory, 'privacy-scan.json', privacy);

  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8')
  ) as JsonObject;
  const result = JSON.parse(
    fs.readFileSync(path.join(directory, 'provisioning-result.json'), 'utf8')
  ) as JsonObject;
  const artifactPaths = [...scannedPaths, 'privacy-scan.json'];
  manifest.artifacts = artifactPaths.map(itemPath => {
    const contents = fs.readFileSync(path.join(directory, itemPath));
    return {
      path: itemPath,
      bytes: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
      classification: [
        'provider-export.safe.json',
        'provisioning-result.json',
      ].includes(itemPath)
        ? 'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS'
        : 'INTERNAL_NO_PII',
    };
  });
  manifest.artifactCount = artifactPaths.length;
  manifest.status = result.status;
  const manifestContents = `${JSON.stringify(canonicalize(manifest))}\n`;
  fs.writeFileSync(manifestPath, manifestContents, 'utf8');
  fs.writeFileSync(
    path.join(directory, 'manifest.sha256'),
    `${createHash('sha256').update(manifestContents).digest('hex')}  manifest.json\n`,
    'utf8'
  );
}

function replaceEvidenceArtifactRawAndReseal(
  directory: string,
  filename:
    | 'action-events.json'
    | 'provider-export.safe.json'
    | 'provisioning-result.json',
  rawContents: string
): void {
  fs.writeFileSync(path.join(directory, filename), rawContents, 'utf8');
  const scannedPaths = [
    'action-events.json',
    'provider-export.safe.json',
    'provisioning-result.json',
  ];
  const privacyPath = path.join(directory, 'privacy-scan.json');
  const privacy = JSON.parse(
    fs.readFileSync(privacyPath, 'utf8')
  ) as JsonObject;
  privacy.scannedArtifacts = scannedPaths.map(itemPath => {
    const contents = fs.readFileSync(path.join(directory, itemPath));
    return {
      path: itemPath,
      bytes: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
    };
  });
  writeCanonicalJson(directory, 'privacy-scan.json', privacy);

  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8')
  ) as JsonObject;
  const result = JSON.parse(
    fs.readFileSync(path.join(directory, 'provisioning-result.json'), 'utf8')
  ) as JsonObject;
  const artifactPaths = [...scannedPaths, 'privacy-scan.json'];
  manifest.artifacts = artifactPaths.map(itemPath => {
    const contents = fs.readFileSync(path.join(directory, itemPath));
    return {
      path: itemPath,
      bytes: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
      classification: [
        'provider-export.safe.json',
        'provisioning-result.json',
      ].includes(itemPath)
        ? 'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS'
        : 'INTERNAL_NO_PII',
    };
  });
  manifest.artifactCount = artifactPaths.length;
  manifest.status = result.status;
  const manifestContents = `${JSON.stringify(canonicalize(manifest))}\n`;
  fs.writeFileSync(manifestPath, manifestContents, 'utf8');
  fs.writeFileSync(
    path.join(directory, 'manifest.sha256'),
    `${createHash('sha256').update(manifestContents).digest('hex')}  manifest.json\n`,
    'utf8'
  );
}

function refreshResultProviderHash(directory: string): void {
  rewriteEvidenceArtifactAndReseal(
    directory,
    'provisioning-result.json',
    artifact => {
      const providerContents = fs.readFileSync(
        path.join(directory, 'provider-export.safe.json')
      );
      const providerEvidence = artifact.providerEvidence as JsonObject;
      providerEvidence.sha256 = createHash('sha256')
        .update(providerContents)
        .digest('hex');
    }
  );
}

function makeSyntheticRecoveryEvidenceBundle(): string {
  const directory = makeSyntheticEvidenceBundle(false);
  const reconciliation = {
    state: 'PROJECT_OBSERVED_OWNER_DECISION_REQUIRED',
    observedAt: '2026-07-23T12:00:50.000Z',
    projectCount: 1,
    matchingProjects: [
      {
        projectRef: 'abcdefghijklmnopqrst',
        projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
        region: 'ap-northeast-1',
        isBranch: false,
        status: 'ACTIVE_HEALTHY',
        insertedAt: '2026-07-23T12:00:20.000Z',
      },
    ],
    projectListPages: [
      {
        bodySha256: '1'.repeat(64),
        httpStatus: 200,
        offset: 0,
        limit: 100,
        totalCount: 1,
        returnedCount: 1,
        safeProjectionSha256: '2'.repeat(64),
      },
    ],
    automaticPostRetryPerformed: false,
    automaticCleanupPerformed: false,
  };
  rewriteEvidenceArtifactAndReseal(
    directory,
    'provider-export.safe.json',
    artifact => {
      artifact.status = 'UNKNOWN_REMOTE_OUTCOME';
      artifact.preflight = null;
      artifact.createResponse = null;
      artifact.readinessObservation = null;
      artifact.computeObservation = null;
      artifact.reconciliation = reconciliation;
    }
  );
  rewriteEvidenceArtifactAndReseal(
    directory,
    'provisioning-result.json',
    artifact => {
      const providerContents = fs.readFileSync(
        path.join(directory, 'provider-export.safe.json')
      );
      artifact.status = 'UNKNOWN_REMOTE_OUTCOME';
      artifact.remoteContactCount = 5;
      artifact.createPostAttemptCount = 1;
      artifact.duplicateState = 'NOT_CHECKED';
      artifact.partialFailureState =
        'PROCESS_INTERRUPTION_AFTER_POST_INTENT_OWNER_DECISION_REQUIRED';
      artifact.readOnlyReconciliation = reconciliation;
      artifact.createdEnvironment = null;
      artifact.providerEvidence = {
        path: 'provider-export.safe.json',
        sha256: createHash('sha256').update(providerContents).digest('hex'),
      };
    }
  );
  rewriteEvidenceArtifactAndReseal(
    directory,
    'action-events.json',
    artifact => {
      artifact.outcome = 'UNKNOWN_REMOTE_OUTCOME';
      artifact.events = [
        {
          sequence: 1,
          state: 'CLAIMED_POST_NOT_SENT',
          at: '2026-07-23T12:00:00.000Z',
          claimSha256: 'd'.repeat(64),
          remoteContactCount: 0,
          createPostAttemptCount: 0,
        },
        {
          sequence: 2,
          state: 'POST_INTENT_DURABLE',
          at: '2026-07-23T12:00:10.000Z',
          postIntentSha256: 'e'.repeat(64),
          remoteContactCount: 3,
          createPostAttemptCount: 0,
        },
        {
          sequence: 3,
          state: 'READ_ONLY_RECONCILIATION_COMPLETED',
          at: '2026-07-23T12:00:50.000Z',
          reconciliationState: reconciliation.state,
          remoteContactCount: 5,
          createPostAttemptCount: 1,
          automaticRetryCount: 0,
        },
        {
          sequence: 4,
          state: 'UNKNOWN_REMOTE_OUTCOME',
          at: '2026-07-23T12:01:00.000Z',
          reasonCode:
            'PROCESS_INTERRUPTION_AFTER_POST_INTENT_OWNER_DECISION_REQUIRED',
          remoteContactCount: 5,
          createPostAttemptCount: 1,
          automaticRetryCount: 0,
        },
      ];
    }
  );
  rewriteEvidenceArtifactAndReseal(directory, 'privacy-scan.json', artifact => {
    artifact.runtimeSecretValueCount = 1;
    artifact.scanMode = 'STRUCTURAL_AND_AVAILABLE_RUNTIME_VALUES';
  });
  return directory;
}

function makeSyntheticPartialAcceptedEvidenceBundle(): string {
  const directory = makeSyntheticEvidenceBundle(false);
  const reconciliation = {
    state: 'PROJECT_OBSERVED_OWNER_DECISION_REQUIRED',
    observedAt: '2026-07-23T12:00:50.000Z',
    projectCount: 1,
    matchingProjects: [
      {
        projectRef: 'abcdefghijklmnopqrst',
        projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
        region: 'ap-northeast-1',
        isBranch: false,
        status: 'ACTIVE_HEALTHY',
        insertedAt: '2026-07-23T12:00:19.000Z',
      },
    ],
    projectListPages: [
      {
        bodySha256: '1'.repeat(64),
        httpStatus: 200,
        offset: 0,
        limit: 100,
        totalCount: 1,
        returnedCount: 1,
        safeProjectionSha256: '2'.repeat(64),
      },
    ],
    automaticPostRetryPerformed: false,
    automaticCleanupPerformed: false,
  };
  rewriteEvidenceArtifactAndReseal(
    directory,
    'provider-export.safe.json',
    artifact => {
      artifact.status = 'PARTIAL_FAILURE';
      artifact.readinessObservation = null;
      artifact.computeObservation = null;
      artifact.reconciliation = reconciliation;
    }
  );
  rewriteEvidenceArtifactAndReseal(
    directory,
    'provisioning-result.json',
    artifact => {
      const providerContents = fs.readFileSync(
        path.join(directory, 'provider-export.safe.json')
      );
      artifact.status = 'PARTIAL_FAILURE';
      artifact.duplicateState = 'ABSENT_ALL_PAGES';
      artifact.partialFailureState = 'READINESS_DEADLINE_EXCEEDED';
      artifact.readOnlyReconciliation = reconciliation;
      artifact.createdEnvironment = null;
      artifact.providerEvidence = {
        path: 'provider-export.safe.json',
        sha256: createHash('sha256').update(providerContents).digest('hex'),
      };
    }
  );
  rewriteEvidenceArtifactAndReseal(
    directory,
    'action-events.json',
    artifact => {
      artifact.outcome = 'PARTIAL_FAILURE';
      artifact.events = [
        {
          sequence: 1,
          state: 'CLAIMED_POST_NOT_SENT',
          at: '2026-07-23T12:00:00.000Z',
          claimSha256: 'd'.repeat(64),
          remoteContactCount: 0,
          createPostAttemptCount: 0,
        },
        {
          sequence: 2,
          state: 'POST_INTENT_DURABLE',
          at: '2026-07-23T12:00:10.000Z',
          postIntentSha256: 'e'.repeat(64),
          remoteContactCount: 3,
          createPostAttemptCount: 0,
        },
        {
          sequence: 3,
          state: 'RESPONSE_ACCEPTED',
          at: '2026-07-23T12:00:20.000Z',
          projectRef: 'abcdefghijklmnopqrst',
          remoteContactCount: 4,
          createPostAttemptCount: 1,
        },
        {
          sequence: 4,
          state: 'READ_ONLY_RECONCILIATION_COMPLETED',
          at: '2026-07-23T12:00:50.000Z',
          reconciliationState: reconciliation.state,
          remoteContactCount: 6,
          createPostAttemptCount: 1,
          automaticRetryCount: 0,
        },
        {
          sequence: 5,
          state: 'PARTIAL_FAILURE',
          at: '2026-07-23T12:01:00.000Z',
          reasonCode: 'READINESS_DEADLINE_EXCEEDED',
          remoteContactCount: 6,
          createPostAttemptCount: 1,
          automaticRetryCount: 0,
        },
      ];
    }
  );
  return directory;
}

function makeSyntheticPostPreflightAbortEvidenceBundle(): string {
  const directory = makeSyntheticEvidenceBundle(false);
  rewriteEvidenceArtifactAndReseal(
    directory,
    'action-events.json',
    artifact => {
      const firstEvent = (artifact.events as JsonValue[])[0] as JsonObject;
      artifact.outcome = 'PRECHECK_ABORTED';
      artifact.events = [
        firstEvent,
        {
          sequence: 2,
          state: 'PRECHECK_ABORTED',
          at: '2026-07-23T12:01:00.000Z',
          reasonCode: 'REQUEST_PAYLOAD_HASH_MISMATCH',
          remoteContactCount: 3,
          createPostAttemptCount: 0,
          automaticRetryCount: 0,
        },
      ];
    }
  );
  rewriteEvidenceArtifactAndReseal(
    directory,
    'provider-export.safe.json',
    artifact => {
      artifact.status = 'PRECHECK_ABORTED';
      artifact.createResponse = null;
      artifact.readinessObservation = null;
      artifact.computeObservation = null;
      artifact.reconciliation = null;
    }
  );
  rewriteEvidenceArtifactAndReseal(
    directory,
    'provisioning-result.json',
    artifact => {
      const providerContents = fs.readFileSync(
        path.join(directory, 'provider-export.safe.json')
      );
      artifact.status = 'PRECHECK_ABORTED';
      artifact.remoteContactCount = 3;
      artifact.createPostAttemptCount = 0;
      artifact.duplicateState = 'ABSENT_ALL_PAGES';
      artifact.partialFailureState = 'REQUEST_PAYLOAD_HASH_MISMATCH';
      artifact.readOnlyReconciliation = null;
      artifact.createdEnvironment = null;
      artifact.providerEvidence = {
        path: 'provider-export.safe.json',
        sha256: createHash('sha256').update(providerContents).digest('hex'),
      };
      const journalEvidence = artifact.journalEvidence as JsonObject;
      journalEvidence.postIntentSha256 = null;
    }
  );
  return directory;
}

function runEvidenceVerifier(directory: string) {
  return spawnSync(
    process.execPath,
    [evidenceVerifierPath, '--evidence-directory', directory],
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
}

function invokeContract(
  method: string,
  args: JsonValue[],
  environment: NodeJS.ProcessEnv = {}
): HarnessResult {
  const harness = `
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const contract = await import(${JSON.stringify(contractUrl)});
    try {
      const value = await contract[input.method](...input.args);
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
        ...environment,
      },
      input: JSON.stringify({ method, args }),
      encoding: 'utf8',
    }
  );
  expect(child.stderr).toBe('');
  const parsed: unknown = JSON.parse(child.stdout);
  expect(isHarnessResult(parsed)).toBe(true);
  if (!isHarnessResult(parsed)) {
    throw new Error('contract harness returned an invalid result');
  }
  return parsed;
}

function invokeWrapperMethod(method: string, args: JsonValue[]): HarnessResult {
  const harness = `
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const wrapper = await import(${JSON.stringify(provisioningWrapperUrl)});
    try {
      const value = await wrapper[input.method](...input.args);
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
      input: JSON.stringify({ method, args }),
      encoding: 'utf8',
    }
  );
  expect(child.stderr).toBe('');
  const parsed: unknown = JSON.parse(child.stdout);
  expect(isHarnessResult(parsed)).toBe(true);
  if (!isHarnessResult(parsed)) {
    throw new Error('wrapper harness returned an invalid result');
  }
  return parsed;
}

function invokeDpapiMethod(method: string, args: JsonValue[]): HarnessResult {
  const harness = `
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const channel = await import(${JSON.stringify(dpapiChannelUrl)});
    try {
      const value = await channel[input.method](...input.args);
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
      input: JSON.stringify({ method, args }),
      encoding: 'utf8',
    }
  );
  expect(child.stderr).toBe('');
  const parsed: unknown = JSON.parse(child.stdout);
  expect(isHarnessResult(parsed)).toBe(true);
  if (!isHarnessResult(parsed)) {
    throw new Error('DPAPI channel harness returned an invalid result');
  }
  return parsed;
}

function invokeDpapiFrameParser(
  frame: Buffer,
  requestBytes: Buffer,
  mode: 'EXECUTE' | 'RECOVERY',
  credentialConfiguration: JsonValue
): HarnessResult {
  const harness = `
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const channel = await import(${JSON.stringify(dpapiChannelUrl)});
    try {
      const value = channel.parseCredentialBrokerFrame(
        Buffer.from(input.frameBase64, 'base64'),
        Buffer.from(input.requestBase64, 'base64'),
        input.mode,
        input.credentialConfiguration
      );
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
      input: JSON.stringify({
        frameBase64: frame.toString('base64'),
        requestBase64: requestBytes.toString('base64'),
        mode,
        credentialConfiguration,
      }),
      encoding: 'utf8',
    }
  );
  expect(child.stderr).toBe('');
  const parsed: unknown = JSON.parse(child.stdout);
  expect(isHarnessResult(parsed)).toBe(true);
  if (!isHarnessResult(parsed)) {
    throw new Error('DPAPI frame harness returned an invalid result');
  }
  return parsed;
}

function makeDpapiFrame(
  requestBytes: Buffer,
  values: Array<{ role: number; bytes: Buffer }>,
  mode: 'EXECUTE' | 'RECOVERY'
): Buffer {
  const length =
    44 + values.reduce((total, value) => total + 5 + value.bytes.length, 0);
  const frame = Buffer.alloc(length);
  frame.write('PR12DPB1', 0, 'ascii');
  frame[8] = 1;
  frame[9] = mode === 'EXECUTE' ? 1 : 2;
  frame[10] = values.length;
  frame[11] = 0;
  createHash('sha256').update(requestBytes).digest().copy(frame, 12);
  let offset = 44;
  for (const value of values) {
    frame[offset] = value.role;
    frame.writeUInt32BE(value.bytes.length, offset + 1);
    offset += 5;
    value.bytes.copy(frame, offset);
    offset += value.bytes.length;
  }
  return frame;
}

function invokeEvidenceVerifierMethod(
  method: string,
  args: JsonValue[]
): HarnessResult {
  const harness = `
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const verifier = await import(${JSON.stringify(evidenceVerifierUrl)});
    try {
      const value = await verifier[input.method](...input.args);
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
      input: JSON.stringify({ method, args }),
      encoding: 'utf8',
    }
  );
  expect(child.stderr).toBe('');
  const parsed: unknown = JSON.parse(child.stdout);
  expect(isHarnessResult(parsed)).toBe(true);
  if (!isHarnessResult(parsed)) {
    throw new Error('evidence verifier harness returned an invalid result');
  }
  return parsed;
}

function runBoundedResponseHarness(
  mode: 'content-length' | 'content-type' | 'stream'
) {
  const harness = `
    const wrapper = await import(${JSON.stringify(provisioningWrapperUrl)});
    const mode = process.argv[1];
    let reads = 0;
    let cancelled = false;
    const chunks = mode === 'stream'
      ? [new Uint8Array(700000), new Uint8Array(400000)]
      : [new TextEncoder().encode('{"ok":true}')];
    const response = {
      status: 200,
      headers: {
        get(name) {
          if (name.toLowerCase() === 'content-type') {
            return mode === 'content-type' ? 'text/plain' : 'application/json';
          }
          if (name.toLowerCase() === 'content-length' && mode === 'content-length') {
            return '1048577';
          }
          return null;
        }
      },
      body: {
        getReader() {
          let index = 0;
          return {
            async read() {
              reads += 1;
              if (index >= chunks.length) return { done: true, value: undefined };
              const value = chunks[index];
              index += 1;
              return { done: false, value };
            },
            async cancel() { cancelled = true; },
            releaseLock() {}
          };
        }
      }
    };
    try {
      await wrapper.readJsonProviderResponse(response, 200);
      process.stdout.write(JSON.stringify({ ok: true, reads, cancelled }));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' ? error.code : 'UNEXPECTED_ERROR';
      const state = error && typeof error === 'object' && 'state' in error &&
        typeof error.state === 'string' ? error.state : 'UNEXPECTED_STATE';
      process.stdout.write(JSON.stringify({ ok: false, code, state, reads, cancelled }));
    }
  `;
  return spawnSync(
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
}

function makeValidFixture() {
  const providerRoot =
    'C:\\Users\\owner\\AppData\\Local\\PR12\\source-project-credentials';
  const normalizedProviderRoot = path.win32
    .resolve(providerRoot)
    .replaceAll('\\', '/')
    .toLowerCase();
  const tokenHandle =
    'windows-dpapi-cu://pr12-source-project/management-access-token/v1';
  const passwordHandle =
    'windows-dpapi-cu://pr12-source-project/database-password/v1';
  const tokenHandleSha256 = createHash('sha256')
    .update(tokenHandle, 'utf8')
    .digest('hex');
  const passwordHandleSha256 = createHash('sha256')
    .update(passwordHandle, 'utf8')
    .digest('hex');
  const credentialConfiguration = {
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
      providerRootPathSha256: createHash('sha256')
        .update(normalizedProviderRoot, 'utf8')
        .digest('hex'),
      providerRootResolvedPathSha256: createHash('sha256')
        .update(normalizedProviderRoot, 'utf8')
        .digest('hex'),
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
      brokerTimeoutMilliseconds: 15000,
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
        envelopeFilename: `${tokenHandleSha256}.dpapi.json`,
        envelopeSha256: 'f'.repeat(64),
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
        envelopeFilename: `${passwordHandleSha256}.dpapi.json`,
        envelopeSha256: '1'.repeat(64),
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
    approvedBy: 'owner@example.invalid',
    approvedAt: '2026-07-22T23:00:00.000Z',
    notes:
      'Synthetic DPAPI configuration metadata only; no secret values are persisted.',
  };

  const approvedRequestProjection = {
    db_pass: 'RUNTIME_SECRET_NOT_IN_EVIDENCE',
    desired_instance_size: 'large',
    name: 'seikotsuin-pr12-isolated-qualification-20260719',
    organization_slug: 'isolated-staging-org',
    region_selection: {
      code: 'ap-northeast-1',
      type: 'specific',
    },
  };

  const binding = {
    schemaVersion: 3,
    phase: 'SOURCE_PROJECT_PROVISIONING',
    status: 'APPROVED',
    authorization: {
      sourceProjectProvisioningAuthorized: true,
      isolatedStagingConnectionAuthorized: false,
      isolatedStagingExecutionAuthorized: false,
      restoreProjectCreationAuthorized: false,
      productionConnectionAuthorized: false,
      readyTransitionAuthorized: false,
      mergeAuthorized: false,
      commercialReleaseAuthorized: false,
      indexRetirementAuthorized: false,
    },
    provisioningAction: {
      actionId: 'PR12-ACTION-003',
      resultType: 'SOURCE_PROJECT_PROVISIONING_OPERATION',
      method: 'OWNER_MANAGEMENT_API_CREATE_PROJECT',
      httpMethod: 'POST',
      endpoint: 'https://api.supabase.com/v1/projects',
      maximumPostAttempts: 1,
      automaticPostRetryAllowed: false,
      providerIdempotencyKeyDocumented: false,
      remoteContact: true,
      mutating: true,
      mutationScope: 'SOURCE_PROJECT_CREATION',
      databaseConnectionAuthorized: false,
      requestTimeoutMilliseconds: 30000,
      readinessObservationMaximumSeconds: 900,
      readinessPollIntervalSeconds: 10,
      providerCreatedAtMaximumClockSkewSeconds: 300,
    },
    target: {
      gitCommit: 'a'.repeat(40),
      baseCommit: '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab',
      cleanWorktreeRequired: true,
    },
    governanceProposal: {
      path: 'docs/stabilization/evidence/commercial-hardening/pr12/staging-execution-approval-packet.yaml',
      sha256: '3'.repeat(64),
    },
    implementationContracts: {
      contractPath:
        'scripts/commercial-hardening/pr12-source-project-provisioning-contract.mjs',
      contractSha256: '4'.repeat(64),
      wrapperPath:
        'scripts/commercial-hardening/run-pr12-source-project-provisioning.mjs',
      wrapperSha256: '5'.repeat(64),
    },
    credentialControls: {
      provisioningCredentialConfiguration: {
        path: 'source-project-provisioning-credential-configuration-v2.json',
        sha256: '6'.repeat(64),
      },
      requiredProviderId: 'WINDOWS_DPAPI_CURRENT_USER_V1',
      requiredRetrievalChannel: 'CLAIM_BOUND_CAPTURED_STDOUT_BINARY_V1',
      providerConfigurationMustExistBeforeApproval: true,
      credentialBootstrapCompleted: true,
      credentialBootstrapExecutionAuthorizedByThisBinding: false,
      credentialRetrievalAfterDurableClaimOnly: true,
      secretValuesCaptured: false,
    },
    approvedRequest: {
      canonicalization: 'RFC8785_STYLE_SORTED_KEYS_UTF8_V1',
      projection: approvedRequestProjection,
      sha256: canonicalSha256(approvedRequestProjection),
      deprecatedOrIgnoredFieldsForbidden: [
        'organization_id',
        'plan',
        'region',
        'kps_enabled',
      ],
    },
    environmentProposal: {
      organizationId: 'org-isolated-001',
      organizationSlug: 'isolated-staging-org',
      exactOrganizationAllowBinding: true,
      organizationPlan: 'PRO',
      projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
      region: 'ap-northeast-1',
      databaseTier: 'LARGE',
      prohibitedProjectRefs: ['qnanuoqveidwvacvbhqp'],
      prohibitedOrganizationIds: ['org-production-001'],
      prohibitedOrganizationSlugs: ['production-org'],
    },
    initialPlatformPosture: {
      mutationsIncludedInPhase1: false,
      dataApiExpected: 'OWNER_EXPECTATION_ONLY_NOT_OBSERVED',
      graphQlExpected: 'OWNER_EXPECTATION_ONLY_NOT_OBSERVED',
      authExpected: 'OWNER_EXPECTATION_ONLY_NOT_OBSERVED',
      integrationExpected: 'OWNER_EXPECTATION_ONLY_NOT_OBSERVED',
      phase2ReadOnlyObservationRequired: true,
      mismatchAction:
        'STOP_NO_CONFIGURATION_MUTATION_REQUIRE_SEPARATE_APPROVAL',
    },
    duplicateAndFailurePolicy: {
      atomicLocalClaimRequiredBeforeCredentialRetrieval: true,
      durableFileFlushAndReadbackRequired: true,
      postIntentDurableBeforeFetch: true,
      postIntentPermanentlyConsumesActionIdentity: true,
      credentialBrokerFailureConsumesActionIdentity: true,
      credentialBrokerAutomaticRetryAllowed: false,
      actionJournalDirectoryPathSha256: '9'.repeat(64),
      organizationProjectListAllPagesRequiredBeforePost: true,
      fixedNameDuplicateAction: 'ABORT_POST_NOT_SENT',
      unknownRemoteOutcomeAction:
        'NO_RETRY_READ_ONLY_RECONCILIATION_AND_OWNER_DECISION',
      reconciliationOnlyMode: '--reconcile-dispatched-action',
      automaticCleanupAuthorized: false,
      destructiveRecoveryAuthorized: false,
      recoveryOwner: 'owner@example.invalid',
    },
    lifecycle: {
      sourceMaximumHoursFromCreation: 72,
      automaticDeletionAuthorized: false,
      deletionRequiresSeparateApproval: true,
      paidProjectCannotBePaused: true,
    },
    retentionAndCleanupDecision: {
      disposition:
        'DELETE_BEFORE_DEADLINE_OR_SEPARATELY_APPROVE_FUNDED_EXTENSION',
      sourceFundedHours: 72,
      fundedThrough: '2026-07-27T00:30:00.000Z',
      fundingCeilingUsdScaled: 500000,
      fundingApprovedAmountUsdScaled: 500000,
      fundingSource: 'OWNER_APPROVED_PERSONAL_PAYMENT_METHOD',
      cleanupOwner: 'owner@example.invalid',
      deletionApprovalRequester: 'owner@example.invalid',
      deletionApprovalRequestDeadline: '2026-07-25T00:00:00.000Z',
      billingEscalationOwner: 'owner@example.invalid',
      fundedExtensionOwner: 'owner@example.invalid',
    },
    cost: {
      currency: 'USD',
      moneyScale: 10000,
      computeRateUsdScaledPerProjectHour: 1517,
      sourceMaximumBillableHours: 72,
      sourceMaximumComputeUsdScaled: 109224,
      partialHourRounding: 'ROUNDED_UP_TO_FULL_HOUR',
      organizationCurrentPlan: 'PRO',
      planPurchaseOrChangeAuthorized: false,
      planIncrementalUsdScaled: 0,
      creditReliance: 'NONE',
      computeCreditAppliedUsdScaled: 0,
      taxAndOtherChargesQuoted: false,
      unallocatedAuthorizationHeadroomUsdScaled: 390776,
      knownAdditionalChargesUsdScaled: 0,
      unknownChargesAcknowledged: true,
      ownerAuthorizationCeilingUsdScaled: 500000,
      providerSpendCapEnforced: false,
      ceilingMeaning: 'OWNER_GOVERNANCE_AUTHORIZATION_NOT_PROVIDER_SPEND_CAP',
      pricingEvidence: {
        artifactPath: 'owner-private/source-project-pricing.json',
        artifactSha256: '7'.repeat(64),
        freshThrough: '2026-07-23T23:30:00.000Z',
      },
    },
    approval: {
      decision: 'APPROVED',
      attestationStatus: 'VERIFIED',
      approvedBy: 'owner@example.invalid',
      approvedAt: '2026-07-23T00:00:00.000Z',
      operatorReconfirmedAt: '2026-07-23T00:05:00.000Z',
      expiresAt: '2026-07-23T00:30:00.000Z',
      soleOperatorRiskAccepted: true,
      providerSpendCapLimitationAcknowledged: true,
      evidencePath: 'owner-private/source-project-approval.json',
      evidenceSha256: '8'.repeat(64),
      approvedActionId: 'PR12-ACTION-003',
      approvedPayloadSha256: canonicalSha256(approvedRequestProjection),
      approvedBindingMaterialSha256: 'NOT_CAPTURED',
    },
    owners: {
      commercialReleaseOwner: 'owner@example.invalid',
      provisioningOperator: 'owner@example.invalid',
      supabasePlatformOwner: 'owner@example.invalid',
      cleanupOwner: 'owner@example.invalid',
      evidenceCustodian: 'owner@example.invalid',
      databaseMigrationOperator: 'UNASSIGNED',
      disasterRecoveryOperator: 'UNASSIGNED',
      securityTenantReviewer: 'UNASSIGNED',
      clinicalDataPrivacyReviewer: 'UNASSIGNED',
      billingMessagingSandboxOwner: 'UNASSIGNED',
      siteReliabilityOwner: 'UNASSIGNED',
      incidentCommander: 'UNASSIGNED',
    },
    operatorControl: {
      mode: 'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1',
      principalDisplayName: 'FUTOSHI IWASAWA',
      principalId: 'owner@example.invalid',
      principalIdType: 'OWNER_DECLARED_STABLE_PRINCIPAL_ID',
      samePersonRoleKeys: [
        'commercialReleaseOwner',
        'provisioningOperator',
        'supabasePlatformOwner',
        'cleanupOwner',
        'evidenceCustodian',
      ],
      identitySeparationAvailable: false,
      independentHumanReviewClaimed: false,
      localPreparationExceptionAuthorized: true,
      localPreparationExceptionAuthorizedOn: '2026-07-24',
      finalActionSelfApprovalRequired: true,
      minimumCoolingOffSeconds: 300,
      maximumApprovalWindowSeconds: 1800,
      compensatingControls: [
        'EXACT_HEAD_BASE_GOVERNANCE_CONTRACT_WRAPPER_AND_PAYLOAD_HASHES',
        'EXACT_ORGANIZATION_ALLOW_BINDING_AND_PRODUCTION_DENYLIST',
        'ONE_DURABLE_CREATE_ONCE_CLAIM_NO_POST_RETRY',
        'DPAPI_CURRENT_USER_CLAIM_BOUND_POST_CLAIM_RETRIEVAL',
        'USD_50_OWNER_AUTHORIZATION_CEILING_FOR_72_HOURS',
        'PHASE2_AND_CLEANUP_DELETION_REMAIN_SEPARATELY_UNAUTHORIZED',
      ],
    },
    evidenceContract: {
      evidenceParentDirectoryPathSha256: '0'.repeat(64),
      secretFreeProjectionOnly: true,
      rawHttpHeadersPersisted: false,
      rawProviderBodiesPersisted: false,
      unexpectedProviderFieldsAction: 'FAIL_STOP_NO_BODY_PERSISTENCE',
      privacyAndSecretScanRequired: true,
      sha256ManifestRequired: true,
      atomicPartialThenRenameRequired: true,
      evidenceSealBeforeTerminalOutcomeRequired: true,
      partialEvidenceAutomaticDeletionAllowed: false,
      abortDuplicateAndPartialFailureEvidenceRequired: true,
    },
    notes:
      'Synthetic approved Phase 1 fixture; no remote action is performed by this test.',
  };

  const approvalMaterial = Object.fromEntries(
    Object.entries(binding).filter(([key]) => key !== 'approval')
  ) as JsonObject;
  binding.approval.approvedBindingMaterialSha256 =
    canonicalSha256(approvalMaterial);

  const approvalEvidence = {
    schemaVersion: 2,
    recordType: 'PR12_SOURCE_PROJECT_PROVISIONING_OWNER_APPROVAL',
    decision: 'APPROVED',
    attestationStatus: 'VERIFIED',
    attestationMethod: 'SOLE_OPERATOR_EXPLICIT_TWO_STEP_APPROVAL_RECORD',
    approverPrincipalId: 'owner@example.invalid',
    approverDisplayName: 'FUTOSHI IWASAWA',
    operatorPrincipalId: 'owner@example.invalid',
    operatorDisplayName: 'FUTOSHI IWASAWA',
    operatorControlMode: 'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1',
    identitySeparationAvailable: false,
    independentHumanReviewClaimed: false,
    soleOperatorRiskAccepted: true,
    providerSpendCapLimitationAcknowledged: true,
    actionId: 'PR12-ACTION-003',
    gitCommit: 'a'.repeat(40),
    bindingMaterialSha256: binding.approval.approvedBindingMaterialSha256,
    payloadSha256: canonicalSha256(approvedRequestProjection),
    credentialConfigurationSha256: '6'.repeat(64),
    pricingEvidenceSha256: '7'.repeat(64),
    organizationId: 'org-isolated-001',
    organizationSlug: 'isolated-staging-org',
    projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
    region: 'ap-northeast-1',
    tier: 'LARGE',
    ownerAuthorizationCeilingUsdScaled: 500000,
    authorizedDurationHours: 72,
    approvedAt: '2026-07-23T00:00:00.000Z',
    operatorReconfirmedAt: '2026-07-23T00:05:00.000Z',
    expiresAt: '2026-07-23T00:30:00.000Z',
    phase2AndLaterAuthorized: false,
    cleanupDeletionAuthorized: false,
    notes: 'Synthetic sole-operator action approval.',
  };

  const pricingEvidence = {
    schemaVersion: 2,
    recordType: 'PR12_SOURCE_PROJECT_OFFICIAL_PRICING_EVIDENCE',
    status: 'CAPTURED',
    provider: 'SUPABASE',
    currency: 'USD',
    moneyScale: 10000,
    officialSources: [
      {
        sourceId: 'COMPUTE_AND_DISK',
        url: 'https://supabase.com/docs/guides/platform/compute-and-disk',
        retrievedAt: '2026-07-22T23:30:00.000Z',
        artifactPath: 'official/compute-and-disk.html',
        artifactSha256: '2'.repeat(64),
      },
      {
        sourceId: 'COMPUTE_USAGE',
        url: 'https://supabase.com/docs/guides/platform/manage-your-usage/compute',
        retrievedAt: '2026-07-22T23:35:00.000Z',
        artifactPath: 'official/compute-usage.html',
        artifactSha256: '3'.repeat(64),
      },
      {
        sourceId: 'PRICING',
        url: 'https://supabase.com/pricing',
        retrievedAt: '2026-07-22T23:40:00.000Z',
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
      maximumAgeAtApprovalSeconds: 3600,
      lifetimeSeconds: 86400,
      freshThrough: '2026-07-23T23:30:00.000Z',
    },
    capturedBy: 'owner@example.invalid',
    rawOfficialSourceArtifactsPersistedInRepository: false,
    notes: 'Synthetic official list-price source evidence.',
  };
  const context = {
    currentHead: 'a'.repeat(40),
    currentBaseCommit: '4475e1c641c2ff18f66021ee65cfecfceaa6b7ab',
    worktreeClean: true,
    nodeVersion: 'v24.0.0',
    nodeExecArgv: [],
    now: '2026-07-23T00:10:00.000Z',
    governanceSha256: '3'.repeat(64),
    contractSha256: '4'.repeat(64),
    wrapperSha256: '5'.repeat(64),
    credentialConfigurationSha256: '6'.repeat(64),
    approvalEvidenceSha256: '8'.repeat(64),
    pricingEvidenceSha256: '7'.repeat(64),
    approvalEvidence,
    pricingEvidence,
    ambientCredentialNames: [],
    priorActionState: null,
    approvalStage: 'PRE_CLAIM',
    actionJournalDirectoryPathSha256: '9'.repeat(64),
    evidenceParentDirectoryPathSha256: '0'.repeat(64),
  };

  return {
    approvalEvidence,
    binding,
    context,
    credentialConfiguration,
    pricingEvidence,
  };
}

function expectRejected(
  method: string,
  args: JsonValue[],
  expectedCode: string,
  environment: NodeJS.ProcessEnv = {}
) {
  const result = invokeContract(method, args, environment);
  expect(result).toEqual({ ok: false, code: expectedCode });
}

describe('PR12 Phase 1 source project provisioning contract', () => {
  test('accepts only a fully hash-bound, current sole-operator exception approval', () => {
    const fixture = makeValidFixture();
    const result = invokeContract('validateOfflineApproval', [
      fixture.binding,
      fixture.credentialConfiguration,
      fixture.context,
    ]);
    expect(result.ok).toBe(true);
  });

  test.each([
    [
      'unsigned binding',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.approval.attestationStatus = 'UNSIGNED';
      },
      'APPROVAL_ATTESTATION_INVALID',
    ],
    [
      'expired binding',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.context.now = '2026-07-24T00:00:00.000Z';
      },
      'APPROVAL_EXPIRED',
    ],
    [
      'non-canonical invalid-calendar approval timestamp',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.approval.expiresAt = '2026-02-31T00:00:00.000Z';
      },
      'APPROVAL_INVALID',
    ],
    [
      'wrong head',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.context.currentHead = 'b'.repeat(40);
      },
      'GIT_HEAD_MISMATCH',
    ],
    [
      'wrong base',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.context.currentBaseCommit = 'b'.repeat(40);
      },
      'GIT_BASE_MISMATCH',
    ],
    [
      'Node runtime hook flag',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.context.nodeExecArgv = ['--import', 'unapproved-hook.mjs'];
      },
      'NODE_RUNTIME_BOUNDARY_INVALID',
    ],
    [
      'changed payload',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.approvedRequest.projection.name =
          'changed-after-approval';
      },
      'REQUEST_PAYLOAD_HASH_MISMATCH',
    ],
    [
      'production organization',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.environmentProposal.organizationSlug = 'production-org';
      },
      'PRODUCTION_ORGANIZATION_DENIED',
    ],
    [
      'alternate-case production organization',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.environmentProposal.organizationSlug = 'Production-Org';
      },
      'PRODUCTION_ORGANIZATION_DENIED',
    ],
    [
      'missing frozen production project ref',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.environmentProposal.prohibitedProjectRefs = [
          'abcdefghijklmnopqrst',
        ];
      },
      'PRODUCTION_TARGET_DENYLIST_MISSING',
    ],
    [
      'case-changed production project ref',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.environmentProposal.prohibitedProjectRefs = [
          'QNANUOQVEIDWVACVBHQP',
        ];
      },
      'PRODUCTION_TARGET_DENYLIST_MISSING',
    ],
    [
      'changed fixed project name',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.environmentProposal.projectName =
          'seikotsuin-pr12-isolated-qualification-changed';
      },
      'PROJECT_NAME_INVALID',
    ],
    [
      'sole-operator principal mismatch',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.owners.provisioningOperator =
          'approver@example.invalid';
        fixture.binding.owners.supabasePlatformOwner =
          'approver@example.invalid';
      },
      'SOLE_OPERATOR_EXCEPTION_INVALID',
    ],
    [
      'missing secret-store handle',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.secrets.managementAccessToken.opaqueHandle =
          'NOT_CAPTURED';
      },
      'CREDENTIAL_HANDLE_MISSING',
    ],
    [
      'changed resolved provider-root fingerprint',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.provider.providerRootResolvedPathSha256 =
          '9'.repeat(64);
      },
      'CREDENTIAL_PROVIDER_NOT_APPROVED',
    ],
    [
      'missing provider-root filesystem identity',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.provider.providerRootDevice =
          'NOT_CAPTURED';
      },
      'CREDENTIAL_PROVIDER_NOT_APPROVED',
    ],
    [
      'disabled provider-root path-component guard',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.storageBoundary.allProviderRootPathComponentsMustBeNonReparse = false;
      },
      'CREDENTIAL_STORAGE_INVALID',
    ],
    [
      'secret-store handle userinfo',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.secrets.managementAccessToken.opaqueHandle =
          'owner-vault://user:secret@pr12/source/management-token';
      },
      'CREDENTIAL_HANDLE_INVALID',
    ],
    [
      'secret-store handle query',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.secrets.managementAccessToken.opaqueHandle =
          'owner-vault://pr12/source/management-token?token=secret';
      },
      'CREDENTIAL_HANDLE_INVALID',
    ],
    [
      'secret-store handle fragment',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.secrets.managementAccessToken.opaqueHandle =
          'owner-vault://pr12/source/management-token#secret';
      },
      'CREDENTIAL_HANDLE_INVALID',
    ],
    [
      'credential configuration with an unbound extra field',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        Object.assign(fixture.credentialConfiguration, {
          unexpectedSecretSource: 'ambient-fallback',
        });
      },
      'CREDENTIAL_CONFIGURATION_INVALID',
    ],
    [
      'binding with an unknown field',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        Object.assign(fixture.binding, {
          impliedAdditionalAuthority: true,
        });
      },
      'BINDING_SCHEMA_INVALID',
    ],
    [
      'governance path traversal',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.governanceProposal.path = '../.env';
      },
      'GOVERNANCE_HASH_MISMATCH',
    ],
    [
      'credential provider approval after provisioning approval',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.approvedAt = '2026-07-23T00:00:00.001Z';
      },
      'CREDENTIAL_APPROVAL_CHRONOLOGY_INVALID',
    ],
    [
      'credential scope expansion',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.secrets.managementAccessToken.requiredFineGrainedPermissions.push(
          'project_admin_write'
        );
      },
      'CREDENTIAL_CONFIGURATION_INVALID',
    ],
    [
      'secret-bearing approval input',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.environmentProposal.organizationId =
          'Bearer abcdefghijklmnopqrstuvwxyz';
      },
      'SECRET_BEARING_EVIDENCE',
    ],
    [
      'duplicate action',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.context.priorActionState =
          'POST_INTENT_DURABLE_OUTCOME_UNRESOLVED';
      },
      'ACTION_ALREADY_CLAIMED',
    ],
    [
      'different recovery owner under sole-operator mode',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.duplicateAndFailurePolicy.recoveryOwner =
          'different-owner@example.invalid';
      },
      'DUPLICATE_GUARD_INVALID',
    ],
    [
      'missing official pricing evidence binding',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.cost.pricingEvidence.freshThrough = 'NOT_CAPTURED';
      },
      'PRICING_EVIDENCE_NOT_CAPTURED',
    ],
    [
      'missing funding',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.retentionAndCleanupDecision.fundedThrough =
          'NOT_CAPTURED';
      },
      'FUNDING_NOT_CAPTURED',
    ],
    [
      'non-classified funding source',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.retentionAndCleanupDecision.fundingSource =
          'personal card ending 1234';
      },
      'FUNDING_NOT_CAPTURED',
    ],
    [
      'shortened funding window',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.retentionAndCleanupDecision.sourceFundedHours = 1;
      },
      'FUNDING_NOT_CAPTURED',
    ],
    [
      'shortened billable window',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.cost.sourceMaximumBillableHours = 1;
        fixture.binding.cost.sourceMaximumComputeUsdScaled = 1517;
      },
      'PRICING_ARITHMETIC_INVALID',
    ],
    [
      'changed documented Large hourly rate',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.cost.computeRateUsdScaledPerProjectHour = 2000;
        fixture.binding.cost.sourceMaximumComputeUsdScaled = 144000;
      },
      'PRICING_ARITHMETIC_INVALID',
    ],
    [
      'changed funding ceiling',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.cost.ownerAuthorizationCeilingUsdScaled = 600000;
        fixture.binding.retentionAndCleanupDecision.fundingCeilingUsdScaled = 600000;
      },
      'PRICING_ARITHMETIC_INVALID',
    ],
    [
      'negative known additional charge',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.cost.knownAdditionalChargesUsdScaled = -1;
      },
      'KNOWN_COST_NOT_CAPTURED',
    ],
    [
      'past cleanup approval deadline',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.retentionAndCleanupDecision.deletionApprovalRequestDeadline =
          '2026-07-23T00:09:59.999Z';
      },
      'CLEANUP_DECISION_INCOMPLETE',
    ],
    [
      'missing cleanup owner',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.retentionAndCleanupDecision.cleanupOwner = 'UNASSIGNED';
      },
      'CLEANUP_DECISION_INCOMPLETE',
    ],
    [
      'case-variant approver identity',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.approval.approvedBy = 'Owner@example.invalid';
        fixture.binding.owners.commercialReleaseOwner = 'Owner@example.invalid';
        fixture.approvalEvidence.approverPrincipalId = 'Owner@example.invalid';
      },
      'APPROVAL_ATTESTATION_INVALID',
    ],
    [
      'whitespace owner identity',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.owners.cleanupOwner = 'cleanup-owner@example.invalid ';
      },
      'OWNER_ASSIGNMENT_INVALID',
    ],
    [
      'incomplete declared sole-operator role set',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.operatorControl.samePersonRoleKeys = [
          'provisioningOperator',
        ];
      },
      'SOLE_OPERATOR_EXCEPTION_INVALID',
    ],
    [
      'sole-operator final action risk not accepted',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.approval.soleOperatorRiskAccepted = false;
      },
      'SOLE_OPERATOR_EXCEPTION_INVALID',
    ],
    [
      'sole-operator cooling-off period bypassed',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.approval.operatorReconfirmedAt =
          '2026-07-23T00:04:59.999Z';
      },
      'APPROVAL_WINDOW_INVALID',
    ],
    [
      'claimed provider-enforced spend cap',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.cost.providerSpendCapEnforced = true;
      },
      'PRICING_ARITHMETIC_INVALID',
    ],
    [
      'funding below the full owner authorization ceiling',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.retentionAndCleanupDecision.fundingApprovedAmountUsdScaled = 499999;
      },
      'FUNDING_NOT_CAPTURED',
    ],
    [
      'legacy Dashboard quote evidence',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.pricingEvidence.recordType =
          'PR12_SOURCE_PROJECT_DASHBOARD_QUOTE';
      },
      'PRICING_EVIDENCE_INVALID',
    ],
    [
      'changed official pricing source URL',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.pricingEvidence.officialSources[0].url =
          'https://example.invalid/pricing';
      },
      'PRICING_EVIDENCE_INVALID',
    ],
    [
      'stale official pricing source at approval',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.pricingEvidence.officialSources[0].retrievedAt =
          '2026-07-22T22:59:59.999Z';
      },
      'PRICING_EVIDENCE_FRESHNESS_INVALID',
    ],
    [
      'non-DPAPI credential provider',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.provider.providerId =
          'OWNER_VAULT_PROVISIONING';
      },
      'CREDENTIAL_PROVIDER_NOT_APPROVED',
    ],
    [
      'real credential bootstrap not completed',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.credentialConfiguration.bootstrap.realCredentialBootstrapCompleted = false;
      },
      'CREDENTIAL_BOOTSTRAP_INVALID',
    ],
    [
      'shared journal and evidence output directory',
      (fixture: ReturnType<typeof makeValidFixture>) => {
        fixture.binding.evidenceContract.evidenceParentDirectoryPathSha256 =
          fixture.binding.duplicateAndFailurePolicy.actionJournalDirectoryPathSha256;
        fixture.context.evidenceParentDirectoryPathSha256 =
          fixture.context.actionJournalDirectoryPathSha256;
      },
      'RUNTIME_OUTPUT_DIRECTORIES_MUST_DIFFER',
    ],
  ])('rejects %s before remote contact', (_label, mutate, expectedCode) => {
    const fixture = makeValidFixture();
    mutate(fixture);
    expectRejected(
      'validateOfflineApproval',
      [fixture.binding, fixture.credentialConfiguration, fixture.context],
      expectedCode
    );
  });

  test('rejects ambient generic Supabase credential fallback', () => {
    const fixture = makeValidFixture();
    fixture.context.ambientCredentialNames = ['SUPABASE_ACCESS_TOKEN'];
    expectRejected(
      'validateOfflineApproval',
      [fixture.binding, fixture.credentialConfiguration, fixture.context],
      'AMBIENT_CREDENTIAL_FORBIDDEN'
    );
  });

  test('rejects a Management token miswired as the database password', () => {
    const sharedSyntheticValue = 'x'.repeat(40);
    expect(
      invokeWrapperMethod('validateRuntimeCredentialValues', [
        sharedSyntheticValue,
        sharedSyntheticValue,
        32,
      ])
    ).toEqual({ ok: false, code: 'CREDENTIAL_VALUES_MISWIRED' });
  });

  test.each([
    'SUPABASE_PROJECT_REF',
    'SUPABASE_AUTH_TOKEN',
    'NEXT_PUBLIC_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'MY_SUPABASE_TOKEN',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'PGPASSFILE',
    'PR12_SUPABASE_ACCESS_TOKEN',
    'PR12_SOURCE_DB_PASSWORD',
    'PR12_RESTORE_DB_PASSWORD',
    'PR12_RESTORE_SUPABASE_ACCESS_TOKEN',
    'PR12_SUPABASE_ACCESS_TOKEN_BACKUP',
    'NODE_TLS_REJECT_UNAUTHORIZED',
    'NODE_USE_ENV_PROXY',
    'HTTPS_PROXY',
    'NODE_DEBUG',
    'NODE_DEBUG_NATIVE',
    'NODE_USE_SYSTEM_CA',
    'NODE_OPTIONS',
    'OPENSSL_CONF',
    'OPENSSL_MODULES',
    'SSLKEYLOGFILE',
  ])('rejects ambient generic credential family %s', variableName => {
    const fixture = makeValidFixture();
    fixture.context.ambientCredentialNames = [variableName];
    expectRejected(
      'validateOfflineApproval',
      [fixture.binding, fixture.credentialConfiguration, fixture.context],
      'AMBIENT_CREDENTIAL_FORBIDDEN'
    );
  });

  test('builds exact claim-bound DPAPI requests and omits the database password from recovery', () => {
    const fixture = makeValidFixture();
    const common = {
      bindingMaterialSha256: 'a'.repeat(64),
      payloadSha256: 'b'.repeat(64),
      claimSha256: 'c'.repeat(64),
      credentialConfigurationSha256: 'd'.repeat(64),
      credentialConfiguration: fixture.credentialConfiguration,
      journalDirectory: 'C:\\PR12\\journal',
      journalDirectoryPathSha256: 'e'.repeat(64),
      evidenceParentDirectory: 'C:\\PR12\\evidence',
      evidenceParentDirectoryPathSha256: '1'.repeat(64),
      approvalExpiresAt: '2026-07-23T00:30:00.000Z',
      requestNonce: 'f'.repeat(64),
    };
    const execute = invokeDpapiMethod('buildCredentialBrokerRequest', [
      { ...common, mode: 'EXECUTE' },
    ]);
    const recovery = invokeDpapiMethod('buildCredentialBrokerRequest', [
      { ...common, mode: 'RECOVERY' },
    ]);
    expect(execute.ok).toBe(true);
    expect(JSON.stringify(execute.value)).toContain('MANAGEMENT_ACCESS_TOKEN');
    expect(JSON.stringify(execute.value)).toContain('DATABASE_PASSWORD');
    expect(JSON.stringify(execute.value)).toContain('bootstrapScriptSha256');
    expect(JSON.stringify(execute.value)).toContain(
      'providerRootResolvedPathSha256'
    );
    expect(JSON.stringify(execute.value)).toContain('evidenceParentDirectory');
    expect(recovery.ok).toBe(true);
    expect(JSON.stringify(recovery.value)).toContain('MANAGEMENT_ACCESS_TOKEN');
    expect(JSON.stringify(recovery.value)).not.toContain('DATABASE_PASSWORD');
  });

  test('rejects overlapping provider, journal, and evidence directory trees', () => {
    const provider = { realPath: 'c:/pr12/provider' };
    const journal = { realPath: 'c:/pr12/provider/journal' };
    const evidence = { realPath: 'c:/pr12/evidence' };
    expect(
      invokeDpapiMethod('assertDpapiDirectoryIsolation', [
        provider,
        journal,
        evidence,
      ])
    ).toEqual({ ok: false, code: 'DPAPI_DIRECTORY_BOUNDARY_COLLISION' });
    expect(
      invokeDpapiMethod('assertDpapiDirectoryIsolation', [
        provider,
        { realPath: 'c:/pr12/journal' },
        evidence,
      ])
    ).toMatchObject({ ok: true, value: true });
  });

  test('rejects a provider root beneath a junction ancestor on Windows', () => {
    if (process.platform !== 'win32') return;
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-dpapi-junction-ancestor-')
    );
    const target = path.join(root, 'target');
    const leaf = path.join(target, 'leaf');
    const junction = path.join(root, 'junction');
    try {
      fs.mkdirSync(leaf, { recursive: true });
      fs.symlinkSync(target, junction, 'junction');
      expect(
        invokeDpapiMethod('inspectDpapiDirectoryIdentity', [
          path.join(junction, 'leaf'),
        ])
      ).toEqual({ ok: false, code: 'DPAPI_PROVIDER_ROOT_INVALID' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('accepts only the exact bounded DPAPI binary frame', () => {
    const fixture = makeValidFixture();
    const requestBytes = Buffer.from('{"synthetic":"request"}\n', 'utf8');
    const valid = makeDpapiFrame(
      requestBytes,
      [
        { role: 1, bytes: Buffer.from('t'.repeat(20), 'utf8') },
        { role: 2, bytes: Buffer.from('p'.repeat(32), 'utf8') },
      ],
      'EXECUTE'
    );
    const accepted = invokeDpapiFrameParser(
      valid,
      requestBytes,
      'EXECUTE',
      fixture.credentialConfiguration
    );
    expect(accepted.ok).toBe(true);
    expect(accepted.value).toEqual({
      managementAccessToken: 't'.repeat(20),
      databasePassword: 'p'.repeat(32),
    });

    const wrongDigest = Buffer.from(valid);
    wrongDigest[12] ^= 0xff;
    const wrongRole = Buffer.from(valid);
    wrongRole[44] = 2;
    const invalidUtf8 = makeDpapiFrame(
      requestBytes,
      [
        {
          role: 1,
          bytes: Buffer.from([0xff, ...Buffer.from('t'.repeat(19), 'utf8')]),
        },
        { role: 2, bytes: Buffer.from('p'.repeat(32), 'utf8') },
      ],
      'EXECUTE'
    );
    for (const malformed of [
      valid.subarray(0, valid.length - 1),
      Buffer.concat([valid, Buffer.from([0])]),
      wrongDigest,
      wrongRole,
      invalidUtf8,
      Buffer.alloc(8193),
    ]) {
      expect(
        invokeDpapiFrameParser(
          malformed,
          requestBytes,
          'EXECUTE',
          fixture.credentialConfiguration
        )
      ).toEqual({ ok: false, code: 'DPAPI_BROKER_FRAME_INVALID' });
    }
  });

  test('keeps DPAPI retrieval after the durable claim and never relays broker output', () => {
    const wrapperSource = fs.readFileSync(provisioningWrapperPath, 'utf8');
    const executeStart = wrapperSource.indexOf(
      'async function executeProvisioning'
    );
    const claimIndex = wrapperSource.indexOf(
      'claimActionJournal(journalDirectory, claim)',
      executeStart
    );
    const brokerIndex = wrapperSource.indexOf(
      'retrieveClaimBoundCredentials({',
      executeStart
    );
    expect(executeStart).toBeGreaterThanOrEqual(0);
    expect(claimIndex).toBeGreaterThan(executeStart);
    expect(brokerIndex).toBeGreaterThan(claimIndex);
    expect(wrapperSource).not.toContain('process.env[tokenName]');
    expect(wrapperSource).not.toContain('process.env[passwordName]');

    const channelSource = fs.readFileSync(dpapiChannelPath, 'utf8');
    expect(channelSource).toContain('stdio');
    expect(channelSource).toContain('stdout?.fill(0)');
    expect(channelSource).toContain('stderr?.fill(0)');
    expect(channelSource).not.toContain('process.stdout.write');
    expect(channelSource).not.toContain('process.stderr.write');

    const brokerSource = fs.readFileSync(dpapiBrokerPath, 'utf8');
    const bootstrapSource = fs.readFileSync(dpapiBootstrapPath, 'utf8');
    expect(brokerSource).toContain('[Console]::OpenStandardOutput()');
    expect(brokerSource).not.toMatch(/\bWrite-(?:Host|Output|Error|Warning)\b/);
    expect(brokerSource).toContain('Assert-NoReparsePathComponents');
    expect(brokerSource).toContain(
      'ConvertFrom-Json -Depth 20 -DateKind String'
    );
    expect(brokerSource).toContain('$envelope.bootstrapScriptSha256 -cne');
    expect(bootstrapSource).toContain('[IO.FileMode]::CreateNew');
    expect(bootstrapSource).toContain('realSecretInteractiveReadAuthorized');
    expect(bootstrapSource).toContain('Assert-NoReparsePathComponents');
    expect(bootstrapSource).toContain(
      'ConvertFrom-Json -Depth 10 -DateKind String'
    );
    expect(bootstrapSource).toContain(
      "$authorization.approvedByDisplayName -cne 'FUTOSHI IWASAWA'"
    );
    expect(wrapperSource).toContain(
      'requireNoReparseDirectoryComponents(directory, code)'
    );
  });

  test('parses the bootstrap approval template before stopping as unauthorized', () => {
    if (process.platform !== 'win32') return;
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-dpapi-bootstrap-negative-')
    );
    try {
      const template = JSON.parse(
        fs.readFileSync(
          path.join(
            phase1EvidenceRoot,
            'source-project-dpapi-bootstrap-approval-v1.template.json'
          ),
          'utf8'
        )
      ) as JsonObject;
      const now = Date.now();
      template.approvedAt = new Date(now - 60_000).toISOString();
      template.expiresAt = new Date(now + 300_000).toISOString();
      for (const key of [
        'bootstrapScriptSha256',
        'machineNameSha256',
        'ownerSidSha256',
        'providerRootPathSha256',
        'providerRootResolvedPathSha256',
      ]) {
        template[key] = 'a'.repeat(64);
      }
      const authorizationPath = path.join(
        temporaryDirectory,
        'bootstrap-approval.json'
      );
      fs.writeFileSync(
        authorizationPath,
        `${JSON.stringify(template, null, 2)}\n`,
        'utf8'
      );
      const child = spawnSync(
        'pwsh.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          dpapiBootstrapPath,
          '-Role',
          'MANAGEMENT_ACCESS_TOKEN',
          '-AuthorizationEvidencePath',
          authorizationPath,
        ],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          windowsHide: true,
        }
      );
      expect(child.status).toBe(1);
      expect(child.stdout).toBe('');
      expect(child.stderr).toContain('BOOTSTRAP_NOT_AUTHORIZED');
      expect(child.stderr).not.toContain('INVALID_SHAPE');
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  test('the wrapper stops an unapproved template before journal claim', () => {
    const journalDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-journal-')
    );
    const evidenceParent = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-output-')
    );
    const child = spawnSync(
      process.execPath,
      [
        provisioningWrapperPath,
        '--offline-verify',
        '--binding',
        path.join(
          phase1EvidenceRoot,
          'source-project-provisioning-binding-v3.template.json'
        ),
        '--credential-config',
        path.join(
          phase1EvidenceRoot,
          'source-project-provisioning-credential-configuration-v2.template.json'
        ),
        '--approval-evidence',
        path.join(
          phase1EvidenceRoot,
          'source-project-provisioning-owner-approval-v2.template.json'
        ),
        '--pricing-evidence',
        path.join(
          phase1EvidenceRoot,
          'source-project-official-pricing-evidence-v2.template.json'
        ),
        '--journal-directory',
        journalDirectory,
        '--evidence-parent',
        evidenceParent,
      ],
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
    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr).toContain('SOURCE_PROVISIONING_NOT_AUTHORIZED');
    expect(fs.readdirSync(journalDirectory)).toEqual([]);
    expect(fs.readdirSync(evidenceParent)).toEqual([]);
  });

  test('rejects a copied implementation tree invoked from the approved Git cwd', () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-foreign-wrapper-')
    );
    const implementationDirectory = path.join(temporaryRoot, 'implementation');
    const journalDirectory = path.join(temporaryRoot, 'journal');
    const evidenceParent = path.join(temporaryRoot, 'evidence');
    fs.mkdirSync(implementationDirectory);
    fs.mkdirSync(journalDirectory);
    fs.mkdirSync(evidenceParent);
    const implementationFilenames = [
      'run-pr12-source-project-provisioning.mjs',
      'pr12-source-project-provisioning-contract.mjs',
      'pr12-windows-dpapi-credential-channel.mjs',
      'verify-pr12-source-project-provisioning-evidence.mjs',
    ];
    try {
      for (const filename of implementationFilenames) {
        fs.copyFileSync(
          path.join(repoRoot, 'scripts', 'commercial-hardening', filename),
          path.join(implementationDirectory, filename)
        );
      }
      const child = spawnSync(
        process.execPath,
        [
          path.join(
            implementationDirectory,
            'run-pr12-source-project-provisioning.mjs'
          ),
          '--offline-verify',
          '--binding',
          path.join(
            phase1EvidenceRoot,
            'source-project-provisioning-binding-v3.template.json'
          ),
          '--credential-config',
          path.join(
            phase1EvidenceRoot,
            'source-project-provisioning-credential-configuration-v2.template.json'
          ),
          '--approval-evidence',
          path.join(
            phase1EvidenceRoot,
            'source-project-provisioning-owner-approval-v2.template.json'
          ),
          '--pricing-evidence',
          path.join(
            phase1EvidenceRoot,
            'source-project-official-pricing-evidence-v2.template.json'
          ),
          '--journal-directory',
          journalDirectory,
          '--evidence-parent',
          evidenceParent,
        ],
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
      expect(child.status).toBe(1);
      expect(child.stdout).toBe('');
      expect(child.stderr).toContain('EXECUTING_IMPLEMENTATION_ROOT_MISMATCH');
      expect(fs.readdirSync(journalDirectory)).toEqual([]);
      expect(fs.readdirSync(evidenceParent)).toEqual([]);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  test('rejects a relative runtime output directory before reading approval inputs', () => {
    const evidenceParent = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-absolute-output-')
    );
    const child = spawnSync(
      process.execPath,
      [
        provisioningWrapperPath,
        '--offline-verify',
        '--binding',
        path.join(
          phase1EvidenceRoot,
          'source-project-provisioning-binding-v3.template.json'
        ),
        '--credential-config',
        path.join(
          phase1EvidenceRoot,
          'source-project-provisioning-credential-configuration-v2.template.json'
        ),
        '--approval-evidence',
        path.join(
          phase1EvidenceRoot,
          'source-project-provisioning-owner-approval-v2.template.json'
        ),
        '--pricing-evidence',
        path.join(
          phase1EvidenceRoot,
          'source-project-official-pricing-evidence-v2.template.json'
        ),
        '--journal-directory',
        '.',
        '--evidence-parent',
        evidenceParent,
      ],
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
    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr).toContain('ACTION_JOURNAL_DIRECTORY_INVALID');
    expect(fs.readdirSync(evidenceParent)).toEqual([]);
  });

  test('rejects a junction ancestor in a runtime output path before approval parsing', () => {
    const linkRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-junction-')
    );
    const repositoryLink = path.join(linkRoot, 'repository-link');
    fs.symlinkSync(repoRoot, repositoryLink, 'junction');
    const evidenceParent = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-junction-output-')
    );
    const child = spawnSync(
      process.execPath,
      [
        provisioningWrapperPath,
        '--offline-verify',
        '--binding',
        path.join(
          phase1EvidenceRoot,
          'source-project-provisioning-binding-v3.template.json'
        ),
        '--credential-config',
        path.join(
          phase1EvidenceRoot,
          'source-project-provisioning-credential-configuration-v2.template.json'
        ),
        '--approval-evidence',
        path.join(
          phase1EvidenceRoot,
          'source-project-provisioning-owner-approval-v2.template.json'
        ),
        '--pricing-evidence',
        path.join(
          phase1EvidenceRoot,
          'source-project-official-pricing-evidence-v2.template.json'
        ),
        '--journal-directory',
        path.join(repositoryLink, 'docs'),
        '--evidence-parent',
        evidenceParent,
      ],
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
    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr).toContain('ACTION_JOURNAL_DIRECTORY_INVALID');
    expect(fs.readdirSync(evidenceParent)).toEqual([]);
  });

  test('freezes the exact current create body without deprecated fields', () => {
    const fixture = makeValidFixture();
    const result = invokeContract('buildSecretFreeRequestProjection', [
      fixture.binding,
      fixture.credentialConfiguration,
    ]);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(fixture.binding.approvedRequest.projection);
    expect(JSON.stringify(result.value)).not.toMatch(
      /"(?:organization_id|plan|region|kps_enabled)"/
    );
  });

  test('allows documented transient create status but rejects unexpected fields', () => {
    const fixture = makeValidFixture();
    const response = {
      id: 'deprecated-provider-project-id',
      ref: 'abcdefghijklmnopqrst',
      organization_id: 'org-isolated-001',
      organization_slug: 'isolated-staging-org',
      name: 'seikotsuin-pr12-isolated-qualification-20260719',
      region: 'ap-northeast-1',
      created_at: '2026-07-23T12:01:00.000Z',
      status: 'INACTIVE',
    };
    expect(
      invokeContract('projectCreateResponseToSafeProjection', [
        response,
        fixture.binding,
      ]).ok
    ).toBe(true);
    expect(
      invokeContract('projectCreateResponseToSafeProjection', [
        { ...response, created_at: '2026-07-23T12:01:00Z' },
        fixture.binding,
      ])
    ).toMatchObject({
      ok: true,
      value: { createdAt: '2026-07-23T12:01:00.000Z' },
    });
    expectRejected(
      'projectCreateResponseToSafeProjection',
      [
        { ...response, unexpected_secret: 'must-never-persist' },
        fixture.binding,
      ],
      'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
    );
    expectRejected(
      'projectCreateResponseToSafeProjection',
      [
        {
          ...response,
          id: 'qnanuoqveidwvacvbhqp',
          ref: 'qnanuoqveidwvacvbhqp',
        },
        fixture.binding,
      ],
      'PRODUCTION_TARGET_DENIED'
    );
    expectRejected(
      'projectCreateResponseToSafeProjection',
      [{ ...response, id: 'qnanuoqveidwvacvbhqp' }, fixture.binding],
      'PRODUCTION_TARGET_DENIED'
    );
    expectRejected(
      'projectCreateResponseToSafeProjection',
      [{ ...response, created_at: '2026-02-31T12:01:00Z' }, fixture.binding],
      'PROVIDER_RESPONSE_TARGET_MISMATCH'
    );
  });

  test('strictly validates documented JSON media types', () => {
    expect(
      invokeContract('assertProviderBodyEnvelope', [
        'application/json; charset=utf-8',
        '{"ok":true}',
      ]).ok
    ).toBe(true);
    expectRejected(
      'assertProviderBodyEnvelope',
      ['application/jsonp', '{"ok":true}'],
      'PROVIDER_CONTENT_TYPE_INVALID'
    );
    expectRejected(
      'assertProviderBodyEnvelope',
      ['application/json-evil', '{"ok":true}'],
      'PROVIDER_CONTENT_TYPE_INVALID'
    );
  });

  test('blocks every remote contact once approval has expired', () => {
    expect(
      invokeWrapperMethod('assertRemoteContactWithinApproval', [
        '2026-07-23T12:00:00.000Z',
        '2026-07-23T12:00:00.000Z',
        0,
      ])
    ).toEqual({
      ok: false,
      code: 'APPROVAL_EXPIRED_BEFORE_REMOTE_CONTACT',
    });
    expect(
      invokeWrapperMethod('assertRemoteContactWithinApproval', [
        '2026-07-23T12:00:01.000Z',
        '2026-07-23T12:00:00.000Z',
        0,
      ]).ok
    ).toBe(true);
    const source = fs.readFileSync(provisioningWrapperPath, 'utf8');
    expect(source.indexOf('assertRemoteContactWithinApproval(')).toBeLessThan(
      source.indexOf('return fetch(url,')
    );
  });

  test('blocks the create POST when official pricing evidence lacks timeout margin', () => {
    expect(
      invokeWrapperMethod('assertMutationPricingCurrent', [
        '2026-07-23T12:00:30.000Z',
        '2026-07-23T12:00:00.000Z',
        30_000,
      ])
    ).toEqual({
      ok: false,
      code: 'PRICING_EVIDENCE_EXPIRED_BEFORE_POST',
    });
    expect(
      invokeWrapperMethod('assertMutationPricingCurrent', [
        '2026-07-23T12:00:30.001Z',
        '2026-07-23T12:00:00.000Z',
        30_000,
      ]).ok
    ).toBe(true);
  });

  test('strictly validates nested region provider response shapes', () => {
    const fixture = makeValidFixture();
    const response = {
      recommendations: {
        smartGroup: { name: 'APAC', code: 'apac', type: 'smartGroup' },
        specific: [],
      },
      all: {
        smartGroup: [{ name: 'APAC', code: 'apac', type: 'smartGroup' }],
        specific: [
          {
            name: 'Tokyo',
            code: 'ap-northeast-1',
            type: 'specific',
            provider: 'AWS',
            status: 'capacity',
          },
        ],
      },
    };
    expect(
      invokeContract('availableRegionsToSafeProjection', [
        response,
        fixture.binding,
      ]).ok
    ).toBe(true);
    expectRejected(
      'availableRegionsToSafeProjection',
      [
        {
          ...response,
          recommendations: {
            ...response.recommendations,
            smartGroup: {
              ...response.recommendations.smartGroup,
              unexpected: true,
            },
          },
        },
        fixture.binding,
      ],
      'PROVIDER_RESPONSE_UNEXPECTED_FIELD'
    );
    expectRejected(
      'availableRegionsToSafeProjection',
      [
        {
          ...response,
          all: {
            ...response.all,
            specific: [
              {
                ...response.all.specific[0],
                provider: 'UNDOCUMENTED_PROVIDER',
              },
            ],
          },
        },
        fixture.binding,
      ],
      'PROVIDER_RESPONSE_INVALID'
    );
  });

  test.each([
    ['content-length', 'PROVIDER_BODY_SIZE_INVALID', 0, false],
    ['content-type', 'PROVIDER_CONTENT_TYPE_INVALID', 0, false],
    ['stream', 'PROVIDER_BODY_SIZE_INVALID', 2, true],
  ] as const)(
    'bounds provider body memory before JSON parsing (%s)',
    (mode, expectedCode, expectedReads, expectedCancelled) => {
      const child = runBoundedResponseHarness(mode);
      expect(child.status).toBe(0);
      expect(child.stderr).toBe('');
      expect(JSON.parse(child.stdout)).toEqual({
        ok: false,
        code: expectedCode,
        state: 'PRECHECK_ABORTED',
        reads: expectedReads,
        cancelled: expectedCancelled,
      });
    }
  );

  test('projects the documented nested Large addon shape only', () => {
    const result = invokeContract('addonResponseToSafeProjection', [
      {
        selected_addons: [
          {
            type: 'compute_instance',
            variant: {
              id: 'ci_large',
              name: 'Large',
              price: {
                description: 'Large hourly compute',
                type: 'usage',
                interval: 'hourly',
                amount: 0.1517,
              },
              meta: null,
            },
          },
        ],
        available_addons: [],
      },
      'abcdefghijklmnopqrst',
    ]);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      projectRef: 'abcdefghijklmnopqrst',
      addonType: 'compute_instance',
      variantId: 'ci_large',
    });
    const smallVariant = {
      id: 'ci_small',
      name: 'Small',
      price: {
        description: 'Small hourly compute',
        type: 'usage',
        interval: 'hourly',
        amount: 0.02,
      },
      meta: null,
    };
    expectRejected(
      'addonResponseToSafeProjection',
      [
        {
          selected_addons: [
            {
              type: 'compute_instance',
              variant: {
                id: 'ci_large',
                name: 'Large',
                price: {
                  description: 'Large hourly compute',
                  type: 'usage',
                  interval: 'hourly',
                  amount: 0.1517,
                },
                meta: null,
              },
            },
            { type: 'compute_instance', variant: smallVariant },
          ],
          available_addons: [],
        },
        'abcdefghijklmnopqrst',
      ],
      'LARGE_COMPUTE_NOT_OBSERVED'
    );
  });

  test('rejects evidence containing a runtime secret or bearer material', () => {
    expectRejected(
      'assertSecretFreeEvidence',
      [
        {
          actionId: 'PR12-ACTION-003',
          authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
        },
        [],
      ],
      'SECRET_BEARING_EVIDENCE'
    );
    expectRejected(
      'assertSecretFreeEvidence',
      [
        {
          actionId: 'PR12-ACTION-003',
          note: 'synthetic-runtime-secret',
        },
        ['synthetic-runtime-secret'],
      ],
      'SECRET_BEARING_EVIDENCE',
      { PR12_SYNTHETIC_SECRET: 'synthetic-runtime-secret' }
    );
    const escapedSecret = 'quote"slash\\line\nsecret-value';
    expectRejected(
      'assertSecretFreeEvidence',
      [{ note: `prefix:${escapedSecret}:suffix` }, [escapedSecret]],
      'SECRET_BEARING_EVIDENCE'
    );
  });

  test('rejects malformed and overlapping organization pagination', () => {
    const firstProject = {
      projectRef: 'abcdefghijklmnopqrst',
      projectName: 'unrelated-project',
      region: 'ap-northeast-1',
      isBranch: false,
      status: 'ACTIVE_HEALTHY',
      insertedAt: '2026-07-23T11:00:00.000Z',
    };
    expect(
      invokeWrapperMethod('advanceProjectPaginationState', [
        { expectedCount: null, nextOffset: 0, seenProjectRefs: [] },
        {
          pagination: { count: 2, offset: 0, limit: 1 },
          projects: [firstProject],
        },
      ])
    ).toMatchObject({
      ok: true,
      value: {
        expectedCount: 2,
        nextOffset: 1,
        seenProjectRefs: ['abcdefghijklmnopqrst'],
      },
    });
    expect(
      invokeWrapperMethod('advanceProjectPaginationState', [
        { expectedCount: null, nextOffset: 0, seenProjectRefs: [] },
        {
          pagination: { count: 0, offset: 0, limit: 1 },
          projects: [firstProject],
        },
      ])
    ).toEqual({ ok: false, code: 'PROJECT_LIST_PAGINATION_INVALID' });
    expect(
      invokeWrapperMethod('advanceProjectPaginationState', [
        {
          expectedCount: 2,
          nextOffset: 1,
          seenProjectRefs: ['abcdefghijklmnopqrst'],
        },
        {
          pagination: { count: 2, offset: 1, limit: 1 },
          projects: [firstProject],
        },
      ])
    ).toEqual({ ok: false, code: 'PROJECT_LIST_PAGINATION_INVALID' });
  });

  test('binds reconciliation state, counts, and project identity', () => {
    const expectedProjectRef = 'abcdefghijklmnopqrst';
    const otherProjectRef = 'bcdefghijklmnopqrstu';
    const page = {
      bodySha256: '1'.repeat(64),
      httpStatus: 200,
      offset: 0,
      limit: 100,
      totalCount: 1,
      returnedCount: 1,
      safeProjectionSha256: '2'.repeat(64),
    };
    const project = {
      projectRef: expectedProjectRef,
      projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
      region: 'ap-northeast-1',
      isBranch: false,
      status: 'ACTIVE_HEALTHY',
      insertedAt: '2026-07-23T12:00:20.000Z',
    };
    const observed = {
      state: 'PROJECT_OBSERVED_OWNER_DECISION_REQUIRED',
      observedAt: '2026-07-23T12:00:30.000Z',
      projectCount: 1,
      matchingProjects: [project],
      projectListPages: [page],
      automaticPostRetryPerformed: false,
      automaticCleanupPerformed: false,
    };
    expect(
      invokeEvidenceVerifierMethod('validateReconciliation', [
        observed,
        expectedProjectRef,
      ]).ok
    ).toBe(true);
    expect(
      invokeEvidenceVerifierMethod('validateReconciliation', [
        {
          ...observed,
          matchingProjects: [{ ...project, projectRef: otherProjectRef }],
        },
        expectedProjectRef,
      ])
    ).toEqual({ ok: false, code: 'RECONCILIATION_INVALID' });
    expect(
      invokeEvidenceVerifierMethod('validateReconciliation', [
        {
          ...observed,
          state: 'PROJECT_IDENTITY_MISMATCH_OWNER_DECISION_REQUIRED',
          matchingProjects: [{ ...project, projectRef: otherProjectRef }],
        },
        expectedProjectRef,
      ]).ok
    ).toBe(true);
    expect(
      invokeEvidenceVerifierMethod('validateReconciliation', [
        { ...observed, state: 'FABRICATED_RECONCILIATION_STATE' },
        expectedProjectRef,
      ])
    ).toEqual({ ok: false, code: 'RECONCILIATION_INVALID' });
    expect(
      invokeEvidenceVerifierMethod('validateReconciliation', [
        { ...observed, projectCount: 2 },
        expectedProjectRef,
      ])
    ).toEqual({ ok: false, code: 'RECONCILIATION_INVALID' });
  });

  test('atomically refuses a second claim for the same action identity', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-contract-')
    );
    const claim = {
      actionId: 'PR12-ACTION-003',
      bindingMaterialSha256: '9'.repeat(64),
      payloadSha256: '8'.repeat(64),
      claimedAt: '2026-07-23T12:00:00.000Z',
      state: 'CLAIMED_POST_NOT_SENT',
    };
    expect(invokeContract('claimActionJournal', [directory, claim]).ok).toBe(
      true
    );
    expectRejected(
      'claimActionJournal',
      [directory, claim],
      'ACTION_ALREADY_CLAIMED'
    );
  });

  test('validates exact durable journal state and rejects tampering', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-journal-state-')
    );
    const bindingMaterialSha256 = '9'.repeat(64);
    const payloadSha256 = '8'.repeat(64);
    const claim = {
      actionId: 'PR12-ACTION-003',
      bindingMaterialSha256,
      payloadSha256,
      claimedAt: '2026-07-23T12:00:00.000Z',
      state: 'CLAIMED_POST_NOT_SENT',
    };
    expect(invokeContract('claimActionJournal', [directory, claim]).ok).toBe(
      true
    );
    expect(
      invokeWrapperMethod('readAndValidateJournalState', [
        directory,
        bindingMaterialSha256,
        payloadSha256,
      ])
    ).toMatchObject({
      ok: true,
      value: { state: 'CLAIMED_POST_NOT_SENT' },
    });

    writeCanonicalJson(
      directory,
      'source-project-provisioning-post-intent.json',
      {
        actionId: 'PR12-ACTION-003',
        bindingMaterialSha256,
        payloadSha256,
        postIntentAt: '2026-07-23T12:00:01.000Z',
        state: 'POST_INTENT_DURABLE',
        automaticRetryCount: 0,
        remoteContactCountBeforePost: 3,
      }
    );
    expect(
      invokeWrapperMethod('readAndValidateJournalState', [
        directory,
        bindingMaterialSha256,
        payloadSha256,
      ])
    ).toMatchObject({
      ok: true,
      value: { state: 'POST_INTENT_DURABLE_OUTCOME_UNRESOLVED' },
    });

    fs.writeFileSync(path.join(directory, 'unexpected.json'), '{}\n', 'utf8');
    expect(
      invokeWrapperMethod('readAndValidateJournalState', [
        directory,
        bindingMaterialSha256,
        payloadSha256,
      ])
    ).toEqual({ ok: false, code: 'ACTION_JOURNAL_FILE_SET_INVALID' });

    const tamperedDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-claim-tamper-')
    );
    expect(
      invokeContract('claimActionJournal', [tamperedDirectory, claim]).ok
    ).toBe(true);
    fs.appendFileSync(
      path.join(
        tamperedDirectory,
        'source-project-provisioning-action.claim.json'
      ),
      ' ',
      'utf8'
    );
    expect(
      invokeWrapperMethod('readAndValidateJournalState', [
        tamperedDirectory,
        bindingMaterialSha256,
        payloadSha256,
      ])
    ).toEqual({ ok: false, code: 'ACTION_JOURNAL_CLAIM_INVALID' });

    const terminalDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-terminal-tamper-')
    );
    expect(
      invokeContract('claimActionJournal', [terminalDirectory, claim]).ok
    ).toBe(true);
    writeCanonicalJson(
      terminalDirectory,
      'source-project-provisioning-terminal-outcome.json',
      {
        actionId: 'PR12-ACTION-003',
        bindingMaterialSha256,
        payloadSha256,
        state: 'FABRICATED_PASS',
        reasonCode: null,
        completedAt: '2026-07-23T12:00:01.000Z',
        projectRef: null,
        createPostAttemptCount: 0,
        automaticRetryCount: 0,
        automaticCleanupPerformed: false,
        readOnlyReconciliation: null,
        evidenceDirectoryName: null,
        manifestSha256: null,
        partialEvidenceDirectoryName: null,
      }
    );
    expect(
      invokeWrapperMethod('readAndValidateJournalState', [
        terminalDirectory,
        bindingMaterialSha256,
        payloadSha256,
      ])
    ).toEqual({ ok: false, code: 'ACTION_JOURNAL_TERMINAL_INVALID' });
  });

  test('binds local terminal completion to the exact journal and current approval', () => {
    const fixture = makeValidFixture();
    const claimSha256 = 'd'.repeat(64);
    const postIntentSha256 = 'e'.repeat(64);
    const actionStartedAt = '2026-07-23T12:00:00.000Z';
    const result = {
      status: 'PASS',
      operator: fixture.binding.owners.provisioningOperator,
      approver: fixture.binding.approval.approvedBy,
      operatorDisplayName: fixture.binding.operatorControl.principalDisplayName,
      operatorControlMode: fixture.binding.operatorControl.mode,
      identitySeparationAvailable: false,
      independentHumanReviewClaimed: false,
      recoveryOwner: fixture.binding.duplicateAndFailurePolicy.recoveryOwner,
      actionStartedAt,
      createPostAttemptCount: 1,
      pricingAndFunding: {
        currency: fixture.binding.cost.currency,
        moneyScale: fixture.binding.cost.moneyScale,
        pricingEvidenceFreshThrough:
          fixture.binding.cost.pricingEvidence.freshThrough,
        sourceMaximumBillableHours:
          fixture.binding.cost.sourceMaximumBillableHours,
        sourceMaximumComputeUsdScaled:
          fixture.binding.cost.sourceMaximumComputeUsdScaled,
        unallocatedAuthorizationHeadroomUsdScaled:
          fixture.binding.cost.unallocatedAuthorizationHeadroomUsdScaled,
        ownerAuthorizationCeilingUsdScaled:
          fixture.binding.cost.ownerAuthorizationCeilingUsdScaled,
        providerSpendCapEnforced: false,
        fundingSource:
          fixture.binding.retentionAndCleanupDecision.fundingSource,
        fundingApprovedAmountUsdScaled:
          fixture.binding.retentionAndCleanupDecision
            .fundingApprovedAmountUsdScaled,
        fundedThrough:
          fixture.binding.retentionAndCleanupDecision.fundedThrough,
      },
      approvalWindow: {
        approvedAt: fixture.binding.approval.approvedAt,
        operatorReconfirmedAt: fixture.binding.approval.operatorReconfirmedAt,
        expiresAt: fixture.binding.approval.expiresAt,
        approvalEvidenceSha256: fixture.binding.approval.evidenceSha256,
      },
      cleanupBoundary: {
        disposition: fixture.binding.retentionAndCleanupDecision.disposition,
        cleanupOwner: fixture.binding.retentionAndCleanupDecision.cleanupOwner,
        deletionApprovalRequester:
          fixture.binding.retentionAndCleanupDecision.deletionApprovalRequester,
        deletionApprovalRequestDeadline:
          fixture.binding.retentionAndCleanupDecision
            .deletionApprovalRequestDeadline,
        billingEscalationOwner:
          fixture.binding.retentionAndCleanupDecision.billingEscalationOwner,
        fundedExtensionOwner:
          fixture.binding.retentionAndCleanupDecision.fundedExtensionOwner,
        automaticDeletionAuthorized: false,
      },
      journalEvidence: {
        actionJournalDirectoryPathSha256:
          fixture.binding.duplicateAndFailurePolicy
            .actionJournalDirectoryPathSha256,
        claimSha256,
        postIntentSha256,
      },
    };
    const journalState = {
      state: 'POST_INTENT_DURABLE_OUTCOME_UNRESOLVED',
      claim: { claimedAt: actionStartedAt },
      claimSha256,
      postIntent: {
        state: 'POST_INTENT_DURABLE',
        remoteContactCountBeforePost: 3,
      },
      postIntentSha256,
    };
    expect(
      invokeWrapperMethod('validateLocalCompletionJournalBinding', [
        result,
        { outcome: 'PASS' },
        journalState,
        fixture.binding,
      ]).ok
    ).toBe(true);
    expect(
      invokeWrapperMethod('validateLocalCompletionJournalBinding', [
        { ...result, approver: 'different-approver@example.invalid' },
        { outcome: 'PASS' },
        journalState,
        fixture.binding,
      ])
    ).toEqual({
      ok: false,
      code: 'SEALED_EVIDENCE_JOURNAL_BINDING_MISMATCH',
    });
    expect(
      invokeWrapperMethod('validateLocalCompletionJournalBinding', [
        result,
        { outcome: 'PASS' },
        {
          ...journalState,
          state: 'CLAIMED_POST_NOT_SENT',
          postIntent: null,
          postIntentSha256: null,
        },
        fixture.binding,
      ])
    ).toEqual({
      ok: false,
      code: 'SEALED_EVIDENCE_JOURNAL_BINDING_MISMATCH',
    });
    expect(
      invokeWrapperMethod('validateLocalCompletionJournalBinding', [
        {
          ...result,
          status: 'PRECHECK_ABORTED',
          createPostAttemptCount: 0,
        },
        { outcome: 'PRECHECK_ABORTED' },
        journalState,
        fixture.binding,
      ]).ok
    ).toBe(true);
  });

  test('retains only an unambiguous known project ref during recovery completion', () => {
    const project = {
      projectRef: 'abcdefghijklmnopqrst',
      projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
      region: 'ap-northeast-1',
      isBranch: false,
      status: 'ACTIVE_HEALTHY',
      insertedAt: '2026-07-23T12:00:20.000Z',
    };
    expect(
      invokeWrapperMethod('selectKnownProjectRefForLocalCompletion', [
        {
          createdEnvironment: null,
          readOnlyReconciliation: { matchingProjects: [project] },
        },
        { createResponse: null },
      ])
    ).toEqual({ ok: true, value: project.projectRef });
    expect(
      invokeWrapperMethod('selectKnownProjectRefForLocalCompletion', [
        {
          createdEnvironment: null,
          readOnlyReconciliation: {
            matchingProjects: [
              project,
              { ...project, projectRef: 'bcdefghijklmnopqrstu' },
            ],
          },
        },
        { createResponse: null },
      ])
    ).toEqual({ ok: true, value: null });
    expect(
      invokeWrapperMethod('selectKnownProjectRefForLocalCompletion', [
        {
          createdEnvironment: null,
          readOnlyReconciliation: { matchingProjects: [project] },
        },
        {
          createResponse: {
            safeProjection: { projectRef: 'bcdefghijklmnopqrstu' },
          },
        },
      ])
    ).toEqual({
      ok: false,
      code: 'SEALED_EVIDENCE_PROJECT_REF_INVALID',
    });
  });

  test('contains one create POST path and no POST path in recovery mode', () => {
    const source = fs.readFileSync(provisioningWrapperPath, 'utf8');
    expect(source).not.toContain('export async function executeProvisioning');
    expect(source.match(/\{\s*method:\s*'POST',\s*body:/g)).toHaveLength(1);
    const recoveryStart = source.indexOf(
      'async function executeReadOnlyRecovery('
    );
    const recoveryEnd = source.indexOf(
      '\nasync function main()',
      recoveryStart
    );
    expect(recoveryStart).toBeGreaterThanOrEqual(0);
    expect(recoveryEnd).toBeGreaterThan(recoveryStart);
    const recoverySource = source.slice(recoveryStart, recoveryEnd);
    expect(recoverySource).not.toContain('providerFetch(');
    expect(recoverySource).not.toContain("{ method: 'POST'");
    expect(recoverySource).toContain('reconcileAfterPostAttempt');
  });

  test('quarantines a post-rename seal failure at the recorded partial path', () => {
    const parent = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-source-provisioning-seal-retention-')
    );
    const directoryName = 'pr12-action-003-20260723T120000-000Z-aaaaaaaaaaaa';
    const finalDirectory = path.join(parent, directoryName);
    const partialDirectory = path.join(parent, `${directoryName}.partial-1234`);
    fs.mkdirSync(finalDirectory);
    fs.writeFileSync(
      path.join(finalDirectory, 'unverified-evidence.json'),
      '{}\n',
      'utf8'
    );
    expect(
      invokeWrapperMethod('retainEvidenceAfterSealFailure', [
        partialDirectory,
        finalDirectory,
        true,
      ])
    ).toEqual({ ok: true, value: path.basename(partialDirectory) });
    expect(fs.existsSync(partialDirectory)).toBe(true);
    expect(fs.existsSync(finalDirectory)).toBe(false);
    expect(
      fs.existsSync(path.join(partialDirectory, 'unverified-evidence.json'))
    ).toBe(true);
  });

  test('verifies the sealed Phase 1 manifest and rejects hash drift', () => {
    const directory = makeSyntheticEvidenceBundle(false);
    const pass = runEvidenceVerifier(directory);
    expect(pass.status).toBe(0);
    expect(pass.stderr).toBe('');
    expect(pass.stdout).toContain('"secretBearingEvidenceFound":false');

    fs.appendFileSync(
      path.join(directory, 'provider-export.safe.json'),
      'tamper',
      'utf8'
    );
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('ARTIFACT_HASH_OR_SIZE_MISMATCH');
  });

  test('accepts a hash-consistent preflight body abort with zero POST attempts', () => {
    const directory = makeSyntheticEvidenceBundle(false);
    rewriteEvidenceArtifactAndReseal(
      directory,
      'action-events.json',
      artifact => {
        const firstEvent = (artifact.events as JsonValue[])[0] as JsonObject;
        artifact.outcome = 'PRECHECK_ABORTED';
        artifact.events = [
          firstEvent,
          {
            sequence: 2,
            state: 'PRECHECK_ABORTED',
            at: '2026-07-23T12:01:00.000Z',
            reasonCode: 'PROVIDER_BODY_SIZE_INVALID',
            remoteContactCount: 1,
            createPostAttemptCount: 0,
            automaticRetryCount: 0,
          },
        ];
      }
    );
    rewriteEvidenceArtifactAndReseal(
      directory,
      'provider-export.safe.json',
      artifact => {
        artifact.status = 'PRECHECK_ABORTED';
        artifact.preflight = null;
        artifact.createResponse = null;
        artifact.readinessObservation = null;
        artifact.computeObservation = null;
        artifact.reconciliation = null;
      }
    );
    rewriteEvidenceArtifactAndReseal(
      directory,
      'provisioning-result.json',
      artifact => {
        const providerContents = fs.readFileSync(
          path.join(directory, 'provider-export.safe.json')
        );
        artifact.status = 'PRECHECK_ABORTED';
        artifact.remoteContactCount = 1;
        artifact.createPostAttemptCount = 0;
        artifact.duplicateState = 'NOT_CHECKED';
        artifact.partialFailureState = 'PROVIDER_BODY_SIZE_INVALID';
        artifact.readOnlyReconciliation = null;
        artifact.createdEnvironment = null;
        artifact.providerEvidence = {
          path: 'provider-export.safe.json',
          sha256: createHash('sha256').update(providerContents).digest('hex'),
        };
        const journalEvidence = artifact.journalEvidence as JsonObject;
        journalEvidence.postIntentSha256 = null;
      }
    );
    rewriteEvidenceArtifactAndReseal(
      directory,
      'privacy-scan.json',
      artifact => {
        artifact.runtimeSecretValueCount = 2;
        artifact.scanMode = 'STRUCTURAL_AND_AVAILABLE_RUNTIME_VALUES';
      }
    );
    const verified = runEvidenceVerifier(directory);
    expect(verified.status).toBe(0);
    expect(verified.stderr).toBe('');
    expect(verified.stdout).toContain('"outcome":"PRECHECK_ABORTED"');

    rewriteEvidenceArtifactAndReseal(
      directory,
      'privacy-scan.json',
      artifact => {
        artifact.runtimeSecretValueCount = 0;
        artifact.scanMode = 'STRUCTURAL_ONLY_NO_RUNTIME_VALUES_AVAILABLE';
      }
    );
    const privacyRejected = runEvidenceVerifier(directory);
    expect(privacyRejected.status).toBe(1);
    expect(privacyRejected.stderr).toContain('PRIVACY_SCAN_INVALID');
  });

  test('validates accepted create semantics in a non-PASS evidence bundle', () => {
    const passingDirectory = makeSyntheticPartialAcceptedEvidenceBundle();
    const passingResult = runEvidenceVerifier(passingDirectory);
    expect({
      status: passingResult.status,
      stderr: passingResult.stderr,
    }).toEqual({ status: 0, stderr: '' });

    const cases: Array<(provider: JsonObject) => void> = [
      provider => {
        const createResponse = provider.createResponse as JsonObject;
        const projection = createResponse.safeProjection as JsonObject;
        projection.organizationId = 'different-organization';
      },
      provider => {
        const createResponse = provider.createResponse as JsonObject;
        const projection = createResponse.safeProjection as JsonObject;
        projection.status = 'FABRICATED_STATUS';
      },
      provider => {
        const createResponse = provider.createResponse as JsonObject;
        createResponse.httpStatus = 202;
      },
      provider => {
        provider.createResponse = null;
        provider.computeObservation = {
          projectRef: 'abcdefghijklmnopqrst',
          addonType: 'compute_instance',
          variantId: 'ci_large',
          responseBodySha256: '7'.repeat(64),
          httpStatus: 200,
          observedAt: '2026-07-23T12:00:59.000Z',
        };
      },
      provider => {
        provider.createResponse = null;
        provider.readinessObservation = {
          project: {
            projectRef: 'abcdefghijklmnopqrst',
            projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
            region: 'ap-northeast-1',
            isBranch: false,
            status: 'ACTIVE_HEALTHY',
            insertedAt: '2026-07-23T12:00:19.000Z',
          },
          pollCount: 1,
          polls: [
            {
              observedAt: '2026-07-23T12:00:40.000Z',
              pages: [
                {
                  bodySha256: '1'.repeat(64),
                  httpStatus: 200,
                  offset: 0,
                  limit: 100,
                  totalCount: 1,
                  returnedCount: 1,
                  safeProjectionSha256: '6'.repeat(64),
                },
              ],
              matchCount: 1,
            },
          ],
          finalStatus: 'ACTIVE_HEALTHY',
        };
      },
    ];
    for (const mutate of cases) {
      const directory = makeSyntheticPartialAcceptedEvidenceBundle();
      rewriteEvidenceArtifactAndReseal(
        directory,
        'provider-export.safe.json',
        artifact => mutate(artifact)
      );
      refreshResultProviderHash(directory);
      const rejected = runEvidenceVerifier(directory);
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain('PROVIDER_EXPORT_INVALID');
    }
  });

  test('rejects a zero-POST precheck outcome containing an accepted create', () => {
    const directory = makeSyntheticPostPreflightAbortEvidenceBundle();
    expect(runEvidenceVerifier(directory).status).toBe(0);
    rewriteEvidenceArtifactAndReseal(
      directory,
      'provider-export.safe.json',
      artifact => {
        artifact.createResponse = {
          httpStatus: 201,
          safeProjection: {
            projectRef: 'abcdefghijklmnopqrst',
            organizationId: 'org-isolated-001',
            organizationSlug: 'isolated-staging-org',
            projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
            region: 'ap-northeast-1',
            createdAt: '2026-07-23T12:00:19.000Z',
            status: 'INACTIVE',
          },
          responseBodySha256: '5'.repeat(64),
        };
      }
    );
    refreshResultProviderHash(directory);
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('PROVIDER_EXPORT_OUTCOME_INVALID');
  });

  test('rejects outcome event sequences that the wrapper cannot produce', () => {
    const cases: Array<{
      make: () => string;
      mutate: (events: JsonValue[]) => void;
    }> = [
      {
        make: makeSyntheticRecoveryEvidenceBundle,
        mutate: events => {
          events.splice(2, 0, {
            sequence: 3,
            state: 'RESPONSE_ACCEPTED',
            at: '2026-07-23T12:00:20.000Z',
            projectRef: 'abcdefghijklmnopqrst',
            remoteContactCount: 4,
            createPostAttemptCount: 1,
          });
          for (let index = 3; index < events.length; index += 1) {
            (events[index] as JsonObject).sequence = index + 1;
          }
        },
      },
      {
        make: makeSyntheticPartialAcceptedEvidenceBundle,
        mutate: events => {
          events.splice(2, 1);
          for (let index = 2; index < events.length; index += 1) {
            (events[index] as JsonObject).sequence = index + 1;
          }
        },
      },
    ];
    for (const { make, mutate } of cases) {
      const directory = make();
      rewriteEvidenceArtifactAndReseal(
        directory,
        'action-events.json',
        artifact => mutate(artifact.events as JsonValue[])
      );
      const rejected = runEvidenceVerifier(directory);
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain('ACTION_EVENTS_OUTCOME_INVALID');
    }
  });

  test('binds preflight remote-contact counts to the provider page set', () => {
    const directory = makeSyntheticPostPreflightAbortEvidenceBundle();
    rewriteEvidenceArtifactAndReseal(
      directory,
      'action-events.json',
      artifact => {
        const events = artifact.events as JsonValue[];
        const finalEvent = events[1] as JsonObject;
        finalEvent.remoteContactCount = 2;
      }
    );
    rewriteEvidenceArtifactAndReseal(
      directory,
      'provisioning-result.json',
      artifact => {
        artifact.remoteContactCount = 2;
      }
    );
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('ACTION_EVENTS_INVALID');
  });

  test('cross-binds provider observations to action event chronology', () => {
    const cases: Array<{
      make: () => string;
      mutate: (directory: string) => void;
    }> = [
      {
        make: () => makeSyntheticEvidenceBundle(false),
        mutate: directory => {
          rewriteEvidenceArtifactAndReseal(
            directory,
            'provider-export.safe.json',
            artifact => {
              const preflight = artifact.preflight as JsonObject;
              preflight.observedAt = '2026-07-23T12:00:11.000Z';
            }
          );
          refreshResultProviderHash(directory);
        },
      },
      {
        make: () => makeSyntheticEvidenceBundle(false),
        mutate: directory => {
          rewriteEvidenceArtifactAndReseal(
            directory,
            'provider-export.safe.json',
            artifact => {
              const readiness = artifact.readinessObservation as JsonObject;
              const polls = readiness.polls as JsonValue[];
              const firstPoll = polls[0] as JsonObject;
              firstPoll.observedAt = '2026-07-23T12:00:19.000Z';
            }
          );
          refreshResultProviderHash(directory);
        },
      },
      {
        make: makeSyntheticRecoveryEvidenceBundle,
        mutate: directory => {
          rewriteEvidenceArtifactAndReseal(
            directory,
            'provider-export.safe.json',
            artifact => {
              const reconciliation = artifact.reconciliation as JsonObject;
              reconciliation.observedAt = '2026-07-23T12:00:51.000Z';
            }
          );
          rewriteEvidenceArtifactAndReseal(
            directory,
            'provisioning-result.json',
            artifact => {
              const reconciliation =
                artifact.readOnlyReconciliation as JsonObject;
              reconciliation.observedAt = '2026-07-23T12:00:51.000Z';
              const providerContents = fs.readFileSync(
                path.join(directory, 'provider-export.safe.json')
              );
              const providerEvidence = artifact.providerEvidence as JsonObject;
              providerEvidence.sha256 = createHash('sha256')
                .update(providerContents)
                .digest('hex');
            }
          );
        },
      },
    ];
    for (const { make, mutate } of cases) {
      const directory = make();
      mutate(directory);
      const rejected = runEvidenceVerifier(directory);
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain('EVIDENCE_CHRONOLOGY_INVALID');
    }
  });

  test('rejects an internally hash-consistent secret-bearing evidence bundle', () => {
    const directory = makeSyntheticEvidenceBundle(true);
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('SECRET_BEARING_EVIDENCE');
  });

  test('rejects a secret hidden in a duplicate raw JSON key', () => {
    const directory = makeSyntheticEvidenceBundle(false);
    const providerPath = path.join(directory, 'provider-export.safe.json');
    const rawProvider = fs.readFileSync(providerPath, 'utf8');
    const duplicateKeyProvider = rawProvider.replace(
      '"capturedBy":"operator@example.invalid"',
      '"capturedBy":"Bearer synthetic_duplicate_key_secret","capturedBy":"operator@example.invalid"'
    );
    expect(duplicateKeyProvider).not.toBe(rawProvider);
    replaceEvidenceArtifactRawAndReseal(
      directory,
      'provider-export.safe.json',
      duplicateKeyProvider
    );
    refreshResultProviderHash(directory);
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('SECRET_BEARING_EVIDENCE');
  });

  test('rejects non-canonical JSON bytes even when hashes are resealed', () => {
    const directory = makeSyntheticEvidenceBundle(false);
    const providerPath = path.join(directory, 'provider-export.safe.json');
    const canonicalProvider = fs.readFileSync(providerPath, 'utf8');
    const nonCanonicalProvider = canonicalProvider.replace('{', '{ ');
    replaceEvidenceArtifactRawAndReseal(
      directory,
      'provider-export.safe.json',
      nonCanonicalProvider
    );
    refreshResultProviderHash(directory);
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('EVIDENCE_JSON_NON_CANONICAL');
  });

  test('rejects a hash-consistent but semantically empty PASS bundle', () => {
    const directory = makeSyntheticEvidenceBundle(false, true);
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('ACTION_EVENTS_INVALID');
  });

  test('rejects a forged PASS privacy scan with no runtime secret comparisons', () => {
    const directory = makeSyntheticEvidenceBundle(false);
    rewriteEvidenceArtifactAndReseal(
      directory,
      'privacy-scan.json',
      artifact => {
        artifact.runtimeSecretValueCount = 0;
        artifact.scanMode = 'STRUCTURAL_ONLY_NO_RUNTIME_VALUES_AVAILABLE';
      }
    );
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('PRIVACY_SCAN_INVALID');
  });

  test('rejects duplicate counts that exceed the provider project count', () => {
    const directory = makeSyntheticEvidenceBundle(false);
    rewriteEvidenceArtifactAndReseal(
      directory,
      'provider-export.safe.json',
      artifact => {
        const preflight = artifact.preflight as JsonObject;
        preflight.duplicateMatchCount = 1;
      }
    );
    refreshResultProviderHash(directory);
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('PROVIDER_PREFLIGHT_INVALID');
  });

  test('rejects non-canonical evidence timestamps', () => {
    const directory = makeSyntheticEvidenceBundle(false);
    rewriteEvidenceArtifactAndReseal(
      directory,
      'provisioning-result.json',
      artifact => {
        const approvalWindow = artifact.approvalWindow as JsonObject;
        approvalWindow.expiresAt = '2026-07-24T00:00:00Z';
      }
    );
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('PROVISIONING_RESULT_INVALID');
  });

  test.each([
    [
      'funding-source drift',
      (artifact: JsonObject) => {
        const pricing = artifact.pricingAndFunding as JsonObject;
        pricing.fundingSource = 'DIFFERENT_APPROVED_SOURCE';
      },
    ],
    [
      'recovery owner drift',
      (artifact: JsonObject) => {
        artifact.recoveryOwner = 'different-owner@example.invalid';
      },
    ],
    [
      'cleanup owner drift',
      (artifact: JsonObject) => {
        const cleanup = artifact.cleanupBoundary as JsonObject;
        cleanup.cleanupOwner = 'different-owner@example.invalid';
      },
    ],
  ])('rejects %s in sealed provisioning evidence', (_label, mutate) => {
    const directory = makeSyntheticEvidenceBundle(false);
    rewriteEvidenceArtifactAndReseal(
      directory,
      'provisioning-result.json',
      mutate
    );
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('PROVISIONING_RESULT_INVALID');
  });

  test('rejects a non-claim first event and impossible duplicate event order', () => {
    const cases: Array<{
      make: () => string;
      mutate: (events: JsonValue[]) => void;
    }> = [
      {
        make: () => makeSyntheticEvidenceBundle(false),
        mutate: events => {
          const first = events[0] as JsonObject;
          first.state = 'POST_INTENT_DURABLE';
          first.postIntentSha256 = first.claimSha256;
          delete first.claimSha256;
        },
      },
      {
        make: makeSyntheticRecoveryEvidenceBundle,
        mutate: events => {
          events.splice(2, 0, { ...(events[1] as JsonObject), sequence: 3 });
          for (let index = 3; index < events.length; index += 1) {
            (events[index] as JsonObject).sequence = index + 1;
          }
        },
      },
    ];
    for (const { make, mutate } of cases) {
      const directory = make();
      rewriteEvidenceArtifactAndReseal(
        directory,
        'action-events.json',
        artifact => mutate(artifact.events as JsonValue[])
      );
      const rejected = runEvidenceVerifier(directory);
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toMatch(
        /ACTION_EVENTS_(?:INVALID|OUTCOME_INVALID)/
      );
    }
  });

  test('cross-binds recovery event state and final reason to evidence', () => {
    const passingDirectory = makeSyntheticRecoveryEvidenceBundle();
    expect(runEvidenceVerifier(passingDirectory).status).toBe(0);
    for (const mutate of [
      (events: JsonValue[]) => {
        const reconciliationEvent = events[2] as JsonObject;
        reconciliationEvent.reconciliationState =
          'PROJECT_NOT_OBSERVED_OWNER_DECISION_REQUIRED';
      },
      (events: JsonValue[]) => {
        const finalEvent = events[3] as JsonObject;
        finalEvent.reasonCode = 'CONFLICTING_REASON';
      },
    ]) {
      const directory = makeSyntheticRecoveryEvidenceBundle();
      rewriteEvidenceArtifactAndReseal(
        directory,
        'action-events.json',
        artifact => mutate(artifact.events as JsonValue[])
      );
      const rejected = runEvidenceVerifier(directory);
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toMatch(
        /(?:EVIDENCE_CROSS_ARTIFACT_MISMATCH|ACTION_EVENTS_INVALID)/
      );
    }
  });

  test('rejects a hash-consistent bundle whose first event is not action start', () => {
    const directory = makeSyntheticEvidenceBundle(false);
    rewriteEvidenceArtifactAndReseal(
      directory,
      'action-events.json',
      artifact => {
        const events = artifact.events as JsonValue[];
        const first = events[0] as JsonObject;
        first.at = '2026-07-23T12:00:01.000Z';
      }
    );
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('ACTION_EVENTS_INVALID');
  });

  test('rejects a hash-consistent project deadline beyond the funded window', () => {
    const directory = makeSyntheticEvidenceBundle(false);
    rewriteEvidenceArtifactAndReseal(
      directory,
      'provisioning-result.json',
      artifact => {
        const createdEnvironment = artifact.createdEnvironment as JsonObject;
        createdEnvironment.projectDeadline = '2026-07-27T12:00:01.000Z';
      }
    );
    const rejected = runEvidenceVerifier(directory);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('PROVISIONING_RESULT_OUTCOME_INVALID');
  });
});
