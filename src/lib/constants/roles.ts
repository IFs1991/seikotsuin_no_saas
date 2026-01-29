// src/lib/constants/roles.ts

/**
 * Role type union for type safety
 * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
 */
export type Role =
  | 'admin'
  | 'clinic_admin'
  | 'manager'
  | 'therapist'
  | 'staff'
  | 'customer';

/**
 * HQ roles - can access cross-clinic data and admin features
 */
export const HQ_ROLES: ReadonlySet<Role> = new Set(['admin']);

/**
 * Admin UI roles - can access /admin/** routes
 */
export const ADMIN_UI_ROLES: ReadonlySet<Role> = new Set([
  'admin',
  'clinic_admin',
]);

/**
 * Cross-clinic roles - can view data across clinics (HQ view)
 */
export const CROSS_CLINIC_ROLES: ReadonlySet<Role> = new Set(['admin']);

/**
 * Clinic admin roles - can manage clinic settings
 */
export const CLINIC_ADMIN_ROLES: ReadonlySet<Role> = new Set([
  'admin',
  'clinic_admin',
  'manager',
]);

/**
 * Staff roles - can view/edit patient and reservation data
 */
export const STAFF_ROLES: ReadonlySet<Role> = new Set([
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
]);

/**
 * Check if role has HQ (headquarters) privileges
 */
export function isHQRole(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && HQ_ROLES.has(role as Role);
}

/**
 * Check if role can access admin UI
 */
export function canAccessAdminUI(role: string | null | undefined): boolean {
  return (
    role !== null && role !== undefined && ADMIN_UI_ROLES.has(role as Role)
  );
}

/**
 * Check if role can access cross-clinic data
 */
export function canAccessCrossClinic(role: string | null | undefined): boolean {
  return (
    role !== null && role !== undefined && CROSS_CLINIC_ROLES.has(role as Role)
  );
}

/**
 * Check if role can manage clinic settings
 */
export function canManageClinicSettings(
  role: string | null | undefined
): boolean {
  return (
    role !== null && role !== undefined && CLINIC_ADMIN_ROLES.has(role as Role)
  );
}

/**
 * Check if role is a staff role (can access patient/reservation data)
 */
export function isStaffRole(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && STAFF_ROLES.has(role as Role);
}

/**
 * Deprecated role mappings for backward compatibility (Option B-1)
 * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md Phase 2
 * These mappings will be removed after Phase 3 data migration.
 */
const DEPRECATED_ROLE_MAPPING: Record<string, Role> = {
  clinic_manager: 'clinic_admin',
};

/**
 * Normalize a role to canonical form.
 * Maps deprecated roles (e.g., 'clinic_manager') to their canonical equivalents.
 * @param role - The role string from database or JWT
 * @returns The canonical role, or the original value if no mapping exists
 */
export function normalizeRole(role: string | null | undefined): string | null {
  if (role === null || role === undefined) {
    return null;
  }
  return DEPRECATED_ROLE_MAPPING[role] ?? role;
}

/**
 * Check if role can access admin UI (with compatibility mapping)
 */
export function canAccessAdminUIWithCompat(
  role: string | null | undefined
): boolean {
  const normalized = normalizeRole(role);
  return normalized !== null && ADMIN_UI_ROLES.has(normalized as Role);
}

/**
 * Check if role can access cross-clinic data (with compatibility mapping)
 */
export function canAccessCrossClinicWithCompat(
  role: string | null | undefined
): boolean {
  const normalized = normalizeRole(role);
  return normalized !== null && CROSS_CLINIC_ROLES.has(normalized as Role);
}

/**
 * Check if role can manage clinic settings (with compatibility mapping)
 */
export function canManageClinicSettingsWithCompat(
  role: string | null | undefined
): boolean {
  const normalized = normalizeRole(role);
  return normalized !== null && CLINIC_ADMIN_ROLES.has(normalized as Role);
}
