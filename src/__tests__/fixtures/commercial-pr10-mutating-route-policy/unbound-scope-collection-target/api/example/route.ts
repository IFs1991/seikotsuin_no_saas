import { z } from 'zod';
import { processApiRequest } from '@/lib/api-helpers';
import { resolveScopedClinicIds } from '@/lib/supabase';

const schema = z.object({ clinic_id: z.string().min(1) });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const auth = await processApiRequest(request);
  if (!auth.success) return auth.error;
  const input = schema.parse(await request.json());
  const scopedClinicIds = resolveScopedClinicIds(auth.permissions);
  if (scopedClinicIds.length === 0) {
    return new Response(null, { status: 403 });
  }
  store.insert({ clinic_id: input.clinic_id });
  return new Response(null, { status: 204 });
}
