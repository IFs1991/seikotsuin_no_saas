/** @jest-environment jsdom */

/**
 * useMultiStore Hook テスト（TDD）
 *
 * 仕様:
 * - 多店舗KPI比較データを取得
 * - admin/clinic_admin のみ使用可能
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useMultiStore } from '../../hooks/useMultiStore';

// fetchのモック
const mockFetch = jest.fn();
beforeAll(() => {
  global.fetch = mockFetch;
});

describe('useMultiStore', () => {
  const mockClinicData = [
    {
      id: 'clinic-1',
      name: 'テストクリニック1',
      address: '東京都渋谷区',
      phone_number: '03-1234-5678',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      kpi: {
        revenue: 500000,
        patients: 150,
        staff_performance_score: 4.5,
      },
    },
    {
      id: 'clinic-2',
      name: 'テストクリニック2',
      address: '大阪府大阪市',
      phone_number: '06-1234-5678',
      is_active: true,
      created_at: '2024-01-02T00:00:00Z',
      kpi: {
        revenue: 300000,
        patients: 100,
        staff_performance_score: 4.2,
      },
    },
  ];

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('初期状態', () => {
    it('初期状態ではclinicsは空配列', () => {
      const { result } = renderHook(() => useMultiStore());

      expect(result.current.clinics).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('データ取得', () => {
    it('fetchClinicsWithKPI でKPIデータを含むクリニック一覧を取得', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: mockClinicData } }),
      });

      const { result } = renderHook(() => useMultiStore());

      await act(async () => {
        await result.current.fetchClinicsWithKPI();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.clinics).toHaveLength(2);
      expect(result.current.clinics[0].kpi).toBeDefined();
      expect(result.current.clinics[0].kpi?.revenue).toBe(500000);
      expect(result.current.clinics[0].kpi?.patients).toBe(150);
      expect(result.current.clinics[0].kpi?.staff_performance_score).toBe(4.5);
    });

    it('include_kpi=true パラメータでAPIを呼び出す', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: mockClinicData } }),
      });

      const { result } = renderHook(() => useMultiStore());

      await act(async () => {
        await result.current.fetchClinicsWithKPI();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('include_kpi=true'),
        expect.any(Object)
      );
    });
  });

  describe('エラーハンドリング', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('API失敗時にエラーメッセージを設定', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: '権限がありません' }),
      });

      const { result } = renderHook(() => useMultiStore());

      await act(async () => {
        await result.current.fetchClinicsWithKPI();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('権限がありません');
      expect(result.current.clinics).toEqual([]);
    });

    it('ネットワークエラー時にエラーメッセージを設定', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useMultiStore());

      await act(async () => {
        await result.current.fetchClinicsWithKPI();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
    });
  });

  describe('ローディング状態', () => {
    it('データ取得中はloadingがtrue', async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(pendingPromise);

      const { result } = renderHook(() => useMultiStore());

      act(() => {
        result.current.fetchClinicsWithKPI();
      });

      expect(result.current.loading).toBe(true);

      // Promiseを解決してクリーンアップ
      resolvePromise!({
        ok: true,
        json: async () => ({ success: true, data: { items: [] } }),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('ソート機能', () => {
    it('収益順でソートできる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: mockClinicData } }),
      });

      const { result } = renderHook(() => useMultiStore());

      await act(async () => {
        await result.current.fetchClinicsWithKPI();
      });

      await act(async () => {
        result.current.sortByRevenue('desc');
      });

      expect(result.current.clinics[0].kpi?.revenue).toBe(500000);
      expect(result.current.clinics[1].kpi?.revenue).toBe(300000);

      await act(async () => {
        result.current.sortByRevenue('asc');
      });

      expect(result.current.clinics[0].kpi?.revenue).toBe(300000);
      expect(result.current.clinics[1].kpi?.revenue).toBe(500000);
    });

    it('患者数順でソートできる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: mockClinicData } }),
      });

      const { result } = renderHook(() => useMultiStore());

      await act(async () => {
        await result.current.fetchClinicsWithKPI();
      });

      await act(async () => {
        result.current.sortByPatients('desc');
      });

      expect(result.current.clinics[0].kpi?.patients).toBe(150);
    });
  });

  describe('集計', () => {
    it('全クリニックの合計収益を取得できる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: mockClinicData } }),
      });

      const { result } = renderHook(() => useMultiStore());

      await act(async () => {
        await result.current.fetchClinicsWithKPI();
      });

      expect(result.current.totalRevenue).toBe(800000);
    });

    it('全クリニックの合計患者数を取得できる', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: mockClinicData } }),
      });

      const { result } = renderHook(() => useMultiStore());

      await act(async () => {
        await result.current.fetchClinicsWithKPI();
      });

      expect(result.current.totalPatients).toBe(250);
    });
  });
});
