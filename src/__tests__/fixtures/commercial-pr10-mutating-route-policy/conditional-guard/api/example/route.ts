import { processApiRequest } from '@/lib/api-helpers';

export async function POST(request: Request): Promise<Response> {
  if (request.headers.has('x-run-guard')) {
    const result = await processApiRequest(request);
    if (!result.success) return result.error;
  }
  return new Response(null, { status: 204 });
}
