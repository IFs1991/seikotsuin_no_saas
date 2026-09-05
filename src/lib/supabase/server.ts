import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { assertEnv } from '@/lib/env';
import {
  canAccessAdminUIWithCompat,
  isRole,
  normalizeRole,
} from '@/lib/constants/roles';
import { logError } from '@/lib/error-handler';
import {
  buildClinicScopeOrFilter,
  mergeScopedClinicHierarchyIds,
  type ClinicScopeRow,
} from '@/lib/clinics/scope';
import { resolveManagerAssignedClinicIds } from '@/lib/auth/manager-scope';
import type { Database } from '@/types/supabase';
import {
  buildUserAuthAccessContext,
  assertActiveAccount,
  fetchProfileStatus,
  fetchUserPermissionsRecord,
  throwAuthorityUnavailable,
  type UserAuthAccessContext,
} from './auth-context';
import { logPerf, nowMs } from '@/lib/performance/server-timing';
import type { RequestTimingMetric } from '@/lib/performance/request-timing';
import {
  getVerifiedSubjectAuthorityInput,
  getOrCreateVerifiedSubjectAccessContext,
  measureVerifiedSubject,
  type VerifiedSubject,
} from './request-auth-context';

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

export function createAdminClientForDatabase<
  TDatabase extends { public: object },
>(): SupabaseClient<TDatabase> {
  return createServerClient<TDatabase>(
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

export function createAdminClient(): SupabaseServerClient {
  return createAdminClientForDatabase<Database>();
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
  clinic_scope_ids?: string[] | null;
}

export type UserAccessContext = UserAuthAccessContext<UserPermissions>;

export interface UserAccessContextOptions {
  /**
   * Caller-provided user data is retained for API compatibility only. It must
   * never replace the authenticated subject returned by auth.getUser().
   */
  user?: User | null;
  /** JWT claims used only to narrow the database-approved clinic scope. */
  session?: Session | null;
}

/**
 * Resolve the effective clinic scope for a user.
 * Priority: clinic_scope_ids array > clinic_id fallback
 */
export function resolveScopedClinicIds(
  permissions: UserPermissions
): string[] | null {
  if (Array.isArray(permissions.clinic_scope_ids)) {
    return permissions.clinic_scope_ids;
  }

  // Manager authority is assignment-derived and canonicalized by
  // getUserPermissions. Missing/malformed canonical scope must never fall
  // back to a stale primary clinic.
  if (normalizeRole(permissions.role) === 'manager') {
    return [];
  }

  if (permissions.clinic_id) {
    return [permissions.clinic_id];
  }

  return null;
}

type JwtClinicScopeClaim =
  | { status: 'absent' }
  | { status: 'valid'; clinicIds: string[] }
  | { status: 'malformed' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const UUID_CLAIM_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidClaimValue(value: unknown): value is string {
  return typeof value === 'string' && UUID_CLAIM_PATTERN.test(value);
}

function parseJwtClinicScopeValue(value: unknown): JwtClinicScopeClaim {
  if (value === undefined) {
    return { status: 'absent' };
  }

  if (!Array.isArray(value) || !value.every(isUuidClaimValue)) {
    return { status: 'malformed' };
  }

  return {
    status: 'valid',
    clinicIds: Array.from(new Set(value)),
  };
}

function decodeJwtPayload(accessToken: string): Record<string, unknown> | null {
  const encodedPayload = accessToken.split('.')[1];
  if (!encodedPayload) {
    return null;
  }

  const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = normalized.length % 4;
  const padded =
    normalized + (paddingLength ? '='.repeat(4 - paddingLength) : '');

  try {
    const payload: unknown = JSON.parse(atob(padded));
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function readJwtClinicScopeClaim(
  accessToken: string | null,
  authenticatedUserId: string
): JwtClinicScopeClaim {
  if (!accessToken) {
    return { status: 'malformed' };
  }

  const payload = decodeJwtPayload(accessToken);
  if (!payload || payload.sub !== authenticatedUserId) {
    return { status: 'malformed' };
  }

  // session.user is reconstructed from the cookie and is not an authority
  // source. getCurrentUser() has just verified this access token remotely;
  // bind its signed payload to that subject before reading attenuation claims.
  const appMetadata = isRecord(payload.app_metadata)
    ? payload.app_metadata
    : null;
  const appMetadataClaim = parseJwtClinicScopeValue(
    appMetadata?.clinic_scope_ids
  );
  if (appMetadataClaim.status !== 'absent') {
    return appMetadataClaim;
  }

  return parseJwtClinicScopeValue(payload.clinic_scope_ids);
}

function applyJwtClinicScopeIntersection(
  databaseClinicIds: readonly string[],
  claim: JwtClinicScopeClaim,
  userId: string
): string[] {
  if (claim.status === 'absent') {
    return [...databaseClinicIds];
  }

  if (claim.status === 'malformed') {
    logError(new Error('Malformed JWT clinic scope claim'), {
      operation: 'applyJwtClinicScopeIntersection',
      eventType: 'jwt_scope_malformed',
      userId,
      databaseScopeCount: databaseClinicIds.length,
    });
    return [];
  }

  const databaseScope = new Set(databaseClinicIds);
  const exceedsDatabaseAuthority = claim.clinicIds.some(
    clinicId => !databaseScope.has(clinicId)
  );

  if (exceedsDatabaseAuthority) {
    logError(new Error('JWT clinic scope exceeds database authority'), {
      operation: 'applyJwtClinicScopeIntersection',
      eventType: 'jwt_scope_exceeds_db_authority',
      userId,
      databaseScopeCount: databaseClinicIds.length,
      jwtScopeCount: claim.clinicIds.length,
    });
  }

  const jwtScope = new Set(claim.clinicIds);
  return databaseClinicIds.filter(clinicId => jwtScope.has(clinicId));
}

async function resolveDatabaseClinicScopeIds(
  adminClient: SupabaseServerClient,
  userId: string,
  permissions: UserPermissions
): Promise<string[]> {
  const normalizedRole = normalizeRole(permissions.role);

  if (normalizedRole === 'manager') {
    try {
      return await resolveManagerAssignedClinicIds(adminClient, userId);
    } catch (error) {
      throwAuthorityUnavailable(error, {
        operation: 'resolveManagerAssignedClinicIds',
        userId,
        role: permissions.role,
      });
    }
  }

  if (!isRole(normalizedRole)) {
    return [];
  }

  if (!permissions.clinic_id) {
    return [];
  }

  if (normalizedRole !== 'admin' && normalizedRole !== 'clinic_admin') {
    return [permissions.clinic_id];
  }

  const primaryClinicResult = await adminClient
    .from('clinics')
    .select('id, parent_id')
    .eq('id', permissions.clinic_id)
    .maybeSingle<ClinicScopeRow>();

  if (primaryClinicResult.error) {
    throwAuthorityUnavailable(primaryClinicResult.error, {
      operation: 'resolveClinicAuthorityRoot',
      userId,
      role: permissions.role,
      clinicId: permissions.clinic_id,
    });
  }

  if (!primaryClinicResult.data) {
    return [];
  }

  const rootClinicId =
    primaryClinicResult.data.parent_id ?? primaryClinicResult.data.id;

  let clinicScopeFilter: string;
  try {
    clinicScopeFilter = buildClinicScopeOrFilter([rootClinicId]);
  } catch (error) {
    throwAuthorityUnavailable(error, {
      operation: 'resolveHierarchicalClinicScopeIds',
      userId,
      role: permissions.role,
      clinicId: permissions.clinic_id,
    });
  }

  const { data, error } = await adminClient
    .from('clinics')
    .select('id, parent_id')
    .or(clinicScopeFilter)
    .returns<ClinicScopeRow[]>();

  if (error) {
    throwAuthorityUnavailable(error, {
      operation: 'resolveHierarchicalClinicScopeIds',
      userId,
      role: permissions.role,
      clinicId: permissions.clinic_id,
    });
  }

  return mergeScopedClinicHierarchyIds([rootClinicId], data ?? []);
}

async function measureAuthorityOperation<T>(
  subject: VerifiedSubject | undefined,
  metric: RequestTimingMetric,
  operation: () => Promise<T>
): Promise<T> {
  if (subject) {
    return await measureVerifiedSubject(subject, metric, operation);
  }

  const startedAt = nowMs();
  try {
    return await operation();
  } finally {
    logPerf(metric, startedAt);
  }
}

async function getDatabasePermissionsUncached(
  userId: string,
  subject?: VerifiedSubject
): Promise<UserPermissions | null> {
  // Service role is limited to the already-validated subject's authority rows.
  const adminClient = createAdminClient();
  const permissionLookup = await measureAuthorityOperation(
    subject,
    'authority.permissions',
    () => fetchUserPermissionsRecord(adminClient, userId)
  );

  if (permissionLookup.status === 'error') {
    throwAuthorityUnavailable(permissionLookup.error, {
      operation: 'fetchUserPermissionsRecord',
      userId,
    });
  }

  if (permissionLookup.status === 'missing') {
    return null;
  }

  const databaseClinicScopeIds = await measureAuthorityOperation(
    subject,
    'authority.clinic_scope',
    () =>
      resolveDatabaseClinicScopeIds(adminClient, userId, permissionLookup.value)
  );

  return {
    ...permissionLookup.value,
    clinic_scope_ids: databaseClinicScopeIds,
  };
}

export async function getUserPermissions(
  userId: string,
  client?: SupabaseServerClient,
  options: UserAccessContextOptions = {}
): Promise<UserPermissions | null> {
  const supabase = client ?? (await getServerClient());

  // Subject binding is checked on every call, even when DB authority is
  // request-cached. This prevents a reused client from inheriting authority
  // after its authenticated subject changes. options.user is deliberately not
  // accepted as proof of identity because it is caller-provided state.
  const tCurrentUser = nowMs();
  const currentUser = await getCurrentUser(supabase);
  logPerf('auth.user', tCurrentUser);

  if (!currentUser || currentUser.id !== userId) {
    return null;
  }

  let cachedPermissionsByUser = userPermissionsRequestCache.get(supabase);

  if (!cachedPermissionsByUser) {
    cachedPermissionsByUser = new Map();
    userPermissionsRequestCache.set(supabase, cachedPermissionsByUser);
  }

  let databasePermissionsPromise = cachedPermissionsByUser.get(userId);
  if (!databasePermissionsPromise) {
    databasePermissionsPromise = getDatabasePermissionsUncached(userId).catch(
      error => {
        cachedPermissionsByUser.delete(userId);
        throw error;
      }
    );
    cachedPermissionsByUser.set(userId, databasePermissionsPromise);
  }

  const databasePermissions = await databasePermissionsPromise;
  if (!databasePermissions) {
    return null;
  }

  let session: Session | null = null;

  if (Object.prototype.hasOwnProperty.call(options, 'session')) {
    session = options.session ?? null;
  } else {
    const tSession = nowMs();
    const sessionResult = await supabase.auth.getSession();
    logPerf('auth.session', tSession);

    if (sessionResult.error) {
      throwAuthorityUnavailable(sessionResult.error, {
        operation: 'getAuthoritySession',
        userId,
      });
    }

    session = sessionResult.data.session;
  }

  const clinicScopeClaim = readJwtClinicScopeClaim(
    session?.access_token ?? null,
    currentUser.id
  );

  const clinic_scope_ids = applyJwtClinicScopeIntersection(
    databasePermissions.clinic_scope_ids ?? [],
    clinicScopeClaim,
    userId
  );

  return {
    ...databasePermissions,
    clinic_scope_ids,
  };
}

async function getUserPermissionsForVerifiedSubject(
  subject: VerifiedSubject
): Promise<UserPermissions | null> {
  const authorityInput = getVerifiedSubjectAuthorityInput(subject);
  const databasePermissions = await getDatabasePermissionsUncached(
    authorityInput.userId,
    subject
  );
  if (!databasePermissions) {
    return null;
  }

  const clinicScopeClaim = readJwtClinicScopeClaim(
    authorityInput.accessToken,
    authorityInput.userId
  );
  const clinic_scope_ids = applyJwtClinicScopeIntersection(
    databasePermissions.clinic_scope_ids ?? [],
    clinicScopeClaim,
    authorityInput.userId
  );

  return {
    ...databasePermissions,
    clinic_scope_ids,
  };
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
  client?: SupabaseServerClient,
  options: UserAccessContextOptions = {}
): Promise<UserAccessContext> {
  const supabase = client ?? (await getServerClient());
  const [permissions, profileLookup] = await Promise.all([
    getUserPermissions(userId, supabase, options),
    fetchProfileStatus(supabase, userId),
  ]);

  if (profileLookup.status === 'error') {
    throwAuthorityUnavailable(profileLookup.error, {
      operation: 'fetchProfileStatus',
      userId,
    });
  }

  const profileStatus =
    profileLookup.status === 'found' ? profileLookup.value : null;

  return buildUserAuthAccessContext(permissions, profileStatus);
}

export async function getUserAccessContextForVerifiedSubject(
  subject: VerifiedSubject,
  client: SupabaseServerClient
): Promise<UserAccessContext> {
  const authorityInput = getVerifiedSubjectAuthorityInput(subject);
  return await getOrCreateVerifiedSubjectAccessContext(
    subject,
    client,
    async () => {
      const [permissions, profileLookup] = await Promise.all([
        getUserPermissionsForVerifiedSubject(subject),
        measureVerifiedSubject(subject, 'authority.profile', () =>
          fetchProfileStatus(client, authorityInput.userId)
        ),
      ]);

      if (profileLookup.status === 'error') {
        throwAuthorityUnavailable(profileLookup.error, {
          operation: 'fetchProfileStatus',
          userId: authorityInput.userId,
        });
      }

      const profileStatus =
        profileLookup.status === 'found' ? profileLookup.value : null;

      return buildUserAuthAccessContext(permissions, profileStatus);
    }
  );
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
  const accessContext = await getUserAccessContext(user.id, supabase, {
    user,
  });

  assertActiveAccount(accessContext);

  const permissions = accessContext.permissions;

  // 互換マッピング適用: clinic_manager → clinic_admin
  // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (Option B-1)
  if (!permissions || !canAccessAdminUIWithCompat(permissions.role)) {
    throw new Error('管理者権限が必要です');
  }

  return { user, permissions };
}
