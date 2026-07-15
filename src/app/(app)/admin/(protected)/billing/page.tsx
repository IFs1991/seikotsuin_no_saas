import { redirect } from 'next/navigation';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import {
  AdminBillingPageClient,
  type AdminBillingSnapshot,
} from '@/components/admin/billing-page-client';
import {
  getEnabledBillingPlans,
  isBillingUpgradeEnabled,
  isBillingUiEnabled,
} from '@/lib/billing/config';
import {
  countActiveChildClinics,
  fetchBillingSubscription,
  resolveOrgRootClinicForBilling,
} from '@/lib/billing/admin';
import { withAuthorityUnavailableRedirect } from '@/lib/auth/authority-unavailable';
import { createClient, getUserAccessContext } from '@/lib/supabase';
import {
  createScopedAdminContext,
  ScopeNotConfiguredError,
} from '@/lib/supabase/scoped-admin';

export default async function AdminBillingPage() {
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
  const snapshot: AdminBillingSnapshot = {
    billingEnabled: isBillingUiEnabled(),
    upgradeEnabled: isBillingUpgradeEnabled(),
    enabledPlans: getEnabledBillingPlans(),
    subscription: subscription
      ? {
          planCode: subscription.plan_code,
          billingState: subscription.billing_state,
          stripeStatus: subscription.stripe_status,
          stripeCustomerId: subscription.stripe_customer_id,
          stripeSubscriptionId: subscription.stripe_subscription_id,
          currentPeriodEnd: subscription.current_period_end,
          trialEnd: subscription.trial_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          includedStoreQuantity: subscription.included_store_quantity,
          paidExtraStoreQuantity: subscription.paid_extra_store_quantity,
        }
      : null,
    activeBillableStoreCount,
  };

  return (
    <AdminPageShell
      title='Billing'
      description='Stripe Billing の契約状態、店舗数、Checkout / Customer Portal を管理します。'
    >
      <AdminBillingPageClient snapshot={snapshot} />
    </AdminPageShell>
  );
}
