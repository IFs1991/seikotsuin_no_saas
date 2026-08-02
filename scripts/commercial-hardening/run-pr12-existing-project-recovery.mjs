import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PR12_RECOVERY_TARGET,
  addonResponseToRecoveryComputeProjection,
  assertAllowedRecoveryProviderRequest,
  determineRecoveredStep01Result,
  projectResponseToRecoverySafeProjection,
  sha256Canonical,
} from './pr12-existing-project-recovery-contract.mjs';
import { isForbiddenAmbientCredentialName } from './pr12-source-project-provisioning-contract.mjs';
import {
  retrieveClaimBoundCredentials,
  validateDpapiCredentialResources,
  windowsPathFingerprint,
} from './pr12-windows-dpapi-credential-channel.mjs';
import {
  buildExternalReplayInputManifest,
  buildSourceReplayCommandPlan,
  compileFreshCatalogSnapshotFromSqlObservation,
  materializeExternalReplayInputs,
  readAndVerifyFrozenMigrationInventory,
  validateMigrationHistoryParity,
} from './pr12-source-replay-catalog-contract.mjs';
import {
  buildIsolatedChildEnvironment,
  buildPinnedSpawnContract,
  observeAndAssertPinnedToolchainFiles,
  projectPinnedToolchainObservation,
} from './pr12-stage-command-runtime.mjs';
import { verifyProvisioningEvidenceDirectory } from './verify-pr12-source-project-provisioning-evidence.mjs';
import {
  REPRESENTATIVE_FIXTURE_RELATION_ORDER,
  REPRESENTATIVE_FIXTURE_SNAPSHOT_ROWS,
  compileRepresentativeFixturePlan,
  computeRepresentativeAggregateDataHash,
  createRepresentativeFixturePayloadIdentity,
  fingerprintRepresentativeFixturePayloadIdentity,
  validateRepresentativeFixtureSnapshot,
} from './pr12-representative-fixture-contract.mjs';
import {
  compareHostedTypes,
  extractGeneratedTypes,
} from './pr12-hosted-types-parity.mjs';
import {
  diffAdvisorSnapshots,
  normalizeAdvisorSnapshot,
} from './pr12-advisor-diff.mjs';
import {
  executePr12AllRoleSmokeRuntime,
  preparePr12BrowserRuntime,
  resolveAllRoleSmokeRelation,
  selectProjectRuntimeApiKeys,
} from './pr12-all-role-smoke-runtime.mjs';
import { ALL_ROLE_SMOKE_REST_CASES } from './pr12-all-role-smoke-contract.mjs';

const EXECUTION_CONFIRMATION =
  'RECOVER_EXISTING_PR12_ISOLATED_PROJECT_AND_CONTINUE';
const RECOVERY_ACTION_ID = 'PR12-RECOVER-EXISTING-ISOLATED-PROJECT-001';
const CLAIM_FILE = 'pr12-existing-project-recovery.claim.json';
const STEP01_EVIDENCE_FILE = 'pr12-step-01-recovery-result.json';
const STEP02_EVIDENCE_FILE = 'pr12-step-02-migration-replay-result.json';
const STEP03_EVIDENCE_FILE = 'pr12-step-03-representative-data-result.json';
const STEP04_EVIDENCE_FILE = 'pr12-step-04-types-parity-result.json';
const STEP05_EVIDENCE_FILE = 'pr12-step-05-advisor-scan-result.json';
const STEP06_EVIDENCE_FILE = 'pr12-step-06-all-role-smoke-result.json';
const TERMINAL_FILE = 'pr12-existing-project-recovery-terminal.json';
const RUNTIME_CREDENTIAL_CONFIG_FILE =
  'pr12-existing-project-recovery-credential-configuration-v2.json';
const CA_FILE = 'prod-ca-2021.crt';
const CA_URL =
  'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt';
const PINNED_CA_SHA256 =
  '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
const EXPECTED_ACTION003_MANIFEST_SHA256 =
  '93d75748f2c68cf9e5bb618a04550ecc998593c2d1233a95ae8c871d8596e955';
const MAX_PROVIDER_BODY_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const CREDENTIAL_LEASE_MS = 12 * 60 * 60 * 1000;

class RecoveryExecutionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RecoveryExecutionError';
    this.code = code;
  }
}

let recoveryFailureContext = null;

function fail(code) {
  throw new RecoveryExecutionError(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('CANONICAL_VALUE_INVALID');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) fail('CANONICAL_VALUE_INVALID');
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArguments(argv) {
  const allowed = new Set([
    '--execute-owner-decision',
    '--credential-config',
    '--action003-journal',
    '--action003-evidence-directory',
    '--supabase',
    '--psql',
  ]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(flag) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      value.startsWith('--') ||
      Object.hasOwn(result, flag)
    ) {
      fail('ARGUMENTS_INVALID');
    }
    result[flag] = value;
  }
  if (
    Object.keys(result).length !== allowed.size ||
    result['--execute-owner-decision'] !== EXECUTION_CONFIRMATION
  ) {
    fail('OWNER_DECISION_CONFIRMATION_INVALID');
  }
  return result;
}

function resolveExistingFile(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail(code);
  const resolved = path.resolve(value);
  if (
    !existsSync(resolved) ||
    lstatSync(resolved).isSymbolicLink() ||
    !statSync(resolved).isFile()
  ) {
    fail(code);
  }
  return resolved;
}

function resolveExistingDirectory(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail(code);
  const resolved = path.resolve(value);
  if (
    !existsSync(resolved) ||
    lstatSync(resolved).isSymbolicLink() ||
    !statSync(resolved).isDirectory()
  ) {
    fail(code);
  }
  return resolved;
}

function readStableBytes(filename, maximumBytes, code) {
  let descriptor;
  try {
    if (lstatSync(filename).isSymbolicLink()) fail(code);
    descriptor = openSync(filename, 'r');
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size > BigInt(maximumBytes)) fail(code);
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

function readCanonicalJson(filename, code) {
  const bytes = readStableBytes(filename, 1024 * 1024, code);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(text);
    if (`${canonicalJson(value)}\n` !== text) fail(code);
    return { value, sha256: sha256Bytes(bytes) };
  } catch (error) {
    if (error instanceof RecoveryExecutionError) throw error;
    fail(code);
  } finally {
    bytes.fill(0);
  }
}

function writeCanonicalCreateNew(filename, value, code) {
  let descriptor;
  try {
    descriptor = openSync(filename, 'wx');
    writeFileSync(descriptor, `${canonicalJson(value)}\n`, {
      encoding: 'utf8',
    });
    fsyncSync(descriptor);
  } catch {
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return sha256Bytes(readFileSync(filename));
}

function captureCleanGitHead(repositoryRoot) {
  const runGit = args =>
    spawnSync('git.exe', args, {
      cwd: repositoryRoot,
      env: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        PATH: process.env.PATH ?? '',
      },
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      windowsHide: true,
    });
  const head = runGit(['rev-parse', 'HEAD']);
  const status = runGit(['status', '--porcelain=v1', '--untracked-files=all']);
  if (
    head.status !== 0 ||
    status.status !== 0 ||
    !/^[a-f0-9]{40}\r?\n$/u.test(head.stdout) ||
    status.stdout !== ''
  ) {
    fail('GIT_STATE_NOT_CLEAN');
  }
  return head.stdout.trim();
}

function assertExternalSiblingPaths(
  repositoryRoot,
  action003Journal,
  action003Evidence
) {
  const actionBase = path.dirname(action003Journal);
  if (
    path.basename(action003Journal) !== 'action-003-journal' ||
    path.dirname(path.dirname(action003Evidence)) !== actionBase ||
    path.basename(path.dirname(action003Evidence)) !==
      'action-003-evidence-parent'
  ) {
    fail('ACTION003_PATH_LINKAGE_INVALID');
  }
  const relative = path.relative(repositoryRoot, actionBase);
  if (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..')
  ) {
    fail('EXTERNAL_RECOVERY_BOUNDARY_INVALID');
  }
  return {
    actionBase,
    recoveryJournal: path.join(
      actionBase,
      'pr12-existing-project-recovery-journal'
    ),
    recoveryEvidence: path.join(
      actionBase,
      'pr12-existing-project-recovery-evidence'
    ),
    replayWorkdir: path.join(
      actionBase,
      'pr12-existing-project-recovery-replay-workdir'
    ),
  };
}

function createOwnerPrivateDirectory(repositoryRoot, directory) {
  if (existsSync(directory)) fail('RECOVERY_OUTPUT_ALREADY_EXISTS');
  mkdirSync(directory, { recursive: false });
  return hardenPath(repositoryRoot, directory, 'DIRECTORY');
}

function createRuntimeCredentialConfiguration(
  repositoryRoot,
  sourceSnapshot,
  recoveryJournal
) {
  const value = structuredClone(sourceSnapshot.value);
  if (!isRecord(value.runtime)) fail('CREDENTIAL_CONFIG_INVALID');
  const brokerPath = path.join(
    repositoryRoot,
    'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1'
  );
  value.runtime.brokerScriptSha256 = sha256Bytes(readFileSync(brokerPath));
  const outputPath = path.join(recoveryJournal, RUNTIME_CREDENTIAL_CONFIG_FILE);
  const sha256 = writeCanonicalCreateNew(
    outputPath,
    value,
    'RUNTIME_CREDENTIAL_CONFIG_CREATE_FAILED'
  );
  hardenPath(repositoryRoot, outputPath, 'FILE');
  return { value, sha256, outputPath, sourceSha256: sourceSnapshot.sha256 };
}

function createRecoveryClaim({
  repositoryRoot,
  journalDirectory,
  gitHead,
  action003Evidence,
  action003Verification,
  credentialConfigurationSha256,
}) {
  const ownerDecision = {
    schemaVersion: 1,
    actionId: RECOVERY_ACTION_ID,
    target: {
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      organizationId: PR12_RECOVERY_TARGET.organizationId,
      region: PR12_RECOVERY_TARGET.region,
    },
    scope: [
      'READ_ONLY_PROVIDER_PROJECT_STATE',
      'RUNTIME_ONLY_CREDENTIAL_RETRIEVAL',
      'ISOLATED_DATABASE_IDENTITY',
      'FULL_MIGRATION_REPLAY',
      'REPRESENTATIVE_DATA_VALIDATION',
      'GENERATED_TYPES_PARITY',
      'ADVISOR_SCAN',
      'ALL_ROLE_SMOKE',
    ],
    restrictions: {
      newProjectPostAllowed: false,
      productionContactAllowed: false,
      projectDeletionAllowed: false,
      externalSideEffectsAllowed: false,
    },
    gitHead,
    action003ManifestSha256: action003Verification.manifestSha256,
    action003EvidencePathSha256: windowsPathFingerprint(action003Evidence),
    credentialConfigurationSha256,
  };
  const bindingMaterialSha256 = sha256Canonical(ownerDecision);
  const payloadSha256 = sha256Canonical({
    ownerDecision,
    ownerInstruction:
      'OWNER_DECISION_RECOVER_EXISTING_PR12_ISOLATED_PROJECT_AND_CONTINUE',
  });
  const derivedExecutionBindingSha256 = sha256Canonical({
    actionId: RECOVERY_ACTION_ID,
    bindingMaterialSha256,
    payloadSha256,
    journalDirectoryPathSha256: windowsPathFingerprint(journalDirectory),
  });
  const claim = {
    actionId: RECOVERY_ACTION_ID,
    bindingMaterialSha256,
    claimedAt: new Date().toISOString(),
    derivedExecutionBindingSha256,
    payloadSha256,
    state: 'CLAIMED_CONTINUATION_NOT_STARTED',
  };
  const claimPath = path.join(journalDirectory, CLAIM_FILE);
  const sha256 = writeCanonicalCreateNew(
    claimPath,
    claim,
    'RECOVERY_CLAIM_CREATE_FAILED'
  );
  hardenPath(repositoryRoot, claimPath, 'FILE');
  return { claim, sha256, ownerDecision };
}

function assertNoAmbientCredentials() {
  const forbidden = Object.keys(process.env)
    .filter(isForbiddenAmbientCredentialName)
    .sort();
  if (forbidden.length > 0) fail('AMBIENT_CREDENTIAL_ENVIRONMENT_FORBIDDEN');
}

function hardenPath(repositoryRoot, targetPath, kind) {
  const helper = path.join(
    repositoryRoot,
    'scripts/commercial-hardening/pr12-windows-owner-private-acl.ps1'
  );
  const powershell = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  const result = spawnSync(
    powershell,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-File',
      helper,
      '-Mode',
      'PROTECT_AND_CAPTURE',
      '-Kind',
      kind,
      '-LiteralPath',
      targetPath,
    ],
    {
      cwd: repositoryRoot,
      env: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
        TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
        PATH: path.dirname(powershell),
      },
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      windowsHide: true,
    }
  );
  if (result.status !== 0 || result.error !== undefined) {
    fail('OWNER_PRIVATE_ACL_FAILED');
  }
  try {
    const observation = JSON.parse(result.stdout);
    if (
      observation.accessRulesProtected !== true ||
      observation.accessRuleCount !== 2
    ) {
      fail('OWNER_PRIVATE_ACL_FAILED');
    }
    return {
      policy: observation.aclPolicyId,
      accessRulesProtected: true,
      accessRuleCount: 2,
    };
  } catch (error) {
    if (error instanceof RecoveryExecutionError) throw error;
    fail('OWNER_PRIVATE_ACL_FAILED');
  }
}

async function readBoundedResponse(response, expectedContentTypes) {
  const contentType = response.headers.get('content-type') ?? '';
  if (
    !expectedContentTypes.some(prefix =>
      contentType.toLowerCase().startsWith(prefix)
    )
  ) {
    fail('REMOTE_CONTENT_TYPE_INVALID');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_PROVIDER_BODY_BYTES) {
    fail('REMOTE_BODY_TOO_LARGE');
  }
  if (response.body === null) fail('REMOTE_BODY_MISSING');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > MAX_PROVIDER_BODY_BYTES) fail('REMOTE_BODY_TOO_LARGE');
      chunks.push(item.value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function fetchProviderJson(url, accessToken) {
  assertAllowedRecoveryProviderRequest('GET', url);
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    fail('READ_ONLY_PROVIDER_CONTACT_FAILED');
  }
  const bytes = await readBoundedResponse(response, ['application/json']);
  try {
    const bodySha256 = sha256Bytes(bytes);
    if (response.status !== 200) fail(`PROVIDER_HTTP_${response.status}`);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return {
      body: JSON.parse(text),
      bodySha256,
      httpStatus: response.status,
    };
  } catch (error) {
    if (error instanceof RecoveryExecutionError) throw error;
    fail('PROVIDER_RESPONSE_INVALID');
  } finally {
    bytes.fill(0);
  }
}

async function captureCaBundle(caPath) {
  let response;
  try {
    response = await fetch(CA_URL, {
      method: 'GET',
      headers: { Accept: 'application/x-pem-file,text/plain' },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    fail('CA_BUNDLE_CONTACT_FAILED');
  }
  const bytes = await readBoundedResponse(response, [
    'application/',
    'text/plain',
  ]);
  try {
    if (response.status !== 200) fail(`CA_BUNDLE_HTTP_${response.status}`);
    const sha256 = sha256Bytes(bytes);
    if (sha256 !== PINNED_CA_SHA256) fail('CA_BUNDLE_HASH_MISMATCH');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (
      !text.startsWith('-----BEGIN CERTIFICATE-----\n') ||
      !text.trimEnd().endsWith('-----END CERTIFICATE-----') ||
      text.includes('\0')
    ) {
      fail('CA_BUNDLE_INVALID');
    }
    writeFileSync(caPath, bytes, { flag: 'wx' });
    return {
      source: CA_URL,
      sha256,
      bytes: bytes.length,
      capturedAt: new Date().toISOString(),
      rawPathRetained: false,
    };
  } finally {
    bytes.fill(0);
  }
}

function captureDatabaseIdentity({ psqlPath, caPath, databasePassword }) {
  const sql = [
    'select json_build_object(',
    "'databaseName', current_database(),",
    "'databaseUser', current_user,",
    "'postgresVersion', current_setting('server_version'),",
    "'serverVersionNum', current_setting('server_version_num'),",
    "'systemIdentifier', (select system_identifier::text from pg_control_system()),",
    "'databaseUtc', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),",
    "'ssl', (select ssl from pg_stat_ssl where pid = pg_backend_pid()),",
    "'sslVersion', (select version from pg_stat_ssl where pid = pg_backend_pid())",
    ')::text;',
  ].join(' ');
  const result = spawnSync(
    psqlPath,
    [
      '--no-psqlrc',
      '--no-password',
      '--host',
      PR12_RECOVERY_TARGET.directHost,
      '--port',
      '5432',
      '--username',
      'postgres',
      '--dbname',
      'postgres',
      '--set',
      'ON_ERROR_STOP=1',
      '--tuples-only',
      '--no-align',
      '--command',
      sql,
    ],
    {
      cwd: path.dirname(caPath),
      env: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
        TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
        PATH: path.dirname(psqlPath),
        PGPASSWORD: databasePassword,
        PGSSLMODE: 'verify-full',
        PGSSLROOTCERT: caPath,
        PGCONNECT_TIMEOUT: '30',
        PGAPPNAME: 'pr12-isolated-qualification-step01',
        PGOPTIONS:
          '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000',
      },
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }
  );
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  try {
    if (
      result.status !== 0 ||
      result.error !== undefined ||
      result.signal !== null
    ) {
      fail('DIRECT_DATABASE_UNREACHABLE');
    }
    const line = stdout
      .split(/\r?\n/u)
      .map(value => value.trim())
      .filter(Boolean)
      .at(-1);
    const observation = JSON.parse(line ?? 'null');
    if (
      !isRecord(observation) ||
      observation.databaseName !== 'postgres' ||
      observation.databaseUser !== 'postgres' ||
      observation.ssl !== true ||
      typeof observation.systemIdentifier !== 'string' ||
      !/^(?:0|[1-9][0-9]{0,19})$/u.test(observation.systemIdentifier)
    ) {
      fail('DIRECT_DATABASE_IDENTITY_INVALID');
    }
    return {
      status: 'REACHABLE',
      connectionMode: 'DIRECT',
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      databaseName: observation.databaseName,
      databaseUser: observation.databaseUser,
      postgresVersion: observation.postgresVersion,
      serverVersionNum: observation.serverVersionNum,
      systemIdentifier: observation.systemIdentifier,
      databaseUtc: observation.databaseUtc,
      tls: {
        verifiedMode: 'verify-full',
        enabled: true,
        version: observation.sslVersion,
      },
      stdoutSha256: sha256Bytes(Buffer.from(stdout, 'utf8')),
      stderrSha256: sha256Bytes(Buffer.from(stderr, 'utf8')),
      rawOutputRetained: false,
    };
  } catch (error) {
    if (error instanceof RecoveryExecutionError) throw error;
    fail('DIRECT_DATABASE_IDENTITY_INVALID');
  }
}

function lastJsonLine(stdout, code) {
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const value = JSON.parse(trimmed);
      if (isRecord(value)) return value;
    } catch {
      // Continue to the preceding line; CLI tools may print non-JSON progress.
    }
  }
  fail(code);
}

function runReplayCommand(
  command,
  environment,
  forbiddenValues,
  journalDirectory,
  repositoryRoot
) {
  const spawnContract = buildPinnedSpawnContract({
    executable: command.executable,
    args: command.args,
    cwd: command.cwd,
    env: environment,
    timeoutMs: command.timeoutMs,
    retries: 0,
  });
  const startedAt = new Date().toISOString();
  const intent = {
    schemaVersion: 1,
    recordType: 'PR12_REPLAY_COMMAND_INTENT',
    commandId: command.id,
    operation: command.operation,
    mutation: command.mutation === true,
    targetProjectRef: PR12_RECOVERY_TARGET.projectRef,
    targetDirectHost: PR12_RECOVERY_TARGET.directHost,
    transport: command.transport,
    argvSha256: sha256Canonical(command.args),
    dispatchMaximum: 1,
    wrapperRetryCount: 0,
    timeoutMs: command.timeoutMs,
    createdAt: startedAt,
    rawArgumentsRetained: false,
    secretValuesCaptured: false,
  };
  const journalStem = command.id.toLowerCase();
  const intentPath = path.join(journalDirectory, `${journalStem}-intent.json`);
  const intentArtifactSha256 = writeCanonicalCreateNew(
    intentPath,
    { ...intent, intentSha256: sha256Canonical(intent) },
    'REPLAY_INTENT_CREATE_FAILED'
  );
  hardenPath(repositoryRoot, intentPath, 'FILE');
  const result = spawnSync(
    spawnContract.executable,
    spawnContract.args,
    spawnContract.options
  );
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const outputContainsSecret = forbiddenValues.some(
    secret =>
      secret.length > 0 && (stdout.includes(secret) || stderr.includes(secret))
  );
  const observation = {
    commandId: command.id,
    operation: command.operation,
    startedAt,
    completedAt: new Date().toISOString(),
    dispatchCount: 1,
    wrapperRetryCount: 0,
    exitCode: Number.isInteger(result.status) ? result.status : null,
    timedOut:
      result.error !== undefined &&
      isRecord(result.error) &&
      result.error.code === 'ETIMEDOUT',
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stdoutSha256: sha256Bytes(Buffer.from(stdout, 'utf8')),
    stderrBytes: Buffer.byteLength(stderr, 'utf8'),
    stderrSha256: sha256Bytes(Buffer.from(stderr, 'utf8')),
    rawOutputRetained: false,
    outcome:
      result.error !== undefined ||
      result.signal !== null ||
      !Number.isInteger(result.status)
        ? 'UNKNOWN_REMOTE_OUTCOME'
        : result.status === 0
          ? 'SUCCEEDED'
          : 'FAILED_DETERMINISTIC',
    intentArtifactSha256,
  };
  const resultPath = path.join(journalDirectory, `${journalStem}-result.json`);
  const resultArtifactSha256 = writeCanonicalCreateNew(
    resultPath,
    { ...observation, observationSha256: sha256Canonical(observation) },
    'REPLAY_RESULT_CREATE_FAILED'
  );
  hardenPath(repositoryRoot, resultPath, 'FILE');
  if (outputContainsSecret) fail('SECRET_BEARING_PROCESS_OUTPUT');
  return {
    observation: { ...observation, resultArtifactSha256 },
    stdout,
  };
}

function executeFullMigrationReplay({
  repositoryRoot,
  replayWorkdir,
  evidenceDirectory,
  databasePassword,
  databaseIdentity,
  caPath,
  supabasePath,
  psqlPath,
  journalDirectory,
  bindingSha256,
}) {
  const startedAt = new Date().toISOString();
  const observations = [];
  let inputManifest = null;
  let materialized = null;
  let inventory = null;
  let lastDispatchedCommand = null;
  try {
    inventory = readAndVerifyFrozenMigrationInventory(repositoryRoot);
    inputManifest = buildExternalReplayInputManifest({
      repoRoot: repositoryRoot,
      externalWorkdir: replayWorkdir,
    });
    materialized = materializeExternalReplayInputs(inputManifest);
    observations.push({
      commandId: 'PR12-CMD-003',
      operation: 'MATERIALIZE_APPROVED_SOURCE_RUNTIME_METADATA',
      dispatchCount: 1,
      wrapperRetryCount: 0,
      outcome: 'SUCCEEDED',
      remoteContact: false,
      manifestSha256: inputManifest.manifestSha256,
      rawOutputRetained: false,
    });
    const runtimeRoot = path.join(replayWorkdir, '.pr12-runtime');
    mkdirSync(runtimeRoot, { recursive: false });
    const supabaseHome = path.join(runtimeRoot, 'supabase-home');
    const dockerConfig = path.join(runtimeRoot, 'docker-config');
    mkdirSync(supabaseHome, { recursive: false });
    mkdirSync(dockerConfig, { recursive: false });
    const directUrl = new URL(
      `postgresql://postgres@${PR12_RECOVERY_TARGET.directHost}:5432/postgres`
    );
    directUrl.searchParams.set('sslmode', 'verify-full');
    directUrl.searchParams.set('sslrootcert', caPath);
    const commandPlan = buildSourceReplayCommandPlan({
      directDatabaseUrl: directUrl.toString(),
      supabasePath,
      psqlPath,
      externalWorkdir: replayWorkdir,
    });
    const environment = buildIsolatedChildEnvironment({
      credentialKind: 'database',
      credentialValues: { PGPASSWORD: databasePassword },
      operatingSystemValues: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
        TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
        PATH: `${path.dirname(supabasePath)};${path.dirname(psqlPath)}`,
      },
      isolationPaths: { supabaseHome, dockerConfig },
    });
    let catalogSnapshot = null;
    let migrationHistory = null;
    let advisorBefore = null;
    for (const command of commandPlan.commands.slice(1)) {
      lastDispatchedCommand = command;
      const dispatched = runReplayCommand(
        command,
        environment,
        [databasePassword],
        journalDirectory,
        repositoryRoot
      );
      observations.push(dispatched.observation);
      if (dispatched.observation.outcome !== 'SUCCEEDED') {
        fail(
          dispatched.observation.outcome === 'UNKNOWN_REMOTE_OUTCOME'
            ? 'UNKNOWN_REMOTE_OUTCOME'
            : `${command.id.replaceAll('-', '_')}_FAILED`
        );
      }
      if (command.id === 'PR12-CMD-004') {
        const precondition = lastJsonLine(
          dispatched.stdout,
          'CLEAN_REPLAY_PRECONDITION_INVALID'
        );
        if (
          precondition.operation !== 'SOURCE_CLEAN_REPLAY_PRECONDITION' ||
          precondition.isClean !== true ||
          precondition.appliedMigrationCount !== 0
        ) {
          fail('ISOLATED_PROJECT_NOT_CLEAN');
        }
      } else if (command.id === 'PR12-CMD-006') {
        const parsed = JSON.parse(dispatched.stdout);
        const findings = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.advisors)
            ? parsed.advisors
            : fail('ADVISOR_OUTPUT_INVALID');
        advisorBefore = normalizeAdvisorSnapshot({
          schemaVersion: 1,
          commandId: 'PR12-CMD-006',
          bindingSha256,
          projectRef: PR12_RECOVERY_TARGET.projectRef,
          databaseSystemIdentifier: databaseIdentity.systemIdentifier,
          category: 'all',
          capturedAt: dispatched.observation.completedAt,
          findings,
        });
      } else if (command.id === 'PR12-CMD-007A') {
        const observation = lastJsonLine(
          dispatched.stdout,
          'FRESH_CATALOG_OBSERVATION_INVALID'
        );
        const compiledCatalog = compileFreshCatalogSnapshotFromSqlObservation({
          projectRef: PR12_RECOVERY_TARGET.projectRef,
          databaseSystemIdentifier: databaseIdentity.systemIdentifier,
          capturedAt: dispatched.observation.completedAt,
          observation,
        });
        catalogSnapshot = {
          capturedAt: dispatched.observation.completedAt,
          verification: compiledCatalog.verification,
          snapshotSha256: sha256Canonical(compiledCatalog.snapshot),
          rawRowsPersisted: false,
        };
      } else if (command.id === 'PR12-CMD-008A') {
        const observation = lastJsonLine(
          dispatched.stdout,
          'MIGRATION_HISTORY_OBSERVATION_INVALID'
        );
        if (observation.migrationCount !== observation.versions?.length) {
          fail('MIGRATION_HISTORY_OBSERVATION_INVALID');
        }
        migrationHistory = validateMigrationHistoryParity(
          observation.versions,
          inventory
        );
      }
    }
    if (catalogSnapshot === null || migrationHistory === null) {
      fail('MIGRATION_REPLAY_EVIDENCE_INCOMPLETE');
    }
    const resultWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_FULL_MIGRATION_REPLAY_RESULT',
      canonicalStep: { step: '02', name: 'full migration replay' },
      status: 'PASS',
      startedAt,
      completedAt: new Date().toISOString(),
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      databaseSystemIdentifier: databaseIdentity.systemIdentifier,
      frozenInput: {
        migrationCount: inventory.migrationCount,
        migrationHead: inventory.migrationHead,
        migrationSetSha256: inventory.migrationSetSha256,
        inputManifestSha256: inputManifest.manifestSha256,
        materializedFileCount: materialized.fileCount,
        seedCopied: false,
        testsCopied: false,
        dotenvCopied: false,
        repositoryTempCopied: false,
      },
      commandSequence: commandPlan.commands.map(command => command.id),
      commandObservations: observations,
      advisorBefore,
      catalogSnapshot,
      migrationHistory,
      wrapperRetryCount: 0,
      rawPathsRetained: false,
      rawOutputsRetained: false,
      secretValuesCaptured: false,
      nextStep: '03',
    };
    assertSecretFreeEvidence(resultWithoutHash, [databasePassword]);
    const result = {
      ...resultWithoutHash,
      evidenceSha256: sha256Canonical(resultWithoutHash),
    };
    const filename = path.join(evidenceDirectory, STEP02_EVIDENCE_FILE);
    writeCanonicalCreateNew(filename, result, 'STEP02_EVIDENCE_CREATE_FAILED');
    hardenPath(repositoryRoot, filename, 'FILE');
    return result;
  } catch (error) {
    const reasonCode =
      error instanceof Error && /^[A-Z0-9_-]+$/u.test(error.message)
        ? error.message
        : 'UNEXPECTED_REPLAY_FAILURE';
    let lastDurableResult = null;
    if (lastDispatchedCommand !== null) {
      const resultPath = path.join(
        journalDirectory,
        `${lastDispatchedCommand.id.toLowerCase()}-result.json`
      );
      if (existsSync(resultPath)) {
        try {
          const snapshot = readCanonicalJson(
            resultPath,
            'REPLAY_RESULT_INVALID'
          );
          if (
            snapshot.value.commandId === lastDispatchedCommand.id &&
            ['SUCCEEDED', 'FAILED_DETERMINISTIC'].includes(
              snapshot.value.outcome
            )
          ) {
            lastDurableResult = {
              commandId: snapshot.value.commandId,
              outcome: snapshot.value.outcome,
              resultArtifactSha256: snapshot.sha256,
              intentArtifactSha256: snapshot.value.intentArtifactSha256 ?? null,
            };
          }
        } catch {
          lastDurableResult = null;
        }
      }
    }
    const blockedWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_FULL_MIGRATION_REPLAY_RESULT',
      canonicalStep: { step: '02', name: 'full migration replay' },
      status: 'BLOCK',
      reasonCode,
      startedAt,
      completedAt: new Date().toISOString(),
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      databaseSystemIdentifier: databaseIdentity.systemIdentifier,
      completedCommandIds: observations
        .filter(item => item.outcome === 'SUCCEEDED')
        .map(item => item.commandId),
      commandObservations: observations,
      lastDispatchedCommand:
        lastDispatchedCommand === null
          ? null
          : {
              commandId: lastDispatchedCommand.id,
              mutation: lastDispatchedCommand.mutation === true,
              timeoutMs: lastDispatchedCommand.timeoutMs,
            },
      lastDurableResult,
      mutationOutcomeUnknown:
        lastDispatchedCommand?.mutation === true && lastDurableResult === null,
      wrapperRetryCount: 0,
      rawPathsRetained: false,
      rawOutputsRetained: false,
      secretValuesCaptured: false,
    };
    assertSecretFreeEvidence(blockedWithoutHash, [databasePassword]);
    const blocked = {
      ...blockedWithoutHash,
      evidenceSha256: sha256Canonical(blockedWithoutHash),
    };
    const filename = path.join(evidenceDirectory, STEP02_EVIDENCE_FILE);
    if (!existsSync(filename)) {
      writeCanonicalCreateNew(
        filename,
        blocked,
        'STEP02_BLOCK_EVIDENCE_CREATE_FAILED'
      );
      hardenPath(repositoryRoot, filename, 'FILE');
    }
    throw error;
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function deterministicUuid(prefix, index) {
  const first = prefix.endsWith('-') ? prefix.slice(0, -1) : prefix;
  return `${first}-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function directDatabaseUrl(caPath) {
  const url = new URL(
    `postgresql://postgres@${PR12_RECOVERY_TARGET.directHost}:5432/postgres`
  );
  url.searchParams.set('sslmode', 'verify-full');
  url.searchParams.set('sslrootcert', caPath);
  return url.toString();
}

function executePsqlInput({
  psqlPath,
  databaseUrl,
  databasePassword,
  cwd,
  sql,
  timeoutMs,
  forbiddenValues,
}) {
  const result = spawnSync(
    psqlPath,
    [
      '--no-psqlrc',
      '--no-password',
      '--set',
      'ON_ERROR_STOP=1',
      '--tuples-only',
      '--no-align',
      '--dbname',
      databaseUrl,
    ],
    {
      cwd,
      env: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
        TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
        PATH: path.dirname(psqlPath),
        PGPASSWORD: databasePassword,
      },
      input: sql,
      encoding: 'utf8',
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  if (
    forbiddenValues.some(
      value =>
        value.length > 0 && (stdout.includes(value) || stderr.includes(value))
    )
  ) {
    fail('SECRET_BEARING_PROCESS_OUTPUT');
  }
  const observation = {
    exitCode: Number.isInteger(result.status) ? result.status : null,
    timedOut: isRecord(result.error) && result.error.code === 'ETIMEDOUT',
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stdoutSha256: sha256Bytes(Buffer.from(stdout, 'utf8')),
    stderrBytes: Buffer.byteLength(stderr, 'utf8'),
    stderrSha256: sha256Bytes(Buffer.from(stderr, 'utf8')),
    rawOutputRetained: false,
    dispatchCount: 1,
    wrapperRetryCount: 0,
    outcome:
      result.error !== undefined ||
      result.signal !== null ||
      !Number.isInteger(result.status)
        ? 'UNKNOWN_REMOTE_OUTCOME'
        : result.status === 0
          ? 'SUCCEEDED'
          : 'FAILED_DETERMINISTIC',
  };
  return { stdout, observation };
}

function buildRepresentativeFixtureSql(actorPasswords) {
  const payloadIdentity = createRepresentativeFixturePayloadIdentity();
  const payloadFingerprints =
    fingerprintRepresentativeFixturePayloadIdentity(payloadIdentity);
  const clinicRows = payloadIdentity['public.clinics'];
  const clinicIdByFixtureId = Object.fromEntries(
    clinicRows.map((clinic, index) => [
      clinic.clinicId,
      deterministicUuid('10000000-', index + 1),
    ])
  );
  const clinics = clinicRows.map(
    clinic => clinicIdByFixtureId[clinic.clinicId]
  );
  const actorDefinitions = payloadIdentity['auth.users'].map(
    (actor, index) => ({
      actorId: actor.actorId,
      role: actor.role,
      clinicId:
        actor.clinicId === null ? null : clinicIdByFixtureId[actor.clinicId],
      id: deterministicUuid('20000000-', index + 1),
      email: `pr12+${actor.actorId}@invalid.example`,
      password: actorPasswords[actor.actorId],
    })
  );
  const actorById = Object.fromEntries(
    actorDefinitions.map(actor => [actor.actorId, actor])
  );
  const values = rows => rows.join(',\n');
  const userMetadata = JSON.stringify({});
  const userRows = actorDefinitions.map(actor => {
    const appMetadata = JSON.stringify({
      provider: 'email',
      providers: ['email'],
      role: actor.role,
      clinic_id: actor.clinicId,
    });
    return `(${sqlLiteral(actor.id)},'authenticated','authenticated',${sqlLiteral(actor.email)},extensions.crypt(${sqlLiteral(actor.password)},extensions.gen_salt('bf')),now(),${sqlLiteral(appMetadata)}::jsonb,${sqlLiteral(userMetadata)}::jsonb,now(),now())`;
  });
  const identityRows = actorDefinitions.map(
    actor =>
      `(${sqlLiteral(actor.id)},${sqlLiteral(actor.id)},'email',${sqlLiteral(actor.email)},${sqlLiteral(JSON.stringify({ sub: actor.id, email: actor.email, email_verified: true }))}::jsonb,now(),now(),now())`
  );
  const profileRows = actorDefinitions.map(
    actor =>
      `(${sqlLiteral(actor.id)},${sqlLiteral(actor.id)},${actor.clinicId === null ? 'null' : sqlLiteral(actor.clinicId)},${sqlLiteral(actor.email)},${sqlLiteral(`PR12 ${actor.actorId}`)},${sqlLiteral(actor.role)},true)`
  );
  const staffRows = actorDefinitions.map(
    actor =>
      `(${sqlLiteral(actor.id)},${actor.clinicId === null ? 'null' : sqlLiteral(actor.clinicId)},${sqlLiteral(`PR12 ${actor.actorId}`)},${sqlLiteral(actor.role)},${actor.role === 'therapist' ? 'true' : 'false'},${sqlLiteral(actor.email)},'managed_by_supabase')`
  );
  const permissionRows = actorDefinitions.map(
    actor =>
      `(gen_random_uuid(),${sqlLiteral(actor.id)},${sqlLiteral(actor.email)},'managed_by_supabase',${sqlLiteral(actor.role)},${actor.clinicId === null ? 'null' : sqlLiteral(actor.clinicId)})`
  );
  const customers = payloadIdentity['public.customers'].map((item, index) => ({
    id: deterministicUuid('30000000-', index + 1),
    clinic: clinicIdByFixtureId[item.clinicId],
  }));
  const patients = payloadIdentity['public.patients'].map((item, index) => ({
    id: deterministicUuid('40000000-', index + 1),
    clinic: clinicIdByFixtureId[item.clinicId],
  }));
  const menus = payloadIdentity['public.menus'].map((item, index) => ({
    id: deterministicUuid('50000000-', index + 1),
    clinic: clinicIdByFixtureId[item.clinicId],
  }));
  const resources = payloadIdentity['public.resources'].map((item, index) => ({
    id: deterministicUuid('60000000-', index + 1),
    clinic: clinicIdByFixtureId[item.clinicId],
    actorId: item.actorId,
  }));
  const resourceByActorId = Object.fromEntries(
    resources.map(resource => [resource.actorId, resource])
  );
  const reservations = payloadIdentity['public.reservations'].map(
    (item, index) => ({
      id: deterministicUuid('70000000-', index + 1),
      customer: customers[index % customers.length].id,
      menu: menus[index % menus.length].id,
      resource: resources[index % resources.length].id,
      clinic: clinicIdByFixtureId[item.clinicId],
      status: item.statusClass === 'COMPLETED' ? 'completed' : 'confirmed',
      ordinal: index + 1,
    })
  );
  const shifts = payloadIdentity['public.staff_shifts'].map((item, index) => ({
    id: deterministicUuid('80000000-', index + 1),
    clinic: clinicIdByFixtureId[item.clinicId],
    resource: resourceByActorId[item.actorId],
    ordinal: index + 1,
  }));
  const sql = `
\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '300s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email LIKE 'pr12+%@invalid.example')
     OR EXISTS (SELECT 1 FROM public.clinics WHERE name LIKE 'PR12 Synthetic%')
  THEN RAISE EXCEPTION 'PR12_FIXTURE_TARGET_NOT_EMPTY'; END IF;
END $$;
INSERT INTO public.clinics (id,name,parent_id,is_active) VALUES
(${sqlLiteral(clinics[0])},'PR12 Synthetic Tenant A Root',null,true),
(${sqlLiteral(clinics[1])},'PR12 Synthetic Tenant A Child',${sqlLiteral(clinics[0])},true),
(${sqlLiteral(clinics[2])},'PR12 Synthetic Tenant B Root',null,true),
(${sqlLiteral(clinics[3])},'PR12 Synthetic Tenant B Child',${sqlLiteral(clinics[2])},true);
INSERT INTO auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES
${values(userRows)};
INSERT INTO auth.identities (id,user_id,provider,provider_id,identity_data,created_at,updated_at,last_sign_in_at) VALUES
${values(identityRows)};
INSERT INTO public.profiles (id,user_id,clinic_id,email,full_name,role,is_active) VALUES
${values(profileRows)};
INSERT INTO public.staff (id,clinic_id,name,role,is_therapist,email,password_hash) VALUES
${values(staffRows)};
INSERT INTO public.user_permissions (id,staff_id,username,hashed_password,role,clinic_id) VALUES
${values(permissionRows)};
INSERT INTO public.manager_clinic_assignments (id,manager_user_id,clinic_id,assigned_by) VALUES
(${sqlLiteral(deterministicUuid('e0000000-', 1))},${sqlLiteral(actorDefinitions[2].id)},${sqlLiteral(clinics[1])},${sqlLiteral(actorDefinitions[0].id)});
INSERT INTO public.customers (id,name,phone,clinic_id) VALUES
${values(customers.map((item, index) => `(${sqlLiteral(item.id)},${sqlLiteral(`PR12 Customer ${index + 1}`)},${sqlLiteral(`0000000${index + 1}`)},${sqlLiteral(item.clinic)})`))};
INSERT INTO public.patients (id,clinic_id,name) VALUES
${values(patients.map((item, index) => `(${sqlLiteral(item.id)},${sqlLiteral(item.clinic)},${sqlLiteral(`PR12 Patient ${index + 1}`)})`))};
INSERT INTO public.menus (id,name,price,duration_minutes,clinic_id) VALUES
${values(menus.map((item, index) => `(${sqlLiteral(item.id)},${sqlLiteral(`PR12 Menu ${index + 1}`)},1000,30,${sqlLiteral(item.clinic)})`))};
INSERT INTO public.resources (id,name,type,clinic_id) VALUES
${values(resources.map((item, index) => `(${sqlLiteral(item.id)},${sqlLiteral(`PR12 Resource ${index + 1}`)},'staff',${sqlLiteral(item.clinic)})`))};
INSERT INTO public.reservations (id,customer_id,menu_id,staff_id,start_time,end_time,status,channel,clinic_id,created_by) VALUES
${values(reservations.map(item => `(${sqlLiteral(item.id)},${sqlLiteral(item.customer)},${sqlLiteral(item.menu)},${sqlLiteral(item.resource)},'2026-08-${String(10 + item.ordinal).padStart(2, '0')} 09:00:00+09','2026-08-${String(10 + item.ordinal).padStart(2, '0')} 09:30:00+09',${sqlLiteral(item.status)},'web',${sqlLiteral(item.clinic)},${sqlLiteral(actorById['tenant-a-admin'].id)})`))};
INSERT INTO public.staff_shifts (id,clinic_id,staff_id,start_time,end_time,status,created_by) VALUES
${values(shifts.map(item => `(${sqlLiteral(item.id)},${sqlLiteral(item.clinic)},${sqlLiteral(item.resource.id)},'2026-08-${String(10 + item.ordinal).padStart(2, '0')} 09:00:00+09','2026-08-${String(10 + item.ordinal).padStart(2, '0')} 17:00:00+09','confirmed',${sqlLiteral(actorById['tenant-a-admin'].id)})`))};
INSERT INTO public.staff_preferences (id,clinic_id,staff_id,preference_text) VALUES
(${sqlLiteral(deterministicUuid('90000000-', 1))},${sqlLiteral(clinics[1])},${sqlLiteral(resourceByActorId['tenant-a-therapist'].id)},'PR12 synthetic preference 1'),
(${sqlLiteral(deterministicUuid('90000000-', 2))},${sqlLiteral(clinics[1])},${sqlLiteral(resourceByActorId['tenant-a-staff'].id)},'PR12 synthetic preference 2');
INSERT INTO public.audit_logs (id,event_type,user_id,clinic_id,details) VALUES
(${sqlLiteral(deterministicUuid('a0000000-', 1))},'PR12_SYNTHETIC',${sqlLiteral(actorDefinitions[0].id)},${sqlLiteral(clinics[1])},'{"ordinal":1}'),
(${sqlLiteral(deterministicUuid('a0000000-', 2))},'PR12_SYNTHETIC',${sqlLiteral(actorDefinitions[2].id)},${sqlLiteral(clinics[1])},'{"ordinal":2}');
INSERT INTO public.user_sessions (id,user_id,clinic_id,session_token,expires_at) VALUES
(${sqlLiteral(deterministicUuid('c0000000-', 1))},${sqlLiteral(actorById['tenant-a-admin'].id)},${sqlLiteral(clinics[1])},'pr12-synthetic-non-secret-session-1',now()+interval '1 hour'),
(${sqlLiteral(deterministicUuid('c0000000-', 2))},${sqlLiteral(actorById['tenant-a-staff'].id)},${sqlLiteral(clinics[1])},'pr12-synthetic-non-secret-session-2',now()+interval '1 hour');
INSERT INTO public.security_events (id,user_id,clinic_id,session_id,event_type,event_category,event_description) VALUES
(${sqlLiteral(deterministicUuid('b0000000-', 1))},${sqlLiteral(actorById['tenant-a-admin'].id)},${sqlLiteral(clinics[1])},${sqlLiteral(deterministicUuid('c0000000-', 1))},'PR12_AUTH_SUCCESS','authentication','PR12 synthetic event'),
(${sqlLiteral(deterministicUuid('b0000000-', 2))},${sqlLiteral(actorById['tenant-a-clinic-admin'].id)},${sqlLiteral(clinics[1])},null,'PR12_AUTH_REFRESH','authentication','PR12 synthetic event');
INSERT INTO public.ai_comments (id,clinic_id,comment_date,summary) VALUES
(${sqlLiteral(deterministicUuid('d0000000-', 1))},${sqlLiteral(clinics[1])},'2026-08-10','PR12 synthetic comment');
SELECT json_build_object(
  'explicitTotal', 83,
  'derivedReservationHistory', (SELECT count(*) FROM public.reservation_history WHERE reservation_id::text LIKE '70000000-%'),
  'authUsers', (SELECT count(*) FROM auth.users WHERE email LIKE 'pr12+%@invalid.example'),
  'authIdentities', (SELECT count(*) FROM auth.identities WHERE identity_data->>'email' LIKE 'pr12+%@invalid.example'),
  'clinics', (SELECT count(*) FROM public.clinics WHERE name LIKE 'PR12 Synthetic%'),
  'profiles', (SELECT count(*) FROM public.profiles WHERE email LIKE 'pr12+%@invalid.example'),
  'staff', (SELECT count(*) FROM public.staff WHERE email LIKE 'pr12+%@invalid.example'),
  'permissions', (SELECT count(*) FROM public.user_permissions WHERE username LIKE 'pr12+%@invalid.example'),
  'managerAssignments', (SELECT count(*) FROM public.manager_clinic_assignments WHERE manager_user_id=${sqlLiteral(actorDefinitions[2].id)}),
  'verifiedTotal', 83 + (SELECT count(*) FROM public.reservation_history WHERE reservation_id::text LIKE '70000000-%')
)::text;
COMMIT;
`;
  return {
    sql,
    actorDefinitions,
    clinicIds: clinics,
    payloadAggregateSha256: payloadFingerprints.aggregateSha256,
    actorTopologySha256: payloadFingerprints.actorTopologySha256,
  };
}

function buildRepresentativeSnapshotSql() {
  const filters = {
    'auth.identities': "identity_data->>'email' LIKE 'pr12+%@invalid.example'",
    'auth.users': "email LIKE 'pr12+%@invalid.example'",
    'public.ai_comments': "id::text LIKE 'd0000000-%'",
    'public.audit_logs': "id::text LIKE 'a0000000-%'",
    'public.clinics': "id::text LIKE '10000000-%'",
    'public.customers': "id::text LIKE '30000000-%'",
    'public.manager_clinic_assignments': "id::text LIKE 'e0000000-%'",
    'public.menus': "id::text LIKE '50000000-%'",
    'public.patients': "id::text LIKE '40000000-%'",
    'public.profiles': "id::text LIKE '20000000-%'",
    'public.reservation_history': "reservation_id::text LIKE '70000000-%'",
    'public.reservations': "id::text LIKE '70000000-%'",
    'public.resources': "id::text LIKE '60000000-%'",
    'public.security_events': "id::text LIKE 'b0000000-%'",
    'public.staff': "id::text LIKE '20000000-%'",
    'public.staff_preferences': "id::text LIKE '90000000-%'",
    'public.staff_shifts': "id::text LIKE '80000000-%'",
    'public.user_permissions': "username LIKE 'pr12+%@invalid.example'",
    'public.user_sessions': "id::text LIKE 'c0000000-%'",
  };
  const querySha256ByRelation = {};
  const queries = REPRESENTATIVE_FIXTURE_RELATION_ORDER.map(relation => {
    const filter = filters[relation];
    if (typeof filter !== 'string') fail('FIXTURE_SNAPSHOT_FILTER_MISSING');
    const query = `WITH ordered_rows AS (SELECT id::text AS primary_key,to_jsonb(source)::text AS row_json FROM ${relation} AS source WHERE ${filter} ORDER BY id ASC NULLS FIRST) SELECT json_build_object('relation',${sqlLiteral(relation)},'rowCount',count(*),'digest',encode(extensions.digest(convert_to(COALESCE(string_agg(octet_length(row_json)::text || ':' || row_json || E'\\n','' ORDER BY primary_key),''),'UTF8'),'sha256'),'hex'))::text FROM ordered_rows;`;
    querySha256ByRelation[relation] = sha256Bytes(Buffer.from(query, 'utf8'));
    return query;
  });
  return {
    sql: `\\set ON_ERROR_STOP on\nBEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${queries.join('\n')}\nROLLBACK;\n`,
    querySha256ByRelation,
  };
}

function executeRepresentativeDataValidation({
  repositoryRoot,
  evidenceDirectory,
  replayWorkdir,
  psqlPath,
  caPath,
  databasePassword,
  journalDirectory,
  databaseIdentity,
  schemaHash,
}) {
  const fixture = compileRepresentativeFixturePlan();
  const actorPasswords = Object.fromEntries(
    [
      'tenant-a-admin',
      'tenant-a-clinic-admin',
      'tenant-a-manager',
      'tenant-a-therapist',
      'tenant-a-staff',
      'tenant-b-staff',
      'no-clinic-staff',
    ].map(actorId => [actorId, randomBytes(36).toString('base64url')])
  );
  const compiled = buildRepresentativeFixtureSql(actorPasswords);
  let intentArtifactSha256 = null;
  let resultArtifactSha256 = null;
  let durableMutationOutcome = null;
  try {
    const intent = {
      schemaVersion: 1,
      recordType: 'PR12_REPRESENTATIVE_FIXTURE_LOAD_INTENT',
      commandId: 'PR12-CMD-008',
      mutation: true,
      targetProjectRef: PR12_RECOVERY_TARGET.projectRef,
      targetDirectHost: PR12_RECOVERY_TARGET.directHost,
      fixturePlanSha256: fixture.planSha256,
      payloadAggregateSha256: compiled.payloadAggregateSha256,
      actorTopologySha256: compiled.actorTopologySha256,
      explicitRows: 83,
      expectedDerivedRows: 12,
      dispatchMaximum: 1,
      wrapperRetryCount: 0,
      createdAt: new Date().toISOString(),
      rawSqlRetained: false,
      secretValuesCaptured: false,
    };
    const intentPath = path.join(journalDirectory, 'pr12-cmd-008-intent.json');
    intentArtifactSha256 = writeCanonicalCreateNew(
      intentPath,
      { ...intent, intentSha256: sha256Canonical(intent) },
      'STEP03_INTENT_CREATE_FAILED'
    );
    hardenPath(repositoryRoot, intentPath, 'FILE');
    const dispatched = executePsqlInput({
      psqlPath,
      databaseUrl: directDatabaseUrl(caPath),
      databasePassword,
      cwd: replayWorkdir,
      sql: compiled.sql,
      timeoutMs: 300_000,
      forbiddenValues: [databasePassword, ...Object.values(actorPasswords)],
    });
    const resultPath = path.join(journalDirectory, 'pr12-cmd-008-result.json');
    const resultObservation = {
      ...dispatched.observation,
      commandId: 'PR12-CMD-008',
      intentArtifactSha256,
    };
    resultArtifactSha256 = writeCanonicalCreateNew(
      resultPath,
      {
        ...resultObservation,
        observationSha256: sha256Canonical(resultObservation),
      },
      'STEP03_RESULT_CREATE_FAILED'
    );
    hardenPath(repositoryRoot, resultPath, 'FILE');
    durableMutationOutcome = dispatched.observation.outcome;
    if (dispatched.observation.outcome !== 'SUCCEEDED') {
      fail(
        dispatched.observation.outcome === 'UNKNOWN_REMOTE_OUTCOME'
          ? 'UNKNOWN_REMOTE_OUTCOME'
          : 'REPRESENTATIVE_FIXTURE_LOAD_FAILED'
      );
    }
    const counts = lastJsonLine(
      dispatched.stdout,
      'REPRESENTATIVE_FIXTURE_RESULT_INVALID'
    );
    if (
      counts.explicitTotal !== 83 ||
      counts.derivedReservationHistory !== 12 ||
      counts.authUsers !== 7 ||
      counts.authIdentities !== 7 ||
      counts.clinics !== 4 ||
      counts.profiles !== 7 ||
      counts.staff !== 7 ||
      counts.permissions !== 7 ||
      counts.managerAssignments !== 1 ||
      counts.verifiedTotal !== 95
    ) {
      fail('REPRESENTATIVE_FIXTURE_COUNT_MISMATCH');
    }
    const snapshotPlan = buildRepresentativeSnapshotSql();
    const snapshotDispatch = executePsqlInput({
      psqlPath,
      databaseUrl: directDatabaseUrl(caPath),
      databasePassword,
      cwd: replayWorkdir,
      sql: snapshotPlan.sql,
      timeoutMs: 300_000,
      forbiddenValues: [databasePassword, ...Object.values(actorPasswords)],
    });
    if (snapshotDispatch.observation.outcome !== 'SUCCEEDED') {
      fail('REPRESENTATIVE_FIXTURE_SNAPSHOT_FAILED');
    }
    const snapshotRows = snapshotDispatch.stdout
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line));
    if (snapshotRows.length !== REPRESENTATIVE_FIXTURE_RELATION_ORDER.length) {
      fail('REPRESENTATIVE_FIXTURE_SNAPSHOT_INVALID');
    }
    const rowCounts = {};
    const relationDigests = {};
    for (const relation of REPRESENTATIVE_FIXTURE_RELATION_ORDER) {
      const observed = snapshotRows.find(item => item.relation === relation);
      if (
        !isRecord(observed) ||
        observed.rowCount !== REPRESENTATIVE_FIXTURE_SNAPSHOT_ROWS[relation] ||
        typeof observed.digest !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(observed.digest)
      ) {
        fail('REPRESENTATIVE_FIXTURE_SNAPSHOT_INVALID');
      }
      rowCounts[relation] = observed.rowCount;
      relationDigests[relation] = observed.digest;
    }
    const aggregateDataHash = computeRepresentativeAggregateDataHash(
      rowCounts,
      snapshotPlan.querySha256ByRelation,
      relationDigests
    );
    const snapshot = {
      schemaVersion: 1,
      resultType: 'PR12_REPRESENTATIVE_FIXTURE_SNAPSHOT',
      commandId: 'PR12-CMD-009',
      fixturePlanSha256: fixture.planSha256,
      transaction: 'REPEATABLE_READ_READ_ONLY',
      relationOrder: [...REPRESENTATIVE_FIXTURE_RELATION_ORDER],
      rowCounts,
      querySha256ByRelation: snapshotPlan.querySha256ByRelation,
      relationDigests,
      aggregateDataHash,
      aggregateSchemaHash: schemaHash,
      aggregateEnvironmentPhysicalStructureHash: sha256Canonical({
        projectRef: PR12_RECOVERY_TARGET.projectRef,
        databaseSystemIdentifier: databaseIdentity.systemIdentifier,
      }),
      rawRowsPersisted: false,
      watermarkColumn: 'public.reservations.updated_at',
      watermarkIncluded: true,
    };
    const snapshotVerification = validateRepresentativeFixtureSnapshot(
      snapshot,
      fixture.planSha256
    );
    const withoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_REPRESENTATIVE_DATA_VALIDATION_RESULT',
      canonicalStep: {
        step: '03',
        name: 'anonymized/representative data validation',
      },
      status: 'PASS',
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      fixturePlanSha256: fixture.planSha256,
      payloadAggregateSha256: compiled.payloadAggregateSha256,
      actorTopologySha256: compiled.actorTopologySha256,
      explicitRows: 83,
      derivedRows: 12,
      verifiedRows: 95,
      actorCount: 7,
      clinics: 4,
      managerAssignments: 1,
      transaction: 'SINGLE_TRANSACTION_FAIL_CLOSED',
      dispatch: dispatched.observation,
      snapshot: {
        commandId: 'PR12-CMD-009',
        verification: snapshotVerification,
        aggregateDataHash,
        aggregateSchemaHash: snapshot.aggregateSchemaHash,
        aggregateEnvironmentPhysicalStructureHash:
          snapshot.aggregateEnvironmentPhysicalStructureHash,
        sourceSnapshotSha256: sha256Canonical(snapshot),
        dispatch: snapshotDispatch.observation,
        rawRowsPersisted: false,
      },
      mutationJournal: {
        intentArtifactSha256,
        resultArtifactSha256,
        durableOutcome: durableMutationOutcome,
      },
      rawRowsPersisted: false,
      rawCredentialsPersisted: false,
      nextStep: '04',
    };
    const result = {
      ...withoutHash,
      evidenceSha256: sha256Canonical(withoutHash),
    };
    const filename = path.join(evidenceDirectory, STEP03_EVIDENCE_FILE);
    writeCanonicalCreateNew(filename, result, 'STEP03_EVIDENCE_CREATE_FAILED');
    hardenPath(repositoryRoot, filename, 'FILE');
    return {
      evidence: result,
      actorPasswords,
      actors: compiled.actorDefinitions,
    };
  } catch (error) {
    const reasonCode =
      error instanceof Error && /^[A-Z0-9_-]+$/u.test(error.message)
        ? error.message
        : 'UNEXPECTED_REPRESENTATIVE_DATA_FAILURE';
    const filename = path.join(evidenceDirectory, STEP03_EVIDENCE_FILE);
    if (!existsSync(filename)) {
      const blockedWithoutHash = {
        schemaVersion: 1,
        recordType: 'PR12_REPRESENTATIVE_DATA_VALIDATION_RESULT',
        canonicalStep: {
          step: '03',
          name: 'anonymized/representative data validation',
        },
        status: 'BLOCK',
        reasonCode,
        projectRef: PR12_RECOVERY_TARGET.projectRef,
        fixturePlanSha256: fixture.planSha256,
        payloadAggregateSha256: compiled.payloadAggregateSha256,
        actorTopologySha256: compiled.actorTopologySha256,
        mutationJournal: {
          intentArtifactSha256,
          resultArtifactSha256,
          durableOutcome: durableMutationOutcome,
        },
        mutationOutcomeUnknown:
          intentArtifactSha256 !== null &&
          !['SUCCEEDED', 'FAILED_DETERMINISTIC'].includes(
            durableMutationOutcome
          ),
        rawRowsPersisted: false,
        rawCredentialsPersisted: false,
      };
      const blocked = {
        ...blockedWithoutHash,
        evidenceSha256: sha256Canonical(blockedWithoutHash),
      };
      writeCanonicalCreateNew(
        filename,
        blocked,
        'STEP03_BLOCK_EVIDENCE_CREATE_FAILED'
      );
      hardenPath(repositoryRoot, filename, 'FILE');
    }
    for (const key of Object.keys(actorPasswords)) actorPasswords[key] = '';
    throw error;
  }
}

function executeHostedTypesParity({
  repositoryRoot,
  evidenceDirectory,
  replayWorkdir,
  supabasePath,
  managementAccessToken,
  gitHead,
  bindingSha256,
  databaseIdentity,
}) {
  const runtimeRoot = path.join(replayWorkdir, '.pr12-types-runtime');
  mkdirSync(runtimeRoot, { recursive: false });
  const supabaseHome = path.join(runtimeRoot, 'supabase-home');
  const dockerConfig = path.join(runtimeRoot, 'docker-config');
  mkdirSync(supabaseHome, { recursive: false });
  mkdirSync(dockerConfig, { recursive: false });
  const environment = buildIsolatedChildEnvironment({
    credentialKind: 'management-types',
    credentialValues: { SUPABASE_ACCESS_TOKEN: managementAccessToken },
    operatingSystemValues: {
      SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
      TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
      TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
      PATH: path.dirname(supabasePath),
    },
    isolationPaths: { supabaseHome, dockerConfig },
  });
  const contract = buildPinnedSpawnContract({
    executable: supabasePath,
    args: [
      'gen',
      'types',
      'typescript',
      '--project-id',
      PR12_RECOVERY_TARGET.projectRef,
      '--schema',
      'public',
    ],
    cwd: replayWorkdir,
    env: environment,
    timeoutMs: 300_000,
    retries: 0,
  });
  const startedAt = new Date().toISOString();
  const child = spawnSync(contract.executable, contract.args, contract.options);
  const stdout = typeof child.stdout === 'string' ? child.stdout : '';
  const stderr = typeof child.stderr === 'string' ? child.stderr : '';
  if (
    stdout.includes(managementAccessToken) ||
    stderr.includes(managementAccessToken)
  ) {
    fail('SECRET_BEARING_PROCESS_OUTPUT');
  }
  if (
    child.error !== undefined ||
    child.signal !== null ||
    !Number.isInteger(child.status)
  ) {
    fail('UNKNOWN_REMOTE_OUTCOME');
  }
  if (child.status !== 0) fail('HOSTED_TYPES_GENERATION_FAILED');
  const generatedTypes = extractGeneratedTypes(stdout);
  const comparison = compareHostedTypes({
    generatedTypes,
    committedTypes: readFileSync(
      path.join(repositoryRoot, 'src/types/supabase.ts'),
      'utf8'
    ),
    projectRef: PR12_RECOVERY_TARGET.projectRef,
    bindingSha256,
    gitCommit: gitHead,
    databaseSystemIdentifier: databaseIdentity.systemIdentifier,
  });
  const withoutHash = {
    schemaVersion: 1,
    recordType: 'PR12_HOSTED_TYPES_PARITY_RESULT',
    canonicalStep: { step: '04', name: 'types parity' },
    status: 'PASS',
    startedAt,
    completedAt: new Date().toISOString(),
    comparison,
    dispatch: {
      dispatchCount: 1,
      wrapperRetryCount: 0,
      exitCode: child.status,
      stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
      stdoutSha256: sha256Bytes(Buffer.from(stdout, 'utf8')),
      stderrBytes: Buffer.byteLength(stderr, 'utf8'),
      stderrSha256: sha256Bytes(Buffer.from(stderr, 'utf8')),
      rawOutputRetained: false,
    },
    managementCredentialPassedViaChildEnvironmentOnly: true,
    committedFileMutated: false,
    nextStep: '05',
  };
  assertSecretFreeEvidence(withoutHash, [managementAccessToken]);
  const result = {
    ...withoutHash,
    evidenceSha256: sha256Canonical(withoutHash),
  };
  const filename = path.join(evidenceDirectory, STEP04_EVIDENCE_FILE);
  writeCanonicalCreateNew(filename, result, 'STEP04_EVIDENCE_CREATE_FAILED');
  hardenPath(repositoryRoot, filename, 'FILE');
  return result;
}

function executeAdvisorAfterScan({
  repositoryRoot,
  evidenceDirectory,
  replayWorkdir,
  supabasePath,
  psqlPath,
  caPath,
  databasePassword,
  databaseIdentity,
  bindingSha256,
  advisorBefore,
  journalDirectory,
}) {
  const environment = buildIsolatedChildEnvironment({
    credentialKind: 'database',
    credentialValues: { PGPASSWORD: databasePassword },
    operatingSystemValues: {
      SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
      TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
      TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
      PATH: `${path.dirname(supabasePath)};${path.dirname(psqlPath)}`,
    },
    isolationPaths: {
      supabaseHome: path.join(replayWorkdir, '.pr12-runtime', 'supabase-home'),
      dockerConfig: path.join(replayWorkdir, '.pr12-runtime', 'docker-config'),
    },
  });
  const command = {
    id: 'PR12-CMD-016',
    operation: 'SOURCE_ADVISOR_AFTER_CAPTURE',
    transport: 'DIRECT_POSTGRES_VIA_SUPABASE_CLI',
    executable: supabasePath,
    args: [
      'db',
      'advisors',
      '--db-url',
      directDatabaseUrl(caPath),
      '--type',
      'all',
      '--level',
      'info',
      '--fail-on',
      'error',
      '--output-format',
      'json',
    ],
    cwd: replayWorkdir,
    mutation: false,
    timeoutMs: 300_000,
  };
  const dispatched = runReplayCommand(
    command,
    environment,
    [databasePassword],
    journalDirectory,
    repositoryRoot
  );
  if (dispatched.observation.outcome !== 'SUCCEEDED') {
    fail('PR12_CMD_016_FAILED');
  }
  const parsed = JSON.parse(dispatched.stdout);
  const findings = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.advisors)
      ? parsed.advisors
      : fail('ADVISOR_OUTPUT_INVALID');
  const after = normalizeAdvisorSnapshot({
    schemaVersion: 1,
    commandId: 'PR12-CMD-016',
    bindingSha256,
    projectRef: PR12_RECOVERY_TARGET.projectRef,
    databaseSystemIdentifier: databaseIdentity.systemIdentifier,
    category: 'all',
    capturedAt: dispatched.observation.completedAt,
    findings,
  });
  const diff = diffAdvisorSnapshots(advisorBefore, after);
  const withoutHash = {
    schemaVersion: 1,
    recordType: 'PR12_ADVISOR_SCAN_RESULT',
    canonicalStep: { step: '05', name: 'advisor scan' },
    status: 'PASS',
    before: advisorBefore,
    after,
    diff,
    dispatch: dispatched.observation,
    rawOutputRetained: false,
    nextStep: '06',
  };
  const result = {
    ...withoutHash,
    evidenceSha256: sha256Canonical(withoutHash),
  };
  const filename = path.join(evidenceDirectory, STEP05_EVIDENCE_FILE);
  writeCanonicalCreateNew(filename, result, 'STEP05_EVIDENCE_CREATE_FAILED');
  hardenPath(repositoryRoot, filename, 'FILE');
  return result;
}

async function executeAllRoleSmoke({
  repositoryRoot,
  evidenceDirectory,
  fixtureResult,
  replayWorkdir,
  psqlPath,
  caPath,
  databasePassword,
  managementAccessToken,
}) {
  const tenantAChild = deterministicUuid('10000000-', 2);
  const tenantBChild = deterministicUuid('10000000-', 4);
  const actorById = new Map(
    fixtureResult.actors.map(actor => [actor.actorId, actor])
  );
  const clinicByContractId = {
    'tenant-a-child': tenantAChild,
    'tenant-b-child': tenantBChild,
  };
  const cases = ALL_ROLE_SMOKE_REST_CASES.map(restCase => {
    const actor = actorById.get(restCase.actorId);
    const clinicId = clinicByContractId[restCase.clinicId];
    const relation = resolveAllRoleSmokeRelation(restCase.relation);
    if (
      !isRecord(actor) ||
      actor.role !== restCase.role ||
      typeof clinicId !== 'string'
    ) {
      fail('ALL_ROLE_DATABASE_RLS_MATRIX_INVALID');
    }
    return {
      id: `db-rls-${restCase.id}`,
      contractCaseId: restCase.id,
      actor,
      clinicId,
      expectedCount: restCase.expectedRows,
      sqlIdentifier: relation.sqlIdentifier,
    };
  });
  if (cases.length !== 14) fail('ALL_ROLE_DATABASE_RLS_MATRIX_INVALID');
  const sql = cases
    .map(item => {
      const claims = JSON.stringify({
        sub: item.actor.id,
        role: 'authenticated',
        app_metadata: {
          role: item.actor.role,
          clinic_id: item.actor.clinicId,
        },
      });
      return `BEGIN TRANSACTION READ ONLY;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = ${sqlLiteral(claims)};
SELECT json_build_object('caseId',${sqlLiteral(item.id)},'count',(SELECT count(*) FROM ${item.sqlIdentifier} WHERE clinic_id=${sqlLiteral(item.clinicId)}))::text;
ROLLBACK;`;
    })
    .join('\n');
  const dispatched = executePsqlInput({
    psqlPath,
    databaseUrl: directDatabaseUrl(caPath),
    databasePassword,
    cwd: replayWorkdir,
    sql: `\\set ON_ERROR_STOP on\n${sql}\n`,
    timeoutMs: 120_000,
    forbiddenValues: [
      databasePassword,
      ...Object.values(fixtureResult.actorPasswords),
    ],
  });
  if (dispatched.observation.outcome !== 'SUCCEEDED') {
    fail('ALL_ROLE_DATABASE_SMOKE_FAILED');
  }
  const observed = dispatched.stdout
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line));
  if (
    observed.length !== cases.length ||
    cases.some(item => {
      const actual = observed.find(value => value.caseId === item.id);
      return !isRecord(actual) || actual.count !== item.expectedCount;
    })
  ) {
    fail('ALL_ROLE_DATABASE_RLS_BOUNDARY_MISMATCH');
  }
  const browserRuntimePreparation = preparePr12BrowserRuntime({
    repositoryRoot,
    runtimeRoot: path.join(replayWorkdir, '.pr12-browser-runtime'),
  });
  const apiKeysUrl = `https://api.supabase.com/v1/projects/${PR12_RECOVERY_TARGET.projectRef}/api-keys?reveal=true`;
  if (recoveryFailureContext !== null) {
    recoveryFailureContext.runtimeApiKeysGetCount = 1;
  }
  const apiKeysResponse = await fetchProviderJson(
    apiKeysUrl,
    managementAccessToken
  );
  const runtimeKeys = selectProjectRuntimeApiKeys(apiKeysResponse.body);
  if (Array.isArray(apiKeysResponse.body)) {
    for (const entry of apiKeysResponse.body) {
      if (isRecord(entry) && typeof entry.api_key === 'string') {
        entry.api_key = '';
      }
    }
  }
  let clientApiKey = runtimeKeys.clientApiKey;
  let serverApiKey = runtimeKeys.serverApiKey;
  let remoteSmoke;
  try {
    remoteSmoke = await executePr12AllRoleSmokeRuntime({
      browserRuntimePreparation,
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      clientApiKey,
      serverApiKey,
      actors: fixtureResult.actors,
      actorPasswords: fixtureResult.actorPasswords,
      fixtureClinicIds: {
        tenantAChild,
        tenantBChild,
      },
      forbiddenValues: [
        databasePassword,
        managementAccessToken,
        clientApiKey,
        serverApiKey,
        ...Object.values(fixtureResult.actorPasswords),
      ],
    });
  } finally {
    clientApiKey = '';
    serverApiKey = '';
  }
  const withoutHash = {
    schemaVersion: 1,
    recordType: 'PR12_ALL_ROLE_SMOKE_RESULT',
    canonicalStep: { step: '06', name: 'all role smoke' },
    status: 'PASS',
    projectRef: PR12_RECOVERY_TARGET.projectRef,
    fixtureEvidenceSha256: fixtureResult.evidence.evidenceSha256,
    completedComponents: [
      'AUTH_SIGN_IN_REFRESH_7_ACTORS',
      'PROFILE_API_7_ACTORS',
      'REST_14_CASES',
      'BROWSER_16_CASES',
      'AUTHENTICATED_DATABASE_RLS_14_CASES',
      'SERVICE_ROLE_CLIENT_BOUNDARY',
    ],
    providerRuntimeApiKeys: {
      getCount: 1,
      responseSha256: apiKeysResponse.bodySha256,
      clientKeyName: runtimeKeys.clientKeyName,
      serverKeyName: runtimeKeys.serverKeyName,
      observedKeyCount: runtimeKeys.observedKeyCount,
      rawResponseRetained: false,
      runtimeValuesPersisted: false,
    },
    databaseRlsCases: {
      caseCount: cases.length,
      passCount: cases.length,
      crossTenantFalseAllowCount: 0,
      observationSha256: sha256Canonical(observed),
      rawRowsPersisted: false,
      dispatch: dispatched.observation,
    },
    auth: remoteSmoke.auth,
    rest: remoteSmoke.rest,
    browser: remoteSmoke.browser,
    serviceRoleBoundary: remoteSmoke.serviceRoleBoundary,
    externalSideEffects: {
      boundary: 'ISOLATED_PROJECT_ONLY',
      authSessionFlows: 14,
      applicationLoginFlows: 7,
      productionMutationCount: 0,
      providerMutationCount: 0,
    },
    notRunComponents: ['SERVICE_ROLE_DIRECT_API', 'GRAPHQL', 'MUTATING_CRUD'],
    productionFallbackAllowed: false,
    dotenvFallbackAllowed: false,
    trackedStorageStateFallbackAllowed: false,
    secretValuesCaptured: false,
    rawResponseBodiesPersisted: false,
    nextStep: '07',
    nextStepAuthorized: false,
  };
  assertSecretFreeEvidence(withoutHash, [
    databasePassword,
    managementAccessToken,
    runtimeKeys.clientApiKey,
    runtimeKeys.serverApiKey,
    ...Object.values(fixtureResult.actorPasswords),
  ]);
  const result = {
    ...withoutHash,
    evidenceSha256: sha256Canonical(withoutHash),
  };
  const filename = path.join(evidenceDirectory, STEP06_EVIDENCE_FILE);
  writeCanonicalCreateNew(filename, result, 'STEP06_EVIDENCE_CREATE_FAILED');
  hardenPath(repositoryRoot, filename, 'FILE');
  return result;
}

function assertSecretFreeEvidence(value, forbiddenValues) {
  const serialized = canonicalJson(value);
  const lower = serialized.toLowerCase();
  if (
    forbiddenValues.some(
      secret => secret.length > 0 && serialized.includes(secret)
    ) ||
    /bearer\s+[a-z0-9._~+/=-]+/iu.test(serialized) ||
    /postgres(?:ql)?:\/\/[^/\s"'@]+:[^@\s"']+@/iu.test(serialized) ||
    lower.includes('ciphertextbase64') ||
    lower.includes('databasepassword') ||
    lower.includes('managementaccesstoken')
  ) {
    fail('SECRET_BEARING_EVIDENCE');
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (process.platform !== 'win32') fail('WINDOWS_REQUIRED');
  assertNoAmbientCredentials();
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
  );
  if (
    realpathSync.native(process.cwd()) !== realpathSync.native(repositoryRoot)
  ) {
    fail('REPOSITORY_CWD_INVALID');
  }
  const gitHead = captureCleanGitHead(repositoryRoot);
  const credentialPath = resolveExistingFile(
    args['--credential-config'],
    'CREDENTIAL_CONFIG_INVALID'
  );
  const journalDirectory = resolveExistingDirectory(
    args['--action003-journal'],
    'ACTION003_JOURNAL_INVALID'
  );
  const action003EvidenceDirectory = resolveExistingDirectory(
    args['--action003-evidence-directory'],
    'ACTION003_EVIDENCE_INVALID'
  );
  const supabasePath = resolveExistingFile(
    args['--supabase'],
    'SUPABASE_TOOLCHAIN_INVALID'
  );
  const psqlPath = resolveExistingFile(args['--psql'], 'PSQL_INVALID');
  const historical = verifyProvisioningEvidenceDirectory(
    action003EvidenceDirectory
  );
  const sourceCredentialSnapshot = readCanonicalJson(
    credentialPath,
    'CREDENTIAL_CONFIG_INVALID'
  );
  if (
    historical.outcome !== 'PARTIAL_FAILURE' ||
    historical.manifestSha256 !== EXPECTED_ACTION003_MANIFEST_SHA256 ||
    historical.trustedResult?.partialFailureState !==
      'PROVIDER_RESPONSE_INVALID' ||
    historical.trustedResult?.createPostAttemptCount !== 1 ||
    historical.trustedProvider?.createResponse?.safeProjection?.projectRef !==
      PR12_RECOVERY_TARGET.projectRef
  ) {
    fail('ACTION003_HISTORICAL_EVIDENCE_MISMATCH');
  }
  const paths = assertExternalSiblingPaths(
    repositoryRoot,
    journalDirectory,
    action003EvidenceDirectory
  );
  createOwnerPrivateDirectory(repositoryRoot, paths.recoveryJournal);
  const evidenceAcl = createOwnerPrivateDirectory(
    repositoryRoot,
    paths.recoveryEvidence
  );
  recoveryFailureContext = {
    repositoryRoot,
    journalDirectory: paths.recoveryJournal,
    evidenceDirectory: paths.recoveryEvidence,
    gitHead,
    startedAt: new Date().toISOString(),
    projectStateGetCount: 0,
    computeAddonGetCount: 0,
    publicCaGetCount: 0,
    runtimeApiKeysGetCount: 0,
    directDatabaseConnectionCount: 0,
    providerBodySha256: null,
  };
  const runtimeCredential = createRuntimeCredentialConfiguration(
    repositoryRoot,
    sourceCredentialSnapshot,
    paths.recoveryJournal
  );
  const resources = validateDpapiCredentialResources(
    runtimeCredential.value,
    repositoryRoot
  );
  const toolchain = observeAndAssertPinnedToolchainFiles({
    supabasePath,
    psqlPath,
  });
  const toolchainProjection = projectPinnedToolchainObservation(toolchain);
  const claimSnapshot = createRecoveryClaim({
    repositoryRoot,
    journalDirectory: paths.recoveryJournal,
    gitHead,
    action003Evidence: action003EvidenceDirectory,
    action003Verification: historical,
    credentialConfigurationSha256: runtimeCredential.sha256,
  });
  const claim = claimSnapshot.claim;
  const credentialLeaseExpiresAt = new Date(
    Date.now() + CREDENTIAL_LEASE_MS
  ).toISOString();
  let managementAccessToken = '';
  let databasePassword = '';
  let fixtureResult = null;
  const startedAt = new Date().toISOString();
  try {
    const credentials = retrieveClaimBoundCredentials({
      mode: 'ISOLATED_PROJECT_CONTINUATION',
      bindingMaterialSha256: claim.bindingMaterialSha256,
      derivedExecutionBindingSha256: claim.derivedExecutionBindingSha256,
      payloadSha256: claim.payloadSha256,
      claimSha256: claimSnapshot.sha256,
      credentialConfigurationSha256: runtimeCredential.sha256,
      credentialConfiguration: runtimeCredential.value,
      journalDirectory: paths.recoveryJournal,
      journalDirectoryPathSha256: windowsPathFingerprint(paths.recoveryJournal),
      evidenceParentDirectory: paths.recoveryEvidence,
      evidenceParentDirectoryPathSha256: windowsPathFingerprint(
        paths.recoveryEvidence
      ),
      approvalExpiresAt: credentialLeaseExpiresAt,
      resources,
    });
    managementAccessToken = credentials.managementAccessToken;
    databasePassword = credentials.databasePassword;
    if (
      managementAccessToken.length < 20 ||
      databasePassword.length < 32 ||
      managementAccessToken === databasePassword
    ) {
      fail('RUNTIME_CREDENTIAL_INVALID');
    }

    const projectUrl = `https://api.supabase.com/v1/projects/${PR12_RECOVERY_TARGET.projectRef}`;
    recoveryFailureContext.projectStateGetCount = 1;
    const projectResponse = await fetchProviderJson(
      projectUrl,
      managementAccessToken
    );
    recoveryFailureContext.providerBodySha256 = projectResponse.bodySha256;
    const providerProject = projectResponseToRecoverySafeProjection(
      projectResponse.body
    );

    let compute = { verification: 'UNVERIFIED', tier: null };
    let computeObservation = {
      verification: 'UNVERIFIED',
      tier: null,
      reason: 'NOT_OBSERVED',
    };
    try {
      const addonUrl = `${projectUrl}/billing/addons`;
      recoveryFailureContext.computeAddonGetCount = 1;
      const addonResponse = await fetchProviderJson(
        addonUrl,
        managementAccessToken
      );
      const addon = addonResponseToRecoveryComputeProjection(
        addonResponse.body
      );
      compute = { verification: addon.verification, tier: addon.tier };
      computeObservation = {
        ...compute,
        variantId: addon.variantId,
        bodySha256: addonResponse.bodySha256,
        httpStatus: addonResponse.httpStatus,
      };
    } catch (error) {
      computeObservation = {
        ...compute,
        reason:
          error instanceof Error && typeof error.message === 'string'
            ? error.message
            : 'COMPUTE_OBSERVATION_FAILED',
      };
    }

    const caPath = path.join(paths.recoveryEvidence, CA_FILE);
    recoveryFailureContext.publicCaGetCount = 1;
    const caBundle = await captureCaBundle(caPath);
    hardenPath(repositoryRoot, caPath, 'FILE');
    recoveryFailureContext.directDatabaseConnectionCount = 1;
    const database = captureDatabaseIdentity({
      psqlPath,
      caPath,
      databasePassword,
    });
    const decision = determineRecoveredStep01Result({
      providerProject,
      database,
      compute,
    });
    const completedAt = new Date().toISOString();
    const evidenceWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_EXISTING_ISOLATED_PROJECT_RECOVERY_RESULT',
      canonicalStep: {
        step: '01',
        name: 'staging clone/isolated project',
      },
      status: 'PASS',
      ownerDecision: EXECUTION_CONFIRMATION,
      startedAt,
      completedAt,
      credentialBoundary: {
        provider: 'WINDOWS_DPAPI_CURRENT_USER_V1',
        retrieval: 'RUNTIME_ONLY_CAPTURED_BINARY_CHILD_ENV_ONLY',
        brokerProtocolMode: 'ISOLATED_PROJECT_CONTINUATION',
        oldAction003WrapperInvoked: false,
        action003Reissued: false,
        newProjectPostAttemptCount: 0,
        credentialLeaseExpiresAt,
        secretValuesCaptured: false,
      },
      provider: {
        httpStatus: projectResponse.httpStatus,
        bodySha256: projectResponse.bodySha256,
        projection: providerProject,
        rawBodyRetained: false,
      },
      compute: computeObservation,
      caBundle: {
        ...caBundle,
        aclPolicy: evidenceAcl.policy,
      },
      database,
      psql: toolchainProjection.tools.psql,
      toolchain: toolchainProjection,
      historicalAction003: {
        outcome: historical.outcome,
        manifestSha256: historical.manifestSha256,
        bindingMaterialSha256: historical.bindingMaterialSha256,
        payloadSha256: historical.payloadSha256,
        createPostAttemptCount: 1,
        terminalReason: 'PROVIDER_RESPONSE_INVALID',
      },
      decision,
      productionBoundary: {
        productionProjectRef: 'qnanuoqveidwvacvbhqp',
        directProductionContactCount: 0,
        productionCredentialAccessCount: 0,
        productionDatabaseContactCount: 0,
      },
      remoteContacts: {
        projectStateGetCount: 1,
        computeAddonGetCount: 1,
        publicCaGetCount: 1,
        directDatabaseConnectionCount: 1,
        postCount: 0,
        retryCount: 0,
      },
      externalSideEffects: {
        enabled: false,
        mutationCount: 0,
      },
      rawPathsRetained: false,
      rawOutputsRetained: false,
      secretValuesCaptured: false,
    };
    const evidence = {
      ...evidenceWithoutHash,
      evidenceSha256: sha256Canonical(evidenceWithoutHash),
    };
    assertSecretFreeEvidence(evidence, [
      managementAccessToken,
      databasePassword,
    ]);
    const evidencePath = path.join(
      paths.recoveryEvidence,
      STEP01_EVIDENCE_FILE
    );
    writeCanonicalCreateNew(
      evidencePath,
      evidence,
      'STEP01_EVIDENCE_CREATE_FAILED'
    );
    hardenPath(repositoryRoot, evidencePath, 'FILE');
    process.stdout.write(
      `${canonicalJson({
        step: '01',
        canonicalStep: 'staging clone/isolated project',
        result: 'PASS',
        projectRef: decision.projectRef,
        computeTier: decision.computeTier,
        performanceQualificationDeferred:
          decision.productionEquivalentPerformanceQualificationDeferred,
        nextStep: '02',
      })}\n`
    );
    const replay = executeFullMigrationReplay({
      repositoryRoot,
      replayWorkdir: paths.replayWorkdir,
      evidenceDirectory: paths.recoveryEvidence,
      databasePassword,
      databaseIdentity: database,
      caPath,
      supabasePath,
      psqlPath,
      journalDirectory: paths.recoveryJournal,
      bindingSha256: claim.derivedExecutionBindingSha256,
    });
    process.stdout.write(
      `${canonicalJson({
        step: '02',
        canonicalStep: 'full migration replay',
        result: 'PASS',
        nextStep: '03',
        evidenceSha256: replay.evidenceSha256,
        productionContactCount: 0,
        postCount: 0,
      })}\n`
    );
    fixtureResult = executeRepresentativeDataValidation({
      repositoryRoot,
      evidenceDirectory: paths.recoveryEvidence,
      replayWorkdir: paths.replayWorkdir,
      psqlPath,
      caPath,
      databasePassword,
      journalDirectory: paths.recoveryJournal,
      databaseIdentity: database,
      schemaHash: replay.catalogSnapshot.snapshotSha256,
    });
    process.stdout.write(
      `${canonicalJson({
        step: '03',
        canonicalStep: 'anonymized/representative data validation',
        result: 'PASS',
        nextStep: '04',
        evidenceSha256: fixtureResult.evidence.evidenceSha256,
      })}\n`
    );
    const types = executeHostedTypesParity({
      repositoryRoot,
      evidenceDirectory: paths.recoveryEvidence,
      replayWorkdir: paths.replayWorkdir,
      supabasePath,
      managementAccessToken,
      gitHead,
      bindingSha256: claim.derivedExecutionBindingSha256,
      databaseIdentity: database,
    });
    process.stdout.write(
      `${canonicalJson({
        step: '04',
        canonicalStep: 'types parity',
        result: 'PASS',
        nextStep: '05',
        evidenceSha256: types.evidenceSha256,
      })}\n`
    );
    const advisor = executeAdvisorAfterScan({
      repositoryRoot,
      evidenceDirectory: paths.recoveryEvidence,
      replayWorkdir: paths.replayWorkdir,
      supabasePath,
      psqlPath,
      caPath,
      databasePassword,
      databaseIdentity: database,
      bindingSha256: claim.derivedExecutionBindingSha256,
      advisorBefore: replay.advisorBefore,
      journalDirectory: paths.recoveryJournal,
    });
    process.stdout.write(
      `${canonicalJson({
        step: '05',
        canonicalStep: 'advisor scan',
        result: 'PASS',
        nextStep: '06',
        evidenceSha256: advisor.evidenceSha256,
      })}\n`
    );
    const smoke = await executeAllRoleSmoke({
      repositoryRoot,
      evidenceDirectory: paths.recoveryEvidence,
      fixtureResult,
      replayWorkdir: paths.replayWorkdir,
      psqlPath,
      caPath,
      databasePassword,
      managementAccessToken,
    });
    const terminalWithoutHash = {
      schemaVersion: 1,
      recordType: 'PR12_EXISTING_PROJECT_CONTINUATION_TERMINAL',
      actionId: RECOVERY_ACTION_ID,
      status: 'OWNER_AUTHORIZED_SCOPE_COMPLETE',
      completedAt: new Date().toISOString(),
      gitHead,
      projectRef: PR12_RECOVERY_TARGET.projectRef,
      completedCanonicalSteps: ['01', '02', '03', '04', '05', '06'],
      blockedCanonicalStep: null,
      nextCanonicalStep: '07',
      nextCanonicalStepAuthorized: false,
      step01EvidenceSha256: evidence.evidenceSha256,
      step02EvidenceSha256: replay.evidenceSha256,
      step03EvidenceSha256: fixtureResult.evidence.evidenceSha256,
      step04EvidenceSha256: types.evidenceSha256,
      step05EvidenceSha256: advisor.evidenceSha256,
      step06EvidenceSha256: smoke.evidenceSha256,
      newProjectPostAttemptCount: 0,
      productionContactCount: 0,
      secretValuesCaptured: false,
    };
    const terminal = {
      ...terminalWithoutHash,
      terminalSha256: sha256Canonical(terminalWithoutHash),
    };
    const terminalPath = path.join(paths.recoveryJournal, TERMINAL_FILE);
    writeCanonicalCreateNew(
      terminalPath,
      terminal,
      'RECOVERY_TERMINAL_CREATE_FAILED'
    );
    hardenPath(repositoryRoot, terminalPath, 'FILE');
    process.stdout.write(
      `${canonicalJson({
        step: '06',
        canonicalStep: 'all role smoke',
        result: 'PASS',
        nextStep: '07',
        nextStepAuthorized: false,
        evidenceSha256: smoke.evidenceSha256,
      })}\n`
    );
    return;
  } finally {
    if (fixtureResult !== null) {
      for (const actorId of Object.keys(fixtureResult.actorPasswords)) {
        fixtureResult.actorPasswords[actorId] = '';
      }
    }
    managementAccessToken = '';
    databasePassword = '';
  }
}

main().catch(error => {
  const code =
    error instanceof RecoveryExecutionError ||
    (error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message))
      ? error.message
      : 'UNEXPECTED_RECOVERY_FAILURE';
  if (recoveryFailureContext !== null) {
    try {
      const context = recoveryFailureContext;
      const step01Path = path.join(
        context.evidenceDirectory,
        STEP01_EVIDENCE_FILE
      );
      const step01EvidenceAlreadyExisted = existsSync(step01Path);
      if (!step01EvidenceAlreadyExisted) {
        const blockedWithoutHash = {
          schemaVersion: 1,
          recordType: 'PR12_EXISTING_ISOLATED_PROJECT_RECOVERY_RESULT',
          canonicalStep: {
            step: '01',
            name: 'staging clone/isolated project',
          },
          status: 'BLOCK',
          reasonCode: code,
          startedAt: context.startedAt,
          completedAt: new Date().toISOString(),
          target: {
            projectRef: PR12_RECOVERY_TARGET.projectRef,
            organizationId: PR12_RECOVERY_TARGET.organizationId,
            region: PR12_RECOVERY_TARGET.region,
          },
          providerBodySha256: context.providerBodySha256,
          remoteContacts: {
            projectStateGetCount: context.projectStateGetCount,
            computeAddonGetCount: context.computeAddonGetCount,
            publicCaGetCount: context.publicCaGetCount,
            runtimeApiKeysGetCount: context.runtimeApiKeysGetCount,
            directDatabaseConnectionCount:
              context.directDatabaseConnectionCount,
            postCount: 0,
            retryCount: 0,
          },
          productionContactCount: 0,
          rawProviderBodiesRetained: false,
          rawPathsRetained: false,
          secretValuesCaptured: false,
        };
        const blocked = {
          ...blockedWithoutHash,
          evidenceSha256: sha256Canonical(blockedWithoutHash),
        };
        writeCanonicalCreateNew(
          step01Path,
          blocked,
          'BLOCK_EVIDENCE_CREATE_FAILED'
        );
        hardenPath(context.repositoryRoot, step01Path, 'FILE');
      }
      const canonicalArtifacts = [
        ['01', 'staging clone/isolated project', STEP01_EVIDENCE_FILE],
        ['02', 'full migration replay', STEP02_EVIDENCE_FILE],
        [
          '03',
          'anonymized/representative data validation',
          STEP03_EVIDENCE_FILE,
        ],
        ['04', 'types parity', STEP04_EVIDENCE_FILE],
        ['05', 'advisor scan', STEP05_EVIDENCE_FILE],
        ['06', 'all role smoke', STEP06_EVIDENCE_FILE],
      ];
      const completedCanonicalSteps = [];
      let blockedCanonicalStep = null;
      for (const [step, name, filename] of canonicalArtifacts) {
        const artifactPath = path.join(context.evidenceDirectory, filename);
        if (!existsSync(artifactPath)) {
          blockedCanonicalStep = step;
          const blockWithoutHash = {
            schemaVersion: 1,
            recordType: 'PR12_CANONICAL_STEP_BLOCK_RESULT',
            canonicalStep: { step, name },
            status: 'BLOCK',
            reasonCode: code,
            completedAt: new Date().toISOString(),
            projectRef: PR12_RECOVERY_TARGET.projectRef,
            runtimeApiKeysGetCount: context.runtimeApiKeysGetCount,
            productionContactCount: 0,
            rawOutputsRetained: false,
            secretValuesCaptured: false,
          };
          const block = {
            ...blockWithoutHash,
            evidenceSha256: sha256Canonical(blockWithoutHash),
          };
          writeCanonicalCreateNew(
            artifactPath,
            block,
            'CANONICAL_BLOCK_EVIDENCE_CREATE_FAILED'
          );
          hardenPath(context.repositoryRoot, artifactPath, 'FILE');
          break;
        }
        const artifact = readCanonicalJson(
          artifactPath,
          'CANONICAL_EVIDENCE_INVALID'
        ).value;
        if (artifact.status === 'PASS') {
          completedCanonicalSteps.push(step);
          continue;
        }
        blockedCanonicalStep = step;
        break;
      }
      const terminalPath = path.join(context.journalDirectory, TERMINAL_FILE);
      if (!existsSync(terminalPath)) {
        const terminalWithoutHash = {
          schemaVersion: 1,
          recordType: 'PR12_EXISTING_PROJECT_CONTINUATION_TERMINAL',
          actionId: RECOVERY_ACTION_ID,
          status: 'BLOCK',
          reasonCode: code,
          completedAt: new Date().toISOString(),
          gitHead: context.gitHead,
          projectRef: PR12_RECOVERY_TARGET.projectRef,
          completedCanonicalSteps,
          blockedCanonicalStep: blockedCanonicalStep ?? '01',
          newProjectPostAttemptCount: 0,
          productionContactCount: 0,
          secretValuesCaptured: false,
        };
        const terminal = {
          ...terminalWithoutHash,
          terminalSha256: sha256Canonical(terminalWithoutHash),
        };
        writeCanonicalCreateNew(
          terminalPath,
          terminal,
          'BLOCK_TERMINAL_CREATE_FAILED'
        );
        hardenPath(context.repositoryRoot, terminalPath, 'FILE');
      }
    } catch {
      // Preserve the original fail-closed reason on stderr.
    }
  }
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
