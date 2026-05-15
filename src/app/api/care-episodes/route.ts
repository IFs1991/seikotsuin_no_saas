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
import type { CareEpisodeStatus } from '@/lib/care-episode';
import type { Database } from '@/types/supabase';

const PATH = '/api/care-episodes';
const CARE_EPISODE_SELECT =
  'id, clinic_id, customer_id, episode_name, primary_problem_text, started_on, ended_on, status, created_by, updated_by, created_at, updated_at';

type CareEpisodeRow = Database['public']['Tables']['care_episodes']['Row'];
type CareEpisodeInsert =
  Database['public']['Tables']['care_episodes']['Insert'];

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください');

const careEpisodeCreateSchema = z
  .object({
    clinic_id: z.string().uuid(),
    customerId: z.string().uuid(),
    episodeName: z.string().trim().min(1).max(255).nullable().optional(),
    primaryProblemText: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .nullable()
      .optional(),
    startedOn: isoDateSchema,
    endedOn: isoDateSchema.nullable().optional(),
    status: z
      .enum(['active', 'paused', 'completed', 'cancelled'])
      .default('active'),
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

async function ensureCustomerExists(
  supabase: SupabaseServerClient,
  params: {
    clinicId: string;
    customerId: string;
  }
): Promise<boolean> {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('clinic_id', params.clinicId)
    .eq('id', params.customerId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return Boolean(data);
}

export async function POST(request: NextRequest) {
  try {
    const result = await processClinicScopedBody(
      request,
      careEpisodeCreateSchema,
      { allowedRoles: Array.from(STAFF_ROLES) }
    );
    if (!result.success) return result.error;

    const dto = result.dto;
    const supabase = createScopedCareEpisodeClient(
      result.permissions,
      dto.clinic_id
    );

    const customerExists = await ensureCustomerExists(supabase, {
      clinicId: dto.clinic_id,
      customerId: dto.customerId,
    });
    if (!customerExists) {
      return createErrorResponse('顧客が見つかりません', 404);
    }

    const insertPayload: CareEpisodeInsert = {
      clinic_id: dto.clinic_id,
      customer_id: dto.customerId,
      episode_name: dto.episodeName ?? null,
      primary_problem_text: dto.primaryProblemText ?? null,
      started_on: dto.startedOn,
      ended_on: dto.endedOn ?? null,
      status: dto.status ?? 'active',
      created_by: result.auth.id,
      updated_by: result.auth.id,
    };

    const { data, error } = await supabase
      .from('care_episodes')
      .insert(insertPayload)
      .select(CARE_EPISODE_SELECT)
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(mapCareEpisode(data), 201);
  } catch (error) {
    return handleRouteError(error, PATH);
  }
}
