'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Store,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonClassName } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  buildParentOptionLabel,
  type ClinicSummary,
  type CreateClinicPayload,
  type CreateClinicResult,
} from '@/lib/admin/tenants';
import type {
  TenantAddPreview,
  TenantAddPreviewReason,
} from '@/lib/billing/tenant-add-preview';

const EMPTY_PARENT_VALUE = '__tenant_add_parent_unselected__';
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 15;
const POLL_DEADLINE_MS = 30_000;

type TenantAddStep = 'details' | 'review' | 'result';
type CompletionStatus =
  | 'not_required'
  | 'activated'
  | 'pending_webhook'
  | 'pending_capacity'
  | 'billing_failed';

type TenantAddFormState = {
  name: string;
  address: string;
  phoneNumber: string;
  parentId: string;
};

type TenantAddFieldErrors = Partial<
  Record<'name' | 'parentId' | 'paidConfirmation', string>
>;

const INITIAL_FORM_STATE: TenantAddFormState = {
  name: '',
  address: '',
  phoneNumber: '',
  parentId: '',
};

const BLOCKED_REASON_COPY: Record<
  TenantAddPreviewReason,
  { title: string; description: string }
> = {
  subscription_missing: {
    title: 'Group契約を確認してください',
    description:
      '店舗を追加できるGroup契約を確認できません。契約・料金画面で現在の契約をご確認ください。',
  },
  group_plan_required: {
    title: 'Group Starterへの変更が必要です',
    description:
      '現在のプランでは店舗を追加できません。契約・料金画面からGroup Starterをご確認ください。',
  },
  billing_state_unavailable: {
    title: '現在は店舗を追加できません',
    description:
      '契約または支払い状態の確認が必要です。契約・料金画面で状態をご確認ください。',
  },
  activation_pending: {
    title: '前の店舗追加を処理しています',
    description:
      '契約反映待ちまたは有効化確認中の店舗があります。一覧の状態が更新されてからもう一度お試しください。',
  },
  quantity_sync_pending: {
    title: '契約数量を同期しています',
    description:
      '現在の店舗数と契約済みの追加店舗枠を同期しています。反映後にもう一度お試しください。',
  },
  quantity_update_unavailable: {
    title: '契約数量を更新できません',
    description:
      '追加店舗枠の更新先を確認できません。契約・料金画面で現在の契約をご確認ください。',
  },
  pricing_unavailable: {
    title: '料金情報を確認できません',
    description:
      '追加料金を正確に確認できないため、店舗追加を停止しています。契約・料金画面をご確認ください。',
  },
};

interface TenantAddDialogProps {
  open: boolean;
  parentOptions: ClinicSummary[];
  parentOptionsLoading: boolean;
  requestError: string | null;
  onOpenChange: (open: boolean) => void;
  onPreview: (parentId: string) => Promise<TenantAddPreview>;
  onCreate: (
    payload: CreateClinicPayload
  ) => Promise<CreateClinicResult | null>;
  onCreated: (clinic: CreateClinicResult) => Promise<void>;
  onPollClinic: (clinicId: string) => Promise<ClinicSummary | null>;
}

function formatMonthlyAmount(amount: number) {
  return `${new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount)} / 月`;
}

function formatTaxBehavior(
  taxBehavior: 'inclusive' | 'exclusive' | 'unspecified'
) {
  if (taxBehavior === 'inclusive') {
    return '税込';
  }

  if (taxBehavior === 'exclusive') {
    return '税別';
  }

  return '税額は請求時に確定';
}

function resolveCompletionStatus(result: CreateClinicResult): CompletionStatus {
  if (result.is_active || result.billing_activation_status === 'active') {
    return 'activated';
  }

  return result.billing_activation_result?.status ?? 'not_required';
}

function StepIndicator({ step }: { step: TenantAddStep }) {
  const currentStep = step === 'details' ? 1 : 2;

  return (
    <ol className='grid grid-cols-2 gap-2' aria-label='店舗追加の進行状況'>
      {[
        { number: 1, label: '店舗情報' },
        { number: 2, label: '追加内容の確認' },
      ].map(item => {
        const isCurrent = item.number === currentStep;
        const isComplete = item.number < currentStep || step === 'result';

        return (
          <li
            key={item.number}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              isCurrent
                ? 'border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-100'
                : 'border-slate-200 text-muted-foreground dark:border-slate-700'
            }`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isComplete
                  ? 'bg-emerald-600 text-white'
                  : isCurrent
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {isComplete ? <CheckCircle2 className='h-4 w-4' /> : item.number}
            </span>
            {item.label}
          </li>
        );
      })}
    </ol>
  );
}

function PreviewSummary({ preview }: { preview: TenantAddPreview }) {
  if (preview.status === 'blocked') {
    const copy = BLOCKED_REASON_COPY[preview.reason];

    return (
      <Alert variant='warning'>
        <AlertTriangle className='h-4 w-4' />
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription className='space-y-3'>
          <p>{copy.description}</p>
          <Link
            href='/admin/billing'
            className={buttonClassName({ variant: 'outline', size: 'sm' })}
          >
            契約・料金を確認
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (preview.status === 'paid_quantity_increase') {
    return (
      <div className='space-y-4'>
        <Alert variant='warning'>
          <CreditCard className='h-4 w-4' />
          <AlertTitle>追加料金が発生します</AlertTitle>
          <AlertDescription>
            6店舗目以降の追加店舗として、契約数量を増やします。
          </AlertDescription>
        </Alert>
        <dl className='grid gap-3 rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700 sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground'>追加店舗単価</dt>
            <dd className='mt-1 font-semibold'>
              {formatMonthlyAmount(preview.pricing.storeAddonUnitAmount)}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>今回の月額増分</dt>
            <dd className='mt-1 font-semibold'>
              {formatMonthlyAmount(preview.pricing.monthlyIncrease)}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>追加後の標準月額見込み</dt>
            <dd className='mt-1 font-semibold'>
              {formatMonthlyAmount(preview.pricing.standardMonthlyTotal)}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>税区分</dt>
            <dd className='mt-1 font-semibold'>
              {formatTaxBehavior(preview.pricing.taxBehavior)}
            </dd>
          </div>
        </dl>
        <p className='text-xs leading-5 text-muted-foreground'>
          標準料金ベースの見込みです。割引や請求タイミングによって実際の請求額が異なる場合があります。
        </p>
      </div>
    );
  }

  const copy =
    preview.status === 'base_capacity'
      ? {
          title: '基本料金内で追加できます',
          description:
            '5店舗までの基本枠内のため、今回の月額増分はありません。',
        }
      : preview.status === 'existing_paid_capacity'
        ? {
            title: '契約済みの追加店舗枠内です',
            description:
              'すでに契約済みの店舗枠を使用するため、今回の月額増分はありません。',
          }
        : {
            title: '店舗情報を登録します',
            description:
              'この環境では店舗追加時の料金連携確認が無効です。登録後に契約・料金画面をご確認ください。',
          };

  return (
    <Alert variant='success'>
      <CheckCircle2 className='h-4 w-4' />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.description}</AlertDescription>
    </Alert>
  );
}

export function TenantAddDialog({
  open,
  parentOptions,
  parentOptionsLoading,
  requestError,
  onOpenChange,
  onPreview,
  onCreate,
  onCreated,
  onPollClinic,
}: TenantAddDialogProps) {
  const [step, setStep] = useState<TenantAddStep>('details');
  const [formState, setFormState] =
    useState<TenantAddFormState>(INITIAL_FORM_STATE);
  const [fieldErrors, setFieldErrors] = useState<TenantAddFieldErrors>({});
  const [preview, setPreview] = useState<TenantAddPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paidConfirmed, setPaidConfirmed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [createdClinic, setCreatedClinic] = useState<CreateClinicResult | null>(
    null
  );
  const [completionStatus, setCompletionStatus] =
    useState<CompletionStatus | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const submittingRef = useRef(false);
  const previewRequestIdRef = useRef(0);
  const pollDeadlineRef = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const parentTriggerRef = useRef<HTMLButtonElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const paidConfirmationRef = useRef<HTMLInputElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  const selectedParent = useMemo(
    () =>
      parentOptions.find(option => option.id === formState.parentId) ?? null,
    [formState.parentId, parentOptions]
  );
  const isPending =
    completionStatus === 'pending_webhook' ||
    completionStatus === 'pending_capacity';

  const reset = useCallback(() => {
    previewRequestIdRef.current += 1;
    setStep('details');
    setFormState(INITIAL_FORM_STATE);
    setFieldErrors({});
    setPreview(null);
    setPreviewLoading(false);
    setSubmitting(false);
    setPaidConfirmed(false);
    setLocalError(null);
    setCreatedClinic(null);
    setCompletionStatus(null);
    setPollAttempts(0);
    setPollTimedOut(false);
    pollDeadlineRef.current = null;
    submittingRef.current = false;
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && submittingRef.current) {
        return;
      }
      if (!nextOpen) {
        previewRequestIdRef.current += 1;
        setPreviewLoading(false);
      }
      if (!nextOpen && step === 'result') {
        reset();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset, step]
  );

  const handleExplicitCancel = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [onOpenChange, reset]);

  useEffect(() => {
    if (!open || formState.parentId || parentOptions.length !== 1) {
      return;
    }

    setFormState(current => ({
      ...current,
      parentId: parentOptions[0].id,
    }));
  }, [formState.parentId, open, parentOptions]);

  useEffect(() => {
    if (step === 'review') {
      reviewHeadingRef.current?.focus();
      return;
    }

    if (step === 'result') {
      resultHeadingRef.current?.focus();
      return;
    }

    if (open) {
      nameInputRef.current?.focus();
    }
  }, [open, step]);

  useEffect(() => {
    if (!isPending || pollTimedOut || pollDeadlineRef.current === null) {
      return;
    }

    const remaining = Math.max(0, pollDeadlineRef.current - Date.now());
    const deadline = window.setTimeout(() => {
      setPollTimedOut(true);
    }, remaining);

    return () => window.clearTimeout(deadline);
  }, [isPending, pollTimedOut]);

  useEffect(() => {
    if (!isPending || !createdClinic || pollTimedOut) {
      return;
    }

    if (pollAttempts >= MAX_POLL_ATTEMPTS) {
      setPollTimedOut(true);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        const refreshed = await onPollClinic(createdClinic.id);
        if (cancelled) {
          return;
        }

        if (
          refreshed?.is_active ||
          refreshed?.billing_activation_status === 'active'
        ) {
          setCompletionStatus('activated');
          return;
        }

        if (refreshed?.billing_activation_status === 'billing_failed') {
          setCompletionStatus('billing_failed');
          return;
        }

        setPollAttempts(current => current + 1);
      })();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [createdClinic, isPending, onPollClinic, pollAttempts, pollTimedOut]);

  const updateField = useCallback(
    (field: keyof TenantAddFormState, value: string) => {
      if (field === 'parentId') {
        previewRequestIdRef.current += 1;
        setPreviewLoading(false);
        setPreview(null);
        setPaidConfirmed(false);
      }
      setFormState(current => ({ ...current, [field]: value }));
      setFieldErrors(current => ({ ...current, [field]: undefined }));
      setLocalError(null);
    },
    []
  );

  const handleReview = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextErrors: TenantAddFieldErrors = {};

      if (!formState.name.trim()) {
        nextErrors.name = '店舗名を入力してください';
      }
      if (!formState.parentId) {
        nextErrors.parentId = '親本部を選択してください';
      }

      setFieldErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        if (nextErrors.name) {
          nameInputRef.current?.focus();
        } else if (nextErrors.parentId) {
          parentTriggerRef.current?.focus();
        }
        return;
      }

      setPreviewLoading(true);
      setLocalError(null);
      setPaidConfirmed(false);
      const requestId = previewRequestIdRef.current + 1;
      previewRequestIdRef.current = requestId;
      try {
        const nextPreview = await onPreview(formState.parentId);
        if (requestId !== previewRequestIdRef.current) {
          return;
        }
        setPreview(nextPreview);
        setStep('review');
      } catch {
        if (requestId !== previewRequestIdRef.current) {
          return;
        }
        setLocalError(
          '店舗追加の条件を確認できませんでした。入力内容は保持されています。時間をおいて再度お試しください。'
        );
      } finally {
        if (requestId === previewRequestIdRef.current) {
          setPreviewLoading(false);
        }
      }
    },
    [formState.name, formState.parentId, onPreview]
  );

  const handleCreate = useCallback(async () => {
    if (!preview || !preview.canCreate || submittingRef.current) {
      return;
    }

    if (preview.status === 'paid_quantity_increase' && !paidConfirmed) {
      setFieldErrors(current => ({
        ...current,
        paidConfirmation: '追加料金を確認してください',
      }));
      paidConfirmationRef.current?.focus();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setLocalError(null);
    try {
      const created = await onCreate({
        name: formState.name.trim(),
        address: formState.address.trim() || undefined,
        phone_number: formState.phoneNumber.trim() || undefined,
        is_active: true,
        parent_id: formState.parentId,
        billing_confirmation:
          preview.status === 'paid_quantity_increase'
            ? {
                acknowledged_paid_increase: true,
                active_store_count: preview.activeStoreCount,
                target_paid_extra_store_quantity:
                  preview.contractedExtraStoreQuantity +
                  preview.pricing.quantityIncrease,
                store_addon_unit_amount: preview.pricing.storeAddonUnitAmount,
                monthly_increase: preview.pricing.monthlyIncrease,
                standard_monthly_total: preview.pricing.standardMonthlyTotal,
              }
            : undefined,
      });

      if (!created) {
        setLocalError(
          '店舗を追加できませんでした。入力内容は保持されています。内容を確認して再度お試しください。'
        );
        return;
      }

      try {
        await onCreated(created);
      } catch {
        setLocalError(
          '店舗は作成済みですが、一覧を更新できませんでした。重複して追加せず、画面を再読み込みしてください。'
        );
      }
      setCreatedClinic(created);
      const nextCompletionStatus = resolveCompletionStatus(created);
      if (
        nextCompletionStatus === 'pending_webhook' ||
        nextCompletionStatus === 'pending_capacity'
      ) {
        pollDeadlineRef.current = Date.now() + POLL_DEADLINE_MS;
      }
      setCompletionStatus(nextCompletionStatus);
      setStep('result');
    } catch {
      setLocalError(
        '店舗を追加できませんでした。入力内容は保持されています。内容を確認して再度お試しください。'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    formState.address,
    formState.name,
    formState.parentId,
    formState.phoneNumber,
    onCreate,
    onCreated,
    paidConfirmed,
    preview,
  ]);

  const visibleError = localError ?? requestError;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className='max-h-dvh max-w-2xl overflow-y-auto'
        closeLabel='閉じる'
        aria-busy={submitting}
        onEscapeKeyDown={event => {
          if (submitting) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={event => {
          if (submitting) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle
            ref={resultHeadingRef}
            tabIndex={step === 'result' ? -1 : undefined}
          >
            {step === 'result' ? '店舗追加の結果' : '店舗を追加'}
          </DialogTitle>
          <DialogDescription>
            店舗情報と料金への影響を確認してから追加します。店舗管理者は追加完了後に設定できます。
          </DialogDescription>
        </DialogHeader>

        {step !== 'result' && <StepIndicator step={step} />}

        <div aria-live='polite' aria-atomic='true'>
          {visibleError && (
            <Alert variant='destructive'>
              <AlertTriangle className='h-4 w-4' />
              <AlertTitle>操作を完了できませんでした</AlertTitle>
              <AlertDescription>{visibleError}</AlertDescription>
            </Alert>
          )}
        </div>

        {step === 'details' && (
          <form className='space-y-5' onSubmit={handleReview} noValidate>
            <div className='space-y-2'>
              <label htmlFor='tenant-add-name' className='text-sm font-medium'>
                店舗名 <span aria-hidden='true'>*</span>
              </label>
              <Input
                id='tenant-add-name'
                ref={nameInputRef}
                value={formState.name}
                required
                aria-required='true'
                onChange={event => updateField('name', event.target.value)}
                placeholder='例: 新宿西口院'
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={
                  fieldErrors.name ? 'tenant-add-name-error' : undefined
                }
              />
              {fieldErrors.name && (
                <p
                  id='tenant-add-name-error'
                  className='text-sm text-destructive'
                >
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div className='space-y-2'>
              {parentOptions.length === 1 ? (
                <p id='tenant-add-parent-label' className='text-sm font-medium'>
                  親本部 <span aria-hidden='true'>*</span>
                </p>
              ) : (
                <label
                  htmlFor='tenant-add-parent'
                  className='text-sm font-medium'
                >
                  親本部 <span aria-hidden='true'>*</span>
                </label>
              )}
              {parentOptions.length === 1 ? (
                <Card aria-labelledby='tenant-add-parent-label'>
                  <CardContent className='flex items-center gap-3 p-4'>
                    <Store className='h-5 w-5 text-blue-600' />
                    <div>
                      <p className='font-medium'>{parentOptions[0].name}</p>
                      <p className='text-xs text-muted-foreground'>
                        この本部の配下へ追加します
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Select
                  value={formState.parentId || EMPTY_PARENT_VALUE}
                  onValueChange={value =>
                    updateField(
                      'parentId',
                      value === EMPTY_PARENT_VALUE ? '' : value
                    )
                  }
                  disabled={parentOptionsLoading || parentOptions.length === 0}
                >
                  <SelectTrigger
                    id='tenant-add-parent'
                    ref={parentTriggerRef}
                    className='w-full'
                    aria-required='true'
                    aria-invalid={Boolean(fieldErrors.parentId)}
                    aria-describedby={
                      fieldErrors.parentId
                        ? 'tenant-add-parent-error'
                        : undefined
                    }
                  >
                    <SelectValue
                      placeholder={
                        parentOptionsLoading
                          ? '本部を読み込み中'
                          : '親本部を選択'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_PARENT_VALUE}>
                      親本部を選択
                    </SelectItem>
                    {parentOptions.map(parent => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {buildParentOptionLabel(parent)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {fieldErrors.parentId && (
                <p
                  id='tenant-add-parent-error'
                  className='text-sm text-destructive'
                >
                  {fieldErrors.parentId}
                </p>
              )}
              {!parentOptionsLoading && parentOptions.length === 0 && (
                <p className='text-sm text-destructive'>
                  追加先にできる運用中の本部がありません。
                </p>
              )}
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <label
                  htmlFor='tenant-add-address'
                  className='text-sm font-medium'
                >
                  住所（任意）
                </label>
                <Input
                  id='tenant-add-address'
                  value={formState.address}
                  onChange={event => updateField('address', event.target.value)}
                  placeholder='例: 東京都新宿区'
                />
              </div>
              <div className='space-y-2'>
                <label
                  htmlFor='tenant-add-phone'
                  className='text-sm font-medium'
                >
                  電話番号（任意）
                </label>
                <Input
                  id='tenant-add-phone'
                  value={formState.phoneNumber}
                  onChange={event =>
                    updateField('phoneNumber', event.target.value)
                  }
                  placeholder='例: 03-1234-5678'
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                size='touch'
                onClick={handleExplicitCancel}
              >
                キャンセル
              </Button>
              <Button
                type='submit'
                size='touch'
                disabled={
                  previewLoading ||
                  parentOptionsLoading ||
                  parentOptions.length === 0
                }
              >
                {previewLoading && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                追加内容を確認
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 'review' && preview && (
          <div className='space-y-5'>
            <section aria-labelledby='tenant-add-review-details'>
              <h3
                id='tenant-add-review-details'
                ref={reviewHeadingRef}
                tabIndex={-1}
                className='text-sm font-semibold'
              >
                作成内容
              </h3>
              <dl className='mt-3 grid gap-3 rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700 sm:grid-cols-2'>
                <div>
                  <dt className='text-muted-foreground'>店舗名</dt>
                  <dd className='mt-1 font-medium'>{formState.name.trim()}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>親本部</dt>
                  <dd className='mt-1 font-medium'>
                    {selectedParent?.name ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>住所</dt>
                  <dd className='mt-1 font-medium'>
                    {formState.address.trim() || '未設定'}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>電話番号</dt>
                  <dd className='mt-1 font-medium'>
                    {formState.phoneNumber.trim() || '未設定'}
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby='tenant-add-review-capacity'>
              <h3
                id='tenant-add-review-capacity'
                className='text-sm font-semibold'
              >
                追加後の店舗数と料金影響
              </h3>
              <div className='mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4'>
                <Card>
                  <CardContent className='p-4'>
                    <p className='text-xs text-muted-foreground'>現在</p>
                    <p className='mt-1 text-xl font-semibold'>
                      {preview.activeStoreCount}店舗
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className='p-4'>
                    <p className='text-xs text-muted-foreground'>追加後</p>
                    <p className='mt-1 text-xl font-semibold'>
                      {preview.afterStoreCount}店舗
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className='p-4'>
                    <p className='text-xs text-muted-foreground'>基本枠</p>
                    <p className='mt-1 text-xl font-semibold'>
                      {preview.includedStoreCount || '-'}
                      {preview.includedStoreCount ? '店舗' : ''}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className='p-4'>
                    <p className='text-xs text-muted-foreground'>
                      契約済み上限
                    </p>
                    <p className='mt-1 text-xl font-semibold'>
                      {preview.contractedStoreLimit || '-'}
                      {preview.contractedStoreLimit ? '店舗' : ''}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            <PreviewSummary preview={preview} />

            {preview.status === 'paid_quantity_increase' && (
              <div className='space-y-2'>
                <label className='flex cursor-pointer items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30'>
                  <input
                    ref={paidConfirmationRef}
                    type='checkbox'
                    required
                    className='mt-1 h-4 w-4 rounded border-slate-300'
                    checked={paidConfirmed}
                    onChange={event => {
                      setPaidConfirmed(event.target.checked);
                      setFieldErrors(current => ({
                        ...current,
                        paidConfirmation: undefined,
                      }));
                    }}
                    aria-invalid={Boolean(fieldErrors.paidConfirmation)}
                    aria-describedby={
                      fieldErrors.paidConfirmation
                        ? 'tenant-add-paid-confirmation-error'
                        : undefined
                    }
                  />
                  <span>
                    上記の月額増分と追加後の標準月額見込みを確認しました
                  </span>
                </label>
                {fieldErrors.paidConfirmation && (
                  <p
                    id='tenant-add-paid-confirmation-error'
                    className='text-sm text-destructive'
                  >
                    {fieldErrors.paidConfirmation}
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                size='touch'
                disabled={submitting}
                onClick={() => setStep('details')}
              >
                戻る
              </Button>
              <Button
                type='button'
                size='touch'
                disabled={!preview.canCreate || submitting}
                onClick={handleCreate}
              >
                {submitting && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                店舗を追加
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'result' && createdClinic && completionStatus && (
          <div className='space-y-5' aria-live='polite' aria-atomic='true'>
            {(completionStatus === 'activated' ||
              completionStatus === 'not_required') && (
              <Alert variant='success'>
                <CheckCircle2 className='h-4 w-4' />
                <AlertTitle>店舗を追加しました</AlertTitle>
                <AlertDescription>
                  {createdClinic.name}
                  は運用を開始できます。続けて店舗管理者を設定できます。
                </AlertDescription>
              </Alert>
            )}

            {isPending && !pollTimedOut && (
              <Alert>
                <Loader2 className='h-4 w-4 animate-spin' />
                <AlertTitle>
                  {completionStatus === 'pending_capacity'
                    ? '契約数量の反映を待っています'
                    : '契約情報を同期しています'}
                </AlertTitle>
                <AlertDescription>
                  店舗は作成済みです。画面を閉じても同期は継続するため、重複して追加しないでください。
                </AlertDescription>
              </Alert>
            )}

            {isPending && pollTimedOut && (
              <Alert variant='warning'>
                <AlertTriangle className='h-4 w-4' />
                <AlertTitle>バックグラウンドで同期を続けています</AlertTitle>
                <AlertDescription>
                  店舗は作成済みです。しばらくして一覧の「契約反映待ち」が「運用中」へ変わることをご確認ください。
                </AlertDescription>
              </Alert>
            )}

            {completionStatus === 'billing_failed' && (
              <Alert variant='destructive'>
                <AlertTriangle className='h-4 w-4' />
                <AlertTitle>
                  店舗は作成済みですが、有効化できませんでした
                </AlertTitle>
                <AlertDescription>
                  重複して店舗を追加せず、契約・料金画面を確認してから再試行してください。
                </AlertDescription>
              </Alert>
            )}

            <div className='rounded-lg border border-slate-200 p-4 dark:border-slate-700'>
              <p className='text-sm text-muted-foreground'>追加した店舗</p>
              <p className='mt-1 font-semibold'>{createdClinic.name}</p>
            </div>

            <DialogFooter>
              {completionStatus === 'activated' ||
              completionStatus === 'not_required' ? (
                <>
                  <Button
                    type='button'
                    variant='outline'
                    size='touch'
                    onClick={handleExplicitCancel}
                  >
                    あとで設定
                  </Button>
                  <Link
                    href={`/admin/users?clinic_id=${encodeURIComponent(
                      createdClinic.id
                    )}`}
                    onClick={reset}
                    className={buttonClassName({ size: 'touch' })}
                  >
                    店舗管理者を設定
                  </Link>
                </>
              ) : completionStatus === 'billing_failed' ? (
                <>
                  <Button
                    type='button'
                    variant='outline'
                    size='touch'
                    onClick={handleExplicitCancel}
                  >
                    閉じる
                  </Button>
                  <Link
                    href='/admin/billing'
                    onClick={reset}
                    className={buttonClassName({ size: 'touch' })}
                  >
                    契約・料金を確認
                  </Link>
                </>
              ) : (
                <Button
                  type='button'
                  size='touch'
                  onClick={handleExplicitCancel}
                >
                  閉じる
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
