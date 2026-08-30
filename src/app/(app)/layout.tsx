import React from 'react';
import { redirect } from 'next/navigation';
import {
  createClient,
  getUserAccessContextForVerifiedSubject,
  logVerifiedSubjectTiming,
  resolveVerifiedSubject,
} from '@/lib/supabase';
import { withAuthorityUnavailableRedirect } from '@/lib/auth/authority-unavailable';
import { AppShell } from './app-shell';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const subject = await withAuthorityUnavailableRedirect(() =>
    resolveVerifiedSubject(supabase)
  );

  if (!subject) {
    redirect('/login');
  }

  try {
    const accessContext = await withAuthorityUnavailableRedirect(() =>
      getUserAccessContextForVerifiedSubject(subject, supabase)
    );

    if (!accessContext.permissions || !accessContext.isActive) {
      redirect('/unauthorized');
    }

    return <AppShell>{children}</AppShell>;
  } finally {
    logVerifiedSubjectTiming(subject, 'app_layout');
  }
}
