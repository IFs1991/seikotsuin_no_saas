import { NextRequest, NextResponse } from 'next/server';
import { processLineOutbox } from '@/lib/notifications/line-processor';
import { captureOperationalError } from '@/lib/monitoring/sentry';
import { createAdminClient } from '@/lib/supabase';

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
    const result = await processLineOutbox(createAdminClient());
    return NextResponse.json({
      success: true,
      ...result,
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
