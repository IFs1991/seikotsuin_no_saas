import { NextRequest } from 'next/server';

import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';
import { ADMIN_USER_ROLE_VALUES } from '@/lib/constants/roles';
import { AppError } from '@/lib/error-handler';
import type {
  MobileUiuxPatientAnalysisResponse,
  MobileUiuxPatientAnalysisRow,
} from '@/lib/mobile-uiux/contracts';
import { prefetchMobileUiuxClinicEntitlement } from '@/lib/mobile-uiux/entitlements';
import {
  areMobileUiuxRealDataReadsEnabled,
  getMobileUiuxFlags,
} from '@/lib/mobile-uiux/flags';
import {
  buildMobileUiuxFailure,
  buildMobileUiuxSuccess,
  getRequiredClinicId,
  logMobileUiuxClinicScopeDenied,
  logMobileUiuxEntitlementDenied,
  logMobileUiuxFlagDenied,
} from '@/lib/mobile-uiux/route-utils';
import { generatePatientAnalysis } from '@/lib/services/patient-analysis-service';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  AUTHORITY_UNAVAILABLE_PUBLIC_MESSAGE,
  isAuthorityUnavailableError,
} from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/mobile-uiux/patient-analysis';
const MOBILE_UIUX_READ_ALLOWED_ROLES = ADMIN_USER_ROLE_VALUES;
const ANALYSIS_TYPES = ['conversion', 'ltv', 'churn', 'segment'] as const;

function isValidAnalysisType(value: string): boolean {
  return ANALYSIS_TYPES.some(type => type === value);
}

function buildAccessError(error: unknown) {
  if (isAuthorityUnavailableError(error)) {
    return buildMobileUiuxFailure(
      503,
      'INTERNAL',
      AUTHORITY_UNAVAILABLE_PUBLIC_MESSAGE
    );
  }

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

function buildMobileUiuxPatientRows(
  analysis: MobileUiuxPatientAnalysisResponse['analysis']
): MobileUiuxPatientAnalysisRow[] {
  const ltvByPatientId = new Map(
    analysis.ltvRanking.map(patient => [patient.patient_id, patient])
  );
  const patientIds = new Set<string>();
  for (const patient of analysis.riskScores) {
    patientIds.add(patient.patient_id);
  }
  for (const patient of analysis.ltvRanking) {
    patientIds.add(patient.patient_id);
  }

  return [...patientIds].slice(0, 20).map(patientId => {
    const risk = analysis.riskScores.find(
      patient => patient.patient_id === patientId
    );
    const ltv = ltvByPatientId.get(patientId);
    const ltvValue = ltv?.ltv ?? ltv?.total_revenue ?? 0;

    return {
      name: risk?.name ?? ltv?.name ?? '患者名未設定',
      lastVisit: risk?.lastVisit ?? null,
      visitCount: ltv?.visit_count ?? 0,
      totalRevenue: ltv?.total_revenue ?? ltvValue,
      ltv: ltvValue,
      riskScore: risk?.riskScore ?? 0,
      riskCategory: risk?.category ?? 'low',
    };
  });
}

export async function GET(request: NextRequest) {
  const flags = getMobileUiuxFlags();
  if (!flags.enabled || !flags.realDataEnabled) {
    logMobileUiuxFlagDenied({
      flags,
      writeTarget: 'patient-analysis',
      status: 403,
    });
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

  // Overlaps the entitlement lookup with the access check; the result is
  // consumed only after access passes (fail-closed on any lookup error).
  const entitlementPromise = prefetchMobileUiuxClinicEntitlement({
    flags,
    clinicId,
  });

  let access;
  try {
    access = await ensureClinicAccess(request, PATH, clinicId, {
      requireClinicMatch: true,
      allowedRoles: Array.from(MOBILE_UIUX_READ_ALLOWED_ROLES),
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 403) {
      logMobileUiuxClinicScopeDenied({
        flags,
        writeTarget: 'patient-analysis',
        status: error.statusCode,
      });
    } else if (!(error instanceof AppError)) {
      logMobileUiuxClinicScopeDenied({
        flags,
        writeTarget: 'patient-analysis',
        status: 403,
      });
    }
    return buildAccessError(error);
  }

  const entitlement = await entitlementPromise;
  if (!areMobileUiuxRealDataReadsEnabled(flags, entitlement)) {
    logMobileUiuxEntitlementDenied({
      flags,
      writeTarget: 'patient-analysis',
      status: 403,
    });
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

  const analysisData = await generatePatientAnalysis(access.supabase, clinicId);
  const data: MobileUiuxPatientAnalysisResponse = {
    clinicId,
    analysis: analysisData,
    rows: buildMobileUiuxPatientRows(analysisData),
  };

  return buildMobileUiuxSuccess(data);
}
