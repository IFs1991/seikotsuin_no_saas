import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { assertBillingServerEnv } from '@/lib/billing/config';
import {
  countActiveChildClinics,
  fetchBillingSubscription,
  hasBlockingBillingState,
  resolveOrgRootClinicForBilling,
} from '@/lib/billing/admin';
import { buildBillingLineItems } from '@/lib/billing/plans';
import { getStripeClient } from '@/lib/stripe/server';
import { assertEnv, env } from '@/lib/env';
import {
  createScopedAdminContext,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';
import { writeBillingAuditLog } from '@/lib/billing/audit';

const CHECKOUT_ENDPOINT = '/api/admin/billing/checkout';
const TRIAL_PERIOD_DAYS = 30;

const CheckoutRequestSchema = z.object({
  plan_code: z.enum(['single_clinic', 'group']),
});

function requireCustomerAdmin(role: string) {
  return role === 'admin';
}

function fromUnixSeconds(value: number) {
  return new Date(value * 1000).toISOString();
}

function buildBillingUrl(pathname: string) {
  const appUrl = assertEnv('NEXT_PUBLIC_APP_URL');
  return `${appUrl.replace(/\/$/, '')}${pathname}`;
}

export async function POST(request: NextRequest) {
  try {
    const processResult = await processApiRequest(request, {
      requireBody: true,
      allowedRoles: ['admin'],
      requireClinicMatch: false,
      sanitizeInputValues: false,
    });

    if (!processResult.success) {
      return processResult.error;
    }

    const { auth, permissions, body } = processResult;
    if (!requireCustomerAdmin(permissions.role)) {
      return createErrorResponse('管理者権限が必要です', 403);
    }

    const parsed = CheckoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsed.error.flatten()
      );
    }

    const billingEnv = assertBillingServerEnv();
    if (!billingEnv.enabledPlans.includes(parsed.data.plan_code)) {
      return createErrorResponse('指定されたプランは有効化されていません', 400);
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
    const [subscription, activeChildClinicCount] = await Promise.all([
      fetchBillingSubscription({
        client: adminCtx.client,
        orgRootClinicId: orgRootClinic.id,
      }),
      countActiveChildClinics({
        client: adminCtx.client,
        orgRootClinicId: orgRootClinic.id,
      }),
    ]);

    if (hasBlockingBillingState({ subscription, now: new Date() })) {
      return createErrorResponse('既に処理中または有効な契約があります', 409);
    }

    if (
      parsed.data.plan_code === 'single_clinic' &&
      activeChildClinicCount > 0
    ) {
      return createErrorResponse(
        'Single Clinicプランでは子テナントを持てません',
        400
      );
    }

    const lineItems = buildBillingLineItems({
      planCode: parsed.data.plan_code,
      activeBillableStoreCount: activeChildClinicCount,
      priceIds: billingEnv.priceIds,
    });
    const stripe = getStripeClient();
    const stripeCustomerId =
      subscription?.stripe_customer_id ??
      (
        await stripe.customers.create({
          email: auth.email || undefined,
          name: orgRootClinic.name,
          metadata: {
            org_root_clinic_id: orgRootClinic.id,
            app_environment: env.NEXT_PUBLIC_APP_ENV || 'unknown',
          },
        })
      ).id;
    const checkoutMetadata = {
      org_root_clinic_id: orgRootClinic.id,
      plan_code: parsed.data.plan_code,
      app_environment: env.NEXT_PUBLIC_APP_ENV || 'unknown',
    };
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
      {
        metadata: checkoutMetadata,
      };

    if (subscription?.trial_consumed !== true) {
      subscriptionData.trial_period_days = TRIAL_PERIOD_DAYS;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: lineItems,
      payment_method_collection: 'always',
      client_reference_id: orgRootClinic.id,
      metadata: checkoutMetadata,
      subscription_data: subscriptionData,
      success_url: buildBillingUrl(
        '/admin/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}'
      ),
      cancel_url: buildBillingUrl('/admin/billing?checkout=cancelled'),
    });

    if (!checkoutSession.url) {
      return createErrorResponse('Checkout URLの作成に失敗しました', 500);
    }

    const checkoutUpsertPayload = {
      org_root_clinic_id: orgRootClinic.id,
      plan_code: parsed.data.plan_code,
      stripe_customer_id: stripeCustomerId,
      stripe_checkout_session_id: checkoutSession.id,
      checkout_started_at: new Date().toISOString(),
      checkout_expires_at: checkoutSession.expires_at
        ? fromUnixSeconds(checkoutSession.expires_at)
        : null,
      checkout_plan_code: parsed.data.plan_code,
      billing_state: 'checkout_pending',
      stripe_status: subscription?.stripe_status ?? 'none',
      metadata: {
        checkout_session_id: checkoutSession.id,
        checkout_plan_code: parsed.data.plan_code,
      },
    };
    const { error: upsertError } = await adminCtx.client
      .from('subscriptions')
      .upsert(checkoutUpsertPayload, {
        onConflict: 'org_root_clinic_id',
      });

    if (upsertError) {
      throw upsertError;
    }

    await writeBillingAuditLog({
      client: adminCtx.client,
      audit: {
        orgRootClinicId: orgRootClinic.id,
        actorType: 'user',
        actorUserId: auth.id,
        eventType: 'billing.checkout_started',
        beforeState: subscription,
        afterState: checkoutUpsertPayload,
        requestId: request.headers.get('x-request-id'),
        metadata: {
          stripe_customer_id: stripeCustomerId,
          stripe_checkout_session_id: checkoutSession.id,
          checkout_plan_code: parsed.data.plan_code,
        },
      },
    });

    return createSuccessResponse({
      url: checkoutSession.url,
      session_id: checkoutSession.id,
      expires_at: checkoutSession.expires_at
        ? fromUnixSeconds(checkoutSession.expires_at)
        : null,
    });
  } catch (error) {
    logError(error, {
      endpoint: CHECKOUT_ENDPOINT,
      userId: 'unknown',
      method: 'POST',
    });

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

    return createErrorResponse('Checkoutの開始に失敗しました', 500);
  }
}
