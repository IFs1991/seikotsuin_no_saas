import { z } from 'zod';

const schema = z.object({ name: z.string() });
const store = { insert: (_value: unknown) => undefined };

async function parseLocal(input: unknown): Promise<{ name: string }> {
  return schema.parse(input);
}

export async function POST(request: Request): Promise<Response> {
  const raw: unknown = await request.json();
  const checked = await parseLocal(raw);
  store.insert({ raw, checked });
  return new Response(null, { status: 204 });
}
