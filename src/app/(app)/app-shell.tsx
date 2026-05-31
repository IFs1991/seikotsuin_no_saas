'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
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
import { canAccessAdminUIWithCompat } from '@/lib/constants/roles';
import { resolveInitialSelectedClinicId } from '@/lib/clinics/selection';

const DARK_CLASS = 'dark';

function buildFallbackClinic(
  clinicId: string | null,
  clinicName: string | null
) {
  if (!clinicId || !clinicName) {
    return null;
  }

  return {
    id: clinicId,
    name: clinicName,
  };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
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
    error: clinicsError,
  } = useAccessibleClinics();

  const profileRole = profile?.role ?? null;
  const profileClinicId = profile?.clinicId ?? null;

  const canAccessAdminNavigation = React.useMemo(
    () => canUseAdminNavigation(profileRole),
    [profileRole]
  );
  const canAccessAdminUI = React.useMemo(
    () => canAccessAdminUIWithCompat(profileRole),
    [profileRole]
  );

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

  const toggleDarkMode = React.useCallback(() => {
    setIsDarkMode(currentMode => {
      const newMode = !currentMode;
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', newMode ? 'dark' : 'light');
      }

      if (newMode) {
        document.documentElement.classList.add(DARK_CLASS);
      } else {
        document.documentElement.classList.remove(DARK_CLASS);
      }

      return newMode;
    });
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = React.useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const userProfileContextValue = React.useMemo(
    () => ({
      profile,
      loading: profileLoading,
      error: profileError,
    }),
    [profile, profileError, profileLoading]
  );

  const initialClinicId = React.useMemo(
    () =>
      resolveInitialSelectedClinicId({
        profileClinicId,
        currentClinicId,
        clinics,
      }),
    [clinics, currentClinicId, profileClinicId]
  );
  const fallbackClinic = React.useMemo(
    () =>
      buildFallbackClinic(
        profile?.clinicId ?? null,
        profile?.clinicName ?? null
      ),
    [profile?.clinicId, profile?.clinicName]
  );
  const shouldShowLegalFooter = !pathname.startsWith('/reservations');

  return (
    <QueryProvider>
      <UserProfileProvider value={userProfileContextValue}>
        <SelectedClinicProvider
          initialClinicId={initialClinicId}
          clinics={clinics}
          currentClinicId={currentClinicId}
          clinicsLoading={clinicsLoading}
          clinicsError={clinicsError}
        >
          <div
            className={
              isDarkMode
                ? 'min-h-screen bg-gray-800'
                : 'min-h-screen bg-gray-50'
            }
          >
            <Header
              onToggleSidebar={toggleSidebar}
              onToggleDarkMode={toggleDarkMode}
              isDarkMode={isDarkMode}
              profile={profile}
              profileLoading={profileLoading}
              isAdmin={canAccessAdminUI}
              canAccessAdminNavigation={canAccessAdminNavigation}
              clinics={clinics}
              clinicsLoading={clinicsLoading}
              clinicsError={clinicsError}
              fallbackClinic={fallbackClinic}
            />

            <div className='flex pt-16'>
              {isSidebarOpen && (
                <div
                  className='fixed inset-0 top-16 z-30 bg-black/40 md:hidden'
                  onClick={closeSidebar}
                  aria-hidden='true'
                />
              )}

              <Sidebar
                isOpen={isSidebarOpen}
                onClose={closeSidebar}
                isAdmin={canAccessAdminNavigation}
                profileLoading={profileLoading}
                role={profileRole}
              />

              <main
                className={
                  isDarkMode
                    ? 'min-h-[calc(100vh-4rem)] min-w-0 flex-1 bg-gray-900 transition-colors duration-300'
                    : 'min-h-[calc(100vh-4rem)] min-w-0 flex-1 bg-white transition-colors duration-300'
                }
              >
                <div className='p-6 lg:p-8'>
                  <div
                    className={
                      isDarkMode
                        ? 'mx-auto max-w-7xl text-gray-100'
                        : 'mx-auto max-w-7xl text-gray-900'
                    }
                  >
                    {children}
                  </div>
                  {shouldShowLegalFooter && (
                    <footer className='mx-auto mt-10 max-w-7xl border-t border-slate-200 pt-4 text-sm text-slate-500'>
                      <LegalFooterLinks />
                    </footer>
                  )}
                </div>
              </main>
            </div>

            <MobileBottomNav
              isAdmin={canAccessAdminNavigation}
              profileLoading={profileLoading}
              role={profileRole}
            />
          </div>
        </SelectedClinicProvider>
      </UserProfileProvider>
    </QueryProvider>
  );
}
