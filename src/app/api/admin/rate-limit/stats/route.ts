/**
 * レート制限統計取得API
 * Phase 3B: 管理者向けレート制限監視
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/lib/rate-limiting/rate-limiter';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as any;
    const identifier = searchParams.get('identifier');

    if (!type || !identifier) {
      return NextResponse.json(
        { error: 'type と identifier パラメータが必要です' },
        { status: 400 }
      );
    }

    // レート制限統計取得
    const stats = await rateLimiter.getRateLimitStats(type, identifier);

    return NextResponse.json(stats);

  } catch (error) {
    console.error('レート制限統計取得エラー:', error);

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'レート制限統計取得に失敗しました' 
      },
      { status: 500 }
    );
  }
}