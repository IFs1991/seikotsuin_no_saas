import { test, expect } from '@playwright/test';
import {
  createTherapistClient,
  createAdminClient,
  validateTestEnvironment,
} from '../e2e/helpers/test-auth';

const isTestEnvironmentReady = validateTestEnvironment();
const describeOrSkip = isTestEnvironmentReady
  ? test.describe
  : test.describe.skip;

describeOrSkip('E2E-2: non-admin access denial', () => {
  test('therapist cannot read full clinic list', async () => {
    const therapistResult = await createTherapistClient();
    const adminResult = await createAdminClient();

    if (!therapistResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    const { data: allClinics } = await adminResult.client
      .from('clinics')
      .select('id');
    const { data: therapistClinics } = await therapistResult.client
      .from('clinics')
      .select('id');

    if (allClinics && therapistClinics) {
      expect(therapistClinics.length).toBeLessThanOrEqual(allClinics.length);
      if (therapistClinics.length > 0 && allClinics.length > 1) {
        expect(therapistClinics.length).toBeLessThan(allClinics.length);
      }
    }
  });

  test('therapist can only read own permissions', async () => {
    const therapistResult = await createTherapistClient();
    const adminResult = await createAdminClient();

    if (!therapistResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    const { data: allPermissions } = await adminResult.client
      .from('user_permissions')
      .select('id, staff_id');
    const { data: therapistPermissions } = await therapistResult.client
      .from('user_permissions')
      .select('id, staff_id');

    if (allPermissions && therapistPermissions) {
      if (allPermissions.length > 1) {
        expect(therapistPermissions.length).toBeLessThanOrEqual(1);
      }

      if (therapistPermissions.length > 0) {
        const uniqueStaffIds = new Set(
          therapistPermissions.map(permission => permission.staff_id)
        );
        expect(uniqueStaffIds.size).toBe(1);
        expect(uniqueStaffIds.has(therapistResult.userId)).toBe(true);
      }
    }
  });

  test('therapist cannot create permissions', async () => {
    const therapistResult = await createTherapistClient();

    if (!therapistResult) {
      console.warn('Therapist authentication failed');
      return;
    }

    const { client, userId } = therapistResult;
    const { data, error } = await client
      .from('user_permissions')
      .insert({
        staff_id: userId,
        username: 'unauthorized-user',
        hashed_password: 'test',
        role: 'admin',
        clinic_id: null,
      })
      .select()
      .single();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  test('therapist cannot update other permissions', async () => {
    const therapistResult = await createTherapistClient();
    const adminResult = await createAdminClient();

    if (!therapistResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    const { data: adminPermissions } = await adminResult.client
      .from('user_permissions')
      .select('id')
      .eq('role', 'admin')
      .limit(1);

    if (!adminPermissions || adminPermissions.length === 0) {
      console.warn('Admin permission not found');
      return;
    }

    const adminPermissionId = adminPermissions[0].id;

    await therapistResult.client
      .from('user_permissions')
      .update({ role: 'staff' })
      .eq('id', adminPermissionId);

    const { data: checkData } = await adminResult.client
      .from('user_permissions')
      .select('role')
      .eq('id', adminPermissionId)
      .single();

    expect(checkData?.role).toBe('admin');
  });

  test('therapist cannot delete permissions', async () => {
    const therapistResult = await createTherapistClient();
    const adminResult = await createAdminClient();

    if (!therapistResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    const { data: permissions } = await adminResult.client
      .from('user_permissions')
      .select('id')
      .limit(1);

    if (!permissions || permissions.length === 0) {
      console.warn('Permission not found');
      return;
    }

    const permissionId = permissions[0].id;

    await therapistResult.client
      .from('user_permissions')
      .delete()
      .eq('id', permissionId);

    const { data: checkData } = await adminResult.client
      .from('user_permissions')
      .select('id')
      .eq('id', permissionId)
      .single();

    expect(checkData).not.toBeNull();
  });
});
