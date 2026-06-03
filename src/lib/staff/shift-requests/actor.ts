import {
  AppError,
  ERROR_CODES,
  normalizeSupabaseError,
} from '@/lib/error-handler';
import {
  canAccessClinicScope,
  type SupabaseServerClient,
  type UserPermissions,
} from '@/lib/supabase';
import {
  isShiftRequestSelfSubmitRole,
  loadStaffResourceForShiftRequest,
  normalizeShiftRequestRole,
} from './access';
import type { ShiftRequestSubmittedForRole } from './types';

interface ActorPermissionRow {
  staff_id: string | null;
  role: string;
  clinic_id: string | null;
}

export interface ResolveActorStaffResourceIdInput {
  adminClient: SupabaseServerClient;
  actorUserId: string;
  permissions: UserPermissions;
  clinicId: string;
  requestedStaffId?: string;
  path: string;
}

export interface ResolvedActorStaffResource {
  staffResourceId: string;
  submittedForRole: ShiftRequestSubmittedForRole;
}

function assertSubmittedForSelfRole(
  role: string
): asserts role is ShiftRequestSubmittedForRole {
  if (role !== 'therapist' && role !== 'staff') {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      '本人提出できるロールではありません',
      403
    );
  }
}

export async function resolveActorStaffResourceId({
  adminClient,
  actorUserId,
  permissions,
  clinicId,
  requestedStaffId,
  path,
}: ResolveActorStaffResourceIdInput): Promise<ResolvedActorStaffResource> {
  const actorRole = normalizeShiftRequestRole(permissions.role);
  if (!isShiftRequestSelfSubmitRole(actorRole)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      '本人提出できるロールではありません',
      403
    );
  }

  const { data, error } = await adminClient
    .from('user_permissions')
    .select('staff_id, role, clinic_id')
    .eq('staff_id', actorUserId)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, path);
  }

  if (!data) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'スタッフ権限が見つかりません',
      403
    );
  }

  const actorPermission: ActorPermissionRow = data;
  const permissionRole = normalizeShiftRequestRole(actorPermission.role);
  if (!permissionRole || !isShiftRequestSelfSubmitRole(permissionRole)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'スタッフ権限が本人提出ロールではありません',
      403
    );
  }

  if (!actorPermission.staff_id) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'スタッフ権限に staff_id が紐づいていません',
      403
    );
  }

  if (
    actorPermission.clinic_id !== clinicId &&
    !canAccessClinicScope(permissions, clinicId)
  ) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'このクリニックへの本人提出はできません',
      403
    );
  }

  if (requestedStaffId && requestedStaffId !== actorPermission.staff_id) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      '他スタッフの希望シフトは提出できません',
      403
    );
  }

  await loadStaffResourceForShiftRequest(
    adminClient,
    clinicId,
    actorPermission.staff_id,
    path
  );

  assertSubmittedForSelfRole(permissionRole);

  return {
    staffResourceId: actorPermission.staff_id,
    submittedForRole: permissionRole,
  };
}
