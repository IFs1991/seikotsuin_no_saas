import type { EstimateStatus, RevenueContextCode } from '@/lib/revenue-context';

export const REVENUE_ESTIMATE_DISCLAIMER =
  '経営分析用の概算です。請求確定額ではありません。';

export type RevenueEstimateWarningSeverity =
  | 'info'
  | 'warning'
  | 'needs_review'
  | 'blocked';

export type RevenueEstimateInput = {
  revenueContextCode: RevenueContextCode;
  fee: number;
  visitStageCode: string | null;
};

export type RevenueEstimateLine = {
  lineType: string;
  label: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  sortOrder: number;
};

export type RevenueEstimateWarning = {
  warningCode: string;
  severity: RevenueEstimateWarningSeverity;
  message: string;
};

export type RevenueEstimateCalculation = {
  estimateStatus: EstimateStatus;
  estimatedTotal: number;
  lines: RevenueEstimateLine[];
  warnings: RevenueEstimateWarning[];
};

function createFeeLine(label: string, fee: number): RevenueEstimateLine {
  return {
    lineType: 'fee',
    label,
    quantity: 1,
    unitAmount: fee,
    totalAmount: fee,
    sortOrder: 10,
  };
}

export function calculateRevenueEstimate(
  input: RevenueEstimateInput
): RevenueEstimateCalculation {
  const fee = Math.max(0, input.fee);

  switch (input.revenueContextCode) {
    case 'private':
      return {
        estimateStatus: 'calculated',
        estimatedTotal: fee,
        lines: [createFeeLine('自費 売上見込み', fee)],
        warnings: [],
      };
    case 'product':
      return {
        estimateStatus: 'calculated',
        estimatedTotal: fee,
        lines: [createFeeLine('物販 売上見込み', fee)],
        warnings: [],
      };
    case 'ticket':
      return {
        estimateStatus: 'calculated',
        estimatedTotal: fee,
        lines: [createFeeLine('回数券 売上見込み', fee)],
        warnings: [],
      };
    case 'traffic_accident':
      return {
        estimateStatus: 'needs_review',
        estimatedTotal: fee,
        lines: [createFeeLine('交通事故 概算見込み', fee)],
        warnings: [
          {
            warningCode: 'TRAFFIC_ACCIDENT_REVIEW',
            severity: 'needs_review',
            message:
              '交通事故・自賠責関連の概算です。請求確定前に確認してください。',
          },
        ],
      };
    case 'workers_comp':
      return {
        estimateStatus: 'needs_review',
        estimatedTotal: fee,
        lines: [createFeeLine('労災 概算見込み', fee)],
        warnings: [
          {
            warningCode: 'WORKERS_COMP_REVIEW',
            severity: 'needs_review',
            message: '労災関連の概算です。請求確定前に確認してください。',
          },
        ],
      };
    case 'insurance': {
      const hasVisitStage = Boolean(input.visitStageCode);
      return {
        estimateStatus: hasVisitStage ? 'calculated' : 'needs_review',
        estimatedTotal: fee,
        lines: [
          createFeeLine(
            hasVisitStage ? '保険 療養費見込み' : '保険 療養費見込み 要確認',
            fee
          ),
        ],
        warnings: hasVisitStage
          ? []
          : [
              {
                warningCode: 'INSURANCE_VISIT_STAGE_REQUIRED',
                severity: 'needs_review',
                message:
                  '保険見込みは来院ステージを確認してから経営分析に利用してください。',
              },
            ],
      };
    }
    case 'mixed':
    case 'other':
      return {
        estimateStatus: 'needs_review',
        estimatedTotal: fee,
        lines: [createFeeLine('その他 概算見込み', fee)],
        warnings: [
          {
            warningCode: 'ESTIMATE_CONTEXT_REVIEW',
            severity: 'needs_review',
            message: '売上文脈を確認してから見込みを利用してください。',
          },
        ],
      };
  }
}
