/**
 * MFA無効化API
 * Phase 3B: MFA設定解除
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { z } from 'zod';
import { createErrorResponse, processApiRequest } from '@/lib/api-helpers';
import { createLogger } from '@/lib/logger';

const log = createLogger('MFADisableRoute');

// リクエストスキーマ
const DisableMFASchema = z.object({
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const result = await processApiRequest(request, { requireBody: true });
    if (!result.success) {
      return result.error;
    }

    const validation = DisableMFASchema.safeParse(result.body);
    if (!validation.success) {
      return createErrorResponse(
        '入力値が無効です',
        400,
        validation.error.flatten()
      );
    }

    // MFA無効化
    const isDisabled = await mfaManager.disableMFA(
      result.auth.id,
      result.auth.id
    );

    if (!isDisabled) {
      return NextResponse.json(
        { error: 'MFA無効化に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'MFAが無効化されました',
    });
  } catch (error) {
    log.error('MFA無効化エラー:', error);

    return createErrorResponse('MFA無効化に失敗しました', 500);
  }
}
