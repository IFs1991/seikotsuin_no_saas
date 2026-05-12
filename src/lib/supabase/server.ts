import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { assertEnv } from '@/lib/env';
import {
  canAccessAdminUIWithCompat,
  canAccessCrossClinicWithCompat,
} from '@/lib/constants/roles';
import { logError } from '@/lib/error-handler';
import {
  buildClinicScopeOrFilter,
  mergeScopedClinicHierarchyIds,
  type ClinicScopeRow,
} from '@/lib/clinics/scope';
import type { Database } from '@/types/supabase';
import {
  buildUserAuthAccessContext,
  fetchProfileStatus,
  fetchUserPermissionsRecord,
  resolvePermissionRecord,
  type UserAuthAccessContext,
} from './auth-context';

async function createSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    assertEnv('NEXT_PUBLIC_SUPABASE_URL'),
    assertEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options?: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Ignored: Next.js blocks cookie mutation in some server contexts.
          }
        },
        remove(name: string, options?: CookieOptions) {
          try {
            cookieStore.delete({ name, ...options });
          } catch {
            // Ignored: Next.js blocks cookie mutation in some server contexts.
          }
        },
      },
    }
  );
}

export type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseClient>
>;
type SupabaseServerClientFactory = () => Promise<SupabaseServerClient>;

const FACTORY_KEY = Symbol.for('@@supabaseServerFactory');
type GlobalScopeWithFactory = typeof globalThis & {
  [FACTORY_KEY]?: SupabaseServerClientFactory;
};

const globalScope = globalThis as GlobalScopeWithFactory;
let userPermissionsRequestCache = new WeakMap<
  SupabaseServerClient,
  Map<string, Promise<UserPermissions | null>>
>();

function resolveSupabaseClientFactory(): SupabaseServerClientFactory {
  return globalScope[FACTORY_KEY] ?? createSupabaseClient;
}

export function setSupabaseClientFactory(factory: SupabaseServerClientFactory) {
  globalScope[FACTORY_KEY] = factory;
}

export function resetSupabaseClientFactory() {
  delete globalScope[FACTORY_KEY];
  userPermissionsRequestCache = new WeakMap();
}

export async function getServerClient(): Promise<SupabaseServerClient> {
  return await resolveSupabaseClientFactory()();
}

export async function createClient(): Promise<SupabaseServerClient> {
  return await getServerClient();
}

export function createAdminClient(): SupabaseServerClient {
  return createServerClient<Database>(
    assertEnv('NEXT_PUBLIC_SUPABASE_URL'),
    assertEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  );
}

export async function getCurrentUser(client?: SupabaseServerClient) {
  const supabase = client ?? (await getServerClient());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export interface UserPermissions {
  role: string;
  clinic_id: string | null;
  /**
   * Parent-scope: Array of clinic IDs user can access (sibling clinics under same parent).
   * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md
   */
  clinic_scope_ids?: string[];
}

export type UserAccessContext = UserAuthAccessContext<UserPermissions>;

/**
 * Resolve the effective clinic scope for a user.
 * Priority: clinic_scope_ids array > clinic_id fallback
 */
export function resolveScopedClinicIds(
  permissions: UserPermissions
): string[] | null {
  if (permissions.clinic_scope_ids && permissions.clinic_scope_ids.length > 0) {
    return permissions.clinic_scope_ids;
  }

  if (permissions.clinic_id) {
    return [permissions.clinic_id];
  }

  return null;
}

async function resolveHierarchicalClinicScopeIds(
  adminClient: SupabaseServerClient,
  userId: string,
  permissions: UserPermissions
): Promise<string[] | undefined> {
  const scopedClinicIds = resolveScopedClinicIds(permissions);
  if (
    !scopedClinicIds ||
    scopedClinicIds.length === 0 ||
    !canAccessCrossClinicWithCompat(permissions.role)
  ) {
    return permissions.clinic_scope_ids;
  }

  if (permissions.clinic_scope_ids && permissions.clinic_scope_ids.length > 1) {
    return permissions.clinic_scope_ids;
  }

  let clinicScopeFilter: string;
  try {
    clinicScopeFilter = buildClinicScopeOrFilter(scopedClinicIds);
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      operation: 'resolveHierarchicalClinicScopeIds',
      userId,
      role: permissions.role,
      clinicId: permissions.clinic_id,
      scopedClinicIds,
    });
    return permissions.clinic_scope_ids;
  }

  const { data, error } = await adminClient
    .from('clinics')
    .select('id, parent_id')
    .or(clinicScopeFilter)
    .returns<ClinicScopeRow[]>();

  if (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      operation: 'resolveHierarchicalClinicScopeIds',
      userId,
      role: permissions.role,
      clinicId: permissions.clinic_id,
      scopedClinicIds,
    });
    return permissions.clinic_scope_ids;
  }

  return mergeScopedClinicHierarchyIds(scopedClinicIds, data ?? []);
}

async function getUserPermissionsUncached(
  userId: string,
  supabase: SupabaseServerClient
): Promise<UserPermissions | null> {
  // Use Service Role to bypass RLS for reading user's own permissions.
  // This is safe because:
  // 1. This function is only called server-side after authentication
  // 2. It only reads the authenticated user's own permission data
  // 3. RLS on user_permissions table can cause performance issues during auth flow
  const adminClient = createAdminClient();
  const permissionsData = await fetchUserPermissionsRecord(adminClient, userId);

  // Try to get clinic_scope_ids from JWT claims (set by custom_access_token_hook)
  // @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md
  // Use normal client for JWT session access (not RLS-protected)
  const currentUser = await getCurrentUser(supabase);
  const permissions = resolvePermissionRecord(
    permissionsData,
    currentUser && currentUser.id === userId ? currentUser : null
  );

  if (!permissions) {
    return null;
  }

  let clinic_scope_ids: string[] | undefined = permissions.clinic_scope_ids;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const scopeIdsFromMetadata = session?.user?.app_metadata?.clinic_scope_ids;
    let scopeIdsFromJwt: unknown = scopeIdsFromMetadata;

    if (!Array.isArray(scopeIdsFromJwt)) {
      const accessToken = session?.access_token;
      if (accessToken) {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        scopeIdsFromJwt = payload?.clinic_scope_ids;
      }
    }

    if (Array.isArray(scopeIdsFromJwt)) {
      clinic_scope_ids = scopeIdsFromJwt;
    }
  } catch {
    // JWT parsing failed, fall back to single clinic_id
  }

  const expandedClinicScopeIds = await resolveHierarchicalClinicScopeIds(
    adminClient,
    userId,
    {
      ...permissions,
      clinic_scope_ids,
    }
  );

  return {
    ...permissions,
    clinic_scope_ids: expandedClinicScopeIds,
  };
}

export async function getUserPermissions(
  userId: string,
  client?: SupabaseServerClient
): Promise<UserPermissions | null> {
  const supabase = client ?? (await getServerClient());
  let cachedPermissionsByUser = userPermissionsRequestCache.get(supabase);

  if (!cachedPermissionsByUser) {
    cachedPermissionsByUser = new Map();
    userPermissionsRequestCache.set(supabase, cachedPermissionsByUser);
  }

  const cachedPermissions = cachedPermissionsByUser.get(userId);
  if (cachedPermissions) {
    return cachedPermissions;
  }

  const permissionsPromise = getUserPermissionsUncached(userId, supabase).catch(
    error => {
      cachedPermissionsByUser.delete(userId);
      throw error;
    }
  );
  cachedPermissionsByUser.set(userId, permissionsPromise);

  return permissionsPromise;
}

/**
 * Check if the user can access the target clinic using parent-scope model.
 * Priority: clinic_scope_ids array > clinic_id fallback
 * @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md
 */
export function canAccessClinicScope(
  permissions: UserPermissions,
  targetClinicId: string
): boolean {
  const scopedClinicIds = resolveScopedClinicIds(permissions);
  return scopedClinicIds?.includes(targetClinicId) ?? false;
}

export async function getUserAccessContext(
  userId: string,
  client?: SupabaseServerClient
): Promise<UserAccessContext> {
  const supabase = client ?? (await getServerClient());
  const [permissions, profileStatus] = await Promise.all([
    getUserPermissions(userId, supabase),
    fetchProfileStatus(supabase, userId),
  ]);

  return buildUserAuthAccessContext(permissions, profileStatus);
}

export async function requireAuth(client?: SupabaseServerClient) {
  const user = await getCurrentUser(client);
  if (!user) {
    throw new Error('認証が必要です');
  }
  return user;
}

export async function requireAdminAuth(client?: SupabaseServerClient) {
  const supabase = client ?? (await getServerClient());
  const user = await requireAuth(supabase);
  const accessContext = await getUserAccessContext(user.id, supabase);
  const permissions = accessContext.permissions;

  // 互換マッピング適用: clinic_manager → clinic_admin
  // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (Option B-1)
  if (!permissions || !canAccessAdminUIWithCompat(permissions.role)) {
    throw new Error('管理者権限が必要です');
  }

  return { user, permissions };
}
