/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/navigation/header';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';
import { useAdminNotifications } from '@/hooks/useAdminNotifications';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/useAdminNotifications', () => ({
  useAdminNotifications: jest.fn(),
}));

const useAdminNotificationsMock = useAdminNotifications as jest.Mock;
const markAsReadMock = jest.fn();
const markAllAsReadMock = jest.fn();
const refreshMock = jest.fn();

function renderHeader() {
  return render(
    <SelectedClinicProvider initialClinicId='clinic-1'>
      <Header
        onToggleSidebar={jest.fn()}
        onToggleDarkMode={jest.fn()}
        isDarkMode={false}
        isAdmin
        clinics={[{ id: 'clinic-1', name: '本院' }]}
        clinicsLoading={false}
      />
    </SelectedClinicProvider>
  );
}

describe('Header admin notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAdminNotificationsMock.mockReturnValue({
      notifications: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          user_id: 'admin-1',
          clinic_id: 'clinic-1',
          title: '重要なセキュリティ通知',
          message: '不審な操作を検知しました',
          type: 'security',
          is_read: false,
          related_entity_type: null,
          related_entity_id: null,
          created_at: '2026-04-22T00:00:00Z',
          read_at: null,
        },
      ],
      unreadCount: 1,
      total: 1,
      loading: false,
      updating: false,
      error: null,
      realtimeStatus: 'connected',
      refresh: refreshMock,
      markAsRead: markAsReadMock,
      markAllAsRead: markAllAsReadMock,
    });
  });

  it('通知ボタンで一覧を開き、個別既読と全既読を実行できる', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: /通知/ }));

    const menu = screen.getByRole('region', { name: '通知一覧' });
    expect(
      within(menu).getByText('重要なセキュリティ通知')
    ).toBeInTheDocument();
    expect(
      within(menu).getByText('不審な操作を検知しました')
    ).toBeInTheDocument();
    expect(
      within(menu).getByText('未読 1件 / リアルタイム接続中')
    ).toBeInTheDocument();

    await user.click(within(menu).getByRole('button', { name: '既読' }));
    expect(markAsReadMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111'
    );

    await user.click(within(menu).getByRole('button', { name: '全て既読' }));
    expect(markAllAsReadMock).toHaveBeenCalledTimes(1);
  });

  it('メニューを開くまでは未読数だけを取得し、開いた時に一覧取得へ切り替える', async () => {
    const user = userEvent.setup();
    renderHeader();

    expect(useAdminNotificationsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 0 })
    );

    await user.click(screen.getByRole('button', { name: /通知/ }));

    expect(useAdminNotificationsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 10 })
    );
  });
});
