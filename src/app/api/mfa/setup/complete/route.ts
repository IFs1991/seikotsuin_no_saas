/**
 * MFA設定完了API
 * Phase 3B: TOTP検証・設定完了
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { z } from 'zod';
import { createErrorResponse, processApiRequest } from '@/lib/api-helpers';
import { createLogger } from '@/lib/logger';

const log = createLogger('MFASetupCompleteRoute');

// リクエストスキーマ
const CompleteMFASetupSchema = z.object({
  token: z.string().length(6, 'TOTPトークンは6桁である必要があります'),
});

export async function POST(request: NextRequest) {
  try {
    const result = await processApiRequest(request, { requireBody: true });
    if (!result.success) {
      return result.error;
    }

    const parsed = CompleteMFASetupSchema.safeParse(result.body);
    if (!parsed.success) {
      return createErrorResponse(
        '入力値が無効です',
        400,
        parsed.error.flatten()
      );
    }

    // MFA設定完了
    const isCompleted = await mfaManager.completeMFASetup(
      result.auth.id,
      parsed.data.token
    );

    if (!isCompleted) {
      return NextResponse.json(
        { error: 'TOTPトークンの検証に失敗しました' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('MFA設定完了エラー:', error);

    return createErrorResponse('MFA設定完了に失敗しました', 500);
  }
}
