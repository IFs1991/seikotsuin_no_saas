/** @jest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';
import { useAccessibleClinics } from '@/hooks/useAccessibleClinics';
import * as apiClient from '@/lib/api-client';

jest.mock('@/lib/api-client');

const mockApi = apiClient as jest.Mocked<typeof apiClient>;

describe('useAccessibleClinics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.isSuccessResponse.mockImplementation(response =>
      Boolean(response.success)
    );
    mockApi.isErrorResponse.mockImplementation(
      response => response.success === false
    );
    mockApi.handleApiError.mockImplementation(
      error => error.message ?? 'error'
    );
  });

  it('TC-CH01: マウント時にクリニック一覧を取得する', async () => {
    (mockApi.api.clinics.getAccessible as jest.Mock).mockResolvedValueOnce({
      success: true,
      data: {
        clinics: [{ id: 'clinic-1', name: '本院' }],
        currentClinicId: 'clinic-1',
      },
    });

    const { result } = renderHook(() => useAccessibleClinics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.clinics).toHaveLength(1);
    expect(mockApi.api.clinics.getAccessible).toHaveBeenCalledTimes(1);
  });

  it('TC-CH02: clinics 配列が id + name 形式で返る', async () => {
    (mockApi.api.clinics.getAccessible as jest.Mock).mockResolvedValueOnce({
      success: true,
      data: {
        clinics: [
          { id: 'clinic-1', name: '本院' },
          { id: 'clinic-2', name: '新宿院' },
        ],
        currentClinicId: 'clinic-2',
      },
    });

    const { result } = renderHook(() => useAccessibleClinics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.clinics[0]).toEqual({ id: 'clinic-1', name: '本院' });
    expect(result.current.currentClinicId).toBe('clinic-2');
  });

  it('TC-CH03: ローディング・エラー状態を管理する', async () => {
    (mockApi.api.clinics.getAccessible as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: { message: '取得失敗' },
    });

    const { result } = renderHook(() => useAccessibleClinics());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('取得失敗');
  });

  it('TC-CH04: 不正なレスポンス形式では汎用エラーにする', async () => {
    (mockApi.api.clinics.getAccessible as jest.Mock).mockResolvedValueOnce({
      success: true,
    });
    mockApi.isSuccessResponse.mockReturnValueOnce(false);
    mockApi.isErrorResponse.mockReturnValueOnce(false);

    const { result } = renderHook(() => useAccessibleClinics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.clinics).toEqual([]);
    expect(result.current.currentClinicId).toBeNull();
    expect(result.current.error).toBe('クリニック一覧の取得に失敗しました');
  });

  it('TC-CH05: disabled の場合はクリニック一覧を取得しない', () => {
    const { result } = renderHook(() =>
      useAccessibleClinics({ enabled: false })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.clinics).toEqual([]);
    expect(mockApi.api.clinics.getAccessible).not.toHaveBeenCalled();
  });
});
