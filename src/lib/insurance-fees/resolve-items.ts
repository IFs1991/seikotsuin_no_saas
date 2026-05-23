import {
  parseInsuranceFeeWarningCodes,
  type InsuranceFeeItemRecord,
} from './types';
import type { ResolvedInsuranceFeeSchedule } from './resolve-schedule';

export type InsuranceFeeItemResolutionErrorCode = 'INVALID_WARNING_CODES';

export class InsuranceFeeItemResolutionError extends Error {
  readonly code: InsuranceFeeItemResolutionErrorCode;
  readonly details: Record<string, string | number | null>;

  constructor(
    code: InsuranceFeeItemResolutionErrorCode,
    message: string,
    details: Record<string, string | number | null> = {}
  ) {
    super(message);
    this.name = 'InsuranceFeeItemResolutionError';
    this.code = code;
    this.details = details;
  }
}

export type ResolveInsuranceFeeItemsInput = {
  schedule: ResolvedInsuranceFeeSchedule;
  items: readonly InsuranceFeeItemRecord[];
};

export type ResolvedInsuranceFeeItem = {
  id: string;
  scheduleCode: string;
  itemCode: string;
  itemName: string;
  officialLabel: string | null;
  category: string;
  amountYen: number | null;
  unit: string;
  billingScope: string;
  manualAmountRequired: boolean;
  autoCalculationAllowed: boolean;
  sourceId: string;
  sourceSnapshotHash: string | null;
  sortOrder: number;
  warningCodes: string[];
};

function isResolvableForSchedule(
  schedule: ResolvedInsuranceFeeSchedule,
  item: InsuranceFeeItemRecord
): boolean {
  if (item.schedule_code !== schedule.scheduleCode) {
    return false;
  }

  if (schedule.payerContextCode !== 'traffic_accident') {
    return true;
  }

  return (
    item.amount_yen === null &&
    item.manual_amount_required &&
    !item.auto_calculation_allowed
  );
}

function bySortOrderThenItemCode(
  left: InsuranceFeeItemRecord,
  right: InsuranceFeeItemRecord
): number {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.item_code.localeCompare(right.item_code);
}

function toResolvedItem(
  item: InsuranceFeeItemRecord
): ResolvedInsuranceFeeItem {
  const warningCodes = parseInsuranceFeeWarningCodes(item.warning_codes_json);
  if (warningCodes === null) {
    throw new InsuranceFeeItemResolutionError(
      'INVALID_WARNING_CODES',
      'insurance_fee_items.warning_codes_json must be an array of strings',
      {
        scheduleCode: item.schedule_code,
        itemCode: item.item_code,
      }
    );
  }

  return {
    id: item.id,
    scheduleCode: item.schedule_code,
    itemCode: item.item_code,
    itemName: item.item_name,
    officialLabel: item.official_label,
    category: item.category,
    amountYen: item.amount_yen,
    unit: item.unit,
    billingScope: item.billing_scope,
    manualAmountRequired: item.manual_amount_required,
    autoCalculationAllowed: item.auto_calculation_allowed,
    sourceId: item.source_id,
    sourceSnapshotHash: item.source_snapshot_hash,
    sortOrder: item.sort_order,
    warningCodes,
  };
}

export function resolveInsuranceFeeItems({
  schedule,
  items,
}: ResolveInsuranceFeeItemsInput): ResolvedInsuranceFeeItem[] {
  const matchingItems: InsuranceFeeItemRecord[] = [];

  for (const item of items) {
    if (isResolvableForSchedule(schedule, item)) {
      matchingItems.push(item);
    }
  }

  matchingItems.sort(bySortOrderThenItemCode);
  return matchingItems.map(toResolvedItem);
}
