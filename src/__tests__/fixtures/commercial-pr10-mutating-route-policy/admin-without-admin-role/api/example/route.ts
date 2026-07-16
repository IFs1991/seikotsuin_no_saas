import { processApiRequest } from '@/lib/api-helpers';

export async function POST(request: Request): Promise<Response> {
  const result = await processApiRequest(request, {
    allowedRoles: ['therapist'],
  });
  if (!result.success) return result.error;
  return new Response(null, { status: 204 });
}
