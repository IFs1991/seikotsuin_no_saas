/** @jest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import * as apiClient from '@/lib/api-client';

jest.mock('@/lib/api-client');

const mockApi = apiClient as jest.Mocked<typeof apiClient>;

describe('useNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockApi.isSuccessResponse.mockImplementation((response: any) =>
      Boolean(response?.success)
    );
    mockApi.isErrorResponse.mockImplementation(
      (response: any) => response?.success === false
    );
    mockApi.handleApiError.mockImplementation(
      (error: any) => error?.message ?? 'error'
    );
  });

  it('TC-NH01: マウント時に通知を取得する', async () => {
    (mockApi.api.notifications.get as jest.Mock).mockResolvedValueOnce({
      success: true,
      data: {
        notifications: [
          {
            id: 'n-1',
            title: '通知',
            message: '本文',
            type: 'appointment_reminder',
            is_read: false,
            created_at: '2026-02-27T00:00:00Z',
          },
        ],
        unreadCount: 1,
        total: 1,
      },
    });

    (mockApi.api.notifications.getUnreadCount as jest.Mock).mockResolvedValue({
      success: true,
      data: { notifications: [], unreadCount: 1, total: 1 },
    });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(mockApi.api.notifications.get).toHaveBeenCalled();
  });

  it('TC-NH02: unreadCount が state に反映される', async () => {
    (mockApi.api.notifications.get as jest.Mock).mockResolvedValueOnce({
      success: true,
      data: {
        notifications: [],
        unreadCount: 3,
        total: 10,
      },
    });

    (mockApi.api.notifications.getUnreadCount as jest.Mock).mockResolvedValue({
      success: true,
      data: { notifications: [], unreadCount: 3, total: 10 },
    });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(3);
    });
  });

  it('TC-NH03: エラー時に error state が設定される', async () => {
    (mockApi.api.notifications.get as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: { message: '通知取得エラー' },
    });

    (mockApi.api.notifications.getUnreadCount as jest.Mock).mockResolvedValue({
      success: true,
      data: { notifications: [], unreadCount: 0, total: 0 },
    });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('通知取得エラー');
  });

  it('TC-NH04: 30秒ごとに未読件数をポーリングする', async () => {
    jest.useFakeTimers();

    (mockApi.api.notifications.get as jest.Mock).mockResolvedValueOnce({
      success: true,
      data: {
        notifications: [],
        unreadCount: 1,
        total: 1,
      },
    });

    (mockApi.api.notifications.getUnreadCount as jest.Mock)
      .mockResolvedValueOnce({
        success: true,
        data: { notifications: [], unreadCount: 1, total: 1 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { notifications: [], unreadCount: 2, total: 1 },
      });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(2);
    });

    expect(mockApi.api.notifications.getUnreadCount).toHaveBeenCalledTimes(2);
  });
});
