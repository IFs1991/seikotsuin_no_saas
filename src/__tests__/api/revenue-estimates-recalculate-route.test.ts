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
    const insuranceFeeSchedulesTable = {
      select: jest.fn().mockReturnValue(createResolvedQuery([])),
    };
    const insuranceFeeItemsTable = {
      select: jest.fn().mockReturnValue(createResolvedQuery([])),
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
        if (table === 'insurance_fee_schedules') {
          return insuranceFeeSchedulesTable;
        }
        if (table === 'insurance_fee_items') return insuranceFeeItemsTable;
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

  test('POST stores insurance fee master provenance when a safe item matches the fee', async () => {
    const itemsQuery = createResolvedQuery([
      {
        id: 'item-insurance',
        clinic_id: clinicId,
        report_date: '2026-06-01',
        fee: 1550,
        revenue_context_code: 'insurance',
        visit_stage_code: 'first_visit',
        estimate_status: 'not_calculated',
      },
    ]);
    const existingEstimatesQuery = createResolvedQuery([]);
    const scheduleQuery = createResolvedQuery([
      {
        schedule_code: 'JUDO_HI_R6_202410_ACTIVE',
        schedule_name: '柔道整復 健康保険 令和6年改定 現行料金',
        profession_type: 'judo',
        payer_context_code: 'insurance',
        effective_from: '2024-10-01',
        effective_to: null,
        schedule_status: 'active',
        source_id: 'MHLW_JUDO_HI_R6_FINAL_20240529',
        source_snapshot_hash:
          'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
      },
    ]);
    const itemQuery = createResolvedQuery([
      {
        id: 'fee-item-initial',
        schedule_code: 'JUDO_HI_R6_202410_ACTIVE',
        item_code: 'JUDO_HI_INITIAL_EXAM',
        item_name: '初検料',
        official_label: '初検料',
        category: 'visit_base',
        amount_yen: 1550,
        unit: 'visit',
        billing_scope: 'treatment_day',
        calculation_basis: null,
        warning_codes_json: [],
        manual_amount_required: false,
        auto_calculation_allowed: true,
        source_id: 'MHLW_JUDO_HI_R6_FINAL_20240529',
        source_snapshot_hash:
          'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
        confidence: 'high',
        sort_order: 10,
      },
    ]);
    const upsertResult = Promise.resolve({
      data: [
        { id: 'estimate-insurance', daily_report_item_id: 'item-insurance' },
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
      insert: jest.fn(),
    };
    const dailyReportItemsTable = {
      select: jest.fn().mockReturnValue(itemsQuery),
      update: jest.fn().mockReturnValue(createResolvedMutation()),
    };
    const insuranceFeeSchedulesTable = {
      select: jest.fn().mockReturnValue(scheduleQuery),
    };
    const insuranceFeeItemsTable = {
      select: jest.fn().mockReturnValue(itemQuery),
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
        if (table === 'insurance_fee_schedules') {
          return insuranceFeeSchedulesTable;
        }
        if (table === 'insurance_fee_items') return insuranceFeeItemsTable;
        return {};
      }),
    };

    processClinicScopedBodyMock.mockResolvedValue({
      success: true,
      dto: {
        clinic_id: clinicId,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
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

    expect(response.status).toBe(200);
    expect(revenueEstimatesTable.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          daily_report_item_id: 'item-insurance',
          estimate_status: 'calculated',
          estimated_total: 1550,
          used_schedule_code: 'JUDO_HI_R6_202410_ACTIVE',
          source_snapshot_hash:
            'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
        }),
      ],
      { onConflict: 'daily_report_item_id' }
    );
    expect(revenueEstimateLinesTable.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        revenue_estimate_id: 'estimate-insurance',
        total_amount: 1550,
        insurance_fee_item_id: 'fee-item-initial',
        schedule_code: 'JUDO_HI_R6_202410_ACTIVE',
        fee_item_code: 'JUDO_HI_INITIAL_EXAM',
        source_snapshot_hash:
          'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
      }),
    ]);
    expect(revenueEstimateWarningsTable.insert).not.toHaveBeenCalled();
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
