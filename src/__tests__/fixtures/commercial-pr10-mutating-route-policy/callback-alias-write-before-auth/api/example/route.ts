import { processApiRequest } from '@/lib/api-helpers';

const store = { insert: (_value: number) => undefined };

function writeValue(value: number): void {
  store.insert(value);
}

const callback = writeValue;

export async function POST(request: Request): Promise<Response> {
  [1].map(callback);
  const result = await processApiRequest(request);
  if (!result.success) return result.error;
  return new Response(null, { status: 204 });
}
