import {
  canAccessClinicScope,
  resolveScopedClinicIds,
  type UserPermissions,
} from '@/lib/supabase';

describe('resolveScopedClinicIds', () => {
  it('prefers clinic_scope_ids over clinic_id when both are present', () => {
    const permissions: UserPermissions = {
      role: 'admin',
      clinic_id: 'clinic-1',
      clinic_scope_ids: ['clinic-2', 'clinic-3'],
    };

    expect(resolveScopedClinicIds(permissions)).toEqual([
      'clinic-2',
      'clinic-3',
    ]);
  });

  it('falls back when clinic_scope_ids is absent/null and preserves explicit empty scope', () => {
    const withoutScopeIds: UserPermissions = {
      role: 'staff',
      clinic_id: 'clinic-1',
    };
    const withEmptyScopeIds: UserPermissions = {
      role: 'staff',
      clinic_id: 'clinic-1',
      clinic_scope_ids: [],
    };
    const withNullScopeIds: UserPermissions = {
      role: 'clinic_admin',
      clinic_id: 'clinic-1',
      clinic_scope_ids: null,
    };

    expect(resolveScopedClinicIds(withoutScopeIds)).toEqual(['clinic-1']);
    expect(resolveScopedClinicIds(withNullScopeIds)).toEqual(['clinic-1']);
    expect(resolveScopedClinicIds(withEmptyScopeIds)).toEqual([]);
  });

  it('never falls a manager back to a stale primary clinic', () => {
    const permissions: UserPermissions = {
      role: 'manager',
      clinic_id: 'stale-primary',
    };

    expect(resolveScopedClinicIds(permissions)).toEqual([]);
  });

  it('distinguishes absent scope from an explicitly empty denied scope', () => {
    const absentScope: UserPermissions = {
      role: 'staff',
      clinic_id: null,
    };
    const emptyScope: UserPermissions = {
      role: 'staff',
      clinic_id: null,
      clinic_scope_ids: [],
    };

    expect(resolveScopedClinicIds(absentScope)).toBeNull();
    expect(resolveScopedClinicIds(emptyScope)).toEqual([]);
  });
});

describe('canAccessClinicScope', () => {
  it('uses the resolved clinic scope for access checks', () => {
    const permissions: UserPermissions = {
      role: 'admin',
      clinic_id: 'clinic-1',
      clinic_scope_ids: ['clinic-2', 'clinic-3'],
    };

    expect(canAccessClinicScope(permissions, 'clinic-2')).toBe(true);
    expect(canAccessClinicScope(permissions, 'clinic-1')).toBe(false);
  });
});
