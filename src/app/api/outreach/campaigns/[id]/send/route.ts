import { NextRequest } from 'next/server';
import { z } from 'zod';
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
  OutreachDraftValidationError,
  OUTREACH_SEND_ALLOWED_ROLES,
  outreachCampaignSendSchema,
  sendOutreachCampaign,
} from '@/lib/outreach';
import { ensureScopedBusinessWriteAccess } from '@/lib/billing/business-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/outreach/campaigns/[id]/send';
const campaignIdSchema = z.string().uuid('id はUUID形式で指定してください');

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const parsedId = campaignIdSchema.safeParse(id);
  if (!parsedId.success) {
    return createErrorResponse(
      '入力値にエラーがあります',
      400,
      parsedId.error.flatten()
    );
  }

  const authResult = await processApiRequest(request, {
    requireBody: true,
    allowedRoles: OUTREACH_SEND_ALLOWED_ROLES,
    requireClinicMatch: false,
  });
  if (!authResult.success) {
    return authResult.error;
  }

  const parsedBody = outreachCampaignSendSchema.safeParse(authResult.body);
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
        allowedRoles: OUTREACH_SEND_ALLOWED_ROLES,
        requireClinicMatch: true,
      }
    );

    await ensureScopedBusinessWriteAccess({
      permissions,
      targetClinicId: parsedBody.data.clinic_id,
    });

    const data = await sendOutreachCampaign(
      createAdminClient(),
      {
        clinicId: parsedBody.data.clinic_id,
        campaignId: parsedId.data,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
      },
      new Date()
    );

    return createSuccessResponse(data);
  } catch (error) {
    logError(error, {
      endpoint: PATH,
      method: 'POST',
      userId: authResult.auth.id,
      params: {
        clinic_id: parsedBody.data.clinic_id,
        campaign_id: parsedId.data,
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

    return createErrorResponse('キャンペーン配信に失敗しました', 500);
  }
}
