import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { assertBillingServerEnv } from '@/lib/billing/config';
import {
  fetchBillingSubscription,
  resolveOrgRootClinicForBilling,
} from '@/lib/billing/admin';
import { getStripeClient } from '@/lib/stripe/server';
import { assertEnv } from '@/lib/env';
import {
  createScopedAdminContext,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

const PORTAL_ENDPOINT = '/api/admin/billing/portal';

function requireCustomerAdmin(role: string) {
  return role === 'admin';
}

function buildBillingReturnUrl() {
  const appUrl = assertEnv('NEXT_PUBLIC_APP_URL');
  return `${appUrl.replace(/\/$/, '')}/admin/billing`;
}

export async function POST(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      allowedRoles: ['admin'],
      requireClinicMatch: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { permissions } = processResult;
    if (!requireCustomerAdmin(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    assertBillingServerEnv();

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
    const subscription = await fetchBillingSubscription({
      client: adminCtx.client,
      orgRootClinicId: orgRootClinic.id,
    });

    if (!subscription?.stripe_customer_id) {
      return createErrorResponse('Stripe customer が未作成です', 400);
    }

    const portalSession = await getStripeClient().billingPortal.sessions.create(
      {
        customer: subscription.stripe_customer_id,
        return_url: buildBillingReturnUrl(),
      }
    );

    return createSuccessResponse({
      url: portalSession.url,
    });
  } catch (error) {
    logError(error, {
      endpoint: PORTAL_ENDPOINT,
      userId: 'unknown',
      method: 'POST',
    });

    if (error instanceof Error && error.message === 'Billing is disabled') {
      return createErrorResponse('Billing is disabled', 404);
    }

    if (
      error instanceof Error &&
      error.message === 'Unable to resolve a unique org root clinic for billing'
    ) {
      return createErrorResponse('請求対象の本部テナントを特定できません', 403);
    }

    return createErrorResponse('Customer Portalの開始に失敗しました', 500);
  }
}
