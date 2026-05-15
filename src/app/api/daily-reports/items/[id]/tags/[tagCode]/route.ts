import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  processApiRequest,
} from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError } from '@/lib/route-helpers';
import {
  createScopedAdminContext,
  type SupabaseServerClient,
} from '@/lib/supabase';
import { CLINIC_ADMIN_ROLES } from '@/lib/constants/roles';

const PATH = '/api/daily-reports/items/[id]/tags/[tagCode]';

const tagDeleteQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
});

function createScopedDailyReportClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

async function itemExists(
  supabase: SupabaseServerClient,
  params: { clinicId: string; itemId: string }
): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_report_items')
    .select('id')
    .eq('clinic_id', params.clinicId)
    .eq('id', params.itemId)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return Boolean(data);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; tagCode: string }> }
) {
  const { id, tagCode } = await context.params;

  try {
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return createErrorResponse('id はUUID形式で指定してください', 400);
    }

    const parsedQuery = tagDeleteQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
    });
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const clinicId = parsedQuery.data.clinic_id;
    const auth = await processApiRequest(request, {
      clinicId,
      requireClinicMatch: true,
      allowedRoles: Array.from(CLINIC_ADMIN_ROLES),
    });
    if (!auth.success) return auth.error;

    const supabase = createScopedDailyReportClient(auth.permissions, clinicId);
    if (
      !(await itemExists(supabase, {
        clinicId,
        itemId: parsedId.data,
      }))
    ) {
      return createErrorResponse('日報明細が見つかりません', 404);
    }

    const { error } = await supabase
      .from('daily_report_item_tags')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('daily_report_item_id', parsedId.data)
      .eq('tag_code', decodeURIComponent(tagCode));

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse({ deleted: true });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
