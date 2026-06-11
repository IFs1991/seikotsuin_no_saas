import {
  chooseManagerAnalysisBucket,
  parseManagerAnalysisPeriodRequest,
  resolveManagerAnalysisPeriod,
} from '@/lib/manager-analysis-period';

describe('manager-analysis-period', () => {
  const now = new Date('2026-06-11T03:00:00.000Z');

  it('keeps patient-analysis preset behavior as full month and full year by default', () => {
    expect(
      resolveManagerAnalysisPeriod(
        { type: 'month', startDate: null, endDate: null },
        { now }
      )
    ).toEqual({
      type: 'month',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      bucket: 'daily',
    });
    expect(
      resolveManagerAnalysisPeriod(
        { type: 'year', startDate: null, endDate: null },
        { now }
      )
    ).toEqual({
      type: 'year',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      bucket: 'monthly',
    });
  });

  it('supports revenue-analysis to-date clamp for current presets', () => {
    expect(
      resolveManagerAnalysisPeriod(
        { type: 'month', startDate: null, endDate: null },
        { now, clampPresetEndToToday: true }
      )
    ).toEqual({
      type: 'month',
      startDate: '2026-06-01',
      endDate: '2026-06-11',
      bucket: 'daily',
    });
    expect(
      resolveManagerAnalysisPeriod(
        { type: 'last_3_months', startDate: null, endDate: null },
        { now, clampPresetEndToToday: true }
      )
    ).toEqual({
      type: 'last_3_months',
      startDate: '2026-04-01',
      endDate: '2026-06-11',
      bucket: 'weekly',
    });
    expect(
      resolveManagerAnalysisPeriod(
        { type: 'year', startDate: null, endDate: null },
        { now, clampPresetEndToToday: true }
      )
    ).toEqual({
      type: 'year',
      startDate: '2026-01-01',
      endDate: '2026-06-11',
      bucket: 'weekly',
    });
  });

  it('validates custom period using shared error messages', () => {
    expect(
      parseManagerAnalysisPeriodRequest(
        new URLSearchParams(
          'period=custom&start_date=2026-01-01&end_date=2026-04-30'
        )
      )
    ).toEqual({
      success: true,
      period: {
        type: 'custom',
        startDate: '2026-01-01',
        endDate: '2026-04-30',
      },
    });
    expect(
      parseManagerAnalysisPeriodRequest(
        new URLSearchParams(
          'period=custom&start_date=2020-01-01&end_date=2026-01-01'
        )
      )
    ).toEqual({
      success: false,
      message: '期間は最大3年（1095日）以内で指定してください',
    });
  });

  it('chooses buckets with 31 and 180 day thresholds', () => {
    expect(chooseManagerAnalysisBucket('2026-01-01', '2026-01-31')).toBe(
      'daily'
    );
    expect(chooseManagerAnalysisBucket('2026-01-01', '2026-06-29')).toBe(
      'weekly'
    );
    expect(chooseManagerAnalysisBucket('2026-01-01', '2026-06-30')).toBe(
      'monthly'
    );
  });
});
