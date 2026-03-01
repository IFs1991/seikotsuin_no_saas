/** @jest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import * as apiClient from '@/lib/api-client';

jest.mock('@/lib/api-client');

const mockApi = apiClient as jest.Mocked<typeof apiClient>;

describe('useSystemStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('システム統計を取得して state に反映する', async () => {
    (mockApi.api.system.getStatus as jest.Mock).mockResolvedValueOnce({
      success: true,
      data: {
        activeClinicCount: 4,
        systemStatus: 'operational',
        aiAnalysisStatus: 'active',
        lastUpdated: '2026-02-27T00:00:00Z',
      },
    });

    const { result } = renderHook(() => useSystemStatus());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.status?.activeClinicCount).toBe(4);
    expect(result.current.status?.systemStatus).toBe('operational');
    expect(result.current.status?.aiAnalysisStatus).toBe('active');
  });

  it('エラー時は error state を設定する', async () => {
    (mockApi.api.system.getStatus as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: { message: 'status error' },
    });

    const { result } = renderHook(() => useSystemStatus());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('status error');
  });
});
