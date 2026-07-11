import { NextRequest, NextResponse } from 'next/server';
import { processReservationReminders } from '@/lib/notifications/reservation-reminders';
import { captureOperationalError } from '@/lib/monitoring/sentry';
import { createAdminClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processReservationReminders(createAdminClient());
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    await captureOperationalError(error, {
      source: 'cron',
      operation: 'reservation-reminders',
      endpoint: '/api/internal/reservation-reminders',
    });
    return NextResponse.json(
      { success: false, error: 'Internal job failed', code: 'JOB_FAILED' },
      { status: 500 }
    );
  }
}
