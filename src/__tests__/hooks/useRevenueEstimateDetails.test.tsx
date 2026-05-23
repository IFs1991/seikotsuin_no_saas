/** @jest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';
import { useRevenueEstimateDetails } from '@/hooks/useRevenueEstimateDetails';
import { api, isSuccessResponse } from '@/lib/api-client';

jest.mock('@/lib/api-client');

const apiMock = api as jest.Mocked<typeof api>;
const isSuccessResponseMock = isSuccessResponse as jest.MockedFunction<
  typeof isSuccessResponse
>;

const clinicId = '123e4567-e89b-12d3-a456-426614174000';

describe('useRevenueEstimateDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isSuccessResponseMock.mockImplementation(response =>
      Boolean(response?.success)
    );
    apiMock.revenueEstimates.getDetails.mockResolvedValue({
      success: true,
      data: {
        details: [
          {
            dailyReportItemId: 'item-traffic',
            reportDate: '2026-06-02',
            patientName: '佐藤 花子',
            treatmentName: '交通事故施術',
            manualFee: 9000,
            revenueContextCode: 'traffic_accident',
            visitStageCode: null,
            estimateId: 'estimate-traffic',
            estimateStatus: 'needs_review',
            estimatedTotal: 9000,
            disclaimer: '経営分析用の概算です。請求確定額ではありません。',
            calculatedAt: '2026-06-02T00:00:00.000Z',
            calculationVersion: 'v1',
            usedScheduleCode: 'JUDO_TRAFFIC_202606',
            sourceSnapshotHash: 'snapshot-traffic-202606',
            lines: [
              {
                id: 'line-traffic',
                lineType: 'manual_fee',
                label: '交通事故 手入力概算',
                quantity: 1,
                unitAmount: 9000,
                totalAmount: 9000,
                sortOrder: 1,
                insuranceFeeItemId: null,
                scheduleCode: null,
                feeItemCode: null,
                sourceSnapshotHash: null,
              },
            ],
            warnings: [
              {
                id: 'warning-traffic',
                warningCode: 'TRAFFIC_ACCIDENT_REVIEW',
                severity: 'needs_review',
                message:
                  '交通事故・自賠責関連の概算です。請求確定前に確認してください。',
              },
            ],
          },
        ],
      },
    });
  });

  it('fetches details for admin roles', async () => {
    const { result } = renderHook(() =>
      useRevenueEstimateDetails(clinicId, 'admin')
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiMock.revenueEstimates.getDetails).toHaveBeenCalledWith(clinicId);
    expect(result.current.details[0]?.revenueContextCode).toBe(
      'traffic_accident'
    );
    expect(result.current.details[0]?.lines[0]?.feeItemCode).toBeNull();
  });

  it('fetches details for clinic_admin roles', async () => {
    const { result } = renderHook(() =>
      useRevenueEstimateDetails(clinicId, 'clinic_admin')
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiMock.revenueEstimates.getDetails).toHaveBeenCalledWith(clinicId);
  });

  it('does not fetch details for manager even when enabled', async () => {
    const { result } = renderHook(() =>
      useRevenueEstimateDetails(clinicId, 'manager', { enabled: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiMock.revenueEstimates.getDetails).not.toHaveBeenCalled();
    expect(result.current.details).toEqual([]);
  });
});
