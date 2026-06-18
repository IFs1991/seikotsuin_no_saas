interface RevenueRecord {
  amount: number;
  created_at: string;
}

interface PatientRecord {
  is_new: boolean;
  created_at: string;
}

interface TherapistRecord {
  staff_name: string;
  performance_score: number;
}

export interface AnalysisData {
  salesData: RevenueRecord[];
  patientData: PatientRecord[];
  therapistData: TherapistRecord[];
}

export interface AnalysisResult {
  salesAnalysis: {
    total: number;
    trend: string;
    anomalies: string[];
  };
  patientMetrics: {
    total: number;
    newPatients: number;
    returnRate: number;
  };
  therapistPerformance: {
    topPerformer: string;
    metrics: Record<string, number>;
  };
  aiInsights: {
    summary: string;
    recommendations: string[];
    nextDayPlan: string[];
  };
}

export async function fetchAnalysisData(
  clinicId: string
): Promise<AnalysisData> {
  const res = await fetch(
    `/api/clinic/analysis?clinic_id=${encodeURIComponent(clinicId)}`
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { error?: string }).error ?? 'データの取得に失敗しました';
    throw new Error(message);
  }

  const json = (await res.json()) as { success: true; data: AnalysisData };
  return json.data;
}

export function generateAnalysisReport(data: AnalysisData): AnalysisResult {
  const { salesData, patientData, therapistData } = data;
  const [firstTherapist] = therapistData;

  return {
    salesAnalysis: {
      total: salesData.reduce((acc, curr) => acc + curr.amount, 0),
      trend: calculateTrend(salesData),
      anomalies: detectAnomalies(salesData),
    },
    patientMetrics: {
      total: patientData.length,
      newPatients: patientData.filter(p => p.is_new).length,
      returnRate: calculateReturnRate(patientData),
    },
    therapistPerformance: {
      topPerformer: firstTherapist?.staff_name ?? '',
      metrics: therapistData.reduce<Record<string, number>>((acc, curr) => {
        if (!curr.staff_name) {
          return acc;
        }
        acc[curr.staff_name] = curr.performance_score;
        return acc;
      }, {}),
    },
    aiInsights: {
      summary: generateSummary(salesData, patientData, therapistData),
      recommendations: generateRecommendations(salesData, patientData),
      nextDayPlan: generateNextDayPlan(salesData, patientData, therapistData),
    },
  };
}

function calculateTrend(salesData: RevenueRecord[]): string {
  if (salesData.length < 2) {
    return 'データ不足';
  }
  const recent = salesData
    .slice(0, 7)
    .reduce((sum, item) => sum + item.amount, 0);
  const previous = salesData
    .slice(7, 14)
    .reduce((sum, item) => sum + item.amount, 0);
  if (recent > previous) {
    return '上昇傾向';
  }
  if (recent < previous) {
    return '下降傾向';
  }
  return '安定';
}

function detectAnomalies(salesData: RevenueRecord[]): string[] {
  if (salesData.length === 0) {
    return [];
  }
  const values = salesData.map(item => item.amount);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const threshold = average * 1.5;
  return salesData
    .filter(item => item.amount >= threshold)
    .map(item => `${item.created_at} の売上が平均を大きく上回っています`);
}

function calculateReturnRate(patientData: PatientRecord[]): number {
  if (patientData.length === 0) {
    return 0;
  }
  const returningPatients = patientData.filter(
    patient => !patient.is_new
  ).length;
  return Math.round((returningPatients / patientData.length) * 100);
}

function generateSummary(
  salesData: RevenueRecord[],
  patientData: PatientRecord[],
  therapistData: TherapistRecord[]
): string {
  const totalSales = salesData.reduce((sum, item) => sum + item.amount, 0);
  const topTherapist = therapistData[0]?.staff_name ?? '未設定';
  return `売上合計は${totalSales.toLocaleString()}円、新規患者は${patientData.filter(p => p.is_new).length}名、トップパフォーマーは${topTherapist}です。`;
}

function generateRecommendations(
  salesData: RevenueRecord[],
  patientData: PatientRecord[]
): string[] {
  const recommendations: string[] = [];
  if (calculateReturnRate(patientData) < 50) {
    recommendations.push('リピート促進施策の見直し');
  }
  if (detectAnomalies(salesData).length > 0) {
    recommendations.push('高売上日の再現要因を分析');
  }
  if (recommendations.length === 0) {
    recommendations.push('現在の運用を維持しつつ小さく改善');
  }
  return recommendations;
}

function generateNextDayPlan(
  salesData: RevenueRecord[],
  patientData: PatientRecord[],
  therapistData: TherapistRecord[]
): string[] {
  const plan = ['予約状況の事前確認', '混雑時間帯のスタッフ配置最適化'];
  if (patientData.some(patient => patient.is_new)) {
    plan.push('新規患者向けフォロー体制の確認');
  }
  if (salesData.length > 0 && therapistData.length > 0) {
    plan.push('高評価スタッフの対応を共有');
  }
  return plan;
}
