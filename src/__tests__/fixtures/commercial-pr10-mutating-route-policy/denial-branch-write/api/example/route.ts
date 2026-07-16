import { processApiRequest } from '@/lib/api-helpers';

const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  const result = await processApiRequest(request);
  if (!result.success) {
    store.insert();
    return result.error;
  }
  return new Response(null, { status: 204 });
}
