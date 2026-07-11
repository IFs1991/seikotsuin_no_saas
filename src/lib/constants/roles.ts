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

export const ROLE_VALUES = [
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
  'customer',
] as const satisfies readonly Role[];

export const ADMIN_USER_ROLE_VALUES = [
  'admin',
  'clinic_admin',
  'manager',
  'therapist',
  'staff',
] as const satisfies readonly Role[];

export type AdminUserRole = (typeof ADMIN_USER_ROLE_VALUES)[number];

/** Roles that tenant administrators may grant through a staff invite. */
export const STAFF_INVITE_ROLE_VALUES = [
  'manager',
  'therapist',
  'staff',
] as const satisfies readonly Role[];

export type StaffInviteRole = (typeof STAFF_INVITE_ROLE_VALUES)[number];

export const ROLE_LABELS = {
  admin: '本部管理者',
  clinic_admin: '店舗管理者',
  manager: 'マネージャー',
  therapist: '施術者',
  staff: 'スタッフ',
  customer: '顧客',
} as const satisfies Record<Role, string>;

export const ADMIN_USER_ROLE_OPTIONS = ADMIN_USER_ROLE_VALUES.map(value => ({
  value,
  label: ROLE_LABELS[value],
}));

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
 * Area analytics roles - can view scoped multi-clinic analytics.
 * This is intentionally narrower than CROSS_CLINIC_ROLES: manager must still
 * resolve a concrete clinic scope before any area data is read.
 */
export const AREA_ANALYTICS_ROLES: ReadonlySet<Role> = new Set([
  'admin',
  'manager',
]);

/**
 * Clinic admin roles - can manage clinic settings
 */
export const CLINIC_ADMIN_ROLES: ReadonlySet<Role> = new Set([
  'admin',
  'clinic_admin',
  'manager',
]);

/**
 * Pricing template roles - can manage headquarters/standard billing profiles
 */
export const PRICING_TEMPLATE_ADMIN_ROLES: ReadonlySet<Role> = new Set([
  'admin',
]);

/**
 * Clinic pricing admin roles - can manage clinic-owned billing profiles and
 * patient coverage defaults.
 */
export const CLINIC_PRICING_ADMIN_ROLES: ReadonlySet<Role> = new Set([
  'admin',
  'clinic_admin',
]);

/**
 * Revenue review roles - can review and recalculate confirmed snapshots.
 */
export const REVENUE_REVIEW_ROLES: ReadonlySet<Role> = new Set([
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

export function isRole(role: string | null | undefined): role is Role {
  return (
    role !== null &&
    role !== undefined &&
    ROLE_VALUES.some(value => value === role)
  );
}

/**
 * Check if role has HQ (headquarters) privileges
 */
export function isHQRole(role: string | null | undefined): boolean {
  return isRole(role) && HQ_ROLES.has(role);
}

/**
 * Check if role is the scoped area manager role.
 */
export function isAreaManagerRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'manager';
}

/**
 * Check if role is the lightweight field therapist role.
 */
export function isTherapistRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'therapist';
}

/**
 * Check if role can access admin UI
 */
export function canAccessAdminUI(role: string | null | undefined): boolean {
  return isRole(role) && ADMIN_UI_ROLES.has(role);
}

/**
 * Check if role can access cross-clinic data
 */
export function canAccessCrossClinic(role: string | null | undefined): boolean {
  return isRole(role) && CROSS_CLINIC_ROLES.has(role);
}

/**
 * Check if role can access scoped area analytics.
 */
export function canAccessAreaAnalytics(
  role: string | null | undefined
): boolean {
  return isRole(role) && AREA_ANALYTICS_ROLES.has(role);
}

/**
 * Check if role can manage clinic settings
 */
export function canManageClinicSettings(
  role: string | null | undefined
): boolean {
  return isRole(role) && CLINIC_ADMIN_ROLES.has(role);
}

/**
 * Check if role is a staff role (can access patient/reservation data)
 */
export function isStaffRole(role: string | null | undefined): boolean {
  return isRole(role) && STAFF_ROLES.has(role);
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

export function getRoleLabel(role: string | null | undefined): string {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === null) {
    return '-';
  }
  return isRole(normalizedRole) ? ROLE_LABELS[normalizedRole] : normalizedRole;
}

export function isAdminUserRole(
  role: string | null | undefined
): role is AdminUserRole {
  return (
    role !== null &&
    role !== undefined &&
    ADMIN_USER_ROLE_VALUES.some(value => value === role)
  );
}

/**
 * Check if role can access admin UI (with compatibility mapping)
 */
export function canAccessAdminUIWithCompat(
  role: string | null | undefined
): boolean {
  const normalized = normalizeRole(role);
  return isRole(normalized) && ADMIN_UI_ROLES.has(normalized);
}

/**
 * Check if role can access cross-clinic data (with compatibility mapping)
 */
export function canAccessCrossClinicWithCompat(
  role: string | null | undefined
): boolean {
  const normalized = normalizeRole(role);
  return isRole(normalized) && CROSS_CLINIC_ROLES.has(normalized);
}

/**
 * Check if role can access scoped area analytics (with compatibility mapping)
 */
export function canAccessAreaAnalyticsWithCompat(
  role: string | null | undefined
): boolean {
  const normalized = normalizeRole(role);
  return isRole(normalized) && AREA_ANALYTICS_ROLES.has(normalized);
}

/**
 * Check if role can manage clinic settings (with compatibility mapping)
 */
export function canManageClinicSettingsWithCompat(
  role: string | null | undefined
): boolean {
  const normalized = normalizeRole(role);
  return isRole(normalized) && CLINIC_ADMIN_ROLES.has(normalized);
}
