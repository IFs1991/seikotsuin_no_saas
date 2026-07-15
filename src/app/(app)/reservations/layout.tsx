import React from 'react';
import { redirect } from 'next/navigation';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';
import { withAuthorityUnavailableRedirect } from '@/lib/auth/authority-unavailable';

export default async function ReservationsLayout({
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

  if (!accessContext.permissions || !accessContext.isActive) {
    redirect('/unauthorized');
  }

  if (accessContext.normalizedRole === 'admin') {
    redirect('/admin');
  }

  return <>{children}</>;
}
