import { NextRequest } from 'next/server';
import { GET } from '@/app/api/revenue-estimates/details/route';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { ADMIN_UI_ROLES } from '@/lib/constants/roles';
import { AppError, ERROR_CODES } from '@/lib/error-handler';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

const ensureClinicAccessMock = ensureClinicAccess as jest.MockedFunction<
  typeof ensureClinicAccess
>;

const clinicId = '123e4567-e89b-12d3-a456-426614174000';

type QueryResult<TData> = {
  data: TData;
  error: null;
};

function createResolvedQuery<TData>(data: TData) {
  const resolved = Promise.resolve<QueryResult<TData>>({ data, error: null });
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data, error: null }),
    then: resolved.then.bind(resolved),
  };
}

describe('GET /api/revenue-estimates/details', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns admin-only estimate amount details with Phase 3B provenance', async () => {
    const dailyReportItemsQuery = createResolvedQuery([
      {
        id: 'item-insurance',
        report_date: '2026-06-01',
        patient_name: '山田 太郎',
        treatment_name: '初検',
        fee: 1550,
        revenue_context_code: 'insurance',
        estimate_status: 'calculated',
        visit_stage_code: 'first_visit',
      },
      {
        id: 'item-traffic',
        report_date: '2026-06-02',
        patient_name: '佐藤 花子',
        treatment_name: '交通事故施術',
        fee: 9000,
        revenue_context_code: 'traffic_accident',
        estimate_status: 'needs_review',
        visit_stage_code: null,
      },
    ]);
    const estimatesQuery = createResolvedQuery([
      {
        id: 'estimate-insurance',
        daily_report_item_id: 'item-insurance',
        revenue_context_code: 'insurance',
        estimate_status: 'calculated',
        estimated_total: 1550,
        disclaimer: '経営分析用の概算です。請求確定額ではありません。',
        calculated_at: '2026-06-01T00:00:00.000Z',
        calculation_version: 'v1',
        used_schedule_code: 'JUDO_HI_R6_202410_ACTIVE',
        source_snapshot_hash:
          'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
      },
      {
        id: 'estimate-traffic',
        daily_report_item_id: 'item-traffic',
        revenue_context_code: 'traffic_accident',
        estimate_status: 'needs_review',
        estimated_total: 9000,
        disclaimer: '経営分析用の概算です。請求確定額ではありません。',
        calculated_at: '2026-06-02T00:00:00.000Z',
        calculation_version: 'v1',
        used_schedule_code: 'JUDO_TRAFFIC_202606',
        source_snapshot_hash: 'snapshot-traffic-202606',
      },
    ]);
    const linesQuery = createResolvedQuery([
      {
        id: 'line-insurance',
        revenue_estimate_id: 'estimate-insurance',
        line_type: 'base_fee',
        label: '初検料',
        quantity: 1,
        unit_amount: 1550,
        total_amount: 1550,
        sort_order: 1,
        insurance_fee_item_id: 'fee-item-initial',
        schedule_code: 'JUDO_HI_R6_202410_ACTIVE',
        fee_item_code: 'JUDO_HI_INITIAL_EXAM',
        source_snapshot_hash:
          'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
      },
      {
        id: 'line-traffic',
        revenue_estimate_id: 'estimate-traffic',
        line_type: 'manual_fee',
        label: '交通事故 手入力概算',
        quantity: 1,
        unit_amount: 9000,
        total_amount: 9000,
        sort_order: 1,
        insurance_fee_item_id: null,
        schedule_code: null,
        fee_item_code: null,
        source_snapshot_hash: null,
      },
    ]);
    const warningsQuery = createResolvedQuery([
      {
        id: 'warning-traffic',
        revenue_estimate_id: 'estimate-traffic',
        warning_code: 'TRAFFIC_ACCIDENT_REVIEW',
        severity: 'needs_review',
        message: '交通事故・自賠責関連の概算です。請求確定前に確認してください。',
      },
    ]);
    const client = {
      from: jest.fn((table: string) => {
        if (table === 'daily_report_items') return dailyReportItemsQuery;
        if (table === 'revenue_estimates') return estimatesQuery;
        if (table === 'revenue_estimate_lines') return linesQuery;
        if (table === 'revenue_estimate_warnings') return warningsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    ensureClinicAccessMock.mockResolvedValue({
      supabase: client,
      user: { id: 'user-1', email: 'admin@example.com' },
      permissions: { role: 'admin', clinic_id: clinicId },
    });

    const request = new NextRequest(
      `http://localhost/api/revenue-estimates/details?clinic_id=${clinicId}&start_date=2026-06-01&end_date=2026-06-30&limit=50`
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/revenue-estimates/details',
      clinicId,
      { allowedRoles: Array.from(ADMIN_UI_ROLES) }
    );
    expect(dailyReportItemsQuery.in).toHaveBeenCalledWith(
      'revenue_context_code',
      ['insurance', 'workers_comp', 'traffic_accident']
    );
    expect(dailyReportItemsQuery.eq).toHaveBeenCalledWith(
      'clinic_id',
      clinicId
    );
    expect(dailyReportItemsQuery.gte).toHaveBeenCalledWith(
      'report_date',
      '2026-06-01'
    );
    expect(dailyReportItemsQuery.lte).toHaveBeenCalledWith(
      'report_date',
      '2026-06-30'
    );
    expect(dailyReportItemsQuery.limit).toHaveBeenCalledWith(50);
    expect(estimatesQuery.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(estimatesQuery.in).toHaveBeenCalledWith('daily_report_item_id', [
      'item-insurance',
      'item-traffic',
    ]);
    expect(linesQuery.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(linesQuery.in).toHaveBeenCalledWith('revenue_estimate_id', [
      'estimate-insurance',
      'estimate-traffic',
    ]);
    expect(warningsQuery.eq).toHaveBeenCalledWith('clinic_id', clinicId);
    expect(warningsQuery.in).toHaveBeenCalledWith('revenue_estimate_id', [
      'estimate-insurance',
      'estimate-traffic',
    ]);
    expect(body.data.details).toEqual([
      {
        dailyReportItemId: 'item-insurance',
        reportDate: '2026-06-01',
        patientName: '山田 太郎',
        treatmentName: '初検',
        manualFee: 1550,
        revenueContextCode: 'insurance',
        visitStageCode: 'first_visit',
        estimateId: 'estimate-insurance',
        estimateStatus: 'calculated',
        estimatedTotal: 1550,
        disclaimer: '経営分析用の概算です。請求確定額ではありません。',
        calculatedAt: '2026-06-01T00:00:00.000Z',
        calculationVersion: 'v1',
        usedScheduleCode: 'JUDO_HI_R6_202410_ACTIVE',
        sourceSnapshotHash:
          'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
        lines: [
          {
            id: 'line-insurance',
            lineType: 'base_fee',
            label: '初検料',
            quantity: 1,
            unitAmount: 1550,
            totalAmount: 1550,
            sortOrder: 1,
            insuranceFeeItemId: 'fee-item-initial',
            scheduleCode: 'JUDO_HI_R6_202410_ACTIVE',
            feeItemCode: 'JUDO_HI_INITIAL_EXAM',
            sourceSnapshotHash:
              'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
          },
        ],
        warnings: [],
      },
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
    ]);
  });

  it('returns 403 before reading estimate tables when manager requests details', async () => {
    const client = {
      from: jest.fn(),
    };
    ensureClinicAccessMock.mockRejectedValue(
      new AppError(ERROR_CODES.FORBIDDEN, undefined, 403)
    );

    const request = new NextRequest(
      `http://localhost/api/revenue-estimates/details?clinic_id=${clinicId}`
    );
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(ensureClinicAccessMock).toHaveBeenCalledWith(
      request,
      '/api/revenue-estimates/details',
      clinicId,
      { allowedRoles: Array.from(ADMIN_UI_ROLES) }
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  it('returns 400 when clinic_id is missing', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/revenue-estimates/details')
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'clinic_id is required' });
    expect(ensureClinicAccessMock).not.toHaveBeenCalled();
  });
});
