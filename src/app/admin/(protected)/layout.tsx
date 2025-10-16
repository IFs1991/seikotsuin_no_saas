import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const ADMIN_ROLES = new Set(['admin', 'clinic_manager', 'manager']);

async function resolveRole(userId: string) {
  const supabase = await createClient();

  const profileQuery = await supabase
    .from('profiles')
    .select('role, clinic_id, is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileQuery.data) {
    return profileQuery.data;
  }

  if (!profileQuery.error || profileQuery.error.code === 'PGRST116') {
    const fallback = await supabase
      .from('profiles')
      .select('role, clinic_id, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (fallback.data) {
      return fallback.data;
    }
  }

  const permissions = await supabase
    .from('user_permissions')
    .select('role, clinic_id')
    .eq('staff_id', userId)
    .maybeSingle();

  type PermissionsData = { role: string; clinic_id: string | null } | null;
  const typedPermissionsData = permissions.data as PermissionsData;

  if (typedPermissionsData) {
    return {
      role: typedPermissionsData.role,
      clinic_id: typedPermissionsData.clinic_id,
      is_active: true,
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

  const isActive = (profile as any)?.is_active ?? true;
  const role = profile?.role ?? null;

  if (!role || !ADMIN_ROLES.has(role) || !isActive) {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
