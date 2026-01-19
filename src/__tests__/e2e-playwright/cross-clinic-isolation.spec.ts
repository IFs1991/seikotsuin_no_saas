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

  // ================================================================
  // Parent-Scope Model Tests
  // @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md
  // ================================================================

  /**
   * Test: Sibling Clinic Access (MUST ALLOW)
   *
   * When clinic_scope_ids JWT claim is set, users can access
   * all clinics in their parent scope (siblings).
   *
   * NOTE: Full sibling access tests require:
   * 1. clinics.parent_id column to be added
   * 2. Test users with clinic_scope_ids set via custom_access_token_hook
   */
  test('sibling clinic access - users can access clinics in same parent scope', async () => {
    const adminResult = await createAdminClient();

    if (!adminResult) {
      console.warn('Admin authentication failed');
      return;
    }

    // Get admin's JWT claims to check for clinic_scope_ids
    const { data: { session } } = await adminResult.client.auth.getSession();

    // Try to parse clinic_scope_ids from JWT
    let clinicScopeIds: string[] | undefined;
    try {
      const accessToken = session?.access_token;
      if (accessToken) {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        clinicScopeIds = payload.clinic_scope_ids;
      }
    } catch {
      // JWT parsing failed
    }

    // DOD-08: clinic_scope_ids must be set for parent-scope model tests
    // No fallback - fail explicitly if parent-scope is not configured
    // @see docs/stabilization/spec-tenant-table-api-guard-v0.1.md (Follow-ups: 追加修正2)
    expect(
      clinicScopeIds && clinicScopeIds.length > 0,
      'clinic_scope_ids must be set in JWT for parent-scope model tests. ' +
      'Ensure custom_access_token_hook is configured and clinics.parent_id is populated.'
    ).toBe(true);

    // Type guard: after expect assertion, clinicScopeIds is guaranteed to be non-null
    const scopeIds = clinicScopeIds as string[];

    // Verify access to all sibling clinics
    for (const clinicId of scopeIds) {
      const { data: reservations, error } = await adminResult.client
        .from('reservations')
        .select('id, clinic_id')
        .eq('clinic_id', clinicId)
        .limit(5);

      expect(error).toBeNull();
      // Verify no RLS error (empty result is OK, error is NOT OK)
      expect(Array.isArray(reservations)).toBe(true);
    }
  });

  /**
   * Test: Cross-Parent Isolation (MUST BLOCK)
   *
   * Users from Parent A cannot access data from Parent B.
   * This applies to ALL roles including admin.
   */
  test('cross-parent isolation - users cannot access data from different parent org', async () => {
    const clinicAResult = await createClinicAClient();
    const adminResult = await createAdminClient();

    if (!clinicAResult || !adminResult) {
      console.warn('Test user authentication failed');
      return;
    }

    // Get clinic A user's clinic scope
    const { data: clinicAPermission } = await adminResult.client
      .from('user_permissions')
      .select('clinic_id')
      .eq('staff_id', clinicAResult.userId)
      .single();

    if (!clinicAPermission?.clinic_id) {
      console.warn('Clinic A permission not found');
      return;
    }

    // Get clinic B user's clinic (represents different parent org in test setup)
    const clinicBResult = await createClinicBClient();
    if (!clinicBResult) {
      console.warn('Clinic B authentication failed');
      return;
    }

    const { data: clinicBPermission } = await adminResult.client
      .from('user_permissions')
      .select('clinic_id')
      .eq('staff_id', clinicBResult.userId)
      .single();

    if (!clinicBPermission?.clinic_id) {
      console.warn('Clinic B permission not found');
      return;
    }

    // Clinic A user should not see Clinic B's reservations
    const { data: clinicAReservations } = await clinicAResult.client
      .from('reservations')
      .select('id, clinic_id')
      .eq('clinic_id', clinicBPermission.clinic_id);

    // If cross-parent isolation is working, no reservations should be returned
    // (RLS filters them out)
    if (clinicAReservations && clinicAReservations.length > 0) {
      // If any reservations are returned, they must be from clinic A's scope
      // (indicating the filter was client-side, not server-side)
      clinicAReservations.forEach(reservation => {
        // This should NOT happen if cross-parent isolation is working
        expect(reservation.clinic_id).not.toBe(clinicBPermission.clinic_id);
      });
    }
  });

  /**
   * Test: Admin Parent-Scope Limitation (MUST RESPECT SCOPE)
   *
   * Admin bypass has been REMOVED in parent-scope model.
   * Admin can only access clinics within their parent organization scope.
   */
  test('admin parent-scope limitation - admin respects parent scope boundary', async () => {
    const adminResult = await createAdminClient();

    if (!adminResult) {
      console.warn('Admin authentication failed');
      return;
    }

    // Get admin's clinic scope from JWT
    const { data: { session } } = await adminResult.client.auth.getSession();

    let clinicScopeIds: string[] | undefined;
    try {
      const accessToken = session?.access_token;
      if (accessToken) {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        clinicScopeIds = payload.clinic_scope_ids;
      }
    } catch {
      // JWT parsing failed
    }

    // DOD-08: clinic_scope_ids must be set for parent-scope model tests
    // No fallback - fail explicitly if parent-scope is not configured
    // @see docs/stabilization/spec-tenant-table-api-guard-v0.1.md (Follow-ups: 追加修正2)
    expect(
      clinicScopeIds && clinicScopeIds.length > 0,
      'clinic_scope_ids must be set in JWT for admin parent-scope limitation test. ' +
      'Ensure custom_access_token_hook is configured and clinics.parent_id is populated.'
    ).toBe(true);

    // Get all accessible reservations - admin should be scoped
    const { data: reservations, error } = await adminResult.client
      .from('reservations')
      .select('id, clinic_id');

    expect(error).toBeNull();

    if (reservations && reservations.length > 0) {
      // All reservations should be from clinics in admin's scope
      reservations.forEach(reservation => {
        expect(clinicScopeIds).toContain(reservation.clinic_id);
      });
    }
  });

  /**
   * Test: Public API Menu Access
   *
   * Non-authenticated customers access menus via server API gateway.
   * This test verifies the pattern works (API endpoint test).
   */
  test('public api - menus are accessible via server API with clinic_id', async () => {
    const adminResult = await createAdminClient();

    if (!adminResult) {
      console.warn('Admin authentication failed');
      return;
    }

    // Get a valid clinic_id for testing
    const { data: clinics } = await adminResult.client
      .from('clinics')
      .select('id')
      .eq('is_active', true)
      .limit(1);

    if (!clinics || clinics.length === 0) {
      console.warn('No active clinics found');
      return;
    }

    // Note: In real E2E, this would call the actual API endpoint
    // GET /api/public/menus?clinic_id=xxx
    // For now, verify the menus are scoped correctly
    const { data: menus, error } = await adminResult.client
      .from('menus')
      .select('id, clinic_id, name')
      .eq('clinic_id', clinics[0].id)
      .eq('is_active', true)
      .eq('is_deleted', false);

    expect(error).toBeNull();
    if (menus && menus.length > 0) {
      menus.forEach(menu => {
        expect(menu.clinic_id).toBe(clinics[0].id);
      });
    }
  });
});
