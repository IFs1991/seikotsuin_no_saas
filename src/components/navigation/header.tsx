'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { UserProfile } from '@/types/user-profile';
import { useSelectedClinic } from '@/providers/selected-clinic-context';

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
  clinics?: Array<{ id: string; name: string }>;
  /** クリニック一覧取得中フラグ */
  clinicsLoading?: boolean;
}

const ADMIN_LINKS = [
  { id: 'admin-home', label: '管理ダッシュボード', href: '/admin' },
  { id: 'admin-tenants', label: 'クリニック管理', href: '/admin/tenants' },
  { id: 'admin-users', label: 'ユーザー権限', href: '/admin/users' },
  { id: 'admin-settings', label: 'システム設定', href: '/admin/settings' },
  { id: 'multi-store', label: '多店舗分析', href: '/multi-store' },
];

export function Header({
  onToggleSidebar,
  onToggleDarkMode,
  isDarkMode,
  profile,
  profileLoading = false,
  isAdmin = false,
  notificationCount,
  clinics = [],
  clinicsLoading = false,
}: HeaderProps) {
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const { selectedClinicId, setSelectedClinicId } = useSelectedClinic();

  // Task E: useCallback でメモ化して ESC ハンドラーの依存に使う
  const closeMenus = useCallback(() => {
    setIsAdminMenuOpen(false);
    setIsUserMenuOpen(false);
  }, []);

  // Task E: ESC キーでメニューを閉じる
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeMenus]);

  const handleAdminLink = (href: string) => {
    closeMenus();
    router.push(href);
  };

  const handleSettingsClick = () => {
    if (isAdmin) {
      setIsUserMenuOpen(false);
      setIsAdminMenuOpen(prev => !prev);
    } else {
      router.push('/settings');
    }
  };

  const handleLogout = () => {
    closeMenus();
    router.push(isAdmin ? '/admin/logout' : '/logout');
  };

  const handleNavigateHome = () => {
    closeMenus();
    router.push('/');
  };

  // Task B: クリニック選択セレクト（デスクトップ・モバイル共通）
  const clinicSelect = (extraClassName?: string) => (
    <select
      value={selectedClinicId ?? ''}
      onChange={e => setSelectedClinicId(e.target.value || null)}
      disabled={clinicsLoading}
      className={`bg-[#2563eb] text-white px-3 py-1 rounded${extraClassName ? ` ${extraClassName}` : ''}`}
    >
      {clinicsLoading ? (
        <option value=''>読み込み中...</option>
      ) : (
        clinics.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))
      )}
    </select>
  );

  // Task A: 通知バッジ（0 または未指定で非表示、99 件超は '99+' 表示）
  const showBadge = (notificationCount ?? 0) > 0;
  const badgeLabel =
    (notificationCount ?? 0) >= 100 ? '99+' : notificationCount;

  return (
    <div className='fixed top-0 left-0 right-0 z-50 w-full px-4 py-2 bg-[#1e3a8a] text-white flex items-center justify-between'>
      <div className='flex items-center space-x-4'>
        <Button
          variant='ghost'
          onClick={onToggleSidebar}
          className='text-white hover:bg-blue-700'
          aria-label='メニューを開閉'
        >
          ☰
        </Button>
        <button
          type='button'
          onClick={handleNavigateHome}
          className='flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-200 rounded-md px-1'
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
        {clinicSelect()}

        <div className='relative'>
          <Button variant='ghost' className='relative'>
            {showBadge && (
              <span className='absolute -top-1 -right-1 h-4 w-4 bg-[#ef4444] rounded-full text-xs flex items-center justify-center'>
                {badgeLabel}
              </span>
            )}
            通知
          </Button>
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
              {ADMIN_LINKS.map(link => (
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
            onClick={() => {
              setIsAdminMenuOpen(false);
              setIsUserMenuOpen(prev => !prev);
            }}
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
        onClick={() => {
          setIsAdminMenuOpen(false);
          setIsUserMenuOpen(prev => !prev);
        }}
      >
        メニュー
      </Button>

      {/* Task E: モバイルメニュー + backdrop */}
      {isUserMenuOpen && (
        <>
          <div
            className='fixed inset-0 z-40'
            onClick={closeMenus}
            aria-hidden='true'
          />
          <div className='absolute top-16 right-4 bg-[#1e3a8a] p-4 rounded shadow-lg md:hidden w-60 space-y-3 z-50'>
            {clinicSelect('w-full')}
            <Button variant='ghost'>通知</Button>
            <Button variant='ghost' onClick={onToggleDarkMode}>
              {isDarkMode ? '🌙 ダーク' : '☀️ ライト'}
            </Button>
            {isAdmin && (
              <div className='rounded bg-blue-900/50 p-2 space-y-1'>
                <p className='text-xs text-blue-100'>管理メニュー</p>
                {ADMIN_LINKS.map(link => (
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
}
