import { processApiRequest } from '@/lib/api-helpers';

const store = { insert: (_value: number) => undefined };

export async function POST(request: Request): Promise<Response> {
  await Promise.all(
    [1].map(async value => {
      store.insert(value);
    })
  );

  const result = await processApiRequest(request);
  if (!result.success) return result.error;
  return new Response(null, { status: 204 });
}
