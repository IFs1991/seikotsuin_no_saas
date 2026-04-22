import {
  aggregateAdminClinicKpis,
  buildDeterministicAdminInsights,
  buildAdminAiInsights,
  buildPeriodDateRange,
  summarizeAdminKpi,
  type AdminAiInsightInput,
} from '@/lib/admin/ai-insights';
import type { SupabaseServerClient } from '@/lib/supabase';

describe('admin ai insights helpers', () => {
  it('buildPeriodDateRange returns an inclusive deterministic date range', () => {
    expect(
      buildPeriodDateRange(30, new Date('2026-04-22T12:00:00.000Z'))
    ).toEqual({
      startDate: '2026-03-24',
      endDate: '2026-04-22',
    });
  });

  it('aggregateAdminClinicKpis aggregates revenue, unique patients, and score by clinic', () => {
    const clinics = aggregateAdminClinicKpis(
      ['clinic-1', 'clinic-2'],
      [
        { clinic_id: 'clinic-1', total_revenue: 100000 },
        { clinic_id: 'clinic-1', total_revenue: '50000' },
        { clinic_id: 'clinic-2', total_revenue: 200000 },
        { clinic_id: 'outside', total_revenue: 999999 },
      ],
      [
        { clinic_id: 'clinic-1', patient_id: 'patient-1' },
        { clinic_id: 'clinic-1', patient_id: 'patient-1' },
        { clinic_id: 'clinic-1', patient_id: 'patient-2' },
        { clinic_id: 'clinic-2', patient_id: 'patient-3' },
      ],
      [
        { clinic_id: 'clinic-1', total_revenue_generated: 120000 },
        { clinic_id: 'clinic-1', total_revenue_generated: 80000 },
        { clinic_id: 'clinic-2', total_revenue_generated: 300000 },
      ]
    );

    expect(clinics).toEqual([
      {
        clinic_id: 'clinic-1',
        revenue: 150000,
        patients: 2,
        performance_score: 5,
      },
      {
        clinic_id: 'clinic-2',
        revenue: 200000,
        patients: 1,
        performance_score: 5,
      },
    ]);
  });

  it('summarizeAdminKpi returns total KPI and average performance', () => {
    expect(
      summarizeAdminKpi([
        {
          clinic_id: 'clinic-1',
          revenue: 100000,
          patients: 2,
          performance_score: 1.5,
        },
        {
          clinic_id: 'clinic-2',
          revenue: 50000,
          patients: 3,
          performance_score: null,
        },
      ])
    ).toEqual({
      total_revenue: 150000,
      total_patients: 5,
      average_performance_score: 1.5,
    });
  });

  it('buildDeterministicAdminInsights returns stable insights and anomalies without external APIs', () => {
    const input: AdminAiInsightInput = {
      period_days: 30,
      clinic_count: 2,
      kpi: {
        total_revenue: 300000,
        total_patients: 10,
        average_performance_score: 3,
      },
      clinics: [
        {
          clinic_id: 'clinic-1',
          revenue: 300000,
          patients: 10,
          performance_score: 3,
        },
        {
          clinic_id: 'clinic-2',
          revenue: 0,
          patients: 0,
          performance_score: null,
        },
      ],
    };

    const result = buildDeterministicAdminInsights(input);

    expect(result.summary).toContain('直近30日');
    expect(result.insights).toHaveLength(3);
    expect(result.insights[0].impact).toBe('high');
    expect(result.anomalies.map(item => item.title)).toEqual([
      '売上偏重が発生',
      '患者数0の店舗があります',
    ]);
  });

  it('buildAdminAiInsights returns an empty result without querying when scope has no clinics', async () => {
    const client = {
      from: jest.fn(),
    } as unknown as SupabaseServerClient;

    const result = await buildAdminAiInsights(client, [], 30);

    expect(client.from).not.toHaveBeenCalled();
    expect(result.scope).toEqual({
      clinic_ids: [],
      clinic_count: 0,
      period_days: 30,
    });
    expect(result.kpi).toEqual({
      total_revenue: 0,
      total_patients: 0,
      average_performance_score: null,
    });
  });
});
