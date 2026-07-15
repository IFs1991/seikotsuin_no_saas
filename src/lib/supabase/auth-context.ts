import type { SupabaseClient } from '@supabase/supabase-js';

import {
  canManageClinicSettingsWithCompat,
  normalizeRole,
} from '@/lib/constants/roles';
import { AppError, ERROR_CODES } from '@/lib/error-handler';
import type { Database } from '@/types/supabase';

type SupabaseQueryClient = Pick<SupabaseClient<Database>, 'from'>;
type QueryResult<T> = { data: T | null; error: unknown };
type SingleRowQuery<T> = {
  maybeSingle?: () => PromiseLike<QueryResult<T>>;
  single?: () => PromiseLike<QueryResult<T>>;
};

type AppMetadataCarrier = {
  app_metadata?: Record<string, unknown> | null;
} | null;

export interface AuthPermissionRecord {
  role: string;
  clinic_id: string | null;
  clinic_scope_ids?: string[] | null;
}

export interface ProfileStatusRow {
  is_active: boolean | null;
}

export type PermissionLookupResult =
  | { status: 'found'; value: AuthPermissionRecord }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };

export type ProfileStatusLookupResult =
  | { status: 'found'; value: ProfileStatusRow }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };

export interface UserAuthAccessContext<
  TPermissions extends AuthPermissionRecord = AuthPermissionRecord,
> {
  permissions: TPermissions | null;
  role: string | null;
  normalizedRole: string | null;
  clinicId: string | null;
  isActive: boolean;
  isAdmin: boolean;
}

export function assertActiveAccount(
  accessContext: Pick<UserAuthAccessContext, 'isActive'>
): void {
  if (!accessContext.isActive) {
    throw new AppError(ERROR_CODES.ACCOUNT_INACTIVE, undefined, 403);
  }
}

async function selectOptionalSingle<T>(
  query: SingleRowQuery<T>
): Promise<QueryResult<T>> {
  if (typeof query.maybeSingle === 'function') {
    return await query.maybeSingle();
  }

  if (typeof query.single === 'function') {
    return await query.single();
  }

  throw new Error('Supabase query does not support single-row selection');
}

export async function fetchUserPermissionsRecord(
  supabase: SupabaseQueryClient,
  userId: string
): Promise<PermissionLookupResult> {
  try {
    const { data, error } = await selectOptionalSingle<AuthPermissionRecord>(
      supabase
        .from('user_permissions')
        .select('role, clinic_id')
        .eq('staff_id', userId)
    );

    if (error) {
      return { status: 'error', error };
    }

    if (!data) {
      return { status: 'missing' };
    }

    return { status: 'found', value: data };
  } catch (error) {
    return { status: 'error', error };
  }
}

export async function fetchProfileStatus(
  supabase: SupabaseQueryClient,
  userId: string
): Promise<ProfileStatusLookupResult> {
  try {
    const byUserId = await selectOptionalSingle<ProfileStatusRow>(
      supabase.from('profiles').select('is_active').eq('user_id', userId)
    );

    if (byUserId.error) {
      return { status: 'error', error: byUserId.error };
    }

    if (byUserId.data) {
      return { status: 'found', value: byUserId.data };
    }

    // profiles.user_id is the only authoritative Auth-subject relation.
    // A row whose unrelated primary key happens to equal the subject must not
    // revive a missing or inactive account.
    return { status: 'missing' };
  } catch (error) {
    return { status: 'error', error };
  }
}

export function resolvePermissionRecord(
  permissionsRecord: AuthPermissionRecord | null,
  _user?: AppMetadataCarrier
): AuthPermissionRecord | null {
  return permissionsRecord;
}

export function buildUserAuthAccessContext<
  TPermissions extends AuthPermissionRecord,
>(
  permissions: TPermissions | null,
  profileStatus?: ProfileStatusRow | null
): UserAuthAccessContext<TPermissions> {
  const isActive = profileStatus?.is_active === true;
  const hasExplicitEmptyScope =
    Array.isArray(permissions?.clinic_scope_ids) &&
    permissions.clinic_scope_ids.length === 0;
  const activePermissions =
    isActive && !hasExplicitEmptyScope ? permissions : null;
  const role = activePermissions?.role ?? null;
  const normalizedRole = normalizeRole(role);
  const canonicalClinicIds = Array.isArray(activePermissions?.clinic_scope_ids)
    ? activePermissions.clinic_scope_ids
    : null;
  const primaryClinicId = activePermissions?.clinic_id ?? null;
  const clinicId = canonicalClinicIds
    ? primaryClinicId && canonicalClinicIds.includes(primaryClinicId)
      ? primaryClinicId
      : (canonicalClinicIds[0] ?? null)
    : primaryClinicId;

  return {
    permissions: activePermissions,
    role,
    normalizedRole,
    // A JWT scope claim may narrow the DB scope away from the primary clinic.
    // Never expose a default clinic outside the canonical intersection.
    clinicId,
    // Account status is an authorization boundary. Missing or unreadable
    // profile state must never grant access.
    isActive,
    isAdmin: canManageClinicSettingsWithCompat(normalizedRole),
  };
}
