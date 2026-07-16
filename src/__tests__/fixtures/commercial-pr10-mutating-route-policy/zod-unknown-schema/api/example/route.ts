import { z } from 'zod';

const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const parsed = z.unknown().safeParse(await request.json());
  if (!parsed.success) return new Response(null, { status: 400 });
  store.insert(parsed.data);
  return new Response(null, { status: 204 });
}
