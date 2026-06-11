/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useManagerRevenueAnalysis } from '@/hooks/useManagerRevenueAnalysis';
import * as apiClient from '@/lib/api-client';
import type { ApiResponse } from '@/types/api';
import type { ManagerRevenueAnalysisResponse } from '@/lib/manager-revenue-analysis';

jest.mock('@/lib/api-client');

const mockApi = apiClient as jest.Mocked<typeof apiClient>;
const getManagerRevenueAnalysisMock = mockApi.api.managerRevenue
  .getAnalysis as jest.MockedFunction<
  typeof mockApi.api.managerRevenue.getAnalysis
>;

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';

function buildResponse(
  selectedClinicId: string | null = null
): ManagerRevenueAnalysisResponse {
  return {
    period: {
      type: 'month',
      startDate: '2026-06-01',
      endDate: '2026-06-11',
      bucket: 'daily',
      label: '今月（2026-06-01 - 2026-06-11）',
    },
    target: {
      type: selectedClinicId ? 'clinic' : 'total',
      clinicId: selectedClinicId,
    },
    assignedClinics: [
      { id: clinicA, name: '池袋院' },
      { id: clinicB, name: '渋谷院' },
    ],
    summary: {
      clinicCount: selectedClinicId ? 1 : 2,
      operatingRevenue: 30000,
      insuranceRevenue: 12000,
      privateRevenue: 18000,
      productRevenue: 0,
      ticketRevenue: 0,
      trafficAccidentRevenue: 0,
      workersCompRevenue: 0,
      patientCopayEstimated: 0,
      insurerReceivableEstimated: 0,
      privateRevenueEstimated: 0,
      visitCount: 10,
      averageRevenuePerVisit: 3000,
      reportDays: 10,
      missingReportDays: 0,
      needsReviewCount: 0,
      blockedCount: 0,
    },
    comparison: {
      active: true,
      previousStartDate: '2026-05-21',
      previousEndDate: '2026-05-31',
      previousOperatingRevenue: 20000,
      operatingRevenueChangeRate: 50,
      previousVisitCount: 5,
      visitCountChangeRate: 100,
      previousAverageRevenuePerVisit: 4000,
      averageRevenuePerVisitChangeRate: -25,
    },
    charts: {
      revenue: [],
      visits: [],
      averageRevenuePerVisit: [],
      insurancePrivateBreakdown: [],
      contextBreakdown: [],
      clinicRevenueComparison: [],
      clinicAverageRevenueComparison: [],
    },
    clinicComparison: [],
    disclaimers: [
      'この画面の売上は日報入力に基づく経営分析用の集計です。請求確定額や入金額ではありません。',
    ],
  };
}

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>(resolve => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: T) {
      if (!resolvePromise) {
        throw new Error('deferred promise resolver was not initialized');
      }
      resolvePromise(value);
    },
  };
}

describe('useManagerRevenueAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.isSuccessResponse.mockImplementation(
      <T>(
        response: ApiResponse<T>
      ): response is ApiResponse<T> & { success: true; data: T } =>
        response.success === true && response.data !== undefined
    );
    mockApi.isErrorResponse.mockImplementation(
      <T>(
        response: ApiResponse<T>
      ): response is ApiResponse<T> & {
        success: false;
        error: NonNullable<ApiResponse<T>['error']>;
      } => response.success === false && response.error !== undefined
    );
    mockApi.handleApiError.mockImplementation(error => error.message);
    getManagerRevenueAnalysisMock.mockReset();
  });

  it('loads manager revenue analysis from the manager endpoint', async () => {
    getManagerRevenueAnalysisMock.mockResolvedValueOnce({
      success: true,
      data: buildResponse(),
    });

    const { result } = renderHook(() => useManagerRevenueAnalysis());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getManagerRevenueAnalysisMock).toHaveBeenCalledWith({});
    expect(result.current.data?.summary.operatingRevenue).toBe(30000);
    expect(result.current.selectedClinicId).toBe(clinicA);
    expect(result.current.error).toBeNull();
  });

  it('passes target, custom date filters, and compare to the manager endpoint', async () => {
    getManagerRevenueAnalysisMock.mockResolvedValueOnce({
      success: true,
      data: buildResponse(),
    });

    const { result } = renderHook(() =>
      useManagerRevenueAnalysis({
        target: 'total',
        period: 'custom',
        startDate: '2026-01-01',
        endDate: '2026-04-30',
        compare: 'none',
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getManagerRevenueAnalysisMock).toHaveBeenCalledWith({
      target: 'total',
      period: 'custom',
      startDate: '2026-01-01',
      endDate: '2026-04-30',
      compare: 'none',
    });
  });

  it('refetches focused clinic detail when selected clinic changes', async () => {
    getManagerRevenueAnalysisMock
      .mockResolvedValueOnce({ success: true, data: buildResponse(null) })
      .mockResolvedValueOnce({ success: true, data: buildResponse(clinicB) });

    const { result } = renderHook(() => useManagerRevenueAnalysis());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setSelectedClinicId(clinicB);
    });

    await waitFor(() => {
      expect(getManagerRevenueAnalysisMock).toHaveBeenLastCalledWith({
        clinicId: clinicB,
      });
    });
    expect(result.current.selectedClinicId).toBe(clinicB);
    expect(result.current.data?.target.clinicId).toBe(clinicB);
  });

  it('keeps empty assignment state as a successful payload', async () => {
    getManagerRevenueAnalysisMock.mockResolvedValueOnce({
      success: true,
      data: {
        ...buildResponse(null),
        assignedClinics: [],
        summary: {
          ...buildResponse(null).summary,
          clinicCount: 0,
          operatingRevenue: 0,
        },
      },
    });

    const { result } = renderHook(() => useManagerRevenueAnalysis());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.assignedClinics).toEqual([]);
    expect(result.current.selectedClinicId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('ignores stale responses after focused clinic changes quickly', async () => {
    const firstRequest =
      createDeferred<ApiResponse<ManagerRevenueAnalysisResponse>>();
    const secondRequest =
      createDeferred<ApiResponse<ManagerRevenueAnalysisResponse>>();
    getManagerRevenueAnalysisMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const { result } = renderHook(() => useManagerRevenueAnalysis());

    await waitFor(() => {
      expect(getManagerRevenueAnalysisMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.setSelectedClinicId(clinicB);
    });

    await waitFor(() => {
      expect(getManagerRevenueAnalysisMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      secondRequest.resolve({
        success: true,
        data: buildResponse(clinicB),
      });
      await secondRequest.promise;
    });

    await waitFor(() => {
      expect(result.current.data?.target.clinicId).toBe(clinicB);
    });

    await act(async () => {
      firstRequest.resolve({
        success: true,
        data: buildResponse(null),
      });
      await firstRequest.promise;
    });

    expect(result.current.data?.target.clinicId).toBe(clinicB);
  });
});
