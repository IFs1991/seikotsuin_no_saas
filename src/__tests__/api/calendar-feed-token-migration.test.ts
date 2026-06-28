import fs from 'fs';
import path from 'path';

describe('calendar feed token migration', () => {
  const migrationSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/migrations/20260626000100_calendar_feed_tokens.sql'
    ),
    'utf8'
  );
  const rollbackSql = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../supabase/rollbacks/20260626000100_calendar_feed_tokens_rollback.sql'
    ),
    'utf8'
  );

  it('creates hashed token storage with feed target constraints', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.calendar_feed_tokens'
    );
    expect(migrationSql).toContain('token_hash text not null unique');
    expect(migrationSql).toContain('calendar_feed_tokens_type_check');
    expect(migrationSql).toContain('calendar_feed_tokens_target_check');
    expect(migrationSql).not.toContain('raw_token');
  });

  it('enables RLS and scoped token policies', () => {
    expect(migrationSql).toContain(
      'alter table public.calendar_feed_tokens enable row level security'
    );
    expect(migrationSql).toContain('calendar_feed_tokens_select_scoped');
    expect(migrationSql).toContain('calendar_feed_tokens_write_admin_only');
  });

  it('provides a rollback for token table removal', () => {
    expect(rollbackSql).toContain(
      'drop table if exists public.calendar_feed_tokens'
    );
  });
});
