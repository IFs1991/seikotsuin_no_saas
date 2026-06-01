import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';
import type { Database } from '@/types/supabase';
import {
  AppError,
  createApiError,
  ERROR_CODES,
  normalizeSupabaseError,
  logError,
} from '@/lib/error-handler';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import {
  STAFF_ROLES,
  canAccessCrossClinicWithCompat,
  isAreaManagerRole,
  type Role,
} from '@/lib/constants/roles';

const PATH = '/api/staff/shifts';
const SHIFT_OPERATION_MANAGER_ROLES = [
  'admin',
  'clinic_admin',
  'manager',
] as const satisfies readonly Role[];
type StaffShiftRow = Database['public']['Tables']['staff_shifts']['Row'];
type StaffShiftInsert = Database['public']['Tables']['staff_shifts']['Insert'];
type StaffShiftUpdate = Database['public']['Tables']['staff_shifts']['Update'];
type ResourceSummary = Pick<
  Database['public']['Tables']['resources']['Row'],
  'id' | 'name' | 'type'
>;
type StaffShiftWithResource = StaffShiftRow & {
  resources: ResourceSummary | ResourceSummary[] | null;
};
type OverlapCandidate = Pick<
  StaffShiftRow,
  'staff_id' | 'start_time' | 'end_time'
>;
type ShiftStatus = 'draft' | 'proposed' | 'confirmed' | 'cancelled';

interface ShiftItemDTO {
  staff_id: string;
  start_time: string;
  end_time: string;
  status: ShiftStatus;
  notes?: string;
}

interface ShiftInsertDTO extends ShiftItemDTO {
  clinic_id: string;
}

interface BulkShiftInsertDTO {
  clinic_id: string;
  shifts: ShiftItemDTO[];
}

interface ParsedShiftItemDTO {
  staff_id?: string;
  start_time?: string;
  end_time?: string;
  status?: ShiftStatus;
  notes?: string;
}

interface ParsedShiftInsertDTO extends ParsedShiftItemDTO {
  clinic_id?: string;
}

interface ParsedBulkShiftInsertDTO {
  clinic_id?: string;
  shifts?: ParsedShiftItemDTO[];
}

function requireParsedString(value: string | undefined, fieldName: string) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} is missing after validation`);
  }
  return value;
}

function toShiftItemDTO(data: ParsedShiftItemDTO): ShiftItemDTO {
  return {
    staff_id: requireParsedString(data.staff_id, 'staff_id'),
    start_time: requireParsedString(data.start_time, 'start_time'),
    end_time: requireParsedString(data.end_time, 'end_time'),
    status: data.status ?? 'draft',
    notes: data.notes,
  };
}

function toShiftInsertDTO(data: ParsedShiftInsertDTO): ShiftInsertDTO {
  return {
    ...toShiftItemDTO(data),
    clinic_id: requireParsedString(data.clinic_id, 'clinic_id'),
  };
}

function toBulkShiftInsertDTO(
  data: ParsedBulkShiftInsertDTO
): BulkShiftInsertDTO {
  return {
    clinic_id: requireParsedString(data.clinic_id, 'clinic_id'),
    shifts: (data.shifts ?? []).map(toShiftItemDTO),
  };
}

function normalizeResource(
  resource: StaffShiftWithResource['resources']
): ResourceSummary | null {
  if (Array.isArray(resource)) {
    return resource[0] ?? null;
  }
  return resource ?? null;
}

function resolveShiftDataClinicId(
  permissions: { role: string; clinic_id: string | null },
  requestedClinicId: string
) {
  if (
    canAccessCrossClinicWithCompat(permissions.role) ||
    isAreaManagerRole(permissions.role)
  ) {
    return requestedClinicId;
  }

  return permissions.clinic_id;
}

// クエリパラメータのスキーマ
const shiftsQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id は有効なUUIDである必要があります'),
  start: z.string().optional(),
  end: z.string().optional(),
  status: z.enum(['draft', 'proposed', 'confirmed', 'cancelled']).optional(),
});

const toJstDayStartIso = (date: string) =>
  new Date(`${date}T00:00:00.000+09:00`).toISOString();

const toJstDayEndIso = (date: string) =>
  new Date(`${date}T23:59:59.999+09:00`).toISOString();

const shiftStatusSchema = z
  .enum(['draft', 'proposed', 'confirmed', 'cancelled'])
  .default('draft');

const shiftTimeRangeRefinement = {
  message: '終了時刻は開始時刻より後にしてください',
  path: ['end_time'],
};

const shiftItemBaseSchema = z.object({
  staff_id: z.string().uuid(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  status: shiftStatusSchema,
  notes: z.string().optional(),
});

const hasValidShiftTimeRange = (data: {
  start_time: string;
  end_time: string;
}) => new Date(data.end_time).getTime() > new Date(data.start_time).getTime();

const shiftItemSchema = shiftItemBaseSchema.refine(
  hasValidShiftTimeRange,
  shiftTimeRangeRefinement
);

const shiftInsertSchema = shiftItemBaseSchema
  .extend({
    clinic_id: z.string().uuid(),
  })
  .refine(hasValidShiftTimeRange, shiftTimeRangeRefinement);

const bulkShiftInsertSchema = z.object({
  clinic_id: z.string().uuid(),
  shifts: z
    .array(shiftItemSchema)
    .min(1, '一括作成するシフトを指定してください')
    .max(370, '一括作成は370件までです'),
});

const shiftCancelSchema = z.object({
  clinic_id: z.string().uuid(),
  id: z.string().uuid(),
  status: z.literal('cancelled'),
});

function hasTimeOverlap(
  left: Pick<OverlapCandidate, 'start_time' | 'end_time'>,
  right: Pick<OverlapCandidate, 'start_time' | 'end_time'>
) {
  return (
    new Date(left.start_time).getTime() < new Date(right.end_time).getTime() &&
    new Date(left.end_time).getTime() > new Date(right.start_time).getTime()
  );
}

function hasInternalOverlappingShift(shifts: readonly ShiftInsertDTO[]) {
  for (let i = 0; i < shifts.length; i += 1) {
    for (let j = i + 1; j < shifts.length; j += 1) {
      if (
        shifts[i].staff_id === shifts[j].staff_id &&
        hasTimeOverlap(shifts[i], shifts[j])
      ) {
        return true;
      }
    }
  }

  return false;
}

async function hasOverlappingShift(
  supabase: Awaited<ReturnType<typeof ensureClinicAccess>>['supabase'],
  dto: ShiftInsertDTO
) {
  const { data, error } = await supabase
    .from('staff_shifts')
    .select('id')
    .eq('clinic_id', dto.clinic_id)
    .eq('staff_id', dto.staff_id)
    .neq('status', 'cancelled')
    .lt('start_time', dto.end_time)
    .gt('end_time', dto.start_time)
    .limit(1);

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return (data ?? []).length > 0;
}

async function hasOverlappingBulkShift(
  supabase: Awaited<ReturnType<typeof ensureClinicAccess>>['supabase'],
  clinicId: string,
  shifts: readonly ShiftInsertDTO[]
) {
  const staffIds = Array.from(new Set(shifts.map(shift => shift.staff_id)));
  const earliestStartTime = shifts.reduce((earliest, shift) =>
    new Date(shift.start_time).getTime() <
    new Date(earliest.start_time).getTime()
      ? shift
      : earliest
  ).start_time;
  const latestEndTime = shifts.reduce((latest, shift) =>
    new Date(shift.end_time).getTime() > new Date(latest.end_time).getTime()
      ? shift
      : latest
  ).end_time;

  const { data, error } = await supabase
    .from('staff_shifts')
    .select('staff_id, start_time, end_time')
    .eq('clinic_id', clinicId)
    .in('staff_id', staffIds)
    .neq('status', 'cancelled')
    .lt('start_time', latestEndTime)
    .gt('end_time', earliestStartTime)
    .returns<OverlapCandidate[]>();

  if (error) {
    throw normalizeSupabaseError(error, PATH);
  }

  return (data ?? []).some(existing =>
    shifts.some(
      shift =>
        shift.staff_id === existing.staff_id && hasTimeOverlap(existing, shift)
    )
  );
}

function buildShiftInsertPayload(
  dto: ShiftInsertDTO,
  userId: string
): StaffShiftInsert {
  return {
    clinic_id: dto.clinic_id,
    staff_id: dto.staff_id,
    start_time: dto.start_time,
    end_time: dto.end_time,
    status: dto.status,
    notes: dto.notes,
    created_by: userId,
  };
}

function buildBulkShiftInsertPayload(
  clinicId: string,
  dto: BulkShiftInsertDTO['shifts'][number],
  userId: string
): StaffShiftInsert {
  return {
    clinic_id: clinicId,
    staff_id: dto.staff_id,
    start_time: dto.start_time,
    end_time: dto.end_time,
    status: dto.status,
    notes: dto.notes,
    created_by: userId,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const parsedQuery = shiftsQuerySchema.safeParse({
      clinic_id: searchParams.get('clinic_id'),
      start: searchParams.get('start'),
      end: searchParams.get('end'),
      status: searchParams.get('status') ?? undefined,
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id: queryClinicId, start, end, status } = parsedQuery.data;

    // Q3決定: 一般スタッフも閲覧可能（自院限定）
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const { supabase, permissions } = await ensureClinicAccess(
      request,
      PATH,
      queryClinicId,
      {
        allowedRoles: Array.from(STAFF_ROLES),
        requireClinicMatch: true,
      }
    );

    // DOD-09: テナント境界の明示 - Manager は検証済み requested clinic、その他は permissions.clinic_id に限定
    // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
    const clinic_id = resolveShiftDataClinicId(permissions, queryClinicId);

    if (!clinic_id) {
      return createErrorResponse('クリニックが割り当てられていません', 403);
    }

    // シフトデータを取得（resources テーブルと結合してスタッフ名を取得）
    let query = supabase
      .from('staff_shifts')
      .select(
        `
        id,
        clinic_id,
        staff_id,
        start_time,
        end_time,
        status,
        notes,
        created_at,
        updated_at,
        resources!staff_shifts_staff_id_fkey(id, name, type)
      `
      )
      .eq('clinic_id', clinic_id)
      .order('start_time', { ascending: true });

    // 日付範囲でフィルタリング
    if (start) {
      query = query.gte('start_time', toJstDayStartIso(start));
    }
    if (end) {
      query = query.lte('start_time', toJstDayEndIso(end));
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data: shifts, error: shiftsError } = await query;

    if (shiftsError) {
      throw normalizeSupabaseError(shiftsError, PATH);
    }

    // レスポンス形式に変換

    const formattedShifts = ((shifts ?? []) as StaffShiftWithResource[]).map(
      shift => {
        // Supabaseのリレーションは配列または単一オブジェクトで返される
        const resource = normalizeResource(shift.resources);

        return {
          id: shift.id,
          clinic_id: shift.clinic_id,
          staff_id: shift.staff_id,
          start_time: shift.start_time,
          end_time: shift.end_time,
          status: shift.status,
          notes: shift.notes,
          created_at: shift.created_at,
          updated_at: shift.updated_at,
          staff: resource
            ? {
                id: resource.id,
                name: resource.name,
                type: resource.type,
              }
            : null,
        };
      }
    );

    return createSuccessResponse({
      shifts: formattedShifts,
      total: formattedShifts.length,
    });
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = error;
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'シフトデータの取得に失敗しました',
        undefined,
        PATH
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path: PATH,
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

// POST: シフトの作成
export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const parsedBulkBody = bulkShiftInsertSchema.safeParse(rawBody);
    if (parsedBulkBody.success) {
      const dto = toBulkShiftInsertDTO(parsedBulkBody.data);
      const shifts = dto.shifts.map(shift => ({
        ...shift,
        clinic_id: dto.clinic_id,
      }));

      const { supabase, user } = await ensureClinicAccess(
        request,
        PATH,
        dto.clinic_id,
        {
          allowedRoles: Array.from(SHIFT_OPERATION_MANAGER_ROLES),
          requireClinicMatch: true,
        }
      );

      if (hasInternalOverlappingShift(shifts)) {
        return createErrorResponse(
          '同じスタッフの一括シフト内で時間が重複しています',
          400
        );
      }

      if (await hasOverlappingBulkShift(supabase, dto.clinic_id, shifts)) {
        return createErrorResponse(
          '同じスタッフのシフト時間が重複しています',
          400
        );
      }

      const payload: StaffShiftInsert[] = dto.shifts.map(shift =>
        buildBulkShiftInsertPayload(dto.clinic_id, shift, user.id)
      );

      const { data, error } = await supabase
        .from('staff_shifts')
        .insert(payload)
        .select('id, clinic_id, staff_id, start_time, end_time, status, notes');

      if (error) {
        throw normalizeSupabaseError(error, PATH);
      }

      return createSuccessResponse(
        {
          shifts: data ?? [],
          total: data?.length ?? 0,
        },
        201
      );
    }

    const parsedBody = shiftInsertSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = toShiftInsertDTO(parsedBody.data);

    const { supabase, user } = await ensureClinicAccess(
      request,
      PATH,
      dto.clinic_id,
      {
        allowedRoles: Array.from(SHIFT_OPERATION_MANAGER_ROLES),
        requireClinicMatch: true,
      }
    );

    if (await hasOverlappingShift(supabase, dto)) {
      return createErrorResponse(
        '同じスタッフのシフト時間が重複しています',
        400
      );
    }

    const payload = buildShiftInsertPayload(dto, user.id);

    const { data, error } = await supabase
      .from('staff_shifts')
      .insert(payload)
      .select('id, clinic_id, staff_id, start_time, end_time, status, notes')
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(data, 201);
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, PATH);
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'シフトの作成に失敗しました',
        undefined,
        PATH
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path: PATH,
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}

// PATCH: シフトの取消
export async function PATCH(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const parsedBody = shiftCancelSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = parsedBody.data;
    const { supabase } = await ensureClinicAccess(
      request,
      PATH,
      dto.clinic_id,
      {
        allowedRoles: Array.from(SHIFT_OPERATION_MANAGER_ROLES),
        requireClinicMatch: true,
      }
    );

    const payload: StaffShiftUpdate = {
      status: 'cancelled',
    };

    const { data, error } = await supabase
      .from('staff_shifts')
      .update(payload)
      .eq('id', dto.id)
      .eq('clinic_id', dto.clinic_id)
      .select('id, clinic_id, staff_id, start_time, end_time, status, notes')
      .single();

    if (error) {
      throw normalizeSupabaseError(error, PATH);
    }

    return createSuccessResponse(data);
  } catch (error) {
    let apiError;
    let statusCode = 500;

    if (error instanceof AppError) {
      apiError = error.toApiError(PATH);
      statusCode = error.statusCode;
    } else if (error && typeof error === 'object' && 'code' in error) {
      apiError = normalizeSupabaseError(error, PATH);
    } else {
      apiError = createApiError(
        ERROR_CODES.INTERNAL_SERVER_ERROR,
        'シフトの取消に失敗しました',
        undefined,
        PATH
      );
    }

    logError(error instanceof Error ? error : new Error(String(error)), {
      path: PATH,
    });

    return createErrorResponse(apiError.message, statusCode, apiError);
  }
}
