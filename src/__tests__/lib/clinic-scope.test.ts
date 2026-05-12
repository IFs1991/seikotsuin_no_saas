import {
  buildClinicScopeOrFilter,
  mergeScopedClinicHierarchyIds,
  selectReservableAdminClinicRows,
} from '@/lib/clinics/scope';

describe('clinic scope helpers', () => {
  it('builds the same id / parent_id OR filter used by admin tenant scope', () => {
    expect(buildClinicScopeOrFilter(['parent-1', 'child-1'])).toBe(
      'id.in.(parent-1,child-1),parent_id.in.(parent-1,child-1)'
    );
  });

  it('rejects unsafe PostgREST filter values before building scope filters', () => {
    expect(() =>
      buildClinicScopeOrFilter(['clinic-1),parent_id.not.is.null'])
    ).toThrow('Invalid clinic scope id');
  });

  it('rejects empty scope filters', () => {
    expect(() => buildClinicScopeOrFilter([])).toThrow(
      'Clinic scope ids must not be empty'
    );
  });

  it('expands effective scope with direct child clinic ids', () => {
    expect(
      mergeScopedClinicHierarchyIds(['parent-1'], [
        { id: 'parent-1', parent_id: null },
        { id: 'child-1', parent_id: 'parent-1' },
        { id: 'child-2', parent_id: 'parent-1' },
      ])
    ).toEqual(['parent-1', 'child-1', 'child-2']);
  });

  it('uses child rows for admin reservation clinic options when children exist', () => {
    const rows = [
      { id: 'parent-1', name: '本部', parent_id: null },
      { id: 'child-1', name: '新宿院', parent_id: 'parent-1' },
    ];

    expect(selectReservableAdminClinicRows(rows)).toEqual([rows[1]]);
  });

  it('returns no reservation options when only parent tenant rows are available', () => {
    const rows = [{ id: 'parent-1', name: '本部', parent_id: null }];

    expect(selectReservableAdminClinicRows(rows)).toEqual([]);
  });
});
