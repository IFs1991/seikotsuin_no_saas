/**
 * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
 * Unit tests for centralized role definitions
 */

import {
  Role,
  HQ_ROLES,
  ADMIN_UI_ROLES,
  CROSS_CLINIC_ROLES,
  CLINIC_ADMIN_ROLES,
  STAFF_ROLES,
  isHQRole,
  canAccessAdminUI,
  canAccessCrossClinic,
  canManageClinicSettings,
  isStaffRole,
  normalizeRole,
  canAccessAdminUIWithCompat,
  canAccessCrossClinicWithCompat,
  canManageClinicSettingsWithCompat,
} from '@/lib/constants/roles';

describe('Role Constants', () => {
  describe('HQ_ROLES', () => {
    it('should contain only admin', () => {
      expect(HQ_ROLES.has('admin')).toBe(true);
      expect(HQ_ROLES.size).toBe(1);
    });

    it('should not contain clinic_admin', () => {
      expect(HQ_ROLES.has('clinic_admin')).toBe(false);
    });
  });

  describe('ADMIN_UI_ROLES', () => {
    it('should contain admin and clinic_admin', () => {
      expect(ADMIN_UI_ROLES.has('admin')).toBe(true);
      expect(ADMIN_UI_ROLES.has('clinic_admin')).toBe(true);
      expect(ADMIN_UI_ROLES.size).toBe(2);
    });

    it('should not contain deprecated clinic_manager', () => {
      expect(ADMIN_UI_ROLES.has('clinic_manager' as Role)).toBe(false);
    });

    it('should not contain manager', () => {
      expect(ADMIN_UI_ROLES.has('manager')).toBe(false);
    });
  });

  describe('CROSS_CLINIC_ROLES', () => {
    it('should contain only admin', () => {
      expect(CROSS_CLINIC_ROLES.has('admin')).toBe(true);
      expect(CROSS_CLINIC_ROLES.size).toBe(1);
    });
  });

  describe('CLINIC_ADMIN_ROLES', () => {
    it('should contain admin, clinic_admin, and manager', () => {
      expect(CLINIC_ADMIN_ROLES.has('admin')).toBe(true);
      expect(CLINIC_ADMIN_ROLES.has('clinic_admin')).toBe(true);
      expect(CLINIC_ADMIN_ROLES.has('manager')).toBe(true);
      expect(CLINIC_ADMIN_ROLES.size).toBe(3);
    });

    it('should not contain therapist or staff', () => {
      expect(CLINIC_ADMIN_ROLES.has('therapist')).toBe(false);
      expect(CLINIC_ADMIN_ROLES.has('staff')).toBe(false);
    });
  });

  describe('STAFF_ROLES', () => {
    it('should contain all staff-level roles', () => {
      expect(STAFF_ROLES.has('admin')).toBe(true);
      expect(STAFF_ROLES.has('clinic_admin')).toBe(true);
      expect(STAFF_ROLES.has('manager')).toBe(true);
      expect(STAFF_ROLES.has('therapist')).toBe(true);
      expect(STAFF_ROLES.has('staff')).toBe(true);
      expect(STAFF_ROLES.size).toBe(5);
    });

    it('should not contain customer', () => {
      expect(STAFF_ROLES.has('customer')).toBe(false);
    });
  });
});

describe('Role Helper Functions', () => {
  describe('isHQRole', () => {
    it('should return true for admin', () => {
      expect(isHQRole('admin')).toBe(true);
    });

    it('should return false for clinic_admin', () => {
      expect(isHQRole('clinic_admin')).toBe(false);
    });

    it('should return false for manager', () => {
      expect(isHQRole('manager')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isHQRole(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isHQRole(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isHQRole('')).toBe(false);
    });
  });

  describe('canAccessAdminUI', () => {
    it('should return true for admin', () => {
      expect(canAccessAdminUI('admin')).toBe(true);
    });

    it('should return true for clinic_admin', () => {
      expect(canAccessAdminUI('clinic_admin')).toBe(true);
    });

    it('should return false for manager', () => {
      expect(canAccessAdminUI('manager')).toBe(false);
    });

    it('should return false for therapist', () => {
      expect(canAccessAdminUI('therapist')).toBe(false);
    });

    it('should return false for staff', () => {
      expect(canAccessAdminUI('staff')).toBe(false);
    });

    it('should return false for null', () => {
      expect(canAccessAdminUI(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(canAccessAdminUI(undefined)).toBe(false);
    });
  });

  describe('canAccessCrossClinic', () => {
    it('should return true for admin', () => {
      expect(canAccessCrossClinic('admin')).toBe(true);
    });

    it('should return false for clinic_admin', () => {
      expect(canAccessCrossClinic('clinic_admin')).toBe(false);
    });

    it('should return false for null', () => {
      expect(canAccessCrossClinic(null)).toBe(false);
    });
  });

  describe('canManageClinicSettings', () => {
    it('should return true for admin', () => {
      expect(canManageClinicSettings('admin')).toBe(true);
    });

    it('should return true for clinic_admin', () => {
      expect(canManageClinicSettings('clinic_admin')).toBe(true);
    });

    it('should return true for manager', () => {
      expect(canManageClinicSettings('manager')).toBe(true);
    });

    it('should return false for therapist', () => {
      expect(canManageClinicSettings('therapist')).toBe(false);
    });

    it('should return false for staff', () => {
      expect(canManageClinicSettings('staff')).toBe(false);
    });

    it('should return false for null', () => {
      expect(canManageClinicSettings(null)).toBe(false);
    });
  });

  describe('isStaffRole', () => {
    it('should return true for all staff roles', () => {
      expect(isStaffRole('admin')).toBe(true);
      expect(isStaffRole('clinic_admin')).toBe(true);
      expect(isStaffRole('manager')).toBe(true);
      expect(isStaffRole('therapist')).toBe(true);
      expect(isStaffRole('staff')).toBe(true);
    });

    it('should return false for customer', () => {
      expect(isStaffRole('customer')).toBe(false);
    });

    it('should return false for invalid roles', () => {
      expect(isStaffRole('invalid_role')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isStaffRole(null)).toBe(false);
    });
  });
});

describe('Role Consistency (DoD-08)', () => {
  /**
   * This test verifies that role definitions are consistent
   * across the codebase per spec-auth-role-alignment-v0.1.md
   */
  it('ADMIN_UI_ROLES should be used for /admin/** route access', () => {
    // admin and clinic_admin can access admin UI
    expect(ADMIN_UI_ROLES.has('admin')).toBe(true);
    expect(ADMIN_UI_ROLES.has('clinic_admin')).toBe(true);

    // manager should NOT be able to access admin UI
    expect(ADMIN_UI_ROLES.has('manager')).toBe(false);
  });

  it('HQ_ROLES (admin only) can have clinic_id = null', () => {
    // Only admin is HQ role
    expect(HQ_ROLES.has('admin')).toBe(true);
    expect(HQ_ROLES.has('clinic_admin')).toBe(false);
    expect(HQ_ROLES.has('manager')).toBe(false);
  });

  it('CLINIC_ADMIN_ROLES should be used for clinic settings management', () => {
    expect(CLINIC_ADMIN_ROLES.has('admin')).toBe(true);
    expect(CLINIC_ADMIN_ROLES.has('clinic_admin')).toBe(true);
    expect(CLINIC_ADMIN_ROLES.has('manager')).toBe(true);
    expect(CLINIC_ADMIN_ROLES.has('therapist')).toBe(false);
  });

  it('deprecated clinic_manager role should not be in any role set', () => {
    const deprecatedRole = 'clinic_manager' as Role;
    expect(HQ_ROLES.has(deprecatedRole)).toBe(false);
    expect(ADMIN_UI_ROLES.has(deprecatedRole)).toBe(false);
    expect(CROSS_CLINIC_ROLES.has(deprecatedRole)).toBe(false);
    expect(CLINIC_ADMIN_ROLES.has(deprecatedRole)).toBe(false);
    expect(STAFF_ROLES.has(deprecatedRole)).toBe(false);
  });
});

describe('Compatibility Mapping Functions (Option B-1)', () => {
  /**
   * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md Phase 2
   * Tests for deprecated role compatibility mapping
   */
  describe('normalizeRole', () => {
    it('should map clinic_manager to clinic_admin', () => {
      expect(normalizeRole('clinic_manager')).toBe('clinic_admin');
    });

    it('should return canonical roles unchanged', () => {
      expect(normalizeRole('admin')).toBe('admin');
      expect(normalizeRole('clinic_admin')).toBe('clinic_admin');
      expect(normalizeRole('manager')).toBe('manager');
      expect(normalizeRole('therapist')).toBe('therapist');
      expect(normalizeRole('staff')).toBe('staff');
    });

    it('should return null for null input', () => {
      expect(normalizeRole(null)).toBe(null);
    });

    it('should return null for undefined input', () => {
      expect(normalizeRole(undefined)).toBe(null);
    });

    it('should return unknown roles unchanged', () => {
      expect(normalizeRole('unknown_role')).toBe('unknown_role');
    });
  });

  describe('canAccessAdminUIWithCompat', () => {
    it('should return true for admin', () => {
      expect(canAccessAdminUIWithCompat('admin')).toBe(true);
    });

    it('should return true for clinic_admin', () => {
      expect(canAccessAdminUIWithCompat('clinic_admin')).toBe(true);
    });

    it('should return true for deprecated clinic_manager (mapped to clinic_admin)', () => {
      expect(canAccessAdminUIWithCompat('clinic_manager')).toBe(true);
    });

    it('should return false for manager', () => {
      expect(canAccessAdminUIWithCompat('manager')).toBe(false);
    });

    it('should return false for null', () => {
      expect(canAccessAdminUIWithCompat(null)).toBe(false);
    });
  });

  describe('canAccessCrossClinicWithCompat', () => {
    it('should return true for admin', () => {
      expect(canAccessCrossClinicWithCompat('admin')).toBe(true);
    });

    it('should return false for clinic_admin', () => {
      expect(canAccessCrossClinicWithCompat('clinic_admin')).toBe(false);
    });

    it('should return false for deprecated clinic_manager (mapped to clinic_admin)', () => {
      expect(canAccessCrossClinicWithCompat('clinic_manager')).toBe(false);
    });

    it('should return false for null', () => {
      expect(canAccessCrossClinicWithCompat(null)).toBe(false);
    });
  });

  describe('canManageClinicSettingsWithCompat', () => {
    it('should return true for admin', () => {
      expect(canManageClinicSettingsWithCompat('admin')).toBe(true);
    });

    it('should return true for clinic_admin', () => {
      expect(canManageClinicSettingsWithCompat('clinic_admin')).toBe(true);
    });

    it('should return true for manager', () => {
      expect(canManageClinicSettingsWithCompat('manager')).toBe(true);
    });

    it('should return true for deprecated clinic_manager (mapped to clinic_admin)', () => {
      expect(canManageClinicSettingsWithCompat('clinic_manager')).toBe(true);
    });

    it('should return false for therapist', () => {
      expect(canManageClinicSettingsWithCompat('therapist')).toBe(false);
    });

    it('should return false for null', () => {
      expect(canManageClinicSettingsWithCompat(null)).toBe(false);
    });
  });
});
