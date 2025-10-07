import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { assertEnv } from '@/lib/env';
import { Database } from '@/types/supabase';

export type SupabaseServerClient = SupabaseClient<Database>;
type SupabaseServerClientFactory = () => Promise<SupabaseServerClient>;

const FACTORY_KEY = Symbol.for('@@supabaseServerFactory');
type GlobalScopeWithFactory = typeof globalThis & {
  [FACTORY_KEY]?: SupabaseServerClientFactory;
};

const globalScope = globalThis as GlobalScopeWithFactory;

async function createSupabaseClient(): Promise<SupabaseServerClient> {
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

function resolveSupabaseClientFactory(): SupabaseServerClientFactory {
  return globalScope[FACTORY_KEY] ?? createSupabaseClient;
}

export function setSupabaseClientFactory(
  factory: SupabaseServerClientFactory
) {
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

export async function getCurrentUser(
  client?: SupabaseServerClient
) {
  const supabase = client ?? await getServerClient();
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
}

export async function getUserPermissions(
  userId: string,
  client?: SupabaseServerClient
): Promise<UserPermissions | null> {
  const supabase = client ?? await getServerClient();
  const { data: permissions, error } = await supabase
    .from('user_permissions')
    .select('role, clinic_id')
    .eq('staff_id', userId)
    .single();

  if (error) {
    return null;
  }

  return permissions as UserPermissions;
}

export async function requireAuth(client?: SupabaseServerClient) {
  const user = await getCurrentUser(client);
  if (!user) {
    throw new Error('認証が必要です');
  }
  return user;
}

export async function requireAdminAuth(client?: SupabaseServerClient) {
  const supabase = client ?? await getServerClient();
  const user = await requireAuth(supabase);
  const permissions = await getUserPermissions(user.id, supabase);

  if (!permissions || !['admin', 'clinic_manager'].includes(permissions.role)) {
    throw new Error('管理者権限が必要です');
  }

  return { user, permissions };
}
