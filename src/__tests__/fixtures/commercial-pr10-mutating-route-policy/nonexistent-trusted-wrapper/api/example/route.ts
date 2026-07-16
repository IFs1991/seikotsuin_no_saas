import { z } from 'zod';
import { processBusinessMutation } from '@/lib/route-helpers';

const schema = z.object({ clinic_id: z.string().uuid() });
const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  const result = await processBusinessMutation(request, schema);
  if (!result.success) return result.error;
  store.insert(result.dto);
  return new Response(null, { status: 204 });
}
