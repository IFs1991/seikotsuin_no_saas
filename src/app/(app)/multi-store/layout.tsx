import React from 'react';
import { redirect } from 'next/navigation';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';
import { canAccessCrossClinicWithCompat } from '@/lib/constants/roles';

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

  if (
    !role ||
    !accessContext.isActive ||
    !canAccessCrossClinicWithCompat(role)
  ) {
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
