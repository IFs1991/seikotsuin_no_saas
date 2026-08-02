import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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
const POSTGREST_VERSION_PATTERN =
  /(PostgrestVersion:\s*)['"][^'"\r\n]+['"](;?)/g;
const PINNED_PRETTIER_VERSION = '3.8.0';
const PINNED_PRETTIER_CLI_SHA256 =
  'ac5523cd57e7e9d8eac71caef7e022a8a8489bcdc19ca8a778b7e728ec103b93';
const PINNED_PRETTIER_CONFIG_SHA256 =
  'c934965d90061f1feba139aa348e7682cd176c205e9c01309cd5bdba912cd511';
const PINNED_PRETTIER_PACKAGE_TREE_SHA256 =
  '1752308f326a0886e10a988d3485e57f5ab93319252faad9fa0e855647dfb69b';
const PINNED_PRETTIER_PACKAGE_FILE_COUNT = 56;
const PINNED_PRETTIER_PACKAGE_TOTAL_BYTES = 8_579_866;

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

function normalizedPathIdentity(value) {
  const resolved = path.resolve(value).replaceAll('/', path.sep);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function assertNoReparseComponents(value, code) {
  let current = path.resolve(value);
  while (true) {
    if (!existsSync(current) || lstatSync(current).isSymbolicLink()) fail(code);
    const actual = realpathSync.native(current);
    if (normalizedPathIdentity(actual) !== normalizedPathIdentity(current)) {
      fail(code);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function readStableFile(value, code) {
  let descriptor;
  try {
    assertNoReparseComponents(value, code);
    descriptor = openSync(value, 'r');
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size > 64n * 1024n * 1024n) fail(code);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      BigInt(bytes.length) !== after.size
    ) {
      bytes.fill(0);
      fail(code);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeCreateNew(value, bytes, code) {
  let descriptor;
  try {
    descriptor = openSync(value, 'wx');
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch {
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function collectPackageTreeManifest(packageRoot, code) {
  assertNoReparseComponents(packageRoot, code);
  const manifest = [];
  const walk = (directory, prefix) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relativePath = prefix.length > 0 ? `${prefix}/${name}` : name;
      assertNoReparseComponents(absolute, code);
      const status = lstatSync(absolute);
      if (status.isDirectory()) {
        walk(absolute, relativePath);
      } else if (status.isFile()) {
        const bytes = readStableFile(absolute, code);
        try {
          manifest.push({
            relativePath,
            byteLength: bytes.length,
            sha256: sha256(bytes),
          });
        } finally {
          bytes.fill(0);
        }
      } else {
        fail(code);
      }
    }
  };
  walk(packageRoot, '');
  const totalBytes = manifest.reduce(
    (total, entry) => total + entry.byteLength,
    0
  );
  return {
    fileCount: manifest.length,
    totalBytes,
    treeSha256: sha256(JSON.stringify(manifest)),
  };
}

function assertPinnedPackageTree(observation, code) {
  if (
    observation.fileCount !== PINNED_PRETTIER_PACKAGE_FILE_COUNT ||
    observation.totalBytes !== PINNED_PRETTIER_PACKAGE_TOTAL_BYTES ||
    observation.treeSha256 !== PINNED_PRETTIER_PACKAGE_TREE_SHA256
  ) {
    fail(code);
  }
}

function copyPackageTreeCreateNew(sourceRoot, destinationRoot, code) {
  if (existsSync(destinationRoot)) fail(code);
  mkdirSync(destinationRoot, { recursive: false });
  const walk = (source, destination) => {
    for (const name of readdirSync(source).sort()) {
      const sourcePath = path.join(source, name);
      const destinationPath = path.join(destination, name);
      assertNoReparseComponents(sourcePath, code);
      const status = lstatSync(sourcePath);
      if (status.isDirectory()) {
        mkdirSync(destinationPath, { recursive: false });
        walk(sourcePath, destinationPath);
      } else if (status.isFile()) {
        const bytes = readStableFile(sourcePath, code);
        try {
          writeCreateNew(destinationPath, bytes, code);
        } finally {
          bytes.fill(0);
        }
      } else {
        fail(code);
      }
    }
  };
  walk(sourceRoot, destinationRoot);
}

function resolveRegularFile(value, code) {
  if (
    !isAbsoluteWindowsOrNative(value) ||
    !existsSync(value) ||
    lstatSync(value).isSymbolicLink() ||
    !statSync(value).isFile()
  ) {
    fail(code);
  }
  const resolved = path.resolve(value);
  assertNoReparseComponents(resolved, code);
  return resolved;
}

function resolveEmptyDirectory(value, code) {
  if (
    !isAbsoluteWindowsOrNative(value) ||
    !existsSync(value) ||
    lstatSync(value).isSymbolicLink() ||
    !statSync(value).isDirectory() ||
    readdirSync(value).length !== 0
  ) {
    fail(code);
  }
  const resolved = path.resolve(value);
  assertNoReparseComponents(resolved, code);
  return resolved;
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
    "$1'__PR12_POSTGREST_VERSION__'$2"
  );
}

export function formatGeneratedTypesWithPinnedPrettier(input) {
  const request = requireExactKeys(
    input,
    ['repositoryRoot', 'generatedTypesPath', 'formatterRuntimeRoot'],
    'GENERATED_TYPES_FORMATTER_INVALID'
  );
  const repositoryRoot = requireString(
    request.repositoryRoot,
    'GENERATED_TYPES_FORMATTER_INVALID'
  );
  const generatedTypesPath = resolveRegularFile(
    requireString(
      request.generatedTypesPath,
      'GENERATED_TYPES_FORMATTER_INVALID'
    ),
    'GENERATED_TYPES_FORMATTER_INVALID'
  );
  const formatterRuntimeRoot = resolveEmptyDirectory(
    requireString(
      request.formatterRuntimeRoot,
      'GENERATED_TYPES_FORMATTER_INVALID'
    ),
    'GENERATED_TYPES_FORMATTER_INVALID'
  );
  if (
    !isAbsoluteWindowsOrNative(repositoryRoot) ||
    isInsideRepository(repositoryRoot, generatedTypesPath) ||
    isInsideRepository(repositoryRoot, formatterRuntimeRoot)
  ) {
    fail('EXTERNAL_WORKDIR_REQUIRED');
  }

  const sourcePrettierRoot = path.join(
    repositoryRoot,
    'node_modules',
    'prettier'
  );
  const sourceTreeObservation = collectPackageTreeManifest(
    sourcePrettierRoot,
    'PINNED_PRETTIER_INVALID'
  );
  assertPinnedPackageTree(sourceTreeObservation, 'PINNED_PRETTIER_INVALID');
  const sourcePrettierConfigPath = resolveRegularFile(
    path.join(repositoryRoot, '.prettierrc'),
    'PINNED_PRETTIER_INVALID'
  );
  const prettierConfigBytes = readStableFile(
    sourcePrettierConfigPath,
    'PINNED_PRETTIER_INVALID'
  );
  const prettierConfigSha256 = sha256(prettierConfigBytes);
  if (prettierConfigSha256 !== PINNED_PRETTIER_CONFIG_SHA256) {
    prettierConfigBytes.fill(0);
    fail('PINNED_PRETTIER_INVALID');
  }

  const isolatedPrettierRoot = path.join(formatterRuntimeRoot, 'prettier');
  copyPackageTreeCreateNew(
    sourcePrettierRoot,
    isolatedPrettierRoot,
    'PINNED_PRETTIER_COPY_FAILED'
  );
  const isolatedPrettierConfigPath = path.join(
    formatterRuntimeRoot,
    '.prettierrc'
  );
  try {
    writeCreateNew(
      isolatedPrettierConfigPath,
      prettierConfigBytes,
      'PINNED_PRETTIER_COPY_FAILED'
    );
  } finally {
    prettierConfigBytes.fill(0);
  }
  const isolatedTreeBefore = collectPackageTreeManifest(
    isolatedPrettierRoot,
    'PINNED_PRETTIER_COPY_INVALID'
  );
  assertPinnedPackageTree(isolatedTreeBefore, 'PINNED_PRETTIER_COPY_INVALID');
  const prettierCliPath = resolveRegularFile(
    path.join(isolatedPrettierRoot, 'bin', 'prettier.cjs'),
    'PINNED_PRETTIER_COPY_INVALID'
  );
  const prettierPackagePath = resolveRegularFile(
    path.join(isolatedPrettierRoot, 'package.json'),
    'PINNED_PRETTIER_COPY_INVALID'
  );
  const prettierCliBytes = readStableFile(
    prettierCliPath,
    'PINNED_PRETTIER_COPY_INVALID'
  );
  const prettierCliSha256 = sha256(prettierCliBytes);
  prettierCliBytes.fill(0);
  let prettierPackage;
  try {
    const packageBytes = readStableFile(
      prettierPackagePath,
      'PINNED_PRETTIER_COPY_INVALID'
    );
    try {
      prettierPackage = JSON.parse(packageBytes.toString('utf8'));
    } finally {
      packageBytes.fill(0);
    }
  } catch {
    fail('PINNED_PRETTIER_COPY_INVALID');
  }
  if (
    prettierCliSha256 !== PINNED_PRETTIER_CLI_SHA256 ||
    !isRecord(prettierPackage) ||
    prettierPackage.version !== PINNED_PRETTIER_VERSION
  ) {
    fail('PINNED_PRETTIER_COPY_INVALID');
  }

  const operatingSystemEnvironment = Object.fromEntries(
    [
      ['SystemRoot', process.env.SystemRoot],
      ['TEMP', process.env.TEMP],
      ['TMP', process.env.TMP],
    ].filter(([, value]) => typeof value === 'string' && value.length > 0)
  );
  const child = spawnSync(
    process.execPath,
    [
      prettierCliPath,
      generatedTypesPath,
      '--parser',
      'typescript',
      '--config',
      isolatedPrettierConfigPath,
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: operatingSystemEnvironment,
      maxBuffer: 64 * 1024 * 1024,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      windowsHide: true,
    }
  );
  if (
    child.error !== undefined ||
    child.signal !== null ||
    !Number.isInteger(child.status)
  ) {
    fail('GENERATED_TYPES_FORMATTER_UNKNOWN_OUTCOME');
  }
  if (child.status !== 0 || child.stderr !== '') {
    fail('GENERATED_TYPES_FORMATTER_FAILED');
  }
  const isolatedTreeAfter = collectPackageTreeManifest(
    isolatedPrettierRoot,
    'PINNED_PRETTIER_RUNTIME_DRIFT'
  );
  assertPinnedPackageTree(isolatedTreeAfter, 'PINNED_PRETTIER_RUNTIME_DRIFT');
  const isolatedConfigAfter = readStableFile(
    isolatedPrettierConfigPath,
    'PINNED_PRETTIER_RUNTIME_DRIFT'
  );
  try {
    if (sha256(isolatedConfigAfter) !== PINNED_PRETTIER_CONFIG_SHA256) {
      fail('PINNED_PRETTIER_RUNTIME_DRIFT');
    }
  } finally {
    isolatedConfigAfter.fill(0);
  }
  const formattedTypes = extractGeneratedTypes(child.stdout);
  const sourceTypes = assertTypeText(
    readFileSync(generatedTypesPath, 'utf8'),
    'GENERATED_TYPES_OUTPUT_INVALID'
  );
  return {
    formattedTypes,
    observation: {
      formatter: 'PRETTIER',
      formatterVersion: PINNED_PRETTIER_VERSION,
      prettierCliSha256,
      prettierConfigSha256,
      prettierPackageTreeSha256: isolatedTreeAfter.treeSha256,
      prettierPackageFileCount: isolatedTreeAfter.fileCount,
      prettierPackageTotalBytes: isolatedTreeAfter.totalBytes,
      executionSource: 'OWNER_PRIVATE_CREATE_NEW_COPY',
      sourceAndCopyTreeHashMatch:
        sourceTreeObservation.treeSha256 === isolatedTreeAfter.treeSha256,
      sourceByteLength: Buffer.byteLength(sourceTypes, 'utf8'),
      sourceSha256: sha256(sourceTypes),
      formattedByteLength: Buffer.byteLength(formattedTypes, 'utf8'),
      formattedSha256: sha256(formattedTypes),
      dispatchCount: 1,
      wrapperRetryCount: 0,
      shell: false,
      stdin: 'CLOSED',
      timeoutMs: 30_000,
      credentialEnvironmentKeys: [],
      rawTypesRetainedByFormatter: false,
    },
  };
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
