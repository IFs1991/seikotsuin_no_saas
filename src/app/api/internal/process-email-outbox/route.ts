import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { ResendEmailProvider } from '@/lib/notifications/email/resend-provider';
import { processEmailOutbox } from '@/lib/notifications/email/processor';
import { captureOperationalError } from '@/lib/monitoring/sentry';

/**
 * GET /api/internal/process-email-outbox
 * Vercel Cron から呼ばれる outbox 処理エンドポイント。
 * CRON_SECRET による認証必須。
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const provider = new ResendEmailProvider();

    const result = await processEmailOutbox(supabase, provider);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    await captureOperationalError(error, {
      source: 'cron',
      operation: 'process-email-outbox',
      endpoint: '/api/internal/process-email-outbox',
    });
    return NextResponse.json(
      { success: false, error: 'Internal job failed', code: 'JOB_FAILED' },
      { status: 500 }
    );
  }
}
