'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  ClipboardList,
  CreditCard,
  Home,
  JapaneseYen,
  MessageSquare,
  Settings,
  Sparkles,
  Stethoscope,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  ADMIN_MENU_ITEMS,
  getCurrentNavigationItemId,
  getAdminMenuItemsForRole,
  getNavigationMode,
  getOperationMenuItemsForRole,
  getVisibleNavigationItems,
  type NavigationItem,
} from '@/lib/navigation/items';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  profileLoading?: boolean;
  role?: string | null;
}

interface SidebarItemButtonProps {
  item: NavigationItem;
  isActive: boolean;
  className: string;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  children: React.ReactNode;
}

const ACTIVE_MENU_CLASS =
  'bg-primary-800 border-l-4 border-white/70 font-semibold';
const INACTIVE_MENU_CLASS =
  'border-l-4 border-transparent hover:bg-primary-800';

// メニューIDごとの視覚手がかり。折りたたみ時はアイコンのみで判別できるようにする
const NAVIGATION_ICONS: Record<string, LucideIcon> = {
  dashboard: Home,
  'daily-reports': ClipboardList,
  reservations: CalendarDays,
  patients: Users,
  revenue: JapaneseYen,
  staff: UserCog,
  'shift-requests': CalendarClock,
  'ai-insights': Sparkles,
  'manager-staff-analysis': UserCog,
  admin: Home,
  'admin-tenants': Building2,
  'admin-billing': CreditCard,
  'admin-users': Users,
  'admin-managers': UserCog,
  'admin-shift-requests': CalendarClock,
  'admin-settings': Settings,
  'multi-store': BarChart3,
  'admin-chat': MessageSquare,
  'clinic-shift-requests': CalendarClock,
  'clinic-patients': Users,
  'clinic-menu-settings': Stethoscope,
  'manager-home': Home,
  'manager-staff-list': Users,
};

function getNavigationIcon(itemId: string): LucideIcon {
  return NAVIGATION_ICONS[itemId] ?? CircleDot;
}

function SidebarItemButton({
  item,
  isActive,
  className,
  onClick,
  children,
}: SidebarItemButtonProps) {
  return (
    <Link href={item.href} className='w-full'>
      <Button
        variant='ghost'
        className={cn(
          className,
          isActive ? ACTIVE_MENU_CLASS : INACTIVE_MENU_CLASS
        )}
        onClick={onClick}
        title={item.label}
      >
        {children}
      </Button>
    </Link>
  );
}

export const Sidebar = React.memo(function Sidebar({
  isOpen,
  onClose,
  isAdmin = false,
  profileLoading = false,
  role = null,
}: SidebarProps) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(true);
  const [openSubMenus, setOpenSubMenus] = useState<string[]>([]);
  const navigationMode = useMemo(
    () =>
      getNavigationMode({
        role,
        profileLoading,
        canAccessAdminNavigation: isAdmin,
      }),
    [isAdmin, profileLoading, role]
  );

  const operationMenuItems = useMemo(
    () => getOperationMenuItemsForRole(navigationMode.role),
    [navigationMode.role]
  );
  const primaryMenuItems = useMemo(
    () => (navigationMode.isHqAdmin ? ADMIN_MENU_ITEMS : operationMenuItems),
    [navigationMode.isHqAdmin, operationMenuItems]
  );
  const adminSectionMenuItems = useMemo(
    () => getAdminMenuItemsForRole(navigationMode.role),
    [navigationMode.role]
  );
  const openSubMenuIds = useMemo(() => new Set(openSubMenus), [openSubMenus]);

  const currentMenuId = useMemo(() => {
    const visibleItems = getVisibleNavigationItems(navigationMode);
    return getCurrentNavigationItemId(pathname, visibleItems);
  }, [navigationMode, pathname]);

  // 現在ページを含む親メニューは自動で開き、現在地を見失わせない
  useEffect(() => {
    if (!currentMenuId) return;
    const parent = primaryMenuItems.find(item =>
      item.subItems?.some(subItem => subItem.id === currentMenuId)
    );
    if (!parent) return;
    setOpenSubMenus(prev =>
      prev.includes(parent.id) ? prev : [...prev, parent.id]
    );
  }, [currentMenuId, primaryMenuItems]);

  const toggleSubMenu = useCallback((menuId: string) => {
    setOpenSubMenus(prev =>
      prev.includes(menuId)
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  }, []);

  const handleToggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleCloseMenu = useCallback<
    React.MouseEventHandler<HTMLButtonElement>
  >(() => {
    onClose();
  }, [onClose]);

  const renderMenuButton = useCallback(
    (item: NavigationItem) => {
      const hasSubItems = Boolean(item.subItems?.length);
      const isSubMenuOpen = openSubMenuIds.has(item.id);
      const Icon = getNavigationIcon(item.id);
      const handleClick: React.MouseEventHandler<HTMLButtonElement> = event => {
        if (hasSubItems && isExpanded) {
          event.preventDefault();
          toggleSubMenu(item.id);
          return;
        }

        onClose();
      };

      return (
        <SidebarItemButton
          key={item.id}
          item={item}
          isActive={currentMenuId === item.id}
          className={cn(
            'w-full mb-2 min-h-11',
            isExpanded ? 'justify-start' : 'justify-center px-0'
          )}
          onClick={handleClick}
        >
          <Icon
            className={cn('h-5 w-5 flex-shrink-0', isExpanded && 'mr-2')}
            aria-hidden='true'
          />
          {isExpanded && <span className='flex-1 text-left'>{item.label}</span>}
          {isExpanded && hasSubItems && (
            <ChevronDown
              className={cn(
                'ml-1 h-4 w-4 flex-shrink-0 transition-transform duration-200',
                isSubMenuOpen && 'rotate-180'
              )}
              aria-hidden='true'
            />
          )}
        </SidebarItemButton>
      );
    },
    [currentMenuId, isExpanded, onClose, openSubMenuIds, toggleSubMenu]
  );

  return (
    <div
      className={cn(
        'fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] overflow-hidden bg-primary-600 text-white shadow-xl transition-all duration-300',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        'md:sticky md:translate-x-0 md:flex-shrink-0 md:shadow-none',
        isExpanded ? 'w-64' : 'w-20'
      )}
    >
      <div className='p-4 flex justify-between items-center border-b border-primary-800'>
        <h1
          className={cn(
            'font-bold text-sm tracking-wide',
            !isExpanded && 'hidden'
          )}
        >
          整骨院管理
        </h1>
        <Button
          onClick={handleToggleExpanded}
          variant='ghost'
          className={cn(
            'text-white hover:bg-primary-800',
            !isExpanded && 'mx-auto'
          )}
          aria-label={isExpanded ? 'メニューを折りたたむ' : 'メニューを広げる'}
          title={isExpanded ? 'メニューを折りたたむ' : 'メニューを広げる'}
        >
          {isExpanded ? (
            <ChevronsLeft className='h-5 w-5' aria-hidden='true' />
          ) : (
            <ChevronsRight className='h-5 w-5' aria-hidden='true' />
          )}
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
            {navigationMode.isHqAdmin ? '管理メニュー' : 'メインメニュー'}
          </p>
          <div className='mt-2'>
            {profileLoading ? (
              <div className='text-xs text-blue-100'>
                ロール情報を取得しています…
              </div>
            ) : (
              primaryMenuItems.map(item => (
                <div key={item.id}>
                  {renderMenuButton(item)}

                  {item.subItems &&
                    isExpanded &&
                    openSubMenuIds.has(item.id) && (
                      <div className='ml-4'>
                        {item.subItems.map(subItem => (
                          <SidebarItemButton
                            key={subItem.id}
                            item={subItem}
                            isActive={currentMenuId === subItem.id}
                            className='w-full mb-1 justify-start text-sm'
                            onClick={handleCloseMenu}
                          >
                            {subItem.label}
                          </SidebarItemButton>
                        ))}
                      </div>
                    )}
                </div>
              ))
            )}
          </div>
        </div>

        {navigationMode.showAdminMenus && !navigationMode.isHqAdmin && (
          <div>
            <Separator className='my-4 bg-primary-800' />
            <div className={cn('space-y-2', !isExpanded && 'space-y-0')}>
              {isExpanded && (
                <h2 className='text-sm font-bold mb-1 text-blue-100'>
                  管理セクション
                </h2>
              )}
              {adminSectionMenuItems.map(item => {
                const Icon = getNavigationIcon(item.id);
                return (
                  <SidebarItemButton
                    key={item.id}
                    item={item}
                    isActive={currentMenuId === item.id}
                    className={cn(
                      'w-full mb-1 min-h-11 text-sm',
                      isExpanded ? 'justify-start' : 'justify-center px-0'
                    )}
                    onClick={handleCloseMenu}
                  >
                    <Icon
                      className={cn(
                        'h-5 w-5 flex-shrink-0',
                        isExpanded && 'mr-2'
                      )}
                      aria-hidden='true'
                    />
                    {isExpanded && (
                      <span className='flex-1 text-left'>{item.label}</span>
                    )}
                  </SidebarItemButton>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
