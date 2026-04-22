import {
  AdminChatPostSchema,
  buildAdminChatContextData,
  detectAdminChatAnalysisType,
  generateAdminChatFallbackResponse,
  normalizeAdminChatInput,
  summarizeKpi,
} from '@/lib/admin/chat';

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLINIC_ID = '22222222-2222-4222-8222-222222222222';

describe('admin chat helpers', () => {
  it('validates and normalizes POST input', () => {
    const parsed = AdminChatPostSchema.parse({
      message: ' 売上を教えて ',
      clinic_id: ` ${CLINIC_ID} `,
      session_id: null,
    });

    expect(normalizeAdminChatInput(parsed)).toEqual({
      message: '売上を教えて',
      clinic_id: CLINIC_ID,
      session_id: null,
      period_days: 30,
    });
  });

  it('rejects empty message and invalid period_days', () => {
    expect(
      AdminChatPostSchema.safeParse({
        message: '   ',
        period_days: 0,
      }).success
    ).toBe(false);
  });

  it('rejects non-uuid clinic and session identifiers', () => {
    expect(
      AdminChatPostSchema.safeParse({
        message: '売上を教えて',
        clinic_id: 'clinic-1',
      }).success
    ).toBe(false);
    expect(
      AdminChatPostSchema.safeParse({
        message: '売上を教えて',
        session_id: 'session-1',
      }).success
    ).toBe(false);
  });

  it('builds multi-clinic context with clinic_id null', () => {
    expect(
      buildAdminChatContextData({
        clinicId: null,
        scopedClinicIds: [CLINIC_ID, OTHER_CLINIC_ID],
        periodDays: 90,
      })
    ).toEqual({
      mode: 'multi_clinic',
      clinic_id: null,
      scoped_clinic_ids: [CLINIC_ID, OTHER_CLINIC_ID],
      period_days: 90,
    });
  });

  it.each([
    ['売上はどうですか', 'revenue'],
    ['患者の来院傾向', 'patients'],
    ['スタッフ別に見たい', 'staff'],
    ['改善提案がほしい', 'advice'],
    ['こんにちは', 'general'],
  ] as const)('detects analysis type: %s', (message, expected) => {
    expect(detectAdminChatAnalysisType(message)).toBe(expected);
  });

  it('summarizes KPI totals and average staff score', () => {
    const kpi = summarizeKpi(
      new Map([
        [
          CLINIC_ID,
          { revenue: 1000, patients: 10, staff_performance_score: 4 },
        ],
        [
          OTHER_CLINIC_ID,
          { revenue: 2500, patients: 12, staff_performance_score: 3 },
        ],
      ])
    );

    expect(kpi).toEqual({
      revenue: 3500,
      patients: 22,
      staff_performance_score: 3.5,
    });
  });

  it('generates deterministic fallback response data', () => {
    const response = generateAdminChatFallbackResponse({
      message: '売上分析',
      contextData: {
        mode: 'multi_clinic',
        clinic_id: null,
        scoped_clinic_ids: [CLINIC_ID, OTHER_CLINIC_ID],
        period_days: 30,
      },
      kpiMap: new Map([
        [
          CLINIC_ID,
          { revenue: 1000, patients: 10, staff_performance_score: null },
        ],
      ]),
    });

    expect(response.data).toEqual(
      expect.objectContaining({
        analysis_type: 'revenue',
        clinic_id: null,
        scoped_clinic_ids: [CLINIC_ID, OTHER_CLINIC_ID],
        period_days: 30,
        kpi: {
          revenue: 1000,
          patients: 10,
          staff_performance_score: null,
        },
      })
    );
    expect(response.message).toContain('売上分析');
  });
});
