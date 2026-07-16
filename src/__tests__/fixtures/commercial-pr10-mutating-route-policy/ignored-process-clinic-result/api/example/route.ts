import { z } from 'zod';
import { processClinicScopedBody } from '@/lib/route-helpers';

const schema = z.object({ clinic_id: z.string().uuid() });

export async function POST(request: Request): Promise<Response> {
  await processClinicScopedBody(request, schema);
  return new Response(null, { status: 204 });
}
