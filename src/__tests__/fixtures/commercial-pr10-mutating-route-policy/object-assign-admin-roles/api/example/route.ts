import { processApiRequest } from '@/lib/api-helpers';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const roles = ['admin'];
  Object.assign(roles, ['staff']);
  const result = await processApiRequest(request, { allowedRoles: roles });
  if (!result.success) return result.error;
  store.insert();
  return new Response(null, { status: 204 });
}
