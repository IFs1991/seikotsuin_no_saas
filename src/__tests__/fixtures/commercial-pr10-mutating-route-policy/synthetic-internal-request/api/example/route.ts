import { NextRequest } from 'next/server';
import { requireBillingInternalRequest } from '@/lib/billing/internal-auth';
import { env } from '@/lib/env';

const store = { insert: (_value: unknown) => undefined };

export async function POST(request: NextRequest): Promise<Response> {
  const syntheticRequest = new NextRequest(request.url, {
    headers: {
      authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
    },
  });
  const auth = requireBillingInternalRequest(syntheticRequest, {
    internalActor: 'fixture-self-approved',
  });
  if (!auth.success) return auth.response;

  store.insert(await request.json());
  return new Response(null, { status: 204 });
}
