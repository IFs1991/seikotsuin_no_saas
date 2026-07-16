/** @jest-environment node */

import { describe, expect, test, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const mockProcessApiRequest = jest.fn();
const mockLogError = jest.fn();
const mockCreateScopedAdminContext = jest.fn();
const mockResolveChildClinicInScope = jest.fn();
const mockCreateAdminClient = jest.fn();
const mockResolveOrgRootClinicForBilling = jest.fn();
const mockFetchBillingSubscription = jest.fn();
const mockCountActiveChildClinics = jest.fn();
const mockHasBlockingBillingState = jest.fn();
const mockBuildBillingLineItems = jest.fn();
const mockGetStripeClient = jest.fn();
const mockWriteBillingAuditLog = jest.fn();
const mockFetchTenantBillingSubscription = jest.fn();
const mockBuildStoreActivationPlan = jest.fn();
const mockEnsureStripeStoreAddOnQuantity = jest.fn();
const mockActivateBillableStoreIfCapacity = jest.fn();
const mockIsTenantBillingGuardActive = jest.fn();
const mockMarkClinicBillingActivationFailed = jest.fn();
const mockLogAdminAction = jest.fn();
const mockUpgradeSingleToGroupSubscription = jest.fn();

jest.mock('@/lib/api-helpers', () => ({
  createErrorResponse: (
    error: string,
    status = 400,
    details?: Record<string, unknown>
  ) =>
    Response.json(
      { success: false, error, ...(details ? { details } : {}) },
      { status }
    ),
  createSuccessResponse: (data: unknown, status = 200) =>
    Response.json({ success: true, data }, { status }),
  logError: mockLogError,
  processApiRequest: mockProcessApiRequest,
  sanitizeInput: (value: unknown) => value,
}));

jest.mock('@/lib/billing/config', () => ({
  assertBillingPriceEnv: () => ({
    enabledPlans: ['single_clinic', 'group'],
    priceIds: {
      singleClinic: 'price_single',
      groupBase: 'price_group',
      storeAddon: 'price_store',
    },
  }),
  assertBillingServerEnv: () => ({
    enabledPlans: ['single_clinic', 'group'],
    priceIds: {
      singleClinic: 'price_single',
      groupBase: 'price_group',
      storeAddon: 'price_store',
    },
  }),
  isBillingUpgradeEnabled: () => true,
}));

jest.mock('@/lib/billing/upgrade', () => {
  const actual = jest.requireActual('@/lib/billing/upgrade');
  return {
    ...actual,
    upgradeSingleToGroupSubscription: mockUpgradeSingleToGroupSubscription,
  };
});

jest.mock('@/lib/billing/admin', () => ({
  countActiveChildClinics: mockCountActiveChildClinics,
  fetchBillingSubscription: mockFetchBillingSubscription,
  hasBlockingBillingState: mockHasBlockingBillingState,
  resolveOrgRootClinicForBilling: mockResolveOrgRootClinicForBilling,
}));

jest.mock('@/lib/billing/plans', () => ({
  buildBillingLineItems: mockBuildBillingLineItems,
}));

jest.mock('@/lib/stripe/server', () => ({
  getStripeClient: mockGetStripeClient,
}));

jest.mock('@/lib/env', () => ({
  assertEnv: () => 'http://localhost',
  env: {
    NEXT_PUBLIC_APP_ENV: 'test',
  },
}));

jest.mock('@/lib/supabase/scoped-admin', () => ({
  createScopedAdminContext: mockCreateScopedAdminContext,
  resolveChildClinicInScope: mockResolveChildClinicInScope,
  ScopeAccessError: class ScopeAccessError extends Error {},
  ScopeNotConfiguredError: class ScopeNotConfiguredError extends Error {},
}));

jest.mock('@/lib/supabase', () => ({
  createAdminClient: mockCreateAdminClient,
}));

jest.mock('@/lib/billing/audit', () => ({
  writeBillingAuditLog: mockWriteBillingAuditLog,
}));

jest.mock('@/lib/billing/tenant-activation', () => ({
  activateBillableStoreIfCapacity: mockActivateBillableStoreIfCapacity,
  buildStoreActivationPlan: mockBuildStoreActivationPlan,
  ensureStripeStoreAddOnQuantity: mockEnsureStripeStoreAddOnQuantity,
  fetchTenantBillingSubscription: mockFetchTenantBillingSubscription,
  isTenantBillingGuardActive: mockIsTenantBillingGuardActive,
  markClinicBillingActivationFailed: mockMarkClinicBillingActivationFailed,
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: {
    logAdminAction: mockLogAdminAction,
  },
}));

function createSubscriptionsUpsertClient() {
  const subscriptionsQuery = {
    upsert: jest.fn().mockResolvedValue({ error: null }),
  };
  return {
    client: {
      from: jest.fn((table: string) => {
        if (table !== 'subscriptions') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return subscriptionsQuery;
      }),
    },
    subscriptionsQuery,
  };
}

function mockAdminAuth(body?: unknown) {
  mockProcessApiRequest.mockResolvedValue({
    success: true,
    auth: {
      id: 'admin-user-1',
      email: 'admin@example.com',
      role: 'admin',
    },
    permissions: {
      role: 'admin',
      clinic_id: null,
      clinic_scope_ids: ['root-clinic-1'],
    },
    supabase: {},
    body,
  });
}

describe('billing admin audit events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteBillingAuditLog.mockResolvedValue(undefined);
    mockHasBlockingBillingState.mockReturnValue(false);
    mockBuildBillingLineItems.mockReturnValue([{ price: 'price_group' }]);
  });

  test('checkout route writes checkout_started audit log', async () => {
    const subscription = {
      org_root_clinic_id: 'root-clinic-1',
      stripe_customer_id: 'cus_existing',
      stripe_status: 'none',
      trial_consumed: false,
    };
    const adminClient = createSubscriptionsUpsertClient();

    mockAdminAuth({ plan_code: 'group' });
    mockCreateScopedAdminContext.mockReturnValue({
      client: adminClient.client,
      scopedClinicIds: ['root-clinic-1'],
    });
    mockResolveOrgRootClinicForBilling.mockResolvedValue({
      id: 'root-clinic-1',
      name: 'Root Clinic',
    });
    mockFetchBillingSubscription.mockResolvedValue(subscription);
    mockCountActiveChildClinics.mockResolvedValue(2);
    mockGetStripeClient.mockReturnValue({
      customers: {
        create: jest.fn(),
      },
      checkout: {
        sessions: {
          create: jest.fn().mockResolvedValue({
            id: 'cs_test_123',
            url: 'https://checkout.stripe.test/session',
            expires_at: 1780000000,
          }),
        },
      },
    });

    const { POST } = await import('@/app/api/admin/billing/checkout/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/billing/checkout', {
        method: 'POST',
        headers: {
          'x-request-id': 'req-checkout',
        },
        body: JSON.stringify({ plan_code: 'group' }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockWriteBillingAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        client: adminClient.client,
        audit: expect.objectContaining({
          orgRootClinicId: 'root-clinic-1',
          actorType: 'user',
          actorUserId: 'admin-user-1',
          eventType: 'billing.checkout_started',
          beforeState: subscription,
          requestId: 'req-checkout',
          metadata: expect.objectContaining({
            stripe_customer_id: 'cus_existing',
            stripe_checkout_session_id: 'cs_test_123',
          }),
        }),
      })
    );
  });

  test('portal route writes portal_opened audit log', async () => {
    const subscription = {
      org_root_clinic_id: 'root-clinic-1',
      stripe_customer_id: 'cus_existing',
    };
    const adminClient = {
      from: jest.fn(),
    };

    mockAdminAuth();
    mockCreateScopedAdminContext.mockReturnValue({
      client: adminClient,
      scopedClinicIds: ['root-clinic-1'],
    });
    mockResolveOrgRootClinicForBilling.mockResolvedValue({
      id: 'root-clinic-1',
      name: 'Root Clinic',
    });
    mockFetchBillingSubscription.mockResolvedValue(subscription);
    mockGetStripeClient.mockReturnValue({
      billingPortal: {
        sessions: {
          create: jest.fn().mockResolvedValue({
            id: 'bps_test_123',
            url: 'https://billing.stripe.test/session',
          }),
        },
      },
    });

    const { POST } = await import('@/app/api/admin/billing/portal/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/billing/portal', {
        method: 'POST',
        headers: {
          'x-request-id': 'req-portal',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mockWriteBillingAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        client: adminClient,
        audit: expect.objectContaining({
          orgRootClinicId: 'root-clinic-1',
          actorType: 'user',
          actorUserId: 'admin-user-1',
          eventType: 'billing.portal_opened',
          beforeState: subscription,
          requestId: 'req-portal',
          metadata: expect.objectContaining({
            stripe_customer_id: 'cus_existing',
            stripe_portal_session_id: 'bps_test_123',
          }),
        }),
      })
    );
  });

  test('upgrade route reasserts the resolved billing root clinic scope', async () => {
    const adminClient = { from: jest.fn() };
    const assertClinicInScope = jest.fn();
    mockAdminAuth();
    mockCreateScopedAdminContext.mockReturnValue({
      client: adminClient,
      scopedClinicIds: ['root-clinic-1'],
      assertClinicInScope,
    });
    mockResolveOrgRootClinicForBilling.mockResolvedValue({
      id: 'root-clinic-1',
      name: 'Root Clinic',
    });
    mockFetchBillingSubscription.mockResolvedValue({
      org_root_clinic_id: 'root-clinic-1',
      stripe_subscription_id: 'sub_upgrade',
    });
    mockCountActiveChildClinics.mockResolvedValue(2);
    mockUpgradeSingleToGroupSubscription.mockResolvedValue({
      orgRootClinicId: 'root-clinic-1',
      billingState: 'active',
      snapshot: {
        planCode: 'group',
        stripeSubscriptionId: 'sub_upgrade',
        includedStoreQuantity: 1,
        paidExtraStoreQuantity: 1,
      },
    });

    const { POST } = await import('@/app/api/admin/billing/upgrade/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/billing/upgrade', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(assertClinicInScope).toHaveBeenCalledWith('root-clinic-1');
    expect(mockUpgradeSingleToGroupSubscription).toHaveBeenCalledTimes(1);
  });

  test('upgrade route rejects a resolved billing root outside current scope', async () => {
    const adminClient = { from: jest.fn() };
    const { ScopeAccessError: MockScopeAccessError } = jest.requireMock<{
      ScopeAccessError: new () => Error;
    }>('@/lib/supabase/scoped-admin');
    mockAdminAuth();
    mockCreateScopedAdminContext.mockReturnValue({
      client: adminClient,
      scopedClinicIds: ['root-clinic-1'],
      assertClinicInScope: jest.fn(() => {
        throw new MockScopeAccessError();
      }),
    });
    mockResolveOrgRootClinicForBilling.mockResolvedValue({
      id: 'outside-root-clinic',
      name: 'Outside Root Clinic',
    });

    const { POST } = await import('@/app/api/admin/billing/upgrade/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/billing/upgrade', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(403);
    expect(mockFetchBillingSubscription).not.toHaveBeenCalled();
    expect(mockCountActiveChildClinics).not.toHaveBeenCalled();
    expect(mockUpgradeSingleToGroupSubscription).not.toHaveBeenCalled();
  });
});

describe('Stripe billing event audit logs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteBillingAuditLog.mockResolvedValue(undefined);
  });

  test('checkout.session.expired clears pending checkout state and writes audit log', async () => {
    const beforeSubscription = {
      org_root_clinic_id: 'root-clinic-1',
      billing_state: 'checkout_pending',
      stripe_checkout_session_id: 'cs_expired_123',
      stripe_subscription_id: null,
      checkout_started_at: '2026-07-07T00:00:00.000Z',
      checkout_expires_at: '2026-07-07T01:00:00.000Z',
      checkout_plan_code: 'group',
    };
    const beforeQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: beforeSubscription,
        error: null,
      }),
    };
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockResolvedValue({ error: null }),
    };
    const queries = [beforeQuery, updateQuery];
    const client = {
      from: jest.fn((table: string) => {
        if (table !== 'subscriptions') {
          throw new Error(`Unexpected table: ${table}`);
        }

        const query = queries.shift();
        if (!query) {
          throw new Error('Unexpected subscriptions query');
        }

        return query;
      }),
    };

    const { processStripeEvent } = await import('@/lib/billing/stripe-events');
    const status = await processStripeEvent({
      client,
      source: 'stripe_webhook',
      requestId: 'req-expired',
      event: {
        id: 'evt_expired_123',
        type: 'checkout.session.expired',
        created: 1780000000,
        livemode: false,
        data: {
          object: {
            object: 'checkout.session',
            id: 'cs_expired_123',
            subscription: null,
            metadata: {
              org_root_clinic_id: 'root-clinic-1',
            },
          },
        },
      },
    });

    expect(status).toBe('processed');
    expect(updateQuery.update).toHaveBeenCalledWith({
      billing_state: 'none',
      stripe_checkout_session_id: null,
      checkout_started_at: null,
      checkout_expires_at: null,
      checkout_plan_code: null,
    });
    expect(mockWriteBillingAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        audit: expect.objectContaining({
          orgRootClinicId: 'root-clinic-1',
          actorType: 'stripe',
          eventType: 'billing.checkout_expired',
          beforeState: beforeSubscription,
          stripeEventId: 'evt_expired_123',
          requestId: 'req-expired',
          metadata: expect.objectContaining({
            stripe_checkout_session_id: 'cs_expired_123',
          }),
        }),
      })
    );
  });
});

describe('admin tenant billing audit events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveChildClinicInScope.mockImplementation(
      async (_context: unknown, childClinicId: string) => childClinicId
    );
    mockWriteBillingAuditLog.mockResolvedValue(undefined);
    mockIsTenantBillingGuardActive.mockReturnValue(true);
    mockCountActiveChildClinics.mockResolvedValue(5);
    mockFetchTenantBillingSubscription.mockResolvedValue({
      org_root_clinic_id: 'root-clinic-1',
      plan_code: 'group',
      billing_state: 'active',
      stripe_subscription_id: 'sub_123',
      stripe_store_subscription_item_id: 'si_old',
      included_store_quantity: 5,
      paid_extra_store_quantity: 0,
    });
    mockBuildStoreActivationPlan.mockReturnValue({
      success: true,
      activeBillableStoreCount: 5,
      targetActiveBillableStoreCount: 6,
      allowedBillableStoreCount: 5,
      targetPaidExtraStoreQuantity: 1,
      currentPaidExtraStoreQuantity: 0,
      requiresStripeQuantityIncrease: true,
      canActivateImmediately: false,
    });
    mockEnsureStripeStoreAddOnQuantity.mockResolvedValue({
      status: 'updated',
      subscriptionItemId: 'si_new',
    });
    mockLogAdminAction.mockResolvedValue(undefined);
  });

  test('tenant add path writes pending and Stripe quantity audit logs', async () => {
    const rootClinicId = '11111111-1111-4111-8111-111111111111';
    const childClinicId = '22222222-2222-4222-8222-222222222222';
    const parentQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: rootClinicId,
          name: 'Root Clinic',
          parent_id: null,
          is_active: true,
        },
        error: null,
      }),
    };
    const createdClinic = {
      id: childClinicId,
      name: 'Child Clinic',
      address: null,
      phone_number: null,
      is_active: false,
      created_at: '2026-07-07T00:00:00.000Z',
      parent_id: rootClinicId,
      billing_activation_status: 'pending_billing',
      billing_activation_requested_at: '2026-07-07T00:00:00.000Z',
      billing_activated_at: null,
      billing_activation_failed_at: null,
      billing_activation_error: null,
    };
    const insertQuery = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: createdClinic,
        error: null,
      }),
    };
    const clinicQueries = [parentQuery, insertQuery];
    const scopedAdminClient = {
      from: jest.fn((table: string) => {
        if (table !== 'clinics') {
          throw new Error(`Unexpected table: ${table}`);
        }

        const query = clinicQueries.shift();
        if (!query) {
          throw new Error('Unexpected clinics query');
        }

        return query;
      }),
    };

    mockAdminAuth({
      name: 'Child Clinic',
      parent_id: rootClinicId,
    });
    const assertClinicInScope = jest.fn();
    mockCreateScopedAdminContext.mockReturnValue({
      client: scopedAdminClient,
      scopedClinicIds: [rootClinicId],
      assertClinicInScope,
    });
    mockCreateAdminClient.mockReturnValue({
      auth: {
        admin: {
          createUser: jest.fn(),
          deleteUser: jest.fn(),
        },
      },
      from: jest.fn(),
    });

    const { POST } = await import('@/app/api/admin/tenants/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/tenants', {
        method: 'POST',
        headers: {
          'x-request-id': 'req-tenant-add',
        },
        body: JSON.stringify({
          name: 'Child Clinic',
          parent_id: rootClinicId,
        }),
      })
    );

    expect(response.status).toBe(202);
    expect(assertClinicInScope).toHaveBeenCalledWith(rootClinicId);
    const eventTypes = mockWriteBillingAuditLog.mock.calls.map(call => {
      const input = call[0] as {
        audit: {
          eventType: string;
        };
      };
      return input.audit.eventType;
    });

    expect(eventTypes).toEqual([
      'billing.tenant_add_requested',
      'billing.tenant_pending_created',
      'billing.stripe_store_addon_quantity_change_initiated',
      'billing.stripe_store_addon_quantity_change_completed',
    ]);
    expect(mockWriteBillingAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: expect.objectContaining({
          orgRootClinicId: rootClinicId,
          actorType: 'user',
          actorUserId: 'admin-user-1',
          requestId: 'req-tenant-add',
          metadata: expect.objectContaining({
            child_clinic_id: childClinicId,
            stripe_subscription_id: 'sub_123',
          }),
        }),
      })
    );
  });
});
