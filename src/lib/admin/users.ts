import {
  ADMIN_USER_ROLE_OPTIONS,
  isAdminUserRole,
  normalizeRole,
  type AdminUserRole,
} from '@/lib/constants/roles';

export const DEFAULT_ADMIN_USER_ROLE: AdminUserRole = 'clinic_admin';
export const CLINIC_ADMIN_ASSIGNABLE_ROLES = [
  'manager',
  'therapist',
  'staff',
] as const satisfies readonly AdminUserRole[];
export const ROLE_FILTER_ALL = 'all';
export const CLINIC_FILTER_ALL = 'all';
export const NO_CLINIC_VALUE = 'none';
export const USER_CANDIDATE_MIN_SEARCH_LENGTH = 1;
export const USER_CANDIDATE_LIMIT = 20;
export const CREATE_ACCOUNT_MODE_EXISTING = 'existing';
export const CREATE_ACCOUNT_MODE_NEW = 'new';
export const CREATE_ACCOUNT_MODE_ACCOUNT_ONLY = 'account_only';
export const CREATABLE_ADMIN_ACCOUNT_ROLES = [
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
] as const satisfies readonly AdminUserRole[];

export type AdminUsersRoleFilter = AdminUserRole | typeof ROLE_FILTER_ALL;
export type AccountCreateMode =
  | typeof CREATE_ACCOUNT_MODE_EXISTING
  | typeof CREATE_ACCOUNT_MODE_NEW
  | typeof CREATE_ACCOUNT_MODE_ACCOUNT_ONLY;

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

export type CandidateSource = 'staff' | 'profile';

type PermissionClinicRelation =
  | { name: string | null }[]
  | { name: string | null }
  | null
  | undefined;

export type PermissionMutationRow = {
  id: string;
  staff_id: string | null;
  role: string;
  clinic_id: string | null;
  username: string;
  created_at?: string | null;
  clinics?: PermissionClinicRelation;
};

type PermissionProfileInput = {
  email?: string | null;
  full_name?: string | null;
};

export type UserPermissionCandidate = {
  user_id: string;
  email: string;
  full_name: string;
  clinic_id: string | null;
  clinic_name: string | null;
  staff_role: string | null;
  current_role: string | null;
  permission_id: string | null;
  permission_clinic_id: string | null;
  permission_clinic_name: string | null;
  candidate_source: CandidateSource;
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
  create_mode: AccountCreateMode;
  full_name: string;
  email: string;
  password: string;
};

export type AssignPermissionPayload = {
  user_id: string;
  role: AdminUserRole;
  clinic_id: string | null;
  candidate_source?: CandidateSource;
};

export type AccountOnlyCreatePayload = {
  full_name: string;
  email: string;
  password: string;
};

export type CreateAccountPayload = {
  create_account: true;
  full_name: string;
  email: string;
  password: string;
  role: AdminUserRole;
  clinic_id: string;
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

const CLINIC_ADMIN_ASSIGNABLE_ROLE_SET = new Set<string>(
  CLINIC_ADMIN_ASSIGNABLE_ROLES
);
const CREATABLE_ADMIN_ACCOUNT_ROLE_SET = new Set<string>(
  CREATABLE_ADMIN_ACCOUNT_ROLES
);

export function canClinicAdminManagePermissionRole(
  role: string | null | undefined
): boolean {
  const normalizedRole = normalizeRole(role);
  return (
    normalizedRole !== null &&
    CLINIC_ADMIN_ASSIGNABLE_ROLE_SET.has(normalizedRole)
  );
}

export function getAssignableAdminUserRoleOptions(
  actorRole: string | null | undefined
) {
  const normalizedRole = normalizeRole(actorRole);

  if (normalizedRole === 'admin') {
    return ADMIN_USER_ROLE_OPTIONS;
  }

  if (normalizedRole === 'clinic_admin') {
    return ADMIN_USER_ROLE_OPTIONS.filter(option =>
      canClinicAdminManagePermissionRole(option.value)
    );
  }

  return [];
}

export function getCreatableAdminAccountRoleOptions(
  actorRole: string | null | undefined
) {
  return getAssignableAdminUserRoleOptions(actorRole).filter(option =>
    CREATABLE_ADMIN_ACCOUNT_ROLE_SET.has(option.value)
  );
}

export function getPermissionClinicName(
  clinics: PermissionClinicRelation
): string | null {
  if (!clinics) {
    return null;
  }

  if (Array.isArray(clinics)) {
    return clinics[0]?.name ?? null;
  }

  return clinics.name ?? null;
}

export function toPermissionEntry(
  row: PermissionMutationRow,
  profile: PermissionProfileInput = {}
): PermissionEntry {
  return {
    id: row.id,
    user_id: row.staff_id,
    role: row.role,
    clinic_id: row.clinic_id,
    clinic_name: getPermissionClinicName(row.clinics),
    username: row.username,
    profile_email: profile.email ?? null,
    profile_name: profile.full_name ?? null,
    created_at: row.created_at ?? null,
  };
}

export function createEmptyPermissionFormState(
  role: AdminUserRole = DEFAULT_ADMIN_USER_ROLE
): PermissionFormState {
  return {
    user_id: '',
    role,
    clinic_id: '',
    create_mode: CREATE_ACCOUNT_MODE_EXISTING,
    full_name: '',
    email: '',
    password: '',
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

export function permissionMatchesFilters(
  permission: PermissionEntry,
  filters: PermissionFilters
): boolean {
  if (filters.role && permission.role !== filters.role) {
    return false;
  }

  if (filters.clinicId && permission.clinic_id !== filters.clinicId) {
    return false;
  }

  const search = filters.search?.trim().toLowerCase();
  if (!search) {
    return true;
  }

  return [
    permission.username,
    permission.profile_email,
    permission.profile_name,
    permission.user_id,
    permission.clinic_name,
  ].some(value => (value ?? '').toLowerCase().includes(search));
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
  const isAccountOnlyMode =
    formState.create_mode === CREATE_ACCOUNT_MODE_ACCOUNT_ONLY;

  if (
    formState.create_mode === CREATE_ACCOUNT_MODE_EXISTING &&
    !formState.user_id.trim()
  ) {
    return 'ユーザーを選択してください';
  }

  if (formState.create_mode === CREATE_ACCOUNT_MODE_NEW || isAccountOnlyMode) {
    if (!formState.full_name.trim()) {
      return '氏名を入力してください';
    }
    if (!formState.email.trim()) {
      return 'ログインメールアドレスを入力してください';
    }
    if (!formState.password.trim()) {
      return '初期パスワードを入力してください';
    }
  }

  if (isAccountOnlyMode) {
    return null;
  }

  if (formState.create_mode === CREATE_ACCOUNT_MODE_NEW) {
    if (!CREATABLE_ADMIN_ACCOUNT_ROLE_SET.has(formState.role)) {
      return '新規作成できるロールを選択してください';
    }
  }

  if (
    formState.role !== 'admin' &&
    !getPermissionClinicId(formState.role, formState.clinic_id)
  ) {
    return '所属店舗を選択してください';
  }

  return null;
}

export function createAccountOnlyPayload(
  formState: PermissionFormState
): AccountOnlyCreatePayload {
  return {
    full_name: formState.full_name.trim(),
    email: formState.email.trim().toLowerCase(),
    password: formState.password,
  };
}

export function createAssignPermissionPayload(
  formState: PermissionFormState
): AssignPermissionPayload | CreateAccountPayload {
  const clinicId = getPermissionClinicId(formState.role, formState.clinic_id);

  if (formState.create_mode === CREATE_ACCOUNT_MODE_NEW) {
    return {
      create_account: true,
      full_name: formState.full_name.trim(),
      email: formState.email.trim().toLowerCase(),
      password: formState.password,
      role: formState.role,
      clinic_id: clinicId ?? '',
    };
  }

  return {
    user_id: formState.user_id.trim(),
    role: formState.role,
    clinic_id: clinicId,
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
    create_mode: CREATE_ACCOUNT_MODE_EXISTING,
    full_name: '',
    email: '',
    password: '',
  };
}

export function getCandidateInputLabel(
  candidate: Pick<UserPermissionCandidate, 'email' | 'full_name'>
): string {
  return candidate.full_name
    ? `${candidate.full_name} / ${candidate.email}`
    : candidate.email;
}

export function getPermissionAccountPrimary(
  permission: Pick<
    PermissionEntry,
    'profile_name' | 'profile_email' | 'username'
  >
): string {
  return (
    permission.profile_name ||
    permission.profile_email ||
    permission.username ||
    '名称未設定'
  );
}

export function getPermissionAccountSecondary(
  permission: Pick<
    PermissionEntry,
    'profile_name' | 'profile_email' | 'username'
  >
): string | null {
  if (permission.profile_name && permission.profile_email) {
    return permission.profile_email;
  }

  if (
    permission.profile_email &&
    permission.profile_email !== permission.username
  ) {
    return permission.username;
  }

  return null;
}

export function getPermissionInputLabel(permission: PermissionEntry): string {
  const primary = getPermissionAccountPrimary(permission);
  const secondary = getPermissionAccountSecondary(permission);
  return secondary ? `${primary} / ${secondary}` : primary;
}
