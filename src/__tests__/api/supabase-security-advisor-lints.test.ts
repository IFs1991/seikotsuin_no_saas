/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Supabase security advisor lint hardening', () => {
  const securityInvokerViews = [
    'clinic_hierarchy',
    'staff_performance_summary',
    'patient_visit_summary',
    'daily_revenue_summary',
    'reservation_list_view',
  ];
  const rpcHardeningFunctions = [
    'accept_invite',
    'aggregate_mfa_stats',
    'belongs_to_clinic',
    'can_access_clinic',
    'create_clinic_with_admin',
    'custom_access_token_hook',
    'decrypt_mfa_secret',
    'encrypt_mfa_secret',
    'get_clinic_settings',
    'get_current_clinic_id',
    'get_current_role',
    'get_invite_by_token',
    'get_sibling_clinic_ids',
    'is_admin',
    'jwt_clinic_id',
    'jwt_is_admin',
    'log_reservation_created',
    'log_reservation_deleted',
    'log_reservation_updated',
    'recalculate_daily_report_totals',
    'refresh_daily_stats',
    'rls_auto_enable',
    'sync_arrived_reservation_daily_report_item',
    'sync_daily_report_item_totals',
    'update_customer_stats',
    'update_email_outbox_updated_at',
    'upsert_clinic_settings',
    'user_role',
  ];
  const removedPublicRpcs = [
    'accept_invite',
    'get_invite_by_token',
    'create_clinic_with_admin',
  ];

  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260413000100_security_advisor_lints_hardening.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260413000100_security_advisor_lints_hardening_rollback.sql'
  );
  const securityDefinerViewMigrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260413000200_security_definer_view_fix.sql'
  );
  const securityDefinerViewRollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260413000200_security_definer_view_fix_rollback.sql'
  );
  const rpcHardeningMigrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260507000200_security_advisor_rpc_hardening.sql'
  );
  const rpcHardeningRollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260507000200_security_advisor_rpc_hardening_rollback.sql'
  );
  const rpcPolicyRepairMigrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260507000300_repair_app_private_policy_references.sql'
  );
  const rpcPolicyRepairRollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260507000300_repair_app_private_policy_references_rollback.sql'
  );
  const configPath = path.resolve(__dirname, '../../../supabase/config.toml');
  const operationsDocPath = path.resolve(
    __dirname,
    '../../../docs/operations/supabase-advisor-security-lints-2026-05-07.md'
  );
  const rpcPolicyRepairSpecPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-rls-policy-helper-rewrite-repair-2026-05-07.md'
  );
  const inviteActionsPath = path.resolve(
    __dirname,
    '../../app/(public)/invite/actions.ts'
  );
  const onboardingClinicRoutePath = path.resolve(
    __dirname,
    '../../app/api/onboarding/clinic/route.ts'
  );

  test('migration と rollback が存在する', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(securityDefinerViewMigrationPath)).toBe(true);
    expect(fs.existsSync(securityDefinerViewRollbackPath)).toBe(true);
    expect(fs.existsSync(rpcHardeningMigrationPath)).toBe(true);
    expect(fs.existsSync(rpcHardeningRollbackPath)).toBe(true);
    expect(fs.existsSync(rpcPolicyRepairMigrationPath)).toBe(true);
    expect(fs.existsSync(rpcPolicyRepairRollbackPath)).toBe(true);
    expect(fs.existsSync(operationsDocPath)).toBe(true);
    expect(fs.existsSync(rpcPolicyRepairSpecPath)).toBe(true);
  });

  test('migration が security advisor warning の対策を含む', () => {
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toMatch(/SET search_path = public, auth, extensions/);
    expect(sql).toMatch(/ALTER EXTENSION pg_trgm SET SCHEMA extensions/);
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.daily_reservation_stats FROM anon;/
    );
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.daily_reservation_stats FROM authenticated;/
    );
    expect(sql).toMatch(
      /CREATE POLICY "System can insert metrics"[\s\S]*auth\.role\(\) = 'service_role'/
    );
    expect(sql).toMatch(
      /CREATE POLICY "csp_violations_insert_any"[\s\S]*auth\.role\(\) = 'service_role'/
    );
    expect(sql).toMatch(
      /CREATE POLICY "security_alerts_insert_any"[\s\S]*auth\.role\(\) = 'service_role'/
    );
  });

  test('migration と rollback が security_definer_view 対策を含む', () => {
    const migrationSql = fs.readFileSync(
      securityDefinerViewMigrationPath,
      'utf-8'
    );
    const rollbackSql = fs.readFileSync(
      securityDefinerViewRollbackPath,
      'utf-8'
    );

    for (const viewName of securityInvokerViews) {
      const escapedViewName = viewName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      expect(migrationSql).toMatch(
        new RegExp(
          `ALTER VIEW public\\.${escapedViewName}[\\s\\S]*SET \\(security_invoker = true\\);`
        )
      );
      expect(rollbackSql).toMatch(
        new RegExp(
          `ALTER VIEW public\\.${escapedViewName}[\\s\\S]*SET \\(security_invoker = false\\);`
        )
      );
    }
  });

  test('RPC hardening migration が Advisor 対象関数を非公開化する', () => {
    const sql = fs.readFileSync(rpcHardeningMigrationPath, 'utf-8');
    const rollbackSql = fs.readFileSync(rpcHardeningRollbackPath, 'utf-8');

    expect(sql).toMatch(/create schema if not exists app_private/);
    expect(sql).toMatch(/app_private\.custom_access_token_hook\(event jsonb\)/);
    expect(sql).toMatch(
      /revoke execute on function %s from public, anon, authenticated/
    );
    expect(sql).toMatch(/grant execute on function %s to service_role/);
    expect(sql).toMatch(
      /alter function public\.update_email_outbox_updated_at\(\)[\s\S]*set search_path = public, auth, extensions/
    );
    expect(sql).toMatch(
      /alter function public\.validate_daily_report_items_clinic_refs\(\)[\s\S]*set search_path = public, auth, extensions/
    );
    expect(sql).toMatch(/app_private\.can_access_clinic\(/);
    expect(sql).toMatch(/app_private\.get_current_clinic_id\(\)/);
    expect(sql).toMatch(/app_private\.jwt_clinic_id\(\)/);
    expect(sql).toMatch(/grant execute on function app_private\.can_access_clinic\(uuid\) to anon, authenticated/);

    for (const functionName of rpcHardeningFunctions) {
      expect(sql).toContain(`'${functionName}'`);
      expect(rollbackSql).toContain(`'${functionName}'`);
    }

    expect(rollbackSql).toMatch(/drop schema if exists app_private cascade/);
  });

  test('custom access token hook は app_private schema を参照する', () => {
    const config = fs.readFileSync(configPath, 'utf-8');

    expect(config).toMatch(
      /uri = "pg-functions:\/\/postgres\/app_private\/custom_access_token_hook"/
    );
    expect(config).not.toMatch(
      /uri = "pg-functions:\/\/postgres\/public\/custom_access_token_hook"/
    );
  });

  test('RPC policy repair migration は unqualified RLS helper も app_private に差し替える', () => {
    const sql = fs.readFileSync(rpcPolicyRepairMigrationPath, 'utf-8');
    const rollbackSql = fs.readFileSync(
      rpcPolicyRepairRollbackPath,
      'utf-8'
    );
    const spec = fs.readFileSync(rpcPolicyRepairSpecPath, 'utf-8');

    expect(sql).toMatch(/rewrite_app_private_policy_helpers/);
    expect(sql).toContain('get_current_role\\(\\)');
    expect(sql).toContain('can_access_clinic\\(');
    expect(sql).toMatch(/app_private\.get_current_role\(\)/);
    expect(sql).toMatch(/app_private\.can_access_clinic\(/);
    expect(sql).not.toMatch(/grant execute on function public\.can_access_clinic\(uuid\) to anon, authenticated/);

    expect(rollbackSql).toMatch(/rewrite_public_policy_helpers/);
    expect(rollbackSql).toMatch(/grant execute on function public\.can_access_clinic\(uuid\) to anon, authenticated/);
    expect(spec).toMatch(/Rollback Plan/);
    expect(spec).toMatch(/DOD-08/);
  });

  test('招待とオンボーディングは対象 RPC を直接呼ばない', () => {
    const inviteActions = fs.readFileSync(inviteActionsPath, 'utf-8');
    const onboardingClinicRoute = fs.readFileSync(
      onboardingClinicRoutePath,
      'utf-8'
    );

    for (const rpcName of removedPublicRpcs) {
      const directRpcPattern = new RegExp(
        `\\.rpc\\(\\s*['"\`]${rpcName}['"\`]`
      );

      expect(inviteActions).not.toMatch(directRpcPattern);
      expect(onboardingClinicRoute).not.toMatch(directRpcPattern);
    }

    expect(inviteActions).toMatch(/createAdminClient/);
    expect(inviteActions).toMatch(/from\('staff_invites'\)/);
    expect(onboardingClinicRoute).toMatch(/createAdminClient/);
    expect(onboardingClinicRoute).toMatch(/from\('clinics'\)/);
    expect(onboardingClinicRoute).toMatch(/from\('user_permissions'\)/);
    expect(onboardingClinicRoute).toMatch(/from\('onboarding_states'\)/);
  });

  test('Leaked Password Protection の運用手順を残している', () => {
    const doc = fs.readFileSync(operationsDocPath, 'utf-8');

    expect(doc).toMatch(/Leaked Password Protection/);
    expect(doc).toMatch(/Supabase Dashboard/);
    expect(doc).toMatch(/Auth/);
    expect(doc).toMatch(/Advisor/);
  });

  test('server code が service role write に切り替わっている', () => {
    const cspRoute = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/security/csp-report/route.ts'),
      'utf-8'
    );
    const securityAlerts = fs.readFileSync(
      path.resolve(__dirname, '../../lib/notifications/security-alerts.ts'),
      'utf-8'
    );
    const betaMetricsRoute = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/beta/metrics/route.ts'),
      'utf-8'
    );

    expect(cspRoute).toMatch(/createAdminClient/);
    expect(cspRoute).toMatch(/adminSupabase[\s\S]*from\('csp_violations'\)/);
    expect(securityAlerts).toMatch(/createAdminClient/);
    expect(securityAlerts).toMatch(/this\.supabase = createAdminClient\(\)/);
    expect(betaMetricsRoute).toMatch(/createAdminClient/);
    expect(betaMetricsRoute).toMatch(
      /adminSupabase[\s\S]*from\('beta_usage_metrics'\)/
    );
  });
});
