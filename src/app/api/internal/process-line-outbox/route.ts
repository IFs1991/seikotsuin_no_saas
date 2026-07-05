import { NextRequest, NextResponse } from 'next/server';
import { processLineOutbox } from '@/lib/notifications/line-processor';
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
