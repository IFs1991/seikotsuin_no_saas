import { processApiRequest } from '@/lib/api-helpers';
import { ensureClinicAccess } from '@/lib/supabase/guards';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  try {
    await ensureClinicAccess(request, '/api/example', 'clinic-id');
    store.insert();
  } catch {
    store.insert();
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204 });
}
