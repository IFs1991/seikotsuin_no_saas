import {
  claimStripeWebhookEvent,
  processStripeEvent,
} from '@/lib/billing/stripe-events';
import { constructStripeWebhookEvent } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response(null, { status: 400 });
  const verifiedEvent = constructStripeWebhookEvent({
    payload: await request.text(),
    signature,
  });
  const event = { ...verifiedEvent, id: 'forged-event' };
  const client = createAdminClient();
  const claim = await claimStripeWebhookEvent({ client, event, payload: {} });
  if (claim.status === 'duplicate') return new Response(null, { status: 204 });
  if (claim.status === 'terminal_failure')
    return new Response(null, { status: 204 });
  if (claim.status === 'busy') return new Response(null, { status: 503 });
  await processStripeEvent({ client, event, source: 'stripe_webhook' });
  return new Response(null, { status: 204 });
}
