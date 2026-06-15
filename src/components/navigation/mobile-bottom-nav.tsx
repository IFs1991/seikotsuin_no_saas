'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  getAdminNavigationHrefForRole,
  getNavigationMode,
  isAiInsightsEnabled,
} from '@/lib/navigation/items';
import { isTherapistRole } from '@/lib/constants/roles';
import {
  BarChart3,
  FileText,
  Users,
  DollarSign,
  Sparkles,
  ShieldCheck,
  Calendar,
} from 'lucide-react';

interface MobileNavigationItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  activeIcon?: React.ComponentType<{ className?: string }>;
}

const BASE_ITEMS: readonly MobileNavigationItem[] = [
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
    id: 'reservations',
    label: '予約',
    href: '/reservations',
    icon: Calendar,
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

const AI_INSIGHTS_HREF = '/ai-insights';
const BASE_ITEMS_WITHOUT_AI: readonly MobileNavigationItem[] =
  BASE_ITEMS.filter(item => item.href !== AI_INSIGHTS_HREF);
const THERAPIST_MOBILE_ITEMS: readonly MobileNavigationItem[] = [
  {
    id: 'reservations',
    label: '予約',
    href: '/reservations',
    icon: Calendar,
  },
  {
    id: 'reports',
    label: '日報',
    href: '/daily-reports',
    icon: FileText,
  },
  {
    id: 'shift-requests',
    label: 'シフト',
    href: '/staff/shift-requests',
    icon: Users,
  },
];

const DEFAULT_ADMIN_ITEM: MobileNavigationItem = {
  id: 'admin',
  label: '管理',
  href: '/admin',
  icon: ShieldCheck,
};

const AREA_MANAGER_ADMIN_ITEM: MobileNavigationItem = {
  ...DEFAULT_ADMIN_ITEM,
  href: '/manager',
};

const ADMIN_ONLY_ITEMS: readonly MobileNavigationItem[] = [DEFAULT_ADMIN_ITEM];
const BASE_ITEMS_WITH_ADMIN: readonly MobileNavigationItem[] = [
  ...BASE_ITEMS,
  DEFAULT_ADMIN_ITEM,
];
const BASE_ITEMS_WITHOUT_AI_WITH_ADMIN: readonly MobileNavigationItem[] = [
  ...BASE_ITEMS_WITHOUT_AI,
  DEFAULT_ADMIN_ITEM,
];
const BASE_ITEMS_WITH_AREA_MANAGER_ADMIN: readonly MobileNavigationItem[] = [
  ...BASE_ITEMS,
  AREA_MANAGER_ADMIN_ITEM,
];
const BASE_ITEMS_WITHOUT_AI_WITH_AREA_MANAGER_ADMIN: readonly MobileNavigationItem[] =
  [...BASE_ITEMS_WITHOUT_AI, AREA_MANAGER_ADMIN_ITEM];
const EMPTY_MOBILE_NAVIGATION_ITEMS: readonly MobileNavigationItem[] = [];

interface MobileBottomNavProps {
  isAdmin?: boolean;
  profileLoading?: boolean;
  role?: string | null;
}

export function getMobileNavigationItems({
  isAdmin,
  profileLoading,
  role,
}: Required<MobileBottomNavProps>): readonly MobileNavigationItem[] {
  const navigationMode = getNavigationMode({
    role,
    profileLoading,
    canAccessAdminNavigation: isAdmin,
  });

  if (!navigationMode.showOperationMenus && !navigationMode.showAdminMenus) {
    return EMPTY_MOBILE_NAVIGATION_ITEMS;
  }

  if (isTherapistRole(navigationMode.role)) {
    return THERAPIST_MOBILE_ITEMS;
  }

  const aiInsightsEnabled = isAiInsightsEnabled();

  if (navigationMode.isHqAdmin) {
    return ADMIN_ONLY_ITEMS;
  }

  if (navigationMode.showAdminMenus) {
    const adminHref = getAdminNavigationHrefForRole(navigationMode.role);
    if (adminHref === DEFAULT_ADMIN_ITEM.href) {
      return aiInsightsEnabled
        ? BASE_ITEMS_WITH_ADMIN
        : BASE_ITEMS_WITHOUT_AI_WITH_ADMIN;
    }

    return aiInsightsEnabled
      ? BASE_ITEMS_WITH_AREA_MANAGER_ADMIN
      : BASE_ITEMS_WITHOUT_AI_WITH_AREA_MANAGER_ADMIN;
  }

  return aiInsightsEnabled ? BASE_ITEMS : BASE_ITEMS_WITHOUT_AI;
}

export function MobileBottomNav({
  isAdmin = false,
  profileLoading = false,
  role = null,
}: MobileBottomNavProps) {
  const pathname = usePathname();

  const navigationItems = useMemo(
    () => getMobileNavigationItems({ isAdmin, profileLoading, role }),
    [isAdmin, profileLoading, role]
  );
  const gridStyle = useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: `repeat(${navigationItems.length}, minmax(0, 1fr))`,
    }),
    [navigationItems.length]
  );

  if (navigationItems.length === 0) {
    return null;
  }

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
      <div className='grid h-16' style={gridStyle}>
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
  profileLoading = false,
  role = null,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
  profileLoading?: boolean;
  role?: string | null;
}) {
  return (
    <div className={cn('min-h-screen', 'md:pb-0 pb-20')}>
      {children}
      <MobileBottomNav
        isAdmin={isAdmin}
        profileLoading={profileLoading}
        role={role}
      />
    </div>
  );
}
