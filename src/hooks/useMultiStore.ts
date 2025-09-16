"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';

// 依存ファイルからのモックインポート（実際のプロジェクトではパスを修正）
// import { supabase } from '../api/database/supabase-client';
// import { aiAnalysis } from '../api/gemini/ai-analysis';
// import { Clinic, BestPractice, KPI, MultiStoreFilters } from '../types';

// モックデータと型定義 (実際のプロジェクトでは上記のようにインポート)
interface Clinic {
  id: string;
  name: string;
  revenue: number;
  patients: number;
  staff_performance_score: number;
  region: string;
  // 他の関連フィールド
}

interface BestPractice {
  id: string;
  title: string;
  description: string;
  clinicId: string;
}

type KPI = 'revenue' | 'patients' | 'staff_performance_score';

interface MultiStoreFilters {
  region?: string;
  minRevenue?: number;
  maxPatients?: number;
}

// Supabaseクライアントのモック
const supabaseClient = {
  from: (tableName: string) => ({
    select: (columns: string) => ({
      // 実際のデータ取得ロジックをここに記述
      data: [
        { id: 'clinic1', name: '新宿院', revenue: 1000000, patients: 500, staff_performance_score: 85, region: '東京' },
        { id: 'clinic2', name: '渋谷院', revenue: 1200000, patients: 600, staff_performance_score: 90, region: '東京' },
        { id: 'clinic3', name: '大阪院', revenue: 900000, patients: 450, staff_performance_score: 80, region: '大阪' },
        { id: 'clinic4', name: '福岡院', revenue: 700000, patients: 350, staff_performance_score: 75, region: '福岡' },
        { id: 'clinic5', name: '池袋院', revenue: 1100000, patients: 550, staff_performance_score: 88, region: '東京' },
        { id: 'clinic6', name: '横浜院', revenue: 950000, patients: 480, staff_performance_score: 82, region: '神奈川' },
      ] as Clinic[],
      error: null,
    }),
  }),
};

// AI分析モジュールのモック
const aiAnalysis = {
  getBestPractices: async (data: Clinic[]): Promise<BestPractice[]> => {
    // 実際のAI分析ロジックをここに記述
    // 例: 売上が高いクリニックの情報を元にベストプラクティスを生成
    const topClinics = data.sort((a, b) => b.revenue - a.revenue).slice(0, 2);
    return topClinics.map(clinic => ({
      id: `bp-${clinic.id}`,
      title: `${clinic.name}の成功事例: 売上${clinic.revenue.toLocaleString()}円達成`,
      description: `${clinic.name}は、患者満足度向上施策と効果的なマーケティングにより、高い売上を達成しました。特に、丁寧なカウンセリングとリピート促進が鍵です。`,
      clinicId: clinic.id,
    }));
  },
};

const useMultiStore = () => {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MultiStoreFilters>({});
  const [bestPractices, setBestPractices] = useState<BestPractice[]>([]);

  // データ取得
  useEffect(() => {
    const fetchClinics = async () => {
      setLoading(true);
      setError(null);
      try {
        // Supabaseから店舗データを取得
        const { data, error } = supabaseClient.from('clinics').select('*');
        if (error) throw error;
        setClinics(data || []);

        // AI分析からベストプラクティスを取得
        const practices = await aiAnalysis.getBestPractices(data || []);
        setBestPractices(practices);

      } catch (err: any) {
        setError(err.message || 'データの取得に失敗しました。');
        console.error('Failed to fetch multi-store data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchClinics();
  }, []); // 初回マウント時にのみ実行

  // フィルタリング機能
  const filteredClinics = useMemo(() => {
    return clinics.filter(clinic => {
      if (filters.region && clinic.region !== filters.region) return false;
      if (filters.minRevenue && clinic.revenue < filters.minRevenue) return false;
      if (filters.maxPatients && clinic.patients > filters.maxPatients) return false;
      return true;
    });
  }, [clinics, filters]);

  // ランキング計算
  const getRankings = useCallback((kpi: KPI, ascending: boolean = false) => {
    return [...filteredClinics].sort((a, b) => {
      if (ascending) {
        return a[kpi] - b[kpi];
      }
      return b[kpi] - a[kpi];
    });
  }, [filteredClinics]);

  // 店舗間比較データ整形
  const getComparisonData = useCallback((kpi: KPI) => {
    return filteredClinics.map(clinic => ({
      name: clinic.name,
      value: clinic[kpi],
    }));
  }, [filteredClinics]);

  // グルーピング処理 (例: 地域別集計)
  const getGroupedData = useCallback((groupBy: 'region') => {
    const grouped: { [key: string]: { revenue: number; patients: number; count: number } } = {};
    filteredClinics.forEach(clinic => {
      if (!grouped[clinic[groupBy]]) {
        grouped[clinic[groupBy]] = { revenue: 0, patients: 0, count: 0 };
      }
      grouped[clinic[groupBy]].revenue += clinic.revenue;
      grouped[clinic[groupBy]].patients += clinic.patients;
      grouped[clinic[groupBy]].count++;
    });
    return Object.entries(grouped).map(([key, value]) => ({
      group: key,
      averageRevenue: value.revenue / value.count,
      averagePatients: value.patients / value.count,
      clinicCount: value.count,
    }));
  }, [filteredClinics]);

  // データ正規化 (例: 売上を患者数で正規化)
  const getNormalizedData = useCallback((kpi: KPI, normalizeBy: 'patients' | 'staff_performance_score') => {
    return filteredClinics.map(clinic => ({
      name: clinic.name,
      normalizedValue: clinic[kpi] / clinic[normalizeBy],
    }));
  }, [filteredClinics]);

  return {
    clinics,
    loading,
    error,
    filters,
    setFilters,
    filteredClinics,
    bestPractices,
    getRankings,
    getComparisonData,
    getGroupedData,
    getNormalizedData,
  };
};

export default useMultiStore;