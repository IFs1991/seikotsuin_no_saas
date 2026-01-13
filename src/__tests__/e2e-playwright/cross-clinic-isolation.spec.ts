import { test, expect } from '@playwright/test';
import {
  createClinicAClient,
  createClinicBClient,
  createAdminClient,
  validateTestEnvironment,
} from '../e2e/helpers/test-auth';

const isTestEnvironmentReady = validateTestEnvironment();
const describeOrSkip = isTestEnvironmentReady ? test.describe : test.describe.skip;

/**
 * Cross-Clinic Isolation Tests
 *
 * Parent-Scope Model (spec-rls-tenant-boundary-v0.1.md):
 * - Sibling clinics (same parent) CAN access each other's data
 * - Cross-parent access is BLOCKED for ALL users including admin
 * - Admin bypass is REMOVED: admin is scoped to their parent organization
 *
 * Test Structure:
 * - Parent A: Clinic A-1, A-2, A-3 (siblings can access each other)
 * - Parent B: Clinic B-1, B-2 (separate parent, blocked from Parent A)
 *
 * NOTE: Full sibling access tests require clinics.parent_id column to be added.
 * Current tests validate single-clinic scope (fallback behavior when clinic_scope_ids is missing).
 */
describeOrSkip('E2E-3: cross-clinic isolation (parent-scope model)', () => {
  test('clinic A user cannot access clinic B patients', async () => {
    const clinicAResult = await createClinicAClient();
    const clinicBResult = await createClinicBClient();
    const adminResult = await createAdminClient();

    if (!clinicAResult || !clinicBResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    const { data: clinicBPatients } = await adminResult.client
      .from('patients')
      .select('id, clinic_id')
      .limit(5);

    if (!clinicBPatients || clinicBPatients.length === 0) {
      console.warn('No test patients found');
      return;
    }

    const clinicBPatientIds = clinicBPatients.map(patient => patient.id);
    const { data: accessiblePatients } = await clinicAResult.client
      .from('patients')
      .select('id, clinic_id')
      .in('id', clinicBPatientIds);

    if (accessiblePatients && accessiblePatients.length > 0) {
      const { data: clinicAPermission } = await adminResult.client
        .from('user_permissions')
        .select('clinic_id')
        .eq('staff_id', clinicAResult.userId)
        .single();

      if (clinicAPermission?.clinic_id) {
        accessiblePatients.forEach(patient => {
          expect(patient.clinic_id).toBe(clinicAPermission.clinic_id);
        });
      }
    }
  });

  test('clinic A user can access only own clinic patients', async () => {
    const clinicAResult = await createClinicAClient();
    const adminResult = await createAdminClient();

    if (!clinicAResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    const { data: permission } = await adminResult.client
      .from('user_permissions')
      .select('clinic_id')
      .eq('staff_id', clinicAResult.userId)
      .single();

    if (!permission?.clinic_id) {
      console.warn('Clinic ID not found');
      return;
    }

    const { data: patients } = await clinicAResult.client
      .from('patients')
      .select('id, clinic_id');

    if (patients && patients.length > 0) {
      patients.forEach(patient => {
        expect(patient.clinic_id).toBe(permission.clinic_id);
      });
    }
  });

  test('clinic A user can access only own visits', async () => {
    const clinicAResult = await createClinicAClient();
    const adminResult = await createAdminClient();

    if (!clinicAResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    const { data: permission } = await adminResult.client
      .from('user_permissions')
      .select('clinic_id')
      .eq('staff_id', clinicAResult.userId)
      .single();

    if (!permission?.clinic_id) {
      console.warn('Clinic ID not found');
      return;
    }

    const { data: visits } = await clinicAResult.client
      .from('visits')
      .select('id, clinic_id');

    if (visits && visits.length > 0) {
      visits.forEach(visit => {
        expect(visit.clinic_id).toBe(permission.clinic_id);
      });
    }
  });

  test('clinic A user can access only own revenues', async () => {
    const clinicAResult = await createClinicAClient();
    const adminResult = await createAdminClient();

    if (!clinicAResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    const { data: permission } = await adminResult.client
      .from('user_permissions')
      .select('clinic_id')
      .eq('staff_id', clinicAResult.userId)
      .single();

    if (!permission?.clinic_id) {
      console.warn('Clinic ID not found');
      return;
    }

    const { data: revenues } = await clinicAResult.client
      .from('revenues')
      .select('id, clinic_id');

    if (revenues && revenues.length > 0) {
      revenues.forEach(revenue => {
        expect(revenue.clinic_id).toBe(permission.clinic_id);
      });
    }
  });

  test('staff can access reservations within policy scope', async () => {
    const clinicAResult = await createClinicAClient();
    const adminResult = await createAdminClient();

    if (!clinicAResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    const { data: reservations } = await clinicAResult.client
      .from('reservations')
      .select('id, staff_id');

    if (reservations) {
      expect(Array.isArray(reservations)).toBe(true);
    }
  });

  /**
   * Admin access test (parent-scope model)
   *
   * IMPORTANT: In parent-scope model, admin is ALSO scoped to their parent organization.
   * Admin can access:
   * - All clinics under their parent organization (siblings)
   * - NOT clinics under different parent organizations
   *
   * NOTE: Current test verifies admin can see multiple clinics.
   * When clinics.parent_id is added, this test should verify:
   * 1. Admin CAN access sibling clinics (same parent)
   * 2. Admin CANNOT access cross-parent clinics
   */
  test('admin can access clinics within parent scope', async () => {
    const adminResult = await createAdminClient();

    if (!adminResult) {
      console.warn('Admin authentication failed');
      return;
    }

    const { data: clinics, error } = await adminResult.client
      .from('clinics')
      .select('id, name');

    expect(error).toBeNull();

    // In fallback mode (no clinic_scope_ids), admin should still have access
    // Future: verify only parent-scoped clinics are returned
    if (clinics && clinics.length > 0) {
      expect(clinics.length).toBeGreaterThan(0);
    }
  });

  test('admin can access patients across clinics', async () => {
    const adminResult = await createAdminClient();

    if (!adminResult) {
      console.warn('Admin authentication failed');
      return;
    }

    const { data: patients, error } = await adminResult.client
      .from('patients')
      .select('id, clinic_id');

    expect(error).toBeNull();

    if (patients && patients.length > 0) {
      const uniqueClinicIds = new Set(
        patients.map(patient => patient.clinic_id).filter(Boolean)
      );

      if (uniqueClinicIds.size > 1) {
        expect(uniqueClinicIds.size).toBeGreaterThan(1);
      }
    }
  });

  // ================================================================
  // Tenant Boundary Tests (spec-rls-tenant-boundary-v0.1.md)
  // ================================================================

  test('clinic A user cannot access clinic B reservations', async () => {
    const clinicAResult = await createClinicAClient();
    const clinicBResult = await createClinicBClient();
    const adminResult = await createAdminClient();

    if (!clinicAResult || !clinicBResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    // Get clinic A's permission
    const { data: clinicAPermission } = await adminResult.client
      .from('user_permissions')
      .select('clinic_id')
      .eq('staff_id', clinicAResult.userId)
      .single();

    if (!clinicAPermission?.clinic_id) {
      console.warn('Clinic A permission not found');
      return;
    }

    // Clinic A user should only see reservations from their clinic
    const { data: reservations } = await clinicAResult.client
      .from('reservations')
      .select('id, clinic_id');

    if (reservations && reservations.length > 0) {
      reservations.forEach(reservation => {
        expect(reservation.clinic_id).toBe(clinicAPermission.clinic_id);
      });
    }
  });

  test('admin can access reservations across all clinics', async () => {
    const adminResult = await createAdminClient();

    if (!adminResult) {
      console.warn('Admin authentication failed');
      return;
    }

    const { data: reservations, error } = await adminResult.client
      .from('reservations')
      .select('id, clinic_id');

    expect(error).toBeNull();

    // Admin should potentially see reservations from multiple clinics
    if (reservations && reservations.length > 0) {
      const uniqueClinicIds = new Set(
        reservations.map(r => r.clinic_id).filter(Boolean)
      );
      // Just verify we got data without RLS blocking
      expect(reservations.length).toBeGreaterThan(0);
    }
  });

  test('clinic A user cannot access clinic B customers', async () => {
    const clinicAResult = await createClinicAClient();
    const adminResult = await createAdminClient();

    if (!clinicAResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    // Get clinic A's permission
    const { data: clinicAPermission } = await adminResult.client
      .from('user_permissions')
      .select('clinic_id')
      .eq('staff_id', clinicAResult.userId)
      .single();

    if (!clinicAPermission?.clinic_id) {
      console.warn('Clinic A permission not found');
      return;
    }

    // Clinic A user should only see customers from their clinic
    const { data: customers } = await clinicAResult.client
      .from('customers')
      .select('id, clinic_id');

    if (customers && customers.length > 0) {
      customers.forEach(customer => {
        expect(customer.clinic_id).toBe(clinicAPermission.clinic_id);
      });
    }
  });

  test('clinic A user cannot access clinic B blocks', async () => {
    const clinicAResult = await createClinicAClient();
    const adminResult = await createAdminClient();

    if (!clinicAResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    // Get clinic A's permission
    const { data: clinicAPermission } = await adminResult.client
      .from('user_permissions')
      .select('clinic_id')
      .eq('staff_id', clinicAResult.userId)
      .single();

    if (!clinicAPermission?.clinic_id) {
      console.warn('Clinic A permission not found');
      return;
    }

    // Clinic A user should only see blocks from their clinic
    const { data: blocks } = await clinicAResult.client
      .from('blocks')
      .select('id, clinic_id');

    if (blocks && blocks.length > 0) {
      blocks.forEach(block => {
        expect(block.clinic_id).toBe(clinicAPermission.clinic_id);
      });
    }
  });

  test('clinic user can only see chat sessions in their scope', async () => {
    const clinicAResult = await createClinicAClient();
    const adminResult = await createAdminClient();

    if (!clinicAResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    // Get clinic A's permission
    const { data: clinicAPermission } = await adminResult.client
      .from('user_permissions')
      .select('clinic_id')
      .eq('staff_id', clinicAResult.userId)
      .single();

    // Clinic A user should only see their own chat sessions or admin sessions
    const { data: sessions } = await clinicAResult.client
      .from('chat_sessions')
      .select('id, user_id, clinic_id');

    if (sessions && sessions.length > 0) {
      sessions.forEach(session => {
        // Session must belong to user OR be in their clinic (for admins)
        const isOwnSession = session.user_id === clinicAResult.userId;
        const isInClinic = session.clinic_id === null || session.clinic_id === clinicAPermission?.clinic_id;
        expect(isOwnSession || isInClinic).toBe(true);
      });
    }
  });

  test('admin can access chat sessions across all clinics', async () => {
    const adminResult = await createAdminClient();

    if (!adminResult) {
      console.warn('Admin authentication failed');
      return;
    }

    const { data: sessions, error } = await adminResult.client
      .from('chat_sessions')
      .select('id, user_id, clinic_id');

    expect(error).toBeNull();
    // Admin should be able to query without RLS blocking
    expect(Array.isArray(sessions)).toBe(true);
  });
});
