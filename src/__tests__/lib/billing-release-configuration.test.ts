import { inspectBillingConfiguration } from '@/lib/billing/configuration-policy';
import { validateProductionEnvironment } from '@/lib/env';

const configured = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_PILOT_MODE: 'false',
  ENABLE_BILLING: 'true',
  NEXT_PUBLIC_ENABLE_BILLING: 'true',
  ENABLE_BILLING_TENANT_GUARD: 'true',
  BILLING_ENABLED_PLANS: 'group',
  STRIPE_SECRET_KEY: 'synthetic-secret',
  STRIPE_WEBHOOK_SECRET: 'synthetic-webhook',
  STRIPE_PRICE_GROUP_BASE_ID: 'price_synthetic_base',
  STRIPE_PRICE_STORE_ADDON_ID: 'price_synthetic_store',
};
describe('TASK-03 shared commercial configuration', () => {
  it('accepts configured production with pilot OFF', () => {
    expect(inspectBillingConfiguration(configured)).toMatchObject({
      mode: 'enforce',
      missing: [],
      invalid: [],
    });
  });
  it('lists every missing key without revealing values', () => {
    const result = inspectBillingConfiguration({
      ...configured,
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_PRICE_GROUP_BASE_ID: '',
    });
    expect(result.missing).toEqual([
      'STRIPE_PRICE_GROUP_BASE_ID',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ]);
    expect(JSON.stringify(result)).not.toContain('price_synthetic');
  });
  it.each([
    'ENABLE_BILLING',
    'NEXT_PUBLIC_ENABLE_BILLING',
    'ENABLE_BILLING_TENANT_GUARD',
  ])(
    'reports contradictory %s as configuration, not subscription failure',
    key => {
      expect(
        inspectBillingConfiguration({ ...configured, [key]: 'false' })
      ).toMatchObject({
        mode: 'misconfigured',
        invalid: expect.arrayContaining([key]),
      });
    }
  );
  it.each(['', 'unrecognized-plan'])(
    'rejects missing/unknown enabled plans without leaking input',
    value => {
      const result = inspectBillingConfiguration({
        ...configured,
        BILLING_ENABLED_PLANS: value,
      });
      expect(result.invalid).toContain('BILLING_ENABLED_PLANS');
      expect(JSON.stringify(result)).not.toContain('unrecognized-plan');
    }
  );
  it('does not require an unused plan price', () => {
    expect(inspectBillingConfiguration(configured).missing).not.toContain(
      'STRIPE_PRICE_SINGLE_CLINIC_ID'
    );
    expect(validateProductionEnvironment(configured).missing).not.toContain(
      'STRIPE_PRICE_SINGLE_CLINIC_ID'
    );
  });
});
