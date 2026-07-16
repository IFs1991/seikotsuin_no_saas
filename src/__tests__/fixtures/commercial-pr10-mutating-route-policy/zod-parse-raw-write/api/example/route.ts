import { z } from 'zod';

const schema = z.object({ name: z.string() });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  const checked = schema.parse(body);
  store.insert({ body, checked });
  return new Response(null, { status: 204 });
}
