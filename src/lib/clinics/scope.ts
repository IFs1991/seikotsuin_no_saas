export type ClinicScopeRow = {
  id: string;
  parent_id: string | null;
};

export const CLINIC_SCOPE_FILTER_COLUMNS = ['id', 'parent_id'] as const;

export function buildClinicScopeOrFilter(scopedClinicIds: readonly string[]) {
  const scopeValues = scopedClinicIds.join(',');
  return CLINIC_SCOPE_FILTER_COLUMNS.map(
    column => `${column}.in.(${scopeValues})`
  ).join(',');
}

export function mergeScopedClinicHierarchyIds(
  scopedClinicIds: readonly string[],
  rows: readonly ClinicScopeRow[]
) {
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
  const childRows = rows.filter(row => row.parent_id !== null);
  return childRows.length > 0 ? childRows : rows;
}
