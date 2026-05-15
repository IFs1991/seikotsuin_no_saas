import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import {
  createScopedAdminContext,
  type SupabaseServerClient,
} from '@/lib/supabase';
import { STAFF_ROLES } from '@/lib/constants/roles';
import type { Database } from '@/types/supabase';

const PATH = '/api/daily-reports/items/[id]/tags';
const TAG_SELECT =
  'id, clinic_id, daily_report_item_id, tag_code, note, created_by, updated_by, created_at, updated_at';

type DailyReportItemTagRow =
  Database['public']['Tables']['daily_report_item_tags']['Row'];
type DailyReportItemTagInsert =
  Database['public']['Tables']['daily_report_item_tags']['Insert'];

const tagCreateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    tagCode: z.string().trim().min(1).max(80),
    note: z.string().max(1000).nullable().optional(),
  })
  .strict();

function createScopedDailyReportClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

function mapTag(row: DailyReportItemTagRow) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    dailyReportItemId: row.daily_report_item_id,
    tagCode: row.tag_code,
    note: row.note,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

async function tagDefinitionExists(
  supabase: SupabaseServerClient,
  tagCode: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_report_item_tag_definitions')
    .select('code')
    .eq('code', tagCode)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return Boolean(data);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return createErrorResponse('id はUUID形式で指定してください', 400);
    }

    const result = await processClinicScopedBody(request, tagCreateSchema, {
      allowedRoles: Array.from(STAFF_ROLES),
    });
    if (!result.success) return result.error;

    const dto = result.dto;
    const supabase = createScopedDailyReportClient(
      result.permissions,
      dto.clinic_id
    );

    if (
      !(await itemExists(supabase, {
        clinicId: dto.clinic_id,
        itemId: parsedId.data,
      }))
    ) {
      return createErrorResponse('日報明細が見つかりません', 404);
    }

    if (!(await tagDefinitionExists(supabase, dto.tagCode))) {
      return createErrorResponse('指定したタグが見つかりません', 400);
    }

    const payload: DailyReportItemTagInsert = {
      clinic_id: dto.clinic_id,
      daily_report_item_id: parsedId.data,
      tag_code: dto.tagCode,
      note: dto.note ?? null,
      created_by: result.auth.id,
      updated_by: result.auth.id,
    };

    const { data, error } = await supabase
      .from('daily_report_item_tags')
      .upsert(payload, { onConflict: 'daily_report_item_id,tag_code' })
      .select(TAG_SELECT)
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(mapTag(data), 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
