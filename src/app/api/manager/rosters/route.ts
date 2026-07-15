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
import { fetchAllRows } from '@/lib/manager-fetch';
import { createAdminClient } from '@/lib/supabase';
import type {
  ManagerRosterAssignmentType,
  ManagerRosterClinic,
  ManagerRosterDay,
  ManagerRosterShift,
  ManagerRosterShiftStatus,
  ManagerRosterTimePreset,
  ManagerRostersResponse,
} from '@/types/manager-rosters';

const PATH = '/api/manager/rosters';
const MANAGER_ROSTERS_ALLOWED_ROLES = ['manager'] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ROSTER_MAX_DAYS = 93;

type AdminClient = ReturnType<typeof createAdminClient>;

type ManagerAssignment = Awaited<
  ReturnType<typeof resolveManagerAssignedClinicsWithinScope>
>[number];

type RosterResource = {
  id: string;
  name: string;
  clinic_id: string;
  type: string;
} | null;

type RosterClinic = {
  id: string;
  name: string;
} | null;

type StaffShiftRosterRow = {
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
  resources: RosterResource | RosterResource[] | null;
  clinics: RosterClinic | RosterClinic[] | null;
};

const rosterQuerySchema = z
  .object({
    clinic_id: z.string().uuid('clinic_id はUUID形式で指定してください'),
    start: z
      .string()
      .regex(DATE_PATTERN, 'start はYYYY-MM-DD形式で指定してください'),
    end: z
      .string()
      .regex(DATE_PATTERN, 'end はYYYY-MM-DD形式で指定してください'),
  })
  .refine(data => toUtcDayStartMs(data.start) <= toUtcDayStartMs(data.end), {
    message: 'end は start 以降の日付を指定してください',
    path: ['end'],
  })
  .refine(data => countInclusiveDays(data.start, data.end) <= ROSTER_MAX_DAYS, {
    message: `期間は${ROSTER_MAX_DAYS}日以内で指定してください`,
    path: ['end'],
  });

function toAssignedClinic(assignment: ManagerAssignment): ManagerRosterClinic {
  return {
    id: assignment.clinic_id,
    name: assignment.clinic_name ?? '',
  };
}

function toUtcDayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function countInclusiveDays(start: string, end: string): number {
  const diff = toUtcDayStartMs(end) - toUtcDayStartMs(start);
  return Math.floor(diff / 86_400_000) + 1;
}

function toJstDayStartIso(date: string): string {
  return new Date(`${date}T00:00:00.000+09:00`).toISOString();
}

function toJstDayEndIso(date: string): string {
  return new Date(`${date}T23:59:59.999+09:00`).toISOString();
}

function toJstDateKey(value: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(value));
}

function normalizeResource(
  resource: StaffShiftRosterRow['resources']
): RosterResource {
  if (Array.isArray(resource)) {
    return resource[0] ?? null;
  }
  return resource ?? null;
}

function normalizeClinic(clinic: StaffShiftRosterRow['clinics']): RosterClinic {
  if (Array.isArray(clinic)) {
    return clinic[0] ?? null;
  }
  return clinic ?? null;
}

function normalizeStatus(status: string): ManagerRosterShiftStatus {
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

function buildDays(start: string, end: string): ManagerRosterDay[] {
  const days: ManagerRosterDay[] = [];
  for (
    let cursor = toUtcDayStartMs(start), last = toUtcDayStartMs(end);
    cursor <= last;
    cursor += 86_400_000
  ) {
    days.push({
      date: new Date(cursor).toISOString().slice(0, 10),
      shifts: [],
    });
  }
  return days;
}

async function fetchRosterRows(
  adminClient: AdminClient,
  clinicId: string,
  start: string,
  end: string
): Promise<StaffShiftRosterRow[]> {
  return await fetchAllRows<StaffShiftRosterRow>((from, to) =>
    adminClient
      .from('staff_shifts')
      .select(
        `
        id,
        clinic_id,
        staff_id,
        staff_profile_id,
        home_clinic_id,
        assignment_type,
        time_preset,
        start_time,
        end_time,
        status,
        notes,
        resources!staff_shifts_staff_id_fkey(id, name, clinic_id, type),
        clinics!staff_shifts_clinic_id_fkey(id, name)
      `
      )
      .eq('clinic_id', clinicId)
      .eq('status', 'confirmed')
      .gte('start_time', toJstDayStartIso(start))
      .lte('start_time', toJstDayEndIso(end))
      .order('start_time', { ascending: true })
      .range(from, to)
      .returns<StaffShiftRosterRow[]>()
  );
}

function toRosterShift(
  row: StaffShiftRosterRow,
  requestedClinic: ManagerRosterClinic,
  clinicById: ReadonlyMap<string, ManagerRosterClinic>
): ManagerRosterShift {
  const staffResource = normalizeResource(row.resources);
  const workClinic = normalizeClinic(row.clinics);
  const homeClinicId = row.home_clinic_id ?? staffResource?.clinic_id ?? null;
  const workClinicName = workClinic?.name ?? requestedClinic.name;
  const homeClinicName = homeClinicId
    ? (clinicById.get(homeClinicId)?.name ?? workClinicName)
    : null;

  return {
    shift_id: row.id,
    staff_id: row.staff_id,
    staff_profile_id: row.staff_profile_id ?? null,
    staff_name: staffResource?.name ?? row.staff_id,
    home_clinic_id: homeClinicId,
    home_clinic_name: homeClinicName,
    work_clinic_id: row.clinic_id,
    work_clinic_name: workClinicName,
    assignment_type:
      row.assignment_type === 'help'
        ? 'help'
        : ('regular' satisfies ManagerRosterAssignmentType),
    time_preset:
      row.time_preset === 'full_day' ||
      row.time_preset === 'morning' ||
      row.time_preset === 'afternoon' ||
      row.time_preset === 'late' ||
      row.time_preset === 'custom'
        ? row.time_preset
        : (null satisfies ManagerRosterTimePreset | null),
    start_time: row.start_time,
    end_time: row.end_time,
    status: normalizeStatus(row.status),
    notes: row.notes,
  };
}

function buildRosterDays(
  rows: readonly StaffShiftRosterRow[],
  start: string,
  end: string,
  requestedClinic: ManagerRosterClinic,
  clinics: readonly ManagerRosterClinic[]
): ManagerRosterDay[] {
  const days = buildDays(start, end);
  const dayByDate = new Map(days.map(day => [day.date, day]));
  const clinicById = new Map(clinics.map(clinic => [clinic.id, clinic]));

  for (const row of rows) {
    const day = dayByDate.get(toJstDateKey(row.start_time));
    if (!day) {
      continue;
    }
    day.shifts.push(toRosterShift(row, requestedClinic, clinicById));
  }

  for (const day of days) {
    day.shifts.sort((a, b) => {
      const timeDiff =
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return a.staff_name.localeCompare(b.staff_name, 'ja');
    });
  }

  return days;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(MANAGER_ROSTERS_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    if (normalizeRole(authResult.permissions.role) !== 'manager') {
      return createErrorResponse('アクセス権限がありません', 403);
    }

    const parsedQuery = rosterQuerySchema.safeParse({
      clinic_id: request.nextUrl.searchParams.get('clinic_id'),
      start: request.nextUrl.searchParams.get('start'),
      end: request.nextUrl.searchParams.get('end'),
    });

    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const { clinic_id: clinicId, start, end } = parsedQuery.data;
    const adminClient = createAdminClient();
    const assignments = await resolveManagerAssignedClinicsWithinScope(
      adminClient,
      authResult.auth.id,
      authResult.permissions.clinic_scope_ids ?? []
    );
    const clinics = assignments.map(toAssignedClinic);
    const requestedClinic = clinics.find(clinic => clinic.id === clinicId);

    if (!requestedClinic) {
      return createErrorResponse(
        'このクリニックへのアクセス権がありません',
        403
      );
    }

    const rows = await fetchRosterRows(adminClient, clinicId, start, end);
    const days = buildRosterDays(rows, start, end, requestedClinic, clinics);

    return createSuccessResponse({
      generatedAt: new Date().toISOString(),
      clinic_id: clinicId,
      start,
      end,
      clinics,
      days,
      totalShifts: rows.length,
    } satisfies ManagerRostersResponse);
  } catch (error) {
    logError(error, {
      endpoint: PATH,
      method: 'GET',
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
    return createErrorResponse('ロスターの取得に失敗しました', 500);
  }
}
