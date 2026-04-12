'use client';

import React from 'react';
import { Header } from '@/components/navigation/header';
import { Sidebar } from '@/components/navigation/sidebar';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAccessibleClinics } from '@/hooks/useAccessibleClinics';
import { UserProfileProvider } from '@/providers/user-profile-context';
import { QueryProvider } from '@/providers/query-provider';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';
import { LegalFooterLinks } from '@/components/legal/legal-footer-links';

const DARK_CLASS = 'dark';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfile();
  const {
    clinics,
    currentClinicId,
    loading: clinicsLoading,
  } = useAccessibleClinics();

  const isAdmin = profile?.isAdmin ?? false;

  // Task A: 通知件数（管理者のみ取得）
  const [notificationCount, setNotificationCount] = React.useState(0);

  React.useEffect(() => {
    const savedTheme =
      typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    const prefersDark =
      typeof window !== 'undefined'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    setIsDarkMode(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add(DARK_CLASS);
    } else {
      document.documentElement.classList.remove(DARK_CLASS);
    }
  }, []);

  // Task A: 管理者のみ通知件数を取得
  React.useEffect(() => {
    if (!isAdmin || !profile?.clinicId) return;
    const clinicId = profile.clinicId;
    fetch(`/api/admin/notifications?clinic_id=${clinicId}&limit=100`)
      .then(r => r.json())
      .then(result => {
        if (result.success)
          setNotificationCount(result.data.notifications.length);
      })
      .catch(() => {});
  }, [isAdmin, profile?.clinicId]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newMode ? 'dark' : 'light');
    }

    if (newMode) {
      document.documentElement.classList.add(DARK_CLASS);
    } else {
      document.documentElement.classList.remove(DARK_CLASS);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  return (
    <QueryProvider>
      <UserProfileProvider
        value={{ profile, loading: profileLoading, error: profileError }}
      >
        <SelectedClinicProvider
          initialClinicId={profile?.clinicId ?? currentClinicId ?? null}
        >
          <div
            className='min-h-screen'
            style={{ backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb' }}
          >
            <Header
              onToggleSidebar={toggleSidebar}
              onToggleDarkMode={toggleDarkMode}
              isDarkMode={isDarkMode}
              profile={profile}
              profileLoading={profileLoading}
              isAdmin={isAdmin}
              clinics={clinics}
              clinicsLoading={clinicsLoading}
              notificationCount={notificationCount}
            />

            <div className='flex' style={{ paddingTop: '64px' }}>
              <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                isAdmin={isAdmin}
                profileLoading={profileLoading}
              />

              <main
                className={`flex-1 transition-all duration-300 ${
                  isSidebarOpen ? 'lg:ml-64' : 'lg:ml-0'
                }`}
                style={{
                  backgroundColor: isDarkMode ? '#111827' : '#ffffff',
                  minHeight: 'calc(100vh - 64px)',
                }}
              >
                <div className='p-6 lg:p-8'>
                  <div
                    className='mx-auto max-w-7xl'
                    style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}
                  >
                    {children}
                  </div>
                  <footer className='mx-auto mt-10 max-w-7xl border-t border-slate-200 pt-4 text-sm text-slate-500'>
                    <LegalFooterLinks />
                  </footer>
                </div>
              </main>
            </div>

            <MobileBottomNav isAdmin={isAdmin} />
          </div>
        </SelectedClinicProvider>
      </UserProfileProvider>
    </QueryProvider>
  );
}
