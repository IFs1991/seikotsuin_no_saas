import { processApiRequest } from '@/lib/api-helpers';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const requireClinicMatch = false;
  const result = await processApiRequest(request, {
    allowedRoles: ['admin'],
    clinicId: 'clinic-id',
    requireClinicMatch,
  });
  if (!result.success) return result.error;
  store.insert();
  return new Response(null, { status: 204 });
}
