import { z } from 'zod';

const schema = z.object({ clinic_id: z.string() });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const parsed = schema.safeParse(await request.json());
  if (!parsed) return new Response(null, { status: 400 });
  store.insert(parsed);
  return new Response(null, { status: 204 });
}
