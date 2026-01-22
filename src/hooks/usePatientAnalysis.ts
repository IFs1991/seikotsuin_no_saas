import { useState, useEffect } from 'react';
import { PatientAnalysisData } from '@/types/api';
import {
  api,
  isSuccessResponse,
  isErrorResponse,
  handleApiError,
} from '@/lib/api-client';

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

export interface PatientAnalysisViewModel {
  conversionData: ConversionData;
  visitCounts: VisitCounts;
  riskScores: RiskScore[];
  ltvRanking: LtvRanking[];
  segmentData: SegmentData;
  reservations: any[];
  satisfactionCorrelation: any;
  followUpList: FollowUpItem[];
}

interface UsePatientAnalysisResult {
  data: PatientAnalysisViewModel | null;
  loading: boolean;
  error: string | null;
}

export const usePatientAnalysis = (
  clinicId?: string | null
): UsePatientAnalysisResult => {
  const [data, setData] = useState<PatientAnalysisViewModel | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(clinicId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!clinicId) {
      setData(null);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await api.customers.getAnalysis(clinicId);
        if (isSuccessResponse(res)) {
          const d = res.data as PatientAnalysisData;

          // 転換率ステージ（%は先頭段階を100%として相対算出）
          const stagesBase = d.conversionData.stages?.[0]?.value || 0;
          const stages = (d.conversionData.stages || []).map(s => ({
            name: s.name,
            value: s.value,
            percentage:
              stagesBase > 0 ? Math.round((s.value / stagesBase) * 100) : 0,
          }));

          // リスクスコア整形
          const riskScores: RiskScore[] = (d.riskScores || []).map(
            (r, idx) => ({
              id: idx + 1,
              name: r.name,
              lastVisit: r.lastVisit || '-',
              riskLevel:
                (r.category as any) === 'high'
                  ? 'high'
                  : (r.category as any) === 'medium'
                    ? 'medium'
                    : 'low',
              score: Number((r as any).riskScore || (r as any).score || 0),
            })
          );

          // LTVランキング
          const ltvRanking: LtvRanking[] = (d.ltvRanking || []).map(x => ({
            name: x.name,
            ltv: Number(x.ltv || 0),
          }));

          // セグメント
          const segmentData: SegmentData = {
            age: (d.segmentData?.age || []).map(x => ({
              label: x.label,
              value: Number(x.value || 0),
            })),
            symptom: (d.segmentData?.symptom || []).map(x => ({
              label: x.label,
              value: Number(x.value || 0),
            })),
            area: [],
          };

          // フォローアップ
          const followUpList: FollowUpItem[] = (d.followUpList || []).map(
            (f, i) => ({
              id: i + 1,
              name: f.name,
              reason: f.reason,
            })
          );

          if (!cancelled) {
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
        } else if (isErrorResponse(res)) {
          const message = handleApiError(res.error);
          if (!cancelled) {
            setError(message || '患者データの取得に失敗しました');
            setData(null);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('usePatientAnalysis fetch error:', e);
          setError('患者データの取得に失敗しました');
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  return { data, loading, error };
};
