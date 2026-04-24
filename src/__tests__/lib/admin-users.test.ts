import {
  CLINIC_FILTER_ALL,
  CLINIC_ADMIN_ASSIGNABLE_ROLES,
  ROLE_FILTER_ALL,
  buildPermissionFilters,
  canClinicAdminManagePermissionRole,
  createAssignPermissionPayload,
  createPermissionFormState,
  createUpdatePermissionPayload,
  getCandidateInputLabel,
  getAssignableAdminUserRoleOptions,
  getPermissionAccountPrimary,
  getPermissionAccountSecondary,
  permissionMatchesFilters,
  toPermissionEntry,
  validatePermissionForm,
} from '@/lib/admin/users';

describe('admin users helpers', () => {
  test('empty filters are omitted', () => {
    expect(
      buildPermissionFilters({
        roleFilter: ROLE_FILTER_ALL,
        clinicFilter: CLINIC_FILTER_ALL,
        search: '   ',
      })
    ).toEqual({});
  });

  test('filters keep DB role values while trimming search text', () => {
    expect(
      buildPermissionFilters({
        roleFilter: 'manager',
        clinicFilter: 'clinic-1',
        search: '  user@example.com  ',
      })
    ).toEqual({
      role: 'manager',
      clinicId: 'clinic-1',
      search: 'user@example.com',
    });
  });

  test('admin role does not require clinic id and sends null clinic id', () => {
    const formState = {
      user_id: '  00000000-0000-0000-0000-000000000001  ',
      role: 'admin' as const,
      clinic_id: 'clinic-1',
    };

    expect(validatePermissionForm({ ...formState, clinic_id: '' })).toBeNull();
    expect(createAssignPermissionPayload(formState)).toEqual({
      user_id: '00000000-0000-0000-0000-000000000001',
      role: 'admin',
      clinic_id: null,
    });
  });

  test('user selection is required for permission assignment', () => {
    expect(
      validatePermissionForm({
        user_id: '   ',
        role: 'clinic_admin',
        clinic_id: 'clinic-1',
      })
    ).toBe('ユーザーを選択してください');
  });

  test('clinic scoped roles require clinic id', () => {
    expect(
      validatePermissionForm({
        user_id: '00000000-0000-0000-0000-000000000001',
        role: 'clinic_admin',
        clinic_id: '',
      })
    ).toBe('所属店舗を選択してください');
  });

  test('update payload converts blank clinic id to null', () => {
    expect(
      createUpdatePermissionPayload({
        user_id: '00000000-0000-0000-0000-000000000001',
        role: 'staff',
        clinic_id: '   ',
      })
    ).toEqual({
      role: 'staff',
      clinic_id: null,
    });
  });

  test('unknown stored role falls back to the default editable role', () => {
    expect(
      createPermissionFormState({
        user_id: 'user-1',
        role: 'legacy_role',
        clinic_id: 'clinic-1',
      })
    ).toEqual({
      user_id: 'user-1',
      role: 'clinic_admin',
      clinic_id: 'clinic-1',
    });
  });

  test('candidate input label uses Japanese name and email', () => {
    expect(
      getCandidateInputLabel({
        full_name: '山田 太郎',
        email: 'yamada@example.com',
      })
    ).toBe('山田 太郎 / yamada@example.com');
  });

  test('account display prefers profile name and keeps email as secondary', () => {
    const permission = {
      profile_name: '佐藤 花子',
      profile_email: 'sato@example.com',
      username: 'legacy-login',
    };

    expect(getPermissionAccountPrimary(permission)).toBe('佐藤 花子');
    expect(getPermissionAccountSecondary(permission)).toBe('sato@example.com');
  });

  test('mutation rows are normalized for the admin users UI', () => {
    expect(
      toPermissionEntry(
        {
          id: 'permission-1',
          staff_id: 'user-1',
          role: 'manager',
          clinic_id: 'clinic-1',
          clinics: { name: '新宿院' },
          username: 'sato@example.com',
          created_at: '2026-04-24T00:00:00.000Z',
        },
        {
          email: 'sato@example.com',
          full_name: '佐藤 花子',
        }
      )
    ).toEqual({
      id: 'permission-1',
      user_id: 'user-1',
      role: 'manager',
      clinic_id: 'clinic-1',
      clinic_name: '新宿院',
      username: 'sato@example.com',
      profile_email: 'sato@example.com',
      profile_name: '佐藤 花子',
      created_at: '2026-04-24T00:00:00.000Z',
    });
  });

  test('permission filter matching follows the current list filters', () => {
    const permission = {
      id: 'permission-1',
      user_id: 'user-1',
      role: 'manager',
      clinic_id: 'clinic-1',
      clinic_name: '新宿院',
      username: 'sato@example.com',
      profile_email: 'sato@example.com',
      profile_name: '佐藤 花子',
      created_at: null,
    };

    expect(
      permissionMatchesFilters(permission, {
        role: 'manager',
        clinicId: 'clinic-1',
        search: '花子',
      })
    ).toBe(true);
    expect(
      permissionMatchesFilters(permission, {
        role: 'staff',
        clinicId: 'clinic-1',
        search: '花子',
      })
    ).toBe(false);
  });

  test('clinic_admin role options are limited to staff-manageable roles', () => {
    expect(CLINIC_ADMIN_ASSIGNABLE_ROLES).toEqual([
      'manager',
      'therapist',
      'staff',
    ]);
    expect(getAssignableAdminUserRoleOptions('clinic_admin').map(o => o.value))
      .toEqual(['manager', 'therapist', 'staff']);
    expect(getAssignableAdminUserRoleOptions('admin').map(o => o.value)).toEqual(
      ['admin', 'clinic_admin', 'manager', 'therapist', 'staff']
    );
  });

  test('clinic_admin cannot manage admin or clinic_admin permission rows', () => {
    expect(canClinicAdminManagePermissionRole('manager')).toBe(true);
    expect(canClinicAdminManagePermissionRole('therapist')).toBe(true);
    expect(canClinicAdminManagePermissionRole('staff')).toBe(true);
    expect(canClinicAdminManagePermissionRole('clinic_admin')).toBe(false);
    expect(canClinicAdminManagePermissionRole('admin')).toBe(false);
  });
});
