import { generatePatientAnalysis } from '@/lib/services/patient-analysis-service';

describe('generatePatientAnalysis', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-30T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  function buildSupabase(rows: unknown[]) {
    const eq = jest.fn().mockResolvedValue({ data: rows, error: null });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    const rpc = jest.fn();

    return {
      client: { from, rpc },
      from,
      select,
      eq,
      rpc,
    };
  }

  it('uses patient_visit_summary without legacy patient RPCs', async () => {
    const clinicId = '11111111-1111-4111-8111-111111111111';
    const supabase = buildSupabase([
      {
        patient_id: '00000000-0000-0000-0000-000000000001',
        patient_name: '継続 太郎',
        clinic_id: clinicId,
        first_visit_date: '2026-01-01',
        last_visit_date: '2026-04-25',
        visit_count: 8,
        total_revenue: 80000,
        average_revenue_per_visit: 10000,
        treatment_period_days: 114,
        visit_category: '中度リピート',
      },
      {
        patient_id: '00000000-0000-0000-0000-000000000002',
        patient_name: '離脱 花子',
        clinic_id: clinicId,
        first_visit_date: '2026-01-01',
        last_visit_date: '2026-01-15',
        visit_count: 3,
        total_revenue: 30000,
        average_revenue_per_visit: 10000,
        treatment_period_days: 14,
        visit_category: '軽度リピート',
      },
      {
        patient_id: '00000000-0000-0000-0000-000000000003',
        patient_name: '未回来 院',
        clinic_id: clinicId,
        first_visit_date: null,
        last_visit_date: null,
        visit_count: 0,
        total_revenue: 0,
        average_revenue_per_visit: 0,
        treatment_period_days: 0,
        visit_category: '来院なし',
      },
    ]);

    const result = await generatePatientAnalysis(supabase.client as any, clinicId);

    expect(supabase.from).toHaveBeenCalledWith('patient_visit_summary');
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result.totalPatients).toBe(3);
    expect(result.activePatients).toBe(2);
    expect(result.ltvRanking.map(item => item.ltv)).toEqual([80000, 30000, 0]);
    expect(result.riskScores[0]).toMatchObject({
      name: '離脱 花子',
      category: 'high',
    });
    expect(result.followUpList[0]).toMatchObject({
      name: '離脱 花子',
      action: '電話フォロー推奨',
    });
    expect(result.segmentData.visit).toEqual([
      { label: '来院なし', value: 1 },
      { label: '初診のみ', value: 0 },
      { label: '軽度リピート', value: 1 },
      { label: '中度リピート', value: 1 },
      { label: '高度リピート', value: 0 },
    ]);
  });
});
