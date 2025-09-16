'use client';

import React from 'react';
import { Header } from '@/components/navigation/header';
import { Sidebar } from '@/components/navigation/sidebar';

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  React.useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    setIsDarkMode(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
    
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb' }}>
      <Header 
        onToggleSidebar={toggleSidebar}
        onToggleDarkMode={toggleDarkMode}
        isDarkMode={isDarkMode}
      />
      
      <div className="flex" style={{ paddingTop: '64px' }}>
        <Sidebar 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        
        <main 
          className={`flex-1 transition-all duration-300 ${
            isSidebarOpen ? 'lg:ml-64' : 'lg:ml-0'
          }`}
          style={{ 
            backgroundColor: isDarkMode ? '#111827' : '#ffffff',
            minHeight: 'calc(100vh - 64px)'
          }}
        >
          <div className="p-6 lg:p-8">
            <div 
              className="mx-auto max-w-7xl"
              style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}
            >
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}