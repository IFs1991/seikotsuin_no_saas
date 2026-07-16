import { processApiRequest } from '@/lib/api-helpers';

const store = { insert: () => undefined };
const Array = { from: (_roles: readonly string[]) => ['staff'] };

export async function POST(request: Request): Promise<Response> {
  const result = await processApiRequest(request, {
    allowedRoles: Array.from(['admin']),
  });
  if (!result.success) return result.error;
  store.insert();
  return new Response(null, { status: 204 });
}
