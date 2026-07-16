import { processApiRequest } from '@/lib/api-helpers';
import { resolveScopedClinicIds } from '@/lib/supabase';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  const fabricatedPermissions = {
    role: 'admin',
    clinic_scope_ids: ['attacker-clinic'],
  };
  const clinicIds = resolveScopedClinicIds(fabricatedPermissions);
  if (!clinicIds.includes('attacker-clinic')) {
    return new Response(null, { status: 403 });
  }
  store.insert();
  return new Response(null, { status: 204 });
}
