import { z } from 'zod';

const schema = z.object({ clinic_id: z.string().uuid() });
const store = { insert: () => undefined };

export async function POST(request: Request): Promise<Response> {
  schema.safeParse(await request.json());
  store.insert();
  return new Response(null, { status: 204 });
}
