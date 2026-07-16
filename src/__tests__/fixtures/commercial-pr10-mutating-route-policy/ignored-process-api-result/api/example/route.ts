import { processApiRequest } from '@/lib/api-helpers';

export async function POST(request: Request): Promise<Response> {
  await processApiRequest(request);
  return new Response(null, { status: 204 });
}
