'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface SidebarMenuItem {
  id: string;
  label: string;
  href: string;
  subItems?: SidebarMenuItem[];
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  profileLoading?: boolean;
}

const CORE_MENU: SidebarMenuItem[] = [
  { id: 'home', label: 'トップ', href: '/' },
  { id: 'dashboard', label: 'ダッシュボード', href: '/dashboard' },
  {
    id: 'daily-reports',
    label: '日報管理',
    href: '/daily-reports',
    subItems: [
      { id: 'daily-input', label: '日報入力', href: '/daily-reports/input' },
      { id: 'daily-list', label: '日報一覧', href: '/daily-reports' },
    ],
  },
  {
    id: 'reservations',
    label: '予約管理',
    href: '/reservations',
    subItems: [
      {
        id: 'reservation-timeline',
        label: 'タイムライン',
        href: '/reservations',
      },
      {
        id: 'reservation-register',
        label: '新規予約',
        href: '/reservations?view=register',
      },
      {
        id: 'reservation-list',
        label: '予約一覧',
        href: '/reservations?view=list',
      },
    ],
  },
  { id: 'patients', label: '患者分析', href: '/patients' },
  { id: 'revenue', label: '収益分析', href: '/revenue' },
  { id: 'staff', label: 'スタッフ管理', href: '/staff' },
  { id: 'ai-insights', label: 'AI分析', href: '/ai-insights' },
];

const ADMIN_MENU: SidebarMenuItem[] = [
  { id: 'admin', label: '管理ダッシュボード', href: '/admin' },
  { id: 'admin-master', label: 'マスタ管理', href: '/admin/master' },
  {
    id: 'admin-security',
    label: 'セキュリティ監視',
    href: '/admin/security-dashboard',
  },
  {
    id: 'admin-session',
    label: 'セッション管理',
    href: '/admin/session-management',
  },
  { id: 'admin-settings', label: 'システム設定', href: '/admin/settings' },
  { id: 'admin-chat', label: 'AIアシスタント', href: '/admin/chat' },
  { id: 'multi-store', label: 'マルチ店舗分析', href: '/multi-store' },
];

const QUICK_ACCESS: SidebarMenuItem[] = [
  { id: 'quick-daily-input', label: '日報入力', href: '/daily-reports/input' },
  {
    id: 'quick-reservation',
    label: '新規予約',
    href: '/reservations?view=register',
  },
  { id: 'quick-patient', label: '患者検索', href: '/patients' },
  { id: 'quick-revenue', label: '収益レポート', href: '/revenue' },
];

export function Sidebar({
  isOpen,
  onClose,
  isAdmin = false,
  profileLoading = false,
}: SidebarProps) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(true);
  const [openSubMenus, setOpenSubMenus] = useState<string[]>([]);

  const menuItems = useMemo(() => CORE_MENU, []);

  const currentMenuId = useMemo(() => {
    if (pathname === '/' || pathname === '') {
      return 'home';
    }

    const candidates = [
      ...CORE_MENU.filter(item => item.href !== '/'),
      ...ADMIN_MENU.flatMap(item => [item, ...(item.subItems ?? [])]),
    ];

    const match = candidates.find(item =>
      pathname.startsWith(item.href.split('?')[0])
    );
    return match?.id ?? '';
  }, [pathname]);

  const toggleSubMenu = (menuId: string) => {
    setOpenSubMenus(prev =>
      prev.includes(menuId)
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  const renderMenuButton = (item: SidebarMenuItem) => (
    <Link key={item.id} href={item.href} className='w-full'>
      <Button
        variant='ghost'
        className={cn(
          'w-full mb-2 justify-start',
          currentMenuId === item.id ? 'bg-[#2d4ba0]' : 'hover:bg-[#2d4ba0]'
        )}
        onClick={e => {
          if (item.subItems && item.subItems.length > 0 && isExpanded) {
            e.preventDefault();
            toggleSubMenu(item.id);
          } else {
            onClose();
          }
        }}
        title={item.label}
      >
        <span
          className={cn(
            'mr-2 text-xs uppercase tracking-wide',
            !isExpanded && 'hidden'
          )}
        >
          ●
        </span>
        {isExpanded ? item.label : item.label.slice(0, 2)}
      </Button>
    </Link>
  );

  return (
    <div
      className={cn(
        'fixed left-0 top-16 h-screen bg-[#1e3a8a] text-white transition-all duration-300 z-40',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0',
        isExpanded ? 'w-64' : 'w-20'
      )}
    >
      <div className='p-4 flex justify-between items-center border-b border-[#2d4ba0]'>
        <h1
          className={cn(
            'font-bold text-sm tracking-wide',
            !isExpanded && 'hidden'
          )}
        >
          整骨院管理
        </h1>
        <Button
          onClick={() => setIsExpanded(prev => !prev)}
          variant='ghost'
          className='text-white hover:bg-[#2d4ba0]'
        >
          {isExpanded ? '←' : '→'}
        </Button>
      </div>

      <div className='p-4 overflow-y-auto h-[calc(100%-64px)] space-y-6'>
        <div>
          <p
            className={cn(
              'text-xs text-blue-100 uppercase tracking-[0.2em]',
              !isExpanded && 'hidden'
            )}
          >
            メインメニュー
          </p>
          <div className='mt-2'>
            {menuItems.map(item => (
              <div key={item.id}>
                {renderMenuButton(item)}

                {item.subItems &&
                  isExpanded &&
                  openSubMenus.includes(item.id) && (
                    <div className='ml-4'>
                      {item.subItems.map(subItem => (
                        <Link
                          key={subItem.id}
                          href={subItem.href}
                          className='w-full'
                        >
                          <Button
                            variant='ghost'
                            className={cn(
                              'w-full mb-1 justify-start text-sm',
                              currentMenuId === subItem.id
                                ? 'bg-[#2d4ba0]'
                                : 'hover:bg-[#2d4ba0]'
                            )}
                            onClick={onClose}
                          >
                            {subItem.label}
                          </Button>
                        </Link>
                      ))}
                    </div>
                  )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <Separator className='my-4 bg-[#2d4ba0]' />
          {isExpanded && (
            <div className='mb-4'>
              <h2 className='text-sm font-bold mb-2'>クイックアクセス</h2>
              {QUICK_ACCESS.map(item => (
                <Link key={item.id} href={item.href} className='w-full'>
                  <Button
                    variant='ghost'
                    className='w-full mb-1 justify-start text-sm'
                    onClick={onClose}
                  >
                    {item.label}
                  </Button>
                </Link>
              ))}
            </div>
          )}
        </div>

        {isAdmin && !profileLoading && (
          <div>
            <Separator className='my-4 bg-[#2d4ba0]' />
            <div className={cn('space-y-2', !isExpanded && 'space-y-0')}>
              {isExpanded && (
                <h2 className='text-sm font-bold mb-1 text-blue-100'>
                  管理セクション
                </h2>
              )}
              {ADMIN_MENU.map(item => (
                <Link key={item.id} href={item.href} className='w-full'>
                  <Button
                    variant='ghost'
                    className={cn(
                      'w-full mb-1 justify-start text-sm',
                      currentMenuId === item.id
                        ? 'bg-[#2d4ba0]'
                        : 'hover:bg-[#2d4ba0]'
                    )}
                    onClick={onClose}
                    title={item.label}
                  >
                    {isExpanded ? item.label : item.label.slice(0, 2)}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        )}

        {profileLoading && (
          <div className='text-xs text-blue-100'>
            ロール情報を取得しています…
          </div>
        )}
      </div>
    </div>
  );
}
