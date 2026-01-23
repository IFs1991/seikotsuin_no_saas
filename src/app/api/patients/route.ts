import { NextRequest } from 'next/server';
import {
  normalizeSupabaseError,
  createApiError,
  ERROR_CODES,
  AppError,
  logError,
} from '@/lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import {
  patientInsertSchema,
  patientQuerySchema,
  mapPatientInsertToRow,
} from './schema';
import { generatePatientAnalysis } from '@/lib/services/patient-analysis-service';

/**
 * @deprecated Use GET /api/customers/analysis instead.
 * This endpoint will be removed after MVP shadow operation stabilizes.
 *
 * Migration path:
 * - Old: api.patients.getAnalysis(clinicId)
 * - New: api.customers.getAnalysis(clinicId)
 */
export async function GET(request: NextRequest) {
  const path = '/api/patients';
  const { ipAddress } = getRequestInfo(request);

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

    // 共有ヘルパーを使用して分析データを生成
    const patientAnalysisData = await generatePatientAnalysis(
      supabase,
      clinic_id
    );

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

    const { supabase } = await ensureClinicAccess(
      request,
      path,
      dto.clinic_id,
      {
        requireClinicMatch: true,
      }
    );

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
