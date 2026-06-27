'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  RefreshCw,
  Send,
  Wand2,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSelectedClinic } from '@/providers/selected-clinic-context';
import { cn } from '@/lib/utils';
import {
  buildClearDraft,
  buildCalendarDays,
  buildUpsertDraft,
  formatDeadline,
  formatPeriodMonthTitle,
  formatShortDate,
  getDraftFeedbackLabel,
  getEffectiveRequestFromDraft,
  getEffectiveRequestFromServer,
  getPeriodEditability,
  getTimePresetLabel,
  isValidLocalTimeRange,
  summarizeCalendarDays,
  toJstTimeStringFromIso,
  type ShiftRequestCalendarDay,
  type ShiftRequestCalendarPeriod,
  type ShiftRequestCalendarRequest,
  type ShiftRequestDraftDay,
} from '@/lib/staff/shift-requests/calendar-model';
import {
  buildWeekdayBulkDrafts,
  copyPreviousRequestsByWeekday,
  findPreviousShiftRequestPeriod,
} from '@/lib/staff/shift-requests/calendar-transform';
import {
  buildTaskAlerts,
  formatBulkAppliedMessage,
  formatFailureDates,
  getSubmitDisabledReason,
} from '@/lib/staff/shift-requests/behavioral-ux';
import type { ShiftRequestType } from '@/lib/staff/shift-requests/types';
import {
  DEFAULT_SHIFT_PRESETS,
  SHIFT_REQUEST_TIME_PRESETS,
  type ShiftRequestTimePreset,
} from '@/lib/staff/shift-requests/time-presets';

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

interface PeriodsPayload {
  periods: ShiftRequestCalendarPeriod[];
  total: number;
}

interface RequestsPayload {
  requests: ShiftRequestCalendarRequest[];
  total: number;
}

interface DayEditorState {
  requestType: ShiftRequestType | 'missing';
  timePreset: ShiftRequestTimePreset;
  customStart: string;
  customEnd: string;
  note: string;
}

interface SubmitResult {
  successCount: number;
  failedDates: string[];
  blockedDates: string[];
}

interface CompletionSummary {
  title: string;
  submittedDays: number;
  dayOffDays: number;
  afternoonDays: number;
  unavailableDays: number;
  noteDays: number;
  missingDays: number;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

const REQUEST_OPTIONS: { value: ShiftRequestType; label: string }[] = [
  { value: 'available', label: '出勤可能' },
  { value: 'preferred', label: '優先的に入りたい' },
  { value: 'day_off', label: '休み希望' },
  { value: 'unavailable', label: '出勤不可' },
];

const BULK_REQUEST_OPTIONS: {
  value: string;
  label: string;
  requestType: ShiftRequestType;
  timePreset: ShiftRequestTimePreset;
}[] = [
  {
    value: 'day_off:full_day',
    label: '休み希望',
    requestType: 'day_off',
    timePreset: 'full_day',
  },
  {
    value: 'available:afternoon',
    label: '午後から可',
    requestType: 'available',
    timePreset: 'afternoon',
  },
  {
    value: 'unavailable:full_day',
    label: '出勤不可',
    requestType: 'unavailable',
    timePreset: 'full_day',
  },
  {
    value: 'available:full_day',
    label: '出勤可能',
    requestType: 'available',
    timePreset: 'full_day',
  },
];

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof (value as { success: unknown }).success === 'boolean'
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload: unknown = await response.json();

  if (!isApiResponse<T>(payload)) {
    throw new Error('APIレスポンスの形式が不正です');
  }

  if (payload.success === false) {
    throw new Error(payload.error);
  }

  return payload.data;
}

function isEditableRequestForSelf(
  request: ShiftRequestCalendarRequest | undefined
) {
  return (
    !request ||
    request.status === 'draft' ||
    request.status === 'submitted' ||
    request.status === 'rejected'
  );
}

function upsertDraft(
  drafts: readonly ShiftRequestDraftDay[],
  nextDraft: ShiftRequestDraftDay
): ShiftRequestDraftDay[] {
  return [...drafts.filter(draft => draft.date !== nextDraft.date), nextDraft];
}

function mergeDrafts(
  currentDrafts: readonly ShiftRequestDraftDay[],
  nextDrafts: readonly ShiftRequestDraftDay[]
): ShiftRequestDraftDay[] {
  let merged = [...currentDrafts];
  for (const draft of nextDrafts) {
    merged = upsertDraft(merged, draft);
  }
  return merged;
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        await worker(items[currentIndex]);
        results[currentIndex] = { status: 'fulfilled', value: undefined };
      } catch (error) {
        results[currentIndex] = { status: 'rejected', reason: error };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker())
  );

  return results;
}

function getDayButtonClass(day: ShiftRequestCalendarDay) {
  if (!day.isEditable) {
    return 'border-slate-200 bg-slate-100 text-slate-500';
  }

  if (day.isRejected) {
    return 'border-amber-400 bg-amber-50 text-amber-950';
  }

  if (day.isDirty) {
    return 'border-violet-500 bg-violet-50 text-violet-950';
  }

  if (day.isMissing) {
    return 'border-dashed border-slate-300 bg-white text-slate-600';
  }

  switch (day.effectiveRequest?.request_type) {
    case 'preferred':
      return 'border-blue-500 bg-blue-50 text-blue-950';
    case 'day_off':
      return 'border-slate-500 bg-slate-100 text-slate-950';
    case 'unavailable':
      return 'border-red-400 bg-red-50 text-red-950';
    case 'available':
      return 'border-emerald-500 bg-emerald-50 text-emerald-950';
    default:
      return 'border-slate-300 bg-white text-slate-900';
  }
}

function buildInitialEditorState(day: ShiftRequestCalendarDay): DayEditorState {
  const effective =
    day.draft && day.draft.action === 'upsert'
      ? getEffectiveRequestFromDraft(day.draft)
      : day.serverRequest
        ? getEffectiveRequestFromServer(day.serverRequest)
        : undefined;
  const preset = effective?.time_preset ?? 'full_day';
  const defaultRange = DEFAULT_SHIFT_PRESETS.full_day;

  return {
    requestType: effective?.request_type ?? 'available',
    timePreset: preset,
    customStart: effective
      ? toJstTimeStringFromIso(effective.start_time)
      : defaultRange.start,
    customEnd: effective
      ? toJstTimeStringFromIso(effective.end_time)
      : defaultRange.end,
    note: effective?.note ?? '',
  };
}

export function ShiftRequestCalendarWorkflow() {
  const {
    selectedClinicId,
    setSelectedClinicId,
    clinics,
    clinicsLoading,
    clinicsError,
  } = useSelectedClinic();
  const [periods, setPeriods] = useState<ShiftRequestCalendarPeriod[]>([]);
  const [requests, setRequests] = useState<ShiftRequestCalendarRequest[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [drafts, setDrafts] = useState<ShiftRequestDraftDay[]>([]);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [selectedDay, setSelectedDay] =
    useState<ShiftRequestCalendarDay | null>(null);
  const [editor, setEditor] = useState<DayEditorState>(() => ({
    requestType: 'available',
    timePreset: 'full_day',
    customStart: DEFAULT_SHIFT_PRESETS.full_day.start,
    customEnd: DEFAULT_SHIFT_PRESETS.full_day.end,
    note: '',
  }));
  const [bulkWeekday, setBulkWeekday] = useState(2);
  const [bulkPresetValue, setBulkPresetValue] = useState(
    BULK_REQUEST_OPTIONS[0]?.value ?? 'day_off:full_day'
  );
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completionSummary, setCompletionSummary] =
    useState<CompletionSummary | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);

  const clinicId = selectedClinicId ?? clinics[0]?.id ?? null;
  const selectedPeriod = useMemo(
    () => periods.find(period => period.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  );
  const editability = useMemo(
    () => getPeriodEditability(selectedPeriod),
    [selectedPeriod]
  );
  const days = useMemo(
    () =>
      buildCalendarDays({
        period: selectedPeriod,
        requests,
        drafts,
      }),
    [drafts, requests, selectedPeriod]
  );
  const summary = useMemo(() => summarizeCalendarDays(days), [days]);
  const alerts = useMemo(
    () => buildTaskAlerts({ period: selectedPeriod, editability, summary }),
    [editability, selectedPeriod, summary]
  );
  const submitDisabledReason = getSubmitDisabledReason({
    clinicId,
    period: selectedPeriod,
    editability,
    dirtyDays: summary.dirtyDays,
    isLoading,
    isSubmitting,
  });
  const visibleDays = useMemo(
    () =>
      showMissingOnly
        ? days.filter(day => day.isMissing || day.isRejected || day.isDirty)
        : days,
    [days, showMissingOnly]
  );
  const leadingBlankCells =
    showMissingOnly || days.length === 0 ? 0 : (days[0]?.weekday + 6) % 7;
  const selectedBulkOption = useMemo(
    () =>
      BULK_REQUEST_OPTIONS.find(option => option.value === bulkPresetValue) ??
      BULK_REQUEST_OPTIONS[0],
    [bulkPresetValue]
  );

  const loadPeriods = useCallback(async () => {
    if (!clinicId) {
      setPeriods([]);
      setSelectedPeriodId('');
      return [];
    }

    const params = new URLSearchParams({ clinic_id: clinicId });
    const data = await requestJson<PeriodsPayload>(
      `/api/staff/shift-request-periods?${params.toString()}`
    );
    setPeriods(data.periods);
    setSelectedPeriodId(current => {
      if (current && data.periods.some(period => period.id === current)) {
        return current;
      }
      return (
        data.periods.find(period => period.status === 'open')?.id ??
        data.periods[0]?.id ??
        ''
      );
    });
    return data.periods;
  }, [clinicId]);

  const fetchRequestsForPeriod = useCallback(
    async (periodId: string) => {
      if (!clinicId || !periodId) {
        return [];
      }

      const params = new URLSearchParams({
        clinic_id: clinicId,
        period_id: periodId,
      });
      const data = await requestJson<RequestsPayload>(
        `/api/staff/shift-requests?${params.toString()}`
      );
      return data.requests;
    },
    [clinicId]
  );

  const loadRequests = useCallback(
    async (periodId = selectedPeriodId) => {
      const nextRequests = await fetchRequestsForPeriod(periodId);
      setRequests(nextRequests);
      return nextRequests;
    },
    [fetchRequestsForPeriod, selectedPeriodId]
  );

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      await loadPeriods();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '提出期間の取得に失敗しました'
      );
    } finally {
      setIsLoading(false);
    }
  }, [loadPeriods]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    setDrafts([]);
    setCompletionSummary(null);
    setSubmitResult(null);
    setMessage(null);
    void loadRequests().catch(error => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '希望シフトの取得に失敗しました'
      );
    });
  }, [loadRequests]);

  useEffect(() => {
    if (drafts.length === 0) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '未保存の変更が失われます';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [drafts.length]);

  function openDayEditor(day: ShiftRequestCalendarDay) {
    if (!day.isEditable) {
      setMessage(day.disabledReason ?? 'この日は編集できません');
      return;
    }

    setSelectedDay(day);
    setEditor(buildInitialEditorState(day));
  }

  function saveSelectedDay() {
    if (!selectedDay) return;

    const requestId = selectedDay.serverRequest?.id;
    const nextDraft =
      editor.requestType === 'missing'
        ? buildClearDraft({ date: selectedDay.date, requestId })
        : buildUpsertDraft({
            date: selectedDay.date,
            requestId,
            request_type: editor.requestType,
            time_preset:
              editor.requestType === 'available' ||
              editor.requestType === 'preferred'
                ? editor.timePreset
                : 'full_day',
            customStart: editor.customStart,
            customEnd: editor.customEnd,
            note: editor.note,
          });

    setDrafts(current => upsertDraft(current, nextDraft));
    setSelectedDay(null);
    setCompletionSummary(null);
    setSubmitResult(null);
    setMessage(
      `${formatShortDate(selectedDay.date)} を${getDraftFeedbackLabel(nextDraft)}にしました。提出するまでは画面内の変更です。`
    );
  }

  function applyWeekdayBulk() {
    if (!selectedBulkOption) return;

    const result = buildWeekdayBulkDrafts({
      days,
      input: {
        weekday: bulkWeekday,
        request_type: selectedBulkOption.requestType,
        time_preset: selectedBulkOption.timePreset,
      },
    });

    if (result.targetDates.length === 0) {
      setMessage('反映できる日がありません');
      return;
    }

    if (
      result.overwriteDates.length > 0 &&
      !window.confirm(
        `既存入力のある${result.overwriteDates.length}日分を上書きします。続行しますか？`
      )
    ) {
      return;
    }

    setDrafts(current => mergeDrafts(current, result.drafts));
    setCompletionSummary(null);
    setSubmitResult(null);
    setMessage(
      formatBulkAppliedMessage({
        count: result.targetDates.length,
        label: selectedBulkOption.label,
      })
    );
  }

  async function copyPreviousMonth() {
    if (!clinicId || !selectedPeriod) return;

    const previousPeriod = findPreviousShiftRequestPeriod(
      periods,
      selectedPeriod
    );
    if (!previousPeriod) {
      setMessage('コピーできる前回の提出期間が見つかりません');
      return;
    }

    try {
      const [previousRequests, currentRequests] = await Promise.all([
        fetchRequestsForPeriod(previousPeriod.id),
        fetchRequestsForPeriod(selectedPeriod.id),
      ]);
      const currentDays = buildCalendarDays({
        period: selectedPeriod,
        requests: currentRequests,
        drafts,
      });
      const result = copyPreviousRequestsByWeekday({
        currentPeriod: selectedPeriod,
        currentDays,
        previousPeriod,
        previousRequests,
      });
      setRequests(currentRequests);

      if (result.targetDates.length === 0) {
        setMessage('前回からコピーできる希望がありません');
        return;
      }

      if (
        result.overwriteDates.length > 0 &&
        !window.confirm(
          `既存入力のある${result.overwriteDates.length}日分を上書きします。続行しますか？`
        )
      ) {
        return;
      }

      setDrafts(current => mergeDrafts(current, result.drafts));
      setCompletionSummary(null);
      setSubmitResult(null);
      setMessage(
        `前回の希望を${result.targetDates.length}日分コピーしました。提出前に確認してください。`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '前月コピーに失敗しました'
      );
    }
  }

  async function submitDrafts() {
    if (!clinicId || !selectedPeriod || submitDisabledReason || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(`${drafts.length}日分を提出中です`);
    setSubmitResult(null);

    try {
      const freshRequests = await fetchRequestsForPeriod(selectedPeriod.id);
      const freshDays = buildCalendarDays({
        period: selectedPeriod,
        requests: freshRequests,
        drafts,
      });
      const draftByDate = new Map(drafts.map(draft => [draft.date, draft]));
      const targets = freshDays
        .filter(day => draftByDate.has(day.date))
        .map(day => ({ day, draft: draftByDate.get(day.date) }))
        .filter(
          (
            item
          ): item is {
            day: ShiftRequestCalendarDay;
            draft: ShiftRequestDraftDay;
          } => Boolean(item.draft)
        );
      const blockedDates = targets
        .filter(item => !isEditableRequestForSelf(item.day.serverRequest))
        .map(item => item.day.date);
      const blockedDateSet = new Set(blockedDates);
      const submitTargets = targets.filter(
        item => !blockedDateSet.has(item.day.date)
      );

      const results = await runWithConcurrency(submitTargets, 3, async item => {
        const { day, draft } = item;
        if (draft.action === 'clear') {
          if (!day.serverRequest?.id) return;
          await requestJson<ShiftRequestCalendarRequest>(
            `/api/staff/shift-requests/${day.serverRequest.id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clinic_id: clinicId,
                status: 'withdrawn',
              }),
            }
          );
          return;
        }

        if (!draft.request_type || !draft.start_time || !draft.end_time) {
          throw new Error('送信内容が不足しています');
        }

        const body = {
          clinic_id: clinicId,
          period_id: selectedPeriod.id,
          request_type: draft.request_type,
          start_time: draft.start_time,
          end_time: draft.end_time,
          priority: draft.priority,
          status: 'submitted',
          note: draft.note || undefined,
        };

        if (day.serverRequest?.id) {
          await requestJson<ShiftRequestCalendarRequest>(
            `/api/staff/shift-requests/${day.serverRequest.id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clinic_id: clinicId,
                request_type: draft.request_type,
                start_time: draft.start_time,
                end_time: draft.end_time,
                priority: draft.priority,
                status: 'submitted',
                note: draft.note || null,
              }),
            }
          );
        } else {
          await requestJson<ShiftRequestCalendarRequest>(
            '/api/staff/shift-requests',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          );
        }
      });

      const failedDates = submitTargets
        .filter((_, index) => results[index]?.status === 'rejected')
        .map(item => item.day.date);
      const successDates = submitTargets
        .filter((_, index) => results[index]?.status === 'fulfilled')
        .map(item => item.day.date);
      const reloadedRequests = await fetchRequestsForPeriod(selectedPeriod.id);
      setRequests(reloadedRequests);
      const retainedDraftDates = new Set([...failedDates, ...blockedDates]);
      const reloadedDays = buildCalendarDays({
        period: selectedPeriod,
        requests: reloadedRequests,
        drafts: drafts.filter(draft => retainedDraftDates.has(draft.date)),
      });
      const reloadedSummary = summarizeCalendarDays(reloadedDays);

      setDrafts(current =>
        current.filter(draft => retainedDraftDates.has(draft.date))
      );
      setSubmitResult({
        successCount: successDates.length,
        failedDates,
        blockedDates,
      });

      if (failedDates.length > 0 || blockedDates.length > 0) {
        setMessage(
          `${successDates.length}日分は提出済み、${failedDates.length + blockedDates.length}日分は失敗または編集不可です。`
        );
      } else {
        setMessage(
          `${successDates.length}日分を提出しました。未入力: ${reloadedSummary.missingDays}日`
        );
        setCompletionSummary({
          title: `${formatPeriodMonthTitle(selectedPeriod)}を提出しました`,
          submittedDays: successDates.length,
          dayOffDays: reloadedSummary.dayOffDays,
          afternoonDays: reloadedSummary.afternoonDays,
          unavailableDays: reloadedSummary.unavailableDays,
          noteDays: reloadedSummary.noteDays,
          missingDays: reloadedSummary.missingDays,
        });
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '提出に失敗しました'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const customTimeInvalid =
    editor.requestType !== 'missing' &&
    editor.timePreset === 'custom' &&
    !isValidLocalTimeRange(editor.customStart, editor.customEnd);
  const showTimePresets =
    editor.requestType === 'available' || editor.requestType === 'preferred';

  return (
    <div className='space-y-6 pb-28'>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold text-slate-950 dark:text-slate-50'>
            {formatPeriodMonthTitle(selectedPeriod)}
          </h1>
          <p className='mt-1 text-sm text-slate-600'>
            {selectedPeriod
              ? `提出期限: ${formatDeadline(selectedPeriod.submission_deadline)}`
              : '受付中の提出期間を確認しています'}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          onClick={() => void loadAll()}
          disabled={isLoading || isSubmitting}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          更新
        </Button>
      </div>

      {message && (
        <Alert variant='medical-info'>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {(errorMessage || clinicsError) && (
        <Alert variant='medical-error'>
          <AlertTitle>確認が必要です</AlertTitle>
          <AlertDescription>{errorMessage ?? clinicsError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className='gap-3'>
          <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
            <div>
              <CardTitle className='text-base'>提出対象</CardTitle>
              <CardDescription>
                入力済み {summary.enteredDays}/{summary.totalDays}日 / 未入力{' '}
                {summary.missingDays}日 / 提出準備 {summary.readyRate}%
              </CardDescription>
            </div>
            <div className='grid gap-2 sm:grid-cols-2'>
              <select
                className='h-10 rounded-md border border-slate-300 bg-white px-3 text-sm'
                value={clinicId ?? ''}
                onChange={event => setSelectedClinicId(event.target.value)}
                disabled={
                  clinicsLoading || clinics.length === 0 || isSubmitting
                }
                aria-label='院を選択'
              >
                {clinics.map(clinic => (
                  <option key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </option>
                ))}
              </select>
              <select
                className='h-10 rounded-md border border-slate-300 bg-white px-3 text-sm'
                value={selectedPeriodId}
                onChange={event => setSelectedPeriodId(event.target.value)}
                disabled={periods.length === 0 || isSubmitting}
                aria-label='提出期間を選択'
              >
                <option value=''>提出期間なし</option>
                {periods.map(period => (
                  <option key={period.id} value={period.id}>
                    {period.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {alerts.slice(0, 2).map(alert => (
            <Alert
              key={`${alert.priority}:${alert.title}`}
              variant={
                alert.tone === 'danger' ? 'medical-error' : 'medical-warning'
              }
            >
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.description}</AlertDescription>
            </Alert>
          ))}

          <div className='grid gap-2 md:grid-cols-[1fr_auto]'>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => void copyPreviousMonth()}
                disabled={!editability.canEdit || isSubmitting}
              >
                <Copy className='mr-2 h-4 w-4' />
                前月コピー
              </Button>
              <Button
                type='button'
                variant={showMissingOnly ? 'secondary' : 'outline'}
                onClick={() => setShowMissingOnly(current => !current)}
              >
                未入力だけ表示
              </Button>
            </div>
            <div className='grid gap-2 sm:grid-cols-[auto_auto_auto]'>
              <select
                className='h-10 rounded-md border border-slate-300 bg-white px-3 text-sm'
                value={bulkWeekday}
                onChange={event => setBulkWeekday(Number(event.target.value))}
                disabled={!editability.canEdit || isSubmitting}
                aria-label='曜日一括の曜日'
              >
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    毎週{label}曜
                  </option>
                ))}
              </select>
              <select
                className='h-10 rounded-md border border-slate-300 bg-white px-3 text-sm'
                value={bulkPresetValue}
                onChange={event => setBulkPresetValue(event.target.value)}
                disabled={!editability.canEdit || isSubmitting}
                aria-label='曜日一括の希望'
              >
                {BULK_REQUEST_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                type='button'
                variant='outline'
                onClick={applyWeekdayBulk}
                disabled={!editability.canEdit || isSubmitting}
              >
                <Wand2 className='mr-2 h-4 w-4' />
                曜日一括
              </Button>
            </div>
          </div>

          <div className='grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500'>
            {['月', '火', '水', '木', '金', '土', '日'].map(label => (
              <div key={label}>{label}</div>
            ))}
          </div>
          <div className='grid grid-cols-7 gap-1'>
            {Array.from({ length: leadingBlankCells }, (_, index) => (
              <div key={`blank-${index}`} aria-hidden='true' />
            ))}
            {visibleDays.map(day => (
              <button
                key={day.date}
                type='button'
                className={cn(
                  'min-h-12 rounded-md border p-1 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
                  'hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-70',
                  getDayButtonClass(day)
                )}
                onClick={() => openDayEditor(day)}
                disabled={!day.isEditable || isSubmitting}
                aria-label={day.ariaLabel}
              >
                <span className='block text-xs font-medium'>
                  {day.dayNumber}
                </span>
                <span className='mt-1 inline-flex min-w-7 items-center justify-center rounded-full bg-white/80 px-1.5 text-xs font-semibold'>
                  {day.badgeLabel}
                </span>
                <span className='sr-only'>{day.badgeDescription}</span>
                {day.isDirty && (
                  <span className='mt-1 block text-[10px] font-medium'>
                    変更あり
                  </span>
                )}
                {day.hasNote && (
                  <span className='mt-1 block text-[10px] font-medium'>
                    メモ
                  </span>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>提出前サマリー</CardTitle>
          <CardDescription>
            未入力や未保存の変更を確認してから提出します。
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
          {[
            ['休み希望', summary.dayOffDays],
            ['出勤可能', summary.availableDays],
            ['優先希望', summary.preferredDays],
            ['午前のみ', summary.morningDays],
            ['午後から', summary.afternoonDays],
            ['出勤不可', summary.unavailableDays],
            ['未入力', summary.missingDays],
            ['メモあり', summary.noteDays],
            ['未保存の変更', summary.dirtyDays],
            ['差戻し', summary.rejectedDays],
          ].map(([label, value]) => (
            <div
              key={label}
              className='rounded-md border border-slate-200 px-3 py-2'
            >
              <div className='text-xs text-slate-500'>{label}</div>
              <div className='text-lg font-semibold text-slate-950'>
                {value}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {submitResult &&
        (submitResult.failedDates.length > 0 ||
          submitResult.blockedDates.length > 0) && (
          <Alert variant='medical-warning'>
            <AlertTitle>一部の日付を提出できませんでした</AlertTitle>
            <AlertDescription>
              成功: {submitResult.successCount}日 / 失敗:{' '}
              {formatFailureDates(days, submitResult.failedDates)} / 編集不可:{' '}
              {formatFailureDates(days, submitResult.blockedDates)}
            </AlertDescription>
          </Alert>
        )}

      {completionSummary && (
        <Card>
          <CardHeader>
            <div className='flex items-center gap-2'>
              <CheckCircle2 className='h-5 w-5 text-emerald-600' />
              <CardTitle className='text-base'>
                {completionSummary.title}
              </CardTitle>
            </div>
            <CardDescription>次の状態: マネージャー確認待ち</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-2 sm:grid-cols-3'>
            <Badge variant='secondary'>
              提出済み: {completionSummary.submittedDays}日
            </Badge>
            <Badge variant='secondary'>
              休み希望: {completionSummary.dayOffDays}日
            </Badge>
            <Badge variant='secondary'>
              午後から可: {completionSummary.afternoonDays}日
            </Badge>
            <Badge variant='secondary'>
              出勤不可: {completionSummary.unavailableDays}日
            </Badge>
            <Badge variant='secondary'>
              メモあり: {completionSummary.noteDays}件
            </Badge>
            <Badge variant='secondary'>
              未入力: {completionSummary.missingDays}日
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className='sticky bottom-16 z-30 rounded-lg border bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-4'>
        {summary.missingDays > 0 && (
          <p className='mb-2 text-xs text-amber-700'>
            未入力が{summary.missingDays}
            日あります。未入力日は希望なしとして扱われる可能性があります。
          </p>
        )}
        {submitDisabledReason && (
          <p className='mb-2 text-xs text-slate-600'>{submitDisabledReason}</p>
        )}
        <Button
          type='button'
          size='touch'
          className='w-full'
          onClick={() => void submitDrafts()}
          disabled={Boolean(submitDisabledReason)}
        >
          <Send className='mr-2 h-4 w-4' />
          {isSubmitting ? '提出中です' : '提出する'}
        </Button>
      </div>

      <Dialog
        open={Boolean(selectedDay)}
        onOpenChange={open => !open && setSelectedDay(null)}
      >
        <DialogContent className='bottom-0 top-auto max-h-[92vh] translate-y-0 overflow-y-auto rounded-t-lg sm:top-[50%] sm:translate-y-[-50%] sm:rounded-lg'>
          <DialogHeader>
            <DialogTitle>
              {selectedDay
                ? `${formatShortDate(selectedDay.date)} の希望`
                : '希望入力'}
            </DialogTitle>
            <DialogDescription>
              希望種別を選び、必要な時だけ時間とメモを調整します。
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-5'>
            <section className='space-y-2'>
              <div className='text-sm font-medium'>希望</div>
              <div className='grid gap-2 sm:grid-cols-2'>
                {REQUEST_OPTIONS.map(option => (
                  <Button
                    key={option.value}
                    type='button'
                    variant={
                      editor.requestType === option.value
                        ? 'default'
                        : 'outline'
                    }
                    onClick={() =>
                      setEditor(current => ({
                        ...current,
                        requestType: option.value,
                        timePreset:
                          option.value === 'available' ||
                          option.value === 'preferred'
                            ? current.timePreset
                            : 'full_day',
                      }))
                    }
                  >
                    {option.label}
                  </Button>
                ))}
                <Button
                  type='button'
                  variant={
                    editor.requestType === 'missing' ? 'secondary' : 'outline'
                  }
                  onClick={() =>
                    setEditor(current => ({
                      ...current,
                      requestType: 'missing',
                    }))
                  }
                >
                  未入力に戻す
                </Button>
              </div>
            </section>

            {showTimePresets && (
              <section className='space-y-2'>
                <div className='text-sm font-medium'>時間</div>
                <div className='grid gap-2 sm:grid-cols-3'>
                  {SHIFT_REQUEST_TIME_PRESETS.map(preset => (
                    <Button
                      key={preset}
                      type='button'
                      variant={
                        editor.timePreset === preset ? 'default' : 'outline'
                      }
                      onClick={() =>
                        setEditor(current => ({
                          ...current,
                          timePreset: preset,
                        }))
                      }
                    >
                      {getTimePresetLabel(preset)}
                    </Button>
                  ))}
                </div>
                {editor.timePreset === 'custom' && (
                  <div className='grid gap-2 sm:grid-cols-2'>
                    <label
                      htmlFor='shift-request-custom-start'
                      className='space-y-1 text-sm'
                    >
                      <span className='font-medium'>開始</span>
                      <Input
                        id='shift-request-custom-start'
                        type='time'
                        value={editor.customStart}
                        onChange={event =>
                          setEditor(current => ({
                            ...current,
                            customStart: event.target.value,
                          }))
                        }
                        state={customTimeInvalid ? 'error' : 'default'}
                      />
                    </label>
                    <label
                      htmlFor='shift-request-custom-end'
                      className='space-y-1 text-sm'
                    >
                      <span className='font-medium'>終了</span>
                      <Input
                        id='shift-request-custom-end'
                        type='time'
                        value={editor.customEnd}
                        onChange={event =>
                          setEditor(current => ({
                            ...current,
                            customEnd: event.target.value,
                          }))
                        }
                        state={customTimeInvalid ? 'error' : 'default'}
                      />
                    </label>
                    {customTimeInvalid && (
                      <p className='sm:col-span-2 text-sm text-red-700'>
                        終了時刻は開始時刻より後にしてください。
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            <label
              htmlFor='shift-request-note'
              className='block space-y-1 text-sm'
            >
              <span className='font-medium'>メモ</span>
              <Textarea
                id='shift-request-note'
                value={editor.note}
                onChange={event =>
                  setEditor(current => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder='15時以降なら可'
              />
            </label>
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setSelectedDay(null)}
            >
              閉じる
            </Button>
            <Button
              type='button'
              onClick={saveSelectedDay}
              disabled={customTimeInvalid}
            >
              <CalendarDays className='mr-2 h-4 w-4' />
              この日の希望を保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
