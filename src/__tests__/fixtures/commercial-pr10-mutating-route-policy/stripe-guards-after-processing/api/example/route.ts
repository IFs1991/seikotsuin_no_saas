import {
  claimStripeWebhookEvent,
  processStripeEvent,
} from '@/lib/billing/stripe-events';
import { constructStripeWebhookEvent } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(request: Request): Promise<Response> {
  const event = constructStripeWebhookEvent({
    payload: await request.text(),
    signature: request.headers.get('stripe-signature') ?? '',
  });
  const client = createAdminClient();
  const claim = await claimStripeWebhookEvent({ client, event, payload: {} });
  await processStripeEvent({ client, event, source: 'fixture' });
  if (claim.status === 'duplicate') return new Response(null, { status: 200 });
  if (claim.status === 'terminal_failure') {
    return new Response(null, { status: 200 });
  }
  if (claim.status === 'busy') return new Response(null, { status: 503 });
  return new Response(null, { status: 204 });
}
