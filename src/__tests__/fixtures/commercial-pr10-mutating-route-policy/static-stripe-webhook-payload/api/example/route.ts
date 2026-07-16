import { constructStripeWebhookEvent } from '@/lib/stripe/server';

const store = { insert: (_value: unknown) => undefined };

export async function POST(request: Request): Promise<Response> {
  constructStripeWebhookEvent({
    payload: '{"type":"fixture.signed"}',
    signature: 'fixture-static-signature',
  });

  store.insert(await request.json());
  return new Response(null, { status: 204 });
}
