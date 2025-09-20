/**
 * レート制限リセットAPI
 * Phase 3B: 管理者によるレート制限解除
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/lib/rate-limiting/rate-limiter';
import { z } from 'zod';

// リクエストスキーマ
const ResetRateLimitSchema = z.object({
  type: z.enum([
    'login_attempts',
    'api_calls',
    'session_creation',
    'mfa_attempts',
  ]),
  identifier: z.string().min(1, '識別子が必要です'),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // リクエストボディを解析
    const body = await request.json();
    const { type, identifier, reason } = ResetRateLimitSchema.parse(body);

    // レート制限リセット
    const success = await rateLimiter.resetRateLimit(type, identifier);

    if (!success) {
      return NextResponse.json(
        { error: 'レート制限のリセットに失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${type} の制限がリセットされました`,
      identifier,
      resetTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('レート制限リセットエラー:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: '入力値が無効です',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'レート制限リセットに失敗しました',
      },
      { status: 500 }
    );
  }
}
