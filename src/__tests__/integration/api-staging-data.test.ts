/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET as getDashboard } from '@/app/api/dashboard/route';
import { GET as getPatients } from '@/app/api/patients/route';
import { GET as getDailyReports } from '@/app/api/daily-reports/route';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { AuditLogger, getRequestInfo } from '@/lib/audit-logger';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('@/lib/audit-logger', () => ({
  AuditLogger: { logDataAccess: jest.fn() },
  getRequestInfo: jest.fn(),
}));

describe('API integration with Supabase staging data mocks', () => {
  const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;
  const auditLogMock = AuditLogger.logDataAccess as jest.Mock;
  const requestInfoMock = getRequestInfo as jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    requestInfoMock.mockReturnValue({
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
    auditLogMock.mockResolvedValue();
  });

  it('returns dashboard data aggregated from Supabase views', async () => {
    const clinicId = '11111111-1111-4111-8111-111111111111';
    const dailyRevenue = {
      total_revenue: 147000,
      insurance_revenue: 62000,
      private_revenue: 85000,
    };
    const yesterdayRevenue = {
      total_revenue: 120000,
      insurance_revenue: 50000,
      private_revenue: 70000,
    };
    const revenueTrend = [
      {
        revenue_date: '2025-09-25',
        total_revenue: 120000,
        insurance_revenue: 50000,
        private_revenue: 70000,
      },
      {
        revenue_date: '2025-09-26',
        total_revenue: 135000,
        insurance_revenue: 54000,
        private_revenue: 81000,
      },
    ];
    const visits = [
      { patient_id: 'p1' },
      { patient_id: 'p2' },
      { patient_id: 'p3' },
    ];
    const yesterdayVisits = [{ patient_id: 'p1' }, { patient_id: 'p2' }];
    const aiComment = {
      id: 'comment-1',
      clinic_id: clinicId,
      comment_date: '2025-09-27',
      summary: '順調です',
      good_points: '離脱率低下',
      improvement_points: '夜間枠拡充',
      suggestion_for_tomorrow: '平日夜に枠追加',
      created_at: '2025-09-27T22:10:00+09:00',
    };
    const heatmap = [{ hour_of_day: 10, patient_count: 4 }];

    const supabase = createDashboardSupabaseMock({
      dailyRevenue,
      yesterdayRevenue,
      revenueTrend,
      visits,
      yesterdayVisits,
      aiComment,
      heatmap,
    });

    ensureClinicAccessMock.mockResolvedValue({
      supabase,
      user: { id: 'user-1', email: 'manager@example.com', clinic_id: clinicId },
    });

    const request = new NextRequest(
      `http://localhost/api/dashboard?clinic_id=${clinicId}`
    );

    const response = await getDashboard(request);
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(payload.data.dailyData.revenue).toBe(dailyRevenue.total_revenue);
    expect(payload.data.dailyData.patients).toBe(visits.length);
    expect(payload.data.revenueChartData).toHaveLength(revenueTrend.length);
    expect(payload.data.aiComment?.summary).toContain('順調');
    expect(supabase.rpc).toHaveBeenCalledWith('get_hourly_visit_pattern', {
      clinic_uuid: clinicId,
    });
    expect(payload.data.alerts).toBeDefined();
  });

  it('generates alert when revenue decreases significantly', async () => {
    const clinicId = '11111111-1111-4111-8111-111111111111';
    const todayRevenue = {
      total_revenue: 80000,
      insurance_revenue: 40000,
      private_revenue: 40000,
    };
    const yesterdayRevenue = {
      total_revenue: 150000,
      insurance_revenue: 75000,
      private_revenue: 75000,
    };
    const visits = [{ patient_id: 'p1' }, { patient_id: 'p2' }];
    const yesterdayVisits = [
      { patient_id: 'p1' },
      { patient_id: 'p2' },
      { patient_id: 'p3' },
    ];

    const supabase = createDashboardSupabaseMock({
      dailyRevenue: todayRevenue,
      yesterdayRevenue,
      revenueTrend: [],
      visits,
      yesterdayVisits,
      aiComment: null,
      heatmap: [],
    });

    ensureClinicAccessMock.mockResolvedValue({
      supabase,
      user: { id: 'user-1', email: 'manager@example.com', clinic_id: clinicId },
    });

    const request = new NextRequest(
      `http://localhost/api/dashboard?clinic_id=${clinicId}`
    );
    const response = await getDashboard(request);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(payload.data.alerts.length).toBeGreaterThan(0);
    expect(
      payload.data.alerts.some((alert: string) =>
        alert.includes('売上が前日比')
      )
    ).toBe(true);
  });

  it('returns patient analysis data with LTV and risk scores', async () => {
    const clinicId = '11111111-1111-4111-8111-111111111111';
    const patientSummary = [
      {
        patient_id: 'patient-1',
        patient_name: '佐藤 花子',
        visit_count: 6,
        total_revenue: 82000,
        last_visit_date: '2025-09-26',
        visit_category: '高度リピート',
      },
      {
        patient_id: 'patient-2',
        patient_name: '鈴木 太郎',
        visit_count: 2,
        total_revenue: 18000,
        last_visit_date: '2025-09-25',
        visit_category: '軽度リピート',
      },
    ];

    const supabase = createPatientsSupabaseMock({
      patientSummary,
      ltvByPatient: {
        'patient-1': 420000,
        'patient-2': 96000,
      },
      riskByPatient: {
        'patient-1': 72,
        'patient-2': 35,
      },
    });

    ensureClinicAccessMock.mockResolvedValue({
      supabase,
      user: { id: 'user-1', email: 'manager@example.com', clinic_id: clinicId },
    });

    const request = new NextRequest(
      `http://localhost/api/patients?clinic_id=${clinicId}`
    );

    const response = await getPatients(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.totalPatients).toBe(2);
    expect(payload.data.ltvRanking[0].ltv).toBe(420000);
    expect(
      payload.data.riskScores.find((r: any) => r.patient_id === 'patient-1')
        ?.riskScore
    ).toBe(72);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it('returns daily report summaries with monthly trends', async () => {
    const clinicId = '11111111-1111-4111-8111-111111111111';
    const reports = [
      {
        id: 'report-1',
        clinic_id: clinicId,
        report_date: '2025-09-27',
        total_patients: 35,
        new_patients: 5,
        total_revenue: '450000',
        insurance_revenue: '180000',
        private_revenue: '270000',
        staff: { name: '渋谷 太郎', role: 'manager' },
        created_at: '2025-09-27T22:05:00+09:00',
      },
      {
        id: 'report-2',
        clinic_id: clinicId,
        report_date: '2025-09-26',
        total_patients: 30,
        new_patients: 4,
        total_revenue: '380000',
        insurance_revenue: '150000',
        private_revenue: '230000',
        staff: { name: '渋谷 太郎', role: 'manager' },
        created_at: '2025-09-26T22:00:00+09:00',
      },
    ];

    const supabase = createDailyReportsSupabaseMock({ reports });

    ensureClinicAccessMock.mockResolvedValue({
      supabase,
      user: { id: 'user-1', email: 'manager@example.com', clinic_id: clinicId },
    });

    const request = new NextRequest(
      `http://localhost/api/daily-reports?clinic_id=${clinicId}`
    );

    const response = await getDailyReports(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.reports).toHaveLength(2);
    expect(payload.data.summary.totalReports).toBe(2);
    expect(payload.data.monthlyTrends[0]).toMatchObject({ month: '2025-09' });
  });
});

function createDashboardSupabaseMock({
  dailyRevenue,
  yesterdayRevenue,
  revenueTrend,
  visits,
  yesterdayVisits,
  aiComment,
  heatmap,
}: {
  dailyRevenue: {
    total_revenue: number;
    insurance_revenue: number;
    private_revenue: number;
  };
  yesterdayRevenue?: {
    total_revenue: number;
    insurance_revenue: number;
    private_revenue: number;
  } | null;
  revenueTrend: Array<Record<string, unknown>>;
  visits: Array<Record<string, unknown>>;
  yesterdayVisits?: Array<Record<string, unknown>>;
  aiComment: Record<string, unknown> | null;
  heatmap: Array<Record<string, unknown>>;
}) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const supabase = {
    from: jest.fn((table: string) => {
      if (table === 'daily_revenue_summary') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn((field: string, value: string) => {
              if (field === 'clinic_id') {
                return {
                  eq: jest.fn((dateField: string, dateValue: string) => {
                    if (dateField === 'revenue_date') {
                      const isToday = dateValue === today;
                      const isYesterday = dateValue === yesterday;
                      return {
                        single: jest.fn(async () => ({
                          data: isToday
                            ? dailyRevenue
                            : isYesterday
                              ? yesterdayRevenue || null
                              : null,
                          error:
                            !isToday && !isYesterday
                              ? { code: 'PGRST116' }
                              : isYesterday && !yesterdayRevenue
                                ? { code: 'PGRST116' }
                                : null,
                        })),
                      };
                    }
                    return {
                      single: jest.fn(async () => ({
                        data: dailyRevenue,
                        error: null,
                      })),
                    };
                  }),
                  gte: jest.fn(() => ({
                    order: jest.fn(async () => ({
                      data: revenueTrend,
                      error: null,
                    })),
                  })),
                };
              }
              return {
                single: jest.fn(async () => ({
                  data: dailyRevenue,
                  error: null,
                })),
              };
            }),
          })),
        };
      }

      if (table === 'visits') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              gte: jest.fn((_, gteValue: string) => ({
                lt: jest.fn(async (_field: string, ltValue: string) => {
                  const rangeStart = gteValue.split('T')[0];
                  const rangeEnd = ltValue.split('T')[0];
                  const isYesterdayRange =
                    rangeStart === yesterday && rangeEnd === today;
                  return {
                    data: isYesterdayRange ? yesterdayVisits || [] : visits,
                    error: null,
                  };
                }),
              })),
            })),
          })),
        };
      }

      if (table === 'daily_ai_comments') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(async () => ({
                  data: aiComment,
                  error: aiComment ? null : { code: 'PGRST116' },
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: jest.fn(async (fnName: string) => {
      if (fnName === 'get_hourly_visit_pattern') {
        return { data: heatmap, error: null };
      }
      return { data: null, error: null };
    }),
  } as const;

  return supabase as unknown as any;
}

function createPatientsSupabaseMock({
  patientSummary,
  ltvByPatient,
  riskByPatient,
}: {
  patientSummary: Array<any>;
  ltvByPatient: Record<string, number>;
  riskByPatient: Record<string, number>;
}) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'patient_visit_summary') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(async () => ({ data: patientSummary, error: null })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: jest.fn(async (fnName: string, params: { patient_uuid: string }) => {
      if (fnName === 'calculate_patient_ltv') {
        return { data: ltvByPatient[params.patient_uuid] ?? 0, error: null };
      }
      if (fnName === 'calculate_churn_risk_score') {
        return { data: riskByPatient[params.patient_uuid] ?? 0, error: null };
      }
      return { data: null, error: null };
    }),
  };
}

function createDailyReportsSupabaseMock({ reports }: { reports: Array<any> }) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'daily_reports') {
        const query = {
          gte: jest.fn(() => query),
          lte: jest.fn(() => query),
          order: jest.fn(() => ({
            limit: jest.fn(async () => ({ data: reports, error: null })),
          })),
        };
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => query),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}
