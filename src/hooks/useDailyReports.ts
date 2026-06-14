/**
 * 日報管理フック
 * DOD-09: API経由でdaily_reportsテーブルにアクセス（直接Supabaseアクセス排除）
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUserProfileContext } from '@/providers/user-profile-context';

// 型定義
interface DailyReport {
  id?: number;
  staff_id: number;
  date: string;
  treatment_count: number;
  revenue: number;
  notes?: string;
}

interface DailyReportApiResponse {
  id: number;
  reportDate: string;
  staffName: string;
  totalPatients: number;
  newPatients: number;
  totalRevenue: number;
  insuranceRevenue: number;
  privateRevenue: number;
  reportText?: string;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function createEmptyDailyReport(): DailyReport {
  return {
    staff_id: 0,
    date: new Date().toISOString().slice(0, 10),
    treatment_count: 0,
    revenue: 0,
  };
}

const useDailyReports = () => {
  const { profile } = useUserProfileContext();
  const clinicId = profile?.clinicId ?? null;

  const [reports, setReports] = useState<DailyReport[]>([]);
  const reportsRef = useRef<DailyReport[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<DailyReport>(
    createEmptyDailyReport
  );
  const [tempSave, setTempSave] = useState<DailyReport | null>(null);
  const [queue, setQueue] = useState<DailyReport[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const updateReports = useCallback(
    (updater: (currentReports: DailyReport[]) => DailyReport[]) => {
      setReports(currentReports => {
        const nextReports = updater(currentReports);
        reportsRef.current = nextReports;
        return nextReports;
      });
    },
    []
  );

  // フォーム状態の更新
  const updateFormState = useCallback((newState: Partial<DailyReport>) => {
    setFormState(prev => ({ ...prev, ...newState }));
  }, []);

  // バリデーション
  const validateForm = useCallback((): boolean => {
    if (
      !formState.staff_id ||
      !formState.date ||
      formState.treatment_count === undefined ||
      formState.revenue === undefined
    ) {
      setError('すべてのフィールドを入力してください。');
      return false;
    }
    setError(null);
    return true;
  }, [formState]);

  // APIレスポンスをローカル型に変換
  const mapApiToLocal = useCallback(
    (apiReport: DailyReportApiResponse): DailyReport => {
      return {
        id: apiReport.id,
        staff_id: 0, // APIからはスタッフ名のみ取得できるため
        date: apiReport.reportDate,
        treatment_count: apiReport.totalPatients,
        revenue: apiReport.totalRevenue,
        notes: apiReport.reportText,
      };
    },
    []
  );

  // データ取得（API経由）
  const fetchReports = useCallback(async () => {
    if (!clinicId) {
      updateReports(() => []);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/daily-reports?clinic_id=${clinicId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '日報の取得に失敗しました');
      }

      const result: ApiResponse<{ reports: DailyReportApiResponse[] }> =
        await response.json();

      if (result.success && result.data?.reports) {
        updateReports(() => result.data.reports.map(mapApiToLocal));
      } else {
        updateReports(() => []);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '日報の取得に失敗しました';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [clinicId, mapApiToLocal, updateReports]);

  // データ作成（API経由）
  const createReport = useCallback(
    async (report: DailyReport) => {
      if (!clinicId) {
        setError('クリニックIDが設定されていません');
        return;
      }

      try {
        setError(null);
        const response = await fetch('/api/daily-reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            clinic_id: clinicId,
            staff_id: report.staff_id || null,
            report_date: report.date,
            total_patients: report.treatment_count,
            new_patients: 0,
            total_revenue: report.revenue,
            insurance_revenue: 0,
            private_revenue: report.revenue,
            report_text: report.notes || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || '日報の作成に失敗しました');
        }

        const result: ApiResponse<DailyReportApiResponse> =
          await response.json();

        if (result.success && result.data) {
          const newReport = mapApiToLocal(result.data);
          updateReports(prev => [...prev, newReport]);
          setFormState(createEmptyDailyReport());
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : '日報の作成に失敗しました';
        setError(message);
      }
    },
    [clinicId, mapApiToLocal, updateReports]
  );

  // データ更新（API経由）
  const updateReport = useCallback(
    async (id: number, updates: Partial<DailyReport>) => {
      if (!clinicId) {
        setError('クリニックIDが設定されていません');
        return;
      }

      try {
        setError(null);
        const currentReport = reportsRef.current.find(r => r.id === id);
        if (!currentReport) {
          throw new Error('更新対象のレポートが見つかりません');
        }

        const response = await fetch('/api/daily-reports', {
          method: 'POST', // upsertを使用するためPOST
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            clinic_id: clinicId,
            staff_id: updates.staff_id ?? currentReport.staff_id ?? null,
            report_date: updates.date ?? currentReport.date,
            total_patients:
              updates.treatment_count ?? currentReport.treatment_count,
            new_patients: 0,
            total_revenue: updates.revenue ?? currentReport.revenue,
            insurance_revenue: 0,
            private_revenue: updates.revenue ?? currentReport.revenue,
            report_text: updates.notes ?? currentReport.notes ?? null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || '日報の更新に失敗しました');
        }

        const result: ApiResponse<DailyReportApiResponse> =
          await response.json();

        if (result.success && result.data) {
          const updatedReport = mapApiToLocal(result.data);
          updateReports(prev =>
            prev.map(report =>
              report.id === id ? { ...report, ...updatedReport } : report
            )
          );
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : '日報の更新に失敗しました';
        setError(message);
      }
    },
    [clinicId, mapApiToLocal, updateReports]
  );

  // データ削除（API経由）
  const deleteReport = useCallback(
    async (id: number) => {
      try {
        setError(null);
        const response = await fetch(`/api/daily-reports?id=${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || '日報の削除に失敗しました');
        }

        updateReports(prev => prev.filter(report => report.id !== id));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : '日報の削除に失敗しました';
        setError(message);
      }
    },
    [updateReports]
  );

  // フォーム送信
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) {
        return;
      }

      if (validateForm()) {
        setSubmitting(true);
        if (isOnline) {
          try {
            await createReport(formState);
          } finally {
            setSubmitting(false);
          }
        } else {
          setQueue(prev => [...prev, formState]);
          setSubmitting(false);
        }
      }
    },
    [validateForm, submitting, isOnline, createReport, formState]
  );

  // 一時保存
  const handleTempSave = useCallback(() => {
    setTempSave(formState);
  }, [formState]);

  // 施術者別集計
  const getStaffReport = useCallback(
    (staffId: number) => {
      return reports.filter(report => report.staff_id === staffId);
    },
    [reports]
  );

  // オフライン時のキュー処理
  useEffect(() => {
    const processQueue = async () => {
      if (isOnline && queue.length > 0) {
        try {
          await Promise.all(queue.map(report => createReport(report)));
          setQueue([]);
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'キューの処理に失敗しました';
          setError(message);
        }
      }
    };

    processQueue();
  }, [isOnline, queue, createReport]);

  // オンライン状態の監視
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 初期データロード
  useEffect(() => {
    if (clinicId) {
      fetchReports();
    }
  }, [clinicId, fetchReports]);

  return {
    reports,
    loading,
    submitting,
    error,
    formState,
    updateFormState,
    handleSubmit,
    handleTempSave,
    tempSave,
    getStaffReport,
    deleteReport,
    updateReport,
    isOnline,
    fetchReports,
  };
};

export default useDailyReports;
