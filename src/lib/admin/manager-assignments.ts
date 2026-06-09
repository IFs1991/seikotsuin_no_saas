import type { ClinicSummary } from '@/lib/admin/tenants';

export const MANAGER_ASSIGNMENT_EMPTY_TITLE =
  'マネージャー権限のユーザーがまだ存在しません。';
export const MANAGER_ASSIGNMENT_EMPTY_DESCRIPTION =
  '先に「ユーザー管理」から manager ロールのアカウントを作成してください。';

export type ManagerAssignedClinic = {
  assignment_id: string;
  clinic_id: string;
  clinic_name: string | null;
  assigned_at: string;
};

export type ManagerListItem = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  primary_clinic_id: string | null;
  primary_clinic_name: string | null;
  assigned_clinic_count: number;
  assigned_clinics: readonly ManagerAssignedClinic[];
};

export type ManagerListResponse = {
  managers: ManagerListItem[];
  total: number;
};

export type ManagerAssignmentsResponse = {
  assignments: ManagerAssignedClinic[];
  primary_clinic_id: string | null;
  primary_clinic_name: string | null;
  total: number;
};

export type ReplaceManagerAssignmentsPayload = {
  clinic_ids: string[];
  primary_clinic_id: string | null;
  revoke_reason: string | null;
};

export type ManagerAssignmentFormState = {
  clinicIds: string[];
  primaryClinicId: string;
  revokeReason: string;
};

export type ManagerAssignmentClinicOption = Pick<
  ClinicSummary,
  'id' | 'name' | 'is_active' | 'parent_id'
>;

export function getManagerDisplayName(
  manager: Pick<ManagerListItem, 'full_name' | 'email' | 'user_id'>
): string {
  return manager.full_name?.trim() || manager.email?.trim() || manager.user_id;
}

export function getManagerEmail(
  manager: Pick<ManagerListItem, 'email'>
): string {
  return manager.email?.trim() || '-';
}

export function getPrimaryClinicLabel(
  manager: Pick<ManagerListItem, 'primary_clinic_name' | 'primary_clinic_id'>
): string {
  return (
    manager.primary_clinic_name?.trim() ||
    manager.primary_clinic_id?.trim() ||
    '-'
  );
}

export function getAssignedClinicLabel(
  assignment: Pick<ManagerAssignedClinic, 'clinic_name' | 'clinic_id'>
): string {
  return assignment.clinic_name?.trim() || assignment.clinic_id;
}

export function toUniqueClinicIds(clinicIds: readonly string[]): string[] {
  const uniqueIds = new Set<string>();

  for (const clinicId of clinicIds) {
    const trimmedClinicId = clinicId.trim();
    if (trimmedClinicId) {
      uniqueIds.add(trimmedClinicId);
    }
  }

  return Array.from(uniqueIds);
}

export function getManagerAssignedClinicIds(
  manager: Pick<ManagerListItem, 'assigned_clinics'>
): string[] {
  return toUniqueClinicIds(
    manager.assigned_clinics.map(assignment => assignment.clinic_id)
  );
}

export function createManagerAssignmentFormState(
  manager: Pick<
    ManagerListItem,
    'assigned_clinics' | 'primary_clinic_id'
  > | null
): ManagerAssignmentFormState {
  const clinicIds = manager ? getManagerAssignedClinicIds(manager) : [];

  return {
    clinicIds,
    primaryClinicId:
      manager?.primary_clinic_id &&
      clinicIds.includes(manager.primary_clinic_id)
        ? manager.primary_clinic_id
        : '',
    revokeReason: '',
  };
}

export function setManagerAssignmentClinicSelected(
  formState: ManagerAssignmentFormState,
  clinicId: string,
  selected: boolean
): ManagerAssignmentFormState {
  const currentClinicIds = new Set(formState.clinicIds);

  if (selected) {
    currentClinicIds.add(clinicId);
  } else {
    currentClinicIds.delete(clinicId);
  }

  return {
    ...formState,
    clinicIds: Array.from(currentClinicIds),
    primaryClinicId:
      !selected && formState.primaryClinicId === clinicId
        ? ''
        : formState.primaryClinicId,
  };
}

export function buildReplaceManagerAssignmentsPayload(
  formState: ManagerAssignmentFormState
): ReplaceManagerAssignmentsPayload {
  const clinicIds = toUniqueClinicIds(formState.clinicIds);
  const primaryClinicId = formState.primaryClinicId.trim();
  const revokeReason = formState.revokeReason.trim();

  return {
    clinic_ids: clinicIds,
    primary_clinic_id:
      primaryClinicId && clinicIds.includes(primaryClinicId)
        ? primaryClinicId
        : null,
    revoke_reason: revokeReason ? revokeReason : null,
  };
}

function areClinicIdSetsEqual(
  leftClinicIds: readonly string[],
  rightClinicIds: readonly string[]
): boolean {
  const leftSet = new Set(leftClinicIds);
  const rightSet = new Set(rightClinicIds);

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  for (const clinicId of leftSet) {
    if (!rightSet.has(clinicId)) {
      return false;
    }
  }

  return true;
}

export function hasManagerAssignmentChanges(
  manager: Pick<ManagerListItem, 'assigned_clinics' | 'primary_clinic_id'>,
  formState: ManagerAssignmentFormState
): boolean {
  if (
    !areClinicIdSetsEqual(
      getManagerAssignedClinicIds(manager),
      formState.clinicIds
    )
  ) {
    return true;
  }

  return (manager.primary_clinic_id ?? '') !== formState.primaryClinicId;
}

export function filterAssignableClinicOptions(
  clinics: readonly ManagerAssignmentClinicOption[]
): ManagerAssignmentClinicOption[] {
  return clinics
    .filter(
      clinic =>
        clinic.is_active === true &&
        typeof clinic.parent_id === 'string' &&
        clinic.parent_id.trim() !== ''
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
}

export function managerMatchesSearch(
  manager: ManagerListItem,
  search: string
): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase('ja-JP');
  if (!normalizedSearch) {
    return true;
  }

  const searchableValues = [
    manager.full_name,
    manager.email,
    manager.primary_clinic_name,
    manager.primary_clinic_id,
    ...manager.assigned_clinics.map(getAssignedClinicLabel),
  ];

  return searchableValues.some(value =>
    (value ?? '').toLocaleLowerCase('ja-JP').includes(normalizedSearch)
  );
}

export function clinicOptionMatchesSearch(
  clinic: Pick<ManagerAssignmentClinicOption, 'name'>,
  search: string
): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase('ja-JP');
  return (
    !normalizedSearch ||
    clinic.name.toLocaleLowerCase('ja-JP').includes(normalizedSearch)
  );
}

export function mergeAssignmentsIntoManager(
  manager: ManagerListItem,
  assignments: readonly ManagerAssignedClinic[],
  primaryClinic: Pick<
    ManagerListItem,
    'primary_clinic_id' | 'primary_clinic_name'
  >
): ManagerListItem {
  return {
    ...manager,
    primary_clinic_id: primaryClinic.primary_clinic_id,
    primary_clinic_name: primaryClinic.primary_clinic_name,
    assigned_clinics: assignments,
    assigned_clinic_count: assignments.length,
  };
}
