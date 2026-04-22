'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { UserProfile } from '@/types/user-profile';
import { useSelectedClinic } from '@/providers/selected-clinic-context';
import { ADMIN_MENU_ITEMS } from '@/lib/navigation/items';
import { useAdminNotifications } from '@/hooks/useAdminNotifications';
import { AdminNotificationsMenu } from './admin-notifications-menu';

interface ClinicOption {
  id: string;
  name: string;
}

interface HeaderProps {
  onToggleSidebar: () => void;
  onToggleDarkMode: () => void;
  isDarkMode: boolean;
  profile?: UserProfile | null;
  profileLoading?: boolean;
  isAdmin?: boolean;
  /** 動的通知件数（0 または未指定でバッジ非表示） */
  notificationCount?: number;
  /** クリニック一覧（DBから取得） */
  clinics?: readonly ClinicOption[];
  /** クリニック一覧取得中フラグ */
  clinicsLoading?: boolean;
}

interface ClinicSelectProps {
  selectedClinicId: string | null;
  clinics: readonly ClinicOption[];
  clinicsLoading: boolean;
  onClinicChange: (clinicId: string | null) => void;
  className?: string;
}

const EMPTY_CLINICS: readonly ClinicOption[] = [];
const BASE_CLINIC_SELECT_CLASS = 'bg-[#2563eb] text-white px-3 py-1 rounded';

const ClinicSelect = React.memo(function ClinicSelect({
  selectedClinicId,
  clinics,
  clinicsLoading,
  onClinicChange,
  className,
}: ClinicSelectProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onClinicChange(event.target.value || null);
    },
    [onClinicChange]
  );

  return (
    <select
      value={selectedClinicId ?? ''}
      onChange={handleChange}
      disabled={clinicsLoading}
      className={`${BASE_CLINIC_SELECT_CLASS}${className ? ` ${className}` : ''}`}
    >
      {clinicsLoading ? (
        <option value=''>読み込み中...</option>
      ) : (
        clinics.map(clinic => (
          <option key={clinic.id} value={clinic.id}>
            {clinic.name}
          </option>
        ))
      )}
    </select>
  );
});

export const Header = React.memo(function Header({
  onToggleSidebar,
  onToggleDarkMode,
  isDarkMode,
  profile,
  profileLoading = false,
  isAdmin = false,
  notificationCount,
  clinics = EMPTY_CLINICS,
  clinicsLoading = false,
}: HeaderProps) {
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const { selectedClinicId, setSelectedClinicId } = useSelectedClinic();
  const adminNotifications = useAdminNotifications({
    clinicId: selectedClinicId,
    enabled: isAdmin && Boolean(selectedClinicId),
    limit: isNotificationsOpen ? 10 : 0,
  });
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    updating: notificationsUpdating,
    error: notificationsError,
    realtimeStatus,
    refresh: refreshNotifications,
    markAsRead,
    markAllAsRead,
  } = adminNotifications;

  const closeMenus = useCallback(() => {
    setIsAdminMenuOpen(false);
    setIsUserMenuOpen(false);
    setIsNotificationsOpen(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeMenus]);

  const handleAdminLink = useCallback(
    (href: string) => {
      closeMenus();
      router.push(href);
    },
    [closeMenus, router]
  );

  const handleSettingsClick = useCallback(() => {
    setIsNotificationsOpen(false);
    if (isAdmin) {
      setIsUserMenuOpen(false);
      setIsAdminMenuOpen(prev => !prev);
    } else {
      router.push('/settings');
    }
  }, [isAdmin, router]);

  const handleLogout = useCallback(() => {
    closeMenus();
    router.push(isAdmin ? '/admin/logout' : '/logout');
  }, [closeMenus, isAdmin, router]);

  const handleNavigateHome = useCallback(() => {
    closeMenus();
    router.push('/');
  }, [closeMenus, router]);

  const handleToggleUserMenu = useCallback(() => {
    setIsAdminMenuOpen(false);
    setIsNotificationsOpen(false);
    setIsUserMenuOpen(prev => !prev);
  }, []);

  const handleToggleNotifications = useCallback(() => {
    setIsAdminMenuOpen(false);
    setIsUserMenuOpen(false);
    setIsNotificationsOpen(prev => !prev);
  }, []);

  const handleToggleMobileNotifications = useCallback(() => {
    setIsAdminMenuOpen(false);
    setIsNotificationsOpen(prev => !prev);
  }, []);

  const handleRefreshNotifications = useCallback(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  const handleMarkNotificationAsRead = useCallback(
    (notificationId: string) => {
      void markAsRead(notificationId);
    },
    [markAsRead]
  );

  const handleMarkAllNotificationsAsRead = useCallback(() => {
    void markAllAsRead();
  }, [markAllAsRead]);

  const handleClinicChange = useCallback(
    (clinicId: string | null) => {
      setIsNotificationsOpen(false);
      setSelectedClinicId(clinicId);
    },
    [setSelectedClinicId]
  );

  const effectiveNotificationCount = notificationCount ?? unreadCount;
  const showBadge = effectiveNotificationCount > 0;
  const badgeLabel =
    effectiveNotificationCount >= 100 ? '99+' : effectiveNotificationCount;

  return (
    <div className='fixed top-0 left-0 right-0 z-50 w-full px-4 py-2 bg-[#1e3a8a] text-white flex items-center justify-between'>
      <div className='flex items-center gap-4'>
        <Button
          variant='ghost'
          onClick={onToggleSidebar}
          className='text-white hover:bg-blue-700 md:hidden'
          aria-label='メニューを開閉'
        >
          ☰
        </Button>
        <button
          type='button'
          onClick={handleNavigateHome}
          className='flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-200 rounded-md px-1'
          aria-label='トップページへ移動'
        >
          <span className='w-8 h-8 bg-white rounded-full flex items-center justify-center text-blue-600 font-bold text-sm'>
            骨
          </span>
          <span className='text-left'>
            <span className='block text-xl font-bold leading-6'>
              ティラミス
            </span>
            {profile && (
              <span className='block text-xs text-blue-200 mt-0.5'>
                {profile.email ?? 'アカウント'}
                {profile.role ? ` / ${profile.role}` : ''}
              </span>
            )}
          </span>
        </button>
      </div>

      {/* デスクトップメニュー */}
      <div className='hidden md:flex items-center space-x-6 relative'>
        <ClinicSelect
          selectedClinicId={selectedClinicId}
          clinics={clinics}
          clinicsLoading={clinicsLoading}
          onClinicChange={handleClinicChange}
        />

        <div className='relative'>
          {isNotificationsOpen && (
            <div
              className='fixed inset-0 z-40'
              onClick={closeMenus}
              aria-hidden='true'
            />
          )}
          <Button
            variant='ghost'
            className='relative text-white hover:bg-blue-700'
            onClick={handleToggleNotifications}
            aria-expanded={isNotificationsOpen}
            aria-haspopup='dialog'
          >
            {showBadge && (
              <span className='absolute -top-1 -right-1 h-4 w-4 bg-[#ef4444] rounded-full text-xs flex items-center justify-center'>
                {badgeLabel}
              </span>
            )}
            通知
          </Button>
          {isNotificationsOpen && (
            <AdminNotificationsMenu
              notifications={notifications}
              unreadCount={effectiveNotificationCount}
              loading={notificationsLoading}
              updating={notificationsUpdating}
              error={notificationsError}
              realtimeStatus={realtimeStatus}
              onRefresh={handleRefreshNotifications}
              onMarkAsRead={handleMarkNotificationAsRead}
              onMarkAllAsRead={handleMarkAllNotificationsAsRead}
              className='absolute right-0 top-full z-50 mt-2'
            />
          )}
        </div>

        <div className='relative'>
          <Button
            variant='ghost'
            onClick={handleSettingsClick}
            className='flex items-center'
          >
            {isAdmin ? '管理メニュー' : '設定'}
            <span className='ml-1'>{isAdmin ? '▾' : ''}</span>
          </Button>

          {isAdmin && isAdminMenuOpen && (
            <div className='absolute right-0 mt-2 w-56 rounded-md bg-white shadow-lg py-2 text-gray-700'>
              {ADMIN_MENU_ITEMS.map(link => (
                <button
                  key={link.id}
                  type='button'
                  className='w-full text-left px-4 py-2 text-sm hover:bg-blue-50'
                  onClick={() => handleAdminLink(link.href)}
                >
                  {link.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          variant='ghost'
          onClick={onToggleDarkMode}
          className='text-white hover:bg-blue-700'
        >
          {isDarkMode ? '🌙' : '☀️'}
        </Button>

        <div className='relative'>
          <Button
            variant='ghost'
            className='text-white hover:bg-blue-700'
            onClick={handleToggleUserMenu}
          >
            ユーザー
          </Button>

          {isUserMenuOpen && (
            <div className='absolute right-0 mt-2 w-48 rounded-md bg-white shadow-lg py-2 text-gray-700'>
              <div className='px-4 py-2 border-b text-xs text-gray-500'>
                {profileLoading
                  ? '情報を取得中…'
                  : (profile?.email ?? 'ゲスト')}
              </div>
              <button
                type='button'
                className='w-full text-left px-4 py-2 text-sm hover:bg-blue-50'
                onClick={handleLogout}
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>

      {/* モバイルメニューボタン */}
      <Button
        variant='ghost'
        className='md:hidden'
        onClick={handleToggleUserMenu}
      >
        メニュー
      </Button>

      {isUserMenuOpen && (
        <>
          <div
            className='fixed inset-0 z-40'
            onClick={closeMenus}
            aria-hidden='true'
          />
          <div className='absolute top-16 right-4 bg-[#1e3a8a] p-4 rounded shadow-lg md:hidden w-60 space-y-3 z-50'>
            <ClinicSelect
              selectedClinicId={selectedClinicId}
              clinics={clinics}
              clinicsLoading={clinicsLoading}
              onClinicChange={handleClinicChange}
              className='w-full'
            />
            <Button
              variant='ghost'
              className='relative w-full justify-start'
              onClick={handleToggleMobileNotifications}
              aria-expanded={isNotificationsOpen}
              aria-haspopup='dialog'
            >
              通知
              {showBadge && (
                <span className='ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white'>
                  {badgeLabel}
                </span>
              )}
            </Button>
            {isNotificationsOpen && (
              <AdminNotificationsMenu
                notifications={notifications}
                unreadCount={effectiveNotificationCount}
                loading={notificationsLoading}
                updating={notificationsUpdating}
                error={notificationsError}
                realtimeStatus={realtimeStatus}
                onRefresh={handleRefreshNotifications}
                onMarkAsRead={handleMarkNotificationAsRead}
                onMarkAllAsRead={handleMarkAllNotificationsAsRead}
                className='w-full max-w-none'
              />
            )}
            <Button variant='ghost' onClick={onToggleDarkMode}>
              {isDarkMode ? '🌙 ダーク' : '☀️ ライト'}
            </Button>
            {isAdmin && (
              <div className='rounded bg-blue-900/50 p-2 space-y-1'>
                <p className='text-xs text-blue-100'>管理メニュー</p>
                {ADMIN_MENU_ITEMS.map(link => (
                  <Button
                    key={link.id}
                    variant='ghost'
                    className='justify-start text-left w-full text-sm'
                    onClick={() => handleAdminLink(link.href)}
                  >
                    {link.label}
                  </Button>
                ))}
              </div>
            )}
            <Button variant='ghost' onClick={handleLogout}>
              ログアウト
            </Button>
          </div>
        </>
      )}
    </div>
  );
});
