import { z } from 'zod';

const schema = z.object({ name: z.string() });
const store = { insert: (_value: unknown) => undefined };

async function parseRequest(request: Request): Promise<{ name: string }> {
  return schema.parse(await request.json());
}

export async function POST(request: Request): Promise<Response> {
  const raw: unknown = await request.json();
  const checked = await parseRequest(request);
  store.insert({ raw, checked });
  return new Response(null, { status: 204 });
}
