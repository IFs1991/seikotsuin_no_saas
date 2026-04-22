import { z } from 'zod';
import type { ClinicKPI } from '@/lib/services/analytics-read-service';

const OptionalUuidSchema = z.string().trim().uuid();

export const AdminChatPostSchema = z.object({
  message: z.string().trim().min(1, 'message is required'),
  clinic_id: OptionalUuidSchema.nullable().optional(),
  session_id: OptionalUuidSchema.nullable().optional(),
  period_days: z.number().int().min(1).max(365).optional(),
});

export type AdminChatPostInput = z.infer<typeof AdminChatPostSchema>;

export type AdminChatAnalysisType =
  | 'revenue'
  | 'patients'
  | 'staff'
  | 'advice'
  | 'general';

export interface AdminChatContextData {
  mode: 'clinic' | 'multi_clinic';
  clinic_id: string | null;
  scoped_clinic_ids: string[];
  period_days: number;
}

export interface AdminChatResponseData {
  analysis_type: AdminChatAnalysisType;
  clinic_id: string | null;
  scoped_clinic_ids: string[];
  period_days: number;
  kpi?: {
    revenue: number;
    patients: number;
    staff_performance_score: number | null;
  };
}

export interface AdminChatAIResponse {
  message: string;
  data: AdminChatResponseData;
}

const DEFAULT_PERIOD_DAYS = 30;

export function normalizeAdminChatInput(input: AdminChatPostInput): Required<
  Pick<AdminChatPostInput, 'message' | 'period_days'>
> & {
  clinic_id: string | null;
  session_id: string | null;
} {
  return {
    message: input.message.trim(),
    clinic_id: input.clinic_id?.trim() || null,
    session_id: input.session_id?.trim() || null,
    period_days: input.period_days ?? DEFAULT_PERIOD_DAYS,
  };
}

export function buildAdminChatContextData(params: {
  clinicId: string | null;
  scopedClinicIds: string[];
  periodDays: number;
}): AdminChatContextData {
  const targetClinicIds = params.clinicId
    ? [params.clinicId]
    : params.scopedClinicIds;

  return {
    mode: params.clinicId ? 'clinic' : 'multi_clinic',
    clinic_id: params.clinicId,
    scoped_clinic_ids: targetClinicIds,
    period_days: params.periodDays,
  };
}

export function detectAdminChatAnalysisType(
  message: string
): AdminChatAnalysisType {
  const normalized = message.toLowerCase();

  if (normalized.includes('売上') || normalized.includes('収益')) {
    return 'revenue';
  }

  if (normalized.includes('患者') || normalized.includes('来院')) {
    return 'patients';
  }

  if (normalized.includes('スタッフ') || normalized.includes('施術者')) {
    return 'staff';
  }

  if (
    normalized.includes('改善') ||
    normalized.includes('アドバイス') ||
    normalized.includes('提案')
  ) {
    return 'advice';
  }

  return 'general';
}

export function summarizeKpi(kpiMap?: Map<string, ClinicKPI>): ClinicKPI {
  const initial: ClinicKPI = {
    revenue: 0,
    patients: 0,
    staff_performance_score: null,
  };

  if (!kpiMap || kpiMap.size === 0) {
    return initial;
  }

  let scoreTotal = 0;
  let scoreCount = 0;

  kpiMap.forEach(kpi => {
    initial.revenue += kpi.revenue;
    initial.patients += kpi.patients;
    if (kpi.staff_performance_score !== null) {
      scoreTotal += kpi.staff_performance_score;
      scoreCount += 1;
    }
  });

  return {
    ...initial,
    staff_performance_score:
      scoreCount > 0 ? Math.round((scoreTotal / scoreCount) * 10) / 10 : null,
  };
}

export function generateAdminChatFallbackResponse(params: {
  message: string;
  contextData: AdminChatContextData;
  kpiMap?: Map<string, ClinicKPI>;
}): AdminChatAIResponse {
  const analysisType = detectAdminChatAnalysisType(params.message);
  const kpi = summarizeKpi(params.kpiMap);
  const scopeLabel =
    params.contextData.mode === 'clinic'
      ? '指定店舗'
      : `${params.contextData.scoped_clinic_ids.length}店舗横断`;

  const data: AdminChatResponseData = {
    analysis_type: analysisType,
    clinic_id: params.contextData.clinic_id,
    scoped_clinic_ids: params.contextData.scoped_clinic_ids,
    period_days: params.contextData.period_days,
    kpi,
  };

  if (analysisType === 'revenue') {
    return {
      message: `${scopeLabel}の売上分析です。参照可能な集計では売上合計は${kpi.revenue.toLocaleString()}円です。期間や店舗を絞ると、より具体的に確認できます。`,
      data,
    };
  }

  if (analysisType === 'patients') {
    return {
      message: `${scopeLabel}の患者動向です。参照可能な集計では患者数は${kpi.patients.toLocaleString()}名です。新患、再来、離脱傾向の観点で追加確認できます。`,
      data,
    };
  }

  if (analysisType === 'staff') {
    const score =
      kpi.staff_performance_score === null
        ? '未集計'
        : kpi.staff_performance_score.toFixed(1);
    return {
      message: `${scopeLabel}のスタッフ分析です。参照可能なスタッフ指標は${score}です。売上貢献、来院対応、稼働状況を分けて確認できます。`,
      data,
    };
  }

  if (analysisType === 'advice') {
    return {
      message: `${scopeLabel}の改善観点です。売上、患者数、スタッフ稼働の差分を確認し、伸びている店舗の運用を横展開する方針が有効です。`,
      data,
    };
  }

  return {
    message:
      'admin分析チャットです。売上、患者、スタッフ、改善のいずれかを含めて質問すると、スコープ内データに基づく決定的な分析種別で回答します。',
    data,
  };
}
