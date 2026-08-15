import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createLineIntegrationAdminClient } from '@/lib/line/integration-db';
import {
  LineWebhookRequestError,
  persistLineWebhookDelivery,
  verifyLineWebhookRequest,
} from '@/lib/line/webhook-service';
import { captureOperationalError } from '@/lib/monitoring/sentry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ClinicIdSchema = z.string().uuid();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ clinicId: string }> }
) {
  const { clinicId: rawClinicId } = await context.params;
  const clinicId = ClinicIdSchema.safeParse(rawClinicId);
  if (!clinicId.success) {
    return NextResponse.json({ error: 'Invalid clinic' }, { status: 404 });
  }

  try {
    const client = createLineIntegrationAdminClient();
    const body = await request.text();
    const verified = await verifyLineWebhookRequest({
      body,
      clinicId: clinicId.data,
      client,
      signature: request.headers.get('x-line-signature'),
    });
    const result = await persistLineWebhookDelivery({
      clinicId: clinicId.data,
      client,
      credentialGenerationId: verified.credentialGenerationId,
      events: verified.events,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof LineWebhookRequestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    await captureOperationalError(error, {
      endpoint: '/api/webhooks/line/[clinicId]',
      operation: 'process-line-webhook',
      source: 'webhook',
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
