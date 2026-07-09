import fs from 'fs';
import path from 'path';

describe('LINE message outbox migration', () => {
  const migrationSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/migrations/20260705000500_line_message_outbox.sql'
    ),
    'utf8'
  );
  const rollbackSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/rollbacks/20260705000500_line_message_outbox_rollback.sql'
    ),
    'utf8'
  );

  it('creates the LINE message outbox table', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.line_message_outbox'
    );
    expect(migrationSql).toContain('clinic_id uuid not null');
    expect(migrationSql).toContain('line_user_id text not null');
    expect(migrationSql).toContain('message_type text not null');
    expect(migrationSql).toContain('payload jsonb not null');
    expect(migrationSql).toContain(
      "check (status in ('pending', 'sent', 'failed'))"
    );
    expect(migrationSql).toContain('attempts integer not null default 0');
    expect(migrationSql).toContain('next_attempt_at timestamptz');
  });

  it('enables RLS deny for normal roles and grants service_role only', () => {
    expect(migrationSql).toContain(
      'alter table public.line_message_outbox enable row level security'
    );
    expect(migrationSql).toContain(
      'revoke all on table public.line_message_outbox from anon'
    );
    expect(migrationSql).toContain(
      'revoke all on table public.line_message_outbox from authenticated'
    );
    expect(migrationSql).toContain(
      'grant all on table public.line_message_outbox to service_role'
    );
    expect(migrationSql).not.toMatch(
      /create policy[\s\S]*on public\.line_message_outbox/i
    );
  });

  it('rolls back the outbox table', () => {
    expect(rollbackSql).toContain(
      'drop table if exists public.line_message_outbox'
    );
  });
});
