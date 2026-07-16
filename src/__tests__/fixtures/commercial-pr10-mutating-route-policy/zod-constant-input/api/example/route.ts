import { z } from 'zod';

const schema = z.object({ clinic_id: z.string() });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const rawBody: unknown = await request.json();
  const parsed = schema.safeParse({ clinic_id: 'constant-clinic' });
  if (!parsed.success) return new Response(null, { status: 400 });
  store.insert(rawBody);
  return new Response(null, { status: 204 });
}
