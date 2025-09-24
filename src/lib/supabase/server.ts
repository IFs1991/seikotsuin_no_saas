import 'server-only';

import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { Database } from '@/types/supabase';
import { assertEnv } from '@/lib/env';

export type SupabaseServerClient = SupabaseClient<Database>;

export function createClient(): SupabaseServerClient {
  const cookieStore = cookies();

  return createServerClient<Database>(
    assertEnv('NEXT_PUBLIC_SUPABASE_URL'),
    assertEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

// サーバー用のSupabaseクライアント（サーバーコンポーネント、Route Handler、Server Actions用）
// Note: Use createClient() directly in async contexts

// 管理者専用のSupabaseクライアント（サービスロールキー使用）
export function createAdminClient() {
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

// ユーザー認証・認可チェック用のヘルパー関数
export async function getCurrentUser(
  client?: SupabaseServerClient
) {
  const supabase = client ?? createClient();
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
  const supabase = client ?? createClient();
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
  const supabase = client ?? createClient();
  const user = await requireAuth(supabase);
  const permissions = await getUserPermissions(user.id, supabase);

  if (!permissions || !['admin', 'clinic_manager'].includes(permissions.role)) {
    throw new Error('管理者権限が必要です');
  }

  return { user, permissions };
}
