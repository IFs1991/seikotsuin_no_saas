import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTION_ID,
  FIXED_PROJECT_NAME,
  FUNDING_CEILING_USD,
  PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_SECONDS,
  SOURCE_MAXIMUM_COMPUTE_USD,
  assertSecretFreeEvidence,
  canonicalJson,
  sha256Text,
} from './pr12-source-project-provisioning-contract.mjs';

const JSON_ARTIFACTS = Object.freeze([
  'action-events.json',
  'privacy-scan.json',
  'provider-export.safe.json',
  'provisioning-result.json',
]);
const REQUIRED_FILES = Object.freeze([
  ...JSON_ARTIFACTS,
  'manifest.json',
  'manifest.sha256',
]);
const ALLOWED_OUTCOMES = new Set([
  'PASS',
  'PRECHECK_ABORTED',
  'DUPLICATE_FOUND',
  'UNKNOWN_REMOTE_OUTCOME',
  'PARTIAL_FAILURE',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9_-]+$/;
const PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_MILLISECONDS =
  PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_SECONDS * 1000;
const PROVIDER_PROJECT_STATUSES = new Set([
  'INACTIVE',
  'ACTIVE_HEALTHY',
  'ACTIVE_UNHEALTHY',
  'COMING_UP',
  'UNKNOWN',
  'GOING_DOWN',
  'INIT_FAILED',
  'REMOVED',
  'RESTORING',
  'UPGRADING',
  'PAUSING',
  'RESTORE_FAILED',
  'RESTARTING',
  'PAUSE_FAILED',
  'RESIZING',
]);
const RECONCILIATION_STATES = new Set([
  'PROJECT_NOT_OBSERVED_OWNER_DECISION_REQUIRED',
  'MULTIPLE_PROJECTS_OBSERVED_OWNER_DECISION_REQUIRED',
  'PROJECT_IDENTITY_MISMATCH_OWNER_DECISION_REQUIRED',
  'PROJECT_OBSERVED_OWNER_DECISION_REQUIRED',
  'READ_ONLY_RECONCILIATION_FAILED_OWNER_DECISION_REQUIRED',
]);

class EvidenceVerificationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'EvidenceVerificationError';
    this.code = code;
  }
}

function fail(code) {
  throw new EvidenceVerificationError(code);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value, code) {
  requireCondition(isRecord(value), code);
  return value;
}

function requireExactKeys(value, expectedKeys, code) {
  const record = requireRecord(value, code);
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  requireCondition(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    code
  );
  return record;
}

function requireString(value, code) {
  requireCondition(
    typeof value === 'string' && value.length > 0 && value === value.trim(),
    code
  );
  return value;
}

function requireCanonicalOwnerId(value, code) {
  const ownerId = requireString(value, code);
  requireCondition(
    ownerId === ownerId.toLowerCase() &&
      /^[a-z0-9][a-z0-9._@+:-]*$/.test(ownerId),
    code
  );
  return ownerId;
}

function requireTimestamp(value, code) {
  const text = requireString(value, code);
  const milliseconds = Date.parse(text);
  requireCondition(
    Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === text,
    code
  );
  return text;
}

function requireSha256(value, code) {
  const text = requireString(value, code);
  requireCondition(SHA256_PATTERN.test(text), code);
  return text;
}

function requireNonNegativeNumber(value, code) {
  requireCondition(
    typeof value === 'number' && Number.isFinite(value) && value >= 0,
    code
  );
  return value;
}

function requireNonNegativeInteger(value, code) {
  requireCondition(Number.isInteger(value) && value >= 0, code);
  return value;
}

function validateProjectListPages(value, code = 'PROVIDER_PREFLIGHT_INVALID') {
  requireCondition(Array.isArray(value) && value.length > 0, code);
  let expectedOffset = 0;
  let totalCount = null;
  for (const item of value) {
    const page = requireExactKeys(
      item,
      [
        'bodySha256',
        'httpStatus',
        'offset',
        'limit',
        'totalCount',
        'returnedCount',
        'safeProjectionSha256',
      ],
      code
    );
    requireSha256(page.bodySha256, code);
    requireSha256(page.safeProjectionSha256, code);
    requireCondition(page.httpStatus === 200, code);
    requireNonNegativeInteger(page.offset, code);
    requireCondition(page.offset === expectedOffset, code);
    requireCondition(Number.isInteger(page.limit) && page.limit > 0, code);
    requireNonNegativeInteger(page.totalCount, code);
    requireNonNegativeInteger(page.returnedCount, code);
    requireCondition(
      page.returnedCount <= page.limit &&
        page.offset + page.returnedCount <= page.totalCount,
      code
    );
    if (totalCount === null) totalCount = page.totalCount;
    requireCondition(page.totalCount === totalCount, code);
    expectedOffset += page.returnedCount;
  }
  requireCondition(totalCount !== null && expectedOffset >= totalCount, code);
  return totalCount;
}

function validateSafeProjectProjection(value, code) {
  const project = requireExactKeys(
    value,
    ['projectRef', 'projectName', 'region', 'isBranch', 'status', 'insertedAt'],
    code
  );
  requireCondition(
    PROJECT_REF_PATTERN.test(project.projectRef) &&
      project.projectName === FIXED_PROJECT_NAME &&
      project.region === 'ap-northeast-1' &&
      project.isBranch === false &&
      PROVIDER_PROJECT_STATUSES.has(project.status) &&
      Number.isFinite(Date.parse(requireTimestamp(project.insertedAt, code))),
    code
  );
  return project;
}

export function validateReconciliation(value, expectedProjectRef = undefined) {
  const record = requireRecord(value, 'RECONCILIATION_INVALID');
  const state = requireString(record.state, 'RECONCILIATION_INVALID');
  requireCondition(RECONCILIATION_STATES.has(state), 'RECONCILIATION_INVALID');
  const failed =
    state === 'READ_ONLY_RECONCILIATION_FAILED_OWNER_DECISION_REQUIRED';
  const expectedKeys = failed
    ? [
        'state',
        'observedAt',
        'reasonCode',
        'projectCount',
        'matchingProjects',
        'projectListPages',
        'automaticPostRetryPerformed',
        'automaticCleanupPerformed',
      ]
    : [
        'state',
        'observedAt',
        'projectCount',
        'matchingProjects',
        'projectListPages',
        'automaticPostRetryPerformed',
        'automaticCleanupPerformed',
      ];
  requireExactKeys(record, expectedKeys, 'RECONCILIATION_INVALID');
  requireTimestamp(record.observedAt, 'RECONCILIATION_INVALID');
  requireCondition(
    record.automaticPostRetryPerformed === false &&
      record.automaticCleanupPerformed === false &&
      Array.isArray(record.matchingProjects) &&
      Array.isArray(record.projectListPages),
    'RECONCILIATION_INVALID'
  );
  if (failed) {
    requireString(record.reasonCode, 'RECONCILIATION_INVALID');
    requireCondition(record.projectCount === null, 'RECONCILIATION_INVALID');
    requireCondition(
      record.matchingProjects.length === 0 &&
        record.projectListPages.length === 0,
      'RECONCILIATION_INVALID'
    );
  } else {
    requireNonNegativeInteger(record.projectCount, 'RECONCILIATION_INVALID');
    requireCondition(
      record.projectCount ===
        validateProjectListPages(
          record.projectListPages,
          'RECONCILIATION_INVALID'
        ),
      'RECONCILIATION_INVALID'
    );
    const matchingProjects = record.matchingProjects.map(project =>
      validateSafeProjectProjection(project, 'RECONCILIATION_INVALID')
    );
    requireCondition(
      matchingProjects.length <= record.projectCount &&
        new Set(matchingProjects.map(project => project.projectRef)).size ===
          matchingProjects.length,
      'RECONCILIATION_INVALID'
    );
    const matchCount = matchingProjects.length;
    requireCondition(
      state === 'PROJECT_NOT_OBSERVED_OWNER_DECISION_REQUIRED'
        ? matchCount === 0
        : state === 'MULTIPLE_PROJECTS_OBSERVED_OWNER_DECISION_REQUIRED'
          ? matchCount > 1
          : matchCount === 1,
      'RECONCILIATION_INVALID'
    );
    if (
      state === 'PROJECT_IDENTITY_MISMATCH_OWNER_DECISION_REQUIRED' &&
      expectedProjectRef !== undefined
    ) {
      requireCondition(
        typeof expectedProjectRef === 'string' &&
          PROJECT_REF_PATTERN.test(expectedProjectRef) &&
          matchingProjects[0].projectRef !== expectedProjectRef,
        'RECONCILIATION_INVALID'
      );
    }
    if (
      state === 'PROJECT_OBSERVED_OWNER_DECISION_REQUIRED' &&
      typeof expectedProjectRef === 'string'
    ) {
      requireCondition(
        PROJECT_REF_PATTERN.test(expectedProjectRef) &&
          matchingProjects[0].projectRef === expectedProjectRef,
        'RECONCILIATION_INVALID'
      );
    }
  }
  return record;
}

function validateReadinessObservation({
  value,
  code,
  actionStartedAt,
  actionCompletedAt,
  earliestObservedAt,
  expectedProjectRef,
}) {
  const readiness = requireExactKeys(
    value,
    ['project', 'pollCount', 'polls', 'finalStatus'],
    code
  );
  requireCondition(Array.isArray(readiness.polls), code);
  const project = validateSafeProjectProjection(readiness.project, code);
  const insertedAt = Date.parse(project.insertedAt);
  requireCondition(
    readiness.pollCount === readiness.polls.length &&
      readiness.pollCount > 0 &&
      readiness.finalStatus === project.status &&
      (expectedProjectRef === null ||
        project.projectRef === expectedProjectRef) &&
      insertedAt >=
        actionStartedAt - PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_MILLISECONDS &&
      insertedAt <=
        actionCompletedAt + PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_MILLISECONDS,
    code
  );
  let previousObservedAt = earliestObservedAt;
  for (const poll of readiness.polls) {
    const projectedPoll = requireExactKeys(
      poll,
      ['observedAt', 'pages', 'matchCount'],
      code
    );
    const observedAt = Date.parse(
      requireTimestamp(projectedPoll.observedAt, code)
    );
    const totalCount = validateProjectListPages(projectedPoll.pages, code);
    requireNonNegativeInteger(projectedPoll.matchCount, code);
    requireCondition(
      observedAt >= actionStartedAt &&
        observedAt >= previousObservedAt &&
        observedAt <= actionCompletedAt &&
        projectedPoll.matchCount <= totalCount &&
        projectedPoll.matchCount <= 1,
      code
    );
    previousObservedAt = observedAt;
  }
  requireCondition(readiness.polls.at(-1).matchCount === 1, code);
  return { project, lastPollAt: previousObservedAt };
}

function validateActionEvents(eventsArtifact, outcome, result, provider) {
  const artifact = requireExactKeys(
    eventsArtifact,
    ['schemaVersion', 'actionId', 'outcome', 'events'],
    'ACTION_EVENTS_INVALID'
  );
  requireCondition(
    artifact.schemaVersion === 1 &&
      artifact.actionId === ACTION_ID &&
      artifact.outcome === outcome &&
      Array.isArray(artifact.events) &&
      artifact.events.length >= 2,
    'ACTION_EVENTS_INVALID'
  );
  let previousAt = Date.parse(result.actionStartedAt);
  let previousRemoteContactCount = 0;
  let postIntentRemoteContactCount = null;
  const states = [];
  const eventByState = new Map();
  let finalEvent = null;
  const expectedProjectRef =
    provider.createResponse?.safeProjection?.projectRef ??
    result.createdEnvironment?.projectRef ??
    null;
  const preflightRemoteContactCount =
    provider.preflight === null
      ? null
      : 2 + provider.preflight.projectListPages.length;
  for (const [index, item] of artifact.events.entries()) {
    const event = requireRecord(item, 'ACTION_EVENTS_INVALID');
    const state = requireString(event.state, 'ACTION_EVENTS_INVALID');
    const commonKeys = [
      'sequence',
      'state',
      'at',
      'remoteContactCount',
      'createPostAttemptCount',
    ];
    const stateKeys =
      state === 'CLAIMED_POST_NOT_SENT'
        ? ['claimSha256']
        : state === 'POST_INTENT_DURABLE'
          ? ['postIntentSha256']
          : state === 'RESPONSE_ACCEPTED' || state === 'PROVIDER_RECONCILED'
            ? ['projectRef']
            : state === 'READ_ONLY_RECONCILIATION_COMPLETED'
              ? ['reconciliationState', 'automaticRetryCount']
              : ALLOWED_OUTCOMES.has(state)
                ? ['reasonCode', 'automaticRetryCount']
                : fail('ACTION_EVENTS_INVALID');
    requireExactKeys(
      event,
      [...commonKeys, ...stateKeys],
      'ACTION_EVENTS_INVALID'
    );
    requireCondition(event.sequence === index + 1, 'ACTION_EVENTS_INVALID');
    const at = Date.parse(requireTimestamp(event.at, 'ACTION_EVENTS_INVALID'));
    requireCondition(at >= previousAt, 'ACTION_EVENTS_INVALID');
    if (index === 0) {
      requireCondition(
        state === 'CLAIMED_POST_NOT_SENT' &&
          event.at === result.actionStartedAt &&
          event.remoteContactCount === 0 &&
          event.createPostAttemptCount === 0,
        'ACTION_EVENTS_INVALID'
      );
    }
    previousAt = at;
    requireNonNegativeInteger(
      event.remoteContactCount,
      'ACTION_EVENTS_INVALID'
    );
    requireNonNegativeInteger(
      event.createPostAttemptCount,
      'ACTION_EVENTS_INVALID'
    );
    requireCondition(
      event.remoteContactCount >= previousRemoteContactCount &&
        event.remoteContactCount <= result.remoteContactCount &&
        event.createPostAttemptCount <= result.createPostAttemptCount,
      'ACTION_EVENTS_INVALID'
    );
    previousRemoteContactCount = event.remoteContactCount;
    if (state === 'CLAIMED_POST_NOT_SENT') {
      requireCondition(index === 0, 'ACTION_EVENTS_INVALID');
      requireCondition(
        requireSha256(event.claimSha256, 'ACTION_EVENTS_INVALID') ===
          result.journalEvidence.claimSha256,
        'ACTION_EVENTS_INVALID'
      );
    }
    if (state === 'POST_INTENT_DURABLE') {
      requireCondition(
        requireSha256(event.postIntentSha256, 'ACTION_EVENTS_INVALID') ===
          result.journalEvidence.postIntentSha256 &&
          (preflightRemoteContactCount === null
            ? outcome === 'UNKNOWN_REMOTE_OUTCOME' &&
              event.remoteContactCount >= 3
            : event.remoteContactCount === preflightRemoteContactCount) &&
          event.createPostAttemptCount === 0 &&
          at < Date.parse(result.approvalWindow.expiresAt),
        'ACTION_EVENTS_INVALID'
      );
      postIntentRemoteContactCount = event.remoteContactCount;
    }
    if (Object.hasOwn(event, 'projectRef')) {
      requireCondition(
        PROJECT_REF_PATTERN.test(event.projectRef) &&
          (expectedProjectRef === null ||
            event.projectRef === expectedProjectRef),
        'ACTION_EVENTS_INVALID'
      );
    }
    if (state === 'RESPONSE_ACCEPTED' || state === 'PROVIDER_RECONCILED') {
      requireCondition(
        event.createPostAttemptCount === 1,
        'ACTION_EVENTS_INVALID'
      );
    }
    if (state === 'RESPONSE_ACCEPTED') {
      const postIntentEvent = eventsArtifact.events.find(
        candidate =>
          isRecord(candidate) && candidate.state === 'POST_INTENT_DURABLE'
      );
      requireCondition(
        isRecord(postIntentEvent) &&
          event.remoteContactCount === postIntentEvent.remoteContactCount + 1,
        'ACTION_EVENTS_INVALID'
      );
    }
    if (Object.hasOwn(event, 'automaticRetryCount')) {
      requireCondition(
        event.automaticRetryCount === 0,
        'ACTION_EVENTS_INVALID'
      );
    }
    if (state === 'READ_ONLY_RECONCILIATION_COMPLETED') {
      requireCondition(
        isRecord(result.readOnlyReconciliation) &&
          isRecord(provider.reconciliation) &&
          event.reconciliationState === result.readOnlyReconciliation.state &&
          event.reconciliationState === provider.reconciliation.state,
        'EVIDENCE_CROSS_ARTIFACT_MISMATCH'
      );
    }
    states.push(state);
    eventByState.set(state, event);
    finalEvent = event;
  }
  if (outcome === 'PASS') {
    requireCondition(
      canonicalJson(states) ===
        canonicalJson([
          'CLAIMED_POST_NOT_SENT',
          'POST_INTENT_DURABLE',
          'RESPONSE_ACCEPTED',
          'PROVIDER_RECONCILED',
        ]),
      'ACTION_EVENTS_OUTCOME_INVALID'
    );
  } else {
    const allowedSequences =
      outcome === 'DUPLICATE_FOUND'
        ? [['CLAIMED_POST_NOT_SENT', 'DUPLICATE_FOUND']]
        : outcome === 'PRECHECK_ABORTED'
          ? [
              ['CLAIMED_POST_NOT_SENT', 'PRECHECK_ABORTED'],
              [
                'CLAIMED_POST_NOT_SENT',
                'POST_INTENT_DURABLE',
                'PRECHECK_ABORTED',
              ],
            ]
          : outcome === 'UNKNOWN_REMOTE_OUTCOME'
            ? [
                [
                  'CLAIMED_POST_NOT_SENT',
                  'POST_INTENT_DURABLE',
                  'READ_ONLY_RECONCILIATION_COMPLETED',
                  'UNKNOWN_REMOTE_OUTCOME',
                ],
              ]
            : [
                [
                  'CLAIMED_POST_NOT_SENT',
                  'POST_INTENT_DURABLE',
                  'RESPONSE_ACCEPTED',
                  'READ_ONLY_RECONCILIATION_COMPLETED',
                  'PARTIAL_FAILURE',
                ],
              ];
    requireCondition(
      allowedSequences.some(
        sequence => canonicalJson(sequence) === canonicalJson(states)
      ),
      'ACTION_EVENTS_OUTCOME_INVALID'
    );
  }
  requireCondition(
    previousAt === Date.parse(result.actionCompletedAt) &&
      finalEvent?.remoteContactCount === result.remoteContactCount &&
      finalEvent?.createPostAttemptCount === result.createPostAttemptCount &&
      (outcome === 'PASS' ||
        finalEvent?.reasonCode === result.partialFailureState),
    'ACTION_EVENTS_INVALID'
  );
  requireCondition(
    preflightRemoteContactCount === null
      ? result.createPostAttemptCount === 0 ||
          (outcome === 'UNKNOWN_REMOTE_OUTCOME' &&
            postIntentRemoteContactCount !== null &&
            result.remoteContactCount >= postIntentRemoteContactCount + 1)
      : result.createPostAttemptCount === 0
        ? result.remoteContactCount === preflightRemoteContactCount
        : result.remoteContactCount >= preflightRemoteContactCount + 1,
    'ACTION_EVENTS_INVALID'
  );
  if (provider.preflight !== null) {
    const preflightBoundary =
      eventByState.get('POST_INTENT_DURABLE') ?? finalEvent;
    requireCondition(
      Date.parse(provider.preflight.observedAt) <=
        Date.parse(preflightBoundary.at),
      'EVIDENCE_CHRONOLOGY_INVALID'
    );
  }
  if (provider.readinessObservation !== null) {
    const responseAccepted = eventByState.get('RESPONSE_ACCEPTED');
    const firstPoll = provider.readinessObservation.polls[0];
    requireCondition(
      responseAccepted !== undefined &&
        Date.parse(firstPoll.observedAt) >= Date.parse(responseAccepted.at),
      'EVIDENCE_CHRONOLOGY_INVALID'
    );
  }
  if (provider.reconciliation !== null) {
    const reconciliationCompleted = eventByState.get(
      'READ_ONLY_RECONCILIATION_COMPLETED'
    );
    const reconciliationStart =
      eventByState.get('RESPONSE_ACCEPTED') ??
      eventByState.get('POST_INTENT_DURABLE');
    const latestProviderObservationBeforeReconciliation = Math.max(
      Date.parse(reconciliationStart?.at ?? ''),
      Date.parse(
        provider.readinessObservation?.polls.at(-1)?.observedAt ?? ''
      ) || 0,
      Date.parse(provider.computeObservation?.observedAt ?? '') || 0
    );
    requireCondition(
      reconciliationCompleted !== undefined &&
        reconciliationStart !== undefined &&
        Date.parse(provider.reconciliation.observedAt) >=
          latestProviderObservationBeforeReconciliation &&
        Date.parse(provider.reconciliation.observedAt) <=
          Date.parse(reconciliationCompleted.at),
      'EVIDENCE_CHRONOLOGY_INVALID'
    );
  }
  if (provider.computeObservation !== null) {
    const computeBoundary =
      eventByState.get('PROVIDER_RECONCILED') ??
      eventByState.get('READ_ONLY_RECONCILIATION_COMPLETED') ??
      finalEvent;
    const lastReadinessPoll = provider.readinessObservation?.polls.at(-1);
    requireCondition(
      Date.parse(provider.computeObservation.observedAt) <=
        Date.parse(computeBoundary.at) &&
        (lastReadinessPoll === undefined ||
          Date.parse(provider.computeObservation.observedAt) >=
            Date.parse(lastReadinessPoll.observedAt)),
      'EVIDENCE_CHRONOLOGY_INVALID'
    );
  }
}

function validateProvisioningResult(resultInput, manifest, providerMetadata) {
  const result = requireExactKeys(
    resultInput,
    [
      'schemaVersion',
      'phase',
      'resultType',
      'status',
      'actionId',
      'gitCommit',
      'bindingMaterialSha256',
      'payloadSha256',
      'operator',
      'approver',
      'actionStartedAt',
      'actionCompletedAt',
      'remoteContactCount',
      'createPostAttemptCount',
      'automaticRetryCount',
      'duplicateState',
      'partialFailureState',
      'readOnlyReconciliation',
      'recoveryOwner',
      'cleanupDeletionAuthorized',
      'databaseConnectionPerformed',
      'phase2AndLaterAuthorized',
      'createdEnvironment',
      'providerEvidence',
      'quoteAndFunding',
      'approvalWindow',
      'cleanupBoundary',
      'journalEvidence',
    ],
    'PROVISIONING_RESULT_INVALID'
  );
  requireCondition(
    result.schemaVersion === 2 &&
      result.phase === 'SOURCE_PROJECT_PROVISIONING_RESULT' &&
      result.resultType === 'SOURCE_PROJECT_PROVISIONING_OPERATION' &&
      result.status === manifest.status &&
      result.actionId === ACTION_ID &&
      result.gitCommit === manifest.gitCommit &&
      result.bindingMaterialSha256 === manifest.bindingMaterialSha256 &&
      result.payloadSha256 === manifest.payloadSha256 &&
      result.automaticRetryCount === 0 &&
      result.cleanupDeletionAuthorized === false &&
      result.databaseConnectionPerformed === false &&
      result.phase2AndLaterAuthorized === false,
    'PROVISIONING_RESULT_INVALID'
  );
  requireCanonicalOwnerId(result.operator, 'PROVISIONING_RESULT_INVALID');
  requireCanonicalOwnerId(result.approver, 'PROVISIONING_RESULT_INVALID');
  requireCanonicalOwnerId(result.recoveryOwner, 'PROVISIONING_RESULT_INVALID');
  requireCondition(
    result.operator !== result.approver,
    'PROVISIONING_RESULT_INVALID'
  );
  const startedAt = Date.parse(
    requireTimestamp(result.actionStartedAt, 'PROVISIONING_RESULT_INVALID')
  );
  const completedAt = Date.parse(
    requireTimestamp(result.actionCompletedAt, 'PROVISIONING_RESULT_INVALID')
  );
  requireCondition(startedAt <= completedAt, 'PROVISIONING_RESULT_INVALID');
  requireNonNegativeInteger(
    result.remoteContactCount,
    'PROVISIONING_RESULT_INVALID'
  );
  requireCondition(
    [0, 1].includes(result.createPostAttemptCount),
    'PROVISIONING_RESULT_INVALID'
  );

  const providerEvidence = requireExactKeys(
    result.providerEvidence,
    ['path', 'sha256'],
    'PROVISIONING_RESULT_INVALID'
  );
  requireCondition(
    providerEvidence.path === 'provider-export.safe.json' &&
      providerEvidence.sha256 === providerMetadata.sha256,
    'PROVISIONING_RESULT_INVALID'
  );
  const approval = requireExactKeys(
    result.approvalWindow,
    ['approvedAt', 'expiresAt', 'approvalEvidenceSha256'],
    'PROVISIONING_RESULT_INVALID'
  );
  const approvedAt = Date.parse(
    requireTimestamp(approval.approvedAt, 'PROVISIONING_RESULT_INVALID')
  );
  const expiresAt = Date.parse(
    requireTimestamp(approval.expiresAt, 'PROVISIONING_RESULT_INVALID')
  );
  requireSha256(approval.approvalEvidenceSha256, 'PROVISIONING_RESULT_INVALID');
  requireCondition(
    approvedAt <= startedAt && startedAt < expiresAt,
    'PROVISIONING_RESULT_INVALID'
  );
  const quote = requireExactKeys(
    result.quoteAndFunding,
    [
      'currency',
      'actualDashboardQuoteUsd',
      'quoteObservedAt',
      'quoteValidThrough',
      'sourceMaximumBillableHours',
      'sourceMaximumComputeUsd',
      'fundingApprovedAmountUsd',
      'fundingCeilingUsd',
      'fundedThrough',
    ],
    'PROVISIONING_RESULT_INVALID'
  );
  const actualQuote = requireNonNegativeNumber(
    quote.actualDashboardQuoteUsd,
    'PROVISIONING_RESULT_INVALID'
  );
  const approvedFunding = requireNonNegativeNumber(
    quote.fundingApprovedAmountUsd,
    'PROVISIONING_RESULT_INVALID'
  );
  const fundingCeiling = requireNonNegativeNumber(
    quote.fundingCeilingUsd,
    'PROVISIONING_RESULT_INVALID'
  );
  requireCondition(
    quote.currency === 'USD' &&
      quote.sourceMaximumBillableHours === 72 &&
      requireNonNegativeNumber(
        quote.sourceMaximumComputeUsd,
        'PROVISIONING_RESULT_INVALID'
      ) === SOURCE_MAXIMUM_COMPUTE_USD &&
      fundingCeiling === FUNDING_CEILING_USD &&
      approvedFunding >= actualQuote &&
      approvedFunding <= fundingCeiling,
    'PROVISIONING_RESULT_INVALID'
  );
  const quoteObservedAt = Date.parse(
    requireTimestamp(quote.quoteObservedAt, 'PROVISIONING_RESULT_INVALID')
  );
  const quoteValidThrough = Date.parse(
    requireTimestamp(quote.quoteValidThrough, 'PROVISIONING_RESULT_INVALID')
  );
  const fundedThrough = Date.parse(
    requireTimestamp(quote.fundedThrough, 'PROVISIONING_RESULT_INVALID')
  );
  requireCondition(
    quoteObservedAt <= approvedAt &&
      quoteValidThrough >= startedAt &&
      fundedThrough >= expiresAt + 72 * 60 * 60 * 1000,
    'PROVISIONING_RESULT_INVALID'
  );
  const cleanup = requireExactKeys(
    result.cleanupBoundary,
    [
      'disposition',
      'cleanupOwner',
      'deletionApprovalRequester',
      'deletionApprovalRequestDeadline',
      'billingEscalationOwner',
      'fundedExtensionOwner',
      'automaticDeletionAuthorized',
    ],
    'PROVISIONING_RESULT_INVALID'
  );
  requireCondition(
    cleanup.disposition ===
      'DELETE_BEFORE_DEADLINE_OR_SEPARATELY_APPROVE_FUNDED_EXTENSION' &&
      cleanup.automaticDeletionAuthorized === false,
    'PROVISIONING_RESULT_INVALID'
  );
  for (const key of [
    'cleanupOwner',
    'deletionApprovalRequester',
    'billingEscalationOwner',
    'fundedExtensionOwner',
  ]) {
    requireCanonicalOwnerId(cleanup[key], 'PROVISIONING_RESULT_INVALID');
  }
  const cleanupDeadline = Date.parse(
    requireTimestamp(
      cleanup.deletionApprovalRequestDeadline,
      'PROVISIONING_RESULT_INVALID'
    )
  );
  requireCondition(
    cleanupDeadline > startedAt &&
      cleanupDeadline <= startedAt + 72 * 60 * 60 * 1000 &&
      cleanupDeadline < fundedThrough,
    'PROVISIONING_RESULT_INVALID'
  );
  const journal = requireExactKeys(
    result.journalEvidence,
    ['actionJournalDirectoryPathSha256', 'claimSha256', 'postIntentSha256'],
    'PROVISIONING_RESULT_INVALID'
  );
  requireSha256(
    journal.actionJournalDirectoryPathSha256,
    'PROVISIONING_RESULT_INVALID'
  );
  requireSha256(journal.claimSha256, 'PROVISIONING_RESULT_INVALID');
  if (journal.postIntentSha256 !== null) {
    requireSha256(journal.postIntentSha256, 'PROVISIONING_RESULT_INVALID');
  } else {
    requireCondition(
      result.createPostAttemptCount === 0,
      'PROVISIONING_RESULT_INVALID'
    );
  }
  if (result.createPostAttemptCount === 1) {
    requireCondition(
      journal.postIntentSha256 !== null,
      'PROVISIONING_RESULT_INVALID'
    );
  }
  if (result.status === 'PASS') {
    requireCondition(
      result.createPostAttemptCount === 1 &&
        result.duplicateState === 'ABSENT_ALL_PAGES' &&
        result.partialFailureState === null &&
        result.readOnlyReconciliation === null,
      'PROVISIONING_RESULT_OUTCOME_INVALID'
    );
  } else {
    requireString(
      result.partialFailureState,
      'PROVISIONING_RESULT_OUTCOME_INVALID'
    );
    requireCondition(
      result.createdEnvironment === null,
      'PROVISIONING_RESULT_OUTCOME_INVALID'
    );
    if (result.createPostAttemptCount === 1) {
      validateReconciliation(result.readOnlyReconciliation);
    } else {
      requireCondition(
        result.readOnlyReconciliation === null,
        'PROVISIONING_RESULT_OUTCOME_INVALID'
      );
    }
    requireCondition(
      result.status === 'DUPLICATE_FOUND'
        ? result.createPostAttemptCount === 0 &&
            result.duplicateState === 'DUPLICATE_FOUND'
        : result.status === 'PRECHECK_ABORTED'
          ? result.createPostAttemptCount === 0
          : result.createPostAttemptCount === 1,
      'PROVISIONING_RESULT_OUTCOME_INVALID'
    );
  }
  return result;
}

function validateProviderExport(providerInput, manifest, result) {
  const provider = requireExactKeys(
    providerInput,
    [
      'schemaVersion',
      'exportType',
      'status',
      'actionId',
      'request',
      'preflight',
      'createResponse',
      'readinessObservation',
      'computeObservation',
      'reconciliation',
      'rawProviderBodiesPersisted',
      'capturedAt',
      'capturedBy',
    ],
    'PROVIDER_EXPORT_INVALID'
  );
  requireCondition(
    provider.schemaVersion === 2 &&
      provider.exportType ===
        'SUPABASE_SOURCE_PROJECT_PROVIDER_SAFE_PROJECTION' &&
      provider.status === manifest.status &&
      provider.actionId === ACTION_ID &&
      provider.rawProviderBodiesPersisted === false &&
      provider.capturedBy === result.operator &&
      provider.capturedAt === result.actionCompletedAt,
    'PROVIDER_EXPORT_INVALID'
  );
  const actionStartedAt = Date.parse(result.actionStartedAt);
  const actionCompletedAt = Date.parse(result.actionCompletedAt);
  const request = requireExactKeys(
    provider.request,
    [
      'endpoint',
      'httpMethod',
      'secretFreeProjection',
      'secretFreeProjectionSha256',
      'rawWireBodyPersisted',
      'rawHttpHeadersPersisted',
    ],
    'PROVIDER_REQUEST_INVALID'
  );
  const projection = requireExactKeys(
    request.secretFreeProjection,
    [
      'db_pass',
      'desired_instance_size',
      'name',
      'organization_slug',
      'region_selection',
    ],
    'PROVIDER_REQUEST_INVALID'
  );
  const regionSelection = requireExactKeys(
    projection.region_selection,
    ['code', 'type'],
    'PROVIDER_REQUEST_INVALID'
  );
  requireCondition(
    request.endpoint === 'https://api.supabase.com/v1/projects' &&
      request.httpMethod === 'POST' &&
      request.secretFreeProjectionSha256 === manifest.payloadSha256 &&
      sha256Text(canonicalJson(projection)) === manifest.payloadSha256 &&
      request.rawWireBodyPersisted === false &&
      request.rawHttpHeadersPersisted === false &&
      projection.db_pass === 'RUNTIME_SECRET_NOT_IN_EVIDENCE' &&
      projection.desired_instance_size === 'large' &&
      projection.name === FIXED_PROJECT_NAME &&
      typeof projection.organization_slug === 'string' &&
      ORGANIZATION_SLUG_PATTERN.test(projection.organization_slug) &&
      regionSelection.code === 'ap-northeast-1' &&
      regionSelection.type === 'specific',
    'PROVIDER_REQUEST_INVALID'
  );

  let preflight = null;
  let preflightObservedAt = actionStartedAt;
  if (provider.preflight !== null) {
    preflight = requireExactKeys(
      provider.preflight,
      [
        'organization',
        'organizationResponseBodySha256',
        'region',
        'regionResponseBodySha256',
        'projectListPages',
        'projectCount',
        'duplicateMatchCount',
        'observedAt',
      ],
      'PROVIDER_PREFLIGHT_INVALID'
    );
    const organization = requireExactKeys(
      preflight.organization,
      ['organizationId', 'organizationSlug', 'plan'],
      'PROVIDER_PREFLIGHT_INVALID'
    );
    const region = requireExactKeys(
      preflight.region,
      ['regionCode', 'selectionType', 'provider', 'capacityStatus'],
      'PROVIDER_PREFLIGHT_INVALID'
    );
    const projectCount = requireNonNegativeInteger(
      preflight.projectCount,
      'PROVIDER_PREFLIGHT_INVALID'
    );
    const duplicateMatchCount = requireNonNegativeInteger(
      preflight.duplicateMatchCount,
      'PROVIDER_PREFLIGHT_INVALID'
    );
    requireCondition(
      organization.plan === 'PRO' &&
        requireString(organization.organizationId, 'PROVIDER_PREFLIGHT_INVALID')
          .length > 0 &&
        organization.organizationSlug === projection.organization_slug &&
        region.regionCode === 'ap-northeast-1' &&
        region.selectionType === 'specific' &&
        requireString(region.provider, 'PROVIDER_PREFLIGHT_INVALID').length >
          0 &&
        requireString(region.capacityStatus, 'PROVIDER_PREFLIGHT_INVALID')
          .length > 0 &&
        requireSha256(
          preflight.organizationResponseBodySha256,
          'PROVIDER_PREFLIGHT_INVALID'
        ).length === 64 &&
        requireSha256(
          preflight.regionResponseBodySha256,
          'PROVIDER_PREFLIGHT_INVALID'
        ).length === 64 &&
        projectCount === validateProjectListPages(preflight.projectListPages) &&
        duplicateMatchCount <= projectCount &&
        Number.isFinite(
          Date.parse(
            requireTimestamp(preflight.observedAt, 'PROVIDER_PREFLIGHT_INVALID')
          )
        ),
      'PROVIDER_PREFLIGHT_INVALID'
    );
    preflightObservedAt = Date.parse(preflight.observedAt);
    requireCondition(
      preflightObservedAt >= actionStartedAt &&
        preflightObservedAt <= actionCompletedAt,
      'EVIDENCE_CHRONOLOGY_INVALID'
    );
  }
  const expectedDuplicateState =
    preflight === null
      ? 'NOT_CHECKED'
      : preflight.duplicateMatchCount === 0
        ? 'ABSENT_ALL_PAGES'
        : 'DUPLICATE_FOUND';
  requireCondition(
    ['NOT_CHECKED', 'ABSENT_ALL_PAGES', 'DUPLICATE_FOUND'].includes(
      result.duplicateState
    ) && result.duplicateState === expectedDuplicateState,
    'EVIDENCE_CROSS_ARTIFACT_MISMATCH'
  );

  let safeCreateProjection = null;
  if (manifest.status === 'PASS') {
    requireCondition(
      preflight !== null && preflight.duplicateMatchCount === 0,
      'PROVIDER_PASS_INVALID'
    );
    const create = requireExactKeys(
      provider.createResponse,
      ['httpStatus', 'safeProjection', 'responseBodySha256'],
      'PROVIDER_PASS_INVALID'
    );
    const created = requireExactKeys(
      create.safeProjection,
      [
        'projectRef',
        'organizationId',
        'organizationSlug',
        'projectName',
        'region',
        'createdAt',
        'status',
      ],
      'PROVIDER_PASS_INVALID'
    );
    requireTimestamp(created.createdAt, 'PROVIDER_PASS_INVALID');
    requireCondition(
      create.httpStatus === 201 &&
        requireSha256(create.responseBodySha256, 'PROVIDER_PASS_INVALID')
          .length === 64 &&
        PROJECT_REF_PATTERN.test(created.projectRef) &&
        created.organizationId === preflight.organization.organizationId &&
        created.organizationSlug === projection.organization_slug &&
        created.projectName === projection.name &&
        created.region === 'ap-northeast-1' &&
        PROVIDER_PROJECT_STATUSES.has(created.status),
      'PROVIDER_PASS_INVALID'
    );
    safeCreateProjection = created;
    const createdAt = Date.parse(created.createdAt);
    requireCondition(
      createdAt >=
        actionStartedAt - PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_MILLISECONDS &&
        createdAt <=
          actionCompletedAt +
            PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_MILLISECONDS,
      'EVIDENCE_CHRONOLOGY_INVALID'
    );
    const readinessValidation = validateReadinessObservation({
      value: provider.readinessObservation,
      code: 'PROVIDER_PASS_INVALID',
      actionStartedAt,
      actionCompletedAt,
      earliestObservedAt: preflightObservedAt,
      expectedProjectRef: created.projectRef,
    });
    const readyProject = readinessValidation.project;
    requireCondition(
      readyProject.projectRef === created.projectRef &&
        readyProject.projectName === created.projectName &&
        readyProject.region === created.region &&
        readyProject.isBranch === false &&
        readyProject.status === 'ACTIVE_HEALTHY',
      'PROVIDER_PASS_INVALID'
    );
    const compute = requireExactKeys(
      provider.computeObservation,
      [
        'projectRef',
        'addonType',
        'variantId',
        'responseBodySha256',
        'httpStatus',
        'observedAt',
      ],
      'PROVIDER_PASS_INVALID'
    );
    requireTimestamp(compute.observedAt, 'PROVIDER_PASS_INVALID');
    requireCondition(
      compute.projectRef === created.projectRef &&
        compute.addonType === 'compute_instance' &&
        compute.variantId === 'ci_large' &&
        compute.httpStatus === 200 &&
        requireSha256(compute.responseBodySha256, 'PROVIDER_PASS_INVALID')
          .length === 64 &&
        Date.parse(compute.observedAt) >= readinessValidation.lastPollAt &&
        Date.parse(compute.observedAt) <= actionCompletedAt &&
        provider.reconciliation === null,
      'PROVIDER_PASS_INVALID'
    );
    const environment = requireExactKeys(
      result.createdEnvironment,
      [
        'organizationId',
        'organizationSlug',
        'organizationPlan',
        'projectRef',
        'projectName',
        'region',
        'databaseTier',
        'createdAt',
        'status',
        'projectDeadline',
        'dataApiAuthGraphQlIntegrationState',
      ],
      'PROVISIONING_RESULT_OUTCOME_INVALID'
    );
    const expectedProjectDeadline = new Date(
      Math.min(
        Date.parse(created.createdAt) + 72 * 60 * 60 * 1000,
        Date.parse(result.quoteAndFunding.fundedThrough)
      )
    ).toISOString();
    requireCondition(
      environment.organizationId === created.organizationId &&
        environment.organizationSlug === created.organizationSlug &&
        environment.organizationPlan === 'PRO' &&
        environment.projectRef === created.projectRef &&
        environment.projectName === created.projectName &&
        environment.region === created.region &&
        environment.databaseTier === 'LARGE' &&
        environment.createdAt === created.createdAt &&
        environment.status === 'ACTIVE_HEALTHY' &&
        environment.dataApiAuthGraphQlIntegrationState ===
          'NOT_OBSERVED_PHASE2_REQUIRED' &&
        environment.projectDeadline === expectedProjectDeadline &&
        Date.parse(result.cleanupBoundary.deletionApprovalRequestDeadline) <=
          Date.parse(environment.projectDeadline),
      'PROVISIONING_RESULT_OUTCOME_INVALID'
    );
  } else {
    if (provider.createResponse !== null) {
      const create = requireExactKeys(
        provider.createResponse,
        ['httpStatus', 'safeProjection', 'responseBodySha256'],
        'PROVIDER_EXPORT_INVALID'
      );
      requireCondition(
        Number.isInteger(create.httpStatus) &&
          create.httpStatus >= 100 &&
          create.httpStatus <= 599,
        'PROVIDER_EXPORT_INVALID'
      );
      if (create.safeProjection === null) {
        requireCondition(
          create.httpStatus !== 201 && create.responseBodySha256 === null,
          'PROVIDER_EXPORT_INVALID'
        );
      } else {
        const projected = requireExactKeys(
          create.safeProjection,
          [
            'projectRef',
            'organizationId',
            'organizationSlug',
            'projectName',
            'region',
            'createdAt',
            'status',
          ],
          'PROVIDER_EXPORT_INVALID'
        );
        requireTimestamp(projected.createdAt, 'PROVIDER_EXPORT_INVALID');
        requireCondition(
          create.httpStatus === 201 &&
            preflight !== null &&
            PROJECT_REF_PATTERN.test(projected.projectRef) &&
            projected.organizationId ===
              preflight.organization.organizationId &&
            projected.organizationSlug === projection.organization_slug &&
            projected.projectName === projection.name &&
            projected.region === 'ap-northeast-1' &&
            PROVIDER_PROJECT_STATUSES.has(projected.status) &&
            Date.parse(projected.createdAt) >=
              actionStartedAt -
                PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_MILLISECONDS &&
            Date.parse(projected.createdAt) <=
              actionCompletedAt +
                PROVIDER_CREATED_AT_MAXIMUM_CLOCK_SKEW_MILLISECONDS,
          'PROVIDER_EXPORT_INVALID'
        );
        requireSha256(create.responseBodySha256, 'PROVIDER_EXPORT_INVALID');
        safeCreateProjection = projected;
      }
    }
    if (provider.reconciliation !== null) {
      const reconciliation = validateReconciliation(
        provider.reconciliation,
        safeCreateProjection?.projectRef ?? null
      );
      requireCondition(
        canonicalJson(reconciliation) ===
          canonicalJson(result.readOnlyReconciliation),
        'EVIDENCE_CROSS_ARTIFACT_MISMATCH'
      );
      requireCondition(
        Date.parse(reconciliation.observedAt) >= actionStartedAt &&
          Date.parse(reconciliation.observedAt) <= actionCompletedAt,
        'EVIDENCE_CHRONOLOGY_INVALID'
      );
    } else {
      requireCondition(
        result.readOnlyReconciliation === null,
        'EVIDENCE_CROSS_ARTIFACT_MISMATCH'
      );
    }
    if (provider.readinessObservation !== null) {
      requireCondition(
        safeCreateProjection !== null,
        'PROVIDER_EXPORT_INVALID'
      );
      const readiness = validateReadinessObservation({
        value: provider.readinessObservation,
        code: 'PROVIDER_EXPORT_INVALID',
        actionStartedAt,
        actionCompletedAt,
        earliestObservedAt: preflightObservedAt,
        expectedProjectRef: safeCreateProjection?.projectRef ?? null,
      });
      requireCondition(
        readiness.project.status === 'ACTIVE_HEALTHY',
        'PROVIDER_EXPORT_INVALID'
      );
    }
    if (provider.computeObservation !== null) {
      requireCondition(
        safeCreateProjection !== null,
        'PROVIDER_EXPORT_INVALID'
      );
      const compute = requireExactKeys(
        provider.computeObservation,
        [
          'projectRef',
          'addonType',
          'variantId',
          'responseBodySha256',
          'httpStatus',
          'observedAt',
        ],
        'PROVIDER_EXPORT_INVALID'
      );
      requireTimestamp(compute.observedAt, 'PROVIDER_EXPORT_INVALID');
      requireCondition(
        compute.projectRef === safeCreateProjection.projectRef &&
          compute.addonType === 'compute_instance' &&
          compute.variantId === 'ci_large' &&
          compute.httpStatus === 200 &&
          Date.parse(compute.observedAt) >= preflightObservedAt &&
          Date.parse(compute.observedAt) <= actionCompletedAt,
        'PROVIDER_EXPORT_INVALID'
      );
      requireSha256(compute.responseBodySha256, 'PROVIDER_EXPORT_INVALID');
    }
    const noPostProviderArtifacts =
      provider.createResponse === null &&
      provider.readinessObservation === null &&
      provider.computeObservation === null &&
      provider.reconciliation === null;
    if (manifest.status === 'DUPLICATE_FOUND') {
      requireCondition(
        result.createPostAttemptCount === 0 &&
          preflight !== null &&
          preflight.duplicateMatchCount > 0 &&
          noPostProviderArtifacts,
        'PROVIDER_EXPORT_OUTCOME_INVALID'
      );
    } else if (manifest.status === 'PRECHECK_ABORTED') {
      requireCondition(
        result.createPostAttemptCount === 0 &&
          (preflight === null || preflight.duplicateMatchCount === 0) &&
          noPostProviderArtifacts,
        'PROVIDER_EXPORT_OUTCOME_INVALID'
      );
    } else if (manifest.status === 'UNKNOWN_REMOTE_OUTCOME') {
      requireCondition(
        result.createPostAttemptCount === 1 &&
          (preflight === null
            ? provider.createResponse === null &&
              result.partialFailureState ===
                'PROCESS_INTERRUPTION_AFTER_POST_INTENT_OWNER_DECISION_REQUIRED'
            : preflight.duplicateMatchCount === 0) &&
          safeCreateProjection === null &&
          provider.readinessObservation === null &&
          provider.computeObservation === null &&
          provider.reconciliation !== null,
        'PROVIDER_EXPORT_OUTCOME_INVALID'
      );
    } else {
      requireCondition(
        manifest.status === 'PARTIAL_FAILURE' &&
          result.createPostAttemptCount === 1 &&
          preflight !== null &&
          preflight.duplicateMatchCount === 0 &&
          safeCreateProjection !== null &&
          provider.reconciliation !== null,
        'PROVIDER_EXPORT_OUTCOME_INVALID'
      );
    }
  }
  return provider;
}

function fileIdentityFromStatus(status) {
  return {
    device: String(status.dev),
    inode: String(status.ino),
    size: status.size,
    modifiedAtMilliseconds: status.mtimeMs,
  };
}

function readFileSnapshot(pathname, code) {
  let descriptor;
  try {
    if (lstatSync(pathname).isSymbolicLink()) fail(code);
    descriptor = openSync(pathname, 'r');
    const before = fstatSync(descriptor);
    if (!before.isFile()) fail(code);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const beforeIdentity = fileIdentityFromStatus(before);
    const afterIdentity = fileIdentityFromStatus(after);
    if (
      canonicalJson(beforeIdentity) !== canonicalJson(afterIdentity) ||
      bytes.length !== after.size ||
      lstatSync(pathname).isSymbolicLink()
    ) {
      fail(code);
    }
    const pathStatus = statSync(pathname);
    if (
      !pathStatus.isFile() ||
      String(pathStatus.dev) !== String(after.dev) ||
      String(pathStatus.ino) !== String(after.ino)
    ) {
      fail(code);
    }
    return {
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      identity: afterIdentity,
    };
  } catch (error) {
    if (error instanceof EvidenceVerificationError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseJsonSnapshot(snapshot, code, forbiddenValues) {
  let text;
  let value;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(snapshot.bytes);
    value = JSON.parse(text);
  } catch {
    fail(code);
  }
  assertSecretFreeEvidence(text, forbiddenValues);
  requireCondition(
    text === `${canonicalJson(value)}\n`,
    'EVIDENCE_JSON_NON_CANONICAL'
  );
  return requireRecord(value, code);
}

function requireExactFileSet(directory) {
  let entries;
  try {
    entries = readdirSync(directory).sort();
  } catch {
    fail('EVIDENCE_DIRECTORY_INVALID');
  }
  requireCondition(
    canonicalJson(entries) === canonicalJson([...REQUIRED_FILES].sort()),
    'EVIDENCE_FILE_SET_INVALID'
  );
  for (const filename of entries) {
    const artifactPath = path.join(directory, filename);
    requireCondition(
      !lstatSync(artifactPath).isSymbolicLink() &&
        statSync(artifactPath).isFile(),
      'EVIDENCE_FILE_TYPE_INVALID'
    );
  }
}

export function verifyProvisioningEvidenceDirectory(
  directoryInput,
  forbiddenValues = []
) {
  requireCondition(
    typeof directoryInput === 'string' && directoryInput.length > 0,
    'EVIDENCE_DIRECTORY_INVALID'
  );
  const directory = path.resolve(directoryInput);
  requireCondition(
    existsSync(directory) &&
      statSync(directory).isDirectory() &&
      !lstatSync(directory).isSymbolicLink(),
    'EVIDENCE_DIRECTORY_INVALID'
  );
  requireExactFileSet(directory);

  const snapshots = new Map(
    REQUIRED_FILES.map(filename => [
      filename,
      readFileSnapshot(path.join(directory, filename), 'EVIDENCE_FILE_INVALID'),
    ])
  );

  const manifestPath = path.join(directory, 'manifest.json');
  const manifestSnapshot = snapshots.get('manifest.json');
  const manifest = requireExactKeys(
    parseJsonSnapshot(manifestSnapshot, 'MANIFEST_INVALID', forbiddenValues),
    [
      'schemaVersion',
      'manifestType',
      'status',
      'actionId',
      'gitCommit',
      'bindingMaterialSha256',
      'payloadSha256',
      'artifacts',
      'artifactCount',
      'rawProviderBodiesPersisted',
      'rawHttpHeadersPersisted',
      'sealedAt',
    ],
    'MANIFEST_INVALID'
  );
  requireCondition(
    manifest.schemaVersion === 1 &&
      manifest.manifestType ===
        'PR12_PHASE1_SOURCE_PROJECT_PROVISIONING_EVIDENCE' &&
      ALLOWED_OUTCOMES.has(manifest.status) &&
      manifest.actionId === ACTION_ID &&
      typeof manifest.gitCommit === 'string' &&
      GIT_SHA_PATTERN.test(manifest.gitCommit) &&
      typeof manifest.bindingMaterialSha256 === 'string' &&
      SHA256_PATTERN.test(manifest.bindingMaterialSha256) &&
      typeof manifest.payloadSha256 === 'string' &&
      SHA256_PATTERN.test(manifest.payloadSha256) &&
      manifest.rawProviderBodiesPersisted === false &&
      manifest.rawHttpHeadersPersisted === false &&
      requireTimestamp(manifest.sealedAt, 'MANIFEST_INVALID').length > 0,
    'MANIFEST_INVALID'
  );
  assertSecretFreeEvidence(manifest, forbiddenValues);

  const artifacts = Array.isArray(manifest.artifacts)
    ? manifest.artifacts
    : fail('MANIFEST_ARTIFACTS_INVALID');
  requireCondition(
    manifest.artifactCount === JSON_ARTIFACTS.length &&
      artifacts.length === JSON_ARTIFACTS.length,
    'MANIFEST_ARTIFACTS_INVALID'
  );
  const metadataByPath = new Map();
  const expectedClassificationByPath = new Map([
    ['action-events.json', 'INTERNAL_NO_PII'],
    [
      'provider-export.safe.json',
      'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS',
    ],
    [
      'provisioning-result.json',
      'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS',
    ],
    ['privacy-scan.json', 'INTERNAL_NO_PII'],
  ]);
  for (const item of artifacts) {
    const metadata = requireExactKeys(
      item,
      ['path', 'bytes', 'sha256', 'classification'],
      'MANIFEST_ARTIFACTS_INVALID'
    );
    requireCondition(
      JSON_ARTIFACTS.includes(metadata.path) &&
        !metadataByPath.has(metadata.path) &&
        Number.isInteger(metadata.bytes) &&
        metadata.bytes >= 0 &&
        typeof metadata.sha256 === 'string' &&
        SHA256_PATTERN.test(metadata.sha256) &&
        metadata.classification ===
          expectedClassificationByPath.get(metadata.path),
      'MANIFEST_ARTIFACTS_INVALID'
    );
    const artifactSnapshot = snapshots.get(metadata.path);
    requireCondition(
      artifactSnapshot.bytes.length === metadata.bytes &&
        artifactSnapshot.sha256 === metadata.sha256,
      'ARTIFACT_HASH_OR_SIZE_MISMATCH'
    );
    const artifact = parseJsonSnapshot(
      artifactSnapshot,
      'ARTIFACT_JSON_INVALID',
      forbiddenValues
    );
    assertSecretFreeEvidence(artifact, forbiddenValues);
    metadataByPath.set(metadata.path, { artifact, metadata });
  }
  requireCondition(
    JSON_ARTIFACTS.every(filename => metadataByPath.has(filename)),
    'MANIFEST_ARTIFACTS_INVALID'
  );

  const manifestSha256 = manifestSnapshot.sha256;
  let sidecar;
  try {
    sidecar = new TextDecoder('utf-8', { fatal: true }).decode(
      snapshots.get('manifest.sha256').bytes
    );
  } catch {
    fail('MANIFEST_SIDECAR_MISMATCH');
  }
  requireCondition(
    sidecar === `${manifestSha256}  manifest.json\n`,
    'MANIFEST_SIDECAR_MISMATCH'
  );

  const events = metadataByPath.get('action-events.json').artifact;
  const provider = metadataByPath.get('provider-export.safe.json').artifact;
  const result = metadataByPath.get('provisioning-result.json').artifact;
  const privacy = metadataByPath.get('privacy-scan.json').artifact;
  const validatedResult = validateProvisioningResult(
    result,
    manifest,
    metadataByPath.get('provider-export.safe.json').metadata
  );
  validateProviderExport(provider, manifest, validatedResult);
  validateActionEvents(events, manifest.status, validatedResult, provider);
  requireCondition(
    Date.parse(validatedResult.actionCompletedAt) <=
      Date.parse(manifest.sealedAt),
    'EVIDENCE_CHRONOLOGY_INVALID'
  );

  const privacyRecord = requireExactKeys(
    privacy,
    [
      'schemaVersion',
      'scanType',
      'status',
      'scanner',
      'rawProviderBodiesPersisted',
      'rawHttpHeadersPersisted',
      'runtimeSecretValuesComparedAgainstArtifacts',
      'runtimeSecretValueCount',
      'scanMode',
      'scannedArtifacts',
      'scannedAt',
    ],
    'PRIVACY_SCAN_INVALID'
  );
  const availableForbiddenValues = forbiddenValues.filter(
    value => typeof value === 'string' && value.length > 0
  );
  if (availableForbiddenValues.length > 0) {
    requireCondition(
      privacyRecord.runtimeSecretValueCount === availableForbiddenValues.length,
      'PRIVACY_SCAN_INVALID'
    );
  }
  const expectedRuntimeSecretValueCount =
    manifest.status === 'PASS' || manifest.status === 'DUPLICATE_FOUND'
      ? 2
      : validatedResult.createPostAttemptCount === 1
        ? provider.preflight === null
          ? 1
          : 2
        : validatedResult.remoteContactCount > 0 ||
            validatedResult.journalEvidence.postIntentSha256 !== null
          ? 2
          : null;
  const scannedArtifacts = Array.isArray(privacyRecord.scannedArtifacts)
    ? privacy.scannedArtifacts
    : fail('PRIVACY_SCAN_INVALID');
  const expectedPrivacyInputs = [
    'action-events.json',
    'provider-export.safe.json',
    'provisioning-result.json',
  ];
  requireCondition(
    privacyRecord.schemaVersion === 1 &&
      privacyRecord.scanType ===
        'PR12_PHASE1_EVIDENCE_PRIVACY_AND_SECRET_SCAN' &&
      privacyRecord.status === 'PASS' &&
      privacyRecord.scanner ===
        'pr12-source-project-provisioning-contract-v1' &&
      privacyRecord.rawProviderBodiesPersisted === false &&
      privacyRecord.rawHttpHeadersPersisted === false &&
      privacyRecord.runtimeSecretValuesComparedAgainstArtifacts === true &&
      Number.isInteger(privacyRecord.runtimeSecretValueCount) &&
      privacyRecord.runtimeSecretValueCount >= 0 &&
      privacyRecord.runtimeSecretValueCount <= 2 &&
      (expectedRuntimeSecretValueCount === null ||
        privacyRecord.runtimeSecretValueCount ===
          expectedRuntimeSecretValueCount) &&
      privacyRecord.scanMode ===
        (privacyRecord.runtimeSecretValueCount === 0
          ? 'STRUCTURAL_ONLY_NO_RUNTIME_VALUES_AVAILABLE'
          : 'STRUCTURAL_AND_AVAILABLE_RUNTIME_VALUES') &&
      requireTimestamp(privacyRecord.scannedAt, 'PRIVACY_SCAN_INVALID').length >
        0 &&
      Date.parse(privacyRecord.scannedAt) >=
        Date.parse(validatedResult.actionCompletedAt) &&
      Date.parse(privacyRecord.scannedAt) <= Date.parse(manifest.sealedAt) &&
      canonicalJson(scannedArtifacts.map(item => item.path).sort()) ===
        canonicalJson(expectedPrivacyInputs.sort()),
    'PRIVACY_SCAN_INVALID'
  );
  for (const scanItem of scannedArtifacts) {
    requireExactKeys(
      scanItem,
      ['path', 'bytes', 'sha256'],
      'PRIVACY_SCAN_INVALID'
    );
    const expected = metadataByPath.get(scanItem.path)?.metadata;
    requireCondition(
      expected !== undefined &&
        scanItem.bytes === expected.bytes &&
        scanItem.sha256 === expected.sha256,
      'PRIVACY_SCAN_INVALID'
    );
  }

  requireExactFileSet(directory);
  for (const filename of REQUIRED_FILES) {
    const original = snapshots.get(filename);
    const current = readFileSnapshot(
      path.join(directory, filename),
      'EVIDENCE_CHANGED_DURING_VERIFICATION'
    );
    requireCondition(
      original.sha256 === current.sha256 &&
        original.bytes.length === current.bytes.length &&
        canonicalJson(original.identity) === canonicalJson(current.identity),
      'EVIDENCE_CHANGED_DURING_VERIFICATION'
    );
  }

  const verificationResult = {
    status: 'PASS',
    actionId: ACTION_ID,
    outcome: manifest.status,
    gitCommit: manifest.gitCommit,
    bindingMaterialSha256: manifest.bindingMaterialSha256,
    payloadSha256: manifest.payloadSha256,
    manifestSha256,
    artifactCount: manifest.artifactCount,
    secretBearingEvidenceFound: false,
  };
  Object.defineProperties(verificationResult, {
    trustedResult: { value: validatedResult, enumerable: false },
    trustedProvider: { value: provider, enumerable: false },
  });
  return verificationResult;
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  if (argv.length !== 2 || argv[0] !== '--evidence-directory') {
    fail('ARGUMENTS_INVALID');
  }
  return { help: false, evidenceDirectory: argv[1] };
}

function main() {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(
        'Usage: node scripts/commercial-hardening/verify-pr12-source-project-provisioning-evidence.mjs --evidence-directory <absolute-or-relative-directory>\n'
      );
      return;
    }
    const result = verifyProvisioningEvidenceDirectory(args.evidenceDirectory);
    process.stdout.write(`${canonicalJson(result)}\n`);
  } catch (error) {
    const code =
      error instanceof EvidenceVerificationError
        ? error.code
        : typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            typeof error.code === 'string'
          ? error.code
          : 'UNEXPECTED_VERIFICATION_FAILURE';
    process.stderr.write(
      `PR12 Phase 1 evidence verification failed: ${code}\n`
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) main();
