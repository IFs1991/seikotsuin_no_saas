import { NextRequest } from 'next/server';
import {
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
  OutreachDraftValidationError,
  outreachDraftSchema,
  OUTREACH_ALLOWED_ROLES,
} from '@/lib/outreach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/outreach/campaigns';

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
    await ensureClinicAccess(request, PATH, parsedBody.data.clinic_id, {
      allowedRoles: OUTREACH_ALLOWED_ROLES,
      requireClinicMatch: true,
    });

    const data = await createOutreachDraft(
      createAdminClient(),
      parsedBody.data,
      authResult.auth.id
    );

    return createSuccessResponse(data, 201);
  } catch (error) {
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
      return createErrorResponse(error.message, error.statusCode);
    }

    return createErrorResponse('キャンペーン下書きの作成に失敗しました', 500);
  }
}
