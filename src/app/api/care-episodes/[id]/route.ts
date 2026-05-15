import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import { normalizeSupabaseError } from '@/lib/error-handler';
import { handleRouteError, processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';
import { STAFF_ROLES } from '@/lib/constants/roles';
import type { CareEpisodeStatus } from '@/lib/care-episode';
import type { Database } from '@/types/supabase';

const PATH = '/api/care-episodes/[id]';
const CARE_EPISODE_SELECT =
  'id, clinic_id, customer_id, episode_name, primary_problem_text, started_on, ended_on, status, created_by, updated_by, created_at, updated_at';

type CareEpisodeRow = Database['public']['Tables']['care_episodes']['Row'];
type CareEpisodeUpdate =
  Database['public']['Tables']['care_episodes']['Update'];

type RouteContext = {
  params: Promise<{ id: string }>;
};

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください');

const careEpisodeUpdateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    episodeName: z.string().trim().min(1).max(255).nullable().optional(),
    primaryProblemText: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .nullable()
      .optional(),
    startedOn: isoDateSchema.optional(),
    endedOn: isoDateSchema.nullable().optional(),
    status: z.enum(['active', 'paused', 'completed', 'cancelled']).optional(),
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

function mapCareEpisode(row: CareEpisodeRow) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    customerId: row.customer_id,
    episodeName: row.episode_name,
    primaryProblemText: row.primary_problem_text,
    startedOn: row.started_on,
    endedOn: row.ended_on,
    status: row.status as CareEpisodeStatus,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildUpdatePayload(
  dto: z.infer<typeof careEpisodeUpdateSchema>,
  userId: string
): CareEpisodeUpdate {
  const payload: CareEpisodeUpdate = {
    updated_by: userId,
  };

  if (dto.episodeName !== undefined) {
    payload.episode_name = dto.episodeName;
  }
  if (dto.primaryProblemText !== undefined) {
    payload.primary_problem_text = dto.primaryProblemText;
  }
  if (dto.startedOn !== undefined) {
    payload.started_on = dto.startedOn;
  }
  if (dto.endedOn !== undefined) {
    payload.ended_on = dto.endedOn;
  }
  if (dto.status !== undefined) {
    payload.status = dto.status;
  }

  return payload;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const parsedId = z.string().uuid().safeParse(params.id);
    if (!parsedId.success) {
      return createErrorResponse('id はUUID形式で指定してください', 400);
    }

    const result = await processClinicScopedBody(
      request,
      careEpisodeUpdateSchema,
      { allowedRoles: Array.from(STAFF_ROLES) }
    );
    if (!result.success) return result.error;

    const dto = result.dto;
    const supabase = createScopedCareEpisodeClient(
      result.permissions,
      dto.clinic_id
    );
    const updatePayload = buildUpdatePayload(dto, result.auth.id);

    const { data, error } = await supabase
      .from('care_episodes')
      .update(updatePayload)
      .eq('clinic_id', dto.clinic_id)
      .eq('id', parsedId.data)
      .select(CARE_EPISODE_SELECT)
      .single();

    if (error?.code === 'PGRST116') {
      return createErrorResponse('care episodeが見つかりません', 404);
    }
    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(mapCareEpisode(data));
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
