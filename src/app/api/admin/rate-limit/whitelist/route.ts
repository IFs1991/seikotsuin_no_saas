/**
 * レート制限ホワイトリスト管理API
 * Phase 3B: 信頼できるIPの制限除外
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/lib/rate-limiting/rate-limiter';
import { z } from 'zod';

// ホワイトリスト追加スキーマ
const WhitelistAddSchema = z.object({
  type: z.enum(['login_attempts', 'api_calls', 'session_creation', 'mfa_attempts']),
  identifier: z.string().min(1, '識別子が必要です'),
  ttl: z.number().positive().optional(),
  reason: z.string().optional(),
});

// ホワイトリストチェックスキーマ
const WhitelistCheckSchema = z.object({
  type: z.enum(['login_attempts', 'api_calls', 'session_creation', 'mfa_attempts']),
  identifier: z.string().min(1, '識別子が必要です'),
});

export async function POST(request: NextRequest) {
  try {
    // リクエストボディを解析
    const body = await request.json();
    const { type, identifier, ttl, reason } = WhitelistAddSchema.parse(body);

    // ホワイトリストに追加
    const success = await rateLimiter.addToWhitelist(type, identifier, ttl);

    if (!success) {
      return NextResponse.json(
        { error: 'ホワイトリストへの追加に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${identifier} を ${type} のホワイトリストに追加しました`,
      type,
      identifier,
      ttl,
      addedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('ホワイトリスト追加エラー:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: '入力値が無効です',
          details: error.errors 
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'ホワイトリスト追加に失敗しました' 
      },
      { status: 500 }
    );
  }
}

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

    // ホワイトリスト状態チェック
    const isWhitelisted = await rateLimiter.isWhitelisted(type, identifier);

    return NextResponse.json({
      type,
      identifier,
      isWhitelisted,
      checkedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('ホワイトリストチェックエラー:', error);

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'ホワイトリストチェックに失敗しました' 
      },
      { status: 500 }
    );
  }
}