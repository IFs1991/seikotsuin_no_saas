import { ensureClinicAccess } from '@/lib/supabase/guards';

export async function POST(request: Request): Promise<Response> {
  await ensureClinicAccess(request, '/api/example', null, {
    allowedRoles: ['admin'],
  });
  return new Response(null, { status: 204 });
}
