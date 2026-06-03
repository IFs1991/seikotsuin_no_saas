'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSelectedClinic } from '@/providers/selected-clinic-context';

type WorkflowMode = 'self' | 'review' | 'manager';
type RequestType = 'available' | 'preferred' | 'unavailable' | 'day_off';
type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'converted';
type PeriodStatus = 'draft' | 'open' | 'closed' | 'finalized' | 'cancelled';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiFailure {
  success: false;
  error: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

interface ShiftRequestPeriod {
  id: string;
  clinic_id: string;
  title: string;
  period_start: string;
  period_end: string;
  submission_deadline: string;
  status: PeriodStatus;
}

interface ShiftRequest {
  id: string;
  clinic_id: string;
  period_id: string;
  staff_id: string;
  request_type: RequestType;
  start_time: string;
  end_time: string;
  priority: number;
  status: RequestStatus;
  note: string | null;
  rejection_reason: string | null;
  converted_shift_id: string | null;
  created_at: string;
}

interface StaffResource {
  id: string;
  name: string;
  type: string;
  isActive?: boolean;
  isBookable?: boolean;
}

interface ShiftRequestsWorkflowProps {
  mode: WorkflowMode;
  title: string;
}

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  available: '勤務可能',
  preferred: '優先希望',
  unavailable: '勤務不可',
  day_off: '休み希望',
};

const STATUS_LABELS: Record<RequestStatus | PeriodStatus, string> = {
  draft: '下書き',
  open: '受付中',
  closed: '締切',
  finalized: '確定済み',
  cancelled: '取消',
  submitted: '提出済み',
  approved: '承認',
  rejected: '差戻し',
  withdrawn: '取下げ',
  converted: '変換済み',
};

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultEndDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function getDefaultDateTime(hour: number) {
  const today = getTodayDate();
  return `${today}T${String(hour).padStart(2, '0')}:00`;
}

function toApiDateTime(localDateTime: string) {
  return new Date(localDateTime).toISOString();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function requestTypeBadgeClass(requestType: RequestType) {
  switch (requestType) {
    case 'available':
      return 'bg-emerald-100 text-emerald-800';
    case 'preferred':
      return 'bg-blue-100 text-blue-800';
    case 'unavailable':
      return 'bg-amber-100 text-amber-800';
    case 'day_off':
      return 'bg-slate-200 text-slate-800';
  }
}

function canConvertRequest(request: ShiftRequest) {
  return (
    request.status === 'approved' &&
    (request.request_type === 'available' ||
      request.request_type === 'preferred')
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as ApiResponse<T>;
  if (payload.success === false) {
    throw new Error(payload.error);
  }
  return payload.data;
}

export function ShiftRequestsWorkflow({
  mode,
  title,
}: ShiftRequestsWorkflowProps) {
  const {
    selectedClinicId,
    setSelectedClinicId,
    clinics,
    clinicsLoading,
    clinicsError,
  } = useSelectedClinic();
  const [periods, setPeriods] = useState<ShiftRequestPeriod[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [resources, setResources] = useState<StaffResource[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<RequestType | ''>('');
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [periodTitle, setPeriodTitle] = useState('');
  const [periodStart, setPeriodStart] = useState(getTodayDate());
  const [periodEnd, setPeriodEnd] = useState(getDefaultEndDate());
  const [deadline, setDeadline] = useState(getDefaultDateTime(18));
  const [staffId, setStaffId] = useState('');
  const [requestType, setRequestType] = useState<RequestType>('available');
  const [startTime, setStartTime] = useState(getDefaultDateTime(9));
  const [endTime, setEndTime] = useState(getDefaultDateTime(18));
  const [priority, setPriority] = useState(3);
  const [note, setNote] = useState('');
  const [rejectionReasons, setRejectionReasons] = useState<
    Record<string, string>
  >({});

  const clinicId = selectedClinicId ?? clinics[0]?.id ?? null;
  const selectedPeriod = useMemo(
    () => periods.find(period => period.id === selectedPeriodId),
    [periods, selectedPeriodId]
  );
  const isSelfMode = mode === 'self';
  const isManagerMode = mode === 'manager';
  const canCreateRequestForSelectedPeriod = selectedPeriod
    ? isSelfMode
      ? selectedPeriod.status === 'open'
      : selectedPeriod.status === 'draft' || selectedPeriod.status === 'open'
    : false;
  const requestDerivedState = useMemo(() => {
    const requestedStaffIds = new Set<string>();
    const convertibleRequestIds = new Set<string>();
    const summary = {
      submitted: 0,
      approved: 0,
      rejected: 0,
      converted: 0,
      constraints: 0,
      missing: 0,
    };

    for (const request of requests) {
      if (request.status !== 'withdrawn') {
        requestedStaffIds.add(request.staff_id);
      }

      if (request.status === 'submitted') summary.submitted += 1;
      if (request.status === 'approved') summary.approved += 1;
      if (request.status === 'rejected') summary.rejected += 1;
      if (request.status === 'converted') summary.converted += 1;
      if (
        request.request_type === 'unavailable' ||
        request.request_type === 'day_off'
      ) {
        summary.constraints += 1;
      }
      if (canConvertRequest(request)) {
        convertibleRequestIds.add(request.id);
      }
    }

    summary.missing = Math.max(0, resources.length - requestedStaffIds.size);

    return { summary, convertibleRequestIds };
  }, [requests, resources]);
  const requestSummary = requestDerivedState.summary;
  const convertibleRequestIds = requestDerivedState.convertibleRequestIds;

  const requestQuery = useMemo(() => {
    if (!clinicId || !selectedPeriodId) {
      return null;
    }

    const params = new URLSearchParams({
      clinic_id: clinicId,
      period_id: selectedPeriodId,
    });
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('request_type', typeFilter);
    return `/api/staff/shift-requests?${params.toString()}`;
  }, [clinicId, selectedPeriodId, statusFilter, typeFilter]);

  const loadPeriods = useCallback(async () => {
    if (!clinicId) {
      setPeriods([]);
      return;
    }

    const params = new URLSearchParams({ clinic_id: clinicId });
    const data = await requestJson<{
      periods: ShiftRequestPeriod[];
      total: number;
    }>(`/api/staff/shift-request-periods?${params.toString()}`);
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
  }, [clinicId]);

  const loadResources = useCallback(async () => {
    if (!clinicId || isSelfMode) {
      setResources([]);
      return;
    }

    const params = new URLSearchParams({ clinic_id: clinicId, type: 'staff' });
    const data = await requestJson<StaffResource[]>(
      `/api/resources?${params.toString()}`
    );
    setResources(data);
    setStaffId(current => current || data[0]?.id || '');
  }, [clinicId, isSelfMode]);

  const loadRequests = useCallback(async () => {
    if (!requestQuery) {
      setRequests([]);
      return;
    }

    const data = await requestJson<{
      requests: ShiftRequest[];
      total: number;
    }>(requestQuery);
    setRequests(data.requests);
    const requestIdSet = new Set(data.requests.map(request => request.id));
    setSelectedRequestIds(current =>
      current.filter(requestId => requestIdSet.has(requestId))
    );
  }, [requestQuery]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      await Promise.all([loadPeriods(), loadResources()]);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '読み込みに失敗しました'
      );
    } finally {
      setIsLoading(false);
    }
  }, [loadPeriods, loadResources]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    setIsLoading(true);
    loadRequests()
      .catch(error => {
        setMessage(
          error instanceof Error
            ? error.message
            : '希望シフトの取得に失敗しました'
        );
      })
      .finally(() => setIsLoading(false));
  }, [loadRequests]);

  async function createPeriod() {
    if (!clinicId) return;

    setIsLoading(true);
    setMessage(null);
    try {
      await requestJson<ShiftRequestPeriod>(
        '/api/staff/shift-request-periods',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: clinicId,
            title: periodTitle || `${periodStart} シフト希望`,
            period_start: periodStart,
            period_end: periodEnd,
            submission_deadline: toApiDateTime(deadline),
          }),
        }
      );
      setPeriodTitle('');
      await loadPeriods();
      setMessage('提出期間を作成しました');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '作成に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }

  async function updatePeriodStatus(status: PeriodStatus) {
    if (!clinicId || !selectedPeriod) return;

    setIsLoading(true);
    setMessage(null);
    try {
      await requestJson<ShiftRequestPeriod>(
        `/api/staff/shift-request-periods/${selectedPeriod.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clinic_id: clinicId, status }),
        }
      );
      await loadPeriods();
      setMessage('提出期間を更新しました');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }

  async function submitRequest() {
    if (!clinicId || !selectedPeriodId) return;

    setIsLoading(true);
    setMessage(null);
    try {
      const body = {
        clinic_id: clinicId,
        period_id: selectedPeriodId,
        staff_id: isSelfMode ? undefined : staffId,
        request_type: requestType,
        start_time: toApiDateTime(startTime),
        end_time: toApiDateTime(endTime),
        priority,
        status: 'submitted',
        note: note || undefined,
      };

      await requestJson<ShiftRequest>('/api/staff/shift-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setNote('');
      await loadRequests();
      setMessage('希望シフトを提出しました');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提出に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }

  async function updateRequestStatus(
    requestId: string,
    status: 'approved' | 'rejected'
  ) {
    if (!clinicId) return;

    setIsLoading(true);
    setMessage(null);
    try {
      await requestJson<ShiftRequest>(
        `/api/staff/shift-requests/${requestId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: clinicId,
            status,
            rejection_reason:
              status === 'rejected' ? rejectionReasons[requestId] : undefined,
          }),
        }
      );
      await loadRequests();
      setMessage(status === 'approved' ? '承認しました' : '差戻しました');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }

  async function convertRequests(mode: 'selected' | 'all_approved') {
    if (!clinicId || !selectedPeriodId) return;

    const requestIds =
      mode === 'selected'
        ? selectedRequestIds.filter(requestId =>
            convertibleRequestIds.has(requestId)
          )
        : undefined;

    setIsLoading(true);
    setMessage(null);
    try {
      await requestJson<{ conversions: unknown[]; total: number }>(
        '/api/staff/shift-requests/convert',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: clinicId,
            period_id: selectedPeriodId,
            request_ids: requestIds,
            mode,
          }),
        }
      );
      setSelectedRequestIds([]);
      await loadRequests();
      setMessage('確定シフトへ変換しました');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '変換に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }

  function toggleRequestSelection(requestId: string) {
    setSelectedRequestIds(current =>
      current.includes(requestId)
        ? current.filter(id => id !== requestId)
        : [...current, requestId]
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold text-slate-950 dark:text-slate-50'>
            {title}
          </h1>
          {selectedPeriod && (
            <p className='mt-1 text-sm text-slate-500'>
              {selectedPeriod.period_start} - {selectedPeriod.period_end}
            </p>
          )}
        </div>
        <Button
          type='button'
          variant='outline'
          onClick={() => void loadAll()}
          disabled={isLoading}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          更新
        </Button>
      </div>

      {message && (
        <div className='rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700'>
          {message}
        </div>
      )}
      {clinicsError && (
        <div className='rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
          {clinicsError}
        </div>
      )}

      <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]'>
        <div className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>対象</CardTitle>
              <CardDescription>Clinic と提出期間</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 md:grid-cols-2'>
              <label className='space-y-1 text-sm'>
                <span className='font-medium'>Clinic</span>
                <select
                  className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'
                  value={clinicId ?? ''}
                  onChange={event => setSelectedClinicId(event.target.value)}
                  disabled={clinicsLoading || clinics.length === 0}
                >
                  {clinics.map(clinic => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className='space-y-1 text-sm'>
                <span className='font-medium'>提出期間</span>
                <select
                  className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'
                  value={selectedPeriodId}
                  onChange={event => setSelectedPeriodId(event.target.value)}
                >
                  <option value=''>未選択</option>
                  {periods.map(period => (
                    <option key={period.id} value={period.id}>
                      {period.title} / {STATUS_LABELS[period.status]}
                    </option>
                  ))}
                </select>
              </label>
            </CardContent>
          </Card>

          {!isSelfMode && (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>提出期間作成</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-5'>
                <Input
                  value={periodTitle}
                  onChange={event => setPeriodTitle(event.target.value)}
                  placeholder='2026年7月シフト希望'
                />
                <Input
                  type='date'
                  value={periodStart}
                  onChange={event => setPeriodStart(event.target.value)}
                />
                <Input
                  type='date'
                  value={periodEnd}
                  onChange={event => setPeriodEnd(event.target.value)}
                />
                <Input
                  type='datetime-local'
                  value={deadline}
                  onChange={event => setDeadline(event.target.value)}
                />
                <Button type='button' onClick={() => void createPeriod()}>
                  <CalendarDays className='mr-2 h-4 w-4' />
                  作成
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className='text-base'>希望シフト</CardTitle>
              <CardDescription>
                {requests.length}件 / {selectedPeriod?.title ?? '期間未選択'}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex flex-col gap-2 md:flex-row'>
                <select
                  className='h-10 rounded-md border border-slate-300 bg-white px-3 text-sm'
                  value={statusFilter}
                  onChange={event =>
                    setStatusFilter(event.target.value as RequestStatus | '')
                  }
                >
                  <option value=''>全ステータス</option>
                  <option value='submitted'>提出済み</option>
                  <option value='approved'>承認</option>
                  <option value='rejected'>差戻し</option>
                  <option value='converted'>変換済み</option>
                </select>
                <select
                  className='h-10 rounded-md border border-slate-300 bg-white px-3 text-sm'
                  value={typeFilter}
                  onChange={event =>
                    setTypeFilter(event.target.value as RequestType | '')
                  }
                >
                  <option value=''>全種別</option>
                  {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {isManagerMode && (
                  <div className='flex gap-2 md:ml-auto'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => void convertRequests('selected')}
                      disabled={selectedRequestIds.length === 0 || isLoading}
                    >
                      <ShieldCheck className='mr-2 h-4 w-4' />
                      選択変換
                    </Button>
                    <Button
                      type='button'
                      onClick={() => void convertRequests('all_approved')}
                      disabled={isLoading}
                    >
                      <ShieldCheck className='mr-2 h-4 w-4' />
                      承認済み変換
                    </Button>
                  </div>
                )}
              </div>

              {!isSelfMode && (
                <div className='grid gap-2 sm:grid-cols-3 xl:grid-cols-6'>
                  {[
                    ['提出済み', requestSummary.submitted],
                    ['未提出', requestSummary.missing],
                    ['承認', requestSummary.approved],
                    ['差戻し', requestSummary.rejected],
                    ['変換済み', requestSummary.converted],
                    ['制約', requestSummary.constraints],
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
                </div>
              )}

              <div className='overflow-x-auto'>
                <table className='w-full min-w-[820px] text-sm'>
                  <thead>
                    <tr className='border-b text-left text-slate-500'>
                      {isManagerMode && <th className='w-10 py-2'></th>}
                      <th className='py-2'>種別</th>
                      <th className='py-2'>時間</th>
                      <th className='py-2'>優先度</th>
                      <th className='py-2'>状態</th>
                      <th className='py-2'>メモ</th>
                      {!isSelfMode && <th className='py-2'>レビュー</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(request => (
                      <tr key={request.id} className='border-b align-top'>
                        {isManagerMode && (
                          <td className='py-3'>
                            <input
                              type='checkbox'
                              checked={selectedRequestIds.includes(request.id)}
                              disabled={!canConvertRequest(request)}
                              onChange={() =>
                                toggleRequestSelection(request.id)
                              }
                            />
                          </td>
                        )}
                        <td className='py-3'>
                          <Badge
                            className={requestTypeBadgeClass(
                              request.request_type
                            )}
                          >
                            {REQUEST_TYPE_LABELS[request.request_type]}
                          </Badge>
                        </td>
                        <td className='py-3'>
                          {formatDateTime(request.start_time)} -{' '}
                          {formatDateTime(request.end_time)}
                        </td>
                        <td className='py-3'>{request.priority}</td>
                        <td className='py-3'>
                          {STATUS_LABELS[request.status]}
                        </td>
                        <td className='max-w-[240px] py-3 text-slate-600'>
                          {request.note ?? request.rejection_reason ?? ''}
                        </td>
                        {!isSelfMode && (
                          <td className='space-y-2 py-3'>
                            <div className='flex gap-2'>
                              <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                onClick={() =>
                                  void updateRequestStatus(
                                    request.id,
                                    'approved'
                                  )
                                }
                                disabled={request.status !== 'submitted'}
                              >
                                <Check className='h-4 w-4' />
                              </Button>
                              <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                onClick={() =>
                                  void updateRequestStatus(
                                    request.id,
                                    'rejected'
                                  )
                                }
                                disabled={request.status !== 'submitted'}
                              >
                                <X className='h-4 w-4' />
                              </Button>
                            </div>
                            <Input
                              value={rejectionReasons[request.id] ?? ''}
                              onChange={event =>
                                setRejectionReasons(current => ({
                                  ...current,
                                  [request.id]: event.target.value,
                                }))
                              }
                              placeholder='差戻し理由'
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>提出</CardTitle>
            <CardDescription>
              {isSelfMode ? '本人分' : '代理入力'}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {!isSelfMode && (
              <label className='space-y-1 text-sm'>
                <span className='font-medium'>スタッフ</span>
                <select
                  className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'
                  value={staffId}
                  onChange={event => setStaffId(event.target.value)}
                >
                  {resources.map(resource => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className='space-y-1 text-sm'>
              <span className='font-medium'>種別</span>
              <select
                className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'
                value={requestType}
                onChange={event =>
                  setRequestType(event.target.value as RequestType)
                }
              >
                {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              type='datetime-local'
              value={startTime}
              onChange={event => setStartTime(event.target.value)}
            />
            <Input
              type='datetime-local'
              value={endTime}
              onChange={event => setEndTime(event.target.value)}
            />
            <label className='space-y-1 text-sm'>
              <span className='font-medium'>優先度: {priority}</span>
              <input
                type='range'
                min='1'
                max='5'
                value={priority}
                className='w-full'
                onChange={event => setPriority(Number(event.target.value))}
              />
            </label>
            <Input
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder='メモ'
            />
            <Button
              type='button'
              className='w-full'
              onClick={() => void submitRequest()}
              disabled={
                !clinicId ||
                !selectedPeriodId ||
                !canCreateRequestForSelectedPeriod ||
                (!isSelfMode && !staffId) ||
                isLoading
              }
            >
              <Send className='mr-2 h-4 w-4' />
              提出
            </Button>

            {!isSelfMode && selectedPeriod && (
              <div className='grid grid-cols-2 gap-2 pt-3'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => void updatePeriodStatus('open')}
                  disabled={selectedPeriod.status !== 'draft'}
                >
                  受付開始
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => void updatePeriodStatus('closed')}
                  disabled={selectedPeriod.status !== 'open'}
                >
                  締切
                </Button>
                {isManagerMode && (
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => void updatePeriodStatus('finalized')}
                    disabled={selectedPeriod.status !== 'closed'}
                  >
                    確定
                  </Button>
                )}
                {isManagerMode && (
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => void updatePeriodStatus('cancelled')}
                    disabled={
                      selectedPeriod.status === 'finalized' ||
                      selectedPeriod.status === 'cancelled'
                    }
                  >
                    取消
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
