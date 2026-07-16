import { z } from 'zod';

const schema = z.object({ name: z.string() });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  let candidate: unknown = await request.json();
  candidate = { name: 'constant' };
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) return new Response(null, { status: 400 });
  store.insert(parsed.data);
  return new Response(null, { status: 204 });
}
