'use client';

import { type ReactNode, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Store,
} from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { BillingPlanCode, BillingState } from '@/lib/billing/config';
import type { GroupBillingPriceCatalog } from '@/lib/billing/price-catalog';
import {
  BILLING_TRIAL_PERIOD_DAYS,
  calculatePaidExtraStoreQuantity,
  INCLUDED_GROUP_STORE_QUANTITY,
} from '@/lib/billing/plans';

export type BillingCheckoutResult = 'success' | 'cancelled' | null;

export type AdminBillingSnapshot = {
  billingEnabled: boolean;
  upgradeEnabled: boolean;
  enabledPlans: BillingPlanCode[];
  pricing: GroupBillingPriceCatalog | null;
  checkoutResult: BillingCheckoutResult;
  subscription: {
    planCode: BillingPlanCode;
    billingState: BillingState;
    stripeStatus: string;
    hasStripeCustomer: boolean;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
    trialConsumed: boolean;
    cancelAtPeriodEnd: boolean;
    includedStoreQuantity: number;
    paidExtraStoreQuantity: number;
  } | null;
  activeBillableStoreCount: number;
};

type ActionState =
  | { status: 'idle' }
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

type AdminBillingPageClientProps = {
  snapshot: AdminBillingSnapshot;
};

type BillingStatePresentation = {
  label: string;
  description: string;
  badgeVariant: BadgeVariant;
};

type ContractDate = {
  label: string;
  value: string;
} | null;

const MANAGED_BILLING_STATES: BillingState[] = [
  'trialing',
  'active',
  'cancel_scheduled',
  'past_due_grace',
  'past_due_locked',
  'override_active',
];

const CHECKOUT_ELIGIBLE_STATES: BillingState[] = [
  'none',
  'canceled',
  'expired',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readApiError(value: unknown) {
  if (isRecord(value) && typeof value.error === 'string') {
    return value.error;
  }

  return null;
}

async function parseUrlActionResponse(response: Response) {
  const json: unknown = await response.json();
  const apiError = readApiError(json);

  if (!response.ok || apiError) {
    throw new Error(apiError ?? '処理を完了できませんでした');
  }

  if (
    !isRecord(json) ||
    json.success !== true ||
    !isRecord(json.data) ||
    typeof json.data.url !== 'string'
  ) {
    throw new Error('遷移先を確認できませんでした');
  }

  return json.data.url;
}

async function parseMutationActionResponse(response: Response) {
  const json: unknown = await response.json();
  const apiError = readApiError(json);

  if (!response.ok || apiError) {
    throw new Error(apiError ?? '処理を完了できませんでした');
  }

  if (!isRecord(json) || json.success !== true) {
    throw new Error('処理結果を確認できませんでした');
  }
}

function formatCurrency(unitAmount: number) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(unitAmount);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

function formatPlan(planCode: BillingPlanCode | null) {
  if (planCode === 'single_clinic') {
    return 'Single Clinic';
  }

  if (planCode === 'group') {
    return 'Group Starter';
  }

  return '未契約';
}

function getBillingStatePresentation(
  state: BillingState | null
): BillingStatePresentation {
  switch (state) {
    case 'checkout_pending':
      return {
        label: 'お申し込み処理中',
        description: 'Stripeからの契約情報を確認しています。',
        badgeVariant: 'secondary',
      };
    case 'trialing':
      return {
        label: '無料トライアル中',
        description: 'トライアル終了まですべての契約機能を利用できます。',
        badgeVariant: 'default',
      };
    case 'active':
      return {
        label: '契約中',
        description: '契約は有効です。',
        badgeVariant: 'default',
      };
    case 'cancel_scheduled':
      return {
        label: '解約予定',
        description: '利用終了予定日までは契約機能を利用できます。',
        badgeVariant: 'secondary',
      };
    case 'past_due_grace':
      return {
        label: '支払い確認中',
        description: '支払い状況を確認してください。',
        badgeVariant: 'secondary',
      };
    case 'past_due_locked':
      return {
        label: '支払い方法の確認が必要',
        description: '契約を継続するには支払い方法を確認してください。',
        badgeVariant: 'destructive',
      };
    case 'canceled':
      return {
        label: '解約済み',
        description: '現在有効な契約はありません。',
        badgeVariant: 'secondary',
      };
    case 'expired':
      return {
        label: '期限切れ',
        description: '現在有効な契約はありません。',
        badgeVariant: 'secondary',
      };
    case 'override_active':
      return {
        label: '一時利用中',
        description: '一時的な利用許可が適用されています。',
        badgeVariant: 'secondary',
      };
    case 'none':
    default:
      return {
        label: '未契約',
        description: 'Group Starterはいつでも申し込めます。',
        badgeVariant: 'outline',
      };
  }
}

function getContractDate(
  subscription: AdminBillingSnapshot['subscription']
): ContractDate {
  if (!subscription) {
    return null;
  }

  if (subscription.billingState === 'trialing') {
    const value = formatDateTime(subscription.trialEnd);
    return value ? { label: 'トライアル終了', value } : null;
  }

  if (
    subscription.billingState === 'cancel_scheduled' ||
    subscription.cancelAtPeriodEnd
  ) {
    const value = formatDateTime(subscription.currentPeriodEnd);
    return value ? { label: '利用終了予定', value } : null;
  }

  if (
    ['active', 'past_due_grace', 'past_due_locked'].includes(
      subscription.billingState
    )
  ) {
    const value = formatDateTime(subscription.currentPeriodEnd);
    return value ? { label: '次回更新日', value } : null;
  }

  return null;
}

function isUpgradeableSingleState(state: BillingState) {
  return ['trialing', 'active', 'cancel_scheduled'].includes(state);
}

function getTaxDescription(pricing: GroupBillingPriceCatalog) {
  const taxBehaviors = [
    pricing.groupBase.taxBehavior,
    pricing.storeAddon.taxBehavior,
  ];

  if (taxBehaviors.every(behavior => behavior === 'inclusive')) {
    return '表示価格は税込です。';
  }

  if (taxBehaviors.every(behavior => behavior === 'exclusive')) {
    return '表示価格は税別です。';
  }

  return '税額はStripe Checkoutで確定します。';
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='flex items-start justify-between gap-4 border-b border-border/60 py-3 last:border-b-0'>
      <dt className='text-sm text-muted-foreground'>{label}</dt>
      <dd className='text-right text-sm font-medium'>{value}</dd>
    </div>
  );
}

export function AdminBillingPageClient({
  snapshot,
}: AdminBillingPageClientProps) {
  const [actionState, setActionState] = useState<ActionState>({
    status: 'idle',
  });
  const subscription = snapshot.subscription;
  const pricing = snapshot.pricing;
  const billingState = subscription?.billingState ?? 'none';
  const statePresentation = getBillingStatePresentation(billingState);
  const contractDate = getContractDate(subscription);
  const includedStoreQuantity = INCLUDED_GROUP_STORE_QUANTITY;
  const requiredExtraStoreQuantity = useMemo(
    () =>
      calculatePaidExtraStoreQuantity(
        snapshot.activeBillableStoreCount,
        includedStoreQuantity
      ),
    [includedStoreQuantity, snapshot.activeBillableStoreCount]
  );
  const hasManagedGroupSubscription =
    subscription?.planCode === 'group' &&
    MANAGED_BILLING_STATES.includes(subscription.billingState);
  const hasQuantityMismatch = Boolean(
    hasManagedGroupSubscription &&
    (subscription?.includedStoreQuantity !== INCLUDED_GROUP_STORE_QUANTITY ||
      subscription?.paidExtraStoreQuantity !== requiredExtraStoreQuantity)
  );
  const displayExtraStoreQuantity = hasManagedGroupSubscription
    ? (subscription?.paidExtraStoreQuantity ?? 0)
    : requiredExtraStoreQuantity;
  const monthlyEstimate =
    pricing && !hasQuantityMismatch
      ? pricing.groupBase.unitAmount +
        pricing.storeAddon.unitAmount * displayExtraStoreQuantity
      : null;
  const remainingIncludedStoreQuantity = Math.max(
    includedStoreQuantity - snapshot.activeBillableStoreCount,
    0
  );
  const canStartNewCheckout =
    !subscription ||
    CHECKOUT_ELIGIBLE_STATES.includes(subscription.billingState);
  const isCheckoutPending = subscription?.billingState === 'checkout_pending';
  const canOpenPortal = Boolean(
    snapshot.billingEnabled && subscription?.hasStripeCustomer
  );
  const canUpgradeToGroup = Boolean(
    snapshot.billingEnabled &&
    snapshot.upgradeEnabled &&
    snapshot.enabledPlans.includes('group') &&
    subscription?.planCode === 'single_clinic' &&
    isUpgradeableSingleState(subscription.billingState)
  );
  const isActionLoading = actionState.status === 'loading';
  const trialAvailable = subscription?.trialConsumed !== true;

  const startCheckout = async (planCode: BillingPlanCode) => {
    setActionState({
      status: 'loading',
      message: 'お申し込み画面を開いています。',
    });
    try {
      const response = await fetch('/api/admin/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_code: planCode }),
      });
      const url = await parseUrlActionResponse(response);
      window.location.href = url;
    } catch (error) {
      setActionState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'お申し込み画面を開けませんでした。',
      });
    }
  };

  const openPortal = async () => {
    setActionState({
      status: 'loading',
      message: '契約管理画面を開いています。',
    });
    try {
      const response = await fetch('/api/admin/billing/portal', {
        method: 'POST',
      });
      const url = await parseUrlActionResponse(response);
      window.location.href = url;
    } catch (error) {
      setActionState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : '契約管理画面を開けませんでした。',
      });
    }
  };

  const upgradeToGroup = async () => {
    setActionState({
      status: 'loading',
      message: 'Group Starterへの変更を処理しています。',
    });
    try {
      const response = await fetch('/api/admin/billing/upgrade', {
        method: 'POST',
      });
      await parseMutationActionResponse(response);
      setActionState({
        status: 'success',
        message: 'Group Starterへの変更を受け付けました。',
      });
      window.location.reload();
    } catch (error) {
      setActionState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Group Starterへ変更できませんでした。',
      });
    }
  };

  const renderPrimaryAction = () => {
    if (isCheckoutPending) {
      return (
        <Button
          type='button'
          size='touch'
          variant='outline'
          onClick={() => window.location.reload()}
        >
          <RefreshCw className='mr-2 h-4 w-4' aria-hidden='true' />
          契約状態を更新
        </Button>
      );
    }

    if (canUpgradeToGroup) {
      return (
        <Button
          type='button'
          size='touch'
          disabled={pricing === null || isActionLoading}
          onClick={() => void upgradeToGroup()}
        >
          <ArrowUpRight className='mr-2 h-4 w-4' aria-hidden='true' />
          Group Starterへ変更
        </Button>
      );
    }

    if (
      subscription &&
      MANAGED_BILLING_STATES.includes(subscription.billingState)
    ) {
      const label = ['past_due_grace', 'past_due_locked'].includes(
        subscription.billingState
      )
        ? '支払い方法を確認'
        : '契約・支払い方法を管理';

      return (
        <Button
          type='button'
          size='touch'
          disabled={!canOpenPortal || isActionLoading}
          onClick={() => void openPortal()}
        >
          <ExternalLink className='mr-2 h-4 w-4' aria-hidden='true' />
          {label}
        </Button>
      );
    }

    if (snapshot.enabledPlans.includes('group') && canStartNewCheckout) {
      return (
        <Button
          type='button'
          size='touch'
          disabled={
            !snapshot.billingEnabled || pricing === null || isActionLoading
          }
          onClick={() => void startCheckout('group')}
        >
          <CreditCard className='mr-2 h-4 w-4' aria-hidden='true' />
          Group Starterを申し込む
        </Button>
      );
    }

    return null;
  };

  return (
    <div className='space-y-6'>
      {!snapshot.billingEnabled && (
        <div className='rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'>
          契約・料金機能は現在無効です。設定が有効になるまで、新しいお申し込みと契約管理は利用できません。
        </div>
      )}

      {snapshot.checkoutResult === 'success' && (
        <div
          role='status'
          aria-live='polite'
          className='rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
        >
          お申し込みを受け付けました。契約状態の反映に数秒かかる場合があります。
        </div>
      )}

      {snapshot.checkoutResult === 'cancelled' && (
        <div
          role='status'
          aria-live='polite'
          className='rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground'
        >
          お申し込みは完了していません。内容を確認し、準備ができたらこの画面から再開できます。
        </div>
      )}

      {actionState.status !== 'idle' && (
        <div
          role={actionState.status === 'error' ? 'alert' : 'status'}
          aria-live={actionState.status === 'error' ? undefined : 'polite'}
          className={
            actionState.status === 'error'
              ? 'rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
              : actionState.status === 'success'
                ? 'rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground'
          }
        >
          {actionState.message}
        </div>
      )}

      <Card>
        <CardHeader className='gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0'>
          <div className='space-y-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <CardTitle className='text-xl'>Group Starter</CardTitle>
              <Badge
                variant={statePresentation.badgeVariant}
                className={
                  statePresentation.badgeVariant === 'outline'
                    ? 'dark:text-foreground'
                    : undefined
                }
              >
                {statePresentation.label}
              </Badge>
              {trialAvailable && canStartNewCheckout && (
                <Badge variant='outline' className='dark:text-foreground'>
                  初回{BILLING_TRIAL_PERIOD_DAYS}日無料
                </Badge>
              )}
            </div>
            <CardDescription className='max-w-2xl leading-6'>
              5店舗まで基本料金に含まれます。6店舗目以降は、追加した店舗数に応じて1店舗単位で月額料金が加算されます。
            </CardDescription>
          </div>
          <div className='sm:text-right'>
            <p className='text-xs font-medium text-muted-foreground'>
              {hasManagedGroupSubscription
                ? '現在の月額見込み'
                : '申込時の月額見込み'}
            </p>
            <p className='mt-1 text-2xl font-semibold tracking-tight'>
              {monthlyEstimate === null
                ? '料金情報を確認できません'
                : `${formatCurrency(monthlyEstimate)} / 月`}
            </p>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            {statePresentation.description}
          </p>

          {pricing === null && snapshot.billingEnabled && (
            <div className='rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'>
              料金情報を確認できないため、新しいお申し込みは一時的に利用できません。既存契約の管理は引き続き利用できます。
            </div>
          )}

          {hasQuantityMismatch && (
            <div className='rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'>
              店舗数とStripe上の追加数量を同期確認中です。現在の請求額は契約管理画面で確認してください。
            </div>
          )}

          {isCheckoutPending && (
            <div className='rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground'>
              重複したお申し込みを防ぐため、処理中は新しい申込ボタンを表示していません。しばらく待ってから契約状態を更新してください。
            </div>
          )}

          <div className='flex flex-wrap items-center gap-3'>
            {renderPrimaryAction()}
            {canUpgradeToGroup && canOpenPortal && (
              <Button
                type='button'
                size='touch'
                variant='outline'
                disabled={isActionLoading}
                onClick={() => void openPortal()}
              >
                <ExternalLink className='mr-2 h-4 w-4' aria-hidden='true' />
                現在の契約を管理
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>料金の内訳</CardTitle>
            <CardDescription>
              Group Starterの月額料金は、基本料金と追加店舗料金で決まります。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pricing ? (
              <>
                <dl>
                  <SummaryRow
                    label='基本料金（5店舗まで）'
                    value={`${formatCurrency(pricing.groupBase.unitAmount)} / 月`}
                  />
                  <SummaryRow
                    label='追加店舗（6店舗目以降）'
                    value={`${formatCurrency(pricing.storeAddon.unitAmount)} / 店舗 / 月`}
                  />
                  <SummaryRow
                    label='追加料金の対象'
                    value={`${displayExtraStoreQuantity}店舗`}
                  />
                </dl>
                <p className='mt-3 text-xs leading-5 text-muted-foreground'>
                  {getTaxDescription(pricing)}
                </p>
              </>
            ) : (
              <p className='text-sm leading-6 text-muted-foreground'>
                料金情報を確認できません。金額を推測せず、確認できる状態になるまで表示を控えています。
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className='flex items-center gap-2'>
              <Store
                className='h-5 w-5 text-muted-foreground'
                aria-hidden='true'
              />
              <CardTitle className='text-base'>店舗数と追加料金</CardTitle>
            </div>
            <CardDescription>
              現在の有効店舗数をもとに、基本料金内の枠と追加店舗を表示します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl>
              <SummaryRow
                label='現在の有効店舗数'
                value={`${snapshot.activeBillableStoreCount}店舗`}
              />
              <SummaryRow
                label='基本料金に含まれる店舗数'
                value={`${includedStoreQuantity}店舗`}
              />
              <SummaryRow
                label='基本料金内の残り枠'
                value={`${remainingIncludedStoreQuantity}店舗`}
              />
              <SummaryRow
                label={
                  hasManagedGroupSubscription
                    ? 'Stripe上の追加店舗数'
                    : '申込時の追加店舗数'
                }
                value={`${displayExtraStoreQuantity}店舗`}
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>現在の契約</CardTitle>
          <CardDescription>
            契約の状態と、次に確認が必要な日付だけを表示します。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <dl>
            <SummaryRow
              label='契約状態'
              value={
                <Badge variant={statePresentation.badgeVariant}>
                  {statePresentation.label}
                </Badge>
              }
            />
            <SummaryRow
              label='現在のプラン'
              value={formatPlan(subscription?.planCode ?? null)}
            />
            {contractDate && (
              <SummaryRow
                label={contractDate.label}
                value={contractDate.value}
              />
            )}
          </dl>

          {subscription && (
            <details className='rounded-md border border-border bg-muted/40 px-4 py-3 text-sm'>
              <summary className='cursor-pointer font-medium'>技術情報</summary>
              <dl className='mt-3'>
                <SummaryRow
                  label='Stripe上の契約状態'
                  value={subscription.stripeStatus || '未設定'}
                />
              </dl>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
