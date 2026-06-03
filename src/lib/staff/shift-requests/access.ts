import {
  AppError,
  ERROR_CODES,
  normalizeSupabaseError,
} from '@/lib/error-handler';
import {
  canAccessClinicScope,
  createAdminClient,
  type SupabaseServerClient,
  type UserPermissions,
} from '@/lib/supabase';
import { normalizeRole } from '@/lib/constants/roles';
import type {
  ShiftRequestAuditLogInput,
  ShiftRequestAuditLogInsert,
  ShiftRequestSubmittedForRole,
} from './types';

export const SHIFT_REQUEST_MANAGER_ROLES = [
  'admin',
  'manager',
  'clinic_admin',
] as const;

export const SHIFT_REQUEST_CONVERSION_ROLES = ['admin', 'manager'] as const;
export const SHIFT_REQUEST_SELF_SUBMIT_ROLES = ['therapist', 'staff'] as const;

type ShiftRequestManagerRole = (typeof SHIFT_REQUEST_MANAGER_ROLES)[number];
type ShiftRequestConversionRole =
  (typeof SHIFT_REQUEST_CONVERSION_ROLES)[number];
type ShiftRequestSelfSubmitRole =
  (typeof SHIFT_REQUEST_SELF_SUBMIT_ROLES)[number];

interface ResourceIdentityRow {
  id: string;
  clinic_id: string;
  type: string;
  is_deleted: boolean | null;
}

interface PermissionRoleRow {
  staff_id: string | null;
  role: string;
  clinic_id: string | null;
}

export function normalizeShiftRequestRole(
  role: string | null | undefined
): string | null {
  return normalizeRole(role);
}

export function isShiftRequestManagerRole(
  role: string | null | undefined
): role is ShiftRequestManagerRole {
  const normalizedRole = normalizeShiftRequestRole(role);
  return SHIFT_REQUEST_MANAGER_ROLES.some(value => value === normalizedRole);
}

export function isShiftRequestConversionRole(
  role: string | null | undefined
): role is ShiftRequestConversionRole {
  const normalizedRole = normalizeShiftRequestRole(role);
  return SHIFT_REQUEST_CONVERSION_ROLES.some(value => value === normalizedRole);
}

export function isShiftRequestSelfSubmitRole(
  role: string | null | undefined
): role is ShiftRequestSelfSubmitRole {
  const normalizedRole = normalizeShiftRequestRole(role);
  return SHIFT_REQUEST_SELF_SUBMIT_ROLES.some(
    value => value === normalizedRole
  );
}

export function assertShiftRequestClinicAccess(
  permissions: UserPermissions,
  clinicId: string
) {
  if (!canAccessClinicScope(permissions, clinicId)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'このクリニックへのアクセス権がありません',
      403
    );
  }
}

export function assertShiftRequestManagerRole(permissions: UserPermissions) {
  if (!isShiftRequestManagerRole(permissions.role)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      '希望シフトを管理する権限がありません',
      403
    );
  }
}

export function assertShiftRequestConversionRole(permissions: UserPermissions) {
  if (!isShiftRequestConversionRole(permissions.role)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      '確定シフトへ変換する権限がありません',
      403
    );
  }
}

export async function loadStaffResourceForShiftRequest(
  adminClient: SupabaseServerClient,
  clinicId: string,
  staffId: string,
  path: string
): Promise<ResourceIdentityRow> {
  const { data, error } = await adminClient
    .from('resources')
    .select('id, clinic_id, type, is_deleted')
    .eq('id', staffId)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, path);
  }

  if (!data) {
    throw new AppError(
      ERROR_CODES.RESOURCE_CONFLICT,
      'スタッフリソースが見つかりません',
      409
    );
  }

  const resource: ResourceIdentityRow = data;
  if (resource.clinic_id !== clinicId) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'スタッフリソースが対象クリニックに所属していません',
      403
    );
  }

  if (resource.type !== 'staff') {
    throw new AppError(
      ERROR_CODES.RESOURCE_CONFLICT,
      'スタッフリソースの種別が不正です',
      409
    );
  }

  if (resource.is_deleted === true) {
    throw new AppError(
      ERROR_CODES.RESOURCE_CONFLICT,
      '削除済みスタッフリソースは指定できません',
      409
    );
  }

  return resource;
}

function toSubmittedForRole(role: string): ShiftRequestSubmittedForRole {
  const normalizedRole = normalizeShiftRequestRole(role);
  if (
    normalizedRole === 'clinic_admin' ||
    normalizedRole === 'therapist' ||
    normalizedRole === 'staff'
  ) {
    return normalizedRole;
  }

  throw new AppError(
    ERROR_CODES.RESOURCE_CONFLICT,
    '対象スタッフのロールを希望シフト対象として解決できません',
    409
  );
}

export async function resolveSubmittedForRole(
  adminClient: SupabaseServerClient,
  staffId: string,
  path: string
): Promise<ShiftRequestSubmittedForRole> {
  const { data, error } = await adminClient
    .from('user_permissions')
    .select('staff_id, role, clinic_id')
    .eq('staff_id', staffId)
    .maybeSingle();

  if (error) {
    throw normalizeSupabaseError(error, path);
  }

  if (!data) {
    throw new AppError(
      ERROR_CODES.RESOURCE_CONFLICT,
      '対象スタッフの権限ロールを解決できません',
      409
    );
  }

  const permission: PermissionRoleRow = data;
  return toSubmittedForRole(permission.role);
}

export function createShiftRequestAdminClient(): SupabaseServerClient {
  return createAdminClient();
}

export async function insertShiftRequestAuditLog(
  input: ShiftRequestAuditLogInput,
  path: string,
  client?: SupabaseServerClient
) {
  const adminClient = client ?? createShiftRequestAdminClient();
  const payload: ShiftRequestAuditLogInsert = {
    clinic_id: input.clinicId,
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole,
    action: input.action,
  };

  if (input.periodId !== undefined) payload.period_id = input.periodId;
  if (input.requestId !== undefined) payload.request_id = input.requestId;
  if (input.beforeData !== undefined) payload.before_data = input.beforeData;
  if (input.afterData !== undefined) payload.after_data = input.afterData;

  const { error } = await adminClient
    .from('shift_request_audit_logs')
    .insert(payload);

  if (error) {
    throw normalizeSupabaseError(error, path);
  }
}
