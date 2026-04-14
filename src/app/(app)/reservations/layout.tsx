import React from 'react';
import { redirect } from 'next/navigation';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';

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

  const accessContext = await getUserAccessContext(user.id, supabase);

  if (accessContext.normalizedRole === 'admin') {
    redirect('/admin');
  }

  return <>{children}</>;
}
