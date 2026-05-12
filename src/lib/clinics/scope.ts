export type ClinicScopeRow = {
  id: string;
  parent_id: string | null;
};

export const CLINIC_SCOPE_FILTER_COLUMNS = ['id', 'parent_id'] as const;
const SAFE_CLINIC_SCOPE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertSafeClinicScopeIds(scopedClinicIds: readonly string[]) {
  if (scopedClinicIds.length === 0) {
    throw new Error('Clinic scope ids must not be empty');
  }

  for (const scopedClinicId of scopedClinicIds) {
    if (!SAFE_CLINIC_SCOPE_ID_PATTERN.test(scopedClinicId)) {
      throw new Error('Invalid clinic scope id');
    }
  }
}

export function buildClinicScopeOrFilter(scopedClinicIds: readonly string[]) {
  assertSafeClinicScopeIds(scopedClinicIds);

  const scopeValues = scopedClinicIds.join(',');
  return CLINIC_SCOPE_FILTER_COLUMNS.map(
    column => `${column}.in.(${scopeValues})`
  ).join(',');
}

export function mergeScopedClinicHierarchyIds(
  scopedClinicIds: readonly string[],
  rows: readonly ClinicScopeRow[]
) {
  // Current tenant hierarchy is intentionally two layers: parent tenant -> child tenant.
  const expandedScopeIds = new Set(scopedClinicIds);

  for (const row of rows) {
    if (
      expandedScopeIds.has(row.id) ||
      expandedScopeIds.has(row.parent_id ?? '')
    ) {
      expandedScopeIds.add(row.id);
    }
  }

  return Array.from(expandedScopeIds);
}

export function selectReservableAdminClinicRows<T extends ClinicScopeRow>(
  rows: readonly T[]
) {
  return rows.filter(row => row.parent_id !== null);
}
