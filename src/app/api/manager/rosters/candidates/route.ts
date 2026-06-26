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
import { fetchAllRows } from '@/lib/manager-fetch';
import { createAdminClient } from '@/lib/supabase';
import type {
  ManagerRosterCandidate,
  ManagerRosterCandidatesResponse,
  ManagerRosterClinic,
} from '@/types/manager-rosters';

const PATH = '/api/manager/rosters/candidates';
const MANAGER_ROSTER_CANDIDATES_ALLOWED_ROLES = ['manager'] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type AdminClient = ReturnType<typeof createAdminClient>;
type ManagerAssignment = Awaited<
  ReturnType<typeof resolveManagerAssignedClinics>
>[number];

type StaffResourceRow = {
  id: string;
  name: string;
  clinic_id: string;
  is_active: boolean | null;
  is_deleted: boolean | null;
};

type ShiftRequestCandidateRow = {
  id: string;
  clinic_id: string;
  period_id: string;
  staff_id: string;
  request_type: string;
  start_time: string;
  end_time: string;
  priority: number;
  status: string;
  note: string | null;
};

type ExistingShiftRow = {
  staff_id: string;
  start_time: string;
  end_time: string;
  status: string;
};

const candidatesQuerySchema = z.object({
  clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
  date: z
    .string()
    .regex(DATE_PATTERN, 'date はYYYY-MM-DD形式で指定してください'),
  period_id: z
    .string()
    .uuid('period_id はUUID形式で指定してください')
    .optional(),
});

function toAssignedClinic(assignment: ManagerAssignment): ManagerRosterClinic {
  return {
    id: assignment.clinic_id,
    name: assignment.clinic_name ?? '',
  };
}

function toJstDayStartIso(date: string): string {
  return new Date(`${date}T00:00:00.000+09:00`).toISOString();
}

function toJstDayEndIso(date: string): string {
  return new Date(`${date}T23:59:59.999+09:00`).toISOString();
}

function hasTimeOverlap(
  left: Pick<ShiftRequestCandidateRow, 'start_time' | 'end_time'>,
  right: Pick<ExistingShiftRow, 'start_time' | 'end_time'>
): boolean {
  return (
    new Date(left.start_time).getTime() < new Date(right.end_time).getTime() &&
    new Date(left.end_time).getTime() > new Date(right.start_time).getTime()
  );
}

async function fetchStaffResources(
  adminClient: AdminClient,
  clinicId: string
): Promise<StaffResourceRow[]> {
  return await fetchAllRows<StaffResourceRow>((from, to) =>
    adminClient
      .from('resources')
      .select('id, name, clinic_id, is_active, is_deleted')
      .eq('clinic_id', clinicId)
      .eq('type', 'staff')
      .eq('is_deleted', false)
      .order('name', { ascending: true })
      .range(from, to)
      .returns<StaffResourceRow[]>()
  );
}

async function fetchShiftRequests(
  adminClient: AdminClient,
  clinicId: string,
  date: string,
  periodId: string | undefined
): Promise<ShiftRequestCandidateRow[]> {
  let query = adminClient
    .from('shift_requests')
    .select(
      'id, clinic_id, period_id, staff_id, request_type, start_time, end_time, priority, status, note'
    )
    .eq('clinic_id', clinicId)
    .in('status', ['submitted', 'approved'])
    .gte('start_time', toJstDayStartIso(date))
    .lte('start_time', toJstDayEndIso(date))
    .order('priority', { ascending: false });

  if (periodId) {
    query = query.eq('period_id', periodId);
  }

  return await fetchAllRows<ShiftRequestCandidateRow>((from, to) =>
    query.range(from, to).returns<ShiftRequestCandidateRow[]>()
  );
}

async function fetchExistingShifts(
  adminClient: AdminClient,
  staffIds: readonly string[],
  date: string
): Promise<ExistingShiftRow[]> {
  if (staffIds.length === 0) {
    return [];
  }

  return await fetchAllRows<ExistingShiftRow>((from, to) =>
    adminClient
      .from('staff_shifts')
      .select('staff_id, start_time, end_time, status')
      .in('staff_id', [...staffIds])
      .neq('status', 'cancelled')
      .lt('start_time', toJstDayEndIso(date))
      .gt('end_time', toJstDayStartIso(date))
      .order('start_time', { ascending: true })
      .range(from, to)
      .returns<ExistingShiftRow[]>()
  );
}

function isCandidateRequest(
  row: ShiftRequestCandidateRow
): row is ShiftRequestCandidateRow & {
  request_type: 'available' | 'preferred';
} {
  return row.request_type === 'available' || row.request_type === 'preferred';
}

function buildCandidates(
  staffRows: readonly StaffResourceRow[],
  requests: readonly ShiftRequestCandidateRow[],
  existingShifts: readonly ExistingShiftRow[],
  clinic: ManagerRosterClinic
): Pick<ManagerRosterCandidatesResponse, 'candidates' | 'blocked'> {
  const staffById = new Map(staffRows.map(staff => [staff.id, staff]));
  const blockingRequestsByStaff = new Map<string, ShiftRequestCandidateRow[]>();
  const shiftsByStaff = new Map<string, ExistingShiftRow[]>();

  for (const request of requests) {
    if (
      request.request_type === 'unavailable' ||
      request.request_type === 'day_off'
    ) {
      blockingRequestsByStaff.set(request.staff_id, [
        ...(blockingRequestsByStaff.get(request.staff_id) ?? []),
        request,
      ]);
    }
  }

  for (const shift of existingShifts) {
    shiftsByStaff.set(shift.staff_id, [
      ...(shiftsByStaff.get(shift.staff_id) ?? []),
      shift,
    ]);
  }

  const blocked: ManagerRosterCandidatesResponse['blocked'] = [];
  const candidates: ManagerRosterCandidate[] = [];

  for (const request of requests) {
    if (!isCandidateRequest(request)) {
      continue;
    }

    const staff = staffById.get(request.staff_id);
    if (!staff || staff.is_active === false) {
      continue;
    }

    const conflictMessages: string[] = [];
    if (
      (blockingRequestsByStaff.get(request.staff_id) ?? []).some(blocker =>
        hasTimeOverlap(request, blocker)
      )
    ) {
      conflictMessages.push('休み希望または勤務不可と重複しています');
    }
    if (
      (shiftsByStaff.get(request.staff_id) ?? []).some(shift =>
        hasTimeOverlap(request, shift)
      )
    ) {
      conflictMessages.push('既存の確定シフトと重複しています');
    }

    if (conflictMessages.length > 0) {
      blocked.push({
        staff_id: staff.id,
        staff_name: staff.name,
        reason: conflictMessages.join(' / '),
      });
      continue;
    }

    candidates.push({
      candidate_id: request.id,
      staff_id: staff.id,
      staff_name: staff.name,
      clinic_id: clinic.id,
      clinic_name: clinic.name,
      source_shift_request_id: request.id,
      request_type: request.request_type,
      priority: request.priority,
      start_time: request.start_time,
      end_time: request.end_time,
      note: request.note,
      conflict_messages: [],
    });
  }

  candidates.sort((a, b) => {
    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    const timeDiff =
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return a.staff_name.localeCompare(b.staff_name, 'ja');
  });

  return { candidates, blocked };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_ROSTER_CANDIDATES_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    if (normalizeRole(authResult.permissions.role) !== 'manager') {
      return createErrorResponse('アクセス権限がありません', 403);
    }

    const parsedQuery = candidatesQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      date: request.nextUrl.searchParams.get('date'),
      period_id: request.nextUrl.searchParams.get('period_id') ?? undefined,
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id: clinicId, date, period_id: periodId } = parsedQuery.data;
    const adminClient = createAdminClient();
    const assignments = await resolveManagerAssignedClinics(
      adminClient,
      authResult.auth.id
    );
    const clinic = assignments
      .map(toAssignedClinic)
      .find(item => item.id === clinicId);

    if (!clinic) {
      return createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      );
    }

    const staffRows = await fetchStaffResources(adminClient, clinicId);
    const shiftRequests = await fetchShiftRequests(
      adminClient,
      clinicId,
      date,
      periodId
    );
    const existingShifts = await fetchExistingShifts(
      adminClient,
      staffRows.map(staff => staff.id),
      date
    );
    const { candidates, blocked } = buildCandidates(
      staffRows,
      shiftRequests,
      existingShifts,
      clinic
    );

    return createSuccessResponse({
      generatedAt: new Date().toISOString(),
      clinic_id: clinicId,
      date,
      period_id: periodId ?? null,
      candidates,
      blocked,
    } satisfies ManagerRosterCandidatesResponse);
  } catch (error) {
    logError(error, {
      endpoint: PATH,
      method: 'GET',
      userId: 'unknown',
    });
    return createErrorResponse('ロスター候補の取得に失敗しました', 500);
  }
}
