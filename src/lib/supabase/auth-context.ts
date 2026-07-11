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
  clinic_scope_ids?: string[];
}

export interface ProfileStatusRow {
  is_active: boolean | null;
}

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
): Promise<AuthPermissionRecord | null> {
  const { data, error } = await selectOptionalSingle<AuthPermissionRecord>(
    supabase
      .from('user_permissions')
      .select('role, clinic_id')
      .eq('staff_id', userId) as unknown as SingleRowQuery<AuthPermissionRecord>
  );

  if (data || !error) {
    return data as AuthPermissionRecord | null;
  }

  return null;
}

export async function fetchProfileStatus(
  supabase: SupabaseQueryClient,
  userId: string
): Promise<ProfileStatusRow | null> {
  const byUserId = await selectOptionalSingle<ProfileStatusRow>(
    supabase
      .from('profiles')
      .select('is_active')
      .eq('user_id', userId) as unknown as SingleRowQuery<ProfileStatusRow>
  );

  if (byUserId.data || !byUserId.error) {
    return (byUserId.data as ProfileStatusRow | null) ?? null;
  }

  const byId = await selectOptionalSingle<ProfileStatusRow>(
    supabase
      .from('profiles')
      .select('is_active')
      .eq('id', userId) as unknown as SingleRowQuery<ProfileStatusRow>
  );

  if (byId.data || !byId.error) {
    return (byId.data as ProfileStatusRow | null) ?? null;
  }

  return null;
}

export function resolvePermissionRecord(
  permissionsRecord: AuthPermissionRecord | null,
  user: AppMetadataCarrier
): AuthPermissionRecord | null {
  if (permissionsRecord) {
    return permissionsRecord;
  }

  const appMetadata = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const roleFromJwt =
    typeof appMetadata.user_role === 'string'
      ? appMetadata.user_role
      : typeof appMetadata.role === 'string'
        ? appMetadata.role
        : null;
  const clinicIdFromJwt =
    typeof appMetadata.clinic_id === 'string' ? appMetadata.clinic_id : null;
  const clinicScopeIds =
    Array.isArray(appMetadata.clinic_scope_ids) &&
    appMetadata.clinic_scope_ids.every(id => typeof id === 'string')
      ? (appMetadata.clinic_scope_ids as string[])
      : undefined;

  if (!roleFromJwt) {
    return null;
  }

  return {
    role: roleFromJwt,
    clinic_id: clinicIdFromJwt,
    clinic_scope_ids: clinicScopeIds,
  };
}

export function buildUserAuthAccessContext<
  TPermissions extends AuthPermissionRecord,
>(
  permissions: TPermissions | null,
  profileStatus?: ProfileStatusRow | null
): UserAuthAccessContext<TPermissions> {
  const role = permissions?.role ?? null;
  const normalizedRole = normalizeRole(role);

  return {
    permissions,
    role,
    normalizedRole,
    clinicId: permissions?.clinic_id ?? null,
    // Account status is an authorization boundary. Missing or unreadable
    // profile state must never grant access.
    isActive: profileStatus?.is_active === true,
    isAdmin: canManageClinicSettingsWithCompat(normalizedRole),
  };
}
