import {
  handleResendWebhookEvent,
  type ResendWebhookEvent,
  verifyResendWebhook,
} from '@/lib/notifications/email/webhook-handler';
import { createAdminClient } from '@/lib/supabase';

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const valid = verifyResendWebhook(
    rawBody,
    request.headers,
    process.env.RESEND_WEBHOOK_SECRET ?? ''
  );
  if (!valid) return new Response(null, { status: 400 });

  const unrelatedEvent: ResendWebhookEvent = {
    type: 'email.delivered',
    data: { email_id: 'unrelated-static-event' },
  };
  await handleResendWebhookEvent(createAdminClient(), unrelatedEvent);
  return new Response(null, { status: 204 });
}
