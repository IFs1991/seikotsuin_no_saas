/**
 * バックアップコード再生成API
 * Phase 3B: バックアップコード管理
 */

import { NextRequest, NextResponse } from 'next/server';
import { backupCodeManager } from '@/lib/mfa/backup-codes';
import { z } from 'zod';
import { createErrorResponse, processApiRequest } from '@/lib/api-helpers';
import { createLogger } from '@/lib/logger';

const log = createLogger('MFABackupCodeRegenerateRoute');

// リクエストスキーマ
const RegenerateBackupCodesSchema = z.object({
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const result = await processApiRequest(request, { requireBody: true });
    if (!result.success) {
      return result.error;
    }

    const validation = RegenerateBackupCodesSchema.safeParse(result.body);
    if (!validation.success) {
      return createErrorResponse(
        '入力値が無効です',
        400,
        validation.error.flatten()
      );
    }

    // バックアップコード再生成
    const newBackupCodes = await backupCodeManager.regenerateBackupCodes(
      result.auth.id,
      result.auth.id
    );

    return NextResponse.json({
      success: true,
      backupCodes: newBackupCodes,
      count: newBackupCodes.length,
    });
  } catch (error) {
    log.error('バックアップコード再生成エラー:', error);

    return createErrorResponse('バックアップコード再生成に失敗しました', 500);
  }
}
