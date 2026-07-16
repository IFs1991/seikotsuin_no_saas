import { z } from 'zod';
import { processClinicScopedBody } from '@/lib/route-helpers';

const schema = z.object({ clinic_id: z.string().uuid() });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const rawBody: unknown = await request.clone().json();
  const result = await processClinicScopedBody(request, schema);
  if (!result.success) return result.error;

  store.insert(result.dto);
  store.insert(rawBody);
  return new Response(null, { status: 204 });
}
