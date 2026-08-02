import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  assertStageRuntimeBinding,
  buildIsolatedChildEnvironment,
  buildPinnedSpawnContract,
  dispatchPinnedCommandOnce,
  serializeCanonicalEvidence,
} from './pr12-stage-command-runtime.mjs';

const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const PRODUCTION_PROJECT_REF = 'qnanuoqveidwvacvbhqp';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const SYSTEM_IDENTIFIER_PATTERN = /^(?:0|[1-9][0-9]{0,19})$/u;
const POSTGREST_VERSION_PATTERN = /(PostgrestVersion:\s*')[^']+('(?:;)?)/g;

function fail(code) {
  throw new Error(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value, code) {
  if (!isRecord(value)) fail(code);
  return value;
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.length === 0) fail(code);
  return value;
}

function requireExactKeys(value, keys, code) {
  const record = requireRecord(value, code);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(code);
  }
  return record;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isAbsoluteWindowsOrNative(value) {
  return (
    typeof value === 'string' &&
    (path.isAbsolute(value) || path.win32.isAbsolute(value))
  );
}

function isInsideRepository(repositoryRoot, candidate) {
  const useWindows =
    path.win32.isAbsolute(repositoryRoot) && path.win32.isAbsolute(candidate);
  const library = useWindows ? path.win32 : path;
  const relative = library.relative(
    library.resolve(repositoryRoot),
    library.resolve(candidate)
  );
  return (
    relative === '' ||
    (!relative.startsWith(`..${library.sep}`) &&
      relative !== '..' &&
      !library.isAbsolute(relative))
  );
}

function assertTypeText(value, code) {
  const text = requireString(value, code)
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/g, '\n');
  if (
    !text.includes('export type Json') ||
    !text.includes('export type Database')
  ) {
    fail(code);
  }
  if (
    /postgres(?:ql)?:\/\/[^/\s"'@]+:[^@\s"']+@/i.test(text) ||
    /sbp_[a-z0-9_-]{16,}/i.test(text) ||
    /sb_(?:secret|publishable)_[a-z0-9_-]+/i.test(text)
  ) {
    fail('SECRET_BEARING_GENERATED_TYPES');
  }
  return `${text.trimEnd()}\n`;
}

export function extractGeneratedTypes(stdoutInput) {
  const stdout = requireString(stdoutInput, 'GENERATED_TYPES_OUTPUT_INVALID')
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/g, '\n');
  const lines = stdout.split('\n');
  const start = lines.findIndex(line =>
    line.trimStart().startsWith('export type Json')
  );
  if (start < 0) fail('GENERATED_TYPES_OUTPUT_INVALID');
  return assertTypeText(
    lines.slice(start).join('\n'),
    'GENERATED_TYPES_OUTPUT_INVALID'
  );
}

export function normalizeHostedTypes(typesInput) {
  return assertTypeText(typesInput, 'GENERATED_TYPES_OUTPUT_INVALID').replace(
    POSTGREST_VERSION_PATTERN,
    '$1__PR12_POSTGREST_VERSION__$2'
  );
}

export function diagnoseHostedTypesParity(input) {
  const request = requireExactKeys(
    input,
    ['generatedTypes', 'committedTypes'],
    'GENERATED_TYPES_DIAGNOSTIC_INVALID'
  );
  const generated = assertTypeText(
    request.generatedTypes,
    'GENERATED_TYPES_OUTPUT_INVALID'
  );
  const committed = assertTypeText(
    request.committedTypes,
    'COMMITTED_TYPES_INVALID'
  );
  const normalizedGenerated = normalizeHostedTypes(generated);
  const normalizedCommitted = normalizeHostedTypes(committed);
  const generatedLines = normalizedGenerated.split('\n');
  const committedLines = normalizedCommitted.split('\n');
  const maximumLines = Math.max(generatedLines.length, committedLines.length);
  let firstDifference = null;
  for (let index = 0; index < maximumLines; index += 1) {
    const generatedLine = generatedLines[index] ?? '';
    const committedLine = committedLines[index] ?? '';
    if (generatedLine !== committedLine) {
      firstDifference = {
        generatedLineNumber: index + 1,
        committedLineNumber: index + 1,
        generatedLineSha256: sha256(generatedLine),
        committedLineSha256: sha256(committedLine),
      };
      break;
    }
  }
  const parity = firstDifference === null;
  return {
    status: parity ? 'GENERATED_TYPES_PARITY' : 'GENERATED_TYPES_DRIFT',
    parity,
    generatedByteLength: Buffer.byteLength(generated, 'utf8'),
    generatedSha256: sha256(generated),
    committedByteLength: Buffer.byteLength(committed, 'utf8'),
    committedSha256: sha256(committed),
    normalizedGeneratedSha256: sha256(normalizedGenerated),
    normalizedCommittedSha256: sha256(normalizedCommitted),
    generatedLineCount: generatedLines.length,
    committedLineCount: committedLines.length,
    firstDifference,
    rawTypeTextRetained: false,
  };
}

export function compareHostedTypes(input) {
  const request = requireExactKeys(
    input,
    [
      'generatedTypes',
      'committedTypes',
      'projectRef',
      'bindingSha256',
      'gitCommit',
      'databaseSystemIdentifier',
    ],
    'GENERATED_TYPES_COMPARISON_INVALID'
  );
  if (
    !PROJECT_REF_PATTERN.test(request.projectRef) ||
    request.projectRef === PRODUCTION_PROJECT_REF
  ) {
    fail(
      request.projectRef === PRODUCTION_PROJECT_REF
        ? 'PRODUCTION_CONTACT_DENIED'
        : 'PROJECT_REF_INVALID'
    );
  }
  if (
    !SHA256_PATTERN.test(request.bindingSha256) ||
    !GIT_SHA_PATTERN.test(request.gitCommit) ||
    typeof request.databaseSystemIdentifier !== 'string' ||
    !SYSTEM_IDENTIFIER_PATTERN.test(request.databaseSystemIdentifier)
  ) {
    fail('GENERATED_TYPES_BINDING_INVALID');
  }
  const generated = assertTypeText(
    request.generatedTypes,
    'GENERATED_TYPES_OUTPUT_INVALID'
  );
  const committed = assertTypeText(
    request.committedTypes,
    'COMMITTED_TYPES_INVALID'
  );
  const diagnostic = diagnoseHostedTypesParity({
    generatedTypes: generated,
    committedTypes: committed,
  });
  if (!diagnostic.parity) {
    fail('GENERATED_TYPES_DRIFT');
  }
  return {
    status: 'GENERATED_TYPES_PARITY',
    commandId: 'PR12-CMD-010',
    parity: true,
    projectRef: request.projectRef,
    bindingSha256: request.bindingSha256,
    gitCommit: request.gitCommit,
    databaseSystemIdentifier: request.databaseSystemIdentifier,
    generatedByteLength: Buffer.byteLength(generated, 'utf8'),
    generatedSha256: sha256(generated),
    committedByteLength: Buffer.byteLength(committed, 'utf8'),
    committedSha256: sha256(committed),
    normalizedSha256: diagnostic.normalizedGeneratedSha256,
    committedFileMutated: false,
  };
}

export function buildHostedTypesCommand(input) {
  const request = requireExactKeys(
    input,
    ['supabasePath', 'projectRef', 'externalWorkdir', 'repositoryRoot'],
    'HOSTED_TYPES_COMMAND_INVALID'
  );
  if (
    !isAbsoluteWindowsOrNative(request.supabasePath) ||
    path.win32.basename(request.supabasePath).toLowerCase() !==
      'supabase.exe' ||
    !isAbsoluteWindowsOrNative(request.externalWorkdir) ||
    !isAbsoluteWindowsOrNative(request.repositoryRoot)
  ) {
    fail('HOSTED_TYPES_COMMAND_INVALID');
  }
  if (isInsideRepository(request.repositoryRoot, request.externalWorkdir)) {
    fail('EXTERNAL_WORKDIR_REQUIRED');
  }
  if (
    !PROJECT_REF_PATTERN.test(request.projectRef) ||
    request.projectRef === PRODUCTION_PROJECT_REF
  ) {
    fail(
      request.projectRef === PRODUCTION_PROJECT_REF
        ? 'PRODUCTION_CONTACT_DENIED'
        : 'PROJECT_REF_INVALID'
    );
  }
  return {
    commandId: 'PR12-CMD-010',
    status: 'IMPLEMENTED_OFFLINE_VERIFIED',
    authorizedNow: false,
    executionStatus: 'NOT_RUN',
    executable: request.supabasePath,
    args: [
      'gen',
      'types',
      '--lang',
      'typescript',
      '--project-id',
      request.projectRef,
      '--schema',
      'public',
    ],
    cwd: request.externalWorkdir,
    credentialKind: 'management-types',
    outputMode: 'CAPTURE_STDOUT_TO_EXTERNAL_EVIDENCE',
    committedTypesWriteAllowed: false,
    inheritParentEnvironment: false,
    credentialEnvironmentKeys: ['SUPABASE_ACCESS_TOKEN'],
    databaseCredentialAllowed: false,
    shell: false,
    stdin: 'ignore',
    maximumDispatchCount: 1,
    wrapperRetryCount: 0,
    timeoutOrAmbiguousOutcome: 'UNKNOWN_REMOTE_OUTCOME',
  };
}

export function computeHostedTypesRuntimeBindingSha256(runtimeBinding) {
  return sha256(serializeCanonicalEvidence(runtimeBinding));
}

function assertHostedTypesCommandApproval(request) {
  const verifiedRuntime = assertStageRuntimeBinding(
    request.runtimeBinding,
    request.runtimeContext
  );
  const approval = requireExactKeys(
    request.commandApproval,
    [
      'schemaVersion',
      'status',
      'commandId',
      'authorized',
      'gitCommit',
      'projectRef',
      'databaseSystemIdentifier',
      'bindingSha256',
      'runtimeBindingSha256',
      'prerequisiteStatus',
      'sourceReplayEvidenceSha256',
      'approvedAt',
      'expiresAt',
    ],
    'CMD010_APPROVAL_INVALID'
  );
  if (
    approval.schemaVersion !== 1 ||
    approval.status !== 'APPROVED_NOT_EXECUTED' ||
    approval.commandId !== 'PR12-CMD-010' ||
    approval.authorized !== true ||
    approval.prerequisiteStatus !== 'SOURCE_REPLAY_PARITY_PASS' ||
    !SHA256_PATTERN.test(approval.sourceReplayEvidenceSha256)
  ) {
    fail('CMD010_APPROVAL_REQUIRED');
  }
  const approvedAt = Date.parse(
    requireString(approval.approvedAt, 'CMD010_APPROVAL_INVALID')
  );
  const expiresAt = Date.parse(
    requireString(approval.expiresAt, 'CMD010_APPROVAL_INVALID')
  );
  const now = Date.parse(
    requireString(request.runtimeContext.now, 'CMD010_APPROVAL_INVALID')
  );
  if (
    !Number.isFinite(approvedAt) ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(now) ||
    approvedAt > now ||
    approvedAt >= expiresAt
  ) {
    fail('CMD010_APPROVAL_INVALID');
  }
  if (now >= expiresAt) fail('CMD010_APPROVAL_EXPIRED');
  if (expiresAt > Date.parse(verifiedRuntime.expiresAt)) {
    fail('CMD010_APPROVAL_OUTLIVES_RUNTIME_BINDING');
  }
  const runtimeBindingSha256 = computeHostedTypesRuntimeBindingSha256(
    request.runtimeBinding
  );
  if (
    approval.gitCommit !== verifiedRuntime.gitCommit ||
    approval.gitCommit !== request.gitCommit ||
    approval.projectRef !== verifiedRuntime.projectRef ||
    approval.projectRef !== request.projectRef ||
    approval.databaseSystemIdentifier !==
      verifiedRuntime.databaseSystemIdentifier ||
    approval.databaseSystemIdentifier !== request.databaseSystemIdentifier ||
    approval.bindingSha256 !== request.bindingSha256 ||
    approval.runtimeBindingSha256 !== runtimeBindingSha256
  ) {
    fail('CMD010_APPROVAL_BINDING_MISMATCH');
  }
  return verifiedRuntime;
}

export function dispatchHostedTypesCommandOnce(input, dispatcher) {
  const request = requireExactKeys(
    input,
    [
      'supabasePath',
      'projectRef',
      'externalWorkdir',
      'repositoryRoot',
      'accessToken',
      'operatingSystemValues',
      'isolationPaths',
      'timeoutMs',
      'committedTypes',
      'bindingSha256',
      'gitCommit',
      'databaseSystemIdentifier',
      'runtimeBinding',
      'runtimeContext',
      'commandApproval',
    ],
    'HOSTED_TYPES_DISPATCH_INVALID'
  );
  const command = buildHostedTypesCommand({
    supabasePath: request.supabasePath,
    projectRef: request.projectRef,
    externalWorkdir: request.externalWorkdir,
    repositoryRoot: request.repositoryRoot,
  });
  assertHostedTypesCommandApproval(request);
  const environment = buildIsolatedChildEnvironment({
    credentialKind: 'management-types',
    credentialValues: {
      SUPABASE_ACCESS_TOKEN: requireString(
        request.accessToken,
        'CREDENTIAL_ENVIRONMENT_INVALID'
      ),
    },
    operatingSystemValues: request.operatingSystemValues,
    isolationPaths: request.isolationPaths,
  });
  const plan = buildPinnedSpawnContract({
    executable: command.executable,
    args: command.args,
    cwd: command.cwd,
    env: environment,
    timeoutMs: request.timeoutMs,
    retries: 0,
  });
  let generatedTypesStdout = '';
  const processObservation = dispatchPinnedCommandOnce(plan, spawnPlan => {
    const observation = dispatcher(spawnPlan);
    if (isRecord(observation) && typeof observation.stdout === 'string') {
      generatedTypesStdout = observation.stdout;
    }
    return observation;
  });
  const result = {
    commandId: command.commandId,
    ...processObservation,
  };
  if (processObservation.outcome !== 'SUCCEEDED') {
    return { ...result, comparisonStatus: 'NOT_EVALUATED' };
  }
  const comparison = compareHostedTypes({
    generatedTypes: extractGeneratedTypes(generatedTypesStdout),
    committedTypes: request.committedTypes,
    projectRef: request.projectRef,
    bindingSha256: request.bindingSha256,
    gitCommit: request.gitCommit,
    databaseSystemIdentifier: request.databaseSystemIdentifier,
  });
  return { ...result, comparison };
}
