import { normalizeRole } from '@/lib/constants/roles';
import {
  canAccessClinicScope,
  resolveScopedClinicIds,
  type UserPermissions,
} from '@/lib/supabase';

export const ADMIN_USERS_ACCESS_MESSAGES = {
  clinicScopeMissing: 'クリニックスコープが設定されていません',
  clinicAccessForbidden: '対象クリニックへのアクセス権がありません',
  roleForbiddenForClinicAdmin: 'このロールは店舗管理者では付与できません',
  permissionForbiddenForClinicAdmin: 'この権限は店舗管理者では変更できません',
} as const;

export const getAdminUsersActorRole = (permissions: UserPermissions) =>
  normalizeRole(permissions.role);

export const isHqAdminActor = (permissions: UserPermissions) =>
  getAdminUsersActorRole(permissions) === 'admin';

export const isClinicAdminActor = (permissions: UserPermissions) =>
  getAdminUsersActorRole(permissions) === 'clinic_admin';

export const isAdminUsersActor = (permissions: UserPermissions) =>
  isHqAdminActor(permissions) || isClinicAdminActor(permissions);

export const getClinicAdminScopedClinicIds = (permissions: UserPermissions) =>
  isClinicAdminActor(permissions) ? resolveScopedClinicIds(permissions) : null;

export const canClinicAdminAccessClinic = (
  permissions: UserPermissions,
  clinicId: string | null | undefined
) => Boolean(clinicId && canAccessClinicScope(permissions, clinicId));
