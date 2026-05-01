/**
 * MFA状態取得API
 * Phase 3B: MFA設定状況確認
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { createErrorResponse, processApiRequest } from '@/lib/api-helpers';
import { createLogger } from '@/lib/logger';

const log = createLogger('MFAStatusRoute');

export async function GET(request: NextRequest) {
  try {
    const result = await processApiRequest(request);
    if (!result.success) {
      return result.error;
    }

    // MFA状態取得
    const mfaStatus = await mfaManager.getMFAStatus(result.auth.id);

    return NextResponse.json(mfaStatus);
  } catch (error) {
    log.error('MFA状態取得エラー:', error);

    return createErrorResponse('MFA状態取得に失敗しました', 500);
  }
}
