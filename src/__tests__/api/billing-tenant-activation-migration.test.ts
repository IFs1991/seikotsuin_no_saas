/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Billing tenant activation migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260623000100_billing_tenant_activation.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260623000100_billing_tenant_activation_rollback.sql'
  );

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');

  test('adds billing activation state columns to clinics', () => {
    expect(migrationSql).toContain(
      'add column if not exists billing_activation_status text not null default'
    );
    expect(migrationSql).toContain(
      'add column if not exists billing_activation_requested_at timestamptz'
    );
    expect(migrationSql).toContain(
      'add column if not exists billing_activated_at timestamptz'
    );
    expect(migrationSql).toContain(
      'add column if not exists billing_activation_failed_at timestamptz'
    );
    expect(migrationSql).toContain(
      'add column if not exists billing_activation_error text'
    );
    expect(migrationSql).toContain("'pending_billing'");
    expect(migrationSql).toContain("'billing_failed'");
  });

  test('creates serialized activation RPC with subscription row locking', () => {
    expect(migrationSql).toContain(
      'create or replace function public.activate_billable_store_if_capacity'
    );
    expect(migrationSql).toContain('security definer');
    expect(migrationSql).toContain('for update');
    expect(migrationSql).toContain(
      'where org_root_clinic_id = p_org_root_clinic_id'
    );
    expect(migrationSql).toContain('v_active_count >= v_allowed_count');
    expect(migrationSql).toContain("'capacity_exceeded'");
  });

  test('keeps activation RPC service-role only', () => {
    expect(migrationSql).toContain(
      'revoke all on function public.activate_billable_store_if_capacity(uuid, uuid)'
    );
    expect(migrationSql).toContain('from public, anon, authenticated');
    expect(migrationSql).toContain(
      'grant execute on function public.activate_billable_store_if_capacity(uuid, uuid)'
    );
    expect(migrationSql).toContain('to service_role');
  });

  test('rollback refuses to drop pending or failed activation state', () => {
    expect(rollbackSql).toContain(
      "billing_activation_status in ('pending_billing', 'billing_failed')"
    );
    expect(rollbackSql).toContain(
      'Refusing rollback: clinics contain pending or failed billing activation rows'
    );
    expect(rollbackSql).toContain(
      'drop function if exists public.activate_billable_store_if_capacity(uuid, uuid)'
    );
  });
});
