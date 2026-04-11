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

  it('falls back to clinic_id when clinic_scope_ids is absent or empty', () => {
    const withoutScopeIds: UserPermissions = {
      role: 'staff',
      clinic_id: 'clinic-1',
    };
    const withEmptyScopeIds: UserPermissions = {
      role: 'staff',
      clinic_id: 'clinic-1',
      clinic_scope_ids: [],
    };

    expect(resolveScopedClinicIds(withoutScopeIds)).toEqual(['clinic-1']);
    expect(resolveScopedClinicIds(withEmptyScopeIds)).toEqual(['clinic-1']);
  });

  it('returns null when both clinic_scope_ids and clinic_id are missing', () => {
    const permissions: UserPermissions = {
      role: 'staff',
      clinic_id: null,
      clinic_scope_ids: [],
    };

    expect(resolveScopedClinicIds(permissions)).toBeNull();
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
