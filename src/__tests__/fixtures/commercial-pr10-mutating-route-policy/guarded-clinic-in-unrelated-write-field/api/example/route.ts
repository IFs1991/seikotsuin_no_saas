import { z } from 'zod';
import { processApiRequest } from '@/lib/api-helpers';
import { canAccessClinicScope } from '@/lib/supabase';

const schema = z.object({
  checked_clinic_id: z.string().min(1),
  write_clinic_id: z.string().min(1),
});
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  const input = schema.parse(await request.json());
  const checkedClinicId = input.checked_clinic_id;
  const writeClinicId = input.write_clinic_id;
  if (!canAccessClinicScope(auth.permissions, checkedClinicId)) {
    return new Response(null, { status: 403 });
  }
  store.insert({
    clinic_id: writeClinicId,
    audit_checked_clinic_id: checkedClinicId,
  });
  return new Response(null, { status: 204 });
}
