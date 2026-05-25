import type { RevenueContextCode } from '@/lib/revenue-context';
import type { PatientBurdenRate } from '@/lib/customer-insurance-coverage';

export type MenuBillingCalculationMethod =
  | 'fixed_amount'
  | 'insurance_master'
  | 'manual_estimate';

export type RevenueAmountRole =
  | 'gross_estimated_total'
  | 'patient_copay_estimated'
  | 'insurer_receivable_estimated'
  | 'private_revenue_estimated'
  | 'traffic_accident_receivable_estimated'
  | 'workers_comp_receivable_estimated'
  | 'adjustment';

export type MenuBillingCalculationWarning = {
  warningCode: string;
  severity: 'info' | 'warning' | 'needs_review' | 'blocked';
  message: string;
};

export type MenuBillingCalculationLine = {
  amountRole: RevenueAmountRole;
  lineType: string;
  label: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  sortOrder: number;
};

export type MenuBillingCalculationInput = {
  revenueContextCode: RevenueContextCode;
  calculationMethod: MenuBillingCalculationMethod;
  grossEstimatedTotal?: number | null;
  fixedAmountYen?: number | null;
  manualEstimatedAmount?: number | null;
  patientBurdenRate?: PatientBurdenRate | null;
};

export type MenuBillingCalculationResult = {
  estimateStatus: 'calculated' | 'needs_review' | 'blocked';
  estimatedTotal: number;
  pricingSnapshotStatus: 'confirmed' | 'needs_review';
  lines: MenuBillingCalculationLine[];
  warnings: MenuBillingCalculationWarning[];
};

const TRAFFIC_ACCIDENT_REVIEW: MenuBillingCalculationWarning = {
  warningCode: 'TRAFFIC_ACCIDENT_REVIEW',
  severity: 'needs_review',
  message:
    '交通事故・自賠責関連の手入力概算です。公式マスタ由来の自動請求額ではありません。',
};

const WORKERS_COMP_REVIEW: MenuBillingCalculationWarning = {
  warningCode: 'WORKERS_COMP_REVIEW',
  severity: 'needs_review',
  message: '労災関連の手入力概算です。Phase 4Aでは自動算定未対応です。',
};

function normalizeAmount(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

function roundYen(value: number): number {
  return Math.round(value);
}

function createLine(params: {
  amountRole: RevenueAmountRole;
  lineType: string;
  label: string;
  amount: number;
  sortOrder: number;
}): MenuBillingCalculationLine {
  return {
    amountRole: params.amountRole,
    lineType: params.lineType,
    label: params.label,
    quantity: 1,
    unitAmount: params.amount,
    totalAmount: params.amount,
    sortOrder: params.sortOrder,
  };
}

export function calculateMenuBillingSnapshot(
  input: MenuBillingCalculationInput
): MenuBillingCalculationResult {
  if (input.calculationMethod === 'fixed_amount') {
    const amount = normalizeAmount(input.fixedAmountYen);
    return {
      estimateStatus: 'calculated',
      estimatedTotal: amount,
      pricingSnapshotStatus: 'confirmed',
      lines: [
        createLine({
          amountRole: 'private_revenue_estimated',
          lineType: 'fixed_amount',
          label: '自費 売上見込み',
          amount,
          sortOrder: 10,
        }),
      ],
      warnings: [],
    };
  }

  if (input.calculationMethod === 'manual_estimate') {
    const amount = normalizeAmount(input.manualEstimatedAmount);
    const isWorkersComp = input.revenueContextCode === 'workers_comp';
    const warning = isWorkersComp
      ? WORKERS_COMP_REVIEW
      : TRAFFIC_ACCIDENT_REVIEW;
    return {
      estimateStatus: 'needs_review',
      estimatedTotal: amount,
      pricingSnapshotStatus: 'needs_review',
      lines: [
        createLine({
          amountRole: isWorkersComp
            ? 'workers_comp_receivable_estimated'
            : 'traffic_accident_receivable_estimated',
          lineType: 'manual_estimate',
          label: isWorkersComp ? '労災 手入力概算' : '交通事故 手入力概算',
          amount,
          sortOrder: 10,
        }),
      ],
      warnings: [warning],
    };
  }

  const gross = normalizeAmount(input.grossEstimatedTotal);
  if (
    input.patientBurdenRate === null ||
    input.patientBurdenRate === undefined
  ) {
    return {
      estimateStatus: 'needs_review',
      estimatedTotal: gross,
      pricingSnapshotStatus: 'needs_review',
      lines: [
        createLine({
          amountRole: 'gross_estimated_total',
          lineType: 'insurance_gross',
          label: '保険 療養費見込み 要確認',
          amount: gross,
          sortOrder: 10,
        }),
      ],
      warnings: [
        {
          warningCode: 'PATIENT_COVERAGE_REVIEW_REQUIRED',
          severity: 'needs_review',
          message: '患者負担割合の確認が必要です。',
        },
      ],
    };
  }

  const patientCopay = roundYen((gross * input.patientBurdenRate) / 100);
  const insurerReceivable = Math.max(0, gross - patientCopay);

  return {
    estimateStatus: 'calculated',
    estimatedTotal: gross,
    pricingSnapshotStatus: 'confirmed',
    lines: [
      createLine({
        amountRole: 'gross_estimated_total',
        lineType: 'insurance_gross',
        label: '保険 療養費見込み',
        amount: gross,
        sortOrder: 10,
      }),
      createLine({
        amountRole: 'patient_copay_estimated',
        lineType: 'patient_copay',
        label: '患者負担見込み',
        amount: patientCopay,
        sortOrder: 20,
      }),
      createLine({
        amountRole: 'insurer_receivable_estimated',
        lineType: 'insurer_receivable',
        label: '保険者請求見込み',
        amount: insurerReceivable,
        sortOrder: 30,
      }),
    ],
    warnings: [],
  };
}
