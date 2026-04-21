'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  ADMIN_MENU_ITEMS,
  QUICK_ACCESS_ITEMS,
  getCurrentNavigationItemId,
  getNavigationMode,
  getOperationMenuItems,
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

const ACTIVE_MENU_CLASS = 'bg-[#2d4ba0]';
const INACTIVE_MENU_CLASS = 'hover:bg-[#2d4ba0]';

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

export function Sidebar({
  isOpen,
  onClose,
  isAdmin = false,
  profileLoading = false,
  role = null,
}: SidebarProps) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(true);
  const [openSubMenus, setOpenSubMenus] = useState<string[]>([]);
  const navigationMode = getNavigationMode({
    role,
    profileLoading,
    canAccessAdminNavigation: isAdmin,
  });

  const operationMenuItems = useMemo(() => getOperationMenuItems(), []);
  const primaryMenuItems = navigationMode.isHqAdmin
    ? ADMIN_MENU_ITEMS
    : operationMenuItems;

  const currentMenuId = useMemo(() => {
    const visibleItems = [
      ...(navigationMode.showOperationMenus ? operationMenuItems : []),
      ...(navigationMode.showAdminMenus ? ADMIN_MENU_ITEMS : []),
    ];
    return getCurrentNavigationItemId(pathname, visibleItems);
  }, [
    navigationMode.showAdminMenus,
    navigationMode.showOperationMenus,
    operationMenuItems,
    pathname,
  ]);

  const toggleSubMenu = (menuId: string) => {
    setOpenSubMenus(prev =>
      prev.includes(menuId)
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  const renderMenuButton = (item: NavigationItem) => {
    const hasSubItems = Boolean(item.subItems?.length);
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
        className='w-full mb-2 justify-start'
        onClick={handleClick}
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
      </SidebarItemButton>
    );
  };

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
                    openSubMenus.includes(item.id) && (
                      <div className='ml-4'>
                        {item.subItems.map(subItem => (
                          <SidebarItemButton
                            key={subItem.id}
                            item={subItem}
                            isActive={currentMenuId === subItem.id}
                            className='w-full mb-1 justify-start text-sm'
                            onClick={() => onClose()}
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

        {navigationMode.showOperationMenus && (
          <div>
            <Separator className='my-4 bg-[#2d4ba0]' />
            {isExpanded && (
              <div className='mb-4'>
                <h2 className='text-sm font-bold mb-2'>クイックアクセス</h2>
                {QUICK_ACCESS_ITEMS.map(item => (
                  <SidebarItemButton
                    key={item.id}
                    item={item}
                    isActive={currentMenuId === item.id}
                    className='w-full mb-1 justify-start text-sm'
                    onClick={() => onClose()}
                  >
                    {item.label}
                  </SidebarItemButton>
                ))}
              </div>
            )}
          </div>
        )}

        {navigationMode.showAdminMenus && !navigationMode.isHqAdmin && (
          <div>
            <Separator className='my-4 bg-[#2d4ba0]' />
            <div className={cn('space-y-2', !isExpanded && 'space-y-0')}>
              {isExpanded && (
                <h2 className='text-sm font-bold mb-1 text-blue-100'>
                  管理セクション
                </h2>
              )}
              {ADMIN_MENU_ITEMS.map(item => (
                <SidebarItemButton
                  key={item.id}
                  item={item}
                  isActive={currentMenuId === item.id}
                  className='w-full mb-1 justify-start text-sm'
                  onClick={() => onClose()}
                >
                  {isExpanded ? item.label : item.label.slice(0, 2)}
                </SidebarItemButton>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
