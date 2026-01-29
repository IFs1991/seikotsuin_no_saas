/** @jest-environment jsdom */

// =================================================================
// useRevenue Hook Tests - 収益分析フックのテスト
// =================================================================

import { renderHook, waitFor } from '@testing-library/react';
import { useRevenue } from '../../hooks/useRevenue';
import * as apiClient from '../../lib/api-client';

jest.mock('../../lib/api-client');
const mockApi = apiClient as jest.Mocked<typeof apiClient>;

describe('useRevenue', () => {
  const mockClinicId = '123e4567-e89b-12d3-a456-426614174000';
  const mockRevenueData = {
    dailyRevenue: 150000,
    weeklyRevenue: 980000,
    monthlyRevenue: 4200000,
    insuranceRevenue: 2520000,
    selfPayRevenue: 1680000,
    menuRanking: [
      { menu_name: '整体', total_revenue: 1200000, transaction_count: 120 },
      {
        menu_name: 'マッサージ',
        total_revenue: 800000,
        transaction_count: 160,
      },
      { menu_name: '鍼灸', total_revenue: 600000, transaction_count: 60 },
    ],
    hourlyRevenue: [
      { hour: 10, revenue: 50000 },
      { hour: 14, revenue: 80000 },
    ],
    growthRate: '+10.5%',
    revenueForecast: 4500000,
    costAnalysis: '35%',
    revenueTrends: [],
    staffRevenueContribution: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.isSuccessResponse.mockImplementation((response: any) =>
      Boolean(response?.success)
    );
    mockApi.isErrorResponse.mockImplementation(
      (response: any) => response?.success === false
    );
    (mockApi.api.revenue.getAnalysis as jest.Mock).mockReset();
  });

  describe('clinicId必須バリデーション', () => {
    it('clinicIdが空文字の場合はAPIを呼ばずエラー状態になる', async () => {
      const { result } = renderHook(() => useRevenue(''));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('clinic_idは必須です');
      expect(mockApi.api.revenue.getAnalysis).not.toHaveBeenCalled();
    });

    it('clinicIdがnullの場合はAPIを呼ばずエラー状態になる', async () => {
      const { result } = renderHook(() =>
        useRevenue(null as unknown as string)
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('clinic_idは必須です');
      expect(mockApi.api.revenue.getAnalysis).not.toHaveBeenCalled();
    });

    it('clinicIdがundefinedの場合はAPIを呼ばずエラー状態になる', async () => {
      const { result } = renderHook(() =>
        useRevenue(undefined as unknown as string)
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('clinic_idは必須です');
      expect(mockApi.api.revenue.getAnalysis).not.toHaveBeenCalled();
    });
  });

  describe('正常系', () => {
    it('clinicIdが指定されている場合はAPIからデータを取得する', async () => {
      (mockApi.api.revenue.getAnalysis as jest.Mock).mockResolvedValueOnce({
        success: true,
        data: mockRevenueData,
      });

      const { result } = renderHook(() => useRevenue(mockClinicId));

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.dailyRevenue).toBe(150000);
      expect(result.current.monthlyRevenue).toBe(4200000);
      expect(result.current.insuranceRevenue).toBe(2520000);
      expect(result.current.selfPayRevenue).toBe(1680000);
      expect(mockApi.api.revenue.getAnalysis).toHaveBeenCalledWith(
        mockClinicId
      );
    });

    it('menuRankingが正しくマッピングされる', async () => {
      (mockApi.api.revenue.getAnalysis as jest.Mock).mockResolvedValueOnce({
        success: true,
        data: mockRevenueData,
      });

      const { result } = renderHook(() => useRevenue(mockClinicId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.menuRanking).toEqual([
        { menu: '整体', revenue: 1200000, count: 120 },
        { menu: 'マッサージ', revenue: 800000, count: 160 },
        { menu: '鍼灸', revenue: 600000, count: 60 },
      ]);
    });
  });

  describe('サンプル値排除', () => {
    it('初期状態ではサンプル値ではなく空/ゼロ値になる', () => {
      const { result } = renderHook(() => useRevenue(mockClinicId));

      // ローディング中は初期値
      expect(result.current.dailyRevenue).toBe(0);
      expect(result.current.weeklyRevenue).toBe(0);
      expect(result.current.monthlyRevenue).toBe(0);
      expect(result.current.menuRanking).toEqual([]);
    });

    it('APIエラー時もサンプル値にフォールバックしない', async () => {
      (mockApi.api.revenue.getAnalysis as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: { message: 'API Error' },
      });

      const { result } = renderHook(() => useRevenue(mockClinicId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.dailyRevenue).toBe(0);
      expect(result.current.monthlyRevenue).toBe(0);
    });
  });

  describe('APIエラーハンドリング', () => {
    it('APIがエラーを返した場合はエラー状態になる', async () => {
      const mockError = {
        code: 'CLINIC_NOT_FOUND',
        message: '店舗が見つかりません',
        timestamp: '2024-01-15T10:00:00Z',
      };

      (mockApi.api.revenue.getAnalysis as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: mockError,
      });

      const { result } = renderHook(() => useRevenue(mockClinicId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('店舗が見つかりません');
    });

    it('ネットワークエラーの場合もエラー状態になる', async () => {
      (mockApi.api.revenue.getAnalysis as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useRevenue(mockClinicId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('収益データの取得に失敗しました');
    });
  });
});
