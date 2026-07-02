import fs from 'fs';
import path from 'path';

describe('mobile UIUX clinic feature flags migration', () => {
  const migrationSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/migrations/20260702000100_mobile_uiux_clinic_feature_flags.sql'
    ),
    'utf8'
  );
  const rollbackSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/rollbacks/20260702000100_mobile_uiux_clinic_feature_flags_rollback.sql'
    ),
    'utf8'
  );

  it('creates clinic-scoped Mobile UIUX entitlement columns', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.clinic_feature_flags'
    );
    expect(migrationSql).toContain('clinic_id uuid primary key');
    expect(migrationSql).toContain(
      'mobile_uiux_enabled boolean not null default false'
    );
    expect(migrationSql).toContain(
      'mobile_uiux_real_data_enabled boolean not null default false'
    );
    expect(migrationSql).toContain(
      'mobile_uiux_write_enabled boolean not null default false'
    );
    expect(migrationSql).toContain('rollout_phase text not null default');
    expect(migrationSql).toContain('updated_by uuid references auth.users');
  });

  it('keeps RLS scoped and writes admin-only', () => {
    expect(migrationSql).toContain(
      'alter table public.clinic_feature_flags enable row level security'
    );
    expect(migrationSql).toContain('clinic_feature_flags_select_scoped');
    expect(migrationSql).toContain('app_private.can_access_clinic(clinic_id)');
    expect(migrationSql).toContain('clinic_feature_flags_write_admin_only');
    expect(migrationSql).not.toContain('using (true)');
  });

  it('provides rollback for the entitlement table and policies', () => {
    expect(rollbackSql).toContain('drop policy if exists');
    expect(rollbackSql).toContain('drop trigger if exists');
    expect(rollbackSql).toContain(
      'drop table if exists public.clinic_feature_flags'
    );
  });
});
