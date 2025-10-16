/** @jest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';
import { usePatientAnalysis } from '@/hooks/usePatientAnalysis';
import * as apiClient from '@/lib/api-client';

jest.mock('@/lib/api-client');
const mockApi = apiClient as jest.Mocked<typeof apiClient>;

describe('usePatientAnalysis', () => {
  const clinicId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.isSuccessResponse.mockImplementation((response: any) =>
      Boolean(response?.success)
    );
    mockApi.isErrorResponse.mockImplementation(
      (response: any) => response?.success === false
    );
    mockApi.handleApiError.mockImplementation((error: any) => error?.message);
    (mockApi.api.patients.getAnalysis as jest.Mock).mockReset();
  });

  it('returns idle state when clinic id is missing', () => {
    const { result } = renderHook(() => usePatientAnalysis(null));

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockApi.api.patients.getAnalysis).not.toHaveBeenCalled();
  });

  it('fetches patient analysis data successfully', async () => {
    (mockApi.api.patients.getAnalysis as jest.Mock).mockResolvedValueOnce({
      success: true,
      data: {
        conversionData: {
          stages: [
            { name: '新患', value: 100 },
            { name: '2回目来院', value: 70 },
          ],
        },
        visitCounts: {
          average: 4.6,
          monthlyChange: 8,
        },
        riskScores: [
          {
            patient_id: 'patient-1',
            name: '田中太郎',
            riskScore: 75,
            lastVisit: '2025-09-26',
            category: 'high',
          },
        ],
        ltvRanking: [
          {
            patient_id: 'patient-1',
            name: '田中太郎',
            ltv: 150000,
            visit_count: 12,
            total_revenue: 180000,
          },
        ],
        segmentData: {
          age: [
            { label: '20-30代', value: 35 },
            { label: '31-50代', value: 45 },
          ],
          symptom: [{ label: '腰痛', value: 40 }],
        },
        followUpList: [
          {
            patient_id: 'patient-1',
            name: '田中太郎',
            reason: '最終来院から14日経過',
            lastVisit: '2025-09-26',
            action: 'お礼連絡',
          },
        ],
        totalPatients: 120,
        activePatients: 95,
      },
    });

    const { result } = renderHook(() => usePatientAnalysis(clinicId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApi.api.patients.getAnalysis).toHaveBeenCalledWith(clinicId);
    expect(result.current.error).toBeNull();
    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.conversionData.stages[0].percentage).toBe(100);
    expect(result.current.data?.riskScores[0].riskLevel).toBe('high');
  });

  it('handles API error responses', async () => {
    (mockApi.api.patients.getAnalysis as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: { code: 'FORBIDDEN', message: 'アクセス拒否' },
    });
    mockApi.handleApiError.mockReturnValueOnce('アクセス拒否');

    const { result } = renderHook(() => usePatientAnalysis(clinicId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('アクセス拒否');
  });

  it('handles network errors gracefully', async () => {
    (mockApi.api.patients.getAnalysis as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    const { result } = renderHook(() => usePatientAnalysis(clinicId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('患者データの取得に失敗しました');
  });
});
