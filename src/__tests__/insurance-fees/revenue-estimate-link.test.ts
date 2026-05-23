import {
  attachInsuranceFeeMasterProvenance,
  type InsuranceFeeRevenueEstimateMasterLink,
} from '@/lib/insurance-fees/link-revenue-estimate';
import type { ResolvedInsuranceFeeItem } from '@/lib/insurance-fees/resolve-items';
import type { ResolvedInsuranceFeeSchedule } from '@/lib/insurance-fees/resolve-schedule';
import type { RevenueEstimateCalculation } from '@/lib/revenue-estimate';

const insuranceSchedule: ResolvedInsuranceFeeSchedule = {
  scheduleCode: 'JUDO_HI_R6_202410_ACTIVE',
  professionType: 'judo',
  payerContextCode: 'insurance',
  effectiveFrom: '2024-10-01',
  effectiveTo: null,
  scheduleStatus: 'active',
  sourceId: 'MHLW_JUDO_HI_R6_FINAL_20240529',
  sourceSnapshotHash:
    'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
};

const trafficSchedule: ResolvedInsuranceFeeSchedule = {
  ...insuranceSchedule,
  scheduleCode: 'TRAFFIC_JUDO_202606',
  payerContextCode: 'traffic_accident',
  sourceId: 'traffic-accident-source',
  sourceSnapshotHash: 'snapshot-traffic-202606',
};

const matchingItem: ResolvedInsuranceFeeItem = {
  id: 'fee-item-initial',
  scheduleCode: 'JUDO_HI_R6_202410_ACTIVE',
  itemCode: 'JUDO_HI_INITIAL_EXAM',
  itemName: '初検料',
  officialLabel: '初検料',
  category: 'visit_base',
  amountYen: 1550,
  unit: 'visit',
  billingScope: 'treatment_day',
  manualAmountRequired: false,
  autoCalculationAllowed: true,
  sourceId: 'MHLW_JUDO_HI_R6_FINAL_20240529',
  sourceSnapshotHash:
    'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
  sortOrder: 10,
  warningCodes: [],
};

const manualTrafficItem: ResolvedInsuranceFeeItem = {
  ...matchingItem,
  id: 'traffic-manual',
  scheduleCode: 'TRAFFIC_JUDO_202606',
  itemCode: 'TRAFFIC_MANUAL',
  amountYen: null,
  manualAmountRequired: true,
  autoCalculationAllowed: false,
  sourceId: 'traffic-accident-source',
  sourceSnapshotHash: 'snapshot-traffic-202606',
};

function createCalculation(totalAmount: number): RevenueEstimateCalculation {
  return {
    estimateStatus: 'calculated',
    estimatedTotal: totalAmount,
    lines: [
      {
        lineType: 'fee',
        label: '保険 療養費見込み',
        quantity: 1,
        unitAmount: totalAmount,
        totalAmount,
        sortOrder: 10,
      },
    ],
    warnings: [],
  };
}

describe('attachInsuranceFeeMasterProvenance', () => {
  test('stores schedule and a single safe item link without changing amounts', () => {
    const result = attachInsuranceFeeMasterProvenance({
      calculation: createCalculation(1550),
      revenueContextCode: 'insurance',
      schedule: insuranceSchedule,
      items: [matchingItem],
    });

    expect(result.masterLink).toEqual<InsuranceFeeRevenueEstimateMasterLink>({
      usedScheduleCode: 'JUDO_HI_R6_202410_ACTIVE',
      sourceSnapshotHash:
        'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
    });
    expect(result.calculation.estimatedTotal).toBe(1550);
    expect(result.calculation.lines[0]).toMatchObject({
      totalAmount: 1550,
      insuranceFeeItemId: 'fee-item-initial',
      scheduleCode: 'JUDO_HI_R6_202410_ACTIVE',
      feeItemCode: 'JUDO_HI_INITIAL_EXAM',
      sourceSnapshotHash:
        'c2797b42b9ec4558ddc4969a795fbd6e4622e45d1182ad2c02378f788a67ddd3',
    });
  });

  test('does not attach traffic accident item links or automatic amounts', () => {
    const calculation: RevenueEstimateCalculation = {
      ...createCalculation(9000),
      estimateStatus: 'needs_review',
      warnings: [
        {
          warningCode: 'TRAFFIC_ACCIDENT_REVIEW',
          severity: 'needs_review',
          message:
            '交通事故・自賠責関連の概算です。請求確定前に確認してください。',
        },
      ],
    };

    const result = attachInsuranceFeeMasterProvenance({
      calculation,
      revenueContextCode: 'traffic_accident',
      schedule: trafficSchedule,
      items: [manualTrafficItem],
    });

    expect(result.masterLink).toEqual<InsuranceFeeRevenueEstimateMasterLink>({
      usedScheduleCode: 'TRAFFIC_JUDO_202606',
      sourceSnapshotHash: 'snapshot-traffic-202606',
    });
    expect(result.calculation.estimateStatus).toBe('needs_review');
    expect(result.calculation.estimatedTotal).toBe(9000);
    expect(result.calculation.lines[0]).not.toHaveProperty(
      'insuranceFeeItemId'
    );
    expect(result.calculation.warnings).toEqual(calculation.warnings);
  });

  test('leaves line item provenance empty when the fee item match is ambiguous', () => {
    const secondMatchingItem: ResolvedInsuranceFeeItem = {
      ...matchingItem,
      id: 'fee-item-duplicate',
      itemCode: 'JUDO_HI_INITIAL_EXAM_DUPLICATE',
    };

    const result = attachInsuranceFeeMasterProvenance({
      calculation: createCalculation(1550),
      revenueContextCode: 'insurance',
      schedule: insuranceSchedule,
      items: [matchingItem, secondMatchingItem],
    });

    expect(result.masterLink.usedScheduleCode).toBe(
      'JUDO_HI_R6_202410_ACTIVE'
    );
    expect(result.calculation.lines[0]).not.toHaveProperty(
      'insuranceFeeItemId'
    );
  });
});
