import { NextRequest, NextResponse } from 'next/server';
import { processLineOutbox } from '@/lib/notifications/line-processor';
import { captureOperationalError } from '@/lib/monitoring/sentry';
import { createLineIntegrationAdminClient } from '@/lib/line/integration-db';
import { processLineChatOutbox } from '@/lib/line/chat-outbox-processor';
import { cleanupLineChatData } from '@/lib/line/chat-cleanup-service';

/**
 * GET /api/internal/process-line-outbox
 * Vercel Cron から呼ばれる LINE outbox 処理エンドポイント。
 * CRON_SECRET による認証必須。
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = createLineIntegrationAdminClient();
    const { data: expiredSetupSessions, error: expiryError } = await client.rpc(
      'expire_line_setup_sessions',
      {}
    );
    if (expiryError) throw expiryError;
    const [result, chatResult] = await Promise.all([
      processLineOutbox(client),
      processLineChatOutbox(client),
    ]);
    const cleanupResult = await cleanupLineChatData(client);
    return NextResponse.json({
      success: true,
      expiredSetupSessions: expiredSetupSessions ?? 0,
      notifications: result,
      chat: chatResult,
      cleanup: cleanupResult,
    });
  } catch (error) {
    await captureOperationalError(error, {
      source: 'cron',
      operation: 'process-line-outbox',
      endpoint: '/api/internal/process-line-outbox',
    });
    return NextResponse.json(
      { success: false, error: 'Internal job failed', code: 'JOB_FAILED' },
      { status: 500 }
    );
  }
}
