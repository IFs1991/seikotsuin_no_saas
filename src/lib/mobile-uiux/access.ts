import {
  isAdminUserRole,
  normalizeRole,
  type AdminUserRole,
} from '@/lib/constants/roles';
import { resolveManagerAssignedClinicIds } from '@/lib/auth/manager-scope';
import { createLogger } from '@/lib/logger';
import {
  createAdminClient,
  resolveScopedClinicIds,
  type SupabaseServerClient,
  type UserPermissions,
} from '@/lib/supabase';
import type { MobileUiuxFlags } from '@/lib/mobile-uiux/flags';

const log = createLogger('MobileUiuxAccess');

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
 * Async principal evaluation that resolves manager clinic scope from active
 * manager_clinic_assignments rows, matching resolveEffectiveClinicScope and
 * the RLS definition in app_private.can_access_clinic. Managers never fall
 * back to user_permissions.clinic_id / clinic_scope_ids (fail-closed).
 */
export async function resolveMobileUiuxPrincipal(params: {
  userId: string;
  permissions: UserPermissions | null;
  flags: MobileUiuxFlags;
  adminClient?: Pick<SupabaseServerClient, 'from'>;
}): Promise<MobileUiuxPrincipalDecision> {
  const normalizedRole = normalizeRole(params.permissions?.role);

  if (
    !isAdminUserRole(normalizedRole) ||
    !params.flags.allowedRoles.includes(normalizedRole)
  ) {
    return {
      allowed: false,
      status: 403,
      reason: 'role_denied',
    };
  }

  if (normalizedRole !== 'manager') {
    return evaluateMobileUiuxPrincipal(params.permissions, params.flags);
  }

  let assignedClinicIds: string[] = [];
  try {
    assignedClinicIds = await resolveManagerAssignedClinicIds(
      params.adminClient ?? createAdminClient(),
      params.userId
    );
  } catch (error) {
    log.warn('Failed to resolve manager clinic assignments', {
      errorName: error instanceof Error ? error.name : null,
    });
    assignedClinicIds = [];
  }

  if (assignedClinicIds.length === 0) {
    return {
      allowed: false,
      status: 403,
      reason: 'clinic_scope_empty',
    };
  }

  return {
    allowed: true,
    role: normalizedRole,
    clinicIds: assignedClinicIds,
  };
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
