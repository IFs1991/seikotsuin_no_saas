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

const PATH = '/api/daily-reports/items/[id]/care-episode';
const ITEM_SELECT =
  'id, clinic_id, customer_id, care_episode_id, visit_ordinal_in_episode, visit_stage_code';
const EPISODE_SELECT = 'id, clinic_id, customer_id';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type DailyReportItemRow = Pick<
  Database['public']['Tables']['daily_report_items']['Row'],
  | 'id'
  | 'clinic_id'
  | 'customer_id'
  | 'care_episode_id'
  | 'visit_ordinal_in_episode'
  | 'visit_stage_code'
>;
type DailyReportItemUpdate =
  Database['public']['Tables']['daily_report_items']['Update'];
type CareEpisodeRef = Pick<
  Database['public']['Tables']['care_episodes']['Row'],
  'id' | 'clinic_id' | 'customer_id'
>;

const attachCareEpisodeSchema = z
  .object({
    clinic_id: z.string().uuid(),
    careEpisodeId: z.string().uuid().nullable(),
  })
  .strict();

function createScopedCareEpisodeClient(
  permissions: Parameters<typeof createScopedAdminContext>[0],
  clinicId: string
) {
  const scopedAdmin = createScopedAdminContext(permissions);
  scopedAdmin.assertClinicInScope(clinicId);
  return scopedAdmin.client;
}

function mapItemCareEpisode(row: DailyReportItemRow) {
  return {
    dailyReportItemId: row.id,
    clinicId: row.clinic_id,
    customerId: row.customer_id,
    careEpisodeId: row.care_episode_id,
    visitOrdinalInEpisode: row.visit_ordinal_in_episode,
    visitStageCode: row.visit_stage_code,
  };
}

async function fetchItem(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    itemId: string;
  }
): Promise<DailyReportItemRow | null> {
  const { data, error } = await supabase
    .from('daily_report_items')
    .select(ITEM_SELECT)
    .eq('clinic_id', params.clinicId)
    .eq('id', params.itemId)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return data;
}

async function fetchEpisode(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    careEpisodeId: string;
  }
): Promise<CareEpisodeRef | null> {
  const { data, error } = await supabase
    .from('care_episodes')
    .select(EPISODE_SELECT)
    .eq('clinic_id', params.clinicId)
    .eq('id', params.careEpisodeId)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return data;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const parsedId = z.string().uuid().safeParse(params.id);
    if (!parsedId.success) {
      return createErrorResponse('id はUUID形式で指定してください', 400);
    }

    const result = await processClinicScopedBody(
      request,
      attachCareEpisodeSchema,
      { allowedRoles: Array.from(STAFF_ROLES) }
    );
    if (!result.success) return result.error;

    const dto = result.dto;
    const supabase = createScopedCareEpisodeClient(
      result.permissions,
      dto.clinic_id
    );

    const item = await fetchItem(supabase, {
      clinicId: dto.clinic_id,
      itemId: parsedId.data,
    });
    if (!item) {
      return createErrorResponse('日報明細が見つかりません', 404);
    }

    if (dto.careEpisodeId) {
      const episode = await fetchEpisode(supabase, {
        clinicId: dto.clinic_id,
        careEpisodeId: dto.careEpisodeId,
      });
      if (!episode) {
        return createErrorResponse('care episodeが見つかりません', 404);
      }
      if (item.customer_id && episode.customer_id !== item.customer_id) {
        return createErrorResponse(
          'care episodeの顧客が日報明細と一致しません',
          400
        );
      }
    }

    const updatePayload: DailyReportItemUpdate = {
      care_episode_id: dto.careEpisodeId,
      visit_ordinal_in_episode: null,
      visit_stage_code: null,
      updated_by: result.auth.id,
    };

    const { data, error } = await supabase
      .from('daily_report_items')
      .update(updatePayload)
      .eq('clinic_id', dto.clinic_id)
      .eq('id', parsedId.data)
      .select(ITEM_SELECT)
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(mapItemCareEpisode(data));
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
