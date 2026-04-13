import { NextRequest, NextResponse } from 'next/server';
import {
  handleResendWebhookEvent,
  type ResendWebhookEvent,
  verifyResendWebhook,
} from '@/lib/notifications/email/webhook-handler';
import { createAdminClient } from '@/lib/supabase';

/**
 * POST /api/webhooks/resend
 * Resend からの Webhook を受け取り、email_logs に記録する。
 * raw body での署名検証を行う。
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const isValid = verifyResendWebhook(rawBody, request.headers, webhookSecret);

  if (!isValid) {
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    );
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    await handleResendWebhookEvent(supabase, event);

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
