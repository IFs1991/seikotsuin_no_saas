/** @jest-environment node */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { repoRoot, runPr12Module } from './pr12-local-module-test-helpers';

const MODULE =
  'scripts/commercial-hardening/pr12-existing-project-recovery-contract.mjs';
const ALL_ROLE_MODULE =
  'scripts/commercial-hardening/pr12-all-role-smoke-runtime.mjs';
const PROJECT_REF = 'weofpqtjisacuaiknnrm';
const PRODUCTION_REF = 'qnanuoqveidwvacvbhqp';

function evaluate(source: string) {
  return runPr12Module(MODULE, source);
}

function evaluateAllRole(source: string) {
  return runPr12Module(ALL_ROLE_MODULE, source);
}

describe('PR12 existing isolated project recovery', () => {
  test('projects the exact existing project identity without retaining provider extras', () => {
    const result = evaluate(`
      const value = subject.projectResponseToRecoverySafeProjection({
        ref: ${JSON.stringify(PROJECT_REF)},
        organization_id: 'kbnsntifrawhimhfjrug',
        name: 'seikotsuin-pr12-isolated-qualification-20260719',
        region: 'ap-northeast-1',
        created_at: '2026-08-01T15:59:37.300Z',
        status: 'ACTIVE_HEALTHY',
        database: {
          host: 'db.${PROJECT_REF}.supabase.co',
          version: '17.6.1.016',
          postgres_engine: '17',
          release_channel: 'ga'
        },
        provider_added_metadata: { must_not_persist: true }
      });
      process.stdout.write(JSON.stringify(value));
    `);

    expect(result.status).toBe(0);
    const projection = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(projection).toMatchObject({
      projectRef: PROJECT_REF,
      organizationId: 'kbnsntifrawhimhfjrug',
      organizationSlug: 'kbnsntifrawhimhfjrug',
      organizationSlugSource: 'OWNER_DECISION_TARGET',
      projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
      region: 'ap-northeast-1',
      createdAt: '2026-08-01T15:59:37.300Z',
      status: 'ACTIVE_HEALTHY',
      directHost: `db.${PROJECT_REF}.supabase.co`,
      rawProviderBodyRetained: false,
    });
    expect(result.stdout).not.toContain('provider_added_metadata');
    expect(result.stdout).not.toContain('must_not_persist');
  });

  test.each([
    ['organization_id', 'wrong-org'],
    ['ref', 'abcdefghijklmnopqrst'],
    ['region', 'us-east-1'],
  ])('blocks wrong %s before Step 01 can pass', (field, value) => {
    const result = evaluate(`
      const input = {
        ref: ${JSON.stringify(PROJECT_REF)},
        organization_id: 'kbnsntifrawhimhfjrug',
        name: 'seikotsuin-pr12-isolated-qualification-20260719',
        region: 'ap-northeast-1',
        created_at: '2026-08-01T15:59:37.300Z',
        status: 'ACTIVE_HEALTHY',
        database: { host: 'db.${PROJECT_REF}.supabase.co' }
      };
      input[${JSON.stringify(field)}] = ${JSON.stringify(value)};
      subject.projectResponseToRecoverySafeProjection(input);
    `);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('RECOVERY_TARGET_MISMATCH');
  });

  test('preserves an observed non-Large compute tier without blocking replay', () => {
    const result = evaluate(`
      const value = subject.addonResponseToRecoveryComputeProjection({
        selected_addons: { compute_instance: { variant: 'ci_micro' } }
      });
      process.stdout.write(JSON.stringify(value));
    `);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      verification: 'VERIFIED',
      tier: 'CI_MICRO',
      variantId: 'ci_micro',
      productionEquivalent: false,
    });
  });

  test('marks Step 01 PASS when the exact project is ready and direct DB is reachable', () => {
    const result = evaluate(`
      const value = subject.determineRecoveredStep01Result({
        providerProject: {
          projectRef: ${JSON.stringify(PROJECT_REF)},
          organizationId: 'kbnsntifrawhimhfjrug',
          organizationSlug: 'kbnsntifrawhimhfjrug',
          projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
          region: 'ap-northeast-1',
          createdAt: '2026-08-01T15:59:37.300Z',
          status: 'ACTIVE_HEALTHY',
          directHost: 'db.${PROJECT_REF}.supabase.co',
          rawProviderBodyRetained: false
        },
        database: {
          status: 'REACHABLE',
          connectionMode: 'DIRECT',
          projectRef: ${JSON.stringify(PROJECT_REF)},
          systemIdentifier: '7662783869098430503'
        },
        compute: { verification: 'UNVERIFIED', tier: null }
      });
      process.stdout.write(JSON.stringify(value));
    `);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      step: '01',
      canonicalStep: 'staging clone/isolated project',
      result: 'PASS',
      historicalAction003Disposition: 'RECOVERED_WITH_TOOLING_DEFECT',
      toolingDefect: 'PROVIDER_RESPONSE_INVALID',
      computeTier: 'UNVERIFIED',
      functionalReplayAuthorizedByOwnerDecision: true,
      productionEquivalentPerformanceQualificationDeferred: true,
      nextStep: '02',
    });
  });

  test('blocks Step 01 when direct DB is unreachable', () => {
    const result = evaluate(`
      subject.determineRecoveredStep01Result({
        providerProject: {
          projectRef: ${JSON.stringify(PROJECT_REF)},
          organizationId: 'kbnsntifrawhimhfjrug',
          organizationSlug: 'kbnsntifrawhimhfjrug',
          projectName: 'seikotsuin-pr12-isolated-qualification-20260719',
          region: 'ap-northeast-1',
          createdAt: '2026-08-01T15:59:37.300Z',
          status: 'ACTIVE_HEALTHY',
          directHost: 'db.${PROJECT_REF}.supabase.co',
          rawProviderBodyRetained: false
        },
        database: {
          status: 'UNREACHABLE',
          connectionMode: 'DIRECT',
          projectRef: ${JSON.stringify(PROJECT_REF)},
          systemIdentifier: null
        },
        compute: { verification: 'VERIFIED', tier: 'LARGE' }
      });
    `);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('DIRECT_DATABASE_UNREACHABLE');
  });

  test('requires exact verified Step 01 remote contact counts before linking them', () => {
    const result = evaluate(`
      const exact = {
        projectStateGetCount: 1,
        computeAddonGetCount: 1,
        publicCaGetCount: 1,
        directDatabaseConnectionCount: 1,
        postCount: 0,
        retryCount: 0
      };
      const accepted = subject.assertRecoveredStep01ContactCounts(exact);
      const rejected = {};
      for (const [name, value] of Object.entries({
        wrongProjectGet: { ...exact, projectStateGetCount: 2 },
        wrongDatabaseCount: { ...exact, directDatabaseConnectionCount: 0 },
        postAttempt: { ...exact, postCount: 1 },
        retryAttempt: { ...exact, retryCount: 1 },
        missingKey: Object.fromEntries(
          Object.entries(exact).filter(([key]) => key !== 'publicCaGetCount')
        ),
        extraKey: { ...exact, runtimeApiKeysGetCount: 0 }
      })) {
        try {
          subject.assertRecoveredStep01ContactCounts(value);
        } catch (error) {
          rejected[name] = error.message;
        }
      }
      process.stdout.write(JSON.stringify({ accepted, rejected }));
    `);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      accepted: {
        projectStateGetCount: 1,
        computeAddonGetCount: 1,
        publicCaGetCount: 1,
        directDatabaseConnectionCount: 1,
        postCount: 0,
        retryCount: 0,
      },
      rejected: {
        wrongProjectGet: 'RECOVERY_CONTACT_COUNTS_INVALID',
        wrongDatabaseCount: 'RECOVERY_CONTACT_COUNTS_INVALID',
        postAttempt: 'RECOVERY_CONTACT_COUNTS_INVALID',
        retryAttempt: 'RECOVERY_CONTACT_COUNTS_INVALID',
        missingKey: 'RECOVERY_CONTACT_COUNTS_INVALID',
        extraKey: 'RECOVERY_CONTACT_COUNTS_INVALID',
      },
    });
  });

  test('allows only read-only requests for the exact isolated project', () => {
    const allowed = evaluate(`
      const values = [
        subject.assertAllowedRecoveryProviderRequest(
          'GET',
          'https://api.supabase.com/v1/projects/${PROJECT_REF}'
        ),
        subject.assertAllowedRecoveryProviderRequest(
          'GET',
          'https://api.supabase.com/v1/projects/${PROJECT_REF}/billing/addons'
        ),
        subject.assertAllowedRecoveryProviderRequest(
          'GET',
          'https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=true'
        )
      ];
      process.stdout.write(JSON.stringify(values));
    `);
    expect(allowed.status).toBe(0);

    for (const [method, url] of [
      ['POST', 'https://api.supabase.com/v1/projects'],
      ['GET', 'https://api.supabase.com/v1/projects/${PRODUCTION_REF}'],
      ['GET', 'https://${PRODUCTION_REF}.supabase.co/rest/v1/'],
      [
        'GET',
        'https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys?reveal=false',
      ],
    ]) {
      const denied = evaluate(`
        subject.assertAllowedRecoveryProviderRequest(
          ${JSON.stringify(method)},
          ${JSON.stringify(url)}
        );
      `);
      expect(denied.status).not.toBe(0);
      expect(denied.stderr).toContain(
        url.includes(PRODUCTION_REF)
          ? 'PRODUCTION_CONTACT_DENIED'
          : 'RECOVERY_ROUTE_NOT_ALLOWED'
      );
    }
  });

  test('selects only isolated runtime client/server keys without exposing extras', () => {
    const result = evaluateAllRole(`
      const selected = subject.selectProjectRuntimeApiKeys([
        { name: 'anon', type: 'legacy', api_key: 'client-' + 'a'.repeat(40) },
        { name: 'service_role', type: 'legacy', api_key: 'server-' + 'b'.repeat(40) },
        { name: 'unused', type: 'publishable_disabled', api_key: 'unused-' + 'c'.repeat(40) }
      ]);
      process.stdout.write(JSON.stringify({
        clientKeyName: selected.clientKeyName,
        serverKeyName: selected.serverKeyName,
        observedKeyCount: selected.observedKeyCount
      }));
    `);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      clientKeyName: 'anon',
      serverKeyName: 'service_role',
      observedKeyCount: 3,
    });
    expect(result.stdout).not.toContain('client-');
    expect(result.stdout).not.toContain('server-');
  });

  test('rejects missing, duplicate, and shared runtime API keys', () => {
    for (const response of [
      [{ name: 'anon', type: 'legacy', api_key: `client-${'a'.repeat(40)}` }],
      [
        { name: 'anon', type: 'legacy', api_key: `client-${'a'.repeat(40)}` },
        { name: 'anon', type: 'legacy', api_key: `client-${'b'.repeat(40)}` },
        {
          name: 'service_role',
          type: 'legacy',
          api_key: `server-${'c'.repeat(40)}`,
        },
      ],
      [
        { name: 'anon', type: 'legacy', api_key: `shared-${'d'.repeat(40)}` },
        {
          name: 'service_role',
          type: 'legacy',
          api_key: `shared-${'d'.repeat(40)}`,
        },
      ],
    ]) {
      const denied = evaluateAllRole(`
        subject.selectProjectRuntimeApiKeys(${JSON.stringify(response)});
      `);
      expect(denied.status).not.toBe(0);
      expect(denied.stderr).toMatch(/RUNTIME_API_KEYS_/);
    }
  });

  test('allows only the exact isolated Auth and read-only staff REST routes', () => {
    const allowed = evaluateAllRole(`
      const ref = ${JSON.stringify(PROJECT_REF)};
      for (const [method, url] of [
        ['POST', 'https://' + ref + '.supabase.co/auth/v1/token?grant_type=password'],
        ['POST', 'https://' + ref + '.supabase.co/auth/v1/token?grant_type=refresh_token'],
        ['GET', 'https://' + ref + '.supabase.co/rest/v1/staff?select=id&clinic_id=eq.10000000-0000-4000-8000-000000000002']
      ]) subject.assertIsolatedDataRequest(method, url, ref);
    `);
    expect(allowed.status).toBe(0);

    for (const [method, url] of [
      [
        'GET',
        `https://${PRODUCTION_REF}.supabase.co/rest/v1/staff?select=id&clinic_id=eq.test`,
      ],
      [
        'POST',
        `https://${PROJECT_REF}.supabase.co/rest/v1/staff?select=id&clinic_id=eq.test`,
      ],
      [
        'GET',
        `https://${PROJECT_REF}.supabase.co/rest/v1/customers?select=id&clinic_id=eq.test`,
      ],
      [
        'GET',
        `https://${PROJECT_REF}.supabase.co/rest/v1/staff?select=*&clinic_id=eq.test`,
      ],
    ]) {
      const denied = evaluateAllRole(`
        subject.assertIsolatedDataRequest(
          ${JSON.stringify(method)},
          ${JSON.stringify(url)},
          ${JSON.stringify(PROJECT_REF)}
        );
      `);
      expect(denied.status).not.toBe(0);
      expect(denied.stderr).toContain('ISOLATED_DATA_ROUTE_DENIED');
    }
  });

  test('binds the live smoke runtime to the canonical REST and browser matrices', () => {
    const runtimeSource = fs.readFileSync(
      path.join(repoRoot, ALL_ROLE_MODULE),
      'utf8'
    );
    const runnerSource = fs.readFileSync(
      path.join(
        repoRoot,
        'scripts/commercial-hardening/run-pr12-existing-project-recovery.mjs'
      ),
      'utf8'
    );

    expect(runtimeSource).toContain('ALL_ROLE_SMOKE_REST_CASES');
    expect(runtimeSource).toContain('ALL_ROLE_SMOKE_BROWSER_CASES');
    expect(runtimeSource).not.toContain('classifyBrowserRoute');
    expect(runnerSource).toContain('ALL_ROLE_SMOKE_REST_CASES');
    expect(runnerSource).toContain('const userMetadata = JSON.stringify({});');

    const relation = evaluateAllRole(`
      process.stdout.write(JSON.stringify(
        subject.resolveAllRoleSmokeRelation('public.staff')
      ));
    `);
    expect(relation.status).toBe(0);
    expect(JSON.parse(relation.stdout)).toEqual({
      restPath: '/rest/v1/staff',
      sqlIdentifier: 'public.staff',
    });
    const wrongRelation = evaluateAllRole(`
      subject.resolveAllRoleSmokeRelation('public.customers');
    `);
    expect(wrongRelation.status).not.toBe(0);
    expect(wrongRelation.stderr).toContain('ROLE_SMOKE_RELATION_INVALID');
  });

  test('fail-closes browser traffic and proves service-role non-exposure', () => {
    const allowed = evaluateAllRole(`
      const baseUrl = 'http://127.0.0.1:43123';
      const ref = ${JSON.stringify(PROJECT_REF)};
      for (const [method, url] of [
        ['GET', baseUrl + '/dashboard'],
        ['POST', baseUrl + '/login'],
        ['GET', baseUrl + '/_next/static/chunks/app.js'],
        ['GET', 'https://' + ref + '.supabase.co/auth/v1/user']
      ]) subject.assertIsolatedBrowserRequest(method, url, baseUrl, ref);
      const boundary = subject.assertServiceRoleNotExposed(
        'server-' + 'z'.repeat(40),
        ['safe request', 'safe response', 'safe storage']
      );
      process.stdout.write(JSON.stringify(boundary));
    `);
    expect(allowed.status).toBe(0);
    expect(JSON.parse(allowed.stdout)).toMatchObject({
      outcome: 'NO_BROWSER_OR_CLIENT_EXPOSURE',
      scannedValueCount: 3,
    });
    expect(allowed.stdout).not.toContain('server-');

    for (const [method, url] of [
      ['GET', 'http://127.0.0.1:43123/api/admin/users'],
      ['POST', 'http://127.0.0.1:43123/api/admin/users'],
      ['POST', `https://${PROJECT_REF}.supabase.co/rest/v1/staff`],
      ['GET', `https://${PRODUCTION_REF}.supabase.co/auth/v1/user`],
    ]) {
      const denied = evaluateAllRole(`
        subject.assertIsolatedBrowserRequest(
          ${JSON.stringify(method)},
          ${JSON.stringify(url)},
          'http://127.0.0.1:43123',
          ${JSON.stringify(PROJECT_REF)}
        );
      `);
      expect(denied.status).not.toBe(0);
      expect(denied.stderr).toContain('ISOLATED_BROWSER_ROUTE_DENIED');
    }

    const exposed = evaluateAllRole(`
      subject.assertServiceRoleNotExposed(
        'server-' + 'z'.repeat(40),
        ['prefix server-' + 'z'.repeat(40) + ' suffix']
      );
    `);
    expect(exposed.status).not.toBe(0);
    expect(exposed.stderr).toContain('SERVICE_ROLE_CLIENT_EXPOSURE_DETECTED');
  });

  test('revalidates redirects and prevents forbidden WebSocket connections', () => {
    const allowed = evaluateAllRole(`
      const baseUrl = 'http://127.0.0.1:43123';
      const ref = ${JSON.stringify(PROJECT_REF)};
      subject.assertIsolatedBrowserRedirect(
        'GET',
        307,
        '/login?redirectTo=%2Fdashboard',
        baseUrl + '/dashboard',
        baseUrl,
        ref
      );
      subject.assertIsolatedBrowserWebSocket(
        'ws://127.0.0.1:43123/_next/webpack-hmr?page=%2Fdashboard',
        baseUrl
      );
    `);
    expect(allowed.status).toBe(0);

    for (const script of [
      `subject.assertIsolatedBrowserRedirect(
        'GET',
        302,
        'https://${PRODUCTION_REF}.supabase.co/rest/v1/staff',
        'http://127.0.0.1:43123/dashboard',
        'http://127.0.0.1:43123',
        ${JSON.stringify(PROJECT_REF)}
      );`,
      `subject.assertIsolatedBrowserWebSocket(
        'wss://${PRODUCTION_REF}.supabase.co/realtime/v1/websocket',
        'http://127.0.0.1:43123'
      );`,
    ]) {
      const denied = evaluateAllRole(script);
      expect(denied.status).not.toBe(0);
      expect(denied.stderr).toMatch(
        /ISOLATED_BROWSER_(REDIRECT|WEBSOCKET)_DENIED/
      );
    }

    const source = fs.readFileSync(
      path.join(repoRoot, ALL_ROLE_MODULE),
      'utf8'
    );
    expect(source).toContain('maxRedirects: 0');
    expect(source).toContain('maxRetries: 0');
    expect(source).toContain("routeWebSocket('**/*'");
    expect(source).toContain('connectToServer()');
    expect(source).not.toContain("page.on('websocket'");
  });

  test('distinguishes DENY_UI from an unauthorized redirect and records the actual pathname', () => {
    const pass = evaluateAllRole(`
      process.stdout.write(subject.assertCanonicalBrowserOutcome(
        { route: '/manager', expected: 'DENY_UI' },
        {
          actualPathname: '/manager',
          denyUiMarkerVisible: true,
          allowPageMarkerVisible: false
        }
      ));
    `);
    expect(pass.status).toBe(0);
    expect(pass.stdout).toBe('DENY_UI');

    const wrongRedirect = evaluateAllRole(`
      subject.assertCanonicalBrowserOutcome(
        { route: '/manager', expected: 'DENY_UI' },
        {
          actualPathname: '/unauthorized',
          denyUiMarkerVisible: true,
          allowPageMarkerVisible: false
        }
      );
    `);
    expect(wrongRedirect.status).not.toBe(0);
    expect(wrongRedirect.stderr).toContain('BROWSER_ROLE_BOUNDARY_MISMATCH');

    const source = fs.readFileSync(
      path.join(repoRoot, ALL_ROLE_MODULE),
      'utf8'
    );
    expect(source).toContain('actualPathname');
  });

  test('materializes an exact offline dependency closure instead of using ambient node_modules', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, ALL_ROLE_MODULE),
      'utf8'
    );
    expect(source).toContain("'--offline'");
    expect(source).toContain("'--ignore-scripts'");
    expect(source).toContain("dependencyBoundary: 'NPM_CI_OFFLINE_LOCKFILE'");
    expect(source).not.toContain('symlinkSync');
    expect(source).not.toContain('VALIDATED_NODE_MODULES_JUNCTION');
  });

  test('keeps the recovery runner free of every project-create and production path', () => {
    const source = fs.readFileSync(
      path.join(
        repoRoot,
        'scripts/commercial-hardening/run-pr12-existing-project-recovery.mjs'
      ),
      'utf8'
    );
    expect(source).not.toContain("method: 'POST'");
    expect(source).not.toContain('run-pr12-source-project-provisioning.mjs');
    expect(source).not.toContain('--execute-authorized-action');
    expect(source).toContain('postCount: 0');
    expect(source).toContain('productionDatabaseContactCount: 0');
    expect(source).toContain("PGSSLMODE: 'verify-full'");
    expect(source).toContain('shell: false');
    expect(source).toContain("stdio: ['ignore', 'pipe', 'pipe']");
    expect(source).toContain("mode: 'ISOLATED_PROJECT_CONTINUATION'");
    expect(source).not.toContain("mode: 'EXECUTE'");
    expect(source).toContain("flag: 'wx'");
    expect(source).toContain("openSync(filename, 'wx')");
    expect(source).toContain('fsyncSync(descriptor)');
    expect(source).toContain('PINNED_CA_SHA256');
    expect(source).toContain('CA_BUNDLE_HASH_MISMATCH');
    expect(source).toContain('default_transaction_read_only=on');
    expect(source).toContain("'pr12-existing-project-recovery-journal-cycle2'");
    expect(source).toContain(
      "'pr12-existing-project-recovery-evidence-cycle2'"
    );
    expect(source).toContain(
      "'pr12-existing-project-recovery-replay-workdir-cycle2'"
    );
    expect(source).toContain("'pr12-existing-project-recovery-journal-cycle3'");
    expect(source).toContain(
      "'pr12-existing-project-recovery-evidence-cycle3'"
    );
    expect(source).toContain(
      "'pr12-existing-project-recovery-replay-workdir-cycle3'"
    );
    expect(source).toContain("'pr12-existing-project-recovery-journal-cycle4'");
    expect(source).toContain(
      "'pr12-existing-project-recovery-evidence-cycle4'"
    );
    expect(source).toContain(
      "'pr12-existing-project-recovery-replay-workdir-cycle4'"
    );
    expect(source).toContain('assertPredecessorPreContactAbort(');
    expect(source).toContain('assertPredecessorCredentialBrokerAbort(');
    expect(source).toContain('assertPredecessorAdvisorParserAbort(');
    expect(source).toContain("status: 'PRE_CONTACT_TOOLING_ABORT_VERIFIED'");
    expect(source).toContain(
      "status: 'PRE_PROVIDER_CREDENTIAL_BROKER_ABORT_VERIFIED'"
    );
    expect(source).toContain(
      "status: 'PRE_MUTATION_ADVISOR_PARSER_ABORT_VERIFIED'"
    );
    expect(source).toContain('allRemoteContactCountsZero: true');
    expect(source).toContain('allProviderAndDatabaseContactCountsZero: true');
    expect(source).toContain(
      'consumedReceiptAclRemediatedWithoutContentMutation: true'
    );
    expect(source).toContain('migrationApplyDispatchCount: 0');
    expect(source).toContain('mutationOutcomeUnknown: false');
    expect(source).toContain('predecessorAttempts');
    expect(source).not.toContain('rmSync');
    expect(source).not.toContain('unlinkSync');

    const broker = fs.readFileSync(
      path.join(
        repoRoot,
        'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1'
      ),
      'utf8'
    );
    expect(broker).toContain('PR12-RECOVER-EXISTING-ISOLATED-PROJECT-001');
    expect(broker).toContain('CLAIMED_CONTINUATION_NOT_STARTED');
    expect(broker).toContain(
      'pr12-existing-project-recovery-credential-consumed.json'
    );
    expect(broker).toContain('[IO.FileMode]::CreateNew');
    expect(broker).toContain('function Protect-StrictFileAcl');
    expect(broker).toContain(
      'Protect-StrictFileAcl `\n        -Value $consumedPath `'
    );
    expect(broker.indexOf('Protect-StrictFileAcl `')).toBeLessThan(
      broker.indexOf('Assert-StrictAcl `\n        -Value $consumedPath `')
    );
  });

  test('behaviorally rejects an inherited receipt ACL and protects it before acceptance', () => {
    if (process.platform !== 'win32') return;
    const powershell = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
    const aclHelper = path.join(
      repoRoot,
      'scripts/commercial-hardening/pr12-windows-owner-private-acl.ps1'
    );
    const brokerPath = path.join(
      repoRoot,
      'scripts/commercial-hardening/pr12-windows-dpapi-credential-broker.ps1'
    );
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pr12-broker-receipt-acl-')
    );
    const protectedParent = path.join(temporaryRoot, 'journal');
    const receiptPath = path.join(
      protectedParent,
      'pr12-existing-project-recovery-credential-consumed.json'
    );
    const harnessPath = path.join(temporaryRoot, 'acl-harness.ps1');
    try {
      fs.mkdirSync(protectedParent);
      const parentProtection = spawnSync(
        powershell,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          aclHelper,
          '-Mode',
          'PROTECT_AND_CAPTURE',
          '-Kind',
          'DIRECTORY',
          '-LiteralPath',
          protectedParent,
        ],
        { cwd: repoRoot, encoding: 'utf8', windowsHide: true }
      );
      expect(parentProtection.status).toBe(0);
      fs.writeFileSync(receiptPath, '{"safe":true}\n', {
        encoding: 'utf8',
        flag: 'wx',
      });
      const beforeBytes = fs.readFileSync(receiptPath);
      const inheritedReceipt = spawnSync(
        powershell,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          aclHelper,
          '-Mode',
          'CAPTURE',
          '-Kind',
          'FILE',
          '-LiteralPath',
          receiptPath,
        ],
        { cwd: repoRoot, encoding: 'utf8', windowsHide: true }
      );
      expect(inheritedReceipt.status).not.toBe(0);
      expect(inheritedReceipt.stderr).toContain('ACCESS_RULES_NOT_PROTECTED');

      const brokerSource = fs.readFileSync(brokerPath, 'utf8');
      const functionsStart = brokerSource.indexOf(
        'function Assert-StrictAcl {'
      );
      const functionsEnd = brokerSource.indexOf(
        'function Read-BoundedStandardInput {'
      );
      expect(functionsStart).toBeGreaterThanOrEqual(0);
      expect(functionsEnd).toBeGreaterThan(functionsStart);
      const harness = `${brokerSource.slice(functionsStart, functionsEnd)}
$ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
Protect-StrictFileAcl -Value $args[0] -CurrentSid $ownerSid
Assert-StrictAcl -Value $args[0] -Directory $false -CurrentSid $ownerSid
`;
      fs.writeFileSync(harnessPath, harness, { encoding: 'utf8', flag: 'wx' });
      const protectedReceipt = spawnSync(
        powershell,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          harnessPath,
          receiptPath,
        ],
        { cwd: repoRoot, encoding: 'utf8', windowsHide: true }
      );
      expect(protectedReceipt.status).toBe(0);
      expect(protectedReceipt.stdout).toBe('');
      expect(protectedReceipt.stderr).toBe('');
      expect(fs.readFileSync(receiptPath)).toEqual(beforeBytes);

      const acceptedReceipt = spawnSync(
        powershell,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          aclHelper,
          '-Mode',
          'CAPTURE',
          '-Kind',
          'FILE',
          '-LiteralPath',
          receiptPath,
        ],
        { cwd: repoRoot, encoding: 'utf8', windowsHide: true }
      );
      expect(acceptedReceipt.status).toBe(0);
      const observation = JSON.parse(acceptedReceipt.stdout) as {
        aclPolicyId: string;
        accessRulesProtected: boolean;
        accessRuleCount: number;
        allowedSids: string[];
      };
      expect(observation).toMatchObject({
        aclPolicyId: 'WINDOWS_CURRENT_USER_AND_SYSTEM_FULL_CONTROL_V1',
        accessRulesProtected: true,
        accessRuleCount: 2,
      });
      expect(observation.allowedSids).toHaveLength(2);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  test('continues through the owner-authorized functional qualification scope', () => {
    const source = fs.readFileSync(
      path.join(
        repoRoot,
        'scripts/commercial-hardening/run-pr12-existing-project-recovery.mjs'
      ),
      'utf8'
    );
    for (const operation of [
      'executeRepresentativeDataValidation',
      'executeHostedTypesParity',
      'executeAdvisorAfterScan',
      'executeAllRoleSmoke',
    ]) {
      expect(source).toContain(`${operation}({`);
    }
    expect(source).toContain("status: 'OWNER_AUTHORIZED_SCOPE_COMPLETE'");
    expect(source).toContain(
      "completedCanonicalSteps: ['01', '02', '03', '04', '05', '06']"
    );
    expect(source).toContain('blockedCanonicalStep: null');
    expect(source).toContain("nextCanonicalStep: '07'");
    expect(source).toContain('nextCanonicalStepAuthorized: false');
    expect(source).toContain("commandId: 'PR12-CMD-009'");
    expect(source).toContain('validateRepresentativeFixtureSnapshot(');
    expect(source).toContain('relationOrder: [');
    expect(source).toContain('verifiedRows: 95');
    expect(source).toContain("'AUTHENTICATED_DATABASE_RLS_14_CASES'");
    expect(source).toContain("'SERVICE_ROLE_CLIENT_BOUNDARY'");
    expect(source).toContain("'AUTH_SIGN_IN_REFRESH_7_ACTORS'");
    expect(source).toContain("'PROFILE_API_7_ACTORS'");
    expect(source).toContain("'REST_14_CASES'");
    expect(source).toContain("'BROWSER_16_CASES'");
    expect(source).toContain('publicCaGetCount: context.publicCaGetCount');
    expect(source).toContain(
      "brokerProtocolMode: 'ISOLATED_PROJECT_CONTINUATION'"
    );
    expect(source).toContain('intentArtifactSha256');
    expect(source).toContain('resultArtifactSha256');
    expect(source).toContain('mutationOutcomeUnknown');
  });
});
