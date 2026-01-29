/**
 * レート制限統計取得API
 * Phase 3B: 管理者向けレート制限監視
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/lib/rate-limiting/rate-limiter';
import { processApiRequest } from '@/lib/api-helpers';
import { z } from 'zod';
import { CLINIC_ADMIN_ROLES } from '@/lib/constants/roles';

const QuerySchema = z.object({
  type: z.enum([
    'login_attempts',
    'api_calls',
    'session_creation',
    'mfa_attempts',
  ]),
  identifier: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await processApiRequest(request, {
      allowedRoles: Array.from(CLINIC_ADMIN_ROLES),
      requireClinicMatch: false,
    });
    if (!auth.success) {
      return auth.error!;
    }

    const { searchParams } = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      type: searchParams.get('type'),
      identifier: searchParams.get('identifier'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'type と identifier パラメータが必要です' },
        { status: 400 }
      );
    }

    // レート制限統計取得
    const stats = await rateLimiter.getRateLimitStats(
      parsed.data.type,
      parsed.data.identifier
    );

    return NextResponse.json(stats);
  } catch (error) {
    console.error('レート制限統計取得エラー:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'レート制限統計取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
