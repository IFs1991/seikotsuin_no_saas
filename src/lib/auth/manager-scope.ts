import { normalizeRole } from '@/lib/constants/roles';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import type { SupabaseServerClient, UserPermissions } from '@/lib/supabase';

export type ManagerClinicAssignment = {
  id: string;
  manager_user_id: string;
  clinic_id: string;
  clinic_name: string | null;
  assigned_at: string;
  revoked_at: string | null;
};

type ManagerAssignedClinicRelation =
  | {
      id: string;
      name: string;
      is_active: boolean | null;
    }
  | {
      id: string;
      name: string;
      is_active: boolean | null;
    }[]
  | null;

type ManagerClinicAssignmentQueryRow = Omit<
  ManagerClinicAssignment,
  'clinic_name'
> & {
  clinics: ManagerAssignedClinicRelation;
};

export type EffectiveClinicScope = {
  source: 'admin' | 'manager_assignments' | 'clinic_scope_ids' | 'clinic_id';
  clinicIds: string[];
};

export class ScopeAccessError extends Error {
  constructor(message = '対象クリニックへのアクセス権がありません') {
    super(message);
    this.name = 'ScopeAccessError';
  }
}

export const MANAGER_ASSIGNMENTS_ROLE_CHANGE_BLOCKED_MESSAGE =
  '担当店舗が残っているためロールを変更できません';

export async function hasActiveManagerClinicAssignments(
  adminClient: Pick<SupabaseServerClient, 'from'>,
  managerUserId: string
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('manager_clinic_assignments')
    .select('id')
    .eq('manager_user_id', managerUserId)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function resolveManagerAssignedClinicIds(
  adminClient: Pick<SupabaseServerClient, 'from'>,
  managerUserId: string
): Promise<string[]> {
  const { data, error } = await adminClient
    .from('manager_clinic_assignments')
    .select('clinic_id')
    .eq('manager_user_id', managerUserId)
    .is('revoked_at', null);

  if (error) {
    throw error;
  }

  return Array.from(new Set((data ?? []).map(row => row.clinic_id)));
}

function readManagerAssignedClinic(
  clinics: ManagerAssignedClinicRelation
): { id: string; name: string } | null {
  if (!clinics) {
    return null;
  }

  const clinic = Array.isArray(clinics) ? (clinics[0] ?? null) : clinics;
  if (!clinic || clinic.is_active !== true) {
    return null;
  }

  return {
    id: clinic.id,
    name: clinic.name,
  };
}

export async function resolveManagerAssignedClinics(
  adminClient: Pick<SupabaseServerClient, 'from'>,
  managerUserId: string
): Promise<ManagerClinicAssignment[]> {
  const { data, error } = await adminClient
    .from('manager_clinic_assignments')
    .select(
      'id, manager_user_id, clinic_id, assigned_at, revoked_at, clinics!inner(id, name, is_active)'
    )
    .eq('manager_user_id', managerUserId)
    .is('revoked_at', null)
    .eq('clinics.is_active', true)
    .returns<ManagerClinicAssignmentQueryRow[]>();

  if (error) {
    throw error;
  }

  const assignments: ManagerClinicAssignment[] = [];

  for (const row of data ?? []) {
    const clinic = readManagerAssignedClinic(row.clinics);
    if (!clinic) {
      continue;
    }

    assignments.push({
      id: row.id,
      manager_user_id: row.manager_user_id,
      clinic_id: clinic.id,
      clinic_name: clinic.name,
      assigned_at: row.assigned_at,
      revoked_at: row.revoked_at,
    });
  }

  return assignments;
}

/**
 * Resolve an actor's active assignments without exceeding the canonical
 * clinic scope already produced by getUserPermissions.
 */
export async function resolveManagerAssignedClinicsWithinScope(
  adminClient: Pick<SupabaseServerClient, 'from'>,
  managerUserId: string,
  canonicalClinicIds: readonly string[]
): Promise<ManagerClinicAssignment[]> {
  if (canonicalClinicIds.length === 0) {
    return [];
  }

  let assignments: ManagerClinicAssignment[];

  try {
    assignments = await resolveManagerAssignedClinics(
      adminClient,
      managerUserId
    );
  } catch (error) {
    logger.error('Manager assignment authority lookup failed', error, {
      userId: managerUserId,
      operation: 'resolveManagerAssignedClinicsWithinScope',
    });

    throw new AppError(
      ERROR_CODES.MANAGER_SCOPE_AUTHORITY_UNAVAILABLE,
      undefined,
      503
    );
  }
  const canonicalClinicIdSet = new Set(canonicalClinicIds);

  return assignments.filter(assignment =>
    canonicalClinicIdSet.has(assignment.clinic_id)
  );
}

export async function resolveEffectiveClinicScope({
  permissions,
}: {
  adminClient: Pick<SupabaseServerClient, 'from'>;
  userId: string;
  permissions: UserPermissions;
}): Promise<EffectiveClinicScope> {
  const role = normalizeRole(permissions.role);

  if (role === 'manager') {
    return {
      source: 'manager_assignments',
      clinicIds: Array.isArray(permissions.clinic_scope_ids)
        ? permissions.clinic_scope_ids
        : [],
    };
  }

  if (Array.isArray(permissions.clinic_scope_ids)) {
    return {
      source: 'clinic_scope_ids',
      clinicIds: permissions.clinic_scope_ids,
    };
  }

  if (permissions.clinic_id) {
    return {
      source: 'clinic_id',
      clinicIds: [permissions.clinic_id],
    };
  }

  return {
    source: 'clinic_id',
    clinicIds: [],
  };
}

export function assertClinicInEffectiveScope(
  scope: EffectiveClinicScope,
  clinicId: string
): void {
  if (!scope.clinicIds.includes(clinicId)) {
    throw new ScopeAccessError();
  }
}
