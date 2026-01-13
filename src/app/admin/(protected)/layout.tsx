import React from 'react';
import { redirect } from 'next/navigation';
import { createClient, getUserPermissions } from '@/lib/supabase';
import { canAccessAdminUIWithCompat } from '@/lib/constants/roles';

/**
 * ユーザーのロールと権限を解決
 * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
 * user_permissions テーブルを単一ソースとして使用
 */
async function resolveRole(userId: string) {
  const supabase = await createClient();

  // user_permissions を優先ソースとして使用
  const permissions = await getUserPermissions(userId, supabase);

  if (permissions) {
    // is_active は profiles テーブルから取得
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('user_id', userId)
      .maybeSingle();

    return {
      role: permissions.role,
      clinic_id: permissions.clinic_id,
      is_active: (profile as { is_active?: boolean } | null)?.is_active ?? true,
    };
  }

  return null;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  const profile = await resolveRole(user.id);

  const isActive = profile?.is_active ?? true;
  const role = profile?.role ?? null;

  // 互換マッピング適用: clinic_manager → clinic_admin
  // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (Option B-1)
  if (!role || !canAccessAdminUIWithCompat(role) || !isActive) {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
