import { ensureClinicAccess } from '@/lib/supabase/guards';

jest.mock('@/lib/supabase/guards', () => ({
  ensureClinicAccess: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
  NextRequest: class {},
}));

const ensureClinicAccessMock = ensureClinicAccess as jest.Mock;

let getHandler: (request: {
  nextUrl: { searchParams: URLSearchParams };
}) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

beforeAll(async () => {
  const staffModule = await import('@/app/api/staff/route');
  getHandler = staffModule.GET as typeof getHandler;
});

const createGetRequest = (clinicId: string) => ({
  nextUrl: {
    searchParams: new URLSearchParams({ clinic_id: clinicId }),
  },
});

describe('GET /api/staff', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns validation error for invalid clinic_id', async () => {
    const request = createGetRequest('not-a-uuid');

    const response = await getHandler(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect((payload as { success: boolean }).success).toBe(false);
  });

  describe('response schema validation', () => {
    const mockStaffPerformanceSummary = [
      {
        staff_id: 'staff-1',
        staff_name: '田中先生',
        clinic_id: '11111111-1111-4111-8111-111111111111',
        role: 'practitioner',
        total_visits: 100,
        unique_patients: 50,
        total_revenue_generated: 500000,
        average_satisfaction_score: 4.5,
        working_days: 20,
      },
      {
        staff_id: 'staff-2',
        staff_name: '佐藤先生',
        clinic_id: '11111111-1111-4111-8111-111111111111',
        role: 'practitioner',
        total_visits: 80,
        unique_patients: 40,
        total_revenue_generated: 400000,
        average_satisfaction_score: 4.2,
        working_days: 18,
      },
    ];

    const mockMonthlyPerformance = [
      {
        staff: { name: '田中先生', role: 'practitioner' },
        performance_date: '2025-01-15',
        revenue_generated: 25000,
        patient_count: 5,
        satisfaction_score: 4.5,
      },
    ];

    const mockReservations = [
      {
        id: 'res-1',
        staff_id: 'staff-1',
        start_time: '2025-01-15T09:00:00Z',
        end_time: '2025-01-15T10:00:00Z',
        status: 'completed',
      },
    ];

    const mockResources = [
      {
        id: 'staff-1',
        name: '田中先生',
        type: 'staff',
        working_hours: {
          monday: { start: '09:00', end: '18:00' },
          tuesday: { start: '09:00', end: '18:00' },
          wednesday: { start: '09:00', end: '18:00' },
          thursday: { start: '09:00', end: '18:00' },
          friday: { start: '09:00', end: '18:00' },
          saturday: { start: '09:00', end: '17:00' },
          sunday: null,
        },
      },
    ];

    beforeEach(() => {
      ensureClinicAccessMock.mockResolvedValue({
        supabase: {
          from: jest.fn((table: string) => {
            if (table === 'staff_performance_summary') {
              return {
                select: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({
                    data: mockStaffPerformanceSummary,
                    error: null,
                  }),
                }),
              };
            }
            if (table === 'staff_performance') {
              return {
                select: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    gte: jest.fn().mockReturnValue({
                      order: jest.fn().mockResolvedValue({
                        data: mockMonthlyPerformance,
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            }
            if (table === 'reservations') {
              return {
                select: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    gte: jest.fn().mockReturnValue({
                      lte: jest.fn().mockResolvedValue({
                        data: mockReservations,
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            }
            if (table === 'resources') {
              return {
                select: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                      data: mockResources,
                      error: null,
                    }),
                  }),
                }),
              };
            }
            return {};
          }),
        },
        // DOD-09: permissionsを追加
        permissions: {
          role: 'clinic_admin',
          clinic_id: '11111111-1111-4111-8111-111111111111',
        },
      });
    });

    it('returns staffMetrics with correct structure', async () => {
      const request = createGetRequest('11111111-1111-4111-8111-111111111111');
      const response = await getHandler(request);

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        success: boolean;
        data: {
          staffMetrics: {
            dailyPatients: number;
            totalRevenue: number;
            averageSatisfaction: number;
          };
        };
      };
      expect(payload.success).toBe(true);
      expect(payload.data.staffMetrics).toBeDefined();
      expect(typeof payload.data.staffMetrics.dailyPatients).toBe('number');
      expect(typeof payload.data.staffMetrics.totalRevenue).toBe('number');
      expect(typeof payload.data.staffMetrics.averageSatisfaction).toBe(
        'number'
      );
    });

    it('returns revenueRanking with correct structure', async () => {
      const request = createGetRequest('11111111-1111-4111-8111-111111111111');
      const response = await getHandler(request);

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: {
          revenueRanking: Array<{
            staff_id: string;
            name: string;
            revenue: number;
            patients: number;
            satisfaction: number;
          }>;
        };
      };
      expect(Array.isArray(payload.data.revenueRanking)).toBe(true);
      expect(payload.data.revenueRanking[0]).toMatchObject({
        staff_id: expect.any(String),
        name: expect.any(String),
        revenue: expect.any(Number),
        patients: expect.any(Number),
        satisfaction: expect.any(Number),
      });
    });

    it('returns satisfactionCorrelation with correct structure', async () => {
      const request = createGetRequest('11111111-1111-4111-8111-111111111111');
      const response = await getHandler(request);

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: {
          satisfactionCorrelation: Array<{
            name: string;
            satisfaction: number;
            revenue: number;
            patients: number;
          }>;
        };
      };
      expect(Array.isArray(payload.data.satisfactionCorrelation)).toBe(true);
      expect(payload.data.satisfactionCorrelation[0]).toMatchObject({
        name: expect.any(String),
        satisfaction: expect.any(Number),
        revenue: expect.any(Number),
        patients: expect.any(Number),
      });
    });

    it('returns performanceTrends with correct structure', async () => {
      const request = createGetRequest('11111111-1111-4111-8111-111111111111');
      const response = await getHandler(request);

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: {
          performanceTrends: Record<
            string,
            Array<{
              date: string;
              revenue: number;
              patients: number;
              satisfaction: number;
            }>
          >;
        };
      };
      expect(typeof payload.data.performanceTrends).toBe('object');
      expect(payload.data.performanceTrends['田中先生'][0]).toMatchObject({
        date: expect.any(String),
        revenue: expect.any(Number),
        patients: expect.any(Number),
        satisfaction: expect.any(Number),
      });
    });

    it('does NOT return dummy skillMatrix with random values', async () => {
      const request = createGetRequest('11111111-1111-4111-8111-111111111111');
      const response = await getHandler(request);

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: {
          skillMatrix?: Array<{
            skills: Array<{ level: number }>;
          }>;
        };
      };

      // skillMatrixが存在しないか、存在する場合はランダムでない値であることを確認
      if (payload.data.skillMatrix) {
        // 同じリクエストを2回実行して結果が同じことを確認（ランダムでない）
        const response2 = await getHandler(request);
        const payload2 = (await response2.json()) as {
          data: {
            skillMatrix: Array<{
              skills: Array<{ level: number }>;
            }>;
          };
        };

        expect(payload.data.skillMatrix).toEqual(payload2.data.skillMatrix);
      }
    });

    it('does NOT return hardcoded trainingHistory', async () => {
      const request = createGetRequest('11111111-1111-4111-8111-111111111111');
      const response = await getHandler(request);

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        data: {
          trainingHistory?: Array<{
            title: string;
            date: string;
          }>;
        };
      };

      // trainingHistoryが存在しないか、ハードコードされた値でないことを確認
      if (
        payload.data.trainingHistory &&
        payload.data.trainingHistory.length > 0
      ) {
        const hardcodedTitles = ['基礎施術研修', 'コミュニケーション研修'];
        const hasHardcodedData = payload.data.trainingHistory.some(item =>
          hardcodedTitles.includes(item.title)
        );
        expect(hasHardcodedData).toBe(false);
      }
    });
  });
});

describe('shift analysis', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockStaffPerformanceSummary = [
    {
      staff_id: 'staff-1',
      staff_name: '田中先生',
      clinic_id: '11111111-1111-4111-8111-111111111111',
      role: 'practitioner',
      total_visits: 100,
      unique_patients: 50,
      total_revenue_generated: 500000,
      average_satisfaction_score: 4.5,
      working_days: 20,
    },
  ];

  const mockReservations = [
    {
      id: 'res-1',
      staff_id: 'staff-1',
      start_time: '2025-01-15T09:00:00Z',
      end_time: '2025-01-15T10:00:00Z',
      status: 'completed',
    },
    {
      id: 'res-2',
      staff_id: 'staff-1',
      start_time: '2025-01-15T10:00:00Z',
      end_time: '2025-01-15T11:00:00Z',
      status: 'completed',
    },
    {
      id: 'res-3',
      staff_id: 'staff-1',
      start_time: '2025-01-15T14:00:00Z',
      end_time: '2025-01-15T15:00:00Z',
      status: 'completed',
    },
  ];

  const mockResources = [
    {
      id: 'staff-1',
      name: '田中先生',
      type: 'staff',
      working_hours: {
        monday: { start: '09:00', end: '18:00' },
        tuesday: { start: '09:00', end: '18:00' },
        wednesday: { start: '09:00', end: '18:00' },
        thursday: { start: '09:00', end: '18:00' },
        friday: { start: '09:00', end: '18:00' },
        saturday: { start: '09:00', end: '17:00' },
        sunday: null,
      },
    },
  ];

  beforeEach(() => {
    ensureClinicAccessMock.mockResolvedValue({
      supabase: {
        from: jest.fn((table: string) => {
          if (table === 'staff_performance_summary') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                  data: mockStaffPerformanceSummary,
                  error: null,
                }),
              }),
            };
          }
          if (table === 'staff_performance') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  gte: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({
                      data: [],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'reservations') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  gte: jest.fn().mockReturnValue({
                    lte: jest.fn().mockResolvedValue({
                      data: mockReservations,
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'resources') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({
                    data: mockResources,
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      },
      // DOD-09: permissionsを追加
      permissions: {
        role: 'clinic_admin',
        clinic_id: '11111111-1111-4111-8111-111111111111',
      },
    });
  });

  it('returns shiftAnalysis with hourlyReservations', async () => {
    const request = createGetRequest('11111111-1111-4111-8111-111111111111');
    const response = await getHandler(request);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        shiftAnalysis?: {
          hourlyReservations: Array<{
            hour: number;
            count: number;
          }>;
        };
      };
    };

    expect(payload.data.shiftAnalysis).toBeDefined();
    expect(Array.isArray(payload.data.shiftAnalysis?.hourlyReservations)).toBe(
      true
    );
  });

  it('returns shiftAnalysis with utilizationRate', async () => {
    const request = createGetRequest('11111111-1111-4111-8111-111111111111');
    const response = await getHandler(request);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        shiftAnalysis?: {
          utilizationRate: number;
        };
      };
    };

    expect(payload.data.shiftAnalysis).toBeDefined();
    expect(typeof payload.data.shiftAnalysis?.utilizationRate).toBe('number');
    expect(payload.data.shiftAnalysis?.utilizationRate).toBeGreaterThanOrEqual(
      0
    );
    expect(payload.data.shiftAnalysis?.utilizationRate).toBeLessThanOrEqual(
      100
    );
  });

  it('returns shiftAnalysis with recommendation comments', async () => {
    const request = createGetRequest('11111111-1111-4111-8111-111111111111');
    const response = await getHandler(request);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        shiftAnalysis?: {
          recommendations: string[];
        };
      };
    };

    expect(payload.data.shiftAnalysis).toBeDefined();
    expect(Array.isArray(payload.data.shiftAnalysis?.recommendations)).toBe(
      true
    );
  });
});
