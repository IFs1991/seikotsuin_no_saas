/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/navigation/header';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';
import { Sidebar } from '@/components/navigation/sidebar';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';

const mockPush = jest.fn();
let mockPathname = '/admin/settings';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

const managerProfile = {
  id: 'manager-1',
  email: 'manager@example.com',
  role: 'manager',
  clinicId: 'clinic-1',
  clinicName: 'テスト院',
  isActive: true,
  isAdmin: false,
};

function renderHeader(
  props: Partial<React.ComponentProps<typeof Header>> = {}
) {
  return render(
    <SelectedClinicProvider initialClinicId={null}>
      <Header
        onToggleSidebar={jest.fn()}
        onToggleDarkMode={jest.fn()}
        isDarkMode={false}
        isAdmin
        clinics={[]}
        clinicsLoading={false}
        {...props}
      />
    </SelectedClinicProvider>
  );
}

describe('Admin navigation alignment', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockPathname = '/admin/settings';
  });

  it('Header の管理メニューから非MVP/廃止導線を除外する', async () => {
    renderHeader();

    await userEvent.click(screen.getByRole('button', { name: /管理メニュー/ }));

    expect(screen.getByText('管理ホーム')).toBeInTheDocument();
    expect(screen.getByText('クリニック管理')).toBeInTheDocument();
    expect(screen.getByText('スタッフ管理')).toBeInTheDocument();
    expect(screen.getByText('システム設定')).toBeInTheDocument();
    expect(screen.getByText('店舗比較分析')).toBeInTheDocument();
    expect(screen.getByText('AIチャット')).toBeInTheDocument();

    expect(screen.queryByText('マスタ管理')).not.toBeInTheDocument();
    expect(screen.queryByText('セキュリティ監視')).not.toBeInTheDocument();
    expect(screen.queryByText('セッション管理')).not.toBeInTheDocument();
    expect(screen.queryByText('AIアシスタント')).not.toBeInTheDocument();
  });

  it('Sidebar は HQ admin に店舗運用導線を表示しない', () => {
    render(
      <Sidebar
        isOpen
        onClose={jest.fn()}
        isAdmin
        profileLoading={false}
        role='admin'
      />
    );

    expect(screen.getByText('管理ホーム')).toBeInTheDocument();
    expect(screen.getByText('クリニック管理')).toBeInTheDocument();
    expect(screen.getByText('スタッフ管理')).toBeInTheDocument();
    expect(screen.getByText('システム設定')).toBeInTheDocument();
    expect(screen.getByText('店舗比較分析')).toBeInTheDocument();
    expect(screen.getByText('AIチャット')).toBeInTheDocument();

    expect(screen.queryByText('日報管理')).not.toBeInTheDocument();
    expect(screen.queryByText('予約管理')).not.toBeInTheDocument();
    expect(screen.queryByText('患者分析')).not.toBeInTheDocument();
    expect(screen.queryByText('収益分析')).not.toBeInTheDocument();
    expect(screen.queryByText('スタッフ分析')).not.toBeInTheDocument();
    expect(screen.getByText('スタッフ管理')).toBeInTheDocument();
    expect(screen.queryByText('クイックアクセス')).not.toBeInTheDocument();

    expect(screen.queryByText('マスタ管理')).not.toBeInTheDocument();
    expect(screen.queryByText('セキュリティ監視')).not.toBeInTheDocument();
    expect(screen.queryByText('セッション管理')).not.toBeInTheDocument();
    expect(screen.queryByText('AIアシスタント')).not.toBeInTheDocument();
  });

  it('Sidebar は clinic_admin に店舗運用導線と店舗管理に必要な導線だけを表示する', () => {
    render(
      <Sidebar
        isOpen
        onClose={jest.fn()}
        isAdmin
        profileLoading={false}
        role='clinic_admin'
      />
    );

    expect(screen.getByText('日報管理')).toBeInTheDocument();
    expect(screen.getByText('予約管理')).toBeInTheDocument();
    expect(screen.getByText('スタッフ分析')).toBeInTheDocument();
    expect(screen.getByText('スタッフ管理')).toBeInTheDocument();
    expect(screen.getByText('患者管理')).toBeInTheDocument();
    expect(screen.getByText('施術メニュー')).toBeInTheDocument();
    expect(screen.queryByText('管理ホーム')).not.toBeInTheDocument();
    expect(screen.queryByText('クリニック管理')).not.toBeInTheDocument();
    expect(screen.queryByText('システム設定')).not.toBeInTheDocument();
    expect(screen.queryByText('店舗比較分析')).not.toBeInTheDocument();
    expect(screen.queryByText('AIチャット')).not.toBeInTheDocument();
    expect(screen.queryByText('クイックアクセス')).not.toBeInTheDocument();
  });

  it('Sidebar は manager に店舗運用導線と担当エリア管理導線だけを表示する', () => {
    render(
      <Sidebar
        isOpen
        onClose={jest.fn()}
        isAdmin
        profileLoading={false}
        role='manager'
      />
    );

    expect(screen.getByText('日報管理')).toBeInTheDocument();
    expect(screen.getByText('予約管理')).toBeInTheDocument();
    expect(screen.getByText('スタッフ分析')).toBeInTheDocument();
    expect(screen.getByText('収益分析')).toBeInTheDocument();
    expect(screen.getByText('管理ホーム')).toBeInTheDocument();
    expect(screen.getByText('スタッフ管理')).toBeInTheDocument();
    expect(screen.getByText('店舗比較分析')).toBeInTheDocument();
    expect(screen.queryByText('患者管理')).not.toBeInTheDocument();
    expect(screen.queryByText('施術メニュー')).not.toBeInTheDocument();
    expect(screen.queryByText('クリニック管理')).not.toBeInTheDocument();
    expect(screen.queryByText('システム設定')).not.toBeInTheDocument();
    expect(screen.queryByText('AIチャット')).not.toBeInTheDocument();
  });

  it('Header は manager の管理メニューを担当エリア管理導線だけに限定する', async () => {
    renderHeader({
      isAdmin: false,
      canAccessAdminNavigation: true,
      profile: managerProfile,
    });

    await userEvent.click(screen.getByRole('button', { name: /管理メニュー/ }));

    expect(screen.getByText('管理ホーム')).toBeInTheDocument();
    expect(screen.getByText('スタッフ管理')).toBeInTheDocument();
    expect(screen.getByText('店舗比較分析')).toBeInTheDocument();
    expect(screen.queryByText('クリニック管理')).not.toBeInTheDocument();
    expect(screen.queryByText('システム設定')).not.toBeInTheDocument();
    expect(screen.queryByText('AIチャット')).not.toBeInTheDocument();
  });

  it('MobileBottomNav は HQ admin に店舗運用導線を表示しない', () => {
    render(<MobileBottomNav isAdmin profileLoading={false} role='admin' />);

    expect(screen.getByText('管理')).toBeInTheDocument();
    expect(screen.queryByText('ホーム')).not.toBeInTheDocument();
    expect(screen.queryByText('日報')).not.toBeInTheDocument();
    expect(screen.queryByText('予約')).not.toBeInTheDocument();
    expect(screen.queryByText('患者')).not.toBeInTheDocument();
    expect(screen.queryByText('収益')).not.toBeInTheDocument();
  });

  it('MobileBottomNav は manager の管理導線を /admin に向ける', () => {
    render(<MobileBottomNav isAdmin profileLoading={false} role='manager' />);

    const adminLink = screen.getByRole('tab', { name: /管理/ });
    expect(adminLink).toHaveAttribute('href', '/admin');
  });
});
