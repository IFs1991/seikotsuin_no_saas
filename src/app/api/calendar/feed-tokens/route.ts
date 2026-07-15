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
import {
  createCalendarFeedToken,
  hashCalendarFeedToken,
  type CalendarFeedTokenRow,
} from '@/lib/calendar-feed';
import { createAdminClient } from '@/lib/supabase';

const PATH = '/api/calendar/feed-tokens';
const TOKEN_ALLOWED_ROLES = [
  'admin',
  'manager',
  'clinic_admin',
  'therapist',
  'staff',
] as const;
const CLINIC_FEED_MANAGER_ROLES = new Set(['admin', 'clinic_admin', 'manager']);

type AdminClient = ReturnType<typeof createAdminClient>;

type CalendarFeedTokenInsert = {
  clinic_id: string | null;
  staff_profile_id: string | null;
  feed_type: 'staff' | 'clinic';
  token_hash: string;
  label: string | null;
  created_by: string;
};

type StaffProfileOwnerRow = {
  id: string;
  user_id: string | null;
  is_active: boolean | null;
};

type StaffMembershipScopeRow = {
  staff_profile_id: string;
  clinic_id: string;
  membership_type: string;
};

const createTokenSchema = z.object({
  feed_type: z.enum(['staff', 'clinic']),
  clinic_id: z.string().uuid().nullable().optional(),
  staff_profile_id: z.string().uuid().nullable().optional(),
  label: z.string().max(120).nullable().optional(),
});

const revokeTokenSchema = z.object({
  token_id: z.string().uuid(),
});

async function getManagerClinicIds(
  adminClient: AdminClient,
  userId: string,
  canonicalClinicIds: readonly string[]
): Promise<Set<string>> {
  const assignments = await resolveManagerAssignedClinicsWithinScope(
    adminClient,
    userId,
    canonicalClinicIds
  );
  return new Set(assignments.map(assignment => assignment.clinic_id));
}

async function canManageClinicFeed(input: {
  adminClient: AdminClient;
  userId: string;
  role: string | null;
  canonicalClinicIds: readonly string[];
  clinicId: string;
}): Promise<boolean> {
  if (!input.canonicalClinicIds.includes(input.clinicId)) {
    return false;
  }

  if (!input.role || !CLINIC_FEED_MANAGER_ROLES.has(input.role)) {
    return false;
  }

  if (input.role === 'manager') {
    return (
      await getManagerClinicIds(
        input.adminClient,
        input.userId,
        input.canonicalClinicIds
      )
    ).has(input.clinicId);
  }

  return input.role === 'admin' || input.role === 'clinic_admin';
}

async function loadStaffProfile(
  adminClient: AdminClient,
  staffProfileId: string
): Promise<StaffProfileOwnerRow | null> {
  const { data, error } = await adminClient
    .from('staff_profiles')
    .select('id, user_id, is_active')
    .eq('id', staffProfileId)
    .maybeSingle<StaffProfileOwnerRow>();

  if (error) {
    throw error;
  }
  return data ?? null;
}

async function loadStaffMemberships(
  adminClient: AdminClient,
  staffProfileId: string
): Promise<StaffMembershipScopeRow[]> {
  const { data, error } = await adminClient
    .from('staff_clinic_memberships')
    .select('staff_profile_id, clinic_id, membership_type')
    .eq('staff_profile_id', staffProfileId)
    .neq('membership_type', 'blocked')
    .returns<StaffMembershipScopeRow[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
}

async function canManageStaffFeed(input: {
  adminClient: AdminClient;
  userId: string;
  role: string | null;
  canonicalClinicIds: readonly string[];
  staffProfileId: string;
  clinicId: string;
}): Promise<boolean> {
  if (!input.canonicalClinicIds.includes(input.clinicId)) {
    return false;
  }

  const profile = await loadStaffProfile(
    input.adminClient,
    input.staffProfileId
  );
  if (!profile || profile.is_active !== true) {
    return false;
  }

  const memberships = await loadStaffMemberships(
    input.adminClient,
    input.staffProfileId
  );
  const hasClinicMembership = memberships.some(
    membership => membership.clinic_id === input.clinicId
  );
  if (!hasClinicMembership) {
    return false;
  }

  if (profile.user_id === input.userId) {
    return true;
  }

  if (input.role === 'admin') {
    return true;
  }

  if (input.role !== 'manager') {
    return false;
  }

  const clinicIds = await getManagerClinicIds(
    input.adminClient,
    input.userId,
    input.canonicalClinicIds
  );
  return clinicIds.has(input.clinicId);
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(TOKEN_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse('無効なJSONデータです', 400);
    }

    const parsedBody = createTokenSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedBody.error.flatten()
      );
    }

    const dto = parsedBody.data;
    const role = normalizeRole(authResult.permissions.role);
    const targetClinicId = dto.clinic_id ?? null;
    const targetStaffProfileId = dto.staff_profile_id ?? null;
    const canonicalClinicIds = authResult.permissions.clinic_scope_ids ?? [];

    if (dto.feed_type === 'clinic') {
      if (!targetClinicId || targetStaffProfileId) {
        return createErrorResponse('院用feedの対象指定が不正です', 400);
      }
      if (!canonicalClinicIds.includes(targetClinicId)) {
        return createErrorResponse(
          'このクリニックへのアクセス権がありません',
          403
        );
      }
      if (!role || !CLINIC_FEED_MANAGER_ROLES.has(role)) {
        return createErrorResponse(
          'このクリニックへのアクセス権がありません',
          403
        );
      }
    } else {
      if (!targetStaffProfileId || !targetClinicId) {
        return createErrorResponse('スタッフ用feedの対象指定が不正です', 400);
      }
      if (!canonicalClinicIds.includes(targetClinicId)) {
        return createErrorResponse(
          'このスタッフへのアクセス権がありません',
          403
        );
      }
    }

    // Scope is fixed from the authenticated DB authority before any
    // service-role read or write is allowed.
    const adminClient = createAdminClient();

    if (dto.feed_type === 'clinic') {
      const allowed = await canManageClinicFeed({
        adminClient,
        userId: authResult.auth.id,
        role,
        canonicalClinicIds,
        clinicId: targetClinicId,
      });
      if (!allowed) {
        return createErrorResponse(
          'このクリニックへのアクセス権がありません',
          403
        );
      }
    } else {
      const allowed = await canManageStaffFeed({
        adminClient,
        userId: authResult.auth.id,
        role,
        canonicalClinicIds,
        staffProfileId: targetStaffProfileId,
        clinicId: targetClinicId,
      });
      if (!allowed) {
        return createErrorResponse(
          'このスタッフへのアクセス権がありません',
          403
        );
      }
    }

    const token = createCalendarFeedToken();
    const insertPayload: CalendarFeedTokenInsert = {
      clinic_id: targetClinicId,
      staff_profile_id: dto.feed_type === 'staff' ? targetStaffProfileId : null,
      feed_type: dto.feed_type,
      token_hash: hashCalendarFeedToken(token),
      label: dto.label ?? null,
      created_by: authResult.auth.id,
    };

    const { data, error } = await adminClient
      .from('calendar_feed_tokens')
      .insert(insertPayload)
      .select(
        'id, clinic_id, staff_profile_id, feed_type, token_hash, label, is_active, created_by, created_at, revoked_at'
      )
      .single<CalendarFeedTokenRow>();

    if (error) {
      throw error;
    }

    return createSuccessResponse(
      {
        token_id: data.id,
        token,
        feed_type: data.feed_type,
        clinic_id: data.clinic_id,
        staff_profile_id: data.staff_profile_id,
      },
      201
    );
  } catch (error) {
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

    logError(error, {
      endpoint: PATH,
      method: 'POST',
      userId: 'unknown',
    });
    return createErrorResponse('ICS feed tokenの発行に失敗しました', 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await processApiRequest(request, {
      allowedRoles: Array.from(TOKEN_ALLOWED_ROLES),
      requireClinicMatch: false,
    });

    if (!authResult.success) {
      return authResult.error;
    }

    const parsedQuery = revokeTokenSchema.safeParse({
      token_id: request.nextUrl.searchParams.get('token_id'),
    });
    if (!parsedQuery.success) {
      return createErrorResponse(
        '入力値にエラーがあります',
        400,
        parsedQuery.error.flatten()
      );
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('calendar_feed_tokens')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', parsedQuery.data.token_id)
      .eq('created_by', authResult.auth.id);

    if (error) {
      throw error;
    }

    return createSuccessResponse({ revoked: true });
  } catch (error) {
    logError(error, {
      endpoint: PATH,
      method: 'DELETE',
      userId: 'unknown',
    });
    return createErrorResponse('ICS feed tokenの失効に失敗しました', 500);
  }
}
