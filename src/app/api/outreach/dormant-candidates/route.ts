import { NextRequest } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
} from '@/lib/api-helpers';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { createAdminClient } from '@/lib/supabase';
import { AppError } from '@/lib/error-handler';
import {
  dormantCandidatesQuerySchema,
  fetchDormantCandidates,
  OUTREACH_ALLOWED_ROLES,
} from '@/lib/outreach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/outreach/dormant-candidates';

export async function GET(request: NextRequest) {
  const rawQuery = {
    clinic_id: request.nextUrl.searchParams.get('clinic_id'),
    days_from: request.nextUrl.searchParams.get('days_from'),
    days_to: request.nextUrl.searchParams.get('days_to'),
  };

  const parsedQuery = dormantCandidatesQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return createErrorResponse(
      '入力値にエラーがあります',
      400,
      parsedQuery.error.flatten()
    );
  }

  try {
    await ensureClinicAccess(request, PATH, parsedQuery.data.clinic_id, {
      allowedRoles: OUTREACH_ALLOWED_ROLES,
      requireClinicMatch: true,
    });

    const data = await fetchDormantCandidates(
      createAdminClient(),
      parsedQuery.data
    );

    return createSuccessResponse(data);
  } catch (error) {
    logError(error, {
      endpoint: PATH,
      method: 'GET',
      userId: 'unknown',
      params: {
        clinic_id: parsedQuery.data.clinic_id,
        days_from: parsedQuery.data.days_from,
        days_to: parsedQuery.data.days_to,
      },
    });

    if (error instanceof AppError) {
      return createErrorResponse(error.message, error.statusCode);
    }

    return createErrorResponse('休眠候補の取得に失敗しました', 500);
  }
}
