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

  test('migration と rollback が存在する', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(securityDefinerViewMigrationPath)).toBe(true);
    expect(fs.existsSync(securityDefinerViewRollbackPath)).toBe(true);
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
