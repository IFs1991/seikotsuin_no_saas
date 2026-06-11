/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useManagerPatientAnalysis } from '@/hooks/useManagerPatientAnalysis';
import * as apiClient from '@/lib/api-client';
import type { ApiResponse } from '@/types/api';
import type { ManagerPatientAnalysisResponse } from '@/lib/manager-patient-analysis';

jest.mock('@/lib/api-client');

const mockApi = apiClient as jest.Mocked<typeof apiClient>;
const getManagerAnalysisMock = mockApi.api.managerPatients
  .getAnalysis as jest.MockedFunction<
  typeof mockApi.api.managerPatients.getAnalysis
>;

const clinicA = '11111111-1111-4111-8111-111111111111';
const clinicB = '22222222-2222-4222-8222-222222222222';

function buildResponse(
  selectedClinicId: string | null = clinicA
): ManagerPatientAnalysisResponse {
  const selectedClinic =
    selectedClinicId === null
      ? null
      : {
          clinicId: selectedClinicId,
          clinicName: selectedClinicId === clinicA ? '池袋院' : '渋谷院',
          totalPatients: 1,
          activePatients: 1,
          newPatients: 1,
          returnPatients: 1,
          conversionRate: 100,
          visitCount: 2,
          averageVisitCount: 2,
          totalRevenue: 12000,
          averageRevenuePerPatient: 12000,
          highRiskPatientCount: 0,
          segmentData: { visit: [{ label: '軽度リピート', value: 1 }] },
          riskScores: [],
          ltvRanking: [],
          followUpList: [],
        };

  return {
    summary: {
      assignedClinicCount: 2,
      totalPatients: 2,
      activePatients: 2,
      newPatients: 2,
      returnPatients: 2,
      conversionRate: 100,
      visitCount: 4,
      averageVisitCount: 2,
      totalRevenue: 24000,
      averageRevenuePerPatient: 12000,
      highRiskPatientCount: 0,
    },
    clinics: [
      {
        clinicId: clinicA,
        clinicName: '池袋院',
        totalPatients: 1,
        activePatients: 1,
        newPatients: 1,
        returnPatients: 1,
        conversionRate: 100,
        visitCount: 2,
        averageVisitCount: 2,
        totalRevenue: 12000,
        averageRevenuePerPatient: 12000,
        highRiskPatientCount: 0,
      },
      {
        clinicId: clinicB,
        clinicName: '渋谷院',
        totalPatients: 1,
        activePatients: 1,
        newPatients: 1,
        returnPatients: 1,
        conversionRate: 100,
        visitCount: 2,
        averageVisitCount: 2,
        totalRevenue: 12000,
        averageRevenuePerPatient: 12000,
        highRiskPatientCount: 0,
      },
    ],
    selectedClinic,
    target: 'total',
    period: {
      type: 'all',
      startDate: null,
      endDate: null,
      bucket: 'monthly',
    },
    charts: {
      revenue: [],
      patients: [],
      newPatients: [],
      repeatPatients: [],
      visits: [],
      conversionRate: [],
      clinicRevenueComparison: [],
      clinicPatientComparison: [],
    },
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

describe('useManagerPatientAnalysis', () => {
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
    getManagerAnalysisMock.mockReset();
  });

  it('loads manager patient analysis from the manager endpoint', async () => {
    getManagerAnalysisMock.mockResolvedValueOnce({
      success: true,
      data: buildResponse(),
    });

    const { result } = renderHook(() => useManagerPatientAnalysis());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getManagerAnalysisMock).toHaveBeenCalledWith({});
    expect(result.current.data?.summary.assignedClinicCount).toBe(2);
    expect(result.current.selectedClinicId).toBe(clinicA);
    expect(result.current.error).toBeNull();
  });

  it('passes target and custom date filters to the manager endpoint', async () => {
    getManagerAnalysisMock.mockResolvedValueOnce({
      success: true,
      data: buildResponse(),
    });

    const { result } = renderHook(() =>
      useManagerPatientAnalysis({
        target: 'total',
        period: 'custom',
        startDate: '2026-01-01',
        endDate: '2026-04-30',
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getManagerAnalysisMock).toHaveBeenCalledWith({
      target: 'total',
      period: 'custom',
      startDate: '2026-01-01',
      endDate: '2026-04-30',
    });
  });

  it('refetches focused clinic detail when selected clinic changes', async () => {
    getManagerAnalysisMock
      .mockResolvedValueOnce({ success: true, data: buildResponse(clinicA) })
      .mockResolvedValueOnce({ success: true, data: buildResponse(clinicB) });

    const { result } = renderHook(() => useManagerPatientAnalysis());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setSelectedClinicId(clinicB);
    });

    await waitFor(() => {
      expect(getManagerAnalysisMock).toHaveBeenLastCalledWith({
        clinicId: clinicB,
      });
    });
    expect(result.current.selectedClinicId).toBe(clinicB);
    expect(result.current.data?.selectedClinic?.clinicName).toBe('渋谷院');
  });

  it('keeps empty assignment state as a successful payload', async () => {
    getManagerAnalysisMock.mockResolvedValueOnce({
      success: true,
      data: {
        ...buildResponse(null),
        summary: {
          assignedClinicCount: 0,
          totalPatients: 0,
          activePatients: 0,
          newPatients: 0,
          returnPatients: 0,
          conversionRate: 0,
          visitCount: 0,
          averageVisitCount: 0,
          totalRevenue: 0,
          averageRevenuePerPatient: 0,
          highRiskPatientCount: 0,
        },
        clinics: [],
      },
    });

    const { result } = renderHook(() => useManagerPatientAnalysis());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.clinics).toEqual([]);
    expect(result.current.selectedClinicId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('ignores stale responses after focused clinic changes quickly', async () => {
    const firstRequest =
      createDeferred<ApiResponse<ManagerPatientAnalysisResponse>>();
    const secondRequest =
      createDeferred<ApiResponse<ManagerPatientAnalysisResponse>>();
    getManagerAnalysisMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const { result } = renderHook(() => useManagerPatientAnalysis());

    await waitFor(() => {
      expect(getManagerAnalysisMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.setSelectedClinicId(clinicB);
    });

    await waitFor(() => {
      expect(getManagerAnalysisMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      secondRequest.resolve({
        success: true,
        data: buildResponse(clinicB),
      });
      await secondRequest.promise;
    });

    await waitFor(() => {
      expect(result.current.data?.selectedClinic?.clinicId).toBe(clinicB);
    });

    await act(async () => {
      firstRequest.resolve({
        success: true,
        data: buildResponse(clinicA),
      });
      await firstRequest.promise;
    });

    expect(result.current.data?.selectedClinic?.clinicId).toBe(clinicB);
  });
});
