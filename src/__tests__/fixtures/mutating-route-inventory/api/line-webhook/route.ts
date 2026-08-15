import {
  persistLineWebhookDelivery,
  verifyLineWebhookRequest,
} from '@/lib/line/webhook-service';
import type { LineIntegrationClient } from '@/lib/line/integration-db';

declare function createClient(): LineIntegrationClient;

export async function POST(request: Request) {
  const clinicId = '11111111-1111-4111-8111-111111111111';
  const client = createClient();
  const body = await request.text();
  const verified = await verifyLineWebhookRequest({
    body,
    clinicId,
    client,
    signature: request.headers.get('x-line-signature'),
  });
  return await persistLineWebhookDelivery({
    clinicId,
    client,
    credentialGenerationId: verified.credentialGenerationId,
    events: verified.events,
  });
}

export async function PUT(request: Request) {
  const clinicId = '11111111-1111-4111-8111-111111111111';
  const client = createClient();
  const body = await request.text();
  await verifyLineWebhookRequest({
    body,
    clinicId,
    client,
    signature: request.headers.get('x-line-signature'),
  });
  return await persistLineWebhookDelivery({
    clinicId,
    client,
    credentialGenerationId: 'unverified-generation',
    events: [],
  });
}
