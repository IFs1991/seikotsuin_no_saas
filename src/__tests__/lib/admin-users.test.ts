import {
  CLINIC_FILTER_ALL,
  ROLE_FILTER_ALL,
  buildPermissionFilters,
  createAssignPermissionPayload,
  createPermissionFormState,
  createUpdatePermissionPayload,
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

  test('user id is required for permission assignment', () => {
    expect(
      validatePermissionForm({
        user_id: '   ',
        role: 'clinic_admin',
        clinic_id: 'clinic-1',
      })
    ).toBe('Supabase Auth ユーザーIDを入力してください');
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
});
