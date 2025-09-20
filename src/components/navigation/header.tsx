'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { UserProfile } from '@/hooks/useUserProfile';

interface HeaderProps {
  onToggleSidebar: () => void;
  onToggleDarkMode: () => void;
  isDarkMode: boolean;
  profile?: UserProfile | null;
  profileLoading?: boolean;
  isAdmin?: boolean;
}

const ADMIN_LINKS = [
  { id: 'admin-home', label: '管理ダッシュボード', href: '/admin' },
  { id: 'admin-master', label: 'マスタ管理', href: '/admin/master' },
  { id: 'admin-security', label: 'セキュリティ監視', href: '/admin/security-dashboard' },
  { id: 'admin-session', label: 'セッション管理', href: '/admin/session-management' },
  { id: 'admin-settings', label: 'システム設定', href: '/admin/settings' },
  { id: 'admin-chat', label: 'AIアシスタント', href: '/admin/chat' },
];

export function Header({
  onToggleSidebar,
  onToggleDarkMode,
  isDarkMode,
  profile,
  profileLoading = false,
  isAdmin = false,
}: HeaderProps) {
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState('本店');

  const clinics = useMemo(() => {
    const base = ['本店', '新宿店', '渋谷店', '池袋店', '横浜店'];
    if (profile?.clinicId && !base.includes(profile.clinicId)) {
      return [profile.clinicId, ...base];
    }
    return base;
  }, [profile?.clinicId]);

  useEffect(() => {
    if (profile?.clinicId) {
      setSelectedClinic(profile.clinicId);
    }
  }, [profile?.clinicId]);

  const closeMenus = () => {
    setIsAdminMenuOpen(false);
    setIsUserMenuOpen(false);
  };

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
    router.push('/admin/login?redirectTo=/');
  };

  const handleNavigateHome = () => {
    closeMenus();
    router.push('/');
  };

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
            <span className='block text-xl font-bold leading-6'>ティラミス</span>
            {profile && (
              <span className='block text-xs text-blue-200 mt-0.5'>
                {profile.email ?? 'アカウント'}
                {profile.role ? ` / ${profile.role}` : ''}
              </span>
            )}
          </span>
        </button>
      </div>

      <div className='hidden md:flex items-center space-x-6 relative'>
        <select
          value={selectedClinic}
          onChange={e => setSelectedClinic(e.target.value)}
          className='bg-[#2563eb] text-white px-3 py-1 rounded'
        >
          {clinics.map(clinic => (
            <option key={clinic} value={clinic}>
              {clinic}
            </option>
          ))}
        </select>

        <div className='relative'>
          <Button variant='ghost' className='relative'>
            <span className='absolute -top-1 -right-1 h-4 w-4 bg-[#ef4444] rounded-full text-xs flex items-center justify-center'>
              3
            </span>
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
                {profileLoading ? '情報を取得中…' : profile?.email ?? 'ゲスト'}
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

      {isUserMenuOpen && (
        <div className='absolute top-16 right-4 bg-[#1e3a8a] p-4 rounded shadow-lg md:hidden w-60 space-y-3'>
          <select
            value={selectedClinic}
            onChange={e => setSelectedClinic(e.target.value)}
            className='bg-[#2563eb] text-white px-3 py-1 rounded w-full'
          >
            {clinics.map(clinic => (
              <option key={clinic} value={clinic}>
                {clinic}
              </option>
            ))}
          </select>
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
      )}
    </div>
  );
}
