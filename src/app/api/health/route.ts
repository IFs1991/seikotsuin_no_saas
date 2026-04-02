import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const HEALTH_CHECK_TIMEOUT_MS = 5_000;

function createHealthResponse(
  ok: boolean,
  database: 'connected' | 'disconnected',
  status: number
) {
  return NextResponse.json(
    {
      ok,
      database,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

export async function GET() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const supabase = createAdminClient();

    const healthCheckPromise = supabase.from('clinics').select('id').limit(1);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Health check timed out'));
      }, HEALTH_CHECK_TIMEOUT_MS);
    });

    const { error } = await Promise.race([healthCheckPromise, timeoutPromise]);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (error) {
      return createHealthResponse(false, 'disconnected', 503);
    }

    return createHealthResponse(true, 'connected', 200);
  } catch {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return createHealthResponse(false, 'disconnected', 503);
  }
}
