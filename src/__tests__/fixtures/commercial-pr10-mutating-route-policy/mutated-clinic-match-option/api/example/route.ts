import { ensureClinicAccess } from '@/lib/supabase/guards';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  let requireClinicMatch = true;
  requireClinicMatch = false;
  await ensureClinicAccess(request, '/api/example', 'clinic-id', {
    requireClinicMatch,
  });
  store.insert();
  return new Response(null, { status: 204 });
}
