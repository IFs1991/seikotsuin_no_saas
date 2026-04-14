import React from 'react';
import { redirect } from 'next/navigation';
import { createClient, getCurrentUser } from '@/lib/supabase';
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

  return <AppShell>{children}</AppShell>;
}
