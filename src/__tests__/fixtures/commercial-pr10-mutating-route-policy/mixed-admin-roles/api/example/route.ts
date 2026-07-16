import { processApiRequest } from '@/lib/api-helpers';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const result = await processApiRequest(request, {
    allowedRoles: ['admin', 'therapist'],
  });
  if (!result.success) return result.error;
  store.insert();
  return new Response(null, { status: 204 });
}
