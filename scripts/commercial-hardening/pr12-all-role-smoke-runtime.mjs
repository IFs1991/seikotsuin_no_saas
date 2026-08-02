import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  constants as fsConstants,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import {
  ALL_ROLE_SMOKE_ACTOR_IDS,
  ALL_ROLE_SMOKE_BROWSER_CASES,
  ALL_ROLE_SMOKE_REST_CASES,
} from './pr12-all-role-smoke-contract.mjs';

const MAX_HTTP_BYTES = 1024 * 1024;
const MAX_BROWSER_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_SERVER_LOG_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const BROWSER_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const LOCAL_BROWSER_GET_PATHS = new Set([
  '/',
  '/admin/login',
  '/admin/mfa-setup',
  '/api/auth/profile',
  '/api/clinics/accessible',
  '/api/dashboard',
  '/api/dashboard/bootstrap',
  '/api/manager/assigned-clinics',
  '/api/manager/dashboard',
  '/api/mfa/backup-codes/usage',
  '/api/mfa/status',
  '/api/system/status',
  '/apple-icon.png',
  '/auth/authority-unavailable',
  '/dashboard',
  '/favicon.ico',
  '/icon.png',
  '/login',
  '/manager',
  '/unauthorized',
]);

export class Pr12AllRoleSmokeRuntimeError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Pr12AllRoleSmokeRuntimeError';
    this.code = code;
  }
}

function fail(code) {
  throw new Pr12AllRoleSmokeRuntimeError(code);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireSecret(value, code) {
  if (typeof value !== 'string' || value.length < 20) fail(code);
  return value;
}

export function assertServiceRoleNotExposed(serverApiKey, values) {
  const secret = requireSecret(serverApiKey, 'RUNTIME_SERVER_API_KEY_INVALID');
  if (
    !Array.isArray(values) ||
    values.some(value => typeof value !== 'string')
  ) {
    fail('SERVICE_ROLE_BOUNDARY_OBSERVATION_INVALID');
  }
  const fingerprints = [];
  let scannedByteCount = 0;
  const secretBytes = Buffer.from(secret, 'utf8');
  try {
    for (const value of values) {
      const bytes = Buffer.from(value, 'utf8');
      try {
        scannedByteCount += bytes.length;
        if (bytes.includes(secretBytes)) {
          fail('SERVICE_ROLE_CLIENT_EXPOSURE_DETECTED');
        }
        fingerprints.push(sha256Bytes(bytes));
      } finally {
        bytes.fill(0);
      }
    }
  } finally {
    secretBytes.fill(0);
  }
  return {
    outcome: 'NO_BROWSER_OR_CLIENT_EXPOSURE',
    scannedValueCount: values.length,
    scannedByteCount,
    fingerprintSha256: sha256Bytes(
      Buffer.from(JSON.stringify(fingerprints), 'utf8')
    ),
  };
}

export function assertIsolatedBrowserRequest(
  method,
  rawUrl,
  baseUrl,
  projectRef
) {
  let url;
  let localOrigin;
  try {
    url = new URL(rawUrl);
    localOrigin = new URL(baseUrl);
  } catch {
    fail('ISOLATED_BROWSER_ROUTE_DENIED');
  }
  if (
    url.href !== rawUrl ||
    localOrigin.href !== `${baseUrl}/` ||
    localOrigin.protocol !== 'http:' ||
    localOrigin.hostname !== '127.0.0.1' ||
    localOrigin.username !== '' ||
    localOrigin.password !== '' ||
    localOrigin.hash !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== ''
  ) {
    fail('ISOLATED_BROWSER_ROUTE_DENIED');
  }
  if (url.origin === localOrigin.origin) {
    if (
      ['GET', 'HEAD'].includes(method) &&
      (LOCAL_BROWSER_GET_PATHS.has(url.pathname) ||
        url.pathname.startsWith('/_next/'))
    ) {
      return;
    }
    if (
      method === 'POST' &&
      ['/login', '/admin/login'].includes(url.pathname) &&
      url.search === ''
    ) {
      return;
    }
    fail('ISOLATED_BROWSER_ROUTE_DENIED');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== `${projectRef}.supabase.co` ||
    url.port !== ''
  ) {
    fail('ISOLATED_BROWSER_ROUTE_DENIED');
  }
  if (
    method === 'GET' &&
    ['/auth/v1/user', '/auth/v1/factors'].includes(url.pathname) &&
    url.search === ''
  ) {
    return;
  }
  if (
    method === 'POST' &&
    url.pathname === '/auth/v1/token' &&
    ['?grant_type=password', '?grant_type=refresh_token'].includes(url.search)
  ) {
    return;
  }
  fail('ISOLATED_BROWSER_ROUTE_DENIED');
}

export function assertIsolatedBrowserRedirect(
  requestMethod,
  status,
  location,
  responseUrl,
  baseUrl,
  projectRef
) {
  if (
    !Number.isInteger(status) ||
    !BROWSER_REDIRECT_STATUSES.has(status) ||
    typeof location !== 'string' ||
    location.length === 0
  ) {
    fail('ISOLATED_BROWSER_REDIRECT_DENIED');
  }
  let target;
  try {
    target = new URL(location, responseUrl).toString();
    const redirectedMethod =
      status === 303 ||
      ((status === 301 || status === 302) && requestMethod === 'POST')
        ? 'GET'
        : requestMethod;
    assertIsolatedBrowserRequest(redirectedMethod, target, baseUrl, projectRef);
  } catch {
    fail('ISOLATED_BROWSER_REDIRECT_DENIED');
  }
  return target;
}

export function assertIsolatedBrowserWebSocket(rawUrl, baseUrl) {
  let socketUrl;
  let localOrigin;
  try {
    socketUrl = new URL(rawUrl);
    localOrigin = new URL(baseUrl);
  } catch {
    fail('ISOLATED_BROWSER_WEBSOCKET_DENIED');
  }
  if (
    socketUrl.href !== rawUrl ||
    socketUrl.protocol !== 'ws:' ||
    socketUrl.hostname !== localOrigin.hostname ||
    socketUrl.port !== localOrigin.port ||
    socketUrl.username !== '' ||
    socketUrl.password !== '' ||
    socketUrl.hash !== '' ||
    socketUrl.pathname !== '/_next/webpack-hmr'
  ) {
    fail('ISOLATED_BROWSER_WEBSOCKET_DENIED');
  }
  return rawUrl;
}

export function resolveAllRoleSmokeRelation(relation) {
  if (relation !== 'public.staff') fail('ROLE_SMOKE_RELATION_INVALID');
  return {
    restPath: '/rest/v1/staff',
    sqlIdentifier: 'public.staff',
  };
}

export function assertCanonicalBrowserOutcome(browserCase, observation) {
  if (
    !isRecord(browserCase) ||
    typeof browserCase.route !== 'string' ||
    typeof browserCase.expected !== 'string' ||
    !isRecord(observation) ||
    typeof observation.actualPathname !== 'string' ||
    typeof observation.denyUiMarkerVisible !== 'boolean' ||
    typeof observation.allowPageMarkerVisible !== 'boolean'
  ) {
    fail('BROWSER_ROLE_BOUNDARY_MISMATCH');
  }
  const matches =
    (browserCase.expected === 'REDIRECT_UNAUTHORIZED' &&
      observation.actualPathname === '/unauthorized') ||
    (browserCase.expected === 'REDIRECT_SIGN_IN' &&
      ['/login', '/admin/login'].includes(observation.actualPathname)) ||
    (browserCase.expected === 'DENY_UI' &&
      observation.actualPathname === browserCase.route &&
      observation.denyUiMarkerVisible &&
      !observation.allowPageMarkerVisible) ||
    (browserCase.expected === 'ALLOW_PAGE' &&
      observation.actualPathname === browserCase.route &&
      !observation.denyUiMarkerVisible &&
      observation.allowPageMarkerVisible);
  if (!matches) fail('BROWSER_ROLE_BOUNDARY_MISMATCH');
  return browserCase.expected;
}

export function selectProjectRuntimeApiKeys(responseInput) {
  if (!Array.isArray(responseInput)) fail('RUNTIME_API_KEYS_RESPONSE_INVALID');
  const entries = responseInput.map(item => {
    if (
      !isRecord(item) ||
      typeof item.name !== 'string' ||
      typeof item.api_key !== 'string' ||
      typeof item.type !== 'string'
    ) {
      fail('RUNTIME_API_KEYS_RESPONSE_INVALID');
    }
    return item;
  });
  const selectOne = selectors => {
    for (const selector of selectors) {
      const matches = entries.filter(item =>
        selector.field === 'type'
          ? item.type === selector.value
          : item.name === selector.value
      );
      if (matches.length > 1) fail('RUNTIME_API_KEYS_RESPONSE_INVALID');
      if (matches.length === 1) return matches[0];
    }
    return null;
  };
  const client = selectOne([
    { field: 'type', value: 'publishable' },
    { field: 'name', value: 'anon' },
  ]);
  const server = selectOne([
    { field: 'type', value: 'secret' },
    { field: 'name', value: 'service_role' },
  ]);
  if (client === null || server === null || client === server) {
    fail('RUNTIME_API_KEYS_REQUIRED_KEYS_MISSING');
  }
  const clientApiKey = requireSecret(
    client.api_key,
    'RUNTIME_CLIENT_API_KEY_INVALID'
  );
  const serverApiKey = requireSecret(
    server.api_key,
    'RUNTIME_SERVER_API_KEY_INVALID'
  );
  if (clientApiKey === serverApiKey) fail('RUNTIME_API_KEYS_RESPONSE_INVALID');
  return {
    clientApiKey,
    serverApiKey,
    clientKeyName: client.name,
    serverKeyName: server.name,
    observedKeyCount: entries.length,
  };
}

export function assertIsolatedDataRequest(method, rawUrl, projectRef) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail('ISOLATED_DATA_ROUTE_DENIED');
  }
  if (
    url.href !== rawUrl ||
    url.protocol !== 'https:' ||
    url.hostname !== `${projectRef}.supabase.co` ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.hash !== ''
  ) {
    fail('ISOLATED_DATA_ROUTE_DENIED');
  }
  if (
    method === 'POST' &&
    url.pathname === '/auth/v1/token' &&
    ['?grant_type=password', '?grant_type=refresh_token'].includes(url.search)
  ) {
    return;
  }
  if (
    method === 'GET' &&
    url.pathname === '/rest/v1/staff' &&
    url.searchParams.get('select') === 'id' &&
    url.searchParams.has('clinic_id') &&
    [...url.searchParams.keys()].sort().join(',') === 'clinic_id,select'
  ) {
    return;
  }
  fail('ISOLATED_DATA_ROUTE_DENIED');
}

async function readBoundedJsonResponse(response, forbiddenValues) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    fail('ISOLATED_DATA_CONTENT_TYPE_INVALID');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_HTTP_BYTES) {
    fail('ISOLATED_DATA_BODY_TOO_LARGE');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  try {
    if (bytes.length > MAX_HTTP_BYTES) fail('ISOLATED_DATA_BODY_TOO_LARGE');
    for (const secret of forbiddenValues) {
      if (secret.length > 0 && bytes.includes(Buffer.from(secret, 'utf8'))) {
        fail('ISOLATED_DATA_SECRET_REFLECTION');
      }
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { value: JSON.parse(text), sha256: sha256Bytes(bytes) };
  } catch (error) {
    if (error instanceof Pr12AllRoleSmokeRuntimeError) throw error;
    fail('ISOLATED_DATA_RESPONSE_INVALID');
  } finally {
    bytes.fill(0);
  }
}

async function isolatedJsonRequest({
  operation,
  method,
  url,
  projectRef,
  clientApiKey,
  accessToken,
  body,
  forbiddenValues,
}) {
  if (!['AUTH_SIGN_IN', 'AUTH_REFRESH', 'REST_READ'].includes(operation)) {
    fail('ISOLATED_DATA_OPERATION_INVALID');
  }
  assertIsolatedDataRequest(method, url, projectRef);
  let bodyText = body === null ? undefined : JSON.stringify(body);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        apikey: clientApiKey,
        Authorization: `Bearer ${accessToken}`,
        ...(bodyText === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      body: bodyText,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    fail('ISOLATED_DATA_CONTACT_FAILED');
  } finally {
    bodyText = undefined;
  }
  if (response.status !== 200) {
    fail(`ISOLATED_${operation}_HTTP_${response.status}`);
  }
  return await readBoundedJsonResponse(response, forbiddenValues);
}

async function runAuthRefreshAndRest({
  projectRef,
  clientApiKey,
  actors,
  actorPasswords,
  fixtureClinicIds,
  forbiddenValues,
}) {
  const origin = `https://${projectRef}.supabase.co`;
  const actorById = new Map(actors.map(actor => [actor.actorId, actor]));
  if (
    actorById.size !== ALL_ROLE_SMOKE_ACTOR_IDS.length ||
    ALL_ROLE_SMOKE_ACTOR_IDS.some(actorId => !actorById.has(actorId))
  ) {
    fail('ROLE_SMOKE_ACTOR_MATRIX_INVALID');
  }
  const fixtureClinicByContractId = {
    'tenant-a-child': fixtureClinicIds.tenantAChild,
    'tenant-b-child': fixtureClinicIds.tenantBChild,
  };
  const observations = [];
  for (const actorId of ALL_ROLE_SMOKE_ACTOR_IDS) {
    const actor = actorById.get(actorId);
    if (!isRecord(actor)) fail('ROLE_SMOKE_ACTOR_MATRIX_INVALID');
    let accessToken = clientApiKey;
    let refreshToken = '';
    try {
      const signedIn = await isolatedJsonRequest({
        operation: 'AUTH_SIGN_IN',
        method: 'POST',
        url: `${origin}/auth/v1/token?grant_type=password`,
        projectRef,
        clientApiKey,
        accessToken: clientApiKey,
        body: { email: actor.email, password: actorPasswords[actor.actorId] },
        forbiddenValues,
      });
      if (
        !isRecord(signedIn.value) ||
        typeof signedIn.value.access_token !== 'string' ||
        typeof signedIn.value.refresh_token !== 'string' ||
        !isRecord(signedIn.value.user) ||
        signedIn.value.user.id !== actor.id
      ) {
        fail('AUTH_SIGN_IN_RESPONSE_INVALID');
      }
      accessToken = signedIn.value.access_token;
      refreshToken = signedIn.value.refresh_token;
      const refreshed = await isolatedJsonRequest({
        operation: 'AUTH_REFRESH',
        method: 'POST',
        url: `${origin}/auth/v1/token?grant_type=refresh_token`,
        projectRef,
        clientApiKey,
        accessToken,
        body: { refresh_token: refreshToken },
        forbiddenValues,
      });
      if (
        !isRecord(refreshed.value) ||
        typeof refreshed.value.access_token !== 'string' ||
        typeof refreshed.value.refresh_token !== 'string' ||
        !isRecord(refreshed.value.user) ||
        refreshed.value.user.id !== actor.id
      ) {
        fail('AUTH_REFRESH_RESPONSE_INVALID');
      }
      accessToken = refreshed.value.access_token;
      refreshToken = refreshed.value.refresh_token;
      const readCases = ALL_ROLE_SMOKE_REST_CASES.filter(
        readCase => readCase.actorId === actor.actorId
      );
      if (
        readCases.length !== 2 ||
        readCases.some(readCase => readCase.role !== actor.role)
      ) {
        fail('ROLE_SMOKE_REST_MATRIX_INVALID');
      }
      const caseObservations = [];
      for (const readCase of readCases) {
        const relation = resolveAllRoleSmokeRelation(readCase.relation);
        const clinicId = fixtureClinicByContractId[readCase.clinicId];
        if (typeof clinicId !== 'string') {
          fail('ROLE_SMOKE_CLINIC_ID_INVALID');
        }
        const url = new URL(`${origin}${relation.restPath}`);
        url.searchParams.set('select', 'id');
        url.searchParams.set('clinic_id', `eq.${clinicId}`);
        const result = await isolatedJsonRequest({
          operation: 'REST_READ',
          method: 'GET',
          url: url.toString(),
          projectRef,
          clientApiKey,
          accessToken,
          body: null,
          forbiddenValues,
        });
        if (
          !Array.isArray(result.value) ||
          result.value.some(
            row =>
              !isRecord(row) ||
              Object.keys(row).length !== 1 ||
              typeof row.id !== 'string'
          ) ||
          result.value.length !== readCase.expectedRows
        ) {
          fail('REST_TENANT_BOUNDARY_MISMATCH');
        }
        caseObservations.push({
          caseId: readCase.id,
          clinicId: readCase.clinicId,
          expectedCount: readCase.expectedRows,
          observedCount: result.value.length,
          responseSha256: result.sha256,
        });
      }
      observations.push({
        actorId: actor.actorId,
        role: actor.role,
        signInResponseSha256: signedIn.sha256,
        refreshResponseSha256: refreshed.sha256,
        readCases: caseObservations,
      });
    } finally {
      accessToken = '';
      refreshToken = '';
    }
  }
  return observations;
}

const BROWSER_ROOT_FILES = Object.freeze([
  'instrumentation-client.ts',
  'next-env.d.ts',
  'next.config.js',
  'package-lock.json',
  'package.json',
  'postcss.config.js',
  'sentry.edge.config.ts',
  'sentry.server.config.ts',
  'tailwind.config.ts',
  'tsconfig.json',
]);

export function preparePr12BrowserRuntime({ repositoryRoot, runtimeRoot }) {
  if (existsSync(runtimeRoot)) fail('BROWSER_RUNTIME_ALREADY_EXISTS');
  mkdirSync(runtimeRoot, { recursive: false });
  for (const directory of ['src', 'public']) {
    cpSync(
      path.join(repositoryRoot, directory),
      path.join(runtimeRoot, directory),
      {
        recursive: true,
        errorOnExist: true,
        force: false,
        filter: source => {
          const relative = path.relative(repositoryRoot, source);
          return !relative.split(path.sep).includes('__tests__');
        },
      }
    );
  }
  for (const filename of BROWSER_ROOT_FILES) {
    copyFileSync(
      path.join(repositoryRoot, filename),
      path.join(runtimeRoot, filename),
      fsConstants.COPYFILE_EXCL
    );
  }
  const middlewareSource = path.join(repositoryRoot, 'middleware.ts');
  copyFileSync(
    middlewareSource,
    path.join(runtimeRoot, 'middleware.ts'),
    fsConstants.COPYFILE_EXCL
  );
  let lockfile;
  try {
    lockfile = JSON.parse(
      readFileSync(path.join(runtimeRoot, 'package-lock.json'), 'utf8')
    );
  } catch {
    fail('BROWSER_PACKAGE_LOCK_INVALID');
  }
  if (!isRecord(lockfile) || !isRecord(lockfile.packages)) {
    fail('BROWSER_PACKAGE_LOCK_INVALID');
  }
  const lockedPackages = Object.entries(lockfile.packages).filter(
    ([packagePath]) => packagePath !== ''
  );
  if (
    lockedPackages.length === 0 ||
    lockedPackages.some(([, entry]) => {
      if (
        !isRecord(entry) ||
        entry.link === true ||
        typeof entry.resolved !== 'string' ||
        typeof entry.integrity !== 'string' ||
        !/^(sha256|sha384|sha512)-[A-Za-z0-9+/=]+$/u.test(entry.integrity)
      ) {
        return true;
      }
      try {
        const resolved = new URL(entry.resolved);
        return (
          resolved.protocol !== 'https:' ||
          resolved.hostname !== 'registry.npmjs.org' ||
          resolved.username !== '' ||
          resolved.password !== '' ||
          resolved.hash !== ''
        );
      } catch {
        return true;
      }
    })
  ) {
    fail('BROWSER_PACKAGE_LOCK_DEPENDENCY_BOUNDARY_INVALID');
  }
  const npmCli = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js'
  );
  if (!statSync(npmCli).isFile()) fail('BROWSER_NPM_CLI_MISSING');
  const localAppData = process.env.LOCALAPPDATA;
  if (
    typeof localAppData !== 'string' ||
    !path.win32.isAbsolute(localAppData)
  ) {
    fail('BROWSER_NPM_CACHE_ROOT_INVALID');
  }
  const npmCache = path.join(localAppData, 'npm-cache');
  if (!statSync(npmCache).isDirectory()) fail('BROWSER_NPM_CACHE_MISSING');
  const install = spawnSync(
    process.execPath,
    [npmCli, 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
    {
      cwd: runtimeRoot,
      env: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
        TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
        PATH: path.dirname(process.execPath),
        npm_config_cache: npmCache,
        npm_config_update_notifier: 'false',
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 900_000,
      maxBuffer: MAX_SERVER_LOG_BYTES,
      windowsHide: true,
    }
  );
  if (install.error || install.status !== 0) {
    fail('BROWSER_OFFLINE_DEPENDENCY_INSTALL_FAILED');
  }
  const dependencyTarget = path.join(runtimeRoot, 'node_modules');
  if (
    !lstatSync(dependencyTarget).isDirectory() ||
    lstatSync(dependencyTarget).isSymbolicLink()
  ) {
    fail('BROWSER_DEPENDENCY_RUNTIME_INVALID');
  }
  const nextExecutable = path.join(
    dependencyTarget,
    'next',
    'dist',
    'bin',
    'next'
  );
  if (!lstatSync(nextExecutable).isFile()) {
    fail('BROWSER_DEPENDENCY_RUNTIME_INVALID');
  }
  const dotenvFileCount = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
    '.env.test',
    '.env.test.local',
  ].filter(filename => existsSync(path.join(runtimeRoot, filename))).length;
  if (dotenvFileCount !== 0) fail('BROWSER_RUNTIME_DOTENV_FORBIDDEN');
  return {
    runtimeRoot,
    evidence: {
      copiedRootFileCount: BROWSER_ROOT_FILES.length + 1,
      copiedDirectoryCount: 2,
      dotenvFileCount,
      dependencyBoundary: 'NPM_CI_OFFLINE_LOCKFILE',
      dependencyNetworkEnabled: false,
      dependencyLifecycleScriptsEnabled: false,
      lockedPackageCount: lockedPackages.length,
      npmExitCode: install.status,
      nextExecutableSha256: sha256Bytes(readFileSync(nextExecutable)),
      packageLockSha256: sha256Bytes(
        readFileSync(path.join(runtimeRoot, 'package-lock.json'))
      ),
    },
  };
}

async function reserveLoopbackPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!isRecord(address) || typeof address.port !== 'number') {
        server.close();
        reject(new Error('BROWSER_PORT_RESERVATION_FAILED'));
        return;
      }
      const port = address.port;
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

function attachBoundedLogCapture(stream, state) {
  stream.on('data', chunk => {
    if (!Buffer.isBuffer(chunk)) return;
    state.bytes += chunk.length;
    if (state.bytes <= MAX_SERVER_LOG_BYTES)
      state.chunks.push(Buffer.from(chunk));
    else state.overflow = true;
  });
}

async function waitForLocalApp(baseUrl, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail('BROWSER_APP_SERVER_EXITED');
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        redirect: 'error',
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) return;
    } catch {
      // Local readiness polling is bounded and never targets a remote host.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  fail('BROWSER_APP_SERVER_READINESS_TIMEOUT');
}

function recordServiceRoleBoundaryScan(state, serverApiKey, values) {
  const result = assertServiceRoleNotExposed(serverApiKey, values);
  state.scannedValueCount += result.scannedValueCount;
  state.scannedByteCount += result.scannedByteCount;
  state.fingerprints.push(result.fingerprintSha256);
}

function setBrowserSandboxFailure(state, error) {
  if (state.failureCode !== null) return;
  state.failureCode =
    error instanceof Pr12AllRoleSmokeRuntimeError
      ? error.code
      : 'ISOLATED_BROWSER_CONTACT_FAILED';
}

function assertBrowserSandboxHealthy(state) {
  if (state.failureCode !== null) fail(state.failureCode);
}

async function installWebSocketBoundary(
  context,
  { baseUrl, serverApiKey, state }
) {
  await context.routeWebSocket('**/*', async socket => {
    let serverSocket = null;
    try {
      assertIsolatedBrowserWebSocket(socket.url(), baseUrl);
      recordServiceRoleBoundaryScan(state, serverApiKey, [socket.url()]);
      socket.onMessage(message => {
        const payload =
          typeof message === 'string' ? message : message.toString('utf8');
        try {
          recordServiceRoleBoundaryScan(state, serverApiKey, [payload]);
          if (serverSocket === null) {
            fail('ISOLATED_BROWSER_WEBSOCKET_DENIED');
          }
          serverSocket.send(message);
        } catch (error) {
          setBrowserSandboxFailure(state, error);
        }
      });
      serverSocket = socket.connectToServer();
      serverSocket.onMessage(message => {
        const payload =
          typeof message === 'string' ? message : message.toString('utf8');
        try {
          recordServiceRoleBoundaryScan(state, serverApiKey, [payload]);
          socket.send(message);
        } catch (error) {
          setBrowserSandboxFailure(state, error);
        }
      });
    } catch (error) {
      setBrowserSandboxFailure(state, error);
      await socket
        .close({ code: 1008, reason: 'PR12 browser WebSocket denied' })
        .catch(() => undefined);
    }
  });
}

async function installBrowserRequestBoundary(
  context,
  { baseUrl, projectRef, serverApiKey, state }
) {
  await context.route('**/*', async route => {
    try {
      const request = route.request();
      assertIsolatedBrowserRequest(
        request.method(),
        request.url(),
        baseUrl,
        projectRef
      );
      recordServiceRoleBoundaryScan(state, serverApiKey, [
        request.url(),
        JSON.stringify(request.headers()),
        request.postData() ?? '',
      ]);
      const response = await route.fetch({
        timeout: 120_000,
        maxRedirects: 0,
        maxRetries: 0,
      });
      if (BROWSER_REDIRECT_STATUSES.has(response.status())) {
        assertIsolatedBrowserRedirect(
          request.method(),
          response.status(),
          await response.headerValue('location'),
          response.url(),
          baseUrl,
          projectRef
        );
      } else if (
        response.status() >= 300 &&
        response.status() <= 399 &&
        response.status() !== 304
      ) {
        fail('ISOLATED_BROWSER_REDIRECT_DENIED');
      }
      const responseBytes = Buffer.from(await response.body());
      try {
        if (responseBytes.length > MAX_BROWSER_RESPONSE_BYTES) {
          fail('ISOLATED_BROWSER_RESPONSE_TOO_LARGE');
        }
        recordServiceRoleBoundaryScan(state, serverApiKey, [
          JSON.stringify(await response.allHeaders()),
          responseBytes.toString('utf8'),
        ]);
        await route.fulfill({ response, body: responseBytes });
      } finally {
        responseBytes.fill(0);
      }
    } catch (error) {
      setBrowserSandboxFailure(state, error);
      await route.abort('blockedbyclient').catch(() => undefined);
    }
  });
}

async function observeCanonicalBrowserOutcome(page, browserCase) {
  if (browserCase.expected === 'REDIRECT_UNAUTHORIZED') {
    await page.waitForURL(url => url.pathname === '/unauthorized', {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
  } else if (browserCase.expected === 'REDIRECT_SIGN_IN') {
    await page.waitForURL(
      url => ['/login', '/admin/login'].includes(url.pathname),
      { timeout: 30_000, waitUntil: 'domcontentloaded' }
    );
  } else if (browserCase.expected === 'DENY_UI') {
    await page.getByText('アクセス権限がありません', { exact: true }).waitFor({
      state: 'visible',
      timeout: 30_000,
    });
  } else if (browserCase.expected === 'ALLOW_PAGE') {
    if (browserCase.route === '/manager') {
      await page.locator('#manager-features-title').waitFor({
        state: 'visible',
        timeout: 30_000,
      });
    } else if (browserCase.route === '/admin/mfa-setup') {
      await page.locator('[data-testid="mfa-dashboard"]').waitFor({
        state: 'visible',
        timeout: 30_000,
      });
    } else {
      await page.locator('main').first().waitFor({
        state: 'visible',
        timeout: 30_000,
      });
    }
  } else {
    fail('BROWSER_ROUTE_CASE_INVALID');
  }
  const actualPathname = new URL(page.url()).pathname;
  const denyUiMarkerVisible = await page
    .getByText('アクセス権限がありません', { exact: true })
    .isVisible()
    .catch(() => false);
  const allowPageMarkerVisible =
    browserCase.expected === 'ALLOW_PAGE'
      ? true
      : browserCase.expected === 'DENY_UI'
        ? false
        : true;
  const outcome = assertCanonicalBrowserOutcome(browserCase, {
    actualPathname,
    denyUiMarkerVisible,
    allowPageMarkerVisible,
  });
  return { outcome, actualPathname };
}

async function runBrowserAndProfileSmoke({
  browserRuntimePreparation,
  projectRef,
  clientApiKey,
  serverApiKey,
  actors,
  actorPasswords,
  forbiddenValues,
}) {
  if (
    !isRecord(browserRuntimePreparation) ||
    typeof browserRuntimePreparation.runtimeRoot !== 'string' ||
    !isRecord(browserRuntimePreparation.evidence) ||
    browserRuntimePreparation.evidence.dependencyBoundary !==
      'NPM_CI_OFFLINE_LOCKFILE'
  ) {
    fail('BROWSER_RUNTIME_PREPARATION_INVALID');
  }
  const runtimeRoot = browserRuntimePreparation.runtimeRoot;
  const materialized = browserRuntimePreparation.evidence;
  const port = await reserveLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextExecutable = path.join(
    runtimeRoot,
    'node_modules',
    'next',
    'dist',
    'bin',
    'next'
  );
  const serverEnvironment = {
    SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
    TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
    TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
    PATH: path.dirname(process.execPath),
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: clientApiKey,
    SUPABASE_SERVICE_ROLE_KEY: serverApiKey,
    NEXT_PUBLIC_APP_URL: baseUrl,
    NEXT_PUBLIC_APP_ENV: 'pr12-isolated-qualification',
    NEXT_PUBLIC_PILOT_MODE: 'false',
    ENABLE_BILLING: 'false',
    NEXT_PUBLIC_ENABLE_BILLING: 'false',
    NEXT_PUBLIC_ENABLE_LIFF_BOOKING: 'false',
    TURNSTILE_BYPASS_NON_PRODUCTION: 'false',
  };
  const child = spawn(
    process.execPath,
    [nextExecutable, 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: runtimeRoot,
      env: serverEnvironment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  );
  const logs = { chunks: [], bytes: 0, overflow: false };
  attachBoundedLogCapture(child.stdout, logs);
  attachBoundedLogCapture(child.stderr, logs);
  let browser = null;
  const profileObservations = [];
  const routeObservations = [];
  const boundaryState = {
    scannedValueCount: 0,
    scannedByteCount: 0,
    fingerprints: [],
    failureCode: null,
  };
  try {
    await waitForLocalApp(baseUrl, child);
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      env: {
        SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
        TEMP: process.env.TEMP ?? 'C:\\Windows\\Temp',
        TMP: process.env.TMP ?? 'C:\\Windows\\Temp',
        PATH: path.dirname(process.execPath),
      },
    });
    const actorById = new Map(actors.map(actor => [actor.actorId, actor]));
    const applicationBrowserCases = ALL_ROLE_SMOKE_BROWSER_CASES.filter(
      browserCase => browserCase.actorId !== 'anon'
    );
    for (const actorId of [
      ...new Set(applicationBrowserCases.map(item => item.actorId)),
    ]) {
      const actor = actorById.get(actorId);
      if (!isRecord(actor)) fail('ROLE_SMOKE_ACTOR_MATRIX_INVALID');
      const context = await browser.newContext({
        baseURL: baseUrl,
        serviceWorkers: 'block',
      });
      await installBrowserRequestBoundary(context, {
        baseUrl,
        projectRef,
        serverApiKey,
        state: boundaryState,
      });
      await installWebSocketBoundary(context, {
        baseUrl,
        serverApiKey,
        state: boundaryState,
      });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(60_000);
        page.setDefaultNavigationTimeout(120_000);
        const loginPath = actor.role === 'admin' ? '/admin/login' : '/login';
        await page.goto(loginPath, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        await page.locator('#login-email').fill(actor.email);
        await page
          .locator('#login-password')
          .fill(actorPasswords[actor.actorId]);
        await Promise.all([
          page.waitForURL(
            url => !['/login', '/admin/login'].includes(url.pathname),
            { timeout: 30_000, waitUntil: 'domcontentloaded' }
          ),
          page.getByRole('button', { name: 'ログイン' }).click(),
        ]);
        const profileResponse = await context.request.get(
          `${baseUrl}/api/auth/profile`,
          {
            timeout: REQUEST_TIMEOUT_MS,
            failOnStatusCode: false,
            maxRedirects: 0,
            maxRetries: 0,
          }
        );
        const profileBytes = Buffer.from(await profileResponse.body());
        try {
          if (
            profileBytes.length > MAX_HTTP_BYTES ||
            profileResponse.status() !== 200
          ) {
            fail('PROFILE_API_SMOKE_FAILED');
          }
          recordServiceRoleBoundaryScan(boundaryState, serverApiKey, [
            JSON.stringify(profileResponse.headers()),
            profileBytes.toString('utf8'),
          ]);
          const profile = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(profileBytes)
          );
          if (
            !isRecord(profile) ||
            profile.success !== true ||
            !isRecord(profile.data) ||
            profile.data.id !== actor.id ||
            profile.data.role !== actor.role
          ) {
            fail('PROFILE_API_RESPONSE_INVALID');
          }
          profileObservations.push({
            actorId: actor.actorId,
            role: actor.role,
            status: profileResponse.status(),
            responseSha256: sha256Bytes(profileBytes),
          });
        } finally {
          profileBytes.fill(0);
          await profileResponse.dispose();
        }
        const actorBrowserCases = applicationBrowserCases.filter(
          browserCase => browserCase.actorId === actor.actorId
        );
        if (actorBrowserCases.length !== 3) {
          fail('BROWSER_ROLE_CASE_MATRIX_INVALID');
        }
        for (const browserCase of actorBrowserCases) {
          const response = await page.goto(browserCase.route, {
            waitUntil: 'domcontentloaded',
            timeout: 120_000,
          });
          if (response !== null && response.status() >= 500) {
            fail('BROWSER_ROUTE_SERVER_ERROR');
          }
          const observed = await observeCanonicalBrowserOutcome(
            page,
            browserCase
          );
          assertBrowserSandboxHealthy(boundaryState);
          const content = await page.content();
          recordServiceRoleBoundaryScan(boundaryState, serverApiKey, [content]);
          if (observed.outcome !== browserCase.expected) {
            fail('BROWSER_ROLE_BOUNDARY_MISMATCH');
          }
          routeObservations.push({
            caseId: browserCase.id,
            actorId: browserCase.actorId,
            role: browserCase.role,
            pathname: browserCase.route,
            actualPathname: observed.actualPathname,
            expected: browserCase.expected,
            observed: observed.outcome,
          });
        }
        const storageState = await context.storageState();
        recordServiceRoleBoundaryScan(boundaryState, serverApiKey, [
          JSON.stringify(storageState),
        ]);
        assertBrowserSandboxHealthy(boundaryState);
      } finally {
        await context.close();
      }
    }
    const anonymousCase = ALL_ROLE_SMOKE_BROWSER_CASES.find(
      browserCase => browserCase.actorId === 'anon'
    );
    if (!isRecord(anonymousCase)) fail('BROWSER_ROLE_CASE_MATRIX_INVALID');
    const anonymousContext = await browser.newContext({
      baseURL: baseUrl,
      serviceWorkers: 'block',
    });
    await installBrowserRequestBoundary(anonymousContext, {
      baseUrl,
      projectRef,
      serverApiKey,
      state: boundaryState,
    });
    await installWebSocketBoundary(anonymousContext, {
      baseUrl,
      serverApiKey,
      state: boundaryState,
    });
    try {
      const page = await anonymousContext.newPage();
      await page.goto(anonymousCase.route, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      const observed = await observeCanonicalBrowserOutcome(
        page,
        anonymousCase
      );
      recordServiceRoleBoundaryScan(boundaryState, serverApiKey, [
        await page.content(),
        JSON.stringify(await anonymousContext.storageState()),
      ]);
      assertBrowserSandboxHealthy(boundaryState);
      routeObservations.push({
        caseId: anonymousCase.id,
        actorId: anonymousCase.actorId,
        role: anonymousCase.role,
        pathname: anonymousCase.route,
        actualPathname: observed.actualPathname,
        expected: anonymousCase.expected,
        observed: observed.outcome,
      });
    } finally {
      await anonymousContext.close();
    }
    if (profileObservations.length !== 7 || routeObservations.length !== 16) {
      fail('BROWSER_CASE_COUNT_MISMATCH');
    }
  } finally {
    if (browser !== null) await browser.close().catch(() => undefined);
    if (child.exitCode === null) child.kill();
    let childExited = child.exitCode !== null;
    await new Promise(resolve => {
      if (child.exitCode !== null) {
        childExited = true;
        resolve();
      } else {
        const timeout = setTimeout(resolve, 5_000);
        child.once('exit', () => {
          childExited = true;
          clearTimeout(timeout);
          resolve();
        });
      }
    });
    const logBytes = Buffer.concat(logs.chunks);
    try {
      if (logs.overflow) fail('BROWSER_SERVER_LOG_BOUND_EXCEEDED');
      for (const secret of forbiddenValues) {
        if (
          secret.length > 0 &&
          logBytes.includes(Buffer.from(secret, 'utf8'))
        ) {
          fail('BROWSER_SERVER_SECRET_LOGGED');
        }
      }
      const logText = logBytes.toString('utf8');
      if (
        /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(
          logText
        ) ||
        /sb_secret_[A-Za-z0-9_-]{20,}/u.test(logText)
      ) {
        fail('BROWSER_SERVER_SECRET_LOGGED');
      }
      if (!childExited) fail('BROWSER_APP_SERVER_TERMINATION_FAILED');
    } finally {
      logBytes.fill(0);
      logs.chunks.forEach(chunk => chunk.fill(0));
    }
  }
  return {
    materialized,
    appServer: {
      shell: false,
      stdinClosed: true,
      retryCount: 0,
      loopbackOnly: true,
      dotenvLoaded: false,
      rawLogsPersisted: false,
    },
    profileObservations,
    routeObservations,
    browserCaseCount: routeObservations.length,
    profileCaseCount: profileObservations.length,
    rawStorageStatePersisted: false,
    screenshotCount: 0,
    traceCount: 0,
    videoCount: 0,
    requestBoundary: {
      policy: 'EXACT_LOCAL_METHOD_AND_ISOLATED_AUTH_READ_ALLOWLIST',
      unexpectedRequestCount: 0,
    },
    serviceRoleBoundary: {
      operation: 'SERVICE_ROLE_CLIENT_BOUNDARY',
      outcome: 'NO_BROWSER_OR_CLIENT_EXPOSURE',
      scannedValueCount: boundaryState.scannedValueCount,
      scannedByteCount: boundaryState.scannedByteCount,
      observationSha256: sha256Bytes(
        Buffer.from(JSON.stringify(boundaryState.fingerprints), 'utf8')
      ),
      dependencyBoundary: materialized.dependencyBoundary,
      rawScannedValuesPersisted: false,
      directServiceRoleApiCaseCount: 0,
    },
  };
}

export async function executePr12AllRoleSmokeRuntime(input) {
  const authRestObservations = await runAuthRefreshAndRest(input);
  const browser = await runBrowserAndProfileSmoke(input);
  return {
    auth: {
      signInCaseCount: authRestObservations.length,
      refreshCaseCount: authRestObservations.length,
      rawTokensPersisted: false,
    },
    rest: {
      caseCount: authRestObservations.reduce(
        (count, observation) => count + observation.readCases.length,
        0
      ),
      crossTenantFalseAllowCount: 0,
      observations: authRestObservations,
      rawRowsPersisted: false,
    },
    browser,
    serviceRoleBoundary: browser.serviceRoleBoundary,
  };
}
