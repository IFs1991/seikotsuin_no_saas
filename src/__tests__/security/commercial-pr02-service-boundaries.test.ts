import * as fs from 'fs';
import * as path from 'path';

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function sectionBetween(
  source: string,
  startMarker: string,
  endMarker: string
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('commercial PR-02 service-role boundaries', () => {
  it('uses service credentials only for the global shared-master admin write', () => {
    const source = readSource('src/app/api/admin/tables/route.ts');
    const post = sectionBetween(
      source,
      'export async function POST',
      'export async function PUT'
    );
    const put = source.slice(source.indexOf('export async function PUT'));

    for (const mutationSource of [post, put]) {
      const authIndex = mutationSource.indexOf('processApiRequest');
      const writableCheckIndex = mutationSource.indexOf('isWritableTable');
      const serviceClientIndex = mutationSource.indexOf(
        "table_name === 'menu_categories' ? createAdminClient() : supabase"
      );
      const writeIndex = mutationSource.indexOf('await writeSupabase');

      expect(authIndex).toBeGreaterThanOrEqual(0);
      expect(writableCheckIndex).toBeGreaterThan(authIndex);
      expect(serviceClientIndex).toBeGreaterThan(writableCheckIndex);
      expect(writeIndex).toBeGreaterThan(serviceClientIndex);
      expect(mutationSource).toContain(
        'const { auth, body, supabase } = processResult'
      );
    }
  });

  it('creates the dashboard legacy client only after clinic scope is verified', () => {
    const source = readSource('src/app/api/dashboard/route.ts');
    const accessIndex = source.indexOf('await ensureClinicAccess');
    const serviceClientIndex = source.indexOf(
      'const legacyAnalyticsSupabase = createAdminClient()'
    );

    expect(accessIndex).toBeGreaterThanOrEqual(0);
    expect(serviceClientIndex).toBeGreaterThan(accessIndex);
    expect(source).toContain(
      'createDashboardSupabaseReadModelClient(\n        supabase,\n        legacyAnalyticsSupabase\n      )'
    );
  });

  it('creates the mobile legacy client only after scope and entitlement checks', () => {
    const source = readSource('src/app/api/mobile-uiux/home/route.ts');
    const accessIndex = source.indexOf('await ensureClinicAccess');
    const entitlementIndex = source.indexOf(
      'areMobileUiuxRealDataReadsEnabled(flags, entitlement)'
    );
    const serviceClientIndex = source.indexOf(
      'const legacyAnalyticsSupabase = createAdminClient()'
    );

    expect(accessIndex).toBeGreaterThanOrEqual(0);
    expect(entitlementIndex).toBeGreaterThan(accessIndex);
    expect(serviceClientIndex).toBeGreaterThan(entitlementIndex);
  });

  it('scopes manager clinic-card RPCs before using the mobile service client', () => {
    const source = readSource('src/app/api/mobile-uiux/home/route.ts');
    const helper = sectionBetween(
      source,
      'async function fetchHomeClinicCards',
      'export async function GET'
    );
    const principalIndex = helper.indexOf('await resolveMobileUiuxPrincipal');
    const rolloutIndex = helper.indexOf('evaluateMobileUiuxEnvRollout');
    const clinicIdsIndex = helper.indexOf(
      'const clinicIds = rollout.clinicIds'
    );
    const revenueRpcIndex = helper.indexOf('fetchManagerRevenuePeriodTotals(');

    expect(principalIndex).toBeGreaterThanOrEqual(0);
    expect(rolloutIndex).toBeGreaterThan(principalIndex);
    expect(clinicIdsIndex).toBeGreaterThan(rolloutIndex);
    expect(revenueRpcIndex).toBeGreaterThan(clinicIdsIndex);
    expect(helper).toContain(
      'fetchManagerRevenuePeriodTotals(\n        params.analyticsSupabase,\n        clinicIds'
    );
    expect(helper).toContain('adminClient: params.analyticsSupabase');
    expect(helper).not.toContain('createAdminClient()');
    expect(source).toContain('analyticsSupabase: legacyAnalyticsSupabase');
  });

  it('confines dashboard read-model service credentials to the legacy heatmap RPC', () => {
    const source = readSource('src/lib/dashboard/read-model.ts');

    expect(source).toContain(
      "legacyAnalyticsSupabase.rpc(\n        'get_hourly_visit_pattern'"
    );
    expect(source).not.toContain("supabase.rpc('get_hourly_visit_pattern'");
  });

  it('uses service credentials for legacy revenues only after clinic scope succeeds', () => {
    const source = readSource('src/app/api/clinic/analysis/route.ts');
    const accessIndex = source.indexOf('await ensureClinicAccess');
    const serviceClientIndex = source.indexOf(
      'const legacyAnalyticsSupabase = createAdminClient()'
    );
    const legacyReadIndex = source.indexOf(
      "legacyAnalyticsSupabase\n        .from('revenues')"
    );

    expect(accessIndex).toBeGreaterThanOrEqual(0);
    expect(serviceClientIndex).toBeGreaterThan(accessIndex);
    expect(legacyReadIndex).toBeGreaterThan(serviceClientIndex);
    expect(source).not.toContain("supabase\n        .from('revenues')");
    expect(source).toContain(".eq('clinic_id', resolvedClinicId)");
  });
});
