import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../api/database/supabase-client'; // Supabaseクライアントのインポート

// データベーススキーマに基づいた型定義 (src/types/index.ts にあるべきだが、ここでは仮定義)
interface Clinic {
  id: string;
  name: string;
  // 必要に応じて他の店舗情報を追加
}

interface DailyReport {
  id: string;
  clinic_id: string;
  revenue: number;
  patient_count: number;
  report_date: string; // ISO 8601形式の日付文字列
  // 必要に応じて他の日報情報を追加
}

interface StaffPerformance {
  id: string;
  staff_id: string;
  clinic_id: string;
  performance_score: number;
  // 必要に応じて他のスタッフパフォーマンス情報を追加
}

// 集計された店舗データ
interface AggregatedClinicData extends Clinic {
  totalRevenue: number;
  totalPatientCount: number;
  averagePerformanceScore: number;
  // 他のKPIを追加
}

// ダッシュボード全体で表示するKPI
interface OverallKpis {
  totalGroupRevenue: number;
  totalGroupPatientCount: number;
  averageGroupPerformance: number;
  // 他の全体KPIを追加
}

// useAdminDashboardフックの戻り値の型
interface AdminDashboardHookReturn {
  clinicsData: AggregatedClinicData[];
  overallKpis: OverallKpis | null;
  loading: boolean;
  error: string | null;
  setSort: (sortBy: string, order: 'asc' | 'desc') => void;
  setClinicFilter: (clinicId: string | null) => void;
  refreshData: () => void;
}

const useAdminDashboard = (): AdminDashboardHookReturn => {
  const [clinicsData, setClinicsData] = useState<AggregatedClinicData[]>([]);
  const [overallKpis, setOverallKpis] = useState<OverallKpis | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ sortBy?: string; order?: 'asc' | 'desc'; clinicId?: string | null }>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. 店舗情報の取得
      const { data: clinics, error: clinicsError } = await supabase
        .from('clinics')
        .select('id, name');

      if (clinicsError) throw clinicsError;

      // 2. 日報データの取得 (全店舗の売上・患者数集計用)
      const { data: dailyReports, error: reportsError } = await supabase
        .from('daily_reports')
        .select('clinic_id, revenue, patient_count');

      if (reportsError) throw reportsError;

      // 3. スタッフパフォーマンスデータの取得
      const { data: staffPerformance, error: staffPerfError } = await supabase
        .from('staff_performance')
        .select('clinic_id, performance_score');

      if (staffPerfError) throw staffPerfError;

      // 4. 店舗ごとのデータ集計
      const aggregatedMap = new Map<string, AggregatedClinicData>();
      clinics.forEach(clinic => {
        aggregatedMap.set(clinic.id, {
          ...clinic,
          totalRevenue: 0,
          totalPatientCount: 0,
          averagePerformanceScore: 0, // 初期値
        });
      });

      dailyReports.forEach(report => {
        const clinicAgg = aggregatedMap.get(report.clinic_id);
        if (clinicAgg) {
          clinicAgg.totalRevenue += report.revenue;
          clinicAgg.totalPatientCount += report.patient_count;
        }
      });

      // スタッフパフォーマンスの集計
      const clinicStaffCounts = new Map<string, number>();
      const clinicPerformanceSums = new Map<string, number>();

      staffPerformance.forEach(perf => {
        const clinicAgg = aggregatedMap.get(perf.clinic_id);
        if (clinicAgg) {
          clinicStaffCounts.set(perf.clinic_id, (clinicStaffCounts.get(perf.clinic_id) || 0) + 1);
          clinicPerformanceSums.set(perf.clinic_id, (clinicPerformanceSums.get(perf.clinic_id) || 0) + perf.performance_score);
        }
      });

      aggregatedMap.forEach((clinicAgg, clinicId) => {
        const count = clinicStaffCounts.get(clinicId) || 0;
        const sum = clinicPerformanceSums.get(clinicId) || 0;
        if (count > 0) {
          clinicAgg.averagePerformanceScore = sum / count;
        }
      });

      let currentAggregatedClinics = Array.from(aggregatedMap.values());

      // 5. フィルタリングとソート
      if (filter.clinicId) {
        currentAggregatedClinics = currentAggregatedClinics.filter(c => c.id === filter.clinicId);
      }

      if (filter.sortBy) {
        currentAggregatedClinics.sort((a, b) => {
          const valA = (a as any)[filter.sortBy!];
          const valB = (b as any)[filter.sortBy!];
          if (typeof valA === 'number' && typeof valB === 'number') {
            return filter.order === 'asc' ? valA - valB : valB - valA;
          }
          if (typeof valA === 'string' && typeof valB === 'string') {
            return filter.order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
          }
          return 0;
        });
      }

      // 6. 全体KPIの計算
      const calculatedOverallKpis: OverallKpis = {
        totalGroupRevenue: currentAggregatedClinics.reduce((sum, c) => sum + c.totalRevenue, 0),
        totalGroupPatientCount: currentAggregatedClinics.reduce((sum, c) => sum + c.totalPatientCount, 0),
        averageGroupPerformance: currentAggregatedClinics.length > 0
          ? currentAggregatedClinics.reduce((sum, c) => sum + c.averagePerformanceScore, 0) / currentAggregatedClinics.length
          : 0,
      };

      setClinicsData(currentAggregatedClinics);
      setOverallKpis(calculatedOverallKpis);

    } catch (err: any) {
      console.error("Adminダッシュボードデータの取得に失敗しました:", err);
      setError(err.message || 'データの取得中に不明なエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }, [filter]); // filterが変更されたらデータを再取得

  useEffect(() => {
    fetchData();

    // リアルタイム更新の購読
    // clinics, daily_reports, staff_performance テーブルの変更を監視
    const clinicsChannel = supabase
      .channel('admin_dashboard_clinics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clinics' }, payload => {
        console.log('Clinics change received:', payload);
        fetchData(); // 変更があったらデータを再取得
      })
      .subscribe();

    const dailyReportsChannel = supabase
      .channel('admin_dashboard_daily_reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports' }, payload => {
        console.log('Daily reports change received:', payload);
        fetchData(); // 変更があったらデータを再取得
      })
      .subscribe();

    const staffPerformanceChannel = supabase
      .channel('admin_dashboard_staff_performance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_performance' }, payload => {
        console.log('Staff performance change received:', payload);
        fetchData(); // 変更があったらデータを再取得
      })
      .subscribe();

    return () => {
      supabase.removeChannel(clinicsChannel);
      supabase.removeChannel(dailyReportsChannel);
      supabase.removeChannel(staffPerformanceChannel);
    };
  }, [fetchData]); // fetchDataが変更されたら購読を再設定

  // ソート設定関数
  const setSort = useCallback((sortBy: string, order: 'asc' | 'desc') => {
    setFilter(prev => ({ ...prev, sortBy, order }));
  }, []);

  // 店舗フィルタリング設定関数
  const setClinicFilter = useCallback((clinicId: string | null) => {
    setFilter(prev => ({ ...prev, clinicId }));
  }, []);

  // データの手動更新トリガー
  const refreshData = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    clinicsData,
    overallKpis,
    loading,
    error,
    setSort,
    setClinicFilter,
    refreshData,
  };
};

export default useAdminDashboard;