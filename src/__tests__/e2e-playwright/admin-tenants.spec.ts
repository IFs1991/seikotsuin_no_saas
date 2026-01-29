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

describeOrSkip('E2E-1: admin clinic management', () => {
  let testClinicId: string | null = null;
  const testClinicName = `E2E Test Clinic ${generateTestId()}`;

  test.afterAll(async () => {
    if (!testClinicId) return;
    const result = await createAdminClient();
    if (result) {
      await result.client
        .from('clinics')
        .update({ is_active: false })
        .eq('id', testClinicId);
    }
  });

  test('admin can create a clinic', async () => {
    const result = await createAdminClient();

    if (!result) {
      console.warn('Admin authentication failed');
      return;
    }

    const { data, error } = await result.client
      .from('clinics')
      .insert({
        name: testClinicName,
        address: 'E2E Test Address',
        phone_number: '03-1234-5678',
        is_active: true,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.name).toBe(testClinicName);
    expect(data?.is_active).toBe(true);

    testClinicId = data?.id ?? null;
  });

  test('created clinic appears in list', async () => {
    if (!testClinicId) {
      console.warn('No clinic created by previous test');
      return;
    }

    const result = await createAdminClient();
    if (!result) return;

    const { data, error } = await result.client
      .from('clinics')
      .select('id, name, is_active')
      .eq('id', testClinicId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.name).toBe(testClinicName);
  });

  test('admin can update a clinic', async () => {
    if (!testClinicId) {
      console.warn('Clinic not created yet');
      return;
    }

    const result = await createAdminClient();
    if (!result) return;

    const updatedName = `${testClinicName} (Updated)`;
    const { data, error } = await result.client
      .from('clinics')
      .update({
        name: updatedName,
        address: 'E2E Address (Updated)',
      })
      .eq('id', testClinicId)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.name).toBe(updatedName);
  });

  test('admin can deactivate and reactivate a clinic', async () => {
    if (!testClinicId) {
      console.warn('Clinic not created yet');
      return;
    }

    const result = await createAdminClient();
    if (!result) return;

    const { data: deactivated, error: deactivateError } = await result.client
      .from('clinics')
      .update({ is_active: false })
      .eq('id', testClinicId)
      .select()
      .single();

    expect(deactivateError).toBeNull();
    expect(deactivated).not.toBeNull();
    expect(deactivated?.is_active).toBe(false);

    const { data: activated, error: activateError } = await result.client
      .from('clinics')
      .update({ is_active: true })
      .eq('id', testClinicId)
      .select()
      .single();

    expect(activateError).toBeNull();
    expect(activated).not.toBeNull();
    expect(activated?.is_active).toBe(true);
  });

  test('therapist cannot create or update clinics', async () => {
    const result = await createTherapistClient();

    if (!result) {
      console.warn('Therapist authentication failed');
      return;
    }

    const { data, error } = await result.client
      .from('clinics')
      .insert({
        name: `Unauthorized Clinic ${generateTestId()}`,
        is_active: true,
      })
      .select()
      .single();

    expect(error).not.toBeNull();
    expect(data).toBeNull();

    if (!testClinicId) {
      console.warn('Clinic not created yet');
      return;
    }

    await result.client
      .from('clinics')
      .update({ name: 'Unauthorized Update' })
      .eq('id', testClinicId);

    const adminResult = await createAdminClient();
    if (adminResult) {
      const { data: check } = await adminResult.client
        .from('clinics')
        .select('name')
        .eq('id', testClinicId)
        .single();

      expect(check?.name).not.toBe('Unauthorized Update');
    }
  });
});
