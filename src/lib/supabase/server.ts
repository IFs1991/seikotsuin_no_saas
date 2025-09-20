import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/types/supabase';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function getUserPermissions(userId: string) {
  const supabase = createClient();
  const { data: permissions, error } = await supabase
    .from('user_permissions')
    .select('role, clinic_id')
    .eq('staff_id', userId)
    .single();

  if (error) {
    return null;
  }

  return permissions;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('認証が必要です');
  }
  return user;
}

export async function requireAdminAuth() {
  const user = await requireAuth();
  const permissions = await getUserPermissions(user.id);

  if (!permissions || !['admin', 'clinic_manager'].includes(permissions.role)) {
    throw new Error('管理者権限が必要です');
  }

  return { user, permissions };
}
