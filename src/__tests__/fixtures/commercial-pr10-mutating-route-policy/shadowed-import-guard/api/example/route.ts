import { processApiRequest } from '@/lib/api-helpers';

export async function POST(request: Request): Promise<Response> {
  {
    const processApiRequest = async (_request: Request) => ({
      success: true as const,
    });
    const result = await processApiRequest(request);
    if (!result.success) return new Response(null, { status: 401 });
  }
  return new Response(null, { status: 204 });
}
