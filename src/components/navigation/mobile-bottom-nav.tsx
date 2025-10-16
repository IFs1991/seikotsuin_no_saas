'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  FileText,
  Users,
  DollarSign,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  activeIcon?: React.ComponentType<{ className?: string }>;
}

const BASE_ITEMS: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'ホーム',
    href: '/dashboard',
    icon: BarChart3,
  },
  {
    id: 'reports',
    label: '日報',
    href: '/daily-reports',
    icon: FileText,
  },
  {
    id: 'patients',
    label: '患者',
    href: '/patients',
    icon: Users,
  },
  {
    id: 'revenue',
    label: '収益',
    href: '/revenue',
    icon: DollarSign,
  },
  {
    id: 'ai',
    label: 'AI',
    href: '/ai-insights',
    icon: Sparkles,
  },
];

const ADMIN_ITEM: NavigationItem = {
  id: 'admin',
  label: '管理',
  href: '/admin',
  icon: ShieldCheck,
};

interface MobileBottomNavProps {
  isAdmin?: boolean;
}

export function MobileBottomNav({ isAdmin = false }: MobileBottomNavProps) {
  const pathname = usePathname();

  const navigationItems = useMemo(() => {
    if (isAdmin) {
      return [...BASE_ITEMS, ADMIN_ITEM];
    }
    return BASE_ITEMS;
  }, [isAdmin]);

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/' || pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      className={cn(
        'md:hidden fixed bottom-0 left-0 right-0 z-50',
        'bg-white border-t border-gray-200 shadow-lg',
        'pb-safe-area-bottom'
      )}
    >
      <div
        className='grid h-16'
        style={{
          gridTemplateColumns: `repeat(${navigationItems.length}, minmax(0, 1fr))`,
        }}
      >
        {navigationItems.map(item => {
          const active = isActive(item.href);
          const Icon = active && item.activeIcon ? item.activeIcon : item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center',
                'touch-target-comfortable',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                'focus-no-obscure',
                active
                  ? 'text-primary-600 bg-primary-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
              role='tab'
              aria-selected={active}
              tabIndex={0}
            >
              <Icon className='w-5 h-5 mb-1' />
              <span className='text-xs font-medium leading-none'>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileAwarePage({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  return (
    <div className={cn('min-h-screen', 'md:pb-0 pb-20')}>
      {children}
      <MobileBottomNav isAdmin={isAdmin} />
    </div>
  );
}
