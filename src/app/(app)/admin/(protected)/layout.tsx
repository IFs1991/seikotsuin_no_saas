import React from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient, getUserAccessContext } from '@/lib/supabase';
import { withAuthorityUnavailableRedirect } from '@/lib/auth/authority-unavailable';
import {
  ADMIN_ROUTE_PATH_HEADER,
  AREA_MANAGER_ADMIN_DEFAULT_PATH,
  canAccessAdminRouteWithCompat,
  shouldRedirectAreaManagerAdminHome,
} from '@/lib/admin/routes';

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

  const accessContext = await withAuthorityUnavailableRedirect(() =>
    getUserAccessContext(user.id, supabase)
  );
  const isActive = accessContext.isActive;
  const role = accessContext.normalizedRole;
  const headerList = await headers();
  const pathname = headerList.get(ADMIN_ROUTE_PATH_HEADER);

  if (!role || !isActive) {
    redirect('/unauthorized');
  }

  if (shouldRedirectAreaManagerAdminHome({ role, pathname })) {
    redirect(AREA_MANAGER_ADMIN_DEFAULT_PATH);
  }

  if (!canAccessAdminRouteWithCompat({ role, pathname })) {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
