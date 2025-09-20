// =================================================================
// useDashboard Hook Tests - ダッシュボードフックのテスト
// =================================================================

import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import useDashboard from '../../hooks/useDashboard';
import * as apiClient from '../../lib/api-client';

// Mock api client
jest.mock('../../lib/api-client');
const mockApi = apiClient as jest.Mocked<typeof apiClient>;

// Mock関数の型定義を修正
const mockFetchDashboardData = jest.fn() as jest.MockedFunction<
  typeof apiClient.fetchDashboardData
>;

// Mock window.location
const mockLocation = {
  href: '',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

describe('useDashboard', () => {
  const mockClinicId = '123e4567-e89b-12d3-a456-426614174000';
  const mockDashboardData = {
    dailyData: {
      revenue: 50000,
      patients: 25,
      insuranceRevenue: 30000,
      privateRevenue: 20000,
    },
    aiComment: {
      id: 'comment-1',
      summary: 'Test summary',
      highlights: ['Good performance'],
      improvements: ['可以改进'],
      suggestions: ['Continue current strategy'],
      created_at: '2024-01-15T10:00:00Z',
    },
    revenueChartData: [
      { name: '2024-01-14', 総売上: 45000, 保険診療: 27000, 自費診療: 18000 },
      { name: '2024-01-15', 総売上: 50000, 保険診療: 30000, 自費診療: 20000 },
    ],
    heatmapData: [
      { hour_of_day: 9, day_of_week: 1, visit_count: 5, avg_revenue: 2000 },
      { hour_of_day: 10, day_of_week: 1, visit_count: 8, avg_revenue: 2500 },
    ],
    alerts: ['高い収益を記録しました'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.href = '';
    // モック関数を設定
    mockApi.fetchDashboardData = mockFetchDashboardData;
  });

  it('should fetch dashboard data successfully', async () => {
    mockFetchDashboardData.mockResolvedValueOnce({
      success: true,
      data: mockDashboardData,
    });

    const { result } = renderHook(() => useDashboard(mockClinicId));

    expect(result.current.loading).toBe(true);
    expect(result.current.dashboardData).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dashboardData).toEqual(mockDashboardData);
    expect(result.current.error).toBeNull();
    expect(mockFetchDashboardData).toHaveBeenCalledWith(mockClinicId);
  });

  it('should handle API error', async () => {
    const mockError = {
      code: 'CLINIC_NOT_FOUND',
      message: '店舗が見つかりません',
      timestamp: '2024-01-15T10:00:00Z',
    };

    mockFetchDashboardData.mockResolvedValueOnce({
      success: false,
      error: mockError,
    });

    mockApi.isErrorResponse.mockReturnValueOnce(true);
    mockApi.handleApiError.mockReturnValueOnce('店舗が見つかりません');

    const { result } = renderHook(() => useDashboard(mockClinicId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dashboardData).toBeNull();
    expect(result.current.error).toBe('店舗が見つかりません');
  });

  it('should handle network error', async () => {
    mockFetchDashboardData.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useDashboard(mockClinicId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(
      'ダッシュボードデータの取得に失敗しました'
    );
  });

  it('should handle missing clinic ID', async () => {
    const { result } = renderHook(() => useDashboard(''));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Clinic ID is required');
    expect(mockApi.api.dashboard.get).not.toHaveBeenCalled();
  });

  it('should refetch data when refetch is called', async () => {
    mockFetchDashboardData.mockResolvedValue({
      success: true,
      data: mockDashboardData,
    });

    const { result } = renderHook(() => useDashboard(mockClinicId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApi.api.dashboard.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockApi.api.dashboard.get).toHaveBeenCalledTimes(2);
  });

  describe('handleQuickAction', () => {
    it('should navigate to daily reports', async () => {
      mockFetchDashboardData.mockResolvedValueOnce({
        success: true,
        data: mockDashboardData,
      });

      const { result } = renderHook(() => useDashboard(mockClinicId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleQuickAction('daily-report');
      });

      expect(mockLocation.href).toBe('/daily-reports');
    });

    it('should navigate to patients page', async () => {
      mockFetchDashboardData.mockResolvedValueOnce({
        success: true,
        data: mockDashboardData,
      });

      const { result } = renderHook(() => useDashboard(mockClinicId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleQuickAction('appointments');
      });

      expect(mockLocation.href).toBe('/patients');
    });

    it('should navigate to chat page', async () => {
      mockFetchDashboardData.mockResolvedValueOnce({
        success: true,
        data: mockDashboardData,
      });

      const { result } = renderHook(() => useDashboard(mockClinicId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleQuickAction('ai-chat');
      });

      expect(mockLocation.href).toBe('/chat');
    });

    it('should handle unknown action', async () => {
      mockFetchDashboardData.mockResolvedValueOnce({
        success: true,
        data: mockDashboardData,
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = renderHook(() => useDashboard(mockClinicId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.handleQuickAction('unknown-action');
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unknown quick action:',
        'unknown-action'
      );
      expect(mockLocation.href).toBe('');

      consoleSpy.mockRestore();
    });
  });

  it('should use default clinic ID when not provided', async () => {
    // Mock environment variable
    const originalEnv = process.env.NEXT_PUBLIC_DEFAULT_CLINIC_ID;
    process.env.NEXT_PUBLIC_DEFAULT_CLINIC_ID = 'default-test-id';

    mockFetchDashboardData.mockResolvedValueOnce({
      success: true,
      data: mockDashboardData,
    });

    const { result } = renderHook(() => useDashboard());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApi.api.dashboard.get).toHaveBeenCalledWith('default-test-id');

    // Restore environment variable
    process.env.NEXT_PUBLIC_DEFAULT_CLINIC_ID = originalEnv;
  });
});
