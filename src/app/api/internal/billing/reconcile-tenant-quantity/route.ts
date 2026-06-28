import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { writeBillingAuditLog } from '@/lib/billing/audit';
import { countActiveChildClinics } from '@/lib/billing/admin';
import { requireBillingInternalRequest } from '@/lib/billing/internal-auth';
import {
  activateBillableStoreIfCapacity,
  buildStoreActivationPlan,
  ensureStripeStoreAddOnQuantity,
  fetchTenantBillingSubscription,
} from '@/lib/billing/tenant-activation';

const INTERNAL_ACTOR = 'api/internal/billing/reconcile-tenant-quantity';

const ReconcileRequestSchema = z.object({
  org_root_clinic_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const auth = requireBillingInternalRequest(request, {
    internalActor: INTERNAL_ACTOR,
  });
  if (auth.success === false) {
    return auth.response;
  }

  const body = await request.json();
  const parsed = ReconcileRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request',
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const client = createAdminClient();
  const orgRootClinicId = parsed.data.org_root_clinic_id;
  const [subscription, activeBillableStoreCount, pendingClinics] =
    await Promise.all([
      fetchTenantBillingSubscription({
        client,
        orgRootClinicId,
      }),
      countActiveChildClinics({
        client,
        orgRootClinicId,
      }),
      client
        .from('clinics')
        .select('id')
        .eq('parent_id', orgRootClinicId)
        .eq('is_active', false)
        .eq('billing_activation_status', 'pending_billing')
        .order('created_at', { ascending: true }),
    ]);

  if (pendingClinics.error) {
    throw pendingClinics.error;
  }

  const pendingClinicIds = (pendingClinics.data ?? []).map(clinic => clinic.id);
  const plan = buildStoreActivationPlan({
    subscription,
    activeBillableStoreCount,
  });

  if (plan.success === false) {
    return NextResponse.json(
      { success: false, error: plan.errorCode },
      { status: 409 }
    );
  }

  let stripeQuantitySyncStatus: string = 'not_required';
  if (plan.requiresStripeQuantityIncrease && subscription) {
    const syncResult = await ensureStripeStoreAddOnQuantity({
      subscription,
      targetPaidExtraStoreQuantity: plan.targetPaidExtraStoreQuantity,
    });
    stripeQuantitySyncStatus = syncResult.status;
  }

  const activations: Array<{
    clinic_id: string;
    success: boolean;
    error_code: string | null;
  }> = [];

  for (const clinicId of pendingClinicIds) {
    const activation = await activateBillableStoreIfCapacity({
      client,
      orgRootClinicId,
      clinicId,
    });
    activations.push({
      clinic_id: clinicId,
      success: activation.success,
      error_code: activation.error_code,
    });

    await writeBillingAuditLog({
      client,
      audit: {
        orgRootClinicId,
        actorType: 'internal',
        internalActor: auth.actor.internalActor,
        eventType: activation.success
          ? 'billing.tenant_activated'
          : 'billing.tenant_activation_failed',
        afterState: {
          clinic_id: clinicId,
          active_billable_store_count: activation.active_billable_store_count,
          allowed_billable_store_count: activation.allowed_billable_store_count,
          error_code: activation.error_code,
        },
        requestId: auth.actor.requestId,
        metadata: { source: 'internal_reconcile_tenant_quantity' },
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      org_root_clinic_id: orgRootClinicId,
      active_billable_store_count: activeBillableStoreCount,
      target_paid_extra_store_quantity: plan.targetPaidExtraStoreQuantity,
      stripe_quantity_sync_status: stripeQuantitySyncStatus,
      pending_clinic_count: pendingClinicIds.length,
      activations,
    },
  });
}
