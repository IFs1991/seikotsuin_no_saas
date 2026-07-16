import { processApiRequest } from '@/lib/api-helpers';
import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  const fabricatedPermissions = {
    role: 'admin',
    clinic_scope_ids: ['attacker-clinic'],
  };
  await ensureScopedBusinessWriteAccess({
    permissions: fabricatedPermissions,
    targetClinicId: 'attacker-clinic',
  });
  store.insert();
  return new Response(null, { status: 204 });
}
