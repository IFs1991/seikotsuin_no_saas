import {
  isAdminUserRole,
  normalizeRole,
  type AdminUserRole,
} from '@/lib/constants/roles';
import {
  resolveScopedClinicIds,
  type SupabaseServerClient,
  type UserPermissions,
} from '@/lib/supabase';
import type { MobileUiuxFlags } from '@/lib/mobile-uiux/flags';

export type MobileUiuxPrincipalDecision =
  | {
      allowed: true;
      role: AdminUserRole;
      clinicIds: string[];
    }
  | {
      allowed: false;
      status: 403;
      reason: 'role_denied' | 'clinic_scope_empty';
    };

export type MobileUiuxRolloutDecision =
  | {
      allowed: true;
      role: AdminUserRole;
      clinicIds: string[];
    }
  | {
      allowed: false;
      status: 403;
      reason: 'clinic_denied';
    };

export type MobileUiuxAccessDecision =
  | MobileUiuxRolloutDecision
  | Extract<MobileUiuxPrincipalDecision, { allowed: false }>;

function hasAllowedClinic(
  scopedClinicIds: readonly string[],
  allowedClinicIds: readonly string[]
): boolean {
  const allowedClinicIdSet = new Set(allowedClinicIds);
  return scopedClinicIds.some(clinicId => allowedClinicIdSet.has(clinicId));
}

function filterAllowedClinicIds(
  scopedClinicIds: readonly string[],
  allowedClinicIds: readonly string[]
): string[] {
  const allowedClinicIdSet = new Set(allowedClinicIds);
  return scopedClinicIds.filter(clinicId => allowedClinicIdSet.has(clinicId));
}

export function evaluateMobileUiuxPrincipal(
  permissions: UserPermissions | null,
  flags: MobileUiuxFlags
): MobileUiuxPrincipalDecision {
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

  if (scopedClinicIds.length === 0) {
    return {
      allowed: false,
      status: 403,
      reason: 'clinic_scope_empty',
    };
  }

  return {
    allowed: true,
    role: normalizedRole,
    clinicIds: scopedClinicIds,
  };
}

/**
 * Async-compatible principal evaluation over the canonical access context.
 * Manager assignments are resolved once in getUserPermissions, including the
 * JWT intersection. Re-querying them here would widen a deliberately narrowed
 * scope.
 */
export function resolveMobileUiuxPrincipal(params: {
  userId: string;
  permissions: UserPermissions | null;
  flags: MobileUiuxFlags;
  adminClient?: Pick<SupabaseServerClient, 'from'>;
}): Promise<MobileUiuxPrincipalDecision> {
  return Promise.resolve(
    evaluateMobileUiuxPrincipal(params.permissions, params.flags)
  );
}

export function evaluateMobileUiuxEnvRollout(
  principal: Extract<MobileUiuxPrincipalDecision, { allowed: true }>,
  flags: MobileUiuxFlags
): MobileUiuxRolloutDecision {
  if (flags.allowedClinicIds.length === 0) {
    return {
      allowed: true,
      role: principal.role,
      clinicIds: principal.clinicIds,
    };
  }

  if (!hasAllowedClinic(principal.clinicIds, flags.allowedClinicIds)) {
    return {
      allowed: false,
      status: 403,
      reason: 'clinic_denied',
    };
  }

  return {
    allowed: true,
    role: principal.role,
    clinicIds: filterAllowedClinicIds(
      principal.clinicIds,
      flags.allowedClinicIds
    ),
  };
}

export function evaluateMobileUiuxAccess(
  permissions: UserPermissions | null,
  flags: MobileUiuxFlags
): MobileUiuxAccessDecision {
  const principal = evaluateMobileUiuxPrincipal(permissions, {
    ...flags,
    useDbEntitlements: false,
  });

  if (principal.allowed === false) {
    return principal;
  }

  return evaluateMobileUiuxEnvRollout(principal, {
    ...flags,
    useDbEntitlements: false,
  });
}
