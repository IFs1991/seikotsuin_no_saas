import React from 'react';
import { redirect } from 'next/navigation';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
  resolveScopedClinicIds,
} from '@/lib/supabase';
import { canAccessAreaAnalyticsWithCompat } from '@/lib/constants/roles';
import { withAuthorityUnavailableRedirect } from '@/lib/auth/authority-unavailable';

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

  const accessContext = await withAuthorityUnavailableRedirect(() =>
    getUserAccessContext(user.id, supabase)
  );
  const role = accessContext.normalizedRole;
  const canAccessArea = canAccessAreaAnalyticsWithCompat(role);
  const scopedClinicIds =
    canAccessArea && accessContext.permissions
      ? resolveScopedClinicIds(accessContext.permissions)
      : null;

  if (
    !role ||
    !accessContext.isActive ||
    !canAccessArea ||
    !scopedClinicIds ||
    scopedClinicIds.length === 0
  ) {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
