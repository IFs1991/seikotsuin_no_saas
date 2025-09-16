import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabaseクライアントの初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 型定義 (types/index.ts に定義されているものを想定)
interface DailyReport {
  id?: number;
  staff_id: number;
  date: string;
  treatment_count: number;
  revenue: number;
  notes?: string;
}

const useDailyReports = () => {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<DailyReport>({
    staff_id: 0,
    date: new Date().toISOString().slice(0, 10),
    treatment_count: 0,
    revenue: 0,
  });
  const [tempSave, setTempSave] = useState<DailyReport | null>(null);
  const [queue, setQueue] = useState<DailyReport[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // フォーム状態の更新
  const updateFormState = (newState: Partial<DailyReport>) => {
    setFormState({ ...formState, ...newState });
  };

  // バリデーション
  const validateForm = (): boolean => {
    if (!formState.staff_id || !formState.date || !formState.treatment_count || !formState.revenue) {
      setError('すべてのフィールドを入力してください。');
      return false;
    }
    setError(null);
    return true;
  };

  // データ取得
  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        throw error;
      }

      setReports(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // データ作成
  const createReport = async (report: DailyReport) => {
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .insert([report])
        .single();

      if (error) {
        throw error;
      }

      setReports([...reports, data]);
      setFormState({
        staff_id: 0,
        date: new Date().toISOString().slice(0, 10),
        treatment_count: 0,
        revenue: 0,
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  // データ更新
  const updateReport = async (id: number, updates: Partial<DailyReport>) => {
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .update(updates)
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      setReports(reports.map(report => (report.id === id ? { ...report, ...data } : report)));
    } catch (err: any) {
      setError(err.message);
    }
  };

  // データ削除
  const deleteReport = async (id: number) => {
    try {
      const { error } = await supabase
        .from('daily_reports')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      setReports(reports.filter(report => report.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  // フォーム送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      if (isOnline) {
        await createReport(formState);
      } else {
        setQueue([...queue, formState]);
      }
    }
  };

  // 一時保存
  const handleTempSave = () => {
    setTempSave(formState);
  };

  // 施術者別集計
  const getStaffReport = (staffId: number) => {
    return reports.filter(report => report.staff_id === staffId);
  };

  // オフライン時のキュー処理
  useEffect(() => {
    const processQueue = async () => {
      if (isOnline && queue.length > 0) {
        try {
          await Promise.all(queue.map(report => createReport(report)));
          setQueue([]);
        } catch (err: any) {
          setError(err.message);
        }
      }
    };

    processQueue();
  }, [isOnline, queue]);

  // オンライン状態の監視
  useEffect(() => {
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
    fetchReports();
  }, []);

  return {
    reports,
    loading,
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
  };
};

export default useDailyReports;