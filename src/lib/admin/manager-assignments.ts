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
  total: number;
};

export type ReplaceManagerAssignmentsPayload = {
  clinic_ids: string[];
  revoke_reason: string | null;
};

export type ManagerAssignmentFormState = {
  clinicIds: string[];
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
  manager: Pick<ManagerListItem, 'assigned_clinics'> | null
): ManagerAssignmentFormState {
  return {
    clinicIds: manager ? getManagerAssignedClinicIds(manager) : [],
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
  };
}

export function buildReplaceManagerAssignmentsPayload(
  formState: ManagerAssignmentFormState
): ReplaceManagerAssignmentsPayload {
  const revokeReason = formState.revokeReason.trim();

  return {
    clinic_ids: toUniqueClinicIds(formState.clinicIds),
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
  manager: Pick<ManagerListItem, 'assigned_clinics'>,
  formState: ManagerAssignmentFormState
): boolean {
  return !areClinicIdSetsEqual(
    getManagerAssignedClinicIds(manager),
    formState.clinicIds
  );
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
  assignments: readonly ManagerAssignedClinic[]
): ManagerListItem {
  return {
    ...manager,
    assigned_clinics: assignments,
    assigned_clinic_count: assignments.length,
  };
}
