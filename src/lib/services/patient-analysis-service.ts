import { SupabaseClient } from '@supabase/supabase-js';
import { PatientAnalysisData, PatientRiskScore } from '@/types/api';

interface PatientVisitSummaryRow {
  patient_id: string;
  patient_name: string;
  visit_count: number;
  total_revenue: number;
  last_visit_date: string | null;
  visit_category: string | null;
}

/**
 * 患者分析データを生成する共有ヘルパー関数
 *
 * /api/patients と /api/customers/analysis の両方で使用され、
 * 同一のペイロードを保証します。
 *
 * @param supabase - Supabaseクライアント
 * @param clinicId - クリニックID
 * @returns 患者分析データ
 */
export async function generatePatientAnalysis(
  supabase: SupabaseClient,
  clinicId: string
): Promise<PatientAnalysisData> {
  // patient_visit_summary ビューからデータ取得
  const { data: patients, error: patientsError } = await supabase
    .from('patient_visit_summary')
    .select('*')
    .eq('clinic_id', clinicId);

  if (patientsError) {
    throw patientsError;
  }

  const typedPatients = (patients as PatientVisitSummaryRow[]) ?? [];

  // 転換率分析
  const conversionAnalysis = () => {
    const newPatients = typedPatients.filter(p => p.visit_count === 1);
    const returnPatients = typedPatients.filter(p => p.visit_count > 1);
    const total = newPatients.length + returnPatients.length;
    const conversionRate =
      total > 0
        ? Math.round((returnPatients.length / total) * 100 * 100) / 100
        : 0;

    return {
      newPatients: newPatients.length,
      returnPatients: returnPatients.length,
      conversionRate,
      stages: [
        { name: '初回来院', value: total },
        { name: '2回目来院', value: returnPatients.length },
        {
          name: '継続通院',
          value: typedPatients.filter(p => p.visit_count >= 5).length,
        },
      ],
    };
  };

  // LTVランキング
  const ltvRanking = await Promise.all(
    typedPatients.slice(0, 20).map(async patient => {
      const { data: ltv } = await supabase.rpc('calculate_patient_ltv', {
        patient_uuid: patient.patient_id,
      });

      return {
        patient_id: patient.patient_id,
        name: patient.patient_name,
        ltv: ltv || 0,
        visit_count: patient.visit_count,
        total_revenue: patient.total_revenue,
      };
    })
  );

  // リスクスコア
  const riskScores = await Promise.all(
    typedPatients.map(async patient => {
      const { data: riskScore } = await supabase.rpc(
        'calculate_churn_risk_score',
        { patient_uuid: patient.patient_id }
      );

      const score = Number(riskScore) || 0;
      return {
        patient_id: patient.patient_id,
        name: patient.patient_name,
        riskScore: score,
        lastVisit: patient.last_visit_date,
        category: score > 75 ? 'high' : score > 50 ? 'medium' : 'low',
      } satisfies PatientRiskScore;
    })
  );

  // セグメント分析
  const segmentAnalysis = () => {
    const total = typedPatients.length;
    if (total === 0) return {};

    const visitSegments = {
      初診のみ: typedPatients.filter(p => p.visit_category === '初診のみ')
        .length,
      軽度リピート: typedPatients.filter(
        p => p.visit_category === '軽度リピート'
      ).length,
      中度リピート: typedPatients.filter(
        p => p.visit_category === '中度リピート'
      ).length,
      高度リピート: typedPatients.filter(
        p => p.visit_category === '高度リピート'
      ).length,
    };

    return {
      visit: Object.entries(visitSegments).map(([label, value]) => ({
        label,
        value,
      })),
    };
  };

  // フォローアップリスト
  const followUpList = riskScores
    .filter(patient => patient.riskScore > 60)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10)
    .map(patient => ({
      patient_id: patient.patient_id,
      name: patient.name,
      reason: `${patient.riskScore}%の離脱リスク`,
      lastVisit: patient.lastVisit,
      action: '電話フォロー推奨',
    }));

  // 訪問回数
  const visitCounts = {
    average:
      typedPatients.length > 0
        ? Math.round(
            (typedPatients.reduce((sum, p) => sum + p.visit_count, 0) /
              typedPatients.length) *
              100
          ) / 100
        : 0,
    monthlyChange: 5.2,
  };

  // 分析データを組み立てて返す
  return {
    conversionData: conversionAnalysis(),
    visitCounts,
    riskScores: riskScores
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 20),
    ltvRanking: ltvRanking.sort((a, b) => b.ltv - a.ltv),
    segmentData: segmentAnalysis(),
    followUpList,
    totalPatients: typedPatients.length,
    activePatients: typedPatients.filter(p => p.visit_count > 1).length,
  };
}
