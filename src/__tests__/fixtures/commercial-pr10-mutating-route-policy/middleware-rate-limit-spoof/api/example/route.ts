import { constructStripeWebhookEvent } from '@/lib/stripe/server';

export async function POST(request: Request): Promise<Response> {
  constructStripeWebhookEvent({
    payload: await request.text(),
    signature: request.headers.get('stripe-signature') ?? '',
  });
  return new Response(null, { status: 204 });
}
