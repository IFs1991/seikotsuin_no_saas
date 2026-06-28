'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, CreditCard, ExternalLink } from 'lucide-react';
import type { BillingPlanCode, BillingState } from '@/lib/billing/config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type AdminBillingSnapshot = {
  billingEnabled: boolean;
  upgradeEnabled: boolean;
  enabledPlans: BillingPlanCode[];
  subscription: {
    planCode: BillingPlanCode;
    billingState: BillingState;
    stripeStatus: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
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

function formatValue(value: string | null) {
  return value || '-';
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
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
    return 'Group';
  }

  return '-';
}

function formatBillingState(state: BillingState | null) {
  switch (state) {
    case 'none':
      return '未契約';
    case 'checkout_pending':
      return 'Checkout中';
    case 'trialing':
      return 'トライアル';
    case 'active':
      return '有効';
    case 'cancel_scheduled':
      return '解約予定';
    case 'past_due_grace':
      return '支払い確認中';
    case 'past_due_locked':
      return '支払い要対応';
    case 'canceled':
      return '解約済み';
    case 'expired':
      return '期限切れ';
    case 'override_active':
      return '一時許可';
    default:
      return '-';
  }
}

type UrlActionResponse =
  | { success: true; data: { url: string } }
  | { success: false; error: string };

type MutationActionResponse =
  | { success: true; data: unknown }
  | { success: false; error: string };

async function parseUrlActionResponse(response: Response) {
  const json = (await response.json()) as UrlActionResponse;

  if ('error' in json) {
    throw new Error(json.error);
  }

  return json.data.url;
}

async function parseMutationActionResponse(response: Response) {
  const json = (await response.json()) as MutationActionResponse;

  if ('error' in json) {
    throw new Error(json.error);
  }
}

function isUpgradeableSingleState(state: BillingState) {
  return ['trialing', 'active', 'cancel_scheduled'].includes(state);
}

export function AdminBillingPageClient({
  snapshot,
}: AdminBillingPageClientProps) {
  const [actionState, setActionState] = useState<ActionState>({
    status: 'idle',
  });
  const subscription = snapshot.subscription;
  const allowedBillableStoreCount = useMemo(() => {
    if (!subscription) {
      return 0;
    }

    return (
      subscription.includedStoreQuantity + subscription.paidExtraStoreQuantity
    );
  }, [subscription]);

  const startCheckout = async (planCode: BillingPlanCode) => {
    setActionState({ status: 'loading', message: 'Checkoutを開始しています' });
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
            : 'Checkoutの開始に失敗しました',
      });
    }
  };

  const openPortal = async () => {
    setActionState({ status: 'loading', message: 'Portalを開いています' });
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
            : 'Customer Portalの開始に失敗しました',
      });
    }
  };
  const upgradeToGroup = async () => {
    setActionState({
      status: 'loading',
      message: 'Groupプランへアップグレードしています',
    });
    try {
      const response = await fetch('/api/admin/billing/upgrade', {
        method: 'POST',
      });
      await parseMutationActionResponse(response);
      setActionState({
        status: 'success',
        message: 'Groupプランへのアップグレードを反映しました',
      });
      window.location.reload();
    } catch (error) {
      setActionState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Groupプランへのアップグレードに失敗しました',
      });
    }
  };
  const canUpgradeToGroup =
    snapshot.billingEnabled &&
    snapshot.upgradeEnabled &&
    snapshot.enabledPlans.includes('group') &&
    subscription?.planCode === 'single_clinic' &&
    isUpgradeableSingleState(subscription.billingState);

  return (
    <div className='space-y-4'>
      {!snapshot.billingEnabled && (
        <div className='rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'>
          Billing UI は現在無効です。環境変数を有効化するまで Checkout と Portal
          は開始できません。
        </div>
      )}

      {actionState.status !== 'idle' && (
        <div
          className={
            actionState.status === 'error'
              ? 'rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'
              : actionState.status === 'success'
                ? 'rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700'
                : 'rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700'
          }
        >
          {actionState.message}
        </div>
      )}

      <div className='grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>契約状態</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-slate-500'>状態</span>
              <Badge variant='secondary'>
                {formatBillingState(subscription?.billingState ?? null)}
              </Badge>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-slate-500'>プラン</span>
              <span>{formatPlan(subscription?.planCode ?? null)}</span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-slate-500'>Stripe status</span>
              <span>{formatValue(subscription?.stripeStatus ?? null)}</span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-slate-500'>期間終了</span>
              <span>
                {formatDateTime(subscription?.currentPeriodEnd ?? null)}
              </span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-slate-500'>Trial終了</span>
              <span>{formatDateTime(subscription?.trialEnd ?? null)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>店舗数</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-slate-500'>有効な子店舗</span>
              <span>{snapshot.activeBillableStoreCount}</span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-slate-500'>Group基本枠</span>
              <span>{subscription?.includedStoreQuantity ?? 5}</span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-slate-500'>追加課金店舗</span>
              <span>{subscription?.paidExtraStoreQuantity ?? 0}</span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-slate-500'>許可店舗数</span>
              <span>{allowedBillableStoreCount || '-'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className='flex flex-wrap gap-2'>
        {canUpgradeToGroup && (
          <Button
            type='button'
            disabled={actionState.status === 'loading'}
            onClick={() => void upgradeToGroup()}
          >
            <ArrowUpRight className='mr-2 h-4 w-4' />
            Groupへアップグレード
          </Button>
        )}
        {snapshot.enabledPlans.includes('group') && (
          <Button
            type='button'
            disabled={
              !snapshot.billingEnabled || actionState.status === 'loading'
            }
            onClick={() => void startCheckout('group')}
          >
            <CreditCard className='mr-2 h-4 w-4' />
            Group Checkout
          </Button>
        )}
        {snapshot.enabledPlans.includes('single_clinic') && (
          <Button
            type='button'
            variant='outline'
            disabled={
              !snapshot.billingEnabled || actionState.status === 'loading'
            }
            onClick={() => void startCheckout('single_clinic')}
          >
            <CreditCard className='mr-2 h-4 w-4' />
            Single Checkout
          </Button>
        )}
        <Button
          type='button'
          variant='secondary'
          disabled={
            !snapshot.billingEnabled ||
            !subscription?.stripeCustomerId ||
            actionState.status === 'loading'
          }
          onClick={() => void openPortal()}
        >
          <ExternalLink className='mr-2 h-4 w-4' />
          Customer Portal
        </Button>
      </div>
    </div>
  );
}
