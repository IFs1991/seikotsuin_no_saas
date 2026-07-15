import { NextRequest } from 'next/server';
import {
  createAuthorityUnavailableResponse,
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { AppError } from '@/lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { createAdminClient } from '@/lib/supabase';
import {
  createOutreachDraft,
  listOutreachCampaigns,
  OutreachDraftValidationError,
  outreachCampaignsQuerySchema,
  outreachDraftSchema,
  OUTREACH_ALLOWED_ROLES,
} from '@/lib/outreach';
import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/outreach/campaigns';

export async function GET(request: NextRequest) {
  const rawQuery = {
    clinic_id: request.nextUrl.searchParams.get('clinic_id'),
  };

  const parsedQuery = outreachCampaignsQuerySchema.safeParse(rawQuery);
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

    const data = await listOutreachCampaigns(
      createAdminClient(),
      parsedQuery.data
    );

    return createSuccessResponse(data);
  } catch (error) {
    const authorityUnavailable = createAuthorityUnavailableResponse(error);
    if (authorityUnavailable) return authorityUnavailable;

    logError(error, {
      endpoint: PATH,
      method: 'GET',
      userId: 'unknown',
      params: {
        clinic_id: parsedQuery.data.clinic_id,
      },
    });

    if (error instanceof AppError) {
      return createErrorResponse(error.message, error.statusCode);
    }

    return createErrorResponse('キャンペーン一覧の取得に失敗しました', 500);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await processApiRequest(request, {
    requireBody: true,
    allowedRoles: OUTREACH_ALLOWED_ROLES,
    requireClinicMatch: false,
  });
  if (!authResult.success) {
    return authResult.error;
  }

  const parsedBody = outreachDraftSchema.safeParse(authResult.body);
  if (!parsedBody.success) {
    return createErrorResponse(
      '入力値にエラーがあります',
      400,
      parsedBody.error.flatten()
    );
  }

  try {
    const { permissions } = await ensureClinicAccess(
      request,
      PATH,
      parsedBody.data.clinic_id,
      {
        allowedRoles: OUTREACH_ALLOWED_ROLES,
        requireClinicMatch: true,
      }
    );

    await ensureScopedBusinessWriteAccess({
      permissions,
      targetClinicId: parsedBody.data.clinic_id,
    });

    const data = await createOutreachDraft(
      createAdminClient(),
      parsedBody.data,
      authResult.auth.id
    );

    return createSuccessResponse(data, 201);
  } catch (error) {
    const authorityUnavailable = createAuthorityUnavailableResponse(error);
    if (authorityUnavailable) return authorityUnavailable;

    logError(error, {
      endpoint: PATH,
      method: 'POST',
      userId: authResult.auth.id,
      params: {
        clinic_id: parsedBody.data.clinic_id,
        selected_count: parsedBody.data.customer_ids.length,
      },
    });

    if (error instanceof OutreachDraftValidationError) {
      return createErrorResponse(error.message, 400);
    }

    if (error instanceof AppError) {
      return createErrorResponse(
        error.message,
        error.statusCode,
        undefined,
        error.code
      );
    }

    return createErrorResponse('キャンペーン下書きの作成に失敗しました', 500);
  }
}
