/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Billing commercial operations migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260624000100_billing_commercial_ops.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260624000100_billing_commercial_ops_rollback.sql'
  );

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');

  test('creates service-role-only audit logs', () => {
    expect(migrationSql).toContain('create table public.billing_audit_logs');
    expect(migrationSql).toContain(
      "actor_type in ('user', 'stripe', 'system', 'internal')"
    );
    expect(migrationSql).toContain('event_type text not null');
    expect(migrationSql).toContain('before_state jsonb');
    expect(migrationSql).toContain('after_state jsonb');
    expect(migrationSql).toContain(
      'alter table public.billing_audit_logs enable row level security'
    );
    expect(migrationSql).toContain(
      'create policy "service_role full access billing audit logs"'
    );
    expect(migrationSql).toContain(
      'revoke all on table public.billing_audit_logs from anon, authenticated'
    );
    expect(migrationSql).not.toContain(
      'grant select on table public.billing_audit_logs to authenticated'
    );
  });

  test('creates expiring internal-only overrides', () => {
    expect(migrationSql).toContain('create table public.billing_overrides');
    expect(migrationSql).toContain(
      "override_state in ('allow_full_access', 'allow_read_export')"
    );
    expect(migrationSql).toContain('reason text not null');
    expect(migrationSql).toContain('check (length(btrim(reason)) > 0)');
    expect(migrationSql).toContain(
      'constraint billing_overrides_expires_after_starts_check'
    );
    expect(migrationSql).toContain('expired_audited_at timestamptz');
    expect(migrationSql).toContain(
      'alter table public.billing_overrides enable row level security'
    );
    expect(migrationSql).toContain(
      'create policy "service_role full access billing overrides"'
    );
    expect(migrationSql).toContain(
      'revoke all on table public.billing_overrides from anon, authenticated'
    );
    expect(migrationSql).not.toContain(
      'grant select on table public.billing_overrides to authenticated'
    );
  });

  test('rollback refuses to destroy commercial ops records', () => {
    expect(rollbackSql).toContain(
      'Refusing rollback: billing_overrides contains data'
    );
    expect(rollbackSql).toContain(
      'Refusing rollback: billing_audit_logs contains data'
    );
    expect(rollbackSql).toContain(
      'drop table if exists public.billing_overrides'
    );
    expect(rollbackSql).toContain(
      'drop table if exists public.billing_audit_logs'
    );
  });
});
