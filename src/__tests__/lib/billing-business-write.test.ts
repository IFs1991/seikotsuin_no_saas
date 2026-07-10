import {
  isSubscriptionWritable,
  resolveBusinessWriteGateMode,
} from '@/lib/billing/business-write';
import { ERROR_CODES, getStatusCodeFromErrorCode } from '@/lib/error-handler';

describe('business billing write gate', () => {
  describe('resolveBusinessWriteGateMode', () => {
    it('keeps pilot environments backward compatible while billing is disabled', () => {
      expect(
        resolveBusinessWriteGateMode({
          nodeEnv: 'production',
          pilotMode: true,
          billingEnabled: false,
          billingUiEnabled: false,
          tenantGuardEnabled: false,
        })
      ).toBe('bypass');
    });

    it('fails closed when commercial production billing flags disagree', () => {
      expect(
        resolveBusinessWriteGateMode({
          nodeEnv: 'production',
          pilotMode: false,
          billingEnabled: true,
          billingUiEnabled: false,
          tenantGuardEnabled: true,
        })
      ).toBe('misconfigured');
    });

    it('enforces the gate when server, UI, and tenant guard are enabled', () => {
      expect(
        resolveBusinessWriteGateMode({
          nodeEnv: 'production',
          pilotMode: false,
          billingEnabled: true,
          billingUiEnabled: true,
          tenantGuardEnabled: true,
        })
      ).toBe('enforce');
    });
  });

  describe('subscription state', () => {
    const now = new Date('2026-07-10T00:00:00.000Z');

    it.each(['trialing', 'active', 'cancel_scheduled'] as const)(
      'allows %s subscriptions to write',
      billingState => {
        expect(isSubscriptionWritable({ billingState, now })).toBe(true);
      }
    );

    it.each([
      null,
      'none',
      'checkout_pending',
      'past_due_grace',
      'past_due_locked',
      'canceled',
      'expired',
    ] as const)('denies %s subscriptions from writing', billingState => {
      expect(isSubscriptionWritable({ billingState, now })).toBe(false);
    });

    it('allows only an active full-access override', () => {
      expect(
        isSubscriptionWritable({
          billingState: 'past_due_locked',
          now,
          activeOverride: {
            state: 'allow_full_access',
            startsAt: new Date('2026-07-09T00:00:00.000Z'),
            expiresAt: new Date('2026-07-11T00:00:00.000Z'),
            revokedAt: null,
          },
        })
      ).toBe(true);

      expect(
        isSubscriptionWritable({
          billingState: null,
          now,
          activeOverride: {
            state: 'allow_full_access',
            startsAt: new Date('2026-07-09T00:00:00.000Z'),
            expiresAt: new Date('2026-07-11T00:00:00.000Z'),
            revokedAt: null,
          },
        })
      ).toBe(true);

      expect(
        isSubscriptionWritable({
          billingState: 'past_due_locked',
          now,
          activeOverride: {
            state: 'allow_read_export',
            startsAt: new Date('2026-07-09T00:00:00.000Z'),
            expiresAt: new Date('2026-07-11T00:00:00.000Z'),
            revokedAt: null,
          },
        })
      ).toBe(false);

      expect(
        isSubscriptionWritable({
          billingState: 'override_active',
          now,
        })
      ).toBe(false);
    });
  });

  it('maps stable billing errors to their HTTP statuses', () => {
    expect(getStatusCodeFromErrorCode(ERROR_CODES.SUBSCRIPTION_INACTIVE)).toBe(
      402
    );
    expect(
      getStatusCodeFromErrorCode(ERROR_CODES.BILLING_CONFIGURATION_ERROR)
    ).toBe(503);
  });
});
