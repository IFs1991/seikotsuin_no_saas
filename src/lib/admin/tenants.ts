export const ADMIN_TENANT_STATUS_OPTIONS = [
  { label: 'すべて', value: 'all' },
  { label: '運用中のみ', value: 'active' },
  { label: '停止中のみ', value: 'inactive' },
] as const;

export const ADMIN_TENANT_TYPE_OPTIONS = [
  { label: '本部/単独テナント', value: 'hq' },
  { label: '子テナント', value: 'child' },
] as const;

export const UNSELECTED_PARENT_VALUE = '__unselected_parent__';
export const TENANT_INITIAL_ACCESS_LATER = 'later';
export const TENANT_INITIAL_ACCESS_NEW = 'new';
export const TENANT_INITIAL_ACCESS_EXISTING = 'existing';
export const TENANT_INITIAL_ACCESS_OPTIONS = [
  {
    label: 'あとで設定する',
    value: TENANT_INITIAL_ACCESS_LATER,
    description:
      'テナントだけ作成し、管理者やスタッフの紐づけは後から行います。',
  },
  {
    label: '新規管理者を作成',
    value: TENANT_INITIAL_ACCESS_NEW,
    description:
      '店舗作成と同時に、最初にログインする店舗管理者を新規作成します。',
  },
  {
    label: '既存ユーザーを割り当て',
    value: TENANT_INITIAL_ACCESS_EXISTING,
    description:
      '既存の院長・施術者・管理者を、この店舗の初期管理者として紐づけます。',
  },
] as const;
export const CLINIC_LIST_SELECT =
  'id, name, address, phone_number, is_active, created_at, parent_id';
export const CLINIC_HIERARCHY_SELECT = 'id, name, parent_id';

export type ClinicHierarchyType =
  (typeof ADMIN_TENANT_TYPE_OPTIONS)[number]['value'];
export type TenantInitialAccessMode =
  (typeof TENANT_INITIAL_ACCESS_OPTIONS)[number]['value'];
export type ClinicStatusFilterValue =
  (typeof ADMIN_TENANT_STATUS_OPTIONS)[number]['value'];
export type ClinicAdminAccount = {
  email: string;
  role: string;
};
export type ClinicHierarchySummary = {
  parent_name: string | null;
  clinic_type: ClinicHierarchyType;
  child_count: number;
};
export type ScopedClinicLookupRow = {
  id: string;
  name: string;
  parent_id: string | null;
};
export type ClinicListRow = {
  id: string;
  name: string;
  address: string | null;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
  parent_id: string | null;
};

export interface ClinicSummary {
  id: string;
  name: string;
  address?: string | null;
  phone_number?: string | null;
  is_active: boolean;
  created_at?: string | null;
  parent_id?: string | null;
  parent_name?: string | null;
  clinic_type?: ClinicHierarchyType;
  child_count?: number;
  admin_account?: ClinicAdminAccount | null;
}

export interface ClinicFilters {
  search?: string;
  isActive?: boolean | null;
}

export interface CreateClinicPayload {
  name: string;
  address?: string;
  phone_number?: string;
  is_active?: boolean;
  parent_id: string;
  login_email?: string;
  login_password?: string;
}

export interface UpdateClinicPayload {
  name?: string;
  address?: string | null;
  phone_number?: string | null;
  is_active?: boolean;
  parent_id?: string | null;
}

export type TenantFormState = {
  name: string;
  address: string;
  phone_number: string;
  login_email: string;
  login_password: string;
  initial_access_mode: TenantInitialAccessMode;
  existing_admin_user_id: string;
  is_active: boolean;
  tenant_type: ClinicHierarchyType;
  parent_id: string;
};

export const INITIAL_TENANT_FORM_STATE: TenantFormState = {
  name: '',
  address: '',
  phone_number: '',
  login_email: '',
  login_password: '',
  initial_access_mode: TENANT_INITIAL_ACCESS_LATER,
  existing_admin_user_id: '',
  is_active: true,
  tenant_type: 'child',
  parent_id: '',
};

export function createInitialTenantFormState(): TenantFormState {
  return {
    ...INITIAL_TENANT_FORM_STATE,
  };
}

export function resolveClinicHierarchyType(
  parentId?: string | null
): ClinicHierarchyType {
  return parentId ? 'child' : 'hq';
}

export function buildClinicHierarchySummary<
  T extends { parent_id: string | null },
>(
  clinic: T,
  options?: {
    parentName?: string | null;
    childCount?: number;
  }
): T & ClinicHierarchySummary {
  return {
    ...clinic,
    parent_name: options?.parentName ?? null,
    clinic_type: resolveClinicHierarchyType(clinic.parent_id),
    child_count: options?.childCount ?? 0,
  };
}

export function buildClinicHierarchyRows<T extends ClinicListRow>(
  clinics: T[],
  hierarchySource: ScopedClinicLookupRow[]
): Array<T & ClinicHierarchySummary> {
  const clinicNameMap = new Map(
    hierarchySource.map(clinic => [clinic.id, clinic.name] as const)
  );
  const childCountMap = new Map<string, number>();

  for (const clinic of hierarchySource) {
    if (!clinic.parent_id) {
      continue;
    }

    childCountMap.set(
      clinic.parent_id,
      (childCountMap.get(clinic.parent_id) ?? 0) + 1
    );
  }

  return clinics.map(clinic =>
    buildClinicHierarchySummary(clinic, {
      parentName: clinic.parent_id
        ? (clinicNameMap.get(clinic.parent_id) ?? null)
        : null,
      childCount: childCountMap.get(clinic.id) ?? 0,
    })
  );
}

export function formatClinicDate(value?: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ja-JP');
}

export function formatClinicTypeLabel(
  clinic: Pick<ClinicSummary, 'parent_id' | 'child_count'>
) {
  if (resolveClinicHierarchyType(clinic.parent_id) === 'child') {
    return '子テナント';
  }

  if ((clinic.child_count ?? 0) > 0) {
    return `本部 (${clinic.child_count}店舗)`;
  }

  return '本部/単独';
}

export function buildParentLabel(clinic: Pick<ClinicSummary, 'parent_name'>) {
  return clinic.parent_name || '-';
}

export function buildParentOptionLabel(
  clinic: Pick<ClinicSummary, 'name' | 'child_count'>
) {
  return `${clinic.name}${clinic.child_count ? ` (${clinic.child_count}店舗)` : ''}`;
}

export function formatClinicOperationStatus(isActive: boolean) {
  return isActive ? '運用中' : '停止中';
}

export function formatClinicOperationAction(isActive: boolean) {
  return isActive ? '運用を停止' : '運用を再開';
}

export function buildClinicOperationNotice(isActiveBeforeUpdate: boolean) {
  return isActiveBeforeUpdate
    ? 'テナントの運用を停止しました'
    : 'テナントの運用を再開しました';
}

export function buildFormValidationMessage(
  formState: TenantFormState,
  isCreateMode: boolean
) {
  if (!formState.name.trim()) {
    return 'クリニック名を入力してください';
  }

  if (
    (isCreateMode || formState.tenant_type === 'child') &&
    !formState.parent_id
  ) {
    return '親テナントを選択してください';
  }

  if (!isCreateMode) {
    return null;
  }

  return buildTenantAdminAccessValidationMessage(formState);
}

export function buildTenantAdminAccessValidationMessage(
  formState: TenantFormState
) {
  if (
    formState.initial_access_mode === TENANT_INITIAL_ACCESS_NEW &&
    !formState.login_email.trim()
  ) {
    return '初期管理者メールアドレスを入力してください';
  }

  if (
    formState.initial_access_mode === TENANT_INITIAL_ACCESS_NEW &&
    !formState.login_password
  ) {
    return '初期パスワードを入力してください';
  }

  if (
    formState.initial_access_mode === TENANT_INITIAL_ACCESS_EXISTING &&
    !formState.existing_admin_user_id.trim()
  ) {
    return '初期管理者として割り当てる既存ユーザーを選択してください';
  }

  return null;
}

export function buildCreateClinicPayload(
  formState: TenantFormState
): CreateClinicPayload {
  return {
    name: formState.name,
    address: formState.address || undefined,
    phone_number: formState.phone_number || undefined,
    is_active: formState.is_active,
    parent_id: formState.parent_id,
    login_email:
      formState.initial_access_mode === TENANT_INITIAL_ACCESS_NEW
        ? formState.login_email || undefined
        : undefined,
    login_password:
      formState.initial_access_mode === TENANT_INITIAL_ACCESS_NEW
        ? formState.login_password || undefined
        : undefined,
  };
}

export function buildUpdateClinicPayload(
  formState: TenantFormState
): UpdateClinicPayload {
  return {
    name: formState.name,
    address: formState.address || null,
    phone_number: formState.phone_number || null,
    is_active: formState.is_active,
    parent_id: formState.tenant_type === 'child' ? formState.parent_id : null,
  };
}

export function buildCreateNotice(
  clinic: Pick<ClinicSummary, 'parent_name' | 'admin_account'>
) {
  if (!clinic.admin_account) {
    return clinic.parent_name
      ? `子テナントを作成しました（親: ${clinic.parent_name}）`
      : 'クリニックを作成しました';
  }

  return clinic.parent_name
    ? `子テナントと店舗管理者アカウントを作成しました（親: ${clinic.parent_name} / ID: ${clinic.admin_account.email}）`
    : `クリニックと店舗管理者アカウントを作成しました（ID: ${clinic.admin_account.email}）`;
}

export function buildEditFormState(
  clinic: Pick<
    ClinicSummary,
    'name' | 'address' | 'phone_number' | 'is_active' | 'parent_id'
  >
): TenantFormState {
  return {
    name: clinic.name,
    address: clinic.address ?? '',
    phone_number: clinic.phone_number ?? '',
    login_email: '',
    login_password: '',
    initial_access_mode: TENANT_INITIAL_ACCESS_LATER,
    existing_admin_user_id: '',
    is_active: clinic.is_active,
    tenant_type: resolveClinicHierarchyType(clinic.parent_id),
    parent_id: clinic.parent_id ?? '',
  };
}

type SortableClinic = Pick<ClinicSummary, 'id' | 'name' | 'parent_id'>;

export function sortClinicsForDisplay<T extends SortableClinic>(items: T[]) {
  const clinicsById = new Map(
    items.map(clinic => [clinic.id, clinic] as const)
  );

  return [...items].sort((left, right) => {
    const leftRoot = left.parent_id ?? left.id;
    const rightRoot = right.parent_id ?? right.id;
    const leftRootName = clinicsById.get(leftRoot)?.name ?? left.name;
    const rightRootName = clinicsById.get(rightRoot)?.name ?? right.name;
    const groupCompare = leftRootName.localeCompare(rightRootName, 'ja');

    if (groupCompare !== 0) {
      return groupCompare;
    }

    if (left.parent_id === null && right.parent_id !== null) {
      return -1;
    }

    if (left.parent_id !== null && right.parent_id === null) {
      return 1;
    }

    return left.name.localeCompare(right.name, 'ja');
  });
}

export function isHierarchyLocked(
  clinic?: Pick<ClinicSummary, 'child_count'> | null
) {
  return (clinic?.child_count ?? 0) > 0;
}
