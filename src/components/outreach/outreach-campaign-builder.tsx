'use client';

import React from 'react';
import {
  ClipboardList,
  Edit3,
  Send,
  Search,
  AlertTriangle,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type {
  DormantCandidate,
  DormantCandidatesResponse,
  OutreachCampaignsResponse,
  OutreachCampaignSummary,
  OutreachDraftResponse,
  OutreachSendResponse,
} from '@/lib/outreach';

export type OutreachClinicOption = {
  id: string;
  name: string;
};

type OutreachCampaignBuilderProps = {
  initialClinicId: string | null;
  clinics?: OutreachClinicOption[];
};

type StepId = 'segment' | 'review' | 'message' | 'confirm' | 'done';

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error: string;
};

type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

type AccessibleClinicsResponse = {
  clinics: OutreachClinicOption[];
  currentClinicId: string | null;
};

const STEP_ITEMS: Array<{
  id: StepId;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'segment', label: '抽出', icon: Search },
  { id: 'review', label: '確認', icon: Users },
  { id: 'message', label: '文面', icon: Edit3 },
  { id: 'confirm', label: '最終確認', icon: ClipboardList },
  { id: 'done', label: '配信', icon: Send },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readErrorMessage(value: unknown): string {
  if (isRecord(value) && typeof value.error === 'string') {
    return value.error;
  }
  return '処理に失敗しました';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumberOrNull(value: unknown): value is number | null {
  return typeof value === 'number' || value === null;
}

function isClinicOption(value: unknown): value is OutreachClinicOption {
  return isRecord(value) && isString(value.id) && isString(value.name);
}

function isAccessibleClinicsResponse(
  value: unknown
): value is AccessibleClinicsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.clinics) &&
    value.clinics.every(isClinicOption) &&
    (isString(value.currentClinicId) || value.currentClinicId === null)
  );
}

function isDormantCandidate(value: unknown): value is DormantCandidate {
  return (
    isRecord(value) &&
    isString(value.customer_id) &&
    isString(value.name) &&
    isString(value.last_visit_date) &&
    typeof value.days_since_last_visit === 'number' &&
    isNumberOrNull(value.total_visits) &&
    isNumberOrNull(value.lifetime_value) &&
    (isString(value.line_display_name) || value.line_display_name === null) &&
    typeof value.line_delivery_warning === 'boolean'
  );
}

function isDormantCandidatesResponse(
  value: unknown
): value is DormantCandidatesResponse {
  return (
    isRecord(value) &&
    isString(value.clinic_id) &&
    typeof value.days_from === 'number' &&
    typeof value.days_to === 'number' &&
    isString(value.date_from) &&
    isString(value.date_to) &&
    typeof value.max_recipients === 'number' &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isDormantCandidate)
  );
}

function isOutreachDraftResponse(
  value: unknown
): value is OutreachDraftResponse {
  return (
    isRecord(value) &&
    isString(value.campaign_id) &&
    value.status === 'draft' &&
    typeof value.selected_count === 'number' &&
    isString(value.created_at)
  );
}

function isOutreachCampaignSummary(
  value: unknown
): value is OutreachCampaignSummary {
  return (
    isRecord(value) &&
    isString(value.campaign_id) &&
    isString(value.name) &&
    isString(value.status) &&
    isString(value.message_body) &&
    isString(value.created_at) &&
    (isString(value.sent_at) || value.sent_at === null) &&
    typeof value.selected_count === 'number' &&
    typeof value.sent_count === 'number' &&
    typeof value.delivered_count === 'number' &&
    typeof value.booked_count === 'number' &&
    typeof value.visited_count === 'number'
  );
}

function isOutreachCampaignsResponse(
  value: unknown
): value is OutreachCampaignsResponse {
  return (
    isRecord(value) &&
    isString(value.clinic_id) &&
    Array.isArray(value.campaigns) &&
    value.campaigns.every(isOutreachCampaignSummary)
  );
}

function isOutreachSendResponse(value: unknown): value is OutreachSendResponse {
  return (
    isRecord(value) &&
    isString(value.campaign_id) &&
    value.status === 'sent' &&
    typeof value.enqueued_count === 'number' &&
    isString(value.sent_at)
  );
}

function isApiSuccess<T>(value: ApiEnvelope<T>): value is ApiSuccess<T> {
  return value.success === true;
}

async function readApiEnvelope<T>(
  response: Response,
  isData: (value: unknown) => value is T
): Promise<ApiEnvelope<T>> {
  const payload: unknown = await response.json();
  if (
    isRecord(payload) &&
    payload.success === true &&
    'data' in payload &&
    isData(payload.data)
  ) {
    return {
      success: true,
      data: payload.data,
    };
  }

  return {
    success: false,
    error: readErrorMessage(payload),
  };
}

function buildQuery(params: {
  clinicId: string;
  daysFrom: number;
  daysTo: number;
}) {
  const searchParams = new URLSearchParams({
    clinic_id: params.clinicId,
    days_from: String(params.daysFrom),
    days_to: String(params.daysTo),
  });
  return `/api/outreach/dormant-candidates?${searchParams.toString()}`;
}

function buildCampaignsQuery(clinicId: string) {
  const searchParams = new URLSearchParams({ clinic_id: clinicId });
  return `/api/outreach/campaigns?${searchParams.toString()}`;
}

function uniqueClinics(
  clinics: readonly OutreachClinicOption[]
): OutreachClinicOption[] {
  const byId = new Map<string, OutreachClinicOption>();
  for (const clinic of clinics) {
    byId.set(clinic.id, clinic);
  }
  return Array.from(byId.values());
}

function hasUnsupportedVariables(message: string): boolean {
  const matches = message.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g);
  for (const match of matches) {
    if (match[1]?.trim() !== 'name') {
      return true;
    }
  }
  return false;
}

function replaceNameToken(message: string, name: string): string {
  return message.replace(/\{\{\s*name\s*\}\}/g, name);
}

export function OutreachCampaignBuilder({
  initialClinicId,
  clinics = [],
}: OutreachCampaignBuilderProps) {
  const [clinicOptions, setClinicOptions] =
    React.useState<OutreachClinicOption[]>(clinics);
  const [clinicId, setClinicId] = React.useState(initialClinicId ?? '');
  const [daysFrom, setDaysFrom] = React.useState('60');
  const [daysTo, setDaysTo] = React.useState('120');
  const [step, setStep] = React.useState<StepId>('segment');
  const [candidates, setCandidates] = React.useState<DormantCandidate[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const [campaignName, setCampaignName] = React.useState('');
  const [messageBody, setMessageBody] = React.useState(
    '{{name}}さん、前回のご来院から少し期間が空いています。お身体の状態確認にぜひご予約ください。'
  );
  const [draftResult, setDraftResult] =
    React.useState<OutreachDraftResponse | null>(null);
  const [sendResult, setSendResult] =
    React.useState<OutreachSendResponse | null>(null);
  const [campaigns, setCampaigns] = React.useState<OutreachCampaignSummary[]>(
    []
  );
  const [campaignsLoading, setCampaignsLoading] = React.useState(false);
  const [sendingCampaignId, setSendingCampaignId] = React.useState<
    string | null
  >(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (clinics.length > 0) {
      setClinicOptions(uniqueClinics(clinics));
      return;
    }

    let cancelled = false;

    async function fetchAccessibleClinics() {
      try {
        const response = await fetch('/api/clinics/accessible', {
          cache: 'no-store',
        });
        const envelope = await readApiEnvelope(
          response,
          isAccessibleClinicsResponse
        );
        if (!cancelled && isApiSuccess(envelope)) {
          setClinicOptions(envelope.data.clinics);
          setClinicId(
            current =>
              current ||
              envelope.data.currentClinicId ||
              envelope.data.clinics[0]?.id ||
              ''
          );
        }
      } catch {
        if (!cancelled && initialClinicId) {
          setClinicOptions([{ id: initialClinicId, name: '選択中の院' }]);
        }
      }
    }

    void fetchAccessibleClinics();

    return () => {
      cancelled = true;
    };
  }, [clinics, initialClinicId]);

  React.useEffect(() => {
    if (!clinicId && initialClinicId) {
      setClinicId(initialClinicId);
    }
  }, [clinicId, initialClinicId]);

  const refreshCampaigns = React.useCallback(async () => {
    if (!clinicId) {
      setCampaigns([]);
      return;
    }

    setCampaignsLoading(true);
    try {
      const response = await fetch(buildCampaignsQuery(clinicId), {
        cache: 'no-store',
      });
      const envelope = await readApiEnvelope(
        response,
        isOutreachCampaignsResponse
      );
      if (!isApiSuccess(envelope)) {
        throw new Error(envelope.error);
      }

      setCampaigns(envelope.data.campaigns);
    } catch {
      setCampaigns([]);
    } finally {
      setCampaignsLoading(false);
    }
  }, [clinicId]);

  React.useEffect(() => {
    void refreshCampaigns();
  }, [refreshCampaigns]);

  const selectedCandidates = React.useMemo(
    () =>
      candidates.filter(candidate => selectedIds.has(candidate.customer_id)),
    [candidates, selectedIds]
  );

  const parsedDaysFrom = Number(daysFrom);
  const parsedDaysTo = Number(daysTo);
  const canFetchCandidates =
    clinicId.length > 0 &&
    Number.isInteger(parsedDaysFrom) &&
    Number.isInteger(parsedDaysTo) &&
    parsedDaysFrom >= 1 &&
    parsedDaysTo >= parsedDaysFrom;
  const canCreateDraft =
    selectedCandidates.length > 0 &&
    campaignName.trim().length > 0 &&
    messageBody.trim().length > 0 &&
    !hasUnsupportedVariables(messageBody);

  const fetchCandidates = React.useCallback(async () => {
    if (!canFetchCandidates) {
      setError('抽出条件を確認してください');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        buildQuery({
          clinicId,
          daysFrom: parsedDaysFrom,
          daysTo: parsedDaysTo,
        }),
        { cache: 'no-store' }
      );
      const envelope = await readApiEnvelope(
        response,
        isDormantCandidatesResponse
      );
      if (!isApiSuccess(envelope)) {
        throw new Error(envelope.error);
      }

      setCandidates(envelope.data.candidates);
      setSelectedIds(
        new Set(
          envelope.data.candidates.map(candidate => candidate.customer_id)
        )
      );
      setCampaignName(
        `休眠患者再来促進 ${envelope.data.days_from}-${envelope.data.days_to}日`
      );
      setStep('review');
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : '休眠候補の取得に失敗しました'
      );
    } finally {
      setLoading(false);
    }
  }, [canFetchCandidates, clinicId, parsedDaysFrom, parsedDaysTo]);

  const toggleCandidate = React.useCallback((customerId: string) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  }, []);

  const createDraft = React.useCallback(async () => {
    if (!canCreateDraft) {
      setError('下書き作成の入力内容を確認してください');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/outreach/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          name: campaignName.trim(),
          days_from: parsedDaysFrom,
          days_to: parsedDaysTo,
          message_body: messageBody.trim(),
          customer_ids: selectedCandidates.map(
            candidate => candidate.customer_id
          ),
        }),
      });
      const envelope = await readApiEnvelope(response, isOutreachDraftResponse);
      if (!isApiSuccess(envelope)) {
        throw new Error(envelope.error);
      }

      setDraftResult(envelope.data);
      setSendResult(null);
      await refreshCampaigns();
      setStep('done');
    } catch (draftError) {
      setError(
        draftError instanceof Error
          ? draftError.message
          : 'キャンペーン下書きの作成に失敗しました'
      );
    } finally {
      setLoading(false);
    }
  }, [
    campaignName,
    canCreateDraft,
    clinicId,
    messageBody,
    parsedDaysFrom,
    parsedDaysTo,
    refreshCampaigns,
    selectedCandidates,
  ]);

  const sendCampaign = React.useCallback(
    async (campaignId: string) => {
      if (!clinicId) {
        setError('院を選択してください');
        return;
      }

      setSendingCampaignId(campaignId);
      setError(null);
      try {
        const response = await fetch(
          `/api/outreach/campaigns/${encodeURIComponent(campaignId)}/send`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clinic_id: clinicId }),
          }
        );
        const envelope = await readApiEnvelope(
          response,
          isOutreachSendResponse
        );
        if (!isApiSuccess(envelope)) {
          throw new Error(envelope.error);
        }

        setSendResult(envelope.data);
        await refreshCampaigns();
      } catch (sendError) {
        setError(
          sendError instanceof Error
            ? sendError.message
            : 'キャンペーン配信に失敗しました'
        );
      } finally {
        setSendingCampaignId(null);
      }
    },
    [clinicId, refreshCampaigns]
  );

  const previewName = selectedCandidates[0]?.name ?? '患者名';
  const previewText = replaceNameToken(messageBody, previewName);

  return (
    <div className='space-y-4'>
      <Card className='bg-card'>
        <CardHeader>
          <CardTitle>再来促進</CardTitle>
          <CardDescription>
            休眠患者を抽出し、LINE配信前のキャンペーン下書きを作成します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-5'>
            {STEP_ITEMS.map(item => {
              const Icon = item.icon;
              const active = item.id === step;
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-center gap-2 rounded border px-3 py-2 text-sm ${
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  <Icon className='h-4 w-4' aria-hidden='true' />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div
          role='alert'
          className='rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'
        >
          {error}
        </div>
      )}

      {step === 'segment' && (
        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>セグメント抽出</CardTitle>
            <CardDescription>
              最終来院日が指定範囲に入るLINE連携済み患者を抽出します。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
              <label className='flex flex-col gap-2 text-sm font-medium'>
                院
                <select
                  className='h-10 rounded border border-border bg-background px-3 text-sm'
                  value={clinicId}
                  onChange={event => setClinicId(event.target.value)}
                >
                  <option value=''>院を選択</option>
                  {clinicOptions.map(clinic => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-2 text-sm font-medium'>
                経過日数 from
                <input
                  type='number'
                  min='1'
                  className='h-10 rounded border border-border bg-background px-3 text-sm'
                  value={daysFrom}
                  onChange={event => setDaysFrom(event.target.value)}
                />
              </label>
              <label className='flex flex-col gap-2 text-sm font-medium'>
                経過日数 to
                <input
                  type='number'
                  min='1'
                  className='h-10 rounded border border-border bg-background px-3 text-sm'
                  value={daysTo}
                  onChange={event => setDaysTo(event.target.value)}
                />
              </label>
            </div>
            <Button
              onClick={fetchCandidates}
              disabled={loading || !canFetchCandidates}
              className='bg-blue-600 text-white'
            >
              <Search className='mr-2 h-4 w-4' aria-hidden='true' />
              候補を抽出
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'review' && (
        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>対象患者確認</CardTitle>
            <CardDescription>
              {candidates.length.toLocaleString()}名中
              {selectedCandidates.length.toLocaleString()}名を選択中です。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {candidates.length === 0 ? (
              <div className='rounded border border-border bg-background p-4 text-sm text-muted-foreground'>
                条件に一致する患者はいません。
              </div>
            ) : (
              <div className='max-h-[420px] overflow-auto rounded border border-border'>
                {candidates.map(candidate => {
                  const selected = selectedIds.has(candidate.customer_id);
                  return (
                    <label
                      key={candidate.customer_id}
                      className='flex items-start gap-3 border-b border-border p-3 last:border-b-0'
                    >
                      <input
                        type='checkbox'
                        className='mt-1 h-4 w-4'
                        checked={selected}
                        onChange={() => toggleCandidate(candidate.customer_id)}
                      />
                      <span className='min-w-0 flex-1'>
                        <span className='block font-medium'>
                          {candidate.name}
                        </span>
                        <span className='block text-sm text-muted-foreground'>
                          最終来院: {candidate.last_visit_date} / 経過:
                          {candidate.days_since_last_visit.toLocaleString()}日
                        </span>
                        {candidate.line_delivery_warning && (
                          <span className='mt-1 inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800'>
                            <AlertTriangle
                              className='h-3 w-3'
                              aria-hidden='true'
                            />
                            LINE送信失敗が続いています
                          </span>
                        )}
                      </span>
                      {!selected && (
                        <span className='inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground'>
                          <X className='h-3 w-3' aria-hidden='true' />
                          除外
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' onClick={() => setStep('segment')}>
                戻る
              </Button>
              <Button
                onClick={() => setStep('message')}
                disabled={selectedCandidates.length === 0}
                className='bg-blue-600 text-white'
              >
                文面入力へ
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'message' && (
        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>文面入力</CardTitle>
            <CardDescription>
              使用できる置換変数は {'{{name}}'} のみです。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <label className='flex flex-col gap-2 text-sm font-medium'>
              キャンペーン名
              <input
                className='h-10 rounded border border-border bg-background px-3 text-sm'
                value={campaignName}
                maxLength={120}
                onChange={event => setCampaignName(event.target.value)}
              />
            </label>
            <label className='flex flex-col gap-2 text-sm font-medium'>
              本文
              <textarea
                className='min-h-[180px] rounded border border-border bg-background px-3 py-2 text-sm'
                value={messageBody}
                maxLength={2000}
                onChange={event => setMessageBody(event.target.value)}
              />
            </label>
            {hasUnsupportedVariables(messageBody) && (
              <p className='text-sm text-red-600'>
                {'{{name}}'} 以外の置換変数は使用できません。
              </p>
            )}
            <div className='rounded border border-border bg-background p-4 text-sm'>
              <p className='mb-2 font-medium'>プレビュー</p>
              <p className='whitespace-pre-wrap text-muted-foreground'>
                {previewText}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' onClick={() => setStep('review')}>
                戻る
              </Button>
              <Button
                onClick={() => setStep('confirm')}
                disabled={!canCreateDraft}
                className='bg-blue-600 text-white'
              >
                確認へ
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'confirm' && (
        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>確認</CardTitle>
            <CardDescription>
              下書きを作成後、配信権限のあるユーザーがLINE
              outboxへ配信できます。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <dl className='grid grid-cols-1 gap-3 text-sm sm:grid-cols-2'>
              <div className='rounded border border-border p-3'>
                <dt className='text-muted-foreground'>キャンペーン名</dt>
                <dd className='mt-1 font-medium'>{campaignName}</dd>
              </div>
              <div className='rounded border border-border p-3'>
                <dt className='text-muted-foreground'>対象者</dt>
                <dd className='mt-1 font-medium'>
                  {selectedCandidates.length.toLocaleString()}名
                </dd>
              </div>
              <div className='rounded border border-border p-3'>
                <dt className='text-muted-foreground'>休眠範囲</dt>
                <dd className='mt-1 font-medium'>
                  {parsedDaysFrom.toLocaleString()}-
                  {parsedDaysTo.toLocaleString()}日
                </dd>
              </div>
              <div className='rounded border border-border p-3'>
                <dt className='text-muted-foreground'>状態</dt>
                <dd className='mt-1 font-medium'>draft</dd>
              </div>
            </dl>
            <div className='rounded border border-border bg-background p-4 text-sm'>
              <p className='mb-2 font-medium'>本文</p>
              <p className='whitespace-pre-wrap text-muted-foreground'>
                {messageBody}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' onClick={() => setStep('message')}>
                戻る
              </Button>
              <Button
                onClick={createDraft}
                disabled={loading || !canCreateDraft}
                className='bg-blue-600 text-white'
              >
                下書きを作成
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'done' && draftResult && (
        <Card className='bg-card'>
          <CardHeader>
            <CardTitle>下書き作成完了</CardTitle>
            <CardDescription>
              配信実行するとLINE outboxへ投入され、既存cronが送信します。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <p>
              キャンペーンID:{' '}
              <span className='font-mono'>{draftResult.campaign_id}</span>
            </p>
            <p>対象者: {draftResult.selected_count.toLocaleString()}名</p>
            <p>
              状態:{' '}
              {sendResult?.campaign_id === draftResult.campaign_id
                ? sendResult.status
                : draftResult.status}
            </p>
            {sendResult?.campaign_id === draftResult.campaign_id && (
              <div className='rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-800'>
                LINE outboxへ
                {sendResult.enqueued_count.toLocaleString()}件投入しました。
              </div>
            )}
            <div className='flex flex-wrap gap-2'>
              <Button
                onClick={() => sendCampaign(draftResult.campaign_id)}
                disabled={
                  sendingCampaignId === draftResult.campaign_id ||
                  sendResult?.campaign_id === draftResult.campaign_id
                }
                className='bg-blue-600 text-white'
              >
                <Send className='mr-2 h-4 w-4' aria-hidden='true' />
                配信実行
              </Button>
              <Button
                variant='outline'
                onClick={() => {
                  setStep('segment');
                  setCandidates([]);
                  setSelectedIds(new Set());
                  setDraftResult(null);
                  setSendResult(null);
                }}
              >
                新しい下書きを作成
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className='bg-card'>
        <CardHeader>
          <CardTitle>キャンペーン一覧</CardTitle>
          <CardDescription>
            送信数、到達数、予約数、来院数をキャンペーン別に確認します。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {campaignsLoading ? (
            <div className='rounded border border-border bg-background p-4 text-sm text-muted-foreground'>
              キャンペーンを読み込み中です。
            </div>
          ) : campaigns.length === 0 ? (
            <div className='rounded border border-border bg-background p-4 text-sm text-muted-foreground'>
              まだキャンペーンがありません。
            </div>
          ) : (
            <div className='overflow-x-auto rounded border border-border'>
              <table className='w-full min-w-[760px] text-sm'>
                <thead className='bg-muted text-left text-muted-foreground'>
                  <tr>
                    <th className='px-3 py-2 font-medium'>キャンペーン</th>
                    <th className='px-3 py-2 font-medium'>状態</th>
                    <th className='px-3 py-2 text-right font-medium'>送信数</th>
                    <th className='px-3 py-2 text-right font-medium'>到達数</th>
                    <th className='px-3 py-2 text-right font-medium'>予約数</th>
                    <th className='px-3 py-2 text-right font-medium'>来院数</th>
                    <th className='px-3 py-2 font-medium'>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(campaign => (
                    <tr
                      key={campaign.campaign_id}
                      className='border-t border-border'
                    >
                      <td className='px-3 py-3'>
                        <div className='font-medium'>{campaign.name}</div>
                        <div className='font-mono text-xs text-muted-foreground'>
                          {campaign.campaign_id}
                        </div>
                      </td>
                      <td className='px-3 py-3'>{campaign.status}</td>
                      <td className='px-3 py-3 text-right'>
                        {campaign.sent_count.toLocaleString()}
                      </td>
                      <td className='px-3 py-3 text-right'>
                        {campaign.delivered_count.toLocaleString()}
                      </td>
                      <td className='px-3 py-3 text-right'>
                        {campaign.booked_count.toLocaleString()}
                      </td>
                      <td className='px-3 py-3 text-right'>
                        {campaign.visited_count.toLocaleString()}
                      </td>
                      <td className='px-3 py-3'>
                        {campaign.status === 'draft' ? (
                          <Button
                            size='sm'
                            onClick={() => sendCampaign(campaign.campaign_id)}
                            disabled={
                              sendingCampaignId === campaign.campaign_id
                            }
                          >
                            <Send className='mr-2 h-4 w-4' aria-hidden='true' />
                            配信
                          </Button>
                        ) : (
                          <span className='text-muted-foreground'>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
