/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/navigation/header';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';
import { useAdminNotifications } from '@/hooks/useAdminNotifications';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
}));

jest.mock('@/hooks/useAdminNotifications', () => ({
  useAdminNotifications: jest.fn(),
}));

const useAdminNotificationsMock = useAdminNotifications as jest.Mock;

function renderHeader(
  props: Partial<React.ComponentProps<typeof Header>> = {}
) {
  return render(
    <SelectedClinicProvider initialClinicId='clinic-1'>
      <Header
        onToggleSidebar={jest.fn()}
        onToggleDarkMode={jest.fn()}
        isDarkMode={false}
        clinics={[{ id: 'clinic-1', name: '本院' }]}
        clinicsLoading={false}
        {...props}
      />
    </SelectedClinicProvider>
  );
}

describe('Header logout menu', () => {
  beforeEach(() => {
    useAdminNotificationsMock.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      total: 0,
      loading: false,
      updating: false,
      error: null,
      realtimeStatus: 'disabled',
      refresh: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
    });
  });

  it('adminユーザーのログアウトリンクはadminログアウトページへ遷移する', async () => {
    const user = userEvent.setup();
    renderHeader({ isAdmin: true });

    await user.click(screen.getByRole('button', { name: 'ユーザー' }));

    expect(screen.getAllByRole('link', { name: 'ログアウト' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: 'http://localhost/admin/logout' }),
      ])
    );
  });

  it('店舗ユーザーのログアウトリンクは通常ログアウトページへ遷移する', async () => {
    const user = userEvent.setup();
    renderHeader({ isAdmin: false });

    await user.click(screen.getByRole('button', { name: 'ユーザー' }));

    expect(screen.getAllByRole('link', { name: 'ログアウト' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: 'http://localhost/logout' }),
      ])
    );
  });
});
