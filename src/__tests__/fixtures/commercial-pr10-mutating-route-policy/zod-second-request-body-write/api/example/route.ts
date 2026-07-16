import { z } from 'zod';

const schema = z.object({ name: z.string() });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const candidate: unknown = await request.clone().json();
  const secondBody: unknown = await request.clone().json();
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) return new Response(null, { status: 400 });
  store.insert({ validated: parsed.data, unvalidated: secondBody });
  return new Response(null, { status: 204 });
}
