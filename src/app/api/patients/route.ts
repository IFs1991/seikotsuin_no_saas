import { NextRequest } from 'next/server';
import { PatientAnalysisData, PatientRiskScore } from '@/types/api';
import {
  normalizeSupabaseError,
  createApiError,
  ERROR_CODES,
  AppError,
  logError,
} from '@/lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';
import {
  createErrorResponse,
  createSuccessResponse,
} from '@/lib/api-helpers';
import {
  patientInsertSchema,
  patientQuerySchema,
  mapPatientInsertToRow,
} from './schema';

interface PatientVisitSummaryRow {
  patient_id: string;
  patient_name: string;
  visit_count: number;
  total_revenue: number;
  last_visit_date: string | null;
  visit_category: string | null;
}

export async function GET(request: NextRequest) {
  const path = '/api/patients';
  const { ipAddress, userAgent } = getRequestInfo(request);

  try {
    const rawParams = {
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      analysis: request.nextUrl.searchParams.get('analysis') ?? undefined,
    };

    const parsedQuery = patientQuerySchema.safeParse(rawParams);
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id, analysis } = parsedQuery.data;

    const { supabase, user } = await ensureClinicAccess(
      request,
      path,
      clinic_id,
      {
        requireClinicMatch: true,
      }
    );

    await AuditLogger.logDataAccess(
      user.id,
      user.email || '',
      'patient_visit_summary',
      clinic_id,
      clinic_id,
      ipAddress,
      {
        analysis_type: analysis,
        request_params: rawParams,
      }
    );

    const { data: patients, error: patientsError } = await supabase
      .from('patient_visit_summary')
      .select('*')
      .eq('clinic_id', clinic_id);

    if (patientsError) {
      throw normalizeSupabaseError(patientsError, path);
    }

    const typedPatients = (patients as PatientVisitSummaryRow[]) ?? [];

    const conversionAnalysis = () => {
      const newPatients = typedPatients.filter(p => p.visit_count === 1);
      const returnPatients = typedPatients.filter(p => p.visit_count > 1);
      const total = newPatients.length + returnPatients.length;
      const conversionRate =
        total > 0
          ? Math.round(((returnPatients.length / total) * 100) * 100) / 100
          : 0;

      return {
        newPatients: newPatients.length,
        returnPatients: returnPatients.length,
        conversionRate,
        stages: [
          { name: '初回来院', value: total },
          { name: '2回目来院', value: returnPatients.length },
          {
            name: '継続通院',
            value: typedPatients.filter(p => p.visit_count >= 5).length,
          },
        ],
      };
    };

    const ltvRanking = await Promise.all(
      typedPatients.slice(0, 20).map(async patient => {
        const { data: ltv } = await supabase.rpc('calculate_patient_ltv', {
          patient_uuid: patient.patient_id,
        });

        return {
          patient_id: patient.patient_id,
          name: patient.patient_name,
          ltv: ltv || 0,
          visit_count: patient.visit_count,
          total_revenue: patient.total_revenue,
        };
      })
    );

    const riskScores = await Promise.all(
      typedPatients.map(async patient => {
        const { data: riskScore } = await supabase.rpc(
          'calculate_churn_risk_score',
          { patient_uuid: patient.patient_id }
        );

        const score = Number(riskScore) || 0;
        return {
          patient_id: patient.patient_id,
          name: patient.patient_name,
          riskScore: score,
          lastVisit: patient.last_visit_date,
          category: score > 75 ? 'high' : score > 50 ? 'medium' : 'low',
        } satisfies PatientRiskScore;
      })
    );

    const segmentAnalysis = () => {
      const total = typedPatients.length;
      if (total === 0) return {};

      const visitSegments = {
        初診のみ: typedPatients.filter(p => p.visit_category === '初診のみ').length,
        軽度リピート: typedPatients.filter(p => p.visit_category === '軽度リピート').length,
        中度リピート: typedPatients.filter(p => p.visit_category === '中度リピート').length,
        高度リピート: typedPatients.filter(p => p.visit_category === '高度リピート').length,
      };

      return {
        visit: Object.entries(visitSegments).map(([label, value]) => ({
          label,
          value,
        })),
      };
    };

    const followUpList = riskScores
      .filter(patient => patient.riskScore > 60)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map(patient => ({
        patient_id: patient.patient_id,
        name: patient.name,
        reason: `${patient.riskScore}%の離脱リスク`,
        lastVisit: patient.lastVisit,
        action: '電話フォロー推奨',
      }));

    const visitCounts = {
      average:
        typedPatients.length > 0
          ? Math.round(
              (typedPatients.reduce((sum, p) => sum + p.visit_count, 0) /
                typedPatients.length) *
                100
            ) / 100
          : 0,
      monthlyChange: 5.2,
    };

    const patientAnalysisData: PatientAnalysisData = {
      conversionData: conversionAnalysis(),
      visitCounts,
      riskScores: riskScores.sort((a, b) => b.riskScore - a.riskScore).slice(0, 20),
      ltvRanking: ltvRanking.sort((a, b) => b.ltv - a.ltv),
      segmentData: segmentAnalysis(),
      followUpList,
      totalPatients: typedPatients.length,
      activePatients: typedPatients.filter(p => p.visit_count > 1).length,
    };

    return createSuccessResponse(patientAnalysisData);
  } catch (error) {
    const path = '/api/patients';
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(path);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, path);
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Patient analysis failed',
        undefined,
        path
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path,
      clinicId: request.nextUrl.searchParams.get('clinic_id'),
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

export async function POST(request: NextRequest) {
  const path = '/api/patients';

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const parsedBody = patientInsertSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = parsedBody.data;

    const { supabase } = await ensureClinicAccess(request, path, dto.clinic_id, {
      requireClinicMatch: true,
    });

    const insertPayload = mapPatientInsertToRow(dto);
    const registrationDate = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('patients')
      .insert({
        ...insertPayload,
        registration_date: registrationDate,
      })
      .select()
      .single();

    if (error) {
      throw normalizeSupabaseError(error, path);
    }

    return createSuccessResponse(data, 201);
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(path);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, path);
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'Patient creation failed',
        undefined,
        path
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path,
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}
