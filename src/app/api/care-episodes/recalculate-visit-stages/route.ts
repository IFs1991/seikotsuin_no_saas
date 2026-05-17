import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createSuccessResponse } from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { STAFF_ROLES } from '@/lib/constants/roles';
import { getVisitStageCodeForOrdinal } from '@/lib/care-episode';
import type { Database } from '@/types/supabase';

const PATH = '/api/care-episodes/recalculate-visit-stages';

type CareEpisodeRef = Pick<
  Database['public']['Tables']['care_episodes']['Row'],
  'id' | 'clinic_id' | 'customer_id'
>;
type DailyReportItemStageRow = Pick<
  Database['public']['Tables']['daily_report_items']['Row'],
  'id' | 'care_episode_id' | 'report_date' | 'created_at'
>;
type DailyReportItemUpdate =
  Database['public']['Tables']['daily_report_items']['Update'];

const recalculateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    careEpisodeId: z.string().uuid().optional(),
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

function compareDailyReportItems(
  left: DailyReportItemStageRow,
  right: DailyReportItemStageRow
): number {
  return (
    left.report_date.localeCompare(right.report_date) ||
    left.created_at.localeCompare(right.created_at) ||
    left.id.localeCompare(right.id)
  );
}

function groupItemsByEpisode(items: DailyReportItemStageRow[]) {
  const grouped = new Map<string, DailyReportItemStageRow[]>();

  for (const item of items) {
    if (!item.care_episode_id) {
      continue;
    }
    const existing = grouped.get(item.care_episode_id) ?? [];
    existing.push(item);
    grouped.set(item.care_episode_id, existing);
  }

  for (const episodeItems of grouped.values()) {
    episodeItems.sort(compareDailyReportItems);
  }

  return grouped;
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(request, recalculateSchema, {
      allowedRoles: Array.from(STAFF_ROLES),
    });
    if (!result.success) return result.error;

    const dto = result.dto;
    const supabase = createScopedCareEpisodeClient(
      result.permissions,
      dto.clinic_id
    );

    let episodesQuery = supabase
      .from('care_episodes')
      .select('id, clinic_id, customer_id')
      .eq('clinic_id', dto.clinic_id);

    if (dto.careEpisodeId) {
      episodesQuery = episodesQuery.eq('id', dto.careEpisodeId);
    }

    const { data: episodes, error: episodesError } = await episodesQuery;
    if (episodesError) {
      throw normalizeSupabaseError(episodesError, PATH);
    }

    const episodeRows: CareEpisodeRef[] = episodes ?? [];
    const episodeIds = episodeRows.map(episode => episode.id);
    if (episodeIds.length === 0) {
      return createSuccessResponse({
        episodeCount: 0,
        updatedItemCount: 0,
      });
    }

    const { data: items, error: itemsError } = await supabase
      .from('daily_report_items')
      .select('id, care_episode_id, report_date, created_at')
      .eq('clinic_id', dto.clinic_id)
      .in('care_episode_id', episodeIds)
      .order('care_episode_id', { ascending: true })
      .order('report_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (itemsError) {
      throw normalizeSupabaseError(itemsError, PATH);
    }

    let updatedItemCount = 0;
    const groupedItems = groupItemsByEpisode(items ?? []);

    for (const episodeId of episodeIds) {
      const episodeItems = groupedItems.get(episodeId) ?? [];
      for (const [index, item] of episodeItems.entries()) {
        const ordinal = index + 1;
        const updatePayload: DailyReportItemUpdate = {
          visit_ordinal_in_episode: ordinal,
          visit_stage_code: getVisitStageCodeForOrdinal(ordinal),
          updated_by: result.auth.id,
        };

        const { error: updateError } = await supabase
          .from('daily_report_items')
          .update(updatePayload)
          .eq('clinic_id', dto.clinic_id)
          .eq('id', item.id);

        if (updateError) {
          throw normalizeSupabaseError(updateError, PATH);
        }

        updatedItemCount += 1;
      }
    }

    return createSuccessResponse({
      episodeCount: episodeIds.length,
      updatedItemCount,
    });
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
