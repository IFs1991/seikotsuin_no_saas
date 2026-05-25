import { calculateMenuBillingSnapshot } from '@/lib/menu-billing-calculation';

describe('calculateMenuBillingSnapshot', () => {
  test('splits insurance gross amount into 30 percent patient copay and insurer receivable', () => {
    const result = calculateMenuBillingSnapshot({
      revenueContextCode: 'insurance',
      calculationMethod: 'insurance_master',
      grossEstimatedTotal: 2000,
      patientBurdenRate: 30,
    });

    expect(result).toMatchObject({
      estimateStatus: 'calculated',
      estimatedTotal: 2000,
      pricingSnapshotStatus: 'confirmed',
      lines: [
        { amountRole: 'gross_estimated_total', totalAmount: 2000 },
        { amountRole: 'patient_copay_estimated', totalAmount: 600 },
        { amountRole: 'insurer_receivable_estimated', totalAmount: 1400 },
      ],
      warnings: [],
    });
  });

  test('supports zero percent insurance burden', () => {
    const result = calculateMenuBillingSnapshot({
      revenueContextCode: 'insurance',
      calculationMethod: 'insurance_master',
      grossEstimatedTotal: 2000,
      patientBurdenRate: 0,
    });

    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountRole: 'patient_copay_estimated',
          totalAmount: 0,
        }),
        expect.objectContaining({
          amountRole: 'insurer_receivable_estimated',
          totalAmount: 2000,
        }),
      ])
    );
  });

  test('calculates fixed self-pay revenue as a private line', () => {
    const result = calculateMenuBillingSnapshot({
      revenueContextCode: 'private',
      calculationMethod: 'fixed_amount',
      fixedAmountYen: 4500,
    });

    expect(result).toMatchObject({
      estimateStatus: 'calculated',
      estimatedTotal: 4500,
      lines: [
        {
          amountRole: 'private_revenue_estimated',
          totalAmount: 4500,
        },
      ],
    });
  });

  test('keeps traffic accident as manual estimate and needs review', () => {
    const result = calculateMenuBillingSnapshot({
      revenueContextCode: 'traffic_accident',
      calculationMethod: 'manual_estimate',
      manualEstimatedAmount: 5000,
    });

    expect(result).toMatchObject({
      estimateStatus: 'needs_review',
      estimatedTotal: 5000,
      pricingSnapshotStatus: 'needs_review',
      lines: [
        {
          amountRole: 'traffic_accident_receivable_estimated',
          totalAmount: 5000,
        },
      ],
      warnings: [
        {
          warningCode: 'TRAFFIC_ACCIDENT_REVIEW',
          severity: 'needs_review',
        },
      ],
    });
  });

  test('keeps workers compensation as manual estimate and needs review', () => {
    const result = calculateMenuBillingSnapshot({
      revenueContextCode: 'workers_comp',
      calculationMethod: 'manual_estimate',
      manualEstimatedAmount: 4800,
    });

    expect(result).toMatchObject({
      estimateStatus: 'needs_review',
      lines: [
        {
          amountRole: 'workers_comp_receivable_estimated',
          totalAmount: 4800,
        },
      ],
      warnings: [{ warningCode: 'WORKERS_COMP_REVIEW' }],
    });
  });
});
