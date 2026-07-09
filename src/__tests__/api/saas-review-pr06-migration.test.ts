import fs from 'fs';
import path from 'path';

describe('SaaS review PR-06 migration remediation', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260707000200_pr06_outreach_rls_integrity_and_notification_grants.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260707000200_pr06_outreach_rls_integrity_and_notification_grants_rollback.sql'
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

  it('grants reservation_notifications only to service_role for the repair', () => {
    expect(migrationSql).toContain(
      'revoke all on table public.reservation_notifications from anon'
    );
    expect(migrationSql).toContain(
      'revoke all on table public.reservation_notifications from authenticated'
    );
    expect(migrationSql).toContain(
      'grant all on table public.reservation_notifications to service_role'
    );
    expect(rollbackSql).toContain(
      'revoke all on table public.reservation_notifications from service_role'
    );
  });

  it('narrows outreach direct update RLS to API send roles', () => {
    const campaignPolicyStart = migrationSql.indexOf(
      'create policy "patient_outreach_campaigns_update_scoped"'
    );
    const recipientPolicyStart = migrationSql.indexOf(
      'create policy "patient_outreach_recipients_update_scoped"'
    );

    expect(campaignPolicyStart).toBeGreaterThan(-1);
    expect(recipientPolicyStart).toBeGreaterThan(-1);
    expect(migrationSql).toContain(
      "app_private.get_current_role() in ('admin', 'clinic_admin')"
    );
    expect(migrationSql).not.toContain(
      "app_private.get_current_role() in ('admin', 'clinic_admin', 'manager')"
    );
    expect(rollbackSql).toContain(
      "app_private.get_current_role() in ('admin', 'clinic_admin', 'manager')"
    );
  });

  it('adds cross-clinic preflight checks before composite outreach constraints', () => {
    expect(migrationSql).toContain(
      'Cross-clinic patient_outreach_recipients.customer_id rows exist'
    );
    expect(migrationSql).toContain(
      'Cross-clinic patient_outreach_recipients.booked_reservation_id rows exist'
    );
    expect(migrationSql).toContain(
      'Cross-clinic reservations.campaign_id rows exist'
    );
    expect(
      migrationSql.indexOf('Cross-clinic reservations.campaign_id')
    ).toBeLessThan(
      migrationSql.indexOf('add constraint reservations_campaign_clinic_fkey')
    );
  });

  it('adds composite FKs for customer, booked reservation, and campaign links', () => {
    expect(migrationSql).toContain('customers_id_clinic_unique');
    expect(migrationSql).toContain('reservations_id_clinic_unique');
    expect(migrationSql).toContain(
      'patient_outreach_recipients_customer_clinic_fkey'
    );
    expect(migrationSql).toContain('foreign key (customer_id, clinic_id)');
    expect(migrationSql).toContain(
      'patient_outreach_recipients_booked_reservation_clinic_fkey'
    );
    expect(migrationSql).toContain(
      'foreign key (booked_reservation_id, clinic_id)'
    );
    expect(migrationSql).toContain('reservations_campaign_clinic_fkey');
    expect(migrationSql).toContain('foreign key (campaign_id, clinic_id)');
  });

  it('rolls back new constraints and restores prior single-column outreach FKs', () => {
    expect(rollbackSql).toContain(
      'drop constraint if exists reservations_campaign_clinic_fkey'
    );
    expect(rollbackSql).toContain(
      'add constraint reservations_campaign_id_fkey'
    );
    expect(rollbackSql).toContain(
      'drop constraint if exists patient_outreach_recipients_booked_reservation_clinic_fkey'
    );
    expect(rollbackSql).toContain(
      'add constraint patient_outreach_recipients_booked_reservation_id_fkey'
    );
    expect(rollbackSql).toContain(
      'drop constraint if exists patient_outreach_recipients_customer_clinic_fkey'
    );
    expect(rollbackSql).toContain(
      'add constraint patient_outreach_recipients_customer_id_fkey'
    );
  });

  it('has canonical rollbacks for reviewed migrations missing supabase rollback coverage', () => {
    const requiredRollbacks = [
      '20260507000100_daily_report_items_rollback.sql',
      '20260508000100_fix_reservation_list_view_security_invoker_rollback.sql',
      '20260508000200_jwt_app_metadata_aware_rls_helpers_rollback.sql',
    ];

    for (const fileName of requiredRollbacks) {
      expect(
        fs.existsSync(
          path.resolve(__dirname, '../../../supabase/rollbacks', fileName)
        )
      ).toBe(true);
    }
  });
});
