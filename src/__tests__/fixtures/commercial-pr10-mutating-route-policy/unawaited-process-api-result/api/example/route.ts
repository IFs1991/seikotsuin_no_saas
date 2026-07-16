import { processApiRequest } from '@/lib/api-helpers';

export function POST(request: Request): Response {
  const result = processApiRequest(request, {
    allowedRoles: ['admin'],
    clinicId: 'clinic-id',
  });
  if (!result.success) return result.error;
  return new Response(null, { status: 204 });
}
