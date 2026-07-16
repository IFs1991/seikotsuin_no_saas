import { z } from 'zod';

const payloadSchema = z.lazy(() =>
  z.union([z.object({ name: z.string() }), z.array(z.unknown())])
);
const schema = z.object({ payload: payloadSchema });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return new Response(null, { status: 400 });
  store.insert(parsed.data);
  return new Response(null, { status: 204 });
}
