import { processApiRequest } from '@/lib/api-helpers';
import { ensureStripeStoreAddOnQuantity } from '@/lib/billing/tenant-activation';
import { canAccessClinicScope } from '@/lib/supabase';

export async function POST(request: Request): Promise<Response> {
  const result = await processApiRequest(request, {
    allowedRoles: ['admin'],
    requireClinicMatch: false,
  });
  if (!result.success) return result.error;

  const clinicId = 'clinic-a';
  if (!canAccessClinicScope(result.permissions, clinicId)) {
    return new Response(null, { status: 403 });
  }

  const outsideInput = {
    orgRootClinicId: 'clinic-outside-scope',
    subscription: {
      org_root_clinic_id: 'clinic-outside-scope',
      stripe_subscription_id: 'sub-outside',
      stripe_store_subscription_item_id: 'si-outside',
      paid_extra_store_quantity: 0,
    },
    targetPaidExtraStoreQuantity: 1,
  };
  await ensureStripeStoreAddOnQuantity({
    orgRootClinicId: clinicId,
    ...outsideInput,
  });
  return new Response(null, { status: 204 });
}
