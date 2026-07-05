import fs from 'fs';
import path from 'path';

describe('LINE credentials migration', () => {
  const migrationSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/migrations/20260705000400_line_credentials.sql'
    ),
    'utf8'
  );
  const rollbackSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/rollbacks/20260705000400_line_credentials_rollback.sql'
    ),
    'utf8'
  );

  it('creates the service-role-only clinic_line_credentials table', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.clinic_line_credentials'
    );
    expect(migrationSql).toContain(
      'clinic_id uuid primary key references public.clinics(id) on delete cascade'
    );
    expect(migrationSql).toContain('channel_secret_encrypted text not null');
    expect(migrationSql).toContain(
      'assertion_private_key_encrypted text not null'
    );
    expect(migrationSql).toContain('access_token_encrypted text');
    expect(migrationSql).toContain('token_expires_at timestamptz');
  });

  it('enables RLS deny for normal roles and grants service_role only', () => {
    expect(migrationSql).toContain(
      'alter table public.clinic_line_credentials enable row level security'
    );
    expect(migrationSql).toContain(
      'revoke all on table public.clinic_line_credentials from anon'
    );
    expect(migrationSql).toContain(
      'revoke all on table public.clinic_line_credentials from authenticated'
    );
    expect(migrationSql).toContain(
      'grant all on table public.clinic_line_credentials to service_role'
    );
    expect(migrationSql).not.toMatch(
      /create policy[\s\S]*on public\.clinic_line_credentials/i
    );
  });

  it('adds and rolls back the line_booking_enabled entitlement column', () => {
    expect(migrationSql).toContain(
      'add column if not exists line_booking_enabled boolean not null default false'
    );
    expect(rollbackSql).toContain('drop column if exists line_booking_enabled');
  });

  it('rolls back credential storage and trigger', () => {
    expect(rollbackSql).toContain(
      'drop trigger if exists update_clinic_line_credentials_updated_at'
    );
    expect(rollbackSql).toContain(
      'drop table if exists public.clinic_line_credentials'
    );
  });
});
