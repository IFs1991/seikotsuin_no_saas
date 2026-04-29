import { useState, useEffect } from 'react';
import { PatientAnalysisData } from '@/types/api';
import {
  api,
  isSuccessResponse,
  isErrorResponse,
  handleApiError,
} from '@/lib/api-client';

const DEFAULT_ANALYSIS_ERROR = '患者データの取得に失敗しました';

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
  visit: Array<{ label: string; value: number }>;
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
  reservations: unknown[];
  satisfactionCorrelation: Record<string, unknown>;
  followUpList: FollowUpItem[];
}

interface UsePatientAnalysisResult {
  data: PatientAnalysisViewModel | null;
  loading: boolean;
  error: string | null;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toRiskLevel(
  category: PatientAnalysisData['riskScores'][number]['category']
) {
  if (category === 'high' || category === 'medium') return category;
  return 'low';
}

function mapSegmentItems(
  items: Array<{ label: string; value: number }> | undefined
) {
  return (items ?? []).map(item => ({
    label: item.label,
    value: toNumber(item.value),
  }));
}

export function mapPatientAnalysisData(
  data: PatientAnalysisData
): PatientAnalysisViewModel {
  const stagesBase = data.conversionData.stages?.[0]?.value || 0;

  return {
    conversionData: {
      stages: (data.conversionData.stages ?? []).map(stage => ({
        name: stage.name,
        value: stage.value,
        percentage:
          stagesBase > 0 ? Math.round((stage.value / stagesBase) * 100) : 0,
      })),
    },
    visitCounts: {
      average: toNumber(data.visitCounts?.average),
      monthlyChange: toNumber(data.visitCounts?.monthlyChange),
    },
    riskScores: (data.riskScores ?? []).map((risk, index) => ({
      id: index + 1,
      name: risk.name,
      lastVisit: risk.lastVisit || '-',
      riskLevel: toRiskLevel(risk.category),
      score: toNumber(risk.riskScore),
    })),
    ltvRanking: (data.ltvRanking ?? []).map(item => ({
      name: item.name,
      ltv: toNumber(item.ltv),
    })),
    segmentData: {
      visit: mapSegmentItems(data.segmentData?.visit),
      age: mapSegmentItems(data.segmentData?.age),
      symptom: mapSegmentItems(data.segmentData?.symptom),
      area: [],
    },
    reservations: [],
    satisfactionCorrelation: {},
    followUpList: (data.followUpList ?? []).map((followUp, index) => ({
      id: index + 1,
      name: followUp.name,
      reason: followUp.reason,
    })),
  };
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
          if (!cancelled) {
            setData(mapPatientAnalysisData(res.data as PatientAnalysisData));
          }
        } else if (isErrorResponse(res)) {
          const message = handleApiError(res.error);
          if (!cancelled) {
            setError(message || DEFAULT_ANALYSIS_ERROR);
            setData(null);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('usePatientAnalysis fetch error:', e);
          setError(DEFAULT_ANALYSIS_ERROR);
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
