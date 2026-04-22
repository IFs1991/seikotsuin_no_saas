import * as fs from 'fs';
import * as path from 'path';

const migrationPath = path.resolve(
  __dirname,
  '../../../supabase/migrations/20260422000100_admin_notifications_realtime.sql'
);
const rollbackPath = path.resolve(
  __dirname,
  '../../../supabase/rollbacks/20260422000100_admin_notifications_realtime_rollback.sql'
);
const specPath = path.resolve(
  __dirname,
  '../../../docs/stabilization/spec-admin-notifications-realtime-v0.1.md'
);

describe('admin notifications realtime migration', () => {
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');
  const spec = fs.readFileSync(specPath, 'utf-8');

  it('spec と rollback plan を持つ', () => {
    expect(spec).toContain('Rollback Plan');
    expect(spec).toContain('DOD-08');
    expect(spec).toContain('DOD-10');
    expect(migrationSql).toContain(
      'docs/stabilization/spec-admin-notifications-realtime-v0.1.md'
    );
    expect(rollbackSql).toContain(
      'docs/stabilization/spec-admin-notifications-realtime-v0.1.md'
    );
  });

  it('notifications だけを supabase_realtime publication に追加する', () => {
    expect(migrationSql).toMatch(
      /alter publication supabase_realtime add table public\.notifications/i
    );
    expect(migrationSql).toContain('pg_publication_tables');
    expect(migrationSql).not.toMatch(/alter table public\.notifications/i);
  });

  it('rollback は notifications だけを publication から外す', () => {
    expect(rollbackSql).toMatch(
      /alter publication supabase_realtime drop table public\.notifications/i
    );
    expect(rollbackSql).toContain('pg_publication_tables');
    expect(rollbackSql).not.toMatch(/drop table if exists/i);
  });
});
