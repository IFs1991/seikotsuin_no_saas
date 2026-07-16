import { processApiRequest } from '@/lib/api-helpers';
import { resolveScopedClinicIds } from '@/lib/supabase';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  const clinicIds = resolveScopedClinicIds(auth.permissions);
  if (!!clinicIds.includes('clinic-id')) {
    return new Response(null, { status: 403 });
  }
  store.insert();
  return new Response(null, { status: 204 });
}
