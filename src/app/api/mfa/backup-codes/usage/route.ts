/**
 * バックアップコード使用状況取得API
 * Phase 3B: バックアップコード統計
 */

import { NextRequest, NextResponse } from 'next/server';
import { backupCodeManager } from '@/lib/mfa/backup-codes';
import { createErrorResponse, processApiRequest } from '@/lib/api-helpers';
import { createLogger } from '@/lib/logger';

const log = createLogger('MFABackupCodeUsageRoute');

export async function GET(request: NextRequest) {
  try {
    const result = await processApiRequest(request);
    if (!result.success) {
      return result.error;
    }

    // バックアップコード使用状況取得
    const usage = await backupCodeManager.getBackupCodeUsage(result.auth.id);

    return NextResponse.json(usage);
  } catch (error) {
    log.error('バックアップコード使用状況取得エラー:', error);

    return createErrorResponse(
      'バックアップコード使用状況取得に失敗しました',
      500
    );
  }
}
