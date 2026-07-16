import { processApiRequest } from '@/lib/api-helpers';

const store = { insert: (_value: number) => undefined };

async function writeValue(value: number): Promise<void> {
  store.insert(value);
}

export async function POST(request: Request): Promise<Response> {
  await Promise.all([1].map(writeValue));

  const result = await processApiRequest(request);
  if (!result.success) return result.error;
  return new Response(null, { status: 204 });
}
