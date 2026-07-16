import { processApiRequest } from '@/lib/api-helpers';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  store.insert();
  const result = await processApiRequest(request);
  if (!result.success) return result.error;
  return new Response(null, { status: 204 });
}
