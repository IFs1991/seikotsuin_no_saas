import { z } from 'zod';
import { processApiRequest } from '@/lib/api-helpers';
import { canAccessClinicScope } from '@/lib/supabase';

const schema = z.object({
  clinic_a: z.string().min(1),
  clinic_b: z.string().min(1),
});
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  const input = schema.parse(await request.json());
  const clinicA = input.clinic_a;
  const clinicB = input.clinic_b;
  if (!canAccessClinicScope(auth.permissions, clinicA)) {
    return new Response(null, { status: 403 });
  }
  store.insert([{ clinic_id: clinicA }, { clinic_id: clinicB }]);
  return new Response(null, { status: 204 });
}
