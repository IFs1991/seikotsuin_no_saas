import React from 'react';
import { redirect } from 'next/navigation';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';
import { withAuthorityUnavailableRedirect } from '@/lib/auth/authority-unavailable';
import { AppShell } from './app-shell';

export default async function AppLayout({
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
    getUserAccessContext(user.id, supabase, { user })
  );

  if (!accessContext.permissions || !accessContext.isActive) {
    redirect('/unauthorized');
  }

  return <AppShell>{children}</AppShell>;
}
