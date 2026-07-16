import { processApiRequest } from '@/lib/api-helpers';
import { ensureClinicAccess } from '@/lib/supabase/guards';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  if (request.headers.has('x-check-scope')) {
    await ensureClinicAccess(request, '/api/example', 'clinic-id');
  }
  store.insert();
  return new Response(null, { status: 204 });
}
