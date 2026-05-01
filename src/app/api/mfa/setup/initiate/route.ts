/**
 * MFA設定開始API
 * Phase 3B: MFA設定API実装
 */

import { NextRequest, NextResponse } from 'next/server';
import { mfaManager } from '@/lib/mfa/mfa-manager';
import { createErrorResponse, processApiRequest } from '@/lib/api-helpers';
import { resolveScopedClinicIds } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';

const log = createLogger('MFASetupInitiateRoute');

export async function POST(request: NextRequest) {
  try {
    const result = await processApiRequest(request);
    if (!result.success) {
      return result.error;
    }

    const scopedClinicIds = resolveScopedClinicIds(result.permissions);
    const clinicId = result.permissions.clinic_id ?? scopedClinicIds?.[0];
    if (!clinicId || !scopedClinicIds?.includes(clinicId)) {
      return createErrorResponse('院へのアクセス権がありません', 403);
    }

    // MFA設定開始
    const setupResult = await mfaManager.initiateMFASetup(
      result.auth.id,
      clinicId
    );

    return NextResponse.json(setupResult);
  } catch (error) {
    log.error('MFA設定開始エラー:', error);

    return createErrorResponse('MFA設定開始に失敗しました', 500);
  }
}
