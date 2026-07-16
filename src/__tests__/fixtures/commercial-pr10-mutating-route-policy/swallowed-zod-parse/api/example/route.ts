import { z } from 'zod';

const schema = z.object({ clinic_id: z.string() });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = schema.parse(await request.json());
  } catch {}
  store.insert(parsed);
  return new Response(null, { status: 204 });
}
