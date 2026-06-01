import React from 'react';
import { redirect } from 'next/navigation';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
  resolveScopedClinicIds,
} from '@/lib/supabase';
import {
  canAccessAreaAnalyticsWithCompat,
  isAreaManagerRole,
} from '@/lib/constants/roles';

export default async function MultiStoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect('/login');
  }

  const accessContext = await getUserAccessContext(user.id, supabase);
  const role = accessContext.normalizedRole;
  const isAreaManager = isAreaManagerRole(role);
  const scopedClinicIds =
    isAreaManager && accessContext.permissions
      ? resolveScopedClinicIds(accessContext.permissions)
      : null;

  if (
    !role ||
    !accessContext.isActive ||
    !canAccessAreaAnalyticsWithCompat(role) ||
    (isAreaManager && (!scopedClinicIds || scopedClinicIds.length === 0))
  ) {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
