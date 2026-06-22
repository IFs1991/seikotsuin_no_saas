import type { BillingState } from '@/lib/billing/config';

export type BillingOverride = {
  state: 'allow_full_access' | 'allow_read_export';
  startsAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type DeriveBillingStateInput = {
  stripeStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  pastDueSince: Date | null;
  graceUntil: Date | null;
  activeOverride?: BillingOverride | null;
  now: Date;
};

function isActiveOverride(
  override: BillingOverride | null | undefined,
  now: Date
) {
  return (
    override !== null &&
    override !== undefined &&
    override.revokedAt === null &&
    override.startsAt <= now &&
    override.expiresAt > now
  );
}

function isStillInsideCurrentPeriod(currentPeriodEnd: Date | null, now: Date) {
  return currentPeriodEnd === null || currentPeriodEnd > now;
}

export function deriveBillingState(
  input: DeriveBillingStateInput
): BillingState {
  if (isActiveOverride(input.activeOverride, input.now)) {
    return 'override_active';
  }

  const stripeStatus = input.stripeStatus?.trim().toLowerCase() ?? 'none';

  if (stripeStatus === 'none' || stripeStatus.length === 0) {
    return 'none';
  }

  if (
    input.cancelAtPeriodEnd &&
    (stripeStatus === 'trialing' || stripeStatus === 'active') &&
    isStillInsideCurrentPeriod(input.currentPeriodEnd, input.now)
  ) {
    return 'cancel_scheduled';
  }

  if (stripeStatus === 'trialing') {
    return 'trialing';
  }

  if (stripeStatus === 'active') {
    return 'active';
  }

  if (stripeStatus === 'canceled') {
    return 'canceled';
  }

  if (stripeStatus === 'incomplete_expired') {
    return 'expired';
  }

  if (stripeStatus === 'past_due') {
    return input.graceUntil !== null && input.graceUntil > input.now
      ? 'past_due_grace'
      : 'past_due_locked';
  }

  return 'past_due_locked';
}

export function canUseBillingPortal(state: BillingState) {
  return [
    'trialing',
    'active',
    'cancel_scheduled',
    'past_due_grace',
    'past_due_locked',
  ].includes(state);
}

export function canUseBusinessWriteAccess(state: BillingState) {
  return ['trialing', 'active', 'cancel_scheduled', 'override_active'].includes(
    state
  );
}

export function canUseBusinessReadAccess(state: BillingState) {
  return [
    'trialing',
    'active',
    'cancel_scheduled',
    'past_due_grace',
    'past_due_locked',
    'override_active',
  ].includes(state);
}
