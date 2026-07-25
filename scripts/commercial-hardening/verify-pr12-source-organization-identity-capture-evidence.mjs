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
  ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
  ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT,
  OrganizationIdentityCaptureContractError,
  assertOrganizationIdentityCaptureEvidenceSecretFree,
} from './pr12-source-organization-identity-capture-contract.mjs';
import {
  APPROVED_BASE_COMMIT,
  TARGET_ORGANIZATION_NAME,
  TARGET_ORGANIZATION_SLUG,
  canonicalJson,
  sha256Text,
} from './pr12-source-project-provisioning-contract.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const JSON_ARTIFACTS = Object.freeze([
  'action-events.json',
  'organization-identity-capture-result.json',
  'privacy-scan.json',
  'provider-export.safe.json',
]);
const REQUIRED_FILES = Object.freeze([
  ...JSON_ARTIFACTS,
  'manifest.json',
  'manifest.sha256',
]);
const ALLOWED_OUTCOMES = new Set([
  'PASS',
  'PARTIAL_FAILURE',
  'UNKNOWN_REMOTE_OUTCOME',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export class OrganizationIdentityCaptureEvidenceError extends Error {
  constructor(code) {
    super(code);
    this.name = 'OrganizationIdentityCaptureEvidenceError';
    this.code = code;
  }
}

function fail(code) {
  throw new OrganizationIdentityCaptureEvidenceError(code);
}

function requireCondition(condition, code) {
  if (!condition) fail(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected, code) {
  requireCondition(isRecord(value), code);
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  requireCondition(
    actual.length === sortedExpected.length &&
      actual.every((key, index) => key === sortedExpected[index]),
    code
  );
  return value;
}

function requireString(value, code) {
  requireCondition(
    typeof value === 'string' && value.length > 0 && value === value.trim(),
    code
  );
  return value;
}

function requireSha256(value, code) {
  const text = requireString(value, code);
  requireCondition(SHA256_PATTERN.test(text), code);
  return text;
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

function stableRead(pathname, maximumBytes = 1_048_576) {
  let descriptor;
  try {
    requireCondition(
      existsSync(pathname) && !lstatSync(pathname).isSymbolicLink(),
      'EVIDENCE_FILE_INVALID'
    );
    descriptor = openSync(pathname, 'r');
    const before = fstatSync(descriptor);
    requireCondition(
      before.isFile() && before.size <= maximumBytes,
      'EVIDENCE_FILE_INVALID'
    );
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const current = statSync(pathname);
    requireCondition(
      after.isFile() &&
        current.isFile() &&
        before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        after.dev === current.dev &&
        after.ino === current.ino &&
        bytes.length === after.size,
      'EVIDENCE_FILE_CHANGED'
    );
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseCanonicalJson(bytes, code) {
  let text;
  let parsed;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    parsed = JSON.parse(text);
  } catch {
    fail(code);
  }
  requireCondition(
    isRecord(parsed) && text === `${canonicalJson(parsed)}\n`,
    code
  );
  return parsed;
}

function validateProductionBoundary(value, code) {
  const boundary = exactKeys(
    value,
    [
      'organizationProjectEnumerationPerformed',
      'productionProjectSpecificManagementApiContactCount',
      'productionProjectDataPlaneContactCount',
      'productionDatabaseContactCount',
      'productionCredentialAccessCount',
    ],
    code
  );
  requireCondition(
    boundary.organizationProjectEnumerationPerformed === false &&
      boundary.productionProjectSpecificManagementApiContactCount === 0 &&
      boundary.productionProjectDataPlaneContactCount === 0 &&
      boundary.productionDatabaseContactCount === 0 &&
      boundary.productionCredentialAccessCount === 0,
    code
  );
}

function validateSafeProjection(value, code) {
  const projection = exactKeys(
    value,
    ['organizationId', 'organizationName', 'organizationSlug', 'plan'],
    code
  );
  requireCondition(
    typeof projection.organizationId === 'string' &&
      projection.organizationId.length > 0 &&
      projection.organizationId.length <= 256 &&
      ORGANIZATION_ID_PATTERN.test(projection.organizationId) &&
      projection.organizationName === TARGET_ORGANIZATION_NAME &&
      projection.organizationSlug === TARGET_ORGANIZATION_SLUG &&
      projection.plan === 'PRO',
    code
  );
  return projection;
}

function validateEvents(eventsDocument, outcome) {
  const document = exactKeys(
    eventsDocument,
    ['actionId', 'events', 'outcome', 'schemaVersion'],
    'ACTION_EVENTS_INVALID'
  );
  requireCondition(
    document.schemaVersion === 1 &&
      document.actionId === ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID &&
      document.outcome === outcome &&
      Array.isArray(document.events) &&
      document.events.length >= 1 &&
      document.events.length <= 4,
    'ACTION_EVENTS_INVALID'
  );
  const expectedPrefix = [
    'CLAIMED_GET_NOT_SENT',
    'GET_INTENT_DURABLE',
    'RESPONSE_ACCEPTED',
    'ORGANIZATION_IDENTITY_CAPTURED',
  ];
  let previousContactCount = 0;
  let previousTimestamp = null;
  document.events.forEach((event, index) => {
    const expectedState =
      outcome === 'UNKNOWN_REMOTE_OUTCOME' && index === 2
        ? 'GET_ATTEMPT_TERMINATED_WITHOUT_ACCEPTED_RESPONSE'
        : expectedPrefix[index];
    requireCondition(isRecord(event), 'ACTION_EVENTS_INVALID');
    requireCondition(
      event.sequence === index + 1 &&
        event.state === expectedState &&
        requireTimestamp(event.at, 'ACTION_EVENTS_INVALID') === event.at &&
        Number.isInteger(event.remoteContactCount) &&
        Number.isInteger(event.requestAttemptCount) &&
        event.remoteContactCount >= previousContactCount &&
        event.remoteContactCount >= 0 &&
        event.remoteContactCount <= 1 &&
        event.requestAttemptCount === event.remoteContactCount &&
        event.automaticRetryCount === 0 &&
        (previousTimestamp === null ||
          Date.parse(event.at) >= previousTimestamp),
      'ACTION_EVENTS_INVALID'
    );
    previousContactCount = event.remoteContactCount;
    previousTimestamp = Date.parse(event.at);
  });
  if (outcome === 'PASS') {
    requireCondition(
      document.events.length === 4 &&
        document.events[0].remoteContactCount === 0 &&
        document.events[1].remoteContactCount === 0 &&
        document.events[2].remoteContactCount === 1 &&
        document.events[3].remoteContactCount === 1,
      'ACTION_EVENTS_INVALID'
    );
  } else if (outcome === 'UNKNOWN_REMOTE_OUTCOME') {
    requireCondition(
      document.events.length === 3 &&
        document.events[0].state === 'CLAIMED_GET_NOT_SENT' &&
        document.events[1].state === 'GET_INTENT_DURABLE' &&
        document.events[2].state ===
          'GET_ATTEMPT_TERMINATED_WITHOUT_ACCEPTED_RESPONSE' &&
        document.events[0].remoteContactCount === 0 &&
        document.events[1].remoteContactCount === 0 &&
        document.events[2].remoteContactCount === 1,
      'ACTION_EVENTS_INVALID'
    );
  } else {
    requireCondition(
      (document.events.length === 1 || document.events.length === 2) &&
        document.events.every(event => event.remoteContactCount === 0),
      'ACTION_EVENTS_INVALID'
    );
  }
  return document;
}

function validateProvider(provider, outcome) {
  const document = exactKeys(
    provider,
    [
      'actionId',
      'capturedAt',
      'capturedBy',
      'exportType',
      'productionBoundary',
      'rawProviderBodiesPersisted',
      'request',
      'response',
      'schemaVersion',
      'status',
    ],
    'PROVIDER_EVIDENCE_INVALID'
  );
  requireCondition(
    document.schemaVersion === 1 &&
      document.exportType ===
        'SUPABASE_SOURCE_ORGANIZATION_IDENTITY_SAFE_PROJECTION' &&
      document.actionId === ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID &&
      document.status === outcome &&
      document.rawProviderBodiesPersisted === false,
    'PROVIDER_EVIDENCE_INVALID'
  );
  const request = exactKeys(
    document.request,
    ['bodyPresent', 'endpoint', 'method', 'rawHttpHeadersPersisted'],
    'PROVIDER_EVIDENCE_INVALID'
  );
  requireCondition(
    request.method === 'GET' &&
      request.endpoint === ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT &&
      request.bodyPresent === false &&
      request.rawHttpHeadersPersisted === false,
    'PROVIDER_EVIDENCE_INVALID'
  );
  validateProductionBoundary(
    document.productionBoundary,
    'PROVIDER_EVIDENCE_INVALID'
  );
  requireTimestamp(document.capturedAt, 'PROVIDER_EVIDENCE_INVALID');
  requireString(document.capturedBy, 'PROVIDER_EVIDENCE_INVALID');
  if (outcome === 'PASS') {
    const response = exactKeys(
      document.response,
      [
        'bodySha256',
        'httpStatus',
        'observedAt',
        'safeProjection',
        'safeProjectionSha256',
      ],
      'PROVIDER_EVIDENCE_INVALID'
    );
    requireCondition(
      response.httpStatus === 200 &&
        requireSha256(response.bodySha256, 'PROVIDER_EVIDENCE_INVALID') ===
          response.bodySha256 &&
        requireSha256(
          response.safeProjectionSha256,
          'PROVIDER_EVIDENCE_INVALID'
        ) === response.safeProjectionSha256 &&
        requireTimestamp(response.observedAt, 'PROVIDER_EVIDENCE_INVALID') ===
          response.observedAt,
      'PROVIDER_EVIDENCE_INVALID'
    );
    const projection = validateSafeProjection(
      response.safeProjection,
      'PROVIDER_EVIDENCE_INVALID'
    );
    requireCondition(
      sha256Text(canonicalJson(projection)) === response.safeProjectionSha256,
      'PROVIDER_EVIDENCE_INVALID'
    );
  } else {
    requireCondition(document.response === null, 'PROVIDER_EVIDENCE_INVALID');
  }
  return document;
}

function validateResult(result, outcome, manifest) {
  const document = exactKeys(
    result,
    [
      'actionId',
      'approvalWindow',
      'approvalEvidenceSha256',
      'baseCommit',
      'bindingMaterialSha256',
      'claimSha256',
      'completedAt',
      'contact',
      'credential',
      'credentialConfigurationSha256',
      'getIntentSha256',
      'gitCommit',
      'mandatoryStopObserved',
      'organization',
      'ownerControl',
      'outcome',
      'productionBoundary',
      'providerObservation',
      'rawHttpHeadersPersisted',
      'rawProviderBodiesPersisted',
      'reasonCode',
      'request',
      'requestSha256',
      'resultType',
      'runtime',
      'schemaVersion',
      'startedAt',
      'status',
    ],
    'RESULT_EVIDENCE_INVALID'
  );
  requireCondition(
    document.schemaVersion === 1 &&
      document.resultType ===
        'SOURCE_ORGANIZATION_IDENTITY_CAPTURE_OPERATION' &&
      document.status === outcome &&
      document.outcome === outcome &&
      document.actionId === ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID &&
      GIT_SHA_PATTERN.test(document.gitCommit) &&
      document.baseCommit === APPROVED_BASE_COMMIT &&
      document.gitCommit === manifest.gitCommit &&
      document.bindingMaterialSha256 === manifest.bindingMaterialSha256 &&
      document.requestSha256 === manifest.requestSha256 &&
      document.rawProviderBodiesPersisted === false &&
      document.rawHttpHeadersPersisted === false,
    'RESULT_EVIDENCE_INVALID'
  );
  for (const value of [
    document.bindingMaterialSha256,
    document.requestSha256,
    document.credentialConfigurationSha256,
    document.approvalEvidenceSha256,
    document.claimSha256,
  ]) {
    requireSha256(value, 'RESULT_EVIDENCE_INVALID');
  }
  if (document.getIntentSha256 !== null) {
    requireSha256(document.getIntentSha256, 'RESULT_EVIDENCE_INVALID');
  }
  const approvalWindow = exactKeys(
    document.approvalWindow,
    ['approvedAt', 'approvedBy', 'expiresAt', 'operatorReconfirmedAt'],
    'RESULT_EVIDENCE_INVALID'
  );
  requireTimestamp(approvalWindow.approvedAt, 'RESULT_EVIDENCE_INVALID');
  requireTimestamp(
    approvalWindow.operatorReconfirmedAt,
    'RESULT_EVIDENCE_INVALID'
  );
  requireTimestamp(approvalWindow.expiresAt, 'RESULT_EVIDENCE_INVALID');
  requireString(approvalWindow.approvedBy, 'RESULT_EVIDENCE_INVALID');
  requireCondition(
    Date.parse(approvalWindow.operatorReconfirmedAt) -
      Date.parse(approvalWindow.approvedAt) >=
      300_000 &&
      Date.parse(approvalWindow.expiresAt) -
        Date.parse(approvalWindow.approvedAt) <=
        1_800_000 &&
      Date.parse(approvalWindow.approvedAt) <
        Date.parse(approvalWindow.operatorReconfirmedAt) &&
      Date.parse(approvalWindow.operatorReconfirmedAt) <
        Date.parse(approvalWindow.expiresAt),
    'RESULT_EVIDENCE_INVALID'
  );
  const ownerControl = exactKeys(
    document.ownerControl,
    [
      'approver',
      'identitySeparationAvailable',
      'independentHumanReviewClaimed',
      'mode',
      'operator',
      'sameUserDpapiCredentialExposureRiskAccepted',
      'soleOperatorSelfApprovalRiskAccepted',
    ],
    'RESULT_EVIDENCE_INVALID'
  );
  requireCondition(
    ownerControl.mode === 'PHASE1_SOLE_OPERATOR_SELF_APPROVAL_EXCEPTION_V1' &&
      typeof ownerControl.operator === 'string' &&
      ownerControl.operator.length > 0 &&
      ownerControl.approver === ownerControl.operator &&
      ownerControl.approver === approvalWindow.approvedBy &&
      ownerControl.identitySeparationAvailable === false &&
      ownerControl.independentHumanReviewClaimed === false &&
      ownerControl.soleOperatorSelfApprovalRiskAccepted === true &&
      ownerControl.sameUserDpapiCredentialExposureRiskAccepted === true,
    'RESULT_EVIDENCE_INVALID'
  );
  const request = exactKeys(
    document.request,
    ['bodyPresent', 'endpoint', 'method', 'redirectAllowed'],
    'RESULT_EVIDENCE_INVALID'
  );
  requireCondition(
    request.method === 'GET' &&
      request.endpoint === ORGANIZATION_IDENTITY_CAPTURE_ENDPOINT &&
      request.bodyPresent === false &&
      request.redirectAllowed === false,
    'RESULT_EVIDENCE_INVALID'
  );
  const runtime = exactKeys(
    document.runtime,
    ['nodeVersion', 'processExecArgvCount'],
    'RESULT_EVIDENCE_INVALID'
  );
  requireCondition(
    typeof runtime.nodeVersion === 'string' &&
      /^v24\.[0-9]+\.[0-9]+(?:[-+].*)?$/.test(runtime.nodeVersion) &&
      runtime.processExecArgvCount === 0,
    'RESULT_EVIDENCE_INVALID'
  );
  const contact = exactKeys(
    document.contact,
    ['automaticRetryCount', 'remoteContactCount', 'requestAttemptCount'],
    'RESULT_EVIDENCE_INVALID'
  );
  requireCondition(
    Number.isInteger(contact.remoteContactCount) &&
      contact.remoteContactCount >= 0 &&
      contact.remoteContactCount <= 1 &&
      contact.requestAttemptCount === contact.remoteContactCount &&
      contact.automaticRetryCount === 0,
    'RESULT_EVIDENCE_INVALID'
  );
  const credential = exactKeys(
    document.credential,
    [
      'ambientCredentialFallbackUsed',
      'brokerInvocationCount',
      'brokerMode',
      'databasePasswordRetrieved',
      'managementAccessTokenRetrieved',
      'secretPersisted',
    ],
    'RESULT_EVIDENCE_INVALID'
  );
  requireCondition(
    credential.brokerMode === 'ORGANIZATION_IDENTITY_CAPTURE' &&
      Number.isInteger(credential.brokerInvocationCount) &&
      credential.brokerInvocationCount >= 0 &&
      credential.brokerInvocationCount <= 1 &&
      credential.databasePasswordRetrieved === false &&
      credential.ambientCredentialFallbackUsed === false &&
      credential.secretPersisted === false,
    'RESULT_EVIDENCE_INVALID'
  );
  if (outcome === 'PASS') {
    requireCondition(
      credential.brokerInvocationCount === 1 &&
        credential.managementAccessTokenRetrieved === true,
      'RESULT_EVIDENCE_INVALID'
    );
  } else {
    requireCondition(
      typeof credential.managementAccessTokenRetrieved === 'boolean' &&
        (!credential.managementAccessTokenRetrieved ||
          credential.brokerInvocationCount === 1),
      'RESULT_EVIDENCE_INVALID'
    );
  }
  validateProductionBoundary(
    document.productionBoundary,
    'RESULT_EVIDENCE_INVALID'
  );
  requireTimestamp(document.startedAt, 'RESULT_EVIDENCE_INVALID');
  requireTimestamp(document.completedAt, 'RESULT_EVIDENCE_INVALID');
  requireCondition(
    Date.parse(document.startedAt) <= Date.parse(document.completedAt) &&
      Date.parse(document.startedAt) >=
        Date.parse(approvalWindow.operatorReconfirmedAt) &&
      Date.parse(document.startedAt) < Date.parse(approvalWindow.expiresAt),
    'RESULT_EVIDENCE_INVALID'
  );
  if (outcome === 'PASS') {
    validateSafeProjection(document.organization, 'RESULT_EVIDENCE_INVALID');
    const observation = exactKeys(
      document.providerObservation,
      ['bodySha256', 'httpStatus', 'observedAt', 'safeProjectionSha256'],
      'RESULT_EVIDENCE_INVALID'
    );
    requireCondition(
      observation.httpStatus === 200 &&
        SHA256_PATTERN.test(observation.bodySha256) &&
        SHA256_PATTERN.test(observation.safeProjectionSha256) &&
        contact.remoteContactCount === 1 &&
        document.getIntentSha256 !== null &&
        document.reasonCode === null &&
        document.mandatoryStopObserved === true,
      'RESULT_EVIDENCE_INVALID'
    );
    requireTimestamp(observation.observedAt, 'RESULT_EVIDENCE_INVALID');
  } else {
    requireCondition(
      document.organization === null &&
        document.providerObservation === null &&
        typeof document.reasonCode === 'string' &&
        document.reasonCode.length > 0 &&
        document.mandatoryStopObserved === true,
      'RESULT_EVIDENCE_INVALID'
    );
  }
  return document;
}

function validatePrivacyScan(
  scan,
  artifacts,
  outcome,
  managementAccessTokenRetrieved
) {
  const document = exactKeys(
    scan,
    [
      'rawHttpHeadersPersisted',
      'rawProviderBodiesPersisted',
      'runtimeSecretValueCount',
      'runtimeSecretValuesComparedAgainstArtifacts',
      'scanMode',
      'scanType',
      'scannedArtifacts',
      'scannedAt',
      'scanner',
      'schemaVersion',
      'status',
    ],
    'PRIVACY_SCAN_INVALID'
  );
  const expectedRuntimeSecretValueCount = managementAccessTokenRetrieved
    ? 1
    : 0;
  const expectedScanMode = managementAccessTokenRetrieved
    ? 'RUNTIME_TOKEN_AND_STATIC_MARKER_EXACT_SUBSTRING_SCAN'
    : 'STATIC_MARKER_EXACT_SUBSTRING_SCAN';
  requireCondition(
    document.schemaVersion === 1 &&
      document.scanType ===
        'PR12_SOURCE_ORGANIZATION_IDENTITY_CAPTURE_PRIVACY_AND_SECRET_SCAN' &&
      document.status === outcome &&
      document.scanner ===
        'pr12-source-organization-identity-capture-contract-v1' &&
      document.rawProviderBodiesPersisted === false &&
      document.rawHttpHeadersPersisted === false &&
      document.runtimeSecretValuesComparedAgainstArtifacts === true &&
      document.runtimeSecretValueCount === expectedRuntimeSecretValueCount &&
      document.scanMode === expectedScanMode &&
      canonicalJson(document.scannedArtifacts) === canonicalJson(artifacts),
    'PRIVACY_SCAN_INVALID'
  );
  requireTimestamp(document.scannedAt, 'PRIVACY_SCAN_INVALID');
  return document;
}

export function verifyOrganizationIdentityCaptureEvidenceDirectory(
  directoryInput,
  forbiddenValues = []
) {
  const directory = path.resolve(directoryInput);
  requireCondition(
    existsSync(directory) &&
      !lstatSync(directory).isSymbolicLink() &&
      statSync(directory).isDirectory(),
    'EVIDENCE_DIRECTORY_INVALID'
  );
  const actualFiles = readdirSync(directory).sort();
  requireCondition(
    canonicalJson(actualFiles) === canonicalJson([...REQUIRED_FILES].sort()),
    'EVIDENCE_FILE_SET_INVALID'
  );
  const bytesByName = Object.fromEntries(
    REQUIRED_FILES.map(filename => [
      filename,
      stableRead(path.join(directory, filename)),
    ])
  );
  const manifest = parseCanonicalJson(
    bytesByName['manifest.json'],
    'MANIFEST_INVALID'
  );
  const manifestSha256 = createHash('sha256')
    .update(bytesByName['manifest.json'])
    .digest('hex');
  const sidecar = new TextDecoder('utf-8', { fatal: true }).decode(
    bytesByName['manifest.sha256']
  );
  requireCondition(
    sidecar === `${manifestSha256}\n`,
    'MANIFEST_SIDECAR_INVALID'
  );
  exactKeys(
    manifest,
    [
      'actionId',
      'artifactCount',
      'artifacts',
      'bindingMaterialSha256',
      'gitCommit',
      'manifestType',
      'rawHttpHeadersPersisted',
      'rawProviderBodiesPersisted',
      'requestSha256',
      'schemaVersion',
      'sealedAt',
      'status',
    ],
    'MANIFEST_INVALID'
  );
  requireCondition(
    manifest.schemaVersion === 1 &&
      manifest.manifestType ===
        'PR12_SOURCE_ORGANIZATION_IDENTITY_CAPTURE_EVIDENCE' &&
      manifest.actionId === ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID &&
      ALLOWED_OUTCOMES.has(manifest.status) &&
      GIT_SHA_PATTERN.test(manifest.gitCommit) &&
      SHA256_PATTERN.test(manifest.bindingMaterialSha256) &&
      SHA256_PATTERN.test(manifest.requestSha256) &&
      manifest.rawProviderBodiesPersisted === false &&
      manifest.rawHttpHeadersPersisted === false &&
      Array.isArray(manifest.artifacts) &&
      manifest.artifactCount === JSON_ARTIFACTS.length &&
      manifest.artifacts.length === JSON_ARTIFACTS.length,
    'MANIFEST_INVALID'
  );
  requireTimestamp(manifest.sealedAt, 'MANIFEST_INVALID');
  const metadataByPath = new Map();
  for (const entry of manifest.artifacts) {
    exactKeys(
      entry,
      ['bytes', 'classification', 'path', 'sha256'],
      'MANIFEST_ARTIFACT_INVALID'
    );
    requireCondition(
      JSON_ARTIFACTS.includes(entry.path) &&
        !metadataByPath.has(entry.path) &&
        Number.isInteger(entry.bytes) &&
        entry.bytes > 0 &&
        entry.bytes === bytesByName[entry.path].length &&
        entry.sha256 ===
          createHash('sha256').update(bytesByName[entry.path]).digest('hex') &&
        [
          'INTERNAL_NO_PII',
          'INTERNAL_OWNER_IDENTIFIERS_NO_PATIENT_DATA_NO_SECRETS',
        ].includes(entry.classification),
      'MANIFEST_ARTIFACT_INVALID'
    );
    metadataByPath.set(entry.path, entry);
  }
  requireCondition(
    JSON_ARTIFACTS.every(filename => metadataByPath.has(filename)),
    'MANIFEST_ARTIFACT_INVALID'
  );
  const documents = Object.fromEntries(
    JSON_ARTIFACTS.map(filename => [
      filename,
      parseCanonicalJson(bytesByName[filename], 'EVIDENCE_JSON_INVALID'),
    ])
  );
  const events = validateEvents(
    documents['action-events.json'],
    manifest.status
  );
  const provider = validateProvider(
    documents['provider-export.safe.json'],
    manifest.status
  );
  const result = validateResult(
    documents['organization-identity-capture-result.json'],
    manifest.status,
    manifest
  );
  const privacy = validatePrivacyScan(
    documents['privacy-scan.json'],
    [
      'action-events.json',
      'organization-identity-capture-result.json',
      'provider-export.safe.json',
    ],
    manifest.status,
    result.credential.managementAccessTokenRetrieved
  );
  requireCondition(
    events.events.at(-1).remoteContactCount ===
      result.contact.remoteContactCount &&
      events.events[0].at === result.startedAt &&
      Date.parse(events.events.at(-1).at) <= Date.parse(result.completedAt) &&
      events.events.length >= 2 === (result.getIntentSha256 !== null) &&
      (manifest.status !== 'UNKNOWN_REMOTE_OUTCOME' ||
        events.events.at(-1).at === result.completedAt) &&
      provider.capturedBy === result.ownerControl.operator &&
      provider.capturedBy === result.ownerControl.approver &&
      provider.capturedBy === result.approvalWindow.approvedBy &&
      provider.capturedAt === result.completedAt &&
      Date.parse(result.completedAt) <= Date.parse(privacy.scannedAt) &&
      Date.parse(privacy.scannedAt) <= Date.parse(manifest.sealedAt),
    'EVIDENCE_CROSS_BINDING_INVALID'
  );
  if (events.events.length >= 2) {
    requireCondition(
      Date.parse(events.events[1].at) <
        Date.parse(result.approvalWindow.expiresAt),
      'EVIDENCE_CROSS_BINDING_INVALID'
    );
  }
  if (manifest.status === 'PASS') {
    requireCondition(
      canonicalJson(result.organization) ===
        canonicalJson(provider.response.safeProjection) &&
        events.events[2].at === result.providerObservation.observedAt &&
        provider.response.observedAt ===
          result.providerObservation.observedAt &&
        events.events[3].at === result.completedAt &&
        result.providerObservation.bodySha256 ===
          provider.response.bodySha256 &&
        result.providerObservation.safeProjectionSha256 ===
          provider.response.safeProjectionSha256,
      'EVIDENCE_CROSS_BINDING_INVALID'
    );
  }
  for (const document of Object.values(documents)) {
    assertOrganizationIdentityCaptureEvidenceSecretFree(
      document,
      forbiddenValues
    );
  }
  return {
    status: 'PASS',
    actionOutcome: manifest.status,
    actionId: ORGANIZATION_IDENTITY_CAPTURE_ACTION_ID,
    manifestSha256,
    organizationId:
      manifest.status === 'PASS' ? result.organization.organizationId : null,
    remoteContactCount: result.contact.remoteContactCount,
    requestAttemptCount: result.contact.requestAttemptCount,
    automaticRetryCount: result.contact.automaticRetryCount,
  };
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  if (
    argv.length !== 2 ||
    argv[0] !== '--evidence-directory' ||
    argv[1].startsWith('--')
  ) {
    fail('ARGUMENTS_INVALID');
  }
  return { help: false, directory: argv[1] };
}

function main() {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    if (parsed.help) {
      process.stdout.write(
        'Usage: node verify-pr12-source-organization-identity-capture-evidence.mjs --evidence-directory <absolute-directory>\n'
      );
      return;
    }
    const result = verifyOrganizationIdentityCaptureEvidenceDirectory(
      parsed.directory
    );
    process.stdout.write(`${canonicalJson(result)}\n`);
  } catch (error) {
    const code =
      error instanceof OrganizationIdentityCaptureEvidenceError ||
      error instanceof OrganizationIdentityCaptureContractError
        ? error.code
        : 'UNEXPECTED_LOCAL_FAILURE';
    process.stderr.write(
      `PR12 organization identity evidence verification stopped: ${code}\n`
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === scriptPath) main();
