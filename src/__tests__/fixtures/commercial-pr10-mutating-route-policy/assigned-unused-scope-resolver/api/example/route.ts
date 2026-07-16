import { processApiRequest } from '@/lib/api-helpers';
import { resolveScopedClinicIds } from '@/lib/supabase';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const result = await processApiRequest(request);
  if (!result.success) return result.error;
  const scopedClinicIds = resolveScopedClinicIds(result.permissions);
  void scopedClinicIds;
  store.insert();
  return new Response(null, { status: 204 });
}
