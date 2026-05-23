import { calculateRevenueEstimate } from '@/lib/revenue-estimate';

describe('calculateRevenueEstimate', () => {
  test('calculates private revenue from fee without warnings', () => {
    const result = calculateRevenueEstimate({
      revenueContextCode: 'private',
      fee: 5000,
      visitStageCode: null,
    });

    expect(result).toMatchObject({
      estimateStatus: 'calculated',
      estimatedTotal: 5000,
      warnings: [],
    });
    expect(result.lines[0]).toMatchObject({
      label: '自費 売上見込み',
      totalAmount: 5000,
    });
  });

  test('marks traffic accident estimates as needs review', () => {
    const result = calculateRevenueEstimate({
      revenueContextCode: 'traffic_accident',
      fee: 9000,
      visitStageCode: null,
    });

    expect(result.estimateStatus).toBe('needs_review');
    expect(result.estimatedTotal).toBe(9000);
    expect(result.warnings[0]).toMatchObject({
      warningCode: 'TRAFFIC_ACCIDENT_REVIEW',
      severity: 'needs_review',
    });
  });

  test('requires review for insurance estimate without visit stage', () => {
    const result = calculateRevenueEstimate({
      revenueContextCode: 'insurance',
      fee: 1550,
      visitStageCode: null,
    });

    expect(result.estimateStatus).toBe('needs_review');
    expect(result.warnings[0]).toMatchObject({
      warningCode: 'INSURANCE_VISIT_STAGE_REQUIRED',
    });
  });

  test('calculates insurance estimate when visit stage is present', () => {
    const result = calculateRevenueEstimate({
      revenueContextCode: 'insurance',
      fee: 1550,
      visitStageCode: 'first_visit',
    });

    expect(result).toMatchObject({
      estimateStatus: 'calculated',
      estimatedTotal: 1550,
      warnings: [],
    });
  });
});
