'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  /** クリニック一覧取得エラー */
  clinicsError?: string | null;
  /** クリニック一覧が空でも所属店舗名を表示するためのフォールバック */
  fallbackClinic?: ClinicOption | null;
}

interface ClinicSelectProps {
  selectedClinicId: string | null;
  clinics: readonly ClinicOption[];
  clinicsLoading: boolean;
  clinicsError?: string | null;
  onClinicChange: (clinicId: string | null) => void;
  className?: string;
}

const EMPTY_CLINICS: readonly ClinicOption[] = [];
const BASE_CLINIC_SELECT_CLASS =
  'bg-[#2563eb] text-white px-3 py-1 rounded border border-blue-300/40';
const CLINIC_SELECT_PLACEHOLDER = '操作対象店舗を選択';
const EMPTY_CLINIC_SELECT_LABEL = '利用可能な店舗なし';
const CLINIC_SELECT_ERROR_LABEL = '店舗一覧を取得できません';
const USER_MENU_ITEM_CLASS =
  'block w-full px-4 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none';
const MOBILE_LOGOUT_LINK_CLASS =
  'block rounded-medical px-4 py-2 text-sm font-medium transition-all duration-200 ease-out hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';

interface LogoutLinkProps {
  href: string;
  className: string;
  onClick: () => void;
}

interface NotificationBadgeProps {
  show: boolean;
  label: string | number;
  variant: 'floating' | 'inline';
}

interface AdminMenuLinksProps {
  onClose: () => void;
  itemClassName: string;
}

function buildDisplayClinics(
  clinics: readonly ClinicOption[],
  fallbackClinic: ClinicOption | null
): readonly ClinicOption[] {
  if (!fallbackClinic) {
    return clinics;
  }

  if (clinics.some(clinic => clinic.id === fallbackClinic.id)) {
    return clinics;
  }

  return [fallbackClinic, ...clinics];
}

const ClinicSelect = React.memo(function ClinicSelect({
  selectedClinicId,
  clinics,
  clinicsLoading,
  clinicsError = null,
  onClinicChange,
  className,
}: ClinicSelectProps) {
  const hasClinics = clinics.length > 0;
  const placeholderLabel = hasClinics
    ? CLINIC_SELECT_PLACEHOLDER
    : clinicsError
      ? CLINIC_SELECT_ERROR_LABEL
      : EMPTY_CLINIC_SELECT_LABEL;
  const selectClassName = `${BASE_CLINIC_SELECT_CLASS}${
    selectedClinicId ? '' : ' ring-2 ring-amber-300/80'
  }${className ? ` ${className}` : ''}`;

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onClinicChange(event.target.value || null);
    },
    [onClinicChange]
  );

  return (
    <select
      aria-label='操作対象店舗'
      value={selectedClinicId ?? ''}
      onChange={handleChange}
      disabled={!hasClinics}
      title={clinicsError ?? undefined}
      className={selectClassName}
    >
      {clinicsLoading && !hasClinics ? (
        <option value=''>読み込み中...</option>
      ) : (
        <>
          <option value='' disabled>
            {placeholderLabel}
          </option>
          {clinics.map(clinic => (
            <option key={clinic.id} value={clinic.id}>
              {clinic.name}
            </option>
          ))}
        </>
      )}
    </select>
  );
});

const LogoutLink = React.memo(function LogoutLink({
  href,
  className,
  onClick,
}: LogoutLinkProps) {
  return (
    <a href={href} className={className} onClick={onClick}>
      ログアウト
    </a>
  );
});

const NotificationBadge = React.memo(function NotificationBadge({
  show,
  label,
  variant,
}: NotificationBadgeProps) {
  if (!show) return null;

  if (variant === 'inline') {
    return (
      <span className='ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white'>
        {label}
      </span>
    );
  }

  return (
    <span className='absolute -top-1 -right-1 h-4 w-4 bg-[#ef4444] rounded-full text-xs flex items-center justify-center'>
      {label}
    </span>
  );
});

const AdminMenuLinks = React.memo(function AdminMenuLinks({
  onClose,
  itemClassName,
}: AdminMenuLinksProps) {
  return (
    <>
      {ADMIN_MENU_ITEMS.map(link => (
        <Link
          key={link.id}
          href={link.href}
          className={`block ${itemClassName}`}
          onClick={onClose}
        >
          {link.label}
        </Link>
      ))}
    </>
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
  clinicsError = null,
  fallbackClinic = null,
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

  const handleSettingsClick = useCallback(() => {
    setIsNotificationsOpen(false);
    if (isAdmin) {
      setIsUserMenuOpen(false);
      setIsAdminMenuOpen(prev => !prev);
    } else {
      router.push('/settings');
    }
  }, [isAdmin, router]);

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
  const logoutHref = isAdmin ? '/admin/logout' : '/logout';
  const displayClinics = useMemo(
    () => buildDisplayClinics(clinics, fallbackClinic),
    [clinics, fallbackClinic]
  );

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
          clinics={displayClinics}
          clinicsLoading={clinicsLoading}
          clinicsError={clinicsError}
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
            <NotificationBadge
              show={showBadge}
              label={badgeLabel}
              variant='floating'
            />
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
              <AdminMenuLinks
                onClose={closeMenus}
                itemClassName='w-full text-left px-4 py-2 text-sm hover:bg-blue-50'
              />
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
            <div className='absolute right-0 z-50 mt-2 w-48 rounded-md bg-white py-2 text-gray-700 shadow-lg'>
              <div className='px-4 py-2 border-b text-xs text-gray-500'>
                {profileLoading
                  ? '情報を取得中…'
                  : (profile?.email ?? 'ゲスト')}
              </div>
              <LogoutLink
                href={logoutHref}
                className={USER_MENU_ITEM_CLASS}
                onClick={closeMenus}
              />
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
              clinics={displayClinics}
              clinicsLoading={clinicsLoading}
              clinicsError={clinicsError}
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
              <NotificationBadge
                show={showBadge}
                label={badgeLabel}
                variant='inline'
              />
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
                <AdminMenuLinks
                  onClose={closeMenus}
                  itemClassName='justify-start text-left w-full text-sm rounded-medical px-4 py-2 hover:bg-white/10'
                />
              </div>
            )}
            <LogoutLink
              href={logoutHref}
              className={MOBILE_LOGOUT_LINK_CLASS}
              onClick={closeMenus}
            />
          </div>
        </>
      )}
    </div>
  );
});
