import { isAdminUserRole, type AdminUserRole } from '@/lib/constants/roles';

export const DEFAULT_ADMIN_USER_ROLE: AdminUserRole = 'clinic_admin';
export const ROLE_FILTER_ALL = 'all';
export const CLINIC_FILTER_ALL = 'all';
export const NO_CLINIC_VALUE = 'none';

export type AdminUsersRoleFilter = AdminUserRole | typeof ROLE_FILTER_ALL;

export type PermissionEntry = {
  id: string;
  user_id: string | null;
  role: string;
  clinic_id: string | null;
  clinic_name?: string | null;
  username: string;
  profile_email?: string | null;
  profile_name?: string | null;
  created_at?: string | null;
};

export type PermissionFilters = {
  role?: AdminUserRole;
  clinicId?: string;
  search?: string;
};

export type PermissionFormState = {
  user_id: string;
  role: AdminUserRole;
  clinic_id: string;
};

export type AssignPermissionPayload = {
  user_id: string;
  role: AdminUserRole;
  clinic_id: string | null;
};

export type UpdatePermissionPayload = {
  role?: AdminUserRole;
  clinic_id?: string | null;
};

type PermissionFilterInput = {
  roleFilter: AdminUsersRoleFilter;
  clinicFilter: string;
  search: string;
};

type EditablePermission = Pick<
  PermissionEntry,
  'user_id' | 'role' | 'clinic_id'
>;

export function createEmptyPermissionFormState(): PermissionFormState {
  return {
    user_id: '',
    role: DEFAULT_ADMIN_USER_ROLE,
    clinic_id: '',
  };
}

export function toAdminUserRole(
  role: string | null | undefined
): AdminUserRole {
  return isAdminUserRole(role) ? role : DEFAULT_ADMIN_USER_ROLE;
}

export function toRoleFilterValue(value: string): AdminUsersRoleFilter {
  return value === ROLE_FILTER_ALL ? ROLE_FILTER_ALL : toAdminUserRole(value);
}

export function buildPermissionFilters({
  roleFilter,
  clinicFilter,
  search,
}: PermissionFilterInput): PermissionFilters {
  const trimmedSearch = search.trim();
  const filters: PermissionFilters = {};

  if (roleFilter !== ROLE_FILTER_ALL) {
    filters.role = roleFilter;
  }
  if (clinicFilter !== CLINIC_FILTER_ALL) {
    filters.clinicId = clinicFilter;
  }
  if (trimmedSearch) {
    filters.search = trimmedSearch;
  }

  return filters;
}

export function getPermissionClinicId(
  role: AdminUserRole,
  clinicId: string
): string | null {
  if (role === 'admin') {
    return null;
  }
  return clinicId.trim() || null;
}

export function validatePermissionForm(
  formState: PermissionFormState
): string | null {
  if (!formState.user_id.trim()) {
    return 'Supabase Auth ユーザーIDを入力してください';
  }

  if (
    formState.role !== 'admin' &&
    !getPermissionClinicId(formState.role, formState.clinic_id)
  ) {
    return '所属店舗を選択してください';
  }

  return null;
}

export function createAssignPermissionPayload(
  formState: PermissionFormState
): AssignPermissionPayload {
  return {
    user_id: formState.user_id.trim(),
    role: formState.role,
    clinic_id: getPermissionClinicId(formState.role, formState.clinic_id),
  };
}

export function createUpdatePermissionPayload(
  formState: PermissionFormState
): UpdatePermissionPayload {
  return {
    role: formState.role,
    clinic_id: getPermissionClinicId(formState.role, formState.clinic_id),
  };
}

export function createPermissionFormState(
  permission: EditablePermission
): PermissionFormState {
  return {
    user_id: permission.user_id ?? '',
    role: toAdminUserRole(permission.role),
    clinic_id: permission.clinic_id ?? '',
  };
}
