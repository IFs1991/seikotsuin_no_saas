import 'server-only';

import {
  canManageClinicSettingsWithCompat,
  normalizeRole,
} from '@/lib/constants/roles';
import {
  createAdminClient,
  createScopedAdminContext,
  resolveScopedClinicIds,
  ScopeNotConfiguredError,
  type SupabaseServerClient,
  type UserAccessContext,
  type UserPermissions,
  type VerifiedSubject,
} from '@/lib/supabase';
import {
  resolveManagerAssignedClinicsWithinScope,
  type ManagerClinicAssignment,
} from '@/lib/auth/manager-scope';
import { selectReservableAdminClinicRows } from '@/lib/clinics/scope';
import { buildProfileResponse } from '@/lib/auth/profile-read-model';
import { logger } from '@/lib/logger';
import type {
  AppBootstrapClinic,
  AppBootstrapData,
} from '@/lib/app-bootstrap/types';

type AccessibleClinicRow = AppBootstrapClinic & {
  parent_id: string | null;
};

type AccessibleClinicsFetchResult = {
  clinics: AppBootstrapClinic[] | null;
  rows: AccessibleClinicRow[];
  error: unknown | null;
};

export interface AccessibleClinicsData {
  clinics: AppBootstrapClinic[];
  currentClinicId: string | null;
  profileClinicName: string | null;
}

export interface ResolveAccessibleClinicsParams {
  supabase: SupabaseServerClient;
  userId: string;
  authRole: string | null;
  permissions: UserPermissions;
  profileClinicId: string | null;
}

export interface BuildAppBootstrapParams {
  subject: VerifiedSubject;
  accessContext: UserAccessContext;
  supabase: SupabaseServerClient;
  now?: () => Date;
}

export class AccessibleClinicsReadError extends Error {
  constructor(readonly cause: unknown) {
    super('利用可能なクリニック一覧の取得に失敗しました');
    this.name = 'AccessibleClinicsReadError';
  }
}

const ACCESSIBLE_CLINIC_SELECT = 'id, name';
const ACCESSIBLE_ADMIN_CLINIC_SELECT = 'id, name, parent_id';

function toClinicOptions(
  rows: readonly AccessibleClinicRow[]
): AppBootstrapClinic[] {
  return rows.map(row => ({ id: row.id, name: row.name }));
}

function resolveCurrentAccessibleClinicId(
  clinics: readonly AppBootstrapClinic[],
  currentClinicId: string | null
): string | null {
  if (!currentClinicId) {
    return null;
  }

  return clinics.some(clinic => clinic.id === currentClinicId)
    ? currentClinicId
    : null;
}

function toSortedUniqueClinicOptions(
  assignments: readonly ManagerClinicAssignment[]
): AppBootstrapClinic[] {
  const clinicsById = new Map<string, AppBootstrapClinic>();

  for (const assignment of assignments) {
    if (!assignment.clinic_name) {
      continue;
    }

    clinicsById.set(assignment.clinic_id, {
      id: assignment.clinic_id,
      name: assignment.clinic_name,
    });
  }

  return Array.from(clinicsById.values()).sort((left, right) =>
    left.name.localeCompare(right.name, 'ja')
  );
}

function findClinicName(
  clinics: readonly AppBootstrapClinic[],
  clinicId: string | null
): string | null {
  if (!clinicId) {
    return null;
  }

  return clinics.find(clinic => clinic.id === clinicId)?.name ?? null;
}

async function fetchScopedAdminClinics(
  supabase: SupabaseServerClient,
  scopedClinicIds: readonly string[]
): Promise<AccessibleClinicsFetchResult> {
  const { data, error } = await supabase
    .from('clinics')
    .select(ACCESSIBLE_ADMIN_CLINIC_SELECT)
    .in('id', scopedClinicIds)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .returns<AccessibleClinicRow[]>();

  if (error) {
    return { clinics: null, rows: [], error };
  }

  const rows = data ?? [];
  return {
    clinics: toClinicOptions(selectReservableAdminClinicRows(rows)),
    rows,
    error: null,
  };
}

async function fetchDirectScopedClinics(
  supabase: SupabaseServerClient,
  scopedClinicIds: readonly string[]
): Promise<AccessibleClinicsFetchResult> {
  const { data, error } = await supabase
    .from('clinics')
    .select(ACCESSIBLE_CLINIC_SELECT)
    .in('id', scopedClinicIds)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .returns<AppBootstrapClinic[]>();

  const clinics = data ?? [];
  return {
    clinics: error ? null : clinics,
    rows: clinics.map(clinic => ({ ...clinic, parent_id: null })),
    error,
  };
}

export async function resolveAccessibleClinics({
  supabase,
  userId,
  authRole,
  permissions,
  profileClinicId,
}: ResolveAccessibleClinicsParams): Promise<AccessibleClinicsData> {
  const normalizedRole = normalizeRole(permissions.role);

  if (normalizedRole === 'manager') {
    const managerAssignments = await resolveManagerAssignedClinicsWithinScope(
      createAdminClient(),
      userId,
      permissions.clinic_scope_ids ?? []
    );
    const clinics = toSortedUniqueClinicOptions(managerAssignments);

    return {
      clinics,
      currentClinicId: clinics[0]?.id ?? null,
      profileClinicName: findClinicName(clinics, profileClinicId),
    };
  }

  const scopedClinicIds = resolveScopedClinicIds(permissions);
  if (!scopedClinicIds) {
    throw new ScopeNotConfiguredError();
  }

  let clinicsResult: AccessibleClinicsFetchResult;
  if (canManageClinicSettingsWithCompat(authRole)) {
    const adminContext = createScopedAdminContext(permissions);
    clinicsResult = await fetchScopedAdminClinics(
      adminContext.client,
      adminContext.scopedClinicIds
    );
  } else {
    clinicsResult = await fetchDirectScopedClinics(supabase, scopedClinicIds);
  }

  if (clinicsResult.error || !clinicsResult.clinics) {
    throw new AccessibleClinicsReadError(clinicsResult.error);
  }

  return {
    clinics: clinicsResult.clinics,
    currentClinicId: resolveCurrentAccessibleClinicId(
      clinicsResult.clinics,
      permissions.clinic_id
    ),
    profileClinicName: findClinicName(clinicsResult.rows, profileClinicId),
  };
}

export async function buildAppBootstrap({
  subject,
  accessContext,
  supabase,
  now = () => new Date(),
}: BuildAppBootstrapParams): Promise<AppBootstrapData> {
  if (!accessContext.isActive || !accessContext.permissions) {
    throw new ScopeNotConfiguredError('アプリ初期情報の権限が確定していません');
  }

  const generatedAt = now().toISOString();

  try {
    const accessibleClinics = await resolveAccessibleClinics({
      supabase,
      userId: subject.user.id,
      authRole: accessContext.normalizedRole,
      permissions: accessContext.permissions,
      profileClinicId: accessContext.clinicId,
    });

    return {
      profile: buildProfileResponse({
        user: subject.user,
        accessContext,
        clinicName: accessibleClinics.profileClinicName,
      }),
      clinics: accessibleClinics.clinics,
      currentClinicId: accessibleClinics.currentClinicId,
      errors: {
        profile: null,
        clinics: null,
      },
      generatedAt,
    };
  } catch (error) {
    if (!(error instanceof AccessibleClinicsReadError)) {
      throw error;
    }

    logger.error('App bootstrap accessible clinics read failed', error.cause, {
      userId: subject.user.id,
    });

    return {
      profile: buildProfileResponse({
        user: subject.user,
        accessContext,
        clinicName: null,
      }),
      clinics: [],
      currentClinicId: null,
      errors: {
        profile: null,
        clinics: error.message,
      },
      generatedAt,
    };
  }
}
