import { z } from 'zod';

const schema = z.object({ name: z.string() });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const { name, role } = (await request.json()) as {
    name: string;
    role: string;
  };
  const parsed = schema.safeParse({ name });
  if (!parsed.success) return new Response(null, { status: 400 });
  store.insert({ name: parsed.data.name, role });
  return new Response(null, { status: 204 });
}
