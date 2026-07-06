import fs from 'fs';
import path from 'path';

describe('reservation reminder runs migration', () => {
  const migrationSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/migrations/20260706000200_reservation_reminder_runs.sql'
    ),
    'utf8'
  );
  const rollbackSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/rollbacks/20260706000200_reservation_reminder_runs_rollback.sql'
    ),
    'utf8'
  );

  it('creates internal_job_runs for service job state', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.internal_job_runs'
    );
    expect(migrationSql).toContain('job_name text primary key');
    expect(migrationSql).toContain('last_successful_run_at timestamptz');
    expect(migrationSql).toContain(
      'updated_at timestamptz not null default now()'
    );
  });

  it('enables RLS and grants service_role only', () => {
    expect(migrationSql).toContain(
      'alter table public.internal_job_runs enable row level security'
    );
    expect(migrationSql).toContain(
      'revoke all on table public.internal_job_runs from anon'
    );
    expect(migrationSql).toContain(
      'revoke all on table public.internal_job_runs from authenticated'
    );
    expect(migrationSql).toContain(
      'grant all on table public.internal_job_runs to service_role'
    );
    expect(migrationSql).not.toMatch(
      /create policy[\s\S]*on public\.internal_job_runs/i
    );
  });

  it('rolls back internal_job_runs', () => {
    expect(rollbackSql).toContain(
      'drop table if exists public.internal_job_runs'
    );
  });
});
