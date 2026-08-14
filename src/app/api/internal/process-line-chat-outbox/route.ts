import { NextRequest, NextResponse } from 'next/server';

import { processLineChatOutbox } from '@/lib/line/chat-outbox-processor';
import { createLineIntegrationAdminClient } from '@/lib/line/integration-db';
import { captureOperationalError } from '@/lib/monitoring/sentry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await processLineChatOutbox(
      createLineIntegrationAdminClient()
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    await captureOperationalError(error, {
      endpoint: '/api/internal/process-line-chat-outbox',
      operation: 'process-line-chat-outbox',
      source: 'cron',
    });
    return NextResponse.json(
      { success: false, error: 'Internal job failed', code: 'JOB_FAILED' },
      { status: 500 }
    );
  }
}
