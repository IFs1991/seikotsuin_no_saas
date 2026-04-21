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
import { canUseAdminNavigation } from '@/lib/navigation/items';

const DARK_CLASS = 'dark';
const NOTIFICATION_FETCH_LIMIT = '100';

interface AdminNotificationsResponse {
  success: true;
  data: {
    notifications: readonly unknown[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAdminNotificationsResponse(
  value: unknown
): value is AdminNotificationsResponse {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) {
    return false;
  }

  return Array.isArray(value.data.notifications);
}

async function fetchAdminNotificationCount(
  clinicId: string,
  signal: AbortSignal
): Promise<number> {
  const params = new URLSearchParams({
    clinic_id: clinicId,
    limit: NOTIFICATION_FETCH_LIMIT,
  });
  const response = await fetch(`/api/admin/notifications?${params}`, {
    signal,
  });

  if (!response.ok) {
    return 0;
  }

  const payload: unknown = await response.json();
  return isAdminNotificationsResponse(payload)
    ? payload.data.notifications.length
    : 0;
}

export function AppShell({ children }: { children: React.ReactNode }) {
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

  const canAccessAdminNavigation = canUseAdminNavigation(profile?.role);

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

  React.useEffect(() => {
    if (!canAccessAdminNavigation || !profile?.clinicId) {
      setNotificationCount(0);
      return;
    }

    const clinicId = profile.clinicId;
    const abortController = new AbortController();

    const loadNotificationCount = async () => {
      try {
        const count = await fetchAdminNotificationCount(
          clinicId,
          abortController.signal
        );
        setNotificationCount(count);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setNotificationCount(0);
      }
    };

    void loadNotificationCount();

    return () => abortController.abort();
  }, [canAccessAdminNavigation, profile?.clinicId]);

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
              isAdmin={canAccessAdminNavigation}
              clinics={clinics}
              clinicsLoading={clinicsLoading}
              notificationCount={notificationCount}
            />

            <div className='flex' style={{ paddingTop: '64px' }}>
              <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                isAdmin={canAccessAdminNavigation}
                profileLoading={profileLoading}
                role={profile?.role ?? null}
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

            <MobileBottomNav
              isAdmin={canAccessAdminNavigation}
              profileLoading={profileLoading}
              role={profile?.role ?? null}
            />
          </div>
        </SelectedClinicProvider>
      </UserProfileProvider>
    </QueryProvider>
  );
}
