import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  logError,
  processApiRequest,
} from '@/lib/api-helpers';
import { resolveManagerAssignedClinicsWithinScope } from '@/lib/auth/manager-scope';
import { normalizeRole } from '@/lib/constants/roles';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
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

type StaffProfileRow = {
  id: string;
  display_name: string;
  is_active: boolean | null;
};

type StaffMembershipRow = {
  id: string;
  staff_profile_id: string;
  clinic_id: string;
  resource_id: string | null;
  membership_type: string;
  can_help: boolean;
  priority: number;
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

type BlockingShiftRequestRow = {
  id: string;
  start_time: string;
  end_time: string;
};

type InsertedShiftRow = {
  id: string;
  clinic_id: string;
  staff_id: string;
  staff_profile_id: string | null;
  home_clinic_id: string | null;
  assignment_type: string | null;
  time_preset: string | null;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
};

type StaffShiftInsertWithRosterFields = StaffShiftInsert & {
  staff_profile_id?: string | null;
  home_clinic_id?: string | null;
  assignment_type?: 'regular' | 'help';
  time_preset?: ManagerRosterTimePreset;
  source_shift_request_id?: string | null;
};

const assignSchema = z
  .object({
    clinic_id: z.string().uuid(),
    staff_id: z.string().uuid(),
    staff_profile_id: z.string().uuid().nullable().optional(),
    home_clinic_id: z.string().uuid().nullable().optional(),
    assignment_type: z.enum(['regular', 'help']).default('regular'),
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
  staffId: string,
  requestId: string
): Promise<ShiftRequestRow | null> {
  const { data, error } = await adminClient
    .from('shift_requests')
    .select('id, clinic_id, staff_id, request_type, status')
    .eq('id', requestId)
    .eq('staff_id', staffId)
    .maybeSingle<ShiftRequestRow>();

  if (error) {
    throw error;
  }
  return data ?? null;
}

async function loadStaffProfile(
  adminClient: AdminClient,
  staffProfileId: string
): Promise<StaffProfileRow | null> {
  const { data, error } = await adminClient
    .from('staff_profiles')
    .select('id, display_name, is_active')
    .eq('id', staffProfileId)
    .maybeSingle<StaffProfileRow>();

  if (error) {
    throw error;
  }
  return data ?? null;
}

async function loadStaffMemberships(
  adminClient: AdminClient,
  staffProfileId: string
): Promise<StaffMembershipRow[]> {
  const { data, error } = await adminClient
    .from('staff_clinic_memberships')
    .select(
      'id, staff_profile_id, clinic_id, resource_id, membership_type, can_help, priority'
    )
    .eq('staff_profile_id', staffProfileId)
    .returns<StaffMembershipRow[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
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

async function hasBlockingShiftRequest(
  adminClient: AdminClient,
  staffId: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('shift_requests')
    .select('id, start_time, end_time')
    .eq('staff_id', staffId)
    .in('status', ['submitted', 'approved'])
    .in('request_type', ['unavailable', 'day_off'])
    .lt('start_time', endTime)
    .gt('end_time', startTime)
    .limit(1)
    .returns<BlockingShiftRequestRow[]>();

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
  staff: Pick<StaffResourceRow, 'id' | 'name' | 'clinic_id'>,
  clinicName: string,
  timePreset: ManagerRosterTimePreset,
  assignmentType: 'regular' | 'help'
): ManagerRosterShift {
  return {
    shift_id: row.id,
    staff_id: row.staff_id,
    staff_profile_id: row.staff_profile_id ?? null,
    staff_name: staff.name,
    home_clinic_id: row.home_clinic_id ?? staff.clinic_id,
    home_clinic_name:
      row.home_clinic_id && row.home_clinic_id !== row.clinic_id
        ? null
        : clinicName,
    work_clinic_id: row.clinic_id,
    work_clinic_name: clinicName,
    assignment_type: assignmentType,
    time_preset: timePreset,
    start_time: row.start_time,
    end_time: row.end_time,
    status: normalizeStatus(row.status),
    notes: row.notes,
  };
}

function resolveMembershipAssignment(input: {
  memberships: readonly StaffMembershipRow[];
  clinicId: string;
  staffId: string;
  homeClinicId: string | null | undefined;
  assignmentType: 'regular' | 'help';
}): { homeClinicId: string; staffId: string } | Response {
  const staffMembership = input.memberships.find(
    membership => membership.resource_id === input.staffId
  );
  const targetMembership = input.memberships.find(
    membership => membership.clinic_id === input.clinicId
  );
  const homeMembership =
    (input.homeClinicId
      ? input.memberships.find(
          membership => membership.clinic_id === input.homeClinicId
        )
      : undefined) ??
    input.memberships.find(membership => membership.membership_type === 'home');

  if (!staffMembership || !homeMembership || !targetMembership) {
    return createErrorResponse('スタッフ所属情報を確認できません', 400);
  }

  if (targetMembership.membership_type === 'blocked') {
    return createErrorResponse('配置不可のスタッフです', 400);
  }

  const inferredAssignmentType =
    homeMembership.clinic_id === input.clinicId ? 'regular' : 'help';
  if (inferredAssignmentType !== input.assignmentType) {
    return createErrorResponse('所属院と稼働院の指定が一致しません', 400);
  }

  if (
    input.assignmentType === 'help' &&
    (!targetMembership.can_help ||
      targetMembership.membership_type === 'blocked' ||
      homeMembership.clinic_id === input.clinicId)
  ) {
    return createErrorResponse('ヘルプ可能なスタッフを指定してください', 400);
  }

  return {
    homeClinicId: homeMembership.clinic_id,
    staffId: input.staffId,
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
    const assignments = await resolveManagerAssignedClinicsWithinScope(
      adminClient,
      authResult.auth.id,
      authResult.permissions.clinic_scope_ids ?? []
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

    let staff: Pick<StaffResourceRow, 'id' | 'name' | 'clinic_id'> | null =
      null;
    let homeClinicId: string | null = null;
    const staffProfileId: string | null = dto.staff_profile_id ?? null;

    if (staffProfileId) {
      const [profile, memberships] = await Promise.all([
        loadStaffProfile(adminClient, staffProfileId),
        loadStaffMemberships(adminClient, staffProfileId),
      ]);

      if (!profile || profile.is_active === false) {
        return createErrorResponse('有効なスタッフを指定してください', 400);
      }

      const assignment = resolveMembershipAssignment({
        memberships,
        clinicId: dto.clinic_id,
        staffId: dto.staff_id,
        homeClinicId: dto.home_clinic_id,
        assignmentType: dto.assignment_type,
      });
      if (assignment instanceof Response) {
        return assignment;
      }

      staff = {
        id: assignment.staffId,
        name: profile.display_name,
        clinic_id: assignment.homeClinicId,
      };
      homeClinicId = assignment.homeClinicId;
    } else {
      const staffResource = await loadStaffResource(
        adminClient,
        dto.clinic_id,
        dto.staff_id
      );
      if (!staffResource) {
        return createErrorResponse('同一院のスタッフを指定してください', 400);
      }
      staff = staffResource;
      homeClinicId = staffResource.clinic_id;
    }

    if (dto.source_shift_request_id) {
      const sourceRequest = await loadSourceRequest(
        adminClient,
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

    if (
      await hasBlockingShiftRequest(
        adminClient,
        dto.staff_id,
        dto.start_time,
        dto.end_time
      )
    ) {
      return createErrorResponse('休み希望または勤務不可と重複しています', 409);
    }

    const insertPayload: StaffShiftInsertWithRosterFields = {
      clinic_id: dto.clinic_id,
      staff_id: dto.staff_id,
      staff_profile_id: staffProfileId,
      home_clinic_id: homeClinicId,
      assignment_type: dto.assignment_type,
      time_preset: dto.time_preset,
      source_shift_request_id: dto.source_shift_request_id ?? null,
      start_time: dto.start_time,
      end_time: dto.end_time,
      status: 'confirmed',
      notes: dto.notes ?? null,
      created_by: authResult.auth.id,
    };

    const { data, error } = await adminClient
      .from('staff_shifts')
      .insert(insertPayload)
      .select(
        'id, clinic_id, staff_id, staff_profile_id, home_clinic_id, assignment_type, time_preset, start_time, end_time, status, notes'
      )
      .single<InsertedShiftRow>();

    if (error) {
      throw error;
    }

    const shift = toRosterShift(
      data,
      staff,
      clinic.clinic_name ?? '',
      dto.time_preset,
      dto.assignment_type
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
    if (
      error instanceof AppError &&
      error.code === ERROR_CODES.MANAGER_SCOPE_AUTHORITY_UNAVAILABLE &&
      error.statusCode === 503
    ) {
      return createErrorResponse(
        '認証情報を確認できません。時間をおいて再度お試しください',
        503
      );
    }
    return createErrorResponse('ロスター配置の作成に失敗しました', 500);
  }
}
