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

  return (data ?? [])
    .map(row => {
      const clinic = readManagerAssignedClinic(row.clinics);
      if (!clinic) {
        return null;
      }

      return {
        id: row.id,
        manager_user_id: row.manager_user_id,
        clinic_id: clinic.id,
        clinic_name: clinic.name,
        assigned_at: row.assigned_at,
        revoked_at: row.revoked_at,
      };
    })
    .filter((assignment): assignment is ManagerClinicAssignment =>
      Boolean(assignment)
    );
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
