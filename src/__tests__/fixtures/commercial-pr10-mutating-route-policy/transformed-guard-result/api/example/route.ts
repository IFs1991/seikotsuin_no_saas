import { processApiRequest } from '@/lib/api-helpers';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const result = (await processApiRequest(request), { success: true as const });
  if (!result.success) return new Response(null, { status: 403 });
  store.insert();
  return new Response(null, { status: 204 });
}
