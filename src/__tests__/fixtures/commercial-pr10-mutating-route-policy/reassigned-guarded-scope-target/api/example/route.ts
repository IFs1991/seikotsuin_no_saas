import { ensureClinicAccess } from '@/lib/supabase/guards';

const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  let targetClinicId = 'clinic-a';
  await ensureClinicAccess(request, '/api/example', targetClinicId);
  targetClinicId = 'clinic-b';
  store.insert({ clinic_id: targetClinicId });
  return new Response(null, { status: 204 });
}
