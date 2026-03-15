/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/navigation/header';
import { Sidebar } from '@/components/navigation/sidebar';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';

const mockPush = jest.fn();
let mockPathname = '/admin/settings';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

function renderHeader() {
  return render(
    <SelectedClinicProvider initialClinicId={null}>
      <Header
        onToggleSidebar={jest.fn()}
        onToggleDarkMode={jest.fn()}
        isDarkMode={false}
        isAdmin
        clinics={[]}
        clinicsLoading={false}
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

    expect(screen.getByText('管理ダッシュボード')).toBeInTheDocument();
    expect(screen.getByText('クリニック管理')).toBeInTheDocument();
    expect(screen.getByText('ユーザー権限')).toBeInTheDocument();
    expect(screen.getByText('システム設定')).toBeInTheDocument();
    expect(screen.getByText('多店舗分析')).toBeInTheDocument();

    expect(screen.queryByText('マスタ管理')).not.toBeInTheDocument();
    expect(screen.queryByText('セキュリティ監視')).not.toBeInTheDocument();
    expect(screen.queryByText('セッション管理')).not.toBeInTheDocument();
    expect(screen.queryByText('AIアシスタント')).not.toBeInTheDocument();
  });

  it('Sidebar の管理セクションから非MVP/廃止導線を除外する', () => {
    render(
      <Sidebar isOpen onClose={jest.fn()} isAdmin profileLoading={false} />
    );

    expect(screen.getByText('管理ダッシュボード')).toBeInTheDocument();
    expect(screen.getByText('クリニック管理')).toBeInTheDocument();
    expect(screen.getByText('ユーザー権限')).toBeInTheDocument();
    expect(screen.getByText('システム設定')).toBeInTheDocument();
    expect(screen.getByText('多店舗分析')).toBeInTheDocument();

    expect(screen.queryByText('マスタ管理')).not.toBeInTheDocument();
    expect(screen.queryByText('セキュリティ監視')).not.toBeInTheDocument();
    expect(screen.queryByText('セッション管理')).not.toBeInTheDocument();
    expect(screen.queryByText('AIアシスタント')).not.toBeInTheDocument();
  });
});
