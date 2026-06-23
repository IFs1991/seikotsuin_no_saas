import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import {
  assertBillingServerEnv,
  isBillingUpgradeEnabled,
} from '@/lib/billing/config';
import {
  countActiveChildClinics,
  fetchBillingSubscription,
  resolveOrgRootClinicForBilling,
} from '@/lib/billing/admin';
import {
  BillingUpgradeError,
  upgradeSingleToGroupSubscription,
  type BillingUpgradeErrorCode,
} from '@/lib/billing/upgrade';
import {
  createScopedAdminContext,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

const UPGRADE_ENDPOINT = '/api/admin/billing/upgrade';

function requireCustomerAdmin(role: string) {
  return role === 'admin';
}

function billingUpgradeErrorMessage(code: BillingUpgradeErrorCode) {
  switch (code) {
    case 'subscription_not_found':
      return 'アップグレード対象の契約がありません';
    case 'subscription_not_single':
      return 'Single Clinic契約のみGroupへアップグレードできます';
    case 'subscription_not_upgradeable':
      return '現在の契約状態ではアップグレードできません';
    case 'missing_stripe_subscription':
    case 'missing_single_subscription_item':
      return 'Stripe契約情報が同期されていません';
    case 'group_subscription_item_already_present':
      return 'Group用のStripe契約項目が既に存在します';
    case 'group_plan_disabled':
      return 'Groupプランが有効化されていません';
  }
}

function billingUpgradeErrorStatus(code: BillingUpgradeErrorCode) {
  switch (code) {
    case 'subscription_not_found':
      return 404;
    case 'group_plan_disabled':
      return 400;
    default:
      return 409;
  }
}

export async function POST(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: ['admin'],
      requireClinicMatch: false,
      sanitizeInputValues: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, permissions } = processResult;
    if (!requireCustomerAdmin(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    if (!isBillingUpgradeEnabled()) {
      return createErrorResponse('Billing upgrade is disabled', 404);
    }

    const billingEnv = assertBillingServerEnv();
    if (!billingEnv.enabledPlans.includes('group')) {
      return createErrorResponse('Groupプランが有効化されていません', 400);
    }

    let adminCtx;
    try {
      adminCtx = createScopedAdminContext(permissions);
    } catch (error) {
      if (error instanceof ScopeNotConfiguredError) {
        return createErrorResponse(error.message, 403);
      }
      throw error;
    }

    const orgRootClinic = await resolveOrgRootClinicForBilling({
      client: adminCtx.client,
      scopedClinicIds: adminCtx.scopedClinicIds,
    });
    const [subscription, activeBillableStoreCount] = await Promise.all([
      fetchBillingSubscription({
        client: adminCtx.client,
        orgRootClinicId: orgRootClinic.id,
      }),
      countActiveChildClinics({
        client: adminCtx.client,
        orgRootClinicId: orgRootClinic.id,
      }),
    ]);

    const result = await upgradeSingleToGroupSubscription({
      client: adminCtx.client,
      subscription,
      activeBillableStoreCount,
      actorUserId: auth.id,
      requestId: request.headers.get('x-request-id'),
    });

    return createSuccessResponse({
      org_root_clinic_id: result.orgRootClinicId,
      plan_code: result.snapshot.planCode,
      billing_state: result.billingState,
      stripe_subscription_id: result.snapshot.stripeSubscriptionId,
      included_store_quantity: result.snapshot.includedStoreQuantity,
      paid_extra_store_quantity: result.snapshot.paidExtraStoreQuantity,
    });
  } catch (error) {
    logError(error, {
      endpoint: UPGRADE_ENDPOINT,
      userId: 'unknown',
      method: 'POST',
    });

    if (error instanceof BillingUpgradeError) {
      return createErrorResponse(
        billingUpgradeErrorMessage(error.code),
        billingUpgradeErrorStatus(error.code),
        undefined,
        error.code
      );
    }

    if (error instanceof Error && error.message === 'Billing is disabled') {
      return createErrorResponse('Billing is disabled', 404);
    }

    if (
      error instanceof Error &&
      (error.message.startsWith('STRIPE_') ||
        error.message.startsWith('Environment variable STRIPE_'))
    ) {
      return createErrorResponse('Stripe環境変数が設定されていません', 500);
    }

    if (
      error instanceof Error &&
      error.message === 'Unable to resolve a unique org root clinic for billing'
    ) {
      return createErrorResponse('請求対象の本部テナントを特定できません', 403);
    }

    return createErrorResponse(
      'Groupプランへのアップグレードに失敗しました',
      500
    );
  }
}
