import { claimStripeWebhookEvent } from '@/lib/billing/stripe-events';
import { constructStripeWebhookEvent } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(request: Request): Promise<Response> {
  const event = constructStripeWebhookEvent({
    payload: await request.text(),
    signature: request.headers.get('stripe-signature') ?? '',
  });
  await claimStripeWebhookEvent({
    client: createAdminClient(),
    event,
    payload: {},
  });
  return new Response(null, { status: 204 });
}
