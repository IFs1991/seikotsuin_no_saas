import { normalizeRole, type AdminUserRole } from '@/lib/constants/roles';
import {
  canAreaManagerManagePermissionRole,
  canClinicAdminManagePermissionRole,
} from '@/lib/admin/users';
import {
  canAccessClinicScope,
  resolveScopedClinicIds,
  type UserPermissions,
} from '@/lib/supabase';

export const ADMIN_USERS_API_ROLES = [
  'admin',
  'clinic_admin',
  'manager',
] as const satisfies readonly AdminUserRole[];

export const ADMIN_USERS_ACCESS_MESSAGES = {
  clinicScopeMissing: 'クリニックスコープが設定されていません',
  clinicAccessForbidden: '対象クリニックへのアクセス権がありません',
  roleForbiddenForClinicAdmin: 'このロールは店舗管理者では付与できません',
  permissionForbiddenForClinicAdmin: 'この権限は店舗管理者では変更できません',
  roleForbiddenForAreaManager:
    'このロールはエリアマネージャーでは付与できません',
  permissionForbiddenForAreaManager:
    'この権限はエリアマネージャーでは変更できません',
} as const;

export const getAdminUsersActorRole = (permissions: UserPermissions) =>
  normalizeRole(permissions.role);

export const isHqAdminActor = (permissions: UserPermissions) =>
  getAdminUsersActorRole(permissions) === 'admin';

export const isClinicAdminActor = (permissions: UserPermissions) =>
  getAdminUsersActorRole(permissions) === 'clinic_admin';

export const isAreaManagerActor = (permissions: UserPermissions) =>
  getAdminUsersActorRole(permissions) === 'manager';

export const isAdminUsersActor = (permissions: UserPermissions) =>
  isHqAdminActor(permissions) ||
  isAreaManagerActor(permissions) ||
  isClinicAdminActor(permissions);

export const isScopedAdminUsersActor = (permissions: UserPermissions) =>
  isAreaManagerActor(permissions) || isClinicAdminActor(permissions);

export const getClinicAdminScopedClinicIds = (permissions: UserPermissions) =>
  isClinicAdminActor(permissions) ? resolveScopedClinicIds(permissions) : null;

export const getAreaManagerScopedClinicIds = (permissions: UserPermissions) =>
  isAreaManagerActor(permissions) ? resolveScopedClinicIds(permissions) : null;

export const getScopedAdminUsersClinicIds = (permissions: UserPermissions) =>
  isScopedAdminUsersActor(permissions)
    ? resolveScopedClinicIds(permissions)
    : null;

export const canClinicAdminAccessClinic = (
  permissions: UserPermissions,
  clinicId: string | null | undefined
) => Boolean(clinicId && canAccessClinicScope(permissions, clinicId));

export const canAreaManagerAccessClinic = (
  permissions: UserPermissions,
  clinicId: string | null | undefined
) => Boolean(clinicId && canAccessClinicScope(permissions, clinicId));

export const canScopedAdminUsersAccessClinic = (
  permissions: UserPermissions,
  clinicId: string | null | undefined
) => Boolean(clinicId && canAccessClinicScope(permissions, clinicId));

export const canAdminUsersActorManagePermissionRole = (
  permissions: UserPermissions,
  role: string | null | undefined
) => {
  if (isHqAdminActor(permissions)) {
    return true;
  }

  if (isAreaManagerActor(permissions)) {
    return canAreaManagerManagePermissionRole(role);
  }

  if (isClinicAdminActor(permissions)) {
    return canClinicAdminManagePermissionRole(role);
  }

  return false;
};

export const getAdminUsersRoleForbiddenMessage = (
  permissions: UserPermissions
) =>
  isAreaManagerActor(permissions)
    ? ADMIN_USERS_ACCESS_MESSAGES.roleForbiddenForAreaManager
    : ADMIN_USERS_ACCESS_MESSAGES.roleForbiddenForClinicAdmin;

export const getAdminUsersPermissionForbiddenMessage = (
  permissions: UserPermissions
) =>
  isAreaManagerActor(permissions)
    ? ADMIN_USERS_ACCESS_MESSAGES.permissionForbiddenForAreaManager
    : ADMIN_USERS_ACCESS_MESSAGES.permissionForbiddenForClinicAdmin;
