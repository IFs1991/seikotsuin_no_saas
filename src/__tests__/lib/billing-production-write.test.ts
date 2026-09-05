const mockSubscription = jest.fn();
const mockScope = jest.fn();
jest.mock('@/lib/billing/admin', () => ({
  fetchBillingSubscription: (...args: unknown[]) => mockSubscription(...args),
}));
jest.mock('@/lib/supabase', () => ({
  createScopedAdminContext: (...args: unknown[]) => mockScope(...args),
}));
const originalEnv = process.env;
const permissions = {
  role: 'clinic_admin',
  clinic_id: 'clinic-a',
  clinic_scope_ids: ['clinic-a'],
};
const query = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(async () => ({
    data: { id: 'clinic-a', parent_id: 'org-a' },
    error: null,
  })),
};
const client = { from: jest.fn(() => query) };
describe('TASK-03 production business-write boundary', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_PILOT_MODE: 'false',
      ENABLE_BILLING: 'true',
      NEXT_PUBLIC_ENABLE_BILLING: 'true',
      ENABLE_BILLING_TENANT_GUARD: 'true',
      ENABLE_BILLING_OVERRIDES: 'false',
      BILLING_ENABLED_PLANS: 'group',
      STRIPE_SECRET_KEY: 'test-only',
      STRIPE_WEBHOOK_SECRET: 'test-only',
      STRIPE_PRICE_GROUP_BASE_ID: 'price_test',
      STRIPE_PRICE_STORE_ADDON_ID: 'price_test',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54331',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-only',
      SUPABASE_SERVICE_ROLE_KEY: 'test-only',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
    };
    mockScope.mockReturnValue({
      client,
      assertClinicInScope: (id: string) => {
        if (id !== 'clinic-a') throw new Error('forbidden clinic');
      },
    });
    mockSubscription.mockResolvedValue({ billing_state: 'active' });
  });
  afterEach(() => {
    process.env = originalEnv;
  });
  it('permits active company writes through the production gate', async () => {
    const { ensureScopedBusinessWriteAccess } =
      await import('@/lib/billing/business-write');
    await expect(
      ensureScopedBusinessWriteAccess({
        permissions,
        targetClinicId: 'clinic-a',
      })
    ).resolves.toMatchObject({
      mode: 'enforce',
      orgRootClinicId: 'org-a',
      billingState: 'active',
    });
    expect(mockSubscription).toHaveBeenCalledWith({
      client,
      orgRootClinicId: 'org-a',
    });
  });
  it('returns 503 before DB access for missing configuration', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { ensureScopedBusinessWriteAccess } =
      await import('@/lib/billing/business-write');
    await expect(
      ensureScopedBusinessWriteAccess({
        permissions,
        targetClinicId: 'clinic-a',
      })
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(mockScope).not.toHaveBeenCalled();
    expect(mockSubscription).not.toHaveBeenCalled();
  });
  it('keeps inactive subscriptions at 402', async () => {
    mockSubscription.mockResolvedValue({ billing_state: 'past_due_locked' });
    const { ensureScopedBusinessWriteAccess } =
      await import('@/lib/billing/business-write');
    await expect(
      ensureScopedBusinessWriteAccess({
        permissions,
        targetClinicId: 'clinic-a',
      })
    ).rejects.toMatchObject({ statusCode: 402 });
  });
  it('does not use company A entitlement for company B', async () => {
    const { ensureScopedBusinessWriteAccess } =
      await import('@/lib/billing/business-write');
    await expect(
      ensureScopedBusinessWriteAccess({
        permissions,
        targetClinicId: 'clinic-b',
      })
    ).rejects.toThrow('forbidden clinic');
    expect(client.from).not.toHaveBeenCalled();
    expect(mockSubscription).not.toHaveBeenCalled();
  });
});
