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
import { patientQuerySchema } from './schema';
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

/**
 * @deprecated POST /api/patients is no longer supported.
 * Use POST /api/customers instead.
 *
 * This endpoint is disabled to enforce SSOT on public.customers.
 * See: docs/stabilization/spec-customers-ssot-step1-v0.1.md
 */
export async function POST(_request: NextRequest) {
  return createErrorResponse(
    'POST /api/patients は廃止されました。POST /api/customers を使用してください。',
    405,
    {
      code: 'METHOD_NOT_ALLOWED',
      message:
        'POST /api/patients is deprecated. Use POST /api/customers instead.',
      alternative: '/api/customers',
      path: '/api/patients',
    }
  );
}

/**
 * @deprecated PATCH /api/patients is not supported.
 * Use PATCH /api/customers instead.
 */
export async function PATCH(_request: NextRequest) {
  return createErrorResponse(
    'PATCH /api/patients は廃止されました。PATCH /api/customers を使用してください。',
    405,
    {
      code: 'METHOD_NOT_ALLOWED',
      message:
        'PATCH /api/patients is deprecated. Use PATCH /api/customers instead.',
      alternative: '/api/customers',
      path: '/api/patients',
    }
  );
}

/**
 * @deprecated DELETE /api/patients is not supported.
 * Use DELETE /api/customers instead.
 */
export async function DELETE(_request: NextRequest) {
  return createErrorResponse(
    'DELETE /api/patients は廃止されました。DELETE /api/customers を使用してください。',
    405,
    {
      code: 'METHOD_NOT_ALLOWED',
      message:
        'DELETE /api/patients is deprecated. Use DELETE /api/customers instead.',
      alternative: '/api/customers',
      path: '/api/patients',
    }
  );
}
