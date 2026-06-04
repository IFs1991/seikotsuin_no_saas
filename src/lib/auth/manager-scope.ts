import { normalizeRole } from '@/lib/constants/roles';
import type { SupabaseServerClient, UserPermissions } from '@/lib/supabase';

export type ManagerClinicAssignment = {
  id: string;
  manager_user_id: string;
  clinic_id: string;
  clinic_name: string | null;
  assigned_at: string;
  revoked_at: string | null;
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

export async function resolveEffectiveClinicScope({
  adminClient,
  userId,
  permissions,
}: {
  adminClient: Pick<SupabaseServerClient, 'from'>;
  userId: string;
  permissions: UserPermissions;
}): Promise<EffectiveClinicScope> {
  const role = normalizeRole(permissions.role);

  if (role === 'manager') {
    const assignedClinicIds = await resolveManagerAssignedClinicIds(
      adminClient,
      userId
    );

    return {
      source: 'manager_assignments',
      clinicIds: assignedClinicIds,
    };
  }

  if (permissions.clinic_scope_ids?.length) {
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
