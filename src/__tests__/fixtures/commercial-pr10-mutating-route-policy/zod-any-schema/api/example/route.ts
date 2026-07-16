import { z } from 'zod';

const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  // Intentional negative fixture: this schema accepts every request value.
  const parsed = z.any().safeParse(await request.json());
  if (!parsed.success) return new Response(null, { status: 400 });
  store.insert(parsed.data);
  return new Response(null, { status: 204 });
}
