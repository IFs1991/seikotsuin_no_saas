import {
  buildAdminHomeViewModel,
  buildManagementSignals,
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
      { label: '全店舗売上', value: formatCurrency(1250000) },
      { label: '全店舗患者数', value: '200人' },
      { label: '全店舗平均スコア', value: '4.3 / 5.0' },
    ]);
  });

  it('builds management signals for the admin home', () => {
    const signals = buildManagementSignals([
      {
        id: 'clinic-1',
        name: '本町院',
        totalRevenue: 500000,
        totalPatientCount: 30,
        averagePerformanceScore: 2.8,
      },
      {
        id: 'clinic-2',
        name: '新規院',
        totalRevenue: 0,
        totalPatientCount: 0,
        averagePerformanceScore: 0,
      },
      {
        id: 'clinic-3',
        name: '梅田院',
        totalRevenue: 900000,
        totalPatientCount: 60,
        averagePerformanceScore: 4.4,
      },
    ]);

    expect(signals).toEqual([
      {
        label: '注意店舗',
        value: '1件',
        detail: '平均スコアが基準を下回る店舗数',
        tone: 'warning',
      },
      {
        label: 'データ未計上',
        value: '1件',
        detail: '売上・患者数がまだ計上されていない店舗',
        tone: 'warning',
      },
      {
        label: '通常範囲',
        value: '1件',
        detail: '現時点で基準内に収まっている店舗',
        tone: 'success',
      },
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

  it('includes all dashboard clinics in the admin home view model', () => {
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

    const viewModel = buildAdminHomeViewModel(clinics, {
      totalGroupRevenue: 1400000,
      totalGroupPatientCount: 90,
      averageGroupPerformance: 3.6,
    });

    expect(viewModel.dashboardClinics).toEqual([
      { ...clinics[0], isProblematic: true },
      { ...clinics[1], isProblematic: false },
    ]);
    expect(viewModel.problematicClinics).toEqual([
      { ...clinics[0], isProblematic: true },
    ]);
  });
});
