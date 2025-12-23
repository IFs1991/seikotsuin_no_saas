'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/navigation/sidebar';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  isAdmin?: boolean;
  profileLoading?: boolean;
}

export function ResponsiveLayout({
  children,
  title,
  subtitle,
  className,
  isAdmin = false,
  profileLoading = false,
}: ResponsiveLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className='min-h-screen bg-gray-50'>
      <div className='desktop-only'>
        <Sidebar
          isOpen={true}
          onClose={() => {}}
          isAdmin={isAdmin}
          profileLoading={profileLoading}
        />
      </div>

      <div className='mobile-only'>
        {sidebarOpen && (
          <div
            className='fixed inset-0 z-40 bg-black bg-opacity-50'
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isAdmin={isAdmin}
          profileLoading={profileLoading}
        />
      </div>

      <main
        className={cn(
          'transition-all duration-300',
          'desktop:ml-64',
          'mobile-only:ml-0',
          'pb-20 md:pb-0'
        )}
      >
        <header
          className={cn(
            'bg-white border-b border-gray-200 shadow-sm',
            'mobile-container py-4',
            'sticky top-0 z-30'
          )}
        >
          <div className='flex items-center justify-between'>
            <div className='flex items-center space-x-4'>
              <button
                type='button'
                className={cn(
                  'md:hidden touch-target-comfortable',
                  'text-gray-500 hover:text-gray-700',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500'
                )}
                onClick={() => setSidebarOpen(true)}
                aria-label='メニューを開く'
              >
                <svg
                  className='h-6 w-6'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 6h16M4 12h16M4 18h16'
                  />
                </svg>
              </button>

              <div>
                {title && (
                  <h1 className='text-lg md:text-xl font-bold text-gray-900'>
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className='text-sm text-gray-600 mt-1'>{subtitle}</p>
                )}
              </div>
            </div>

            <div className='flex items-center space-x-2'>
              <button
                type='button'
                className={cn(
                  'desktop-only touch-target-comfortable',
                  'text-gray-400 hover:text-gray-500',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500'
                )}
                aria-label='通知'
              >
                <svg
                  className='h-6 w-6'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 17h5l-5 5v-5zM10.5 3.75a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6H4.5a6 6 0 0 1-6-6v0a6 6 0 0 1 6-6z'
                  />
                </svg>
              </button>

              <button
                type='button'
                className={cn(
                  'touch-target-comfortable rounded-full',
                  'bg-gray-200 text-gray-600 hover:bg-gray-300',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500'
                )}
                aria-label='ユーザーメニュー'
              >
                <svg
                  className='h-6 w-6'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                  />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div className={cn('mobile-container mobile-section', className)}>
          {children}
        </div>
      </main>

      <MobileBottomNav isAdmin={isAdmin} />
    </div>
  );
}

export function ResponsiveSection({
  children,
  className,
  variant = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'compact' | 'spacious';
}) {
  const variantClasses = {
    default: 'mobile-section',
    compact: 'py-2 sm:py-3 lg:py-4',
    spacious: 'py-6 sm:py-8 lg:py-12',
  };

  return (
    <section className={cn(variantClasses[variant], className)}>
      {children}
    </section>
  );
}

export function ResponsiveGrid({
  children,
  className,
  columns = { mobile: 1, tablet: 2, desktop: 3 },
}: {
  children: React.ReactNode;
  className?: string;
  columns?: { mobile?: number; tablet?: number; desktop?: number };
}) {
  const gridClasses = cn(
    'grid gap-4 md:gap-6',
    `grid-cols-${columns.mobile || 1}`,
    columns.tablet ? `md:grid-cols-${columns.tablet}` : '',
    columns.desktop ? `lg:grid-cols-${columns.desktop}` : '',
    className
  );

  return <div className={gridClasses}>{children}</div>;
}
