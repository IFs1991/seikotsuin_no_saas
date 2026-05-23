import type { RevenueContextCode } from '@/lib/revenue-context';
import type {
  RevenueEstimateCalculation,
  RevenueEstimateLine,
} from '@/lib/revenue-estimate';
import type { ResolvedInsuranceFeeItem } from './resolve-items';
import type { ResolvedInsuranceFeeSchedule } from './resolve-schedule';

export type InsuranceFeeRevenueEstimateMasterLink = {
  usedScheduleCode: string;
  sourceSnapshotHash: string | null;
};

export type AttachInsuranceFeeMasterProvenanceInput = {
  calculation: RevenueEstimateCalculation;
  revenueContextCode: RevenueContextCode;
  schedule: ResolvedInsuranceFeeSchedule;
  items: readonly ResolvedInsuranceFeeItem[];
};

export type AttachInsuranceFeeMasterProvenanceResult = {
  calculation: RevenueEstimateCalculation;
  masterLink: InsuranceFeeRevenueEstimateMasterLink;
};

function isSafeAutomaticItem(
  item: ResolvedInsuranceFeeItem
): item is ResolvedInsuranceFeeItem & { amountYen: number } {
  return (
    item.amountYen !== null &&
    item.autoCalculationAllowed &&
    !item.manualAmountRequired
  );
}

function findSingleLineItemMatch(
  line: RevenueEstimateLine,
  items: readonly ResolvedInsuranceFeeItem[]
): ResolvedInsuranceFeeItem | null {
  let match: ResolvedInsuranceFeeItem | null = null;
  let matchCount = 0;

  for (const item of items) {
    if (!isSafeAutomaticItem(item)) {
      continue;
    }

    if (item.amountYen !== line.unitAmount) {
      continue;
    }

    match = item;
    matchCount += 1;

    if (matchCount > 1) {
      return null;
    }
  }

  return match;
}

function attachLineItemProvenance(
  line: RevenueEstimateLine,
  items: readonly ResolvedInsuranceFeeItem[]
): RevenueEstimateLine {
  const matchedItem = findSingleLineItemMatch(line, items);

  if (!matchedItem) {
    return line;
  }

  return {
    ...line,
    insuranceFeeItemId: matchedItem.id,
    scheduleCode: matchedItem.scheduleCode,
    feeItemCode: matchedItem.itemCode,
    sourceSnapshotHash: matchedItem.sourceSnapshotHash,
  };
}

export function attachInsuranceFeeMasterProvenance({
  calculation,
  revenueContextCode,
  schedule,
  items,
}: AttachInsuranceFeeMasterProvenanceInput): AttachInsuranceFeeMasterProvenanceResult {
  const masterLink: InsuranceFeeRevenueEstimateMasterLink = {
    usedScheduleCode: schedule.scheduleCode,
    sourceSnapshotHash: schedule.sourceSnapshotHash,
  };

  if (revenueContextCode === 'traffic_accident') {
    return {
      masterLink,
      calculation,
    };
  }

  return {
    masterLink,
    calculation: {
      ...calculation,
      lines: calculation.lines.map(line =>
        attachLineItemProvenance(line, items)
      ),
    },
  };
}
