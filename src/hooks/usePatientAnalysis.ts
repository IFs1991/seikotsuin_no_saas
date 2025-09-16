import { useState, useEffect } from 'react';
import { PatientAnalysisData } from '@/types/api';
import { api, isSuccessResponse } from '@/lib/api-client';

interface ConversionData {
  stages: Array<{
    name: string;
    value: number;
    percentage: number;
  }>;
}

interface VisitCounts {
  average: number;
  monthlyChange: number;
}

interface RiskScore {
  id: number;
  name: string;
  lastVisit: string;
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
}

interface LtvRanking {
  name: string;
  ltv: number;
}

interface SegmentData {
  age: Array<{ label: string; value: number }>;
  symptom: Array<{ label: string; value: number }>;
  area: Array<{ label: string; value: number }>;
}

interface FollowUpItem {
  id: number;
  name: string;
  reason: string;
}

interface UsePatientAnalysisReturn {
  conversionData: ConversionData;
  visitCounts: VisitCounts;
  riskScores: RiskScore[];
  ltvRanking: LtvRanking[];
  segmentData: SegmentData;
  reservations: any[];
  satisfactionCorrelation: any;
  followUpList: FollowUpItem[];
}

const DEFAULT_CLINIC_ID = process.env.NEXT_PUBLIC_DEFAULT_CLINIC_ID || 'default-clinic-id';

export const usePatientAnalysis = (clinicId: string = DEFAULT_CLINIC_ID): UsePatientAnalysisReturn => {
  const [data, setData] = useState<UsePatientAnalysisReturn>({
    conversionData: {
      stages: [
        { name: '新患', value: 100, percentage: 100 },
        { name: '2回目来院', value: 80, percentage: 80 },
        { name: '継続治療', value: 60, percentage: 60 },
        { name: 'リピーター', value: 40, percentage: 40 }
      ]
    },
    visitCounts: {
      average: 5.2,
      monthlyChange: 12
    },
    riskScores: [
      {
        id: 1,
        name: '田中太郎',
        lastVisit: '2024-08-01',
        riskLevel: 'high',
        score: 85
      },
      {
        id: 2,
        name: '山田花子',
        lastVisit: '2024-08-05',
        riskLevel: 'medium',
        score: 65
      }
    ],
    ltvRanking: [
      { name: '佐藤次郎', ltv: 150000 },
      { name: '鈴木三郎', ltv: 120000 },
      { name: '高橋四郎', ltv: 95000 }
    ],
    segmentData: {
      age: [
        { label: '20-30代', value: 35 },
        { label: '31-50代', value: 45 },
        { label: '51歳以上', value: 20 }
      ],
      symptom: [
        { label: '腰痛', value: 40 },
        { label: '肩こり', value: 30 },
        { label: 'その他', value: 30 }
      ],
      area: [
        { label: '地域A', value: 50 },
        { label: '地域B', value: 30 },
        { label: '地域C', value: 20 }
      ]
    },
    reservations: [],
    satisfactionCorrelation: {},
    followUpList: [
      {
        id: 1,
        name: '田中太郎',
        reason: '最終来院から2週間経過'
      },
      {
        id: 2,
        name: '山田花子',
        reason: '治療完了後のフォローアップ'
      }
    ]
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.patients.getAnalysis(clinicId);
        if (isSuccessResponse(res)) {
          const d = res.data as PatientAnalysisData;

          // 転換率ステージ（%は先頭段階を100%として相対算出）
          const stagesBase = d.conversionData.stages?.[0]?.value || 0;
          const stages = (d.conversionData.stages || []).map((s) => ({
            name: s.name,
            value: s.value,
            percentage: stagesBase > 0 ? Math.round((s.value / stagesBase) * 100) : 0,
          }));

          // リスクスコア整形
          const riskScores: RiskScore[] = (d.riskScores || []).map((r, idx) => ({
            id: idx + 1,
            name: r.name,
            lastVisit: r.lastVisit || '-',
            riskLevel: (r.category as any) === 'high' ? 'high' : (r.category as any) === 'medium' ? 'medium' : 'low',
            score: Number((r as any).riskScore || (r as any).score || 0),
          }));

          // LTVランキング
          const ltvRanking: LtvRanking[] = (d.ltvRanking || []).map((x) => ({
            name: x.name,
            ltv: Number(x.ltv || 0),
          }));

          // セグメント
          const segmentData: SegmentData = {
            age: (d.segmentData?.age || []).map((x) => ({ label: x.label, value: Number(x.value || 0) })),
            symptom: (d.segmentData?.symptom || []).map((x) => ({ label: x.label, value: Number(x.value || 0) })),
            area: [],
          };

          // フォローアップ
          const followUpList: FollowUpItem[] = (d.followUpList || []).map((f, i) => ({
            id: i + 1,
            name: f.name,
            reason: f.reason,
          }));

          setData({
            conversionData: { stages },
            visitCounts: {
              average: Number(d.visitCounts?.average || 0),
              monthlyChange: Number(d.visitCounts?.monthlyChange || 0),
            },
            riskScores,
            ltvRanking,
            segmentData,
            reservations: [],
            satisfactionCorrelation: {},
            followUpList,
          });
        }
      } catch (e) {
        // フォールバック: 既定のサンプルを保持
        console.warn('usePatientAnalysis fallback to sample:', e);
      }
    };
    fetchData();
  }, [clinicId]);

  return data;
};
