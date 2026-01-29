import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { assertEnv } from '@/lib/env';
import { canAccessAdminUIWithCompat } from '@/lib/constants/roles';

async function createSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
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

function resolveSupabaseClientFactory(): SupabaseServerClientFactory {
  return globalScope[FACTORY_KEY] ?? createSupabaseClient;
}

export function setSupabaseClientFactory(factory: SupabaseServerClientFactory) {
  globalScope[FACTORY_KEY] = factory;
}

export function resetSupabaseClientFactory() {
  delete globalScope[FACTORY_KEY];
}

export async function getServerClient(): Promise<SupabaseServerClient> {
  return await resolveSupabaseClientFactory()();
}

export async function createClient(): Promise<SupabaseServerClient> {
  return await getServerClient();
}

export function createAdminClient(): SupabaseServerClient {
  return createServerClient(
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

export async function getUserPermissions(
  userId: string,
  client?: SupabaseServerClient
): Promise<UserPermissions | null> {
  // Use Service Role to bypass RLS for reading user's own permissions.
  // This is safe because:
  // 1. This function is only called server-side after authentication
  // 2. It only reads the authenticated user's own permission data
  // 3. RLS on user_permissions table can cause performance issues during auth flow
  const adminClient = createAdminClient();
  const { data: permissions, error } = await adminClient
    .from('user_permissions')
    .select('role, clinic_id')
    .eq('staff_id', userId)
    .maybeSingle();

  if (error || !permissions) {
    return null;
  }

  // Try to get clinic_scope_ids from JWT claims (set by custom_access_token_hook)
  // @see docs/stabilization/spec-rls-tenant-boundary-v0.1.md
  // Use normal client for JWT session access (not RLS-protected)
  const supabase = client ?? (await getServerClient());
  let clinic_scope_ids: string[] | undefined;
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

  return {
    ...permissions,
    clinic_scope_ids,
  } as UserPermissions;
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
  // If clinic_scope_ids is available, use parent-scope check
  if (permissions.clinic_scope_ids && permissions.clinic_scope_ids.length > 0) {
    return permissions.clinic_scope_ids.includes(targetClinicId);
  }

  // Fallback: single clinic_id comparison
  return permissions.clinic_id === targetClinicId;
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
  const permissions = await getUserPermissions(user.id, supabase);

  // 互換マッピング適用: clinic_manager → clinic_admin
  // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (Option B-1)
  if (!permissions || !canAccessAdminUIWithCompat(permissions.role)) {
    throw new Error('管理者権限が必要です');
  }

  return { user, permissions };
}
