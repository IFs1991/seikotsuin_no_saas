/** @jest-environment node */

import { describe, expect, test } from '@jest/globals';
import {
  canUseBillingPortal,
  canUseBusinessReadAccess,
  canUseBusinessReadAccessWithOverride,
  canUseBusinessWriteAccess,
  canUseBusinessWriteAccessWithOverride,
  deriveBillingState,
  type DeriveBillingStateInput,
} from '@/lib/billing/state';

const NOW = new Date('2026-06-22T00:00:00.000Z');

function buildInput(
  overrides: Partial<DeriveBillingStateInput>
): DeriveBillingStateInput {
  return {
    stripeStatus: 'none',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    pastDueSince: null,
    graceUntil: null,
    now: NOW,
    ...overrides,
  };
}

describe('deriveBillingState', () => {
  test('maps no Stripe subscription to none', () => {
    expect(deriveBillingState(buildInput({ stripeStatus: null }))).toBe('none');
    expect(deriveBillingState(buildInput({ stripeStatus: 'none' }))).toBe(
      'none'
    );
  });

  test('maps active and trialing Stripe status to full-access states', () => {
    expect(deriveBillingState(buildInput({ stripeStatus: 'trialing' }))).toBe(
      'trialing'
    );
    expect(deriveBillingState(buildInput({ stripeStatus: 'active' }))).toBe(
      'active'
    );
  });

  test('uses cancel_scheduled only while current period remains open', () => {
    expect(
      deriveBillingState(
        buildInput({
          stripeStatus: 'active',
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date('2026-07-22T00:00:00.000Z'),
        })
      )
    ).toBe('cancel_scheduled');

    expect(
      deriveBillingState(
        buildInput({
          stripeStatus: 'active',
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date('2026-06-21T00:00:00.000Z'),
        })
      )
    ).toBe('active');
  });

  test('locks or graces past_due based on grace window', () => {
    expect(
      deriveBillingState(
        buildInput({
          stripeStatus: 'past_due',
          graceUntil: new Date('2026-06-29T00:00:00.000Z'),
        })
      )
    ).toBe('past_due_grace');

    expect(
      deriveBillingState(
        buildInput({
          stripeStatus: 'past_due',
          graceUntil: new Date('2026-06-21T00:00:00.000Z'),
        })
      )
    ).toBe('past_due_locked');
  });

  test('maps terminal and unknown statuses fail-closed', () => {
    expect(deriveBillingState(buildInput({ stripeStatus: 'canceled' }))).toBe(
      'canceled'
    );
    expect(
      deriveBillingState(buildInput({ stripeStatus: 'incomplete_expired' }))
    ).toBe('expired');
    expect(deriveBillingState(buildInput({ stripeStatus: 'paused' }))).toBe(
      'past_due_locked'
    );
    expect(
      deriveBillingState(buildInput({ stripeStatus: 'unexpected_status' }))
    ).toBe('past_due_locked');
  });

  test('active non-revoked override takes precedence until expiry', () => {
    expect(
      deriveBillingState(
        buildInput({
          stripeStatus: 'canceled',
          activeOverride: {
            state: 'allow_full_access',
            startsAt: new Date('2026-06-21T00:00:00.000Z'),
            expiresAt: new Date('2026-06-23T00:00:00.000Z'),
            revokedAt: null,
          },
        })
      )
    ).toBe('override_active');

    expect(
      deriveBillingState(
        buildInput({
          stripeStatus: 'canceled',
          activeOverride: {
            state: 'allow_full_access',
            startsAt: new Date('2026-06-21T00:00:00.000Z'),
            expiresAt: new Date('2026-06-23T00:00:00.000Z'),
            revokedAt: new Date('2026-06-21T12:00:00.000Z'),
          },
        })
      )
    ).toBe('canceled');
  });

  test('read/export override does not derive full write access state', () => {
    expect(
      deriveBillingState(
        buildInput({
          stripeStatus: 'canceled',
          activeOverride: {
            state: 'allow_read_export',
            startsAt: new Date('2026-06-21T00:00:00.000Z'),
            expiresAt: new Date('2026-06-23T00:00:00.000Z'),
            revokedAt: null,
          },
        })
      )
    ).toBe('canceled');
  });
});

describe('billing access helpers', () => {
  test('write access stays restricted to active-like states', () => {
    expect(canUseBusinessWriteAccess('trialing')).toBe(true);
    expect(canUseBusinessWriteAccess('active')).toBe(true);
    expect(canUseBusinessWriteAccess('cancel_scheduled')).toBe(true);
    expect(canUseBusinessWriteAccess('override_active')).toBe(true);
    expect(canUseBusinessWriteAccess('past_due_locked')).toBe(false);
    expect(canUseBusinessWriteAccess('canceled')).toBe(false);
  });

  test('read and portal access follow commercial baseline matrix', () => {
    expect(canUseBusinessReadAccess('past_due_locked')).toBe(true);
    expect(canUseBusinessReadAccess('none')).toBe(false);
    expect(canUseBillingPortal('past_due_locked')).toBe(true);
    expect(canUseBillingPortal('none')).toBe(false);
  });

  test('read/export override grants read but not write', () => {
    const activeOverride = {
      state: 'allow_read_export' as const,
      startsAt: new Date('2026-06-21T00:00:00.000Z'),
      expiresAt: new Date('2026-06-23T00:00:00.000Z'),
      revokedAt: null,
    };

    expect(
      canUseBusinessReadAccessWithOverride({
        state: 'canceled',
        activeOverride,
        now: NOW,
      })
    ).toBe(true);
    expect(
      canUseBusinessWriteAccessWithOverride({
        state: 'canceled',
        activeOverride,
        now: NOW,
      })
    ).toBe(false);
  });
});
