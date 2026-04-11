import React from 'react';
import { redirect } from 'next/navigation';
import { createClient, getUserAccessContext } from '@/lib/supabase';
import { canAccessAdminUIWithCompat } from '@/lib/constants/roles';

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

  const accessContext = await getUserAccessContext(user.id, supabase);
  const isActive = accessContext.isActive;
  const role = accessContext.normalizedRole;

  // 互換マッピング適用: clinic_manager → clinic_admin
  // @spec docs/stabilization/spec-auth-role-alignment-v0.1.md (Option B-1)
  if (!role || !canAccessAdminUIWithCompat(role) || !isActive) {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
