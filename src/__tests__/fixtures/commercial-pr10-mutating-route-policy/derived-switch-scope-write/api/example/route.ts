import { processApiRequest } from '@/lib/api-helpers';
import { ensureClinicAccess } from '@/lib/supabase/guards';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  switch (request.headers.get('x-mode')) {
    case 'scoped':
      await ensureClinicAccess(request, '/api/example', 'clinic-id');
      store.insert();
      break;
    default:
      store.insert();
  }
  return new Response(null, { status: 204 });
}
