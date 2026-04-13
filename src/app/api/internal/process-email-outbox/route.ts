import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { ResendEmailProvider } from '@/lib/notifications/email/resend-provider';
import { processEmailOutbox } from '@/lib/notifications/email/processor';

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
