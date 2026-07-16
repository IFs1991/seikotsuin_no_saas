import { z } from 'zod';

const schema = z.object({ name: z.string() });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const candidate: unknown = await request.json();
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) return new Response(null, { status: 400 });
  let output: unknown = parsed.data;
  output = { name: 'replacement' };
  store.insert(output);
  return new Response(null, { status: 204 });
}
