import {
  buildSummaryMetrics,
  decorateDashboardClinics,
  formatCurrency,
  isProblematicClinic,
} from '@/components/dashboard/admin-dashboard.utils';

describe('admin-dashboard utils', () => {
  it('builds summary metrics from overall KPI payloads', () => {
    const metrics = buildSummaryMetrics({
      totalGroupRevenue: 1250000,
      totalGroupPatientCount: 200,
      averageGroupPerformance: 4.35,
    });

    expect(metrics).toEqual([
      { label: '総売上', value: formatCurrency(1250000) },
      { label: '総患者数', value: '200人' },
      { label: '平均パフォーマンス', value: '4.3 / 5.0' },
    ]);
  });

  it('marks only low-performance clinics with patient activity as problematic', () => {
    expect(
      isProblematicClinic({
        id: 'clinic-1',
        name: '本町院',
        totalRevenue: 500000,
        totalPatientCount: 30,
        averagePerformanceScore: 2.8,
      })
    ).toBe(true);

    expect(
      isProblematicClinic({
        id: 'clinic-2',
        name: '新規院',
        totalRevenue: 0,
        totalPatientCount: 0,
        averagePerformanceScore: 0,
      })
    ).toBe(false);
  });

  it('decorates clinics without mutating source values', () => {
    const clinics = [
      {
        id: 'clinic-1',
        name: '本町院',
        totalRevenue: 500000,
        totalPatientCount: 30,
        averagePerformanceScore: 2.8,
      },
      {
        id: 'clinic-2',
        name: '梅田院',
        totalRevenue: 900000,
        totalPatientCount: 60,
        averagePerformanceScore: 4.4,
      },
    ];

    const decorated = decorateDashboardClinics(clinics);

    expect(decorated).toEqual([
      { ...clinics[0], isProblematic: true },
      { ...clinics[1], isProblematic: false },
    ]);
    expect(clinics).toEqual([
      {
        id: 'clinic-1',
        name: '本町院',
        totalRevenue: 500000,
        totalPatientCount: 30,
        averagePerformanceScore: 2.8,
      },
      {
        id: 'clinic-2',
        name: '梅田院',
        totalRevenue: 900000,
        totalPatientCount: 60,
        averagePerformanceScore: 4.4,
      },
    ]);
  });
});
