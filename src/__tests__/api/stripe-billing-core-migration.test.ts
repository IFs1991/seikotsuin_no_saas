/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Stripe billing core migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20260622000100_stripe_billing_core.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '../../../supabase/rollbacks/20260622000100_stripe_billing_core_rollback.sql'
  );
  const specPath = path.resolve(
    __dirname,
    '../../../docs/stabilization/spec-stripe-billing-commercial-baseline-v0.7.md'
  );

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');

  test('migration, rollback, and v0.7 spec exist', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);
    expect(fs.existsSync(specPath)).toBe(true);
  });

  test('creates subscriptions table with checkout pending and Stripe sync columns', () => {
    expect(migrationSql).toContain('create table public.subscriptions');
    expect(migrationSql).toContain('org_root_clinic_id uuid not null unique');
    expect(migrationSql).toContain(
      "check (plan_code in ('single_clinic', 'group'))"
    );
    expect(migrationSql).toContain('stripe_checkout_session_id text unique');
    expect(migrationSql).toContain('checkout_started_at timestamptz');
    expect(migrationSql).toContain('checkout_expires_at timestamptz');
    expect(migrationSql).toContain('checkout_plan_code text');
    expect(migrationSql).toContain(
      'stripe_group_base_subscription_item_id text unique'
    );
    expect(migrationSql).toContain(
      'stripe_store_subscription_item_id text unique'
    );
    expect(migrationSql).toContain(
      'trial_consumed boolean not null default false'
    );
    expect(migrationSql).toContain('last_stripe_event_created timestamptz');
  });

  test('captures v0.7 included-store commercial baseline', () => {
    expect(migrationSql).toContain(
      'included_store_quantity integer not null default 5'
    );
    expect(migrationSql).toContain(
      'paid_extra_store_quantity integer not null default 0'
    );
    expect(migrationSql).toContain('check (included_store_quantity >= 0)');
    expect(migrationSql).toContain('check (paid_extra_store_quantity >= 0)');
    expect(migrationSql).toContain(
      'Stripe store add-on quantity beyond included_store_quantity'
    );
    expect(migrationSql).not.toContain('paid_store_quantity');
  });

  test('stores app-derived billing states instead of relying on raw Stripe status', () => {
    const expectedStates = [
      'none',
      'checkout_pending',
      'trialing',
      'active',
      'cancel_scheduled',
      'past_due_grace',
      'past_due_locked',
      'canceled',
      'expired',
      'override_active',
    ];

    for (const state of expectedStates) {
      expect(migrationSql).toContain(`'${state}'`);
    }

    expect(migrationSql).toContain(
      "stripe_status text not null default 'none'"
    );
    expect(migrationSql).toContain(
      "billing_state text not null default 'none'"
    );
  });

  test('subscriptions RLS requires customer admin role and org root scope', () => {
    expect(migrationSql).toContain(
      'alter table public.subscriptions enable row level security'
    );
    expect(migrationSql).toContain(
      'create policy "customer admin can read own subscription"'
    );
    expect(migrationSql).toContain('app_private.is_admin()');
    expect(migrationSql).toContain(
      'app_private.can_access_clinic(org_root_clinic_id)'
    );
    expect(migrationSql).toContain(
      'grant select on table public.subscriptions to authenticated'
    );
    expect(migrationSql).not.toContain('app_private.jwt_role()');
    expect(migrationSql).not.toContain(
      'grant insert on table public.subscriptions to authenticated'
    );
    expect(migrationSql).not.toContain(
      'grant update on table public.subscriptions to authenticated'
    );
    expect(migrationSql).not.toContain(
      'grant delete on table public.subscriptions to authenticated'
    );
  });

  test('webhook events are internal service-role records only', () => {
    expect(migrationSql).toContain('create table public.stripe_webhook_events');
    expect(migrationSql).toContain('stripe_event_id text not null unique');
    expect(migrationSql).toContain('processing_status text not null default');
    expect(migrationSql).toContain(
      "processing_status in (\n        'received',\n        'processing',\n        'processed',\n        'ignored',\n        'failed'"
    );
    expect(migrationSql).toContain(
      'alter table public.stripe_webhook_events enable row level security'
    );
    expect(migrationSql).toContain(
      'create policy "service_role full access stripe webhook events"'
    );
    expect(migrationSql).toContain(
      'revoke all on table public.stripe_webhook_events from anon, authenticated'
    );
    expect(migrationSql).toContain(
      'grant all on table public.stripe_webhook_events to service_role'
    );
    expect(migrationSql).not.toContain(
      'grant select on table public.stripe_webhook_events to authenticated'
    );
  });

  test('org root guard rejects child clinic contract subjects', () => {
    expect(migrationSql).toContain(
      'create or replace function app_private.assert_subscription_org_root_clinic()'
    );
    expect(migrationSql).toContain('select c.parent_id');
    expect(migrationSql).toContain(
      "raise exception 'subscriptions.org_root_clinic_id must reference a root clinic'"
    );
    expect(migrationSql).toContain(
      'create trigger subscriptions_org_root_clinic_guard'
    );
  });

  test('rollback refuses to destroy persisted billing data', () => {
    expect(rollbackSql).toContain(
      'Refusing rollback: stripe_webhook_events contains data'
    );
    expect(rollbackSql).toContain(
      'Refusing rollback: subscriptions contains data'
    );
    expect(rollbackSql).toContain(
      'drop table if exists public.stripe_webhook_events'
    );
    expect(rollbackSql).toContain('drop table if exists public.subscriptions');
    expect(rollbackSql).toContain(
      'drop function if exists app_private.assert_subscription_org_root_clinic()'
    );
  });
});
