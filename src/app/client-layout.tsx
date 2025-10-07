'use client';

import React from 'react';
import { Header } from '@/components/navigation/header';
import { Sidebar } from '@/components/navigation/sidebar';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UserProfileProvider } from '@/providers/user-profile-context';

interface ClientLayoutProps {
  children: React.ReactNode;
}

const DARK_CLASS = 'dark';

export function ClientLayout({ children }: ClientLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfile();

  const isAdmin = profile?.isAdmin ?? false;

  React.useEffect(() => {
    const savedTheme = typeof window !== 'undefined'
      ? localStorage.getItem('theme')
      : null;
    const prefersDark = typeof window !== 'undefined'
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
    <UserProfileProvider
      value={{ profile, loading: profileLoading, error: profileError }}
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
            </div>
          </main>
        </div>

        <MobileBottomNav isAdmin={isAdmin} />
      </div>
    </UserProfileProvider>
  );
}
