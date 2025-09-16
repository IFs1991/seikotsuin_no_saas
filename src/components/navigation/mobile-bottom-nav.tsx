"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  ChartBarIcon, 
  DocumentTextIcon, 
  UserGroupIcon, 
  CurrencyDollarIcon,
  SparklesIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { 
  ChartBarIcon as ChartBarIconSolid, 
  DocumentTextIcon as DocumentTextIconSolid, 
  UserGroupIcon as UserGroupIconSolid, 
  CurrencyDollarIcon as CurrencyDollarIconSolid,
  SparklesIcon as SparklesIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid
} from '@heroicons/react/24/solid';

const navigationItems = [
  {
    id: 'dashboard',
    label: 'ホーム',
    href: '/dashboard',
    icon: ChartBarIcon,
    activeIcon: ChartBarIconSolid,
  },
  {
    id: 'reports',
    label: '日報',
    href: '/daily-reports',
    icon: DocumentTextIcon,
    activeIcon: DocumentTextIconSolid,
  },
  {
    id: 'patients',
    label: '患者',
    href: '/patients',
    icon: UserGroupIcon,
    activeIcon: UserGroupIconSolid,
  },
  {
    id: 'revenue',
    label: '収益',
    href: '/revenue',
    icon: CurrencyDollarIcon,
    activeIcon: CurrencyDollarIconSolid,
  },
  {
    id: 'ai',
    label: 'AI',
    href: '/ai-insights',
    icon: SparklesIcon,
    activeIcon: SparklesIconSolid,
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/' || pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className={cn(
      "md:hidden fixed bottom-0 left-0 right-0 z-50",
      "bg-white border-t border-gray-200 shadow-lg",
      "pb-safe-area-bottom" // iOS safe area対応
    )}>
      <div className="grid grid-cols-5 h-16">
        {navigationItems.map((item) => {
          const active = isActive(item.href);
          const Icon = active ? item.activeIcon : item.icon;
          
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center",
                "touch-target-comfortable", // WCAG 2.2対応
                "transition-colors duration-200",
                "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                "focus-no-obscure", // フォーカス時の要素隠れ防止
                active 
                  ? "text-primary-600 bg-primary-50" 
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              )}
              role="tab"
              aria-selected={active}
              tabIndex={0}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ページ用のコンテナコンポーネント（ボトムナビゲーション分のマージン確保）
export function MobileAwarePage({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(
      "min-h-screen",
      "md:pb-0 pb-20" // モバイルではボトムナビゲーション分のマージン
    )}>
      {children}
      <MobileBottomNav />
    </div>
  );
}