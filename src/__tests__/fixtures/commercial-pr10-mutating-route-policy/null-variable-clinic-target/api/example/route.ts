import { ensureClinicAccess } from '@/lib/supabase/guards';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const clinicId: null = null;
  await ensureClinicAccess(request, '/api/example', clinicId, {
    allowedRoles: ['admin'],
  });
  store.insert();
  return new Response(null, { status: 204 });
}
