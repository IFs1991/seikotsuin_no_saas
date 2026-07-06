import fs from 'fs';
import path from 'path';

describe('patient outreach campaign migration', () => {
  const migrationSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/migrations/20260705000600_patient_outreach_campaigns.sql'
    ),
    'utf8'
  );
  const rollbackSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/rollbacks/20260705000600_patient_outreach_campaigns_rollback.sql'
    ),
    'utf8'
  );

  it('creates outreach campaign and recipient tables plus reservation attribution column', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.patient_outreach_campaigns'
    );
    expect(migrationSql).toContain(
      "check (status in ('draft', 'sent', 'cancelled'))"
    );
    expect(migrationSql).toContain('segment_snapshot jsonb not null');
    expect(migrationSql).toContain(
      'create table if not exists public.patient_outreach_recipients'
    );
    expect(migrationSql).toContain(
      "check (delivery_status in ('pending', 'sent', 'failed', 'skipped'))"
    );
    expect(migrationSql).toContain(
      'add column if not exists campaign_id uuid null'
    );
    expect(migrationSql).toContain('reservations_campaign_id_fkey');
  });

  it('keeps recipients clinic-aligned with campaigns', () => {
    expect(migrationSql).toContain(
      'constraint patient_outreach_campaigns_id_clinic_unique'
    );
    expect(migrationSql).toContain(
      'constraint patient_outreach_recipients_campaign_clinic_fkey'
    );
    expect(migrationSql).toContain('foreign key (campaign_id, clinic_id)');
  });

  it('allows scoped select insert update for admin clinic_admin manager and no delete grant', () => {
    expect(migrationSql).toContain(
      'alter table public.patient_outreach_campaigns enable row level security'
    );
    expect(migrationSql).toContain(
      'alter table public.patient_outreach_recipients enable row level security'
    );
    expect(migrationSql).toContain(
      "app_private.get_current_role() in ('admin', 'clinic_admin', 'manager')"
    );
    expect(migrationSql).toContain('app_private.can_access_clinic(clinic_id)');
    expect(migrationSql).toContain(
      'grant select, insert, update on public.patient_outreach_campaigns to authenticated'
    );
    expect(migrationSql).toContain(
      'grant select, insert, update on public.patient_outreach_recipients to authenticated'
    );
    expect(migrationSql).toContain(
      'revoke delete on table public.patient_outreach_campaigns from authenticated'
    );
    expect(migrationSql).toContain(
      'revoke delete on table public.patient_outreach_recipients from authenticated'
    );
    expect(migrationSql).not.toMatch(
      /grant\s+delete\s+on\s+public\.patient_outreach_/i
    );
  });

  it('rolls back outreach objects and reservations campaign column', () => {
    expect(rollbackSql).toContain(
      'drop table if exists public.patient_outreach_recipients'
    );
    expect(rollbackSql).toContain(
      'drop table if exists public.patient_outreach_campaigns'
    );
    expect(rollbackSql).toContain('drop column if exists campaign_id');
  });
});
