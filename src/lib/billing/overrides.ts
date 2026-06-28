import 'server-only';

import type { SupabaseServerClient } from '@/lib/supabase';
import type { BillingOverride } from '@/lib/billing/state';
import { writeBillingAuditLog } from '@/lib/billing/audit';
import { toJsonObject } from '@/lib/billing/json';
import type { Database, Json } from '@/types/supabase';

export const BILLING_OVERRIDE_STATES = [
  'allow_full_access',
  'allow_read_export',
] as const;

export type BillingOverrideState = (typeof BILLING_OVERRIDE_STATES)[number];

export type BillingOverrideRow = {
  id: string;
  org_root_clinic_id: string;
  override_state: BillingOverrideState;
  reason: string;
  starts_at: string;
  expires_at: string;
  created_by_internal: string;
  revoked_at: string | null;
  revoked_by_internal: string | null;
  expired_audited_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type BillingOverrideInsert =
  Database['public']['Tables']['billing_overrides']['Insert'];

function isBillingOverrideState(value: string): value is BillingOverrideState {
  return BILLING_OVERRIDE_STATES.some(state => state === value);
}

function assertBillingOverrideRow(row: {
  id: string;
  org_root_clinic_id: string;
  override_state: string;
  reason: string;
  starts_at: string;
  expires_at: string;
  created_by_internal: string;
  revoked_at: string | null;
  revoked_by_internal: string | null;
  expired_audited_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}): BillingOverrideRow {
  if (!isBillingOverrideState(row.override_state)) {
    throw new Error('Unsupported billing override state');
  }

  return {
    ...row,
    override_state: row.override_state,
  };
}

function toBillingOverride(row: BillingOverrideRow): BillingOverride {
  return {
    state: row.override_state,
    startsAt: new Date(row.starts_at),
    expiresAt: new Date(row.expires_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  };
}

function assertValidDate(name: string, value: Date) {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${name} must be a valid date`);
  }
}

function normalizeReason(reason: string) {
  const normalized = reason.trim();
  if (normalized.length === 0) {
    throw new Error('Billing override reason is required');
  }
  return normalized;
}

export async function fetchActiveBillingOverride(input: {
  client: SupabaseServerClient;
  orgRootClinicId: string;
  now: Date;
}): Promise<BillingOverride | null> {
  const nowIso = input.now.toISOString();
  const { data, error } = await input.client
    .from('billing_overrides')
    .select(
      'id, org_root_clinic_id, override_state, reason, starts_at, expires_at, created_by_internal, revoked_at, revoked_by_internal, expired_audited_at, metadata, created_at, updated_at'
    )
    .eq('org_root_clinic_id', input.orgRootClinicId)
    .lte('starts_at', nowIso)
    .gt('expires_at', nowIso)
    .is('revoked_at', null)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toBillingOverride(assertBillingOverrideRow(data)) : null;
}

export async function createBillingOverride(input: {
  client: SupabaseServerClient;
  orgRootClinicId: string;
  overrideState: BillingOverrideState;
  reason: string;
  expiresAt: Date;
  startsAt?: Date;
  internalActor: string;
  requestId?: string | null;
  metadata?: unknown;
}) {
  const startsAt = input.startsAt ?? new Date();
  assertValidDate('startsAt', startsAt);
  assertValidDate('expiresAt', input.expiresAt);

  if (input.expiresAt <= startsAt) {
    throw new Error('Billing override expires_at must be after starts_at');
  }

  const insert: BillingOverrideInsert = {
    org_root_clinic_id: input.orgRootClinicId,
    override_state: input.overrideState,
    reason: normalizeReason(input.reason),
    starts_at: startsAt.toISOString(),
    expires_at: input.expiresAt.toISOString(),
    created_by_internal: input.internalActor,
    metadata:
      input.metadata === undefined
        ? ({} satisfies Json)
        : toJsonObject(input.metadata),
  };

  const { data, error } = await input.client
    .from('billing_overrides')
    .insert(insert)
    .select(
      'id, org_root_clinic_id, override_state, reason, starts_at, expires_at, created_by_internal, revoked_at, revoked_by_internal, expired_audited_at, metadata, created_at, updated_at'
    )
    .single();

  if (error) {
    throw error;
  }

  const override = assertBillingOverrideRow(data);
  await writeBillingAuditLog({
    client: input.client,
    audit: {
      orgRootClinicId: input.orgRootClinicId,
      actorType: 'internal',
      internalActor: input.internalActor,
      eventType: 'billing.override_created',
      afterState: override,
      requestId: input.requestId ?? null,
      metadata: { override_id: override.id },
    },
  });

  return override;
}

export async function revokeBillingOverride(input: {
  client: SupabaseServerClient;
  overrideId: string;
  internalActor: string;
  requestId?: string | null;
}) {
  const beforeResult = await input.client
    .from('billing_overrides')
    .select(
      'id, org_root_clinic_id, override_state, reason, starts_at, expires_at, created_by_internal, revoked_at, revoked_by_internal, expired_audited_at, metadata, created_at, updated_at'
    )
    .eq('id', input.overrideId)
    .maybeSingle();

  if (beforeResult.error) {
    throw beforeResult.error;
  }

  if (!beforeResult.data) {
    throw new Error('Billing override not found');
  }

  const before = assertBillingOverrideRow(beforeResult.data);
  const { data, error } = await input.client
    .from('billing_overrides')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by_internal: input.internalActor,
    })
    .eq('id', input.overrideId)
    .select(
      'id, org_root_clinic_id, override_state, reason, starts_at, expires_at, created_by_internal, revoked_at, revoked_by_internal, expired_audited_at, metadata, created_at, updated_at'
    )
    .single();

  if (error) {
    throw error;
  }

  const after = assertBillingOverrideRow(data);
  await writeBillingAuditLog({
    client: input.client,
    audit: {
      orgRootClinicId: after.org_root_clinic_id,
      actorType: 'internal',
      internalActor: input.internalActor,
      eventType: 'billing.override_revoked',
      beforeState: before,
      afterState: after,
      requestId: input.requestId ?? null,
      metadata: { override_id: after.id },
    },
  });

  return after;
}

export async function expireBillingOverrides(input: {
  client: SupabaseServerClient;
  now: Date;
  internalActor: string;
  requestId?: string | null;
}) {
  const nowIso = input.now.toISOString();
  const { data, error } = await input.client
    .from('billing_overrides')
    .select(
      'id, org_root_clinic_id, override_state, reason, starts_at, expires_at, created_by_internal, revoked_at, revoked_by_internal, expired_audited_at, metadata, created_at, updated_at'
    )
    .lte('expires_at', nowIso)
    .is('revoked_at', null)
    .is('expired_audited_at', null);

  if (error) {
    throw error;
  }

  const expired = (data ?? []).map(assertBillingOverrideRow);
  for (const override of expired) {
    const updateResult = await input.client
      .from('billing_overrides')
      .update({ expired_audited_at: nowIso })
      .eq('id', override.id)
      .is('expired_audited_at', null)
      .select(
        'id, org_root_clinic_id, override_state, reason, starts_at, expires_at, created_by_internal, revoked_at, revoked_by_internal, expired_audited_at, metadata, created_at, updated_at'
      )
      .maybeSingle();

    if (updateResult.error) {
      throw updateResult.error;
    }

    if (!updateResult.data) {
      continue;
    }

    await writeBillingAuditLog({
      client: input.client,
      audit: {
        orgRootClinicId: override.org_root_clinic_id,
        actorType: 'internal',
        internalActor: input.internalActor,
        eventType: 'billing.override_expired',
        beforeState: override,
        afterState: assertBillingOverrideRow(updateResult.data),
        requestId: input.requestId ?? null,
        metadata: { override_id: override.id },
      },
    });
  }

  return expired;
}
