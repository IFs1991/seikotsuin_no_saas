'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

// 型定義
interface Staff {
  id: string;
  name: string;
  type?: string;
}

interface Shift {
  id: string;
  clinic_id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  status: 'draft' | 'proposed' | 'confirmed' | 'cancelled';
  notes?: string;
  staff: Staff | null;
}

interface Preference {
  id: string;
  clinic_id: string;
  staff_id: string;
  preference_text: string;
  preference_type: string;
  priority: number;
  is_active: boolean;
  staff: Staff | null;
}

interface DemandForecast {
  date: string;
  hour: number;
  count: number;
  level: 'low' | 'medium' | 'high';
}

interface HourlyDistribution {
  hour: number;
  totalCount: number;
  averageCount: number;
  level: 'low' | 'medium' | 'high';
}

interface ShiftOptimizerProps {
  clinicId: string;
}

const formatDateJst = (value: Date | string): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const ShiftOptimizer: React.FC<ShiftOptimizerProps> = ({ clinicId }) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [demandForecasts, setDemandForecasts] = useState<DemandForecast[]>([]);
  const [hourlyDistribution, setHourlyDistribution] = useState<
    HourlyDistribution[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return formatDateJst(new Date());
  });

  // 今月のデータを取得するための日付計算
  const currentDate = new Date();
  const currentDateKey = formatDateJst(currentDate);
  const [currentYear, currentMonthNumber] = currentDateKey
    .split('-')
    .map(Number);
  const currentMonth = currentMonthNumber - 1;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  // 日付の配列を生成
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // データ取得
  const fetchData = useCallback(async () => {
    if (!clinicId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 今月の範囲を設定
      const startOfMonth = new Date(currentYear, currentMonth, 1);
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
      const start = formatDateJst(startOfMonth);
      const end = formatDateJst(endOfMonth);

      // 並列でAPIを呼び出し
      const [shiftsRes, preferencesRes, demandRes] = await Promise.all([
        fetch(
          `/api/staff/shifts?clinic_id=${clinicId}&start=${start}&end=${end}`
        ),
        fetch(`/api/staff/preferences?clinic_id=${clinicId}&active_only=true`),
        fetch(
          `/api/staff/demand-forecast?clinic_id=${clinicId}&start=${start}&end=${end}`
        ),
      ]);

      // エラーチェック
      if (!shiftsRes.ok || !preferencesRes.ok || !demandRes.ok) {
        throw new Error('データ取得に失敗しました');
      }

      const [shiftsData, preferencesData, demandData] = await Promise.all([
        shiftsRes.json(),
        preferencesRes.json(),
        demandRes.json(),
      ]);

      setShifts(shiftsData.data?.shifts || []);
      setPreferences(preferencesData.data?.preferences || []);
      setDemandForecasts(demandData.data?.forecasts || []);
      setHourlyDistribution(demandData.data?.hourlyDistribution || []);
    } catch (err) {
      console.error('Shift optimizer data fetch error:', err);
      setError(err instanceof Error ? err.message : 'データ取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [clinicId, currentYear, currentMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ステータスのラベル変換
  const getStatusLabel = (status: string): string => {
    const statusLabels: Record<string, string> = {
      draft: '下書き',
      proposed: '提案中',
      confirmed: '確定',
      cancelled: 'キャンセル',
    };
    return statusLabels[status] || status;
  };

  // 需要レベルのラベル変換
  const getLevelLabel = (level: string): string => {
    const levelLabels: Record<string, string> = {
      low: '低',
      medium: '中',
      high: '高',
    };
    return levelLabels[level] || level;
  };

  // 需要レベルに応じた色
  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'high':
        return 'text-red-500';
      case 'medium':
        return 'text-yellow-500';
      case 'low':
        return 'text-green-500';
      default:
        return 'text-gray-500';
    }
  };

  // ローディング状態
  if (isLoading) {
    return (
      <div
        className='flex justify-center items-center py-16'
        role='status'
        aria-label='Shift optimizer loading'
      >
        <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
        <span className='ml-2 text-gray-600'>読み込み中...</span>
      </div>
    );
  }

  // エラー状態
  if (error) {
    return (
      <div className='flex justify-center py-8 bg-white dark:bg-gray-800'>
        <Card className='w-full max-w-4xl bg-red-50 dark:bg-red-900/20 border-red-200'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-red-600'>
              <AlertCircle className='h-5 w-5' />
              データ取得に失敗しました
            </CardTitle>
            <CardDescription className='text-red-500'>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchData} variant='outline'>
              再読み込み
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 選択された日付のシフトをフィルタリング
  const selectedDayShifts = shifts.filter(shift => {
    return formatDateJst(shift.start_time) === selectedDate;
  });

  // 選択された日付の需要予測をフィルタリング
  const selectedDayForecasts = demandForecasts.filter(
    forecast => forecast.date === selectedDate
  );

  // 月の名前を取得
  const monthNames = [
    '1月',
    '2月',
    '3月',
    '4月',
    '5月',
    '6月',
    '7月',
    '8月',
    '9月',
    '10月',
    '11月',
    '12月',
  ];

  return (
    <div className='flex justify-center py-8 bg-white dark:bg-gray-800 text-[#111827] dark:text-[#f9fafb]'>
      <Card className='w-full max-w-4xl bg-card shadow-lg rounded-lg'>
        <CardHeader className='bg-card border-b border-gray-200 dark:border-gray-700 pb-4'>
          <CardTitle className='text-2xl font-bold text-center text-[#1e3a8a] dark:text-[#10b981]'>
            シフト最適化提案
          </CardTitle>
          <CardDescription className='text-center text-gray-600 dark:text-gray-400 mt-2'>
            AIによる最適なシフト提案と、カレンダー上での直感的な編集・管理が可能です。
          </CardDescription>
        </CardHeader>
        <CardContent className='bg-card p-6 space-y-8'>
          {/* AIによるシフト提案表示 */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              AIによるシフト提案
            </h3>
            {shifts.length === 0 ? (
              <div className='p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-center'>
                <p className='text-gray-500 dark:text-gray-400'>
                  シフトデータがありません
                </p>
                <p className='text-sm text-gray-400 dark:text-gray-500 mt-1'>
                  シフトを作成するには、管理者にお問い合わせください
                </p>
              </div>
            ) : (
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {shifts.slice(0, 8).map(shift => (
                  <div
                    key={shift.id}
                    className='p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700'
                  >
                    <p className='font-medium text-[#111827] dark:text-[#f9fafb]'>
                      {shift.staff?.name || '未割り当て'}
                    </p>
                    <p className='text-sm text-gray-600 dark:text-gray-400'>
                      {new Date(shift.start_time).toLocaleDateString('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                      })}{' '}
                      {new Date(shift.start_time).toLocaleTimeString('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      -
                      {new Date(shift.end_time).toLocaleTimeString('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p
                      className={`text-sm font-semibold ${
                        shift.status === 'confirmed'
                          ? 'text-[#10b981]'
                          : 'text-orange-500'
                      }`}
                    >
                      ステータス: {getStatusLabel(shift.status)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* カレンダービュー */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              カレンダービュー
            </h3>
            <div className='flex justify-between items-center mb-4'>
              <Button
                variant='outline'
                className='bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'
                disabled
              >
                前月
              </Button>
              <span className='text-lg font-medium text-[#111827] dark:text-[#f9fafb]'>
                {currentYear}年 {monthNames[currentMonth]}
              </span>
              <Button
                variant='outline'
                className='bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'
                disabled
              >
                翌月
              </Button>
            </div>
            <div className='grid grid-cols-7 gap-1 text-center text-sm'>
              {['日', '月', '火', '水', '木', '金', '土'].map(day => (
                <div
                  key={day}
                  className='font-bold text-[#1e3a8a] dark:text-[#10b981]'
                >
                  {day}
                </div>
              ))}
              {/* 月初めの空白セル */}
              {Array.from({ length: firstDayOfMonth }, (_, i) => (
                <div key={`empty-start-${i}`} className='p-2'></div>
              ))}
              {days.map(day => {
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayShifts = shifts.filter(
                  s => formatDateJst(s.start_time) === dateStr
                );

                return (
                  <button
                    key={day}
                    type='button'
                    aria-label={`日付 ${day} を選択`}
                    className={`p-2 border border-gray-200 dark:border-gray-700 rounded-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500
                      ${
                        dateStr === selectedDate
                          ? 'bg-[#1e3a8a] text-white dark:bg-[#10b981]'
                          : 'bg-gray-50 dark:bg-gray-700 text-[#111827] dark:text-[#f9fafb]'
                      }
                      hover:bg-gray-200 dark:hover:bg-gray-600`}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    {day}
                    {dayShifts.slice(0, 2).map(s => (
                      <div
                        key={s.id}
                        className='text-xs mt-1 truncate text-gray-700 dark:text-gray-200'
                      >
                        {s.staff?.name?.split(' ')[0] || '未割当'}
                      </div>
                    ))}
                    {dayShifts.length > 2 && (
                      <div className='text-xs text-gray-500'>
                        +{dayShifts.length - 2}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* ドラッグ&ドロップ編集 (概念的な表示) */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              シフト編集
            </h3>
            <div className='p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-md text-center text-gray-500 dark:text-gray-400'>
              <p>シフトをドラッグ&ドロップで直感的に編集できます。</p>
              <p className='text-sm mt-2'>
                （このエリアでシフトアイテムを移動・調整）
              </p>
            </div>
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* 需要予測オーバーレイ */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              需要予測
            </h3>
            {demandForecasts.length === 0 ? (
              <div className='p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-center'>
                <p className='text-gray-500 dark:text-gray-400'>
                  需要予測データがありません
                </p>
                <p className='text-sm text-gray-400 dark:text-gray-500 mt-1'>
                  予約データが蓄積されると、需要予測が表示されます
                </p>
              </div>
            ) : (
              <>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  {selectedDayForecasts.length > 0 ? (
                    selectedDayForecasts.map((forecast, index) => (
                      <div
                        key={`${forecast.date}-${forecast.hour}-${index}`}
                        className='p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700'
                      >
                        <p className='font-medium text-[#111827] dark:text-[#f9fafb]'>
                          {forecast.date} {forecast.hour}:00-
                          {forecast.hour + 1}:00
                        </p>
                        <p
                          className={`text-sm font-semibold ${getLevelColor(forecast.level)}`}
                        >
                          予測: {getLevelLabel(forecast.level)} (
                          {forecast.count}件)
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className='col-span-2 p-4 text-center text-gray-500'>
                      選択した日付の需要予測データがありません
                    </div>
                  )}
                </div>
                <p className='text-sm text-gray-600 dark:text-gray-400 mt-2'>
                  需要予測に基づいて、最適な人員配置を提案します。
                </p>
              </>
            )}
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* スタッフ希望の反映 */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              スタッフ希望
            </h3>
            {preferences.length === 0 ? (
              <div className='p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700 text-center'>
                <p className='text-gray-500 dark:text-gray-400'>
                  スタッフ希望データがありません
                </p>
                <p className='text-sm text-gray-400 dark:text-gray-500 mt-1'>
                  スタッフが希望を登録すると、ここに表示されます
                </p>
              </div>
            ) : (
              <ul className='list-disc list-inside text-[#111827] dark:text-[#f9fafb] space-y-1'>
                {preferences.map(pref => (
                  <li key={pref.id}>
                    {pref.staff?.name || '不明'}: {pref.preference_text}
                  </li>
                ))}
              </ul>
            )}
            <p className='text-sm text-gray-600 dark:text-gray-400 mt-2'>
              スタッフの希望を考慮し、公平かつ効率的なシフトを生成します。
            </p>
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* コスト計算 */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              コスト計算
            </h3>
            <p className='text-2xl font-bold text-[#111827] dark:text-[#f9fafb]'>
              総人件費予測:{' '}
              <span className='text-[#10b981]'>
                {shifts.length > 0
                  ? `¥${(shifts.length * 8 * 1200).toLocaleString()}`
                  : '—'}
              </span>
            </p>
            <p className='text-sm text-gray-600 dark:text-gray-400 mt-2'>
              提案されたシフトに基づく人件費をリアルタイムで計算します。
            </p>
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* 承認フロー & 通知機能 */}
          <div className='flex flex-col md:flex-row justify-between items-center gap-4'>
            <div className='flex items-center space-x-2'>
              <CheckCircle className='h-6 w-6 text-[#10b981]' />
              <span className='text-lg font-medium text-[#111827] dark:text-[#f9fafb]'>
                承認ステータス:{' '}
                <span
                  className={
                    shifts.some(s => s.status === 'confirmed')
                      ? 'text-[#10b981]'
                      : 'text-orange-500'
                  }
                >
                  {shifts.some(s => s.status === 'confirmed')
                    ? '一部承認済み'
                    : '未承認'}
                </span>
              </span>
            </div>
            <Button className='bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'>
              シフトを承認
            </Button>
            <Button
              variant='outline'
              className='border-[#1e3a8a] text-[#1e3a8a] hover:bg-gray-100 dark:border-[#10b981] dark:text-[#10b981] dark:hover:bg-gray-700'
            >
              スタッフへ通知
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ShiftOptimizer;
