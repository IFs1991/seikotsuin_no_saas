import { NextRequest, NextResponse } from 'next/server';

import { cleanupLineChatData } from '@/lib/line/chat-cleanup-service';
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
    const result = await cleanupLineChatData(
      createLineIntegrationAdminClient()
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    await captureOperationalError(error, {
      endpoint: '/api/internal/cleanup-line-chat',
      operation: 'cleanup-line-chat',
      source: 'cron',
    });
    return NextResponse.json(
      { success: false, error: 'Internal job failed', code: 'JOB_FAILED' },
      { status: 500 }
    );
  }
}
