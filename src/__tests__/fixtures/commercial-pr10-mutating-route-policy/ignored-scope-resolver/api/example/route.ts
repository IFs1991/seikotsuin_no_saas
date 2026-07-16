import { processApiRequest } from '@/lib/api-helpers';
import { resolveScopedClinicIds } from '@/lib/supabase';

export async function POST(request: Request): Promise<Response> {
  const result = await processApiRequest(request, {
    allowedRoles: ['admin'],
  });
  if (!result.success) return result.error;
  resolveScopedClinicIds(result.permissions);
  return new Response(null, { status: 204 });
}
