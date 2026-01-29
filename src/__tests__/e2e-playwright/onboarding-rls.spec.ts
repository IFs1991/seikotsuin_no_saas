import { test, expect } from '@playwright/test';
import {
  createAdminClient,
  createTherapistClient,
  generateTestId,
  validateTestEnvironment,
} from '../e2e/helpers/test-auth';

const isTestEnvironmentReady = validateTestEnvironment();
const describeOrSkip = isTestEnvironmentReady
  ? test.describe
  : test.describe.skip;

describeOrSkip('Onboarding RLS policies', () => {
  let adminUserId: string | null = null;
  let therapistUserId: string | null = null;
  let testClinicId: string | null = null;

  test.beforeAll(async () => {
    const adminResult = await createAdminClient();
    if (adminResult) {
      adminUserId = adminResult.userId;
      const { data: clinic } = await adminResult.client
        .from('clinics')
        .insert({
          name: `Onboarding Test Clinic ${generateTestId()}`,
          is_active: true,
        })
        .select()
        .single();
      testClinicId = clinic?.id ?? null;
    }

    const therapistResult = await createTherapistClient();
    if (therapistResult) {
      therapistUserId = therapistResult.userId;
    }
  });

  test.afterAll(async () => {
    if (!testClinicId) return;
    const adminResult = await createAdminClient();
    if (adminResult) {
      await adminResult.client
        .from('clinics')
        .update({ is_active: false })
        .eq('id', testClinicId);
    }
  });

  test('user can create own onboarding state', async () => {
    const adminResult = await createAdminClient();
    if (!adminResult) {
      console.warn('Admin authentication failed');
      return;
    }

    const { data, error } = await adminResult.client
      .from('onboarding_states')
      .insert({
        user_id: adminResult.userId,
        current_step: 'profile',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.user_id).toBe(adminResult.userId);
    expect(data?.current_step).toBe('profile');

    if (data?.id) {
      await adminResult.client
        .from('onboarding_states')
        .delete()
        .eq('id', data.id);
    }
  });

  test('user can read own onboarding state', async () => {
    const adminResult = await createAdminClient();
    if (!adminResult) {
      console.warn('Admin authentication failed');
      return;
    }

    const { data: inserted } = await adminResult.client
      .from('onboarding_states')
      .insert({
        user_id: adminResult.userId,
        current_step: 'clinic',
      })
      .select()
      .single();

    const { data, error } = await adminResult.client
      .from('onboarding_states')
      .select('*')
      .eq('user_id', adminResult.userId);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every(row => row.user_id === adminResult.userId)).toBe(true);

    if (inserted?.id) {
      await adminResult.client
        .from('onboarding_states')
        .delete()
        .eq('id', inserted.id);
    }
  });

  test('user cannot read others onboarding state', async () => {
    const adminResult = await createAdminClient();
    const therapistResult = await createTherapistClient();

    if (!adminResult || !therapistResult) {
      console.warn('Test user authentication failed');
      return;
    }

    const { data: inserted } = await adminResult.client
      .from('onboarding_states')
      .insert({
        user_id: adminResult.userId,
        current_step: 'invites',
      })
      .select()
      .single();

    const { data, error } = await therapistResult.client
      .from('onboarding_states')
      .select('*')
      .eq('user_id', adminResult.userId);

    expect(error).toBeNull();
    expect(data?.length).toBe(0);

    if (inserted?.id) {
      await adminResult.client
        .from('onboarding_states')
        .delete()
        .eq('id', inserted.id);
    }
  });

  test('user can update own onboarding state', async () => {
    const adminResult = await createAdminClient();
    if (!adminResult) {
      console.warn('Admin authentication failed');
      return;
    }

    const { data: inserted } = await adminResult.client
      .from('onboarding_states')
      .insert({
        user_id: adminResult.userId,
        current_step: 'profile',
      })
      .select()
      .single();

    const { data, error } = await adminResult.client
      .from('onboarding_states')
      .update({ current_step: 'clinic' })
      .eq('id', inserted?.id)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.current_step).toBe('clinic');

    if (inserted?.id) {
      await adminResult.client
        .from('onboarding_states')
        .delete()
        .eq('id', inserted.id);
    }
  });

  test('inviter can create staff invite', async () => {
    const adminResult = await createAdminClient();
    if (!adminResult || !testClinicId) {
      console.warn('Test environment not ready');
      return;
    }

    const testEmail = `invite-test-${generateTestId()}@example.com`;

    const { data, error } = await adminResult.client
      .from('staff_invites')
      .insert({
        clinic_id: testClinicId,
        email: testEmail,
        role: 'staff',
        created_by: adminResult.userId,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.email).toBe(testEmail);
    expect(data?.created_by).toBe(adminResult.userId);

    if (data?.id) {
      await adminResult.client.from('staff_invites').delete().eq('id', data.id);
    }
  });

  test('non-inviter cannot delete staff invite', async () => {
    const adminResult = await createAdminClient();
    const therapistResult = await createTherapistClient();

    if (!adminResult || !therapistResult || !testClinicId) {
      console.warn('Test environment not ready');
      return;
    }

    const testEmail = `invite-test-${generateTestId()}@example.com`;

    const { data: inserted } = await adminResult.client
      .from('staff_invites')
      .insert({
        clinic_id: testClinicId,
        email: testEmail,
        role: 'staff',
        created_by: adminResult.userId,
      })
      .select()
      .single();

    await therapistResult.client
      .from('staff_invites')
      .delete()
      .eq('id', inserted?.id);

    const { data: stillExists } = await adminResult.client
      .from('staff_invites')
      .select('*')
      .eq('id', inserted?.id)
      .single();

    expect(stillExists).not.toBeNull();

    if (inserted?.id) {
      await adminResult.client
        .from('staff_invites')
        .delete()
        .eq('id', inserted.id);
    }
  });

  test('invite can be fetched by token', async () => {
    const adminResult = await createAdminClient();
    const therapistResult = await createTherapistClient();

    if (!adminResult || !therapistResult || !testClinicId) {
      console.warn('Test environment not ready');
      return;
    }

    const testEmail = `invite-test-${generateTestId()}@example.com`;

    const { data: inserted } = await adminResult.client
      .from('staff_invites')
      .insert({
        clinic_id: testClinicId,
        email: testEmail,
        role: 'staff',
        created_by: adminResult.userId,
      })
      .select()
      .single();

    const { data, error } = await therapistResult.client
      .from('staff_invites')
      .select('id, email, role, clinic_id')
      .eq('token', inserted?.token)
      .single();

    expect(error).toBeNull();
    expect(data?.email).toBe(testEmail);

    if (inserted?.id) {
      await adminResult.client
        .from('staff_invites')
        .delete()
        .eq('id', inserted.id);
    }
  });
});
