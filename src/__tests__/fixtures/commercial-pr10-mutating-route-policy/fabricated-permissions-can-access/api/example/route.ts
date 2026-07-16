import { processApiRequest } from '@/lib/api-helpers';
import { canAccessClinicScope } from '@/lib/supabase';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  const fabricatedPermissions = {
    role: 'admin',
    clinic_scope_ids: ['attacker-clinic'],
  };
  if (!canAccessClinicScope(fabricatedPermissions, 'attacker-clinic')) {
    return new Response(null, { status: 403 });
  }
  store.insert();
  return new Response(null, { status: 204 });
}
