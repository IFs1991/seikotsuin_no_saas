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

type SafeAutomaticItem = ResolvedInsuranceFeeItem & { amountYen: number };
type ItemAmountBucket =
  | {
      kind: 'single';
      item: SafeAutomaticItem;
    }
  | {
      kind: 'ambiguous';
    };

function isSafeAutomaticItem(
  item: ResolvedInsuranceFeeItem
): item is SafeAutomaticItem {
  return (
    item.amountYen !== null &&
    item.autoCalculationAllowed &&
    !item.manualAmountRequired
  );
}

function buildSingleAutomaticItemByAmount(
  items: readonly ResolvedInsuranceFeeItem[]
): Map<number, ItemAmountBucket> {
  const itemByAmount = new Map<number, ItemAmountBucket>();

  for (const item of items) {
    if (!isSafeAutomaticItem(item)) {
      continue;
    }

    const existing = itemByAmount.get(item.amountYen);
    if (existing) {
      itemByAmount.set(item.amountYen, { kind: 'ambiguous' });
    } else {
      itemByAmount.set(item.amountYen, { kind: 'single', item });
    }
  }

  return itemByAmount;
}

function findSingleLineItemMatch(
  line: RevenueEstimateLine,
  itemByAmount: ReadonlyMap<number, ItemAmountBucket>
): SafeAutomaticItem | null {
  const bucket = itemByAmount.get(line.unitAmount);
  if (!bucket || bucket.kind === 'ambiguous') {
    return null;
  }

  return bucket.item;
}

function attachLineItemProvenance(
  line: RevenueEstimateLine,
  itemByAmount: ReadonlyMap<number, ItemAmountBucket>
): RevenueEstimateLine {
  const matchedItem = findSingleLineItemMatch(line, itemByAmount);

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

  const itemByAmount = buildSingleAutomaticItemByAmount(items);

  return {
    masterLink,
    calculation: {
      ...calculation,
      lines: calculation.lines.map(line =>
        attachLineItemProvenance(line, itemByAmount)
      ),
    },
  };
}
