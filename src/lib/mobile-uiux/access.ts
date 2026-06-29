import {
  isAdminUserRole,
  normalizeRole,
  type AdminUserRole,
} from '@/lib/constants/roles';
import { resolveScopedClinicIds, type UserPermissions } from '@/lib/supabase';
import type { MobileUiuxFlags } from '@/lib/mobile-uiux/flags';

export type MobileUiuxAccessDecision =
  | {
      allowed: true;
      role: AdminUserRole;
      clinicIds: string[];
    }
  | {
      allowed: false;
      status: 403;
      reason: 'role_denied' | 'clinic_scope_empty' | 'clinic_denied';
    };

function hasAllowedClinic(
  scopedClinicIds: readonly string[],
  allowedClinicIds: readonly string[]
): boolean {
  const allowedClinicIdSet = new Set(allowedClinicIds);
  return scopedClinicIds.some(clinicId => allowedClinicIdSet.has(clinicId));
}

export function evaluateMobileUiuxAccess(
  permissions: UserPermissions | null,
  flags: MobileUiuxFlags
): MobileUiuxAccessDecision {
  const normalizedRole = normalizeRole(permissions?.role);

  if (
    !isAdminUserRole(normalizedRole) ||
    !flags.allowedRoles.includes(normalizedRole)
  ) {
    return {
      allowed: false,
      status: 403,
      reason: 'role_denied',
    };
  }

  const scopedClinicIds = permissions
    ? (resolveScopedClinicIds(permissions) ?? [])
    : [];

  if (flags.allowedClinicIds.length === 0) {
    if (normalizedRole === 'admin') {
      return {
        allowed: true,
        role: normalizedRole,
        clinicIds: scopedClinicIds,
      };
    }

    return {
      allowed: false,
      status: 403,
      reason: 'clinic_denied',
    };
  }

  if (scopedClinicIds.length === 0) {
    return {
      allowed: false,
      status: 403,
      reason: 'clinic_scope_empty',
    };
  }

  if (!hasAllowedClinic(scopedClinicIds, flags.allowedClinicIds)) {
    return {
      allowed: false,
      status: 403,
      reason: 'clinic_denied',
    };
  }

  return {
    allowed: true,
    role: normalizedRole,
    clinicIds: scopedClinicIds,
  };
}
