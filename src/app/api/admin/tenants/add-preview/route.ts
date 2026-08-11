import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import {
  createScopedAdminContext,
  ScopeAccessError,
  ScopeNotConfiguredError,
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
import {
  buildTenantAddPreview,
  type TenantAddPriceSnapshot,
  type TenantAddSubscriptionSnapshot,
} from '@/lib/billing/tenant-add-preview';

const ENDPOINT = '/api/admin/tenants/add-preview';
const ParentIdSchema = z.string().uuid();

type ParentClinicRow = {
  id: string;
  parent_id: string | null;
  is_active: boolean;
};

function toSubscriptionSnapshot(
  subscription: Awaited<ReturnType<typeof fetchTenantBillingSubscription>>
): TenantAddSubscriptionSnapshot | null {
  if (!subscription) {
    return null;
  }

  return {
    planCode: subscription.plan_code,
    billingState: subscription.billing_state,
    includedStoreQuantity: subscription.included_store_quantity,
    paidExtraStoreQuantity: subscription.paid_extra_store_quantity,
    canIncreaseStripeQuantity: Boolean(subscription.stripe_subscription_id),
  };
}

function toPriceSnapshot(
  prices: Awaited<ReturnType<typeof fetchGroupBillingPriceCatalog>>
): TenantAddPriceSnapshot {
  return {
    groupBase: {
      currency: prices.groupBase.currency,
      unitAmount: prices.groupBase.unitAmount,
      interval: prices.groupBase.interval,
      taxBehavior: prices.groupBase.taxBehavior,
    },
    storeAddon: {
      currency: prices.storeAddon.currency,
      unitAmount: prices.storeAddon.unitAmount,
      interval: prices.storeAddon.interval,
      taxBehavior: prices.storeAddon.taxBehavior,
    },
  };
}

function isValidParentClinic(
  clinic: ParentClinicRow | null
): clinic is ParentClinicRow {
  return Boolean(
    clinic && clinic.parent_id === null && clinic.is_active === true
  );
}

export async function GET(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: ['admin'],
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    if (processResult.permissions.role !== 'admin') {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const parentIdResult = ParentIdSchema.safeParse(
      new URL(request.url).searchParams.get('parent_id')
    );
    if (!parentIdResult.success) {
      return createErrorResponse('親テナントを選択してください', 400);
    }

    let adminContext;
    try {
      adminContext = createScopedAdminContext(processResult.permissions);
      adminContext.assertClinicInScope(parentIdResult.data);
    } catch (error) {
      if (
        error instanceof ScopeAccessError ||
        error instanceof ScopeNotConfiguredError
      ) {
        return createErrorResponse(error.message, 403);
      }
      throw error;
    }

    const parentId = parentIdResult.data;
    const { data: parentClinic, error: parentError } = await adminContext.client
      .from('clinics')
      .select('id, parent_id, is_active')
      .eq('id', parentId)
      .single();

    if (parentError || !isValidParentClinic(parentClinic)) {
      return createErrorResponse('有効な本部テナントを選択してください', 400);
    }

    const billingGuardEnabled = isTenantBillingGuardActive();
    const [activeStoreCount, unresolvedActivationCount, subscription] =
      await Promise.all([
        countActiveChildClinics({
          client: adminContext.client,
          orgRootClinicId: parentId,
        }),
        billingGuardEnabled
          ? countUnresolvedBillingChildClinics({
              client: adminContext.client,
              orgRootClinicId: parentId,
            })
          : Promise.resolve(0),
        billingGuardEnabled
          ? fetchTenantBillingSubscription({
              client: adminContext.client,
              orgRootClinicId: parentId,
            })
          : Promise.resolve(null),
      ]);
    const subscriptionSnapshot = toSubscriptionSnapshot(subscription);
    let preview = buildTenantAddPreview({
      billingGuardEnabled,
      activeStoreCount,
      unresolvedActivationCount,
      subscription: subscriptionSnapshot,
    });

    if (
      preview.status === 'blocked' &&
      preview.reason === 'pricing_unavailable'
    ) {
      try {
        const prices = await fetchGroupBillingPriceCatalog();
        preview = buildTenantAddPreview({
          billingGuardEnabled,
          activeStoreCount,
          unresolvedActivationCount,
          subscription: subscriptionSnapshot,
          prices: toPriceSnapshot(prices),
        });
      } catch (error) {
        logError(error, {
          endpoint: ENDPOINT,
          method: 'GET',
          userId: processResult.auth.id,
          params: { stage: 'price_catalog' },
        });
      }
    }

    return createSuccessResponse(preview);
  } catch (error) {
    logError(error, {
      endpoint: ENDPOINT,
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('店舗追加条件の確認に失敗しました', 500);
  }
}
