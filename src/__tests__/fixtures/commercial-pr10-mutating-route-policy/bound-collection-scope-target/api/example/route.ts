import { z } from 'zod';
import { processApiRequest } from '@/lib/api-helpers';
import { canAccessClinicScope } from '@/lib/supabase';

const schema = z.object({
  clinic_ids: z.array(z.string().min(1)).min(1),
});
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  const input = schema.parse(await request.json());
  const requestedClinicIds = input.clinic_ids;
  if (
    requestedClinicIds.some(
      clinicId => !canAccessClinicScope(auth.permissions, clinicId)
    )
  ) {
    return new Response(null, { status: 403 });
  }
  store.insert({ clinic_ids: requestedClinicIds });
  return new Response(null, { status: 204 });
}
