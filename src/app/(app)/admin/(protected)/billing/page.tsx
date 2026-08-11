import { redirect } from 'next/navigation';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import {
  AdminBillingPageClient,
  type AdminBillingSnapshot,
} from '@/components/admin/billing-page-client';
import {
  getEnabledBillingPlans,
  isBillingEnabled,
  isBillingUpgradeEnabled,
  isBillingUiEnabled,
} from '@/lib/billing/config';
import {
  countActiveChildClinics,
  fetchBillingSubscription,
  resolveOrgRootClinicForBilling,
} from '@/lib/billing/admin';
import { fetchGroupBillingPriceCatalog } from '@/lib/billing/price-catalog';
import { withAuthorityUnavailableRedirect } from '@/lib/auth/authority-unavailable';
import { createClient, getUserAccessContext } from '@/lib/supabase';
import {
  createScopedAdminContext,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

type AdminBillingPageProps = {
  searchParams: Promise<{
    checkout?: string | string[];
  }>;
};

function parseCheckoutResult(
  value: string | string[] | undefined
): AdminBillingSnapshot['checkoutResult'] {
  if (value === 'success' || value === 'cancelled') {
    return value;
  }

  return null;
}

export default async function AdminBillingPage({
  searchParams,
}: AdminBillingPageProps) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  const accessContext = await withAuthorityUnavailableRedirect(() =>
    getUserAccessContext(user.id, supabase)
  );
  const permissions = accessContext.permissions;

  if (!permissions || accessContext.normalizedRole !== 'admin') {
    redirect('/unauthorized');
  }

  let adminCtx;
  try {
    adminCtx = createScopedAdminContext(permissions);
  } catch (error) {
    if (error instanceof ScopeNotConfiguredError) {
      redirect('/unauthorized');
    }
    throw error;
  }

  const orgRootClinic = await resolveOrgRootClinicForBilling({
    client: adminCtx.client,
    scopedClinicIds: adminCtx.scopedClinicIds,
  });
  const billingEnabled = isBillingEnabled() && isBillingUiEnabled();
  const enabledPlans = getEnabledBillingPlans();
  const [subscription, activeBillableStoreCount, pricing] = await Promise.all([
    fetchBillingSubscription({
      client: adminCtx.client,
      orgRootClinicId: orgRootClinic.id,
    }),
    countActiveChildClinics({
      client: adminCtx.client,
      orgRootClinicId: orgRootClinic.id,
    }),
    billingEnabled && enabledPlans.includes('group')
      ? fetchGroupBillingPriceCatalog().catch(() => null)
      : Promise.resolve(null),
  ]);
  const snapshot: AdminBillingSnapshot = {
    billingEnabled,
    upgradeEnabled: isBillingUpgradeEnabled(),
    enabledPlans,
    pricing,
    checkoutResult: parseCheckoutResult(query.checkout),
    subscription: subscription
      ? {
          planCode: subscription.plan_code,
          billingState: subscription.billing_state,
          stripeStatus: subscription.stripe_status,
          hasStripeCustomer: subscription.stripe_customer_id !== null,
          currentPeriodEnd: subscription.current_period_end,
          trialEnd: subscription.trial_end,
          trialConsumed: subscription.trial_consumed,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          includedStoreQuantity: subscription.included_store_quantity,
          paidExtraStoreQuantity: subscription.paid_extra_store_quantity,
        }
      : null,
    activeBillableStoreCount,
  };

  return (
    <AdminPageShell
      title='契約・料金'
      description='現在の契約状態、料金の内訳、支払い方法を確認・管理します。'
    >
      <AdminBillingPageClient snapshot={snapshot} />
    </AdminPageShell>
  );
}
