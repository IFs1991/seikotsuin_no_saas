import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { resolveManagerAssignedClinics } from '@/lib/auth/manager-scope';
import { normalizeRole } from '@/lib/constants/roles';
import { createAdminClient } from '@/lib/supabase';
import type { Database } from '@/types/supabase';
import type {
  ManagerRosterAssignResponse,
  ManagerRosterShift,
  ManagerRosterTimePreset,
} from '@/types/manager-rosters';

const PATH = '/api/manager/rosters/assign';
const MANAGER_ROSTER_ASSIGN_ALLOWED_ROLES = ['manager'] as const;

type AdminClient = ReturnType<typeof createAdminClient>;
type StaffShiftInsert = Database['public']['Tables']['staff_shifts']['Insert'];

type StaffResourceRow = {
  id: string;
  name: string;
  clinic_id: string;
  type: string;
  is_deleted: boolean | null;
};

type ShiftRequestRow = {
  id: string;
  clinic_id: string;
  staff_id: string;
  request_type: string;
  status: string;
};

type ExistingShiftRow = {
  id: string;
};

type InsertedShiftRow = {
  id: string;
  clinic_id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
};

const assignSchema = z
  .object({
    clinic_id: z.string().uuid(),
    staff_id: z.string().uuid(),
    source_shift_request_id: z.string().uuid().nullable().optional(),
    time_preset: z.enum(['full_day', 'morning', 'afternoon', 'late', 'custom']),
    start_time: z.string().datetime(),
    end_time: z.string().datetime(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine(
    data =>
      new Date(data.end_time).getTime() > new Date(data.start_time).getTime(),
    {
      message: '終了時刻は開始時刻より後にしてください',
      path: ['end_time'],
    }
  );

function normalizeStatus(status: string): ManagerRosterShift['status'] {
  if (
    status === 'draft' ||
    status === 'proposed' ||
    status === 'confirmed' ||
    status === 'cancelled'
  ) {
    return status;
  }
  return 'confirmed';
}

async function loadStaffResource(
  adminClient: AdminClient,
  clinicId: string,
  staffId: string
): Promise<StaffResourceRow | null> {
  const { data, error } = await adminClient
    .from('resources')
    .select('id, name, clinic_id, type, is_deleted')
    .eq('id', staffId)
    .eq('clinic_id', clinicId)
    .eq('type', 'staff')
    .eq('is_deleted', false)
    .maybeSingle<StaffResourceRow>();

  if (error) {
    throw error;
  }
  return data ?? null;
}

async function loadSourceRequest(
  adminClient: AdminClient,
  clinicId: string,
  staffId: string,
  requestId: string
): Promise<ShiftRequestRow | null> {
  const { data, error } = await adminClient
    .from('shift_requests')
    .select('id, clinic_id, staff_id, request_type, status')
    .eq('id', requestId)
    .eq('clinic_id', clinicId)
    .eq('staff_id', staffId)
    .maybeSingle<ShiftRequestRow>();

  if (error) {
    throw error;
  }
  return data ?? null;
}

async function hasOverlappingShift(
  adminClient: AdminClient,
  staffId: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('staff_shifts')
    .select('id')
    .eq('staff_id', staffId)
    .neq('status', 'cancelled')
    .lt('start_time', endTime)
    .gt('end_time', startTime)
    .limit(1)
    .returns<ExistingShiftRow[]>();

  if (error) {
    throw error;
  }
  return (data ?? []).length > 0;
}

function isAssignableRequest(request: ShiftRequestRow): boolean {
  return (
    (request.request_type === 'available' ||
      request.request_type === 'preferred') &&
    (request.status === 'submitted' || request.status === 'approved')
  );
}

function toRosterShift(
  row: InsertedShiftRow,
  staff: StaffResourceRow,
  clinicName: string,
  timePreset: ManagerRosterTimePreset
): ManagerRosterShift {
  return {
    shift_id: row.id,
    staff_id: row.staff_id,
    staff_profile_id: null,
    staff_name: staff.name,
    home_clinic_id: staff.clinic_id,
    home_clinic_name: clinicName,
    work_clinic_id: row.clinic_id,
    work_clinic_name: clinicName,
    assignment_type: 'regular',
    time_preset: timePreset,
    start_time: row.start_time,
    end_time: row.end_time,
    status: normalizeStatus(row.status),
    notes: row.notes,
  };
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_ROSTER_ASSIGN_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    if (normalizeRole(authResult.permissions.role) !== 'manager') {
      return createErrorResponse('アクセス権限がありません', 403);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const parsedBody = assignSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = parsedBody.data;
    const adminClient = createAdminClient();
    const assignments = await resolveManagerAssignedClinics(
      adminClient,
      authResult.auth.id
    );
    const clinic = assignments.find(
      assignment => assignment.clinic_id === dto.clinic_id
    );

    if (!clinic) {
      return createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      );
    }

    const staff = await loadStaffResource(
      adminClient,
      dto.clinic_id,
      dto.staff_id
    );
    if (!staff) {
      return createErrorResponse('同一院のスタッフを指定してください', 400);
    }

    if (dto.source_shift_request_id) {
      const sourceRequest = await loadSourceRequest(
        adminClient,
        dto.clinic_id,
        dto.staff_id,
        dto.source_shift_request_id
      );
      if (!sourceRequest || !isAssignableRequest(sourceRequest)) {
        return createErrorResponse(
          '配置できる希望シフトを指定してください',
          400
        );
      }
    }

    if (
      await hasOverlappingShift(
        adminClient,
        dto.staff_id,
        dto.start_time,
        dto.end_time
      )
    ) {
      return createErrorResponse(
        '同じスタッフのシフト時間が重複しています',
        409
      );
    }

    const insertPayload: StaffShiftInsert = {
      clinic_id: dto.clinic_id,
      staff_id: dto.staff_id,
      start_time: dto.start_time,
      end_time: dto.end_time,
      status: 'confirmed',
      notes: dto.notes ?? null,
      created_by: authResult.auth.id,
    };

    const { data, error } = await adminClient
      .from('staff_shifts')
      .insert(insertPayload)
      .select('id, clinic_id, staff_id, start_time, end_time, status, notes')
      .single<InsertedShiftRow>();

    if (error) {
      throw error;
    }

    const shift = toRosterShift(
      data,
      staff,
      clinic.clinic_name ?? '',
      dto.time_preset
    );

    return createSuccessResponse(
      { shift } satisfies ManagerRosterAssignResponse,
      201
    );
  } catch (error) {
    logError(error, {
      endpoint: PATH,
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('ロスター配置の作成に失敗しました', 500);
  }
}
