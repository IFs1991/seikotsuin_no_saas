export type BillingType = 'insurance' | 'private';

export type RevenueContextCode =
  | 'insurance'
  | 'private'
  | 'traffic_accident'
  | 'workers_comp'
  | 'product'
  | 'ticket'
  | 'mixed'
  | 'other';

export type SelectableRevenueContextCode = Exclude<RevenueContextCode, 'mixed'>;

export type RevenueContextSource = 'derived' | 'manual' | 'override' | 'system';

export type AmountSource =
  | 'menu_price'
  | 'manual'
  | 'estimate'
  | 'override'
  | 'reservation';

export type EstimateStatus =
  | 'not_calculated'
  | 'calculated'
  | 'needs_review'
  | 'blocked'
  | 'overridden';

export const SELECTABLE_REVENUE_CONTEXT_CODES = [
  'insurance',
  'private',
  'traffic_accident',
  'workers_comp',
  'product',
  'ticket',
  'other',
] as const satisfies readonly SelectableRevenueContextCode[];

export const REVENUE_CONTEXT_LABELS: Record<RevenueContextCode, string> = {
  insurance: '保険',
  private: '自費',
  traffic_accident: '交通事故',
  workers_comp: '労災',
  product: '物販',
  ticket: '回数券',
  mixed: '混合',
  other: 'その他',
};

export function deriveLegacyBillingType(
  revenueContextCode: RevenueContextCode
): BillingType {
  return revenueContextCode === 'insurance' ? 'insurance' : 'private';
}

export function deriveRevenueContextCodeFromBillingType(
  billingType: BillingType
): SelectableRevenueContextCode {
  return billingType === 'insurance' ? 'insurance' : 'private';
}

export function isSelectableRevenueContextCode(
  value: unknown
): value is SelectableRevenueContextCode {
  return SELECTABLE_REVENUE_CONTEXT_CODES.some(code => code === value);
}

export function assertBillingTypeCompatible(
  billingType: BillingType | undefined,
  revenueContextCode: SelectableRevenueContextCode | undefined
): void {
  if (!billingType || !revenueContextCode) return;

  const derived = deriveLegacyBillingType(revenueContextCode);

  if (billingType !== derived) {
    throw new Error('billingType and revenueContextCode are incompatible');
  }
}
