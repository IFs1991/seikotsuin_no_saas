import { NextRequest } from 'next/server';
import { processClinicScopedBody } from '@/lib/route-helpers';
import { createScopedAdminContext } from '@/lib/supabase';

jest.mock('@/lib/route-helpers', () => {
  const actual = jest.requireActual('@/lib/route-helpers');
  return {
    ...actual,
    processClinicScopedBody: jest.fn(),
  };
});

jest.mock('@/lib/supabase', () => {
  const actual = jest.requireActual('@/lib/supabase');
  return {
    ...actual,
    createScopedAdminContext: jest.fn(),
  };
});

const processClinicScopedBodyMock = processClinicScopedBody as jest.Mock;
const createScopedAdminContextMock = createScopedAdminContext as jest.Mock;

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const permissions = {
  role: 'staff',
  clinic_id: clinicId,
  clinic_scope_ids: [clinicId],
};

function createResolvedQuery<TData>(data: TData) {
  const result = Promise.resolve({ data, error: null });

  return {
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    then: result.then.bind(result),
  };
}

function createResolvedMutation() {
  const result = Promise.resolve({ error: null });

  return {
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    then: result.then.bind(result),
  };
}

describe('/api/revenue-estimates/recalculate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST calculates fee-based estimates and warning records', async () => {
    const itemsQuery = createResolvedQuery([
      {
        id: 'item-private',
        clinic_id: clinicId,
        report_date: '2026-05-01',
        fee: 5000,
        revenue_context_code: 'private',
        visit_stage_code: null,
        estimate_status: 'not_calculated',
      },
      {
        id: 'item-traffic',
        clinic_id: clinicId,
        report_date: '2026-05-01',
        fee: 9000,
        revenue_context_code: 'traffic_accident',
        visit_stage_code: null,
        estimate_status: 'not_calculated',
      },
    ]);
    const existingEstimatesQuery = createResolvedQuery([]);
    const upsertResult = Promise.resolve({
      data: [
        { id: 'estimate-private', daily_report_item_id: 'item-private' },
        { id: 'estimate-traffic', daily_report_item_id: 'item-traffic' },
      ],
      error: null,
    });
    const revenueEstimatesTable = {
      select: jest.fn().mockReturnValue(existingEstimatesQuery),
      upsert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          then: upsertResult.then.bind(upsertResult),
        }),
      }),
    };
    const revenueEstimateLinesTable = {
      delete: jest.fn().mockReturnValue(createResolvedMutation()),
      insert: jest.fn().mockResolvedValue({ error: null }),
    };
    const revenueEstimateWarningsTable = {
      delete: jest.fn().mockReturnValue(createResolvedMutation()),
      insert: jest.fn().mockResolvedValue({ error: null }),
    };
    const dailyReportItemsTable = {
      select: jest.fn().mockReturnValue(itemsQuery),
      update: jest.fn().mockReturnValue(createResolvedMutation()),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') return dailyReportItemsTable;
        if (table === 'revenue_estimates') return revenueEstimatesTable;
        if (table === 'revenue_estimate_lines') {
          return revenueEstimateLinesTable;
        }
        if (table === 'revenue_estimate_warnings') {
          return revenueEstimateWarningsTable;
        }
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        startDate: '2026-05-01',
        endDate: '2026-05-31',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } =
      await import('@/app/api/revenue-estimates/recalculate/route');
    const response = await POST(
      new NextRequest('http://localhost/api/revenue-estimates/recalculate', {
        method: 'POST',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(revenueEstimatesTable.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          daily_report_item_id: 'item-private',
          estimate_status: 'calculated',
          estimated_total: 5000,
        }),
        expect.objectContaining({
          daily_report_item_id: 'item-traffic',
          estimate_status: 'needs_review',
          estimated_total: 9000,
        }),
      ],
      { onConflict: 'daily_report_item_id' }
    );
    expect(revenueEstimatesTable.upsert).toHaveBeenCalledTimes(1);
    expect(revenueEstimateWarningsTable.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        revenue_estimate_id: 'estimate-traffic',
        warning_code: 'TRAFFIC_ACCIDENT_REVIEW',
        severity: 'needs_review',
      }),
    ]);
    expect(dailyReportItemsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        estimate_status: 'calculated',
        amount_source: 'estimate',
        updated_by: 'user-1',
      })
    );
    expect(dailyReportItemsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        estimate_status: 'needs_review',
        amount_source: 'estimate',
        updated_by: 'user-1',
      })
    );
    expect(json.data).toMatchObject({
      processedItemCount: 2,
      calculatedCount: 1,
      needsReviewCount: 1,
      skippedOverriddenCount: 0,
      disclaimer: '経営分析用の概算です。請求確定額ではありません。',
    });
  });

  test('POST preserves overridden estimates without write churn', async () => {
    const itemsQuery = createResolvedQuery([
      {
        id: 'item-overridden',
        clinic_id: clinicId,
        report_date: '2026-05-01',
        fee: 7000,
        revenue_context_code: 'private',
        visit_stage_code: null,
        estimate_status: 'overridden',
      },
    ]);
    const existingEstimatesQuery = createResolvedQuery([
      {
        id: 'estimate-overridden',
        clinic_id: clinicId,
        daily_report_item_id: 'item-overridden',
        estimate_status: 'overridden',
      },
    ]);
    const revenueEstimatesTable = {
      select: jest.fn().mockReturnValue(existingEstimatesQuery),
      upsert: jest.fn(),
    };
    const revenueEstimateLinesTable = {
      delete: jest.fn(),
      insert: jest.fn(),
    };
    const revenueEstimateWarningsTable = {
      delete: jest.fn(),
      insert: jest.fn(),
    };
    const dailyReportItemsTable = {
      select: jest.fn().mockReturnValue(itemsQuery),
      update: jest.fn(),
    };
    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'daily_report_items') return dailyReportItemsTable;
        if (table === 'revenue_estimates') return revenueEstimatesTable;
        if (table === 'revenue_estimate_lines') {
          return revenueEstimateLinesTable;
        }
        if (table === 'revenue_estimate_warnings') {
          return revenueEstimateWarningsTable;
        }
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        dailyReportItemId: '123e4567-e89b-12d3-a456-426614174001',
      },
      auth: { id: 'user-1', email: 'staff@example.com', role: 'staff' },
      permissions,
      supabase: { from: jest.fn() },
    });
    createScopedAdminContextMock.mockReturnValue({
      client,
      assertClinicInScope: jest.fn(),
    });

    const { POST } =
      await import('@/app/api/revenue-estimates/recalculate/route');
    const response = await POST(
      new NextRequest('http://localhost/api/revenue-estimates/recalculate', {
        method: 'POST',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(revenueEstimatesTable.upsert).not.toHaveBeenCalled();
    expect(revenueEstimateLinesTable.delete).not.toHaveBeenCalled();
    expect(revenueEstimateWarningsTable.delete).not.toHaveBeenCalled();
    expect(dailyReportItemsTable.update).not.toHaveBeenCalled();
    expect(json.data).toMatchObject({
      processedItemCount: 1,
      calculatedCount: 0,
      needsReviewCount: 0,
      skippedOverriddenCount: 1,
    });
  });
});
