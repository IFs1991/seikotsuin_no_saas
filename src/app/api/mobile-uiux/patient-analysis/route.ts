import { NextRequest } from 'next/server';

import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';
import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import { AppError } from '@/lib/error-handler';
import type { MobileUiuxPatientAnalysisResponse } from '@/lib/mobile-uiux/contracts';
import { fetchMobileUiuxClinicEntitlement } from '@/lib/mobile-uiux/entitlements';
import {
  areMobileUiuxRealDataReadsEnabled,
  getMobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  getRequiredClinicId,
} from '@/lib/mobile-uiux/route-utils';
import { generatePatientAnalysis } from '@/lib/services/patient-analysis-service';
import { ensureClinicAccess } from '@/lib/supabase/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/mobile-uiux/patient-analysis';
const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;
const ANALYSIS_TYPES = ['conversion', 'ltv', 'churn', 'segment'] as const;

function isValidAnalysisType(value: string): boolean {
  return ANALYSIS_TYPES.some(type => type === value);
}

function buildAccessError(error: unknown) {
  if (error instanceof AppError) {
    return buildMobileUiuxFailure(
      error.statusCode,
      error.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
      error.statusCode === 401
        ? '認証が必要です'
        : '対象クリニックへのアクセス権がありません'
    );
  }

  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    '対象クリニックへのアクセス権がありません'
  );
}

function buildRealDataDisabledResponse() {
  return buildMobileUiuxFailure(
    403,
    'FORBIDDEN',
    'モバイル UI/UX の実データ参照は無効です'
  );
}

export async function GET(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!flags.enabled || !flags.realDataEnabled) {
    return buildRealDataDisabledResponse();
  }

  const clinicId = getRequiredClinicId(
    request.nextUrl.searchParams.get('clinic_id')
  );
  if (!clinicId) {
    return buildMobileUiuxFailure(
      400,
      'BAD_REQUEST',
      'clinic_id はUUID形式で指定してください'
    );
  }

  const analysis = request.nextUrl.searchParams.get('analysis');
  if (analysis !== null && !isValidAnalysisType(analysis)) {
    return buildMobileUiuxFailure(
      400,
      'BAD_REQUEST',
      'analysis の値が正しくありません'
    );
  }

  let access;
  try {
    access = await ensureClinicAccess(request, PATH, clinicId, {
      requireClinicMatch: true,
      allowedRoles: Array.from(MOBILE_UIUX_READ_ALLOWED_ROLES),
    });
  } catch (error) {
    return buildAccessError(error);
  }

  const entitlement = await fetchMobileUiuxClinicEntitlement({
    supabase: access.supabase,
    flags,
    clinicId,
  });
  if (!areMobileUiuxRealDataReadsEnabled(flags, entitlement)) {
    return buildRealDataDisabledResponse();
  }

  const { ipAddress } = getRequestInfo(request);
  await AuditLogger.logDataAccess(
    access.user.id,
    access.user.email || '',
    'patient_visit_summary',
    clinicId,
    clinicId,
    ipAddress,
    {
      analysis_type: analysis ?? undefined,
    }
  );

  const data: MobileUiuxPatientAnalysisResponse = {
    clinicId,
    analysis: await generatePatientAnalysis(access.supabase, clinicId),
  };

  return buildMobileUiuxSuccess(data);
}
