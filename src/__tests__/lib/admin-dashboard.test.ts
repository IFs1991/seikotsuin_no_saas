import {
  buildAdminDashboardPayload,
  createEmptyAdminDashboardPayload,
} from '@/lib/admin/dashboard';

describe('admin dashboard domain helpers', () => {
  it('returns an empty payload when no clinics are available', () => {
    expect(createEmptyAdminDashboardPayload()).toEqual({
      clinicsData: [],
      overallKpis: {
        totalGroupRevenue: 0,
        totalGroupPatientCount: 0,
        averageGroupPerformance: 0,
      },
    });
  });

  it('aggregates clinic rows, daily reports, and staff performance rows', () => {
    const payload = buildAdminDashboardPayload(
      [
        { id: 'clinic-1', name: '本町院' },
        { id: 'clinic-2', name: '梅田院' },
      ],
      [
        {
          clinic_id: 'clinic-1',
          total_patients: 80,
          total_revenue: 500000,
        },
        {
          clinic_id: 'clinic-1',
          total_patients: 40,
          total_revenue: '250000',
        },
        {
          clinic_id: 'clinic-2',
          total_patients: 30,
          total_revenue: 300000,
        },
      ],
      [
        {
          clinic_id: 'clinic-1',
          performance_score: 4.5,
        },
        {
          clinic_id: 'clinic-1',
          performance_score: 3.5,
        },
        {
          clinic_id: 'clinic-2',
          performance_score: 2.5,
        },
      ]
    );

    expect(payload).toEqual({
      clinicsData: [
        {
          id: 'clinic-1',
          name: '本町院',
          totalRevenue: 750000,
          totalPatientCount: 120,
          averagePerformanceScore: 4,
        },
        {
          id: 'clinic-2',
          name: '梅田院',
          totalRevenue: 300000,
          totalPatientCount: 30,
          averagePerformanceScore: 2.5,
        },
      ],
      overallKpis: {
        totalGroupRevenue: 1050000,
        totalGroupPatientCount: 150,
        averageGroupPerformance: 3.25,
      },
    });
  });

  it('normalizes string aggregate values returned by PostgREST', () => {
    const payload = buildAdminDashboardPayload(
      [{ id: 'clinic-1', name: '本町院' }],
      [
        {
          clinic_id: 'clinic-1',
          total_patients: '120',
          total_revenue: '750000',
        },
      ],
      [
        {
          clinic_id: 'clinic-1',
          performance_score: '4.25',
        },
      ]
    );

    expect(payload.clinicsData[0]).toEqual({
      id: 'clinic-1',
      name: '本町院',
      totalRevenue: 750000,
      totalPatientCount: 120,
      averagePerformanceScore: 4.25,
    });
  });
});
