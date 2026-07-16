import { z } from 'zod';

let schema = z.object({ value: z.string().min(1) });
schema = z.any();
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return new Response(null, { status: 400 });
  store.insert(parsed.data);
  return new Response(null, { status: 204 });
}
