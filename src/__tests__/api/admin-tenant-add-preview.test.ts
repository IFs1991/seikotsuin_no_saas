import { NextRequest } from 'next/server';
import { processApiRequest } from '@/lib/api-helpers';
import {
  createScopedAdminContext,
  ScopeAccessError,
} from '@/lib/supabase/scoped-admin';
import {
  countActiveChildClinics,
  countUnresolvedBillingChildClinics,
} from '@/lib/billing/admin';
import {
  fetchTenantBillingSubscription,
  isTenantBillingGuardActive,
} from '@/lib/billing/tenant-activation';
import { fetchGroupBillingPriceCatalog } from '@/lib/billing/price-catalog';

jest.mock('@/lib/api-helpers', () => {
  const actual = jest.requireActual('@/lib/api-helpers');
  return {
    ...actual,
    processApiRequest: jest.fn(),
    logError: jest.fn(),
  };
});

jest.mock('@/lib/supabase/scoped-admin', () => {
  const actual = jest.requireActual('@/lib/supabase/scoped-admin');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

jest.mock('@/lib/billing/admin', () => ({
  countActiveChildClinics: jest.fn(),
  countUnresolvedBillingChildClinics: jest.fn(),
}));

jest.mock('@/lib/billing/tenant-activation', () => ({
  fetchTenantBillingSubscription: jest.fn(),
  isTenantBillingGuardActive: jest.fn(),
}));

jest.mock('@/lib/billing/price-catalog', () => ({
  fetchGroupBillingPriceCatalog: jest.fn(),
}));

const processApiRequestMock = processApiRequest as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;
const countActiveChildClinicsMock = jest.mocked(countActiveChildClinics);
const countUnresolvedBillingChildClinicsMock = jest.mocked(
  countUnresolvedBillingChildClinics
);
const fetchTenantBillingSubscriptionMock = jest.mocked(
  fetchTenantBillingSubscription
);
const isTenantBillingGuardActiveMock = jest.mocked(isTenantBillingGuardActive);
const fetchGroupBillingPriceCatalogMock = jest.mocked(
  fetchGroupBillingPriceCatalog
);

const parentId = '11111111-1111-4111-8111-111111111111';

function createParentQuery(parent: {
  id: string;
  parent_id: string | null;
  is_active: boolean;
}) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: parent, error: null }),
  };
}

function setupAdminRequest(parent?: {
  id: string;
  parent_id: string | null;
  is_active: boolean;
}) {
  const parentQuery = createParentQuery(
    parent ?? { id: parentId, parent_id: null, is_active: true }
  );
  const from = jest.fn((table: string) => {
    if (table !== 'clinics') {
      throw new Error(`Unexpected table: ${table}`);
    }
    return parentQuery;
  });
  const assertClinicInScope = jest.fn();

  processApiRequestMock.mockResolvedValue({
    success: true,
    auth: { id: 'admin-user', email: 'admin@example.com', role: 'admin' },
    permissions: {
      role: 'admin',
      clinic_id: null,
      clinic_scope_ids: [parentId],
    },
    supabase: {},
  });
  createScopedAdminContextMock.mockReturnValue({
    client: { from },
    scopedClinicIds: [parentId],
    assertClinicInScope,
  });
  isTenantBillingGuardActiveMock.mockReturnValue(true);
  countActiveChildClinicsMock.mockResolvedValue(5);
  countUnresolvedBillingChildClinicsMock.mockResolvedValue(0);
  fetchTenantBillingSubscriptionMock.mockResolvedValue({
    org_root_clinic_id: parentId,
    plan_code: 'group',
    billing_state: 'active',
    stripe_subscription_id: 'billing-subscription-present',
    stripe_store_subscription_item_id: null,
    included_store_quantity: 5,
    paid_extra_store_quantity: 0,
  });
  fetchGroupBillingPriceCatalogMock.mockResolvedValue({
    groupBase: {
      currency: 'jpy',
      unitAmount: 78_000,
      interval: 'month',
      intervalCount: 1,
      taxBehavior: 'unspecified',
    },
    storeAddon: {
      currency: 'jpy',
      unitAmount: 8_000,
      interval: 'month',
      intervalCount: 1,
      taxBehavior: 'unspecified',
    },
  });

  return { parentQuery, from, assertClinicInScope };
}

async function callRoute(id = parentId) {
  const { GET } = await import('@/app/api/admin/tenants/add-preview/route');
  return await GET(
    new NextRequest(
      `http://localhost/api/admin/tenants/add-preview?parent_id=${id}`
    )
  );
}

describe('GET /api/admin/tenants/add-preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAdminRequest();
  });

  it('adminのスコープ内本部についてread-onlyの料金確認を返す', async () => {
    const { parentQuery, from, assertClinicInScope } = setupAdminRequest();
    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(assertClinicInScope).toHaveBeenCalledWith(parentId);
    expect(from).toHaveBeenCalledTimes(1);
    expect(parentQuery.select).toHaveBeenCalledWith('id, parent_id, is_active');
    expect(countActiveChildClinicsMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgRootClinicId: parentId })
    );
    expect(countUnresolvedBillingChildClinicsMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgRootClinicId: parentId })
    );
    expect(body.data).toEqual({
      status: 'paid_quantity_increase',
      canCreate: true,
      activeStoreCount: 5,
      afterStoreCount: 6,
      includedStoreCount: 5,
      contractedExtraStoreQuantity: 0,
      contractedStoreLimit: 5,
      pricing: {
        currency: 'jpy',
        interval: 'month',
        taxBehavior: 'unspecified',
        storeAddonUnitAmount: 8_000,
        quantityIncrease: 1,
        monthlyIncrease: 8_000,
        standardMonthlyTotal: 86_000,
      },
    });
    const serialized = JSON.stringify(body.data);
    expect(serialized).not.toMatch(/priceId|stripe_|secret/i);
  });

  it('基本枠内ではStripe料金を取得しない', async () => {
    setupAdminRequest();
    countActiveChildClinicsMock.mockResolvedValue(3);

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({
        status: 'base_capacity',
        canCreate: true,
        activeStoreCount: 3,
        afterStoreCount: 4,
      })
    );
    expect(fetchGroupBillingPriceCatalogMock).not.toHaveBeenCalled();
  });

  it('前の店舗追加処理が未解決なら新しい追加を止める', async () => {
    setupAdminRequest();
    countUnresolvedBillingChildClinicsMock.mockResolvedValue(1);

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({
        status: 'blocked',
        canCreate: false,
        reason: 'activation_pending',
      })
    );
    expect(fetchGroupBillingPriceCatalogMock).not.toHaveBeenCalled();
  });

  it('billing guard無効時は契約もStripe料金も参照しない', async () => {
    setupAdminRequest();
    isTenantBillingGuardActiveMock.mockReturnValue(false);
    countActiveChildClinicsMock.mockResolvedValue(3);

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('billing_disabled');
    expect(fetchTenantBillingSubscriptionMock).not.toHaveBeenCalled();
    expect(countUnresolvedBillingChildClinicsMock).not.toHaveBeenCalled();
    expect(fetchGroupBillingPriceCatalogMock).not.toHaveBeenCalled();
  });

  it('料金取得失敗時は内部エラーを返さず追加を止める', async () => {
    setupAdminRequest();
    fetchGroupBillingPriceCatalogMock.mockRejectedValue(
      new Error('catalog unavailable')
    );

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({
        status: 'blocked',
        canCreate: false,
        reason: 'pricing_unavailable',
      })
    );
    expect(JSON.stringify(body)).not.toContain('catalog unavailable');
  });

  it('Stripe数量の更新先がない場合は料金を取得せず追加を止める', async () => {
    setupAdminRequest();
    fetchTenantBillingSubscriptionMock.mockResolvedValue({
      org_root_clinic_id: parentId,
      plan_code: 'group',
      billing_state: 'active',
      stripe_subscription_id: null,
      stripe_store_subscription_item_id: null,
      included_store_quantity: 5,
      paid_extra_store_quantity: 0,
    });

    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({
        status: 'blocked',
        canCreate: false,
        reason: 'quantity_update_unavailable',
      })
    );
    expect(fetchGroupBillingPriceCatalogMock).not.toHaveBeenCalled();
  });

  it('admin以外を拒否しDBへ触れない', async () => {
    const { from } = setupAdminRequest();
    processApiRequestMock.mockResolvedValue({
      success: true,
      auth: {
        id: 'clinic-admin-user',
        email: 'clinic-admin@example.com',
        role: 'clinic_admin',
      },
      permissions: {
        role: 'clinic_admin',
        clinic_id: parentId,
        clinic_scope_ids: [parentId],
      },
      supabase: {},
    });

    const response = await callRoute();

    expect(response.status).toBe(403);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('スコープ外の親本部をfail-closedで拒否する', async () => {
    const { from, assertClinicInScope } = setupAdminRequest();
    assertClinicInScope.mockImplementation(() => {
      throw new ScopeAccessError();
    });

    const response = await callRoute();

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
    expect(countActiveChildClinicsMock).not.toHaveBeenCalled();
    expect(fetchGroupBillingPriceCatalogMock).not.toHaveBeenCalled();
  });

  it.each([
    ['子テナント', { id: parentId, parent_id: 'root-id', is_active: true }],
    ['停止中本部', { id: parentId, parent_id: null, is_active: false }],
  ])('%sを追加先として拒否する', async (_label, parent) => {
    setupAdminRequest(parent);

    const response = await callRoute();

    expect(response.status).toBe(400);
    expect(countActiveChildClinicsMock).not.toHaveBeenCalled();
    expect(fetchTenantBillingSubscriptionMock).not.toHaveBeenCalled();
  });

  it('不正なparent_idをDBアクセス前に拒否する', async () => {
    const { from } = setupAdminRequest();

    const response = await callRoute('not-a-uuid');

    expect(response.status).toBe(400);
    expect(createScopedAdminContextMock).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
