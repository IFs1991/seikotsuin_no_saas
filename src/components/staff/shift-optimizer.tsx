'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

interface StaffResource {
  id: string;
  name: string;
  type: string;
  isActive?: boolean;
  isBookable?: boolean;
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

interface ShiftFormState {
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
}

interface BulkShiftFormState {
  staffId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  weekdays: number[];
  notes: string;
}

interface ApiDataResponse<T> {
  data?: T;
}

interface ShiftListData {
  shifts?: Shift[];
}

interface PreferenceListData {
  preferences?: Preference[];
}

interface DemandForecastData {
  forecasts?: DemandForecast[];
  hourlyDistribution?: HourlyDistribution[];
}

interface ApiErrorResponse {
  error?: string | { message?: string };
  message?: string;
}

const DATE_FORMATTER_JST = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TIME_FORMATTER_JST = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
});

const formatDateJst = (value: Date | string): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return DATE_FORMATTER_JST.format(date);
};

const formatTimeJst = (value: string): string =>
  TIME_FORMATTER_JST.format(new Date(value));

const getMonthRange = (year: number, zeroBasedMonth: number) => {
  const start = formatDateJst(new Date(year, zeroBasedMonth, 1));
  const end = formatDateJst(new Date(year, zeroBasedMonth + 1, 0));

  return { start, end };
};

const WEEKDAY_OPTIONS = [
  { value: 0, label: '日' },
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
] as const;

const DEFAULT_BULK_WEEKDAYS = [1, 2, 3, 4, 5];

const parseDateInput = (value: string): Date | null => {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  return new Date(year, month - 1, day);
};

const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function buildBulkShiftDates({
  startDate,
  endDate,
  weekdays,
}: Pick<BulkShiftFormState, 'startDate' | 'endDate' | 'weekdays'>): string[] {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);

  if (start === null || end === null || start.getTime() > end.getTime()) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    if (weekdays.includes(cursor.getDay())) {
      dates.push(formatDateInput(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

async function parseApiData<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiDataResponse<T>;
  return json.data ?? ({} as T);
}

async function parseApiErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const json = (await response.json()) as ApiErrorResponse;
    if (typeof json.error === 'string') {
      return json.error;
    }
    if (typeof json.error?.message === 'string') {
      return json.error.message;
    }
    if (typeof json.message === 'string') {
      return json.message;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

const ShiftOptimizer: React.FC<ShiftOptimizerProps> = ({ clinicId }) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staffResources, setStaffResources] = useState<StaffResource[]>([]);
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
  const [shiftForm, setShiftForm] = useState<ShiftFormState>(() => ({
    staffId: '',
    date: formatDateJst(new Date()),
    startTime: '09:00',
    endTime: '18:00',
    notes: '',
  }));
  const [bulkShiftForm, setBulkShiftForm] = useState<BulkShiftFormState>(() => {
    const today = formatDateJst(new Date());
    return {
      staffId: '',
      startDate: today,
      endDate: today,
      startTime: '09:00',
      endTime: '18:00',
      weekdays: DEFAULT_BULK_WEEKDAYS,
      notes: '',
    };
  });
  const [isSavingShift, setIsSavingShift] = useState(false);
  const [shiftNotice, setShiftNotice] = useState<string | null>(null);

  const currentDateKey = useMemo(() => formatDateJst(new Date()), []);
  const [currentYear, currentMonthNumber] = useMemo(
    () => currentDateKey.split('-').map(Number),
    [currentDateKey]
  );
  const currentMonth = currentMonthNumber - 1;
  const monthRange = useMemo(
    () => getMonthRange(currentYear, currentMonth),
    [currentMonth, currentYear]
  );
  const daysInMonth = useMemo(
    () => new Date(currentYear, currentMonth + 1, 0).getDate(),
    [currentMonth, currentYear]
  );
  const firstDayOfMonth = useMemo(
    () => new Date(currentYear, currentMonth, 1).getDay(),
    [currentMonth, currentYear]
  );
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );
  const bulkTargetDates = useMemo(
    () =>
      buildBulkShiftDates({
        startDate: bulkShiftForm.startDate,
        endDate: bulkShiftForm.endDate,
        weekdays: bulkShiftForm.weekdays,
      }),
    [bulkShiftForm.endDate, bulkShiftForm.startDate, bulkShiftForm.weekdays]
  );

  const fetchShifts = useCallback(async () => {
    if (!clinicId) {
      setShifts([]);
      return;
    }

    const response = await fetch(
      `/api/staff/shifts?clinic_id=${clinicId}&start=${monthRange.start}&end=${monthRange.end}`
    );

    if (!response.ok) {
      throw new Error('シフトデータの取得に失敗しました');
    }

    const data = await parseApiData<ShiftListData>(response);
    setShifts(data.shifts ?? []);
  }, [clinicId, monthRange.end, monthRange.start]);

  const fetchCoreData = useCallback(async () => {
    if (!clinicId) {
      setShifts([]);
      setStaffResources([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [shiftsRes, resourcesRes] = await Promise.all([
        fetch(
          `/api/staff/shifts?clinic_id=${clinicId}&start=${monthRange.start}&end=${monthRange.end}`
        ),
        fetch(`/api/resources?clinic_id=${clinicId}&type=staff`),
      ]);

      // エラーチェック
      if (!shiftsRes.ok || !resourcesRes.ok) {
        throw new Error('データ取得に失敗しました');
      }

      const [shiftsData, resourcesData] = await Promise.all([
        parseApiData<ShiftListData>(shiftsRes),
        parseApiData<StaffResource[]>(resourcesRes),
      ]);

      setShifts(shiftsData.shifts ?? []);
      setStaffResources(
        (Array.isArray(resourcesData) ? resourcesData : []).filter(
          resource =>
            resource.type === 'staff' &&
            resource.isActive !== false &&
            resource.isBookable !== false
        )
      );
    } catch (err) {
      console.error('Shift optimizer data fetch error:', err);
      setError(err instanceof Error ? err.message : 'データ取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [clinicId, monthRange.end, monthRange.start]);

  const fetchInsightData = useCallback(async () => {
    if (!clinicId) {
      setPreferences([]);
      setDemandForecasts([]);
      setHourlyDistribution([]);
      return;
    }

    try {
      const [preferencesRes, demandRes] = await Promise.all([
        fetch(`/api/staff/preferences?clinic_id=${clinicId}&active_only=true`),
        fetch(
          `/api/staff/demand-forecast?clinic_id=${clinicId}&start=${monthRange.start}&end=${monthRange.end}`
        ),
      ]);

      if (!preferencesRes.ok || !demandRes.ok) {
        throw new Error('補助データの取得に失敗しました');
      }

      const [preferencesData, demandData] = await Promise.all([
        parseApiData<PreferenceListData>(preferencesRes),
        parseApiData<DemandForecastData>(demandRes),
      ]);

      setPreferences(preferencesData.preferences ?? []);
      setDemandForecasts(demandData.forecasts ?? []);
      setHourlyDistribution(demandData.hourlyDistribution ?? []);
    } catch (err) {
      console.error('Shift optimizer insight fetch error:', err);
      setPreferences([]);
      setDemandForecasts([]);
      setHourlyDistribution([]);
    }
  }, [clinicId, monthRange.end, monthRange.start]);

  const fetchData = useCallback(async () => {
    await fetchCoreData();
    void fetchInsightData();
  }, [fetchCoreData, fetchInsightData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setShiftForm(prev => ({
      ...prev,
      date: selectedDate,
    }));
    setBulkShiftForm(prev => ({
      ...prev,
      startDate: selectedDate,
      endDate: selectedDate,
    }));
  }, [selectedDate]);

  useEffect(() => {
    setShiftForm(prev => {
      if (prev.staffId || staffResources.length === 0) {
        return prev;
      }

      return {
        ...prev,
        staffId: staffResources[0].id,
      };
    });
    setBulkShiftForm(prev => {
      if (prev.staffId || staffResources.length === 0) {
        return prev;
      }

      return {
        ...prev,
        staffId: staffResources[0].id,
      };
    });
  }, [staffResources]);

  const shiftsByDate = useMemo(() => {
    const grouped = new Map<string, Shift[]>();

    for (const shift of shifts) {
      const dateKey = formatDateJst(shift.start_time);
      const dateShifts = grouped.get(dateKey);

      if (dateShifts) {
        dateShifts.push(shift);
      } else {
        grouped.set(dateKey, [shift]);
      }
    }

    return grouped;
  }, [shifts]);

  const selectedDayShifts = useMemo(
    () => shiftsByDate.get(selectedDate) ?? [],
    [selectedDate, shiftsByDate]
  );

  const selectedDayForecasts = useMemo(
    () => demandForecasts.filter(forecast => forecast.date === selectedDate),
    [demandForecasts, selectedDate]
  );

  const buildShiftDateTime = (date: string, time: string): string =>
    new Date(`${date}T${time}:00+09:00`).toISOString();

  const updateShiftForm = (updates: Partial<ShiftFormState>) => {
    setShiftForm(prev => ({ ...prev, ...updates }));
  };

  const updateBulkShiftForm = (updates: Partial<BulkShiftFormState>) => {
    setBulkShiftForm(prev => ({ ...prev, ...updates }));
  };

  const toggleBulkWeekday = (weekday: number) => {
    setBulkShiftForm(prev => {
      const nextWeekdays = prev.weekdays.includes(weekday)
        ? prev.weekdays.filter(value => value !== weekday)
        : [...prev.weekdays, weekday].sort();

      return {
        ...prev,
        weekdays: nextWeekdays,
      };
    });
  };

  const createConfirmedShift = async ({
    staffId,
    date,
    startTime,
    endTime,
    notes,
  }: {
    staffId: string;
    date: string;
    startTime: string;
    endTime: string;
    notes: string;
  }) => {
    const response = await fetch('/api/staff/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: clinicId,
        staff_id: staffId,
        start_time: buildShiftDateTime(date, startTime),
        end_time: buildShiftDateTime(date, endTime),
        status: 'confirmed',
        notes: notes || undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(
        await parseApiErrorMessage(response, 'シフト作成に失敗しました')
      );
    }
  };

  const createShift = async () => {
    const staffId = shiftForm.staffId || staffResources[0]?.id;
    if (!clinicId || !staffId) {
      setError('スタッフを選択してください');
      return;
    }

    setIsSavingShift(true);
    setError(null);
    setShiftNotice(null);

    try {
      await createConfirmedShift({
        staffId,
        date: shiftForm.date,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        notes: shiftForm.notes,
      });

      updateShiftForm({ notes: '' });
      setShiftNotice('シフトを作成しました');
      await fetchShifts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'シフト作成に失敗しました');
    } finally {
      setIsSavingShift(false);
    }
  };

  const createBulkShifts = async () => {
    const staffId = bulkShiftForm.staffId || staffResources[0]?.id;
    if (!clinicId || !staffId) {
      setError('スタッフを選択してください');
      return;
    }

    if (bulkTargetDates.length === 0) {
      setError('一括作成する日付を選択してください');
      return;
    }

    setIsSavingShift(true);
    setError(null);
    setShiftNotice(null);

    try {
      const response = await fetch('/api/staff/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          shifts: bulkTargetDates.map(date => ({
            staff_id: staffId,
            start_time: buildShiftDateTime(date, bulkShiftForm.startTime),
            end_time: buildShiftDateTime(date, bulkShiftForm.endTime),
            status: 'confirmed',
            notes: bulkShiftForm.notes || undefined,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(
          await parseApiErrorMessage(response, 'シフト一括作成に失敗しました')
        );
      }

      updateBulkShiftForm({ notes: '' });
      setShiftNotice(`${bulkTargetDates.length}件のシフトを一括作成しました`);
      await fetchShifts();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'シフト一括作成に失敗しました';
      setError(message);
    } finally {
      setIsSavingShift(false);
    }
  };

  const cancelShift = async (shift: Shift) => {
    setIsSavingShift(true);
    setError(null);

    try {
      const response = await fetch('/api/staff/shifts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: shift.clinic_id,
          id: shift.id,
          status: 'cancelled',
        }),
      });

      if (!response.ok) {
        throw new Error('シフト取消に失敗しました');
      }

      await fetchShifts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'シフト取消に失敗しました');
    } finally {
      setIsSavingShift(false);
    }
  };

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
      <div className='flex justify-center py-8 bg-background'>
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
  const bulkTargetCount = bulkTargetDates.length;

  return (
    <div className='flex justify-center py-8 bg-background text-foreground'>
      <Card className='w-full max-w-4xl bg-card shadow-lg rounded-lg'>
        <CardHeader className='bg-card border-b border-gray-200 dark:border-gray-700 pb-4'>
          <CardTitle className='text-2xl font-bold text-center text-primary-600 dark:text-medical-green-500'>
            シフト最適化提案
          </CardTitle>
          <CardDescription className='text-center text-muted-foreground mt-2'>
            AIによる最適なシフト提案と、カレンダー上での直感的な編集・管理が可能です。
          </CardDescription>
        </CardHeader>
        <CardContent className='bg-card p-6 space-y-8'>
          <div>
            <h3 className='text-xl font-semibold mb-4 text-primary-600 dark:text-medical-green-500'>
              単日シフト作成
            </h3>
            {shiftNotice && (
              <div className='mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>
                {shiftNotice}
              </div>
            )}
            <div className='grid grid-cols-1 md:grid-cols-5 gap-3 rounded-md border border-border bg-muted p-4'>
              <label className='text-sm font-medium'>
                スタッフ
                <select
                  value={shiftForm.staffId}
                  onChange={event =>
                    updateShiftForm({ staffId: event.target.value })
                  }
                  className='mt-1 w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900'
                >
                  {staffResources.map(resource => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className='text-sm font-medium'>
                日付
                <input
                  type='date'
                  value={shiftForm.date}
                  onChange={event => {
                    updateShiftForm({ date: event.target.value });
                    setSelectedDate(event.target.value);
                  }}
                  className='mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900'
                />
              </label>
              <label className='text-sm font-medium'>
                開始
                <input
                  type='time'
                  value={shiftForm.startTime}
                  onChange={event =>
                    updateShiftForm({ startTime: event.target.value })
                  }
                  className='mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900'
                />
              </label>
              <label className='text-sm font-medium'>
                終了
                <input
                  type='time'
                  value={shiftForm.endTime}
                  onChange={event =>
                    updateShiftForm({ endTime: event.target.value })
                  }
                  className='mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900'
                />
              </label>
              <div className='flex items-end'>
                <Button
                  type='button'
                  onClick={createShift}
                  disabled={isSavingShift || staffResources.length === 0}
                  className='w-full bg-primary-600 text-white hover:bg-primary-600/90'
                >
                  {isSavingShift ? '保存中...' : '作成'}
                </Button>
              </div>
              <label className='md:col-span-5 text-sm font-medium'>
                メモ
                <input
                  type='text'
                  value={shiftForm.notes}
                  onChange={event =>
                    updateShiftForm({ notes: event.target.value })
                  }
                  className='mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900'
                  placeholder='任意'
                />
              </label>
            </div>
          </div>

          <div>
            <h3 className='text-xl font-semibold mb-4 text-primary-600 dark:text-medical-green-500'>
              ユーザー別一括作成
            </h3>
            <div className='space-y-4 rounded-md border border-border bg-muted p-4'>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-5'>
                <label className='text-sm font-medium'>
                  対象スタッフ
                  <select
                    value={bulkShiftForm.staffId}
                    onChange={event =>
                      updateBulkShiftForm({ staffId: event.target.value })
                    }
                    className='mt-1 w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900'
                  >
                    {staffResources.map(resource => (
                      <option key={resource.id} value={resource.id}>
                        {resource.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='text-sm font-medium'>
                  開始日
                  <input
                    type='date'
                    value={bulkShiftForm.startDate}
                    onChange={event =>
                      updateBulkShiftForm({ startDate: event.target.value })
                    }
                    className='mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900'
                  />
                </label>
                <label className='text-sm font-medium'>
                  終了日
                  <input
                    type='date'
                    value={bulkShiftForm.endDate}
                    onChange={event =>
                      updateBulkShiftForm({ endDate: event.target.value })
                    }
                    className='mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900'
                  />
                </label>
                <label className='text-sm font-medium'>
                  開始
                  <input
                    type='time'
                    value={bulkShiftForm.startTime}
                    onChange={event =>
                      updateBulkShiftForm({ startTime: event.target.value })
                    }
                    className='mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900'
                  />
                </label>
                <label className='text-sm font-medium'>
                  終了
                  <input
                    type='time'
                    value={bulkShiftForm.endTime}
                    onChange={event =>
                      updateBulkShiftForm({ endTime: event.target.value })
                    }
                    className='mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900'
                  />
                </label>
              </div>
              <div className='space-y-2'>
                <span className='text-sm font-medium'>作成する曜日</span>
                <div className='flex flex-wrap gap-2'>
                  {WEEKDAY_OPTIONS.map(option => (
                    <label
                      key={option.value}
                      className={`inline-flex min-w-12 items-center justify-center rounded border px-3 py-2 text-sm font-medium ${
                        bulkShiftForm.weekdays.includes(option.value)
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700'
                      }`}
                    >
                      <input
                        type='checkbox'
                        checked={bulkShiftForm.weekdays.includes(option.value)}
                        onChange={() => toggleBulkWeekday(option.value)}
                        className='sr-only'
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
              <label className='block text-sm font-medium'>
                メモ
                <input
                  type='text'
                  value={bulkShiftForm.notes}
                  onChange={event =>
                    updateBulkShiftForm({ notes: event.target.value })
                  }
                  className='mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900'
                  placeholder='任意'
                />
              </label>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <p className='text-sm text-muted-foreground'>
                  作成対象: {bulkTargetCount}件
                </p>
                <Button
                  type='button'
                  onClick={createBulkShifts}
                  disabled={
                    isSavingShift ||
                    staffResources.length === 0 ||
                    bulkTargetCount === 0
                  }
                  className='bg-primary-600 text-white hover:bg-primary-600/90'
                >
                  {isSavingShift ? '保存中...' : '一括作成'}
                </Button>
              </div>
            </div>
          </div>

          <Separator className='bg-muted' />

          {/* AIによるシフト提案表示 */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-primary-600 dark:text-medical-green-500'>
              AIによるシフト提案
            </h3>
            {shifts.length === 0 ? (
              <div className='p-4 border border-border rounded-md bg-muted text-center'>
                <p className='text-gray-500 text-muted-foreground'>
                  シフトデータがありません
                </p>
                <p className='text-sm text-gray-400 text-muted-foreground mt-1'>
                  シフトを作成するには、管理者にお問い合わせください
                </p>
              </div>
            ) : (
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {shifts.slice(0, 8).map(shift => (
                  <div
                    key={shift.id}
                    className='p-4 border border-border rounded-md bg-muted'
                  >
                    <p className='font-medium text-foreground'>
                      {shift.staff?.name || '未割り当て'}
                    </p>
                    <p className='text-sm text-muted-foreground'>
                      {new Date(shift.start_time).toLocaleDateString('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                      })}{' '}
                      {formatTimeJst(shift.start_time)}-
                      {formatTimeJst(shift.end_time)}
                    </p>
                    <p
                      className={`text-sm font-semibold ${
                        shift.status === 'confirmed'
                          ? 'text-medical-green-500'
                          : 'text-orange-500'
                      }`}
                    >
                      ステータス: {getStatusLabel(shift.status)}
                    </p>
                    {shift.status !== 'cancelled' && (
                      <Button
                        type='button'
                        variant='outline'
                        onClick={() => cancelShift(shift)}
                        disabled={isSavingShift}
                        className='mt-3'
                      >
                        取消
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator className='bg-muted' />

          {/* カレンダービュー */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-primary-600 dark:text-medical-green-500'>
              カレンダービュー
            </h3>
            <div className='flex justify-between items-center mb-4'>
              <Button
                variant='outline'
                className='bg-primary-600 hover:bg-primary-600/90 text-white dark:bg-medical-green-500 dark:hover:bg-medical-green-500/90'
                disabled
              >
                前月
              </Button>
              <span className='text-lg font-medium text-foreground'>
                {currentYear}年 {monthNames[currentMonth]}
              </span>
              <Button
                variant='outline'
                className='bg-primary-600 hover:bg-primary-600/90 text-white dark:bg-medical-green-500 dark:hover:bg-medical-green-500/90'
                disabled
              >
                翌月
              </Button>
            </div>
            <div className='grid grid-cols-7 gap-1 text-center text-sm'>
              {['日', '月', '火', '水', '木', '金', '土'].map(day => (
                <div
                  key={day}
                  className='font-bold text-primary-600 dark:text-medical-green-500'
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
                const dayShifts = shiftsByDate.get(dateStr) ?? [];

                return (
                  <button
                    key={day}
                    type='button'
                    aria-label={`日付 ${day} を選択`}
                    className={`p-2 border border-gray-200 dark:border-gray-700 rounded-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500
                      ${
                        dateStr === selectedDate
                          ? 'bg-primary-600 text-white dark:bg-medical-green-500'
                          : 'bg-muted text-foreground'
                      }
                      hover:bg-gray-200 dark:hover:bg-muted`}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    {day}
                    {dayShifts.slice(0, 2).map(s => (
                      <div
                        key={s.id}
                        className='text-xs mt-1 truncate text-gray-700 text-muted-foreground'
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

          <Separator className='bg-muted' />

          <div>
            <h3 className='text-xl font-semibold mb-4 text-primary-600 dark:text-medical-green-500'>
              選択日のシフト
            </h3>
            {selectedDayShifts.length === 0 ? (
              <div className='p-4 border border-border rounded-md text-center text-muted-foreground'>
                選択日のシフトはありません
              </div>
            ) : (
              <div className='space-y-3'>
                {selectedDayShifts.map(shift => (
                  <div
                    key={shift.id}
                    className='flex flex-col gap-2 rounded-md border border-border bg-muted p-3 sm:flex-row sm:items-center sm:justify-between'
                  >
                    <div>
                      <p className='font-medium'>
                        {shift.staff?.name || '未割り当て'}
                      </p>
                      <p className='text-sm text-muted-foreground'>
                        {formatTimeJst(shift.start_time)}-
                        {formatTimeJst(shift.end_time)}
                        {' / '}
                        {getStatusLabel(shift.status)}
                      </p>
                    </div>
                    {shift.status !== 'cancelled' && (
                      <Button
                        type='button'
                        variant='outline'
                        onClick={() => cancelShift(shift)}
                        disabled={isSavingShift}
                      >
                        取消
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator className='bg-muted' />

          {/* 需要予測オーバーレイ */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-primary-600 dark:text-medical-green-500'>
              需要予測
            </h3>
            {demandForecasts.length === 0 ? (
              <div className='p-4 border border-border rounded-md bg-muted text-center'>
                <p className='text-gray-500 text-muted-foreground'>
                  需要予測データがありません
                </p>
                <p className='text-sm text-gray-400 text-muted-foreground mt-1'>
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
                        className='p-4 border border-border rounded-md bg-muted'
                      >
                        <p className='font-medium text-foreground'>
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
                <p className='text-sm text-muted-foreground mt-2'>
                  需要予測に基づいて、最適な人員配置を提案します。
                </p>
              </>
            )}
          </div>

          <Separator className='bg-muted' />

          {/* スタッフ希望の反映 */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-primary-600 dark:text-medical-green-500'>
              スタッフ希望
            </h3>
            {preferences.length === 0 ? (
              <div className='p-4 border border-border rounded-md bg-muted text-center'>
                <p className='text-gray-500 text-muted-foreground'>
                  スタッフ希望データがありません
                </p>
                <p className='text-sm text-gray-400 text-muted-foreground mt-1'>
                  スタッフが希望を登録すると、ここに表示されます
                </p>
              </div>
            ) : (
              <ul className='list-disc list-inside text-foreground space-y-1'>
                {preferences.map(pref => (
                  <li key={pref.id}>
                    {pref.staff?.name || '不明'}: {pref.preference_text}
                  </li>
                ))}
              </ul>
            )}
            <p className='text-sm text-muted-foreground mt-2'>
              スタッフの希望を考慮し、公平かつ効率的なシフトを生成します。
            </p>
          </div>

          <Separator className='bg-muted' />

          {/* コスト計算 */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-primary-600 dark:text-medical-green-500'>
              コスト計算
            </h3>
            <p className='text-2xl font-bold text-foreground'>
              総人件費予測:{' '}
              <span className='text-medical-green-500'>
                {shifts.length > 0
                  ? `¥${(shifts.length * 8 * 1200).toLocaleString()}`
                  : '—'}
              </span>
            </p>
            <p className='text-sm text-muted-foreground mt-2'>
              提案されたシフトに基づく人件費をリアルタイムで計算します。
            </p>
          </div>

          <Separator className='bg-muted' />

          {/* 承認フロー & 通知機能 */}
          <div className='flex flex-col md:flex-row justify-between items-center gap-4'>
            <div className='flex items-center space-x-2'>
              <CheckCircle className='h-6 w-6 text-medical-green-500' />
              <span className='text-lg font-medium text-foreground'>
                承認ステータス:{' '}
                <span
                  className={
                    shifts.some(s => s.status === 'confirmed')
                      ? 'text-medical-green-500'
                      : 'text-orange-500'
                  }
                >
                  {shifts.some(s => s.status === 'confirmed')
                    ? '一部承認済み'
                    : '未承認'}
                </span>
              </span>
            </div>
            <Button className='bg-primary-600 hover:bg-primary-600/90 text-white dark:bg-medical-green-500 dark:hover:bg-medical-green-500/90'>
              シフトを承認
            </Button>
            <Button
              variant='outline'
              className='border-primary-600 text-primary-600 hover:bg-gray-100 dark:border-medical-green-500 dark:text-medical-green-500 dark:hover:bg-muted'
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
