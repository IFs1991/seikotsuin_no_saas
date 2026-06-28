import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve(
  __dirname,
  '../../../supabase/migrations/20260625000100_staff_profiles_memberships.sql'
);
const rollbackPath = path.resolve(
  __dirname,
  '../../../supabase/rollbacks/20260625000100_staff_profiles_memberships_rollback.sql'
);

describe('staff profiles memberships migration', () => {
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

  it('creates staff profile and membership tables with scoped constraints', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.staff_profiles'
    );
    expect(migrationSql).toContain(
      'create table if not exists public.staff_clinic_memberships'
    );
    expect(migrationSql).toContain(
      "check (membership_type in ('home', 'regular', 'help', 'blocked'))"
    );
    expect(migrationSql).toContain('check (priority between 1 and 5)');
    expect(migrationSql).toContain('staff_clinic_memberships_resource_unique');
  });

  it('extends staff_shifts without removing existing compatibility columns', () => {
    expect(migrationSql).toContain(
      'add column if not exists staff_profile_id uuid'
    );
    expect(migrationSql).toContain(
      'add column if not exists home_clinic_id uuid'
    );
    expect(migrationSql).toContain(
      "add column if not exists assignment_type text not null default 'regular'"
    );
    expect(migrationSql).toContain('add column if not exists time_preset text');
    expect(migrationSql).toContain(
      'add column if not exists source_shift_request_id uuid'
    );
    expect(migrationSql).toContain(
      "check (assignment_type in ('regular', 'help'))"
    );
  });

  it('keeps RLS fail-closed for direct writes', () => {
    expect(migrationSql).toContain(
      'alter table public.staff_profiles enable row level security'
    );
    expect(migrationSql).toContain(
      'alter table public.staff_clinic_memberships enable row level security'
    );
    expect(migrationSql).toContain('staff_profiles_select_scoped');
    expect(migrationSql).toContain('staff_clinic_memberships_select_scoped');
    expect(migrationSql).toContain('app_private.can_access_clinic(clinic_id)');
    expect(migrationSql).toContain('staff_profiles_write_admin_only');
    expect(migrationSql).toContain('staff_clinic_memberships_write_admin_only');
  });

  it('provides a rollback for new tables, policies, triggers, and staff_shifts columns', () => {
    expect(rollbackSql).toContain('drop policy if exists');
    expect(rollbackSql).toContain('drop trigger if exists');
    expect(rollbackSql).toContain(
      'drop column if exists source_shift_request_id'
    );
    expect(rollbackSql).toContain('drop column if exists assignment_type');
    expect(rollbackSql).toContain(
      'drop table if exists public.staff_clinic_memberships'
    );
    expect(rollbackSql).toContain('drop table if exists public.staff_profiles');
  });
});
