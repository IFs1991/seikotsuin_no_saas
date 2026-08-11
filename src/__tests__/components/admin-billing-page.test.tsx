import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AdminBillingPageClient,
  type AdminBillingSnapshot,
} from '@/components/admin/billing-page-client';

const pricing: NonNullable<AdminBillingSnapshot['pricing']> = {
  groupBase: {
    currency: 'jpy',
    unitAmount: 78000,
    interval: 'month',
    intervalCount: 1,
    taxBehavior: 'unspecified',
  },
  storeAddon: {
    currency: 'jpy',
    unitAmount: 8000,
    interval: 'month',
    intervalCount: 1,
    taxBehavior: 'unspecified',
  },
};

const activeSubscription: NonNullable<AdminBillingSnapshot['subscription']> = {
  planCode: 'group',
  billingState: 'active',
  stripeStatus: 'active',
  hasStripeCustomer: true,
  currentPeriodEnd: '2026-09-09T08:29:00.000Z',
  trialEnd: null,
  trialConsumed: true,
  cancelAtPeriodEnd: false,
  includedStoreQuantity: 5,
  paidExtraStoreQuantity: 0,
};

function createSnapshot(
  overrides: Partial<AdminBillingSnapshot> = {}
): AdminBillingSnapshot {
  return {
    billingEnabled: true,
    upgradeEnabled: false,
    enabledPlans: ['group'],
    pricing,
    checkoutResult: null,
    subscription: null,
    activeBillableStoreCount: 3,
    ...overrides,
  };
}

describe('AdminBillingPageClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('explains the five-store allowance and the initial trial before checkout', () => {
    render(<AdminBillingPageClient snapshot={createSnapshot()} />);

    expect(
      screen.getByText(/5店舗まで基本料金に含まれます/)
    ).toBeInTheDocument();
    expect(screen.getByText('初回30日無料')).toBeInTheDocument();
    expect(screen.getByText('3店舗')).toBeInTheDocument();
    expect(screen.getByText('2店舗')).toBeInTheDocument();
    expect(screen.getAllByText('0店舗')).not.toHaveLength(0);
    expect(screen.getAllByText('￥78,000 / 月')).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Group Starterを申し込む' })
    ).toBeEnabled();
  });

  test.each([
    [5, '￥78,000 / 月', '0店舗'],
    [6, '￥86,000 / 月', '1店舗'],
    [8, '￥102,000 / 月', '3店舗'],
  ])(
    'calculates the checkout estimate for %i active stores',
    (activeBillableStoreCount, expectedTotal, expectedExtra) => {
      render(
        <AdminBillingPageClient
          snapshot={createSnapshot({ activeBillableStoreCount })}
        />
      );

      expect(screen.getAllByText(expectedTotal)).not.toHaveLength(0);
      expect(screen.getAllByText(expectedExtra)).not.toHaveLength(0);
    }
  );

  test('shows the Stripe quantity and hides duplicate checkout for an active contract', () => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({
          activeBillableStoreCount: 8,
          subscription: {
            ...activeSubscription,
            paidExtraStoreQuantity: 3,
          },
        })}
      />
    );

    expect(screen.getByText('現在の月額見込み')).toBeInTheDocument();
    expect(screen.getAllByText('￥102,000 / 月')).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: '契約・支払い方法を管理' })
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Group Starterを申し込む' })
    ).not.toBeInTheDocument();
  });

  test('does not assert a charge while store and Stripe quantities differ', () => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({
          activeBillableStoreCount: 8,
          subscription: {
            ...activeSubscription,
            paidExtraStoreQuantity: 2,
          },
        })}
      />
    );

    expect(screen.getByText(/同期確認中です/)).toBeInTheDocument();
    expect(screen.getByText('料金情報を確認できません')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '契約・支払い方法を管理' })
    ).toBeEnabled();
  });

  test('disables checkout when price information is unavailable', () => {
    render(
      <AdminBillingPageClient snapshot={createSnapshot({ pricing: null })} />
    );

    expect(screen.getAllByText('料金情報を確認できません')).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Group Starterを申し込む' })
    ).toBeDisabled();
  });

  test('keeps the portal available when price information is unavailable', () => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({
          pricing: null,
          subscription: activeSubscription,
        })}
      />
    );

    expect(
      screen.getByRole('button', { name: '契約・支払い方法を管理' })
    ).toBeEnabled();
  });

  test('does not show a conflicting portal-available message when billing is disabled', () => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({
          billingEnabled: false,
          pricing: null,
          subscription: activeSubscription,
        })}
      />
    );

    expect(
      screen.getByText(/新しいお申し込みと契約管理は利用できません/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/既存契約の管理は引き続き利用できます/)
    ).not.toBeInTheDocument();
  });

  test('keeps the Group-focused screen free of an unverified Single Clinic checkout', () => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({ enabledPlans: ['single_clinic', 'group'] })}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Group Starterを申し込む' })
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Single Clinicを申し込む' })
    ).not.toBeInTheDocument();
  });

  test.each([
    ['inclusive', '表示価格は税込です。'],
    ['exclusive', '表示価格は税別です。'],
  ] as const)('shows the %s tax treatment', (taxBehavior, expectedCopy) => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({
          pricing: {
            groupBase: { ...pricing.groupBase, taxBehavior },
            storeAddon: { ...pricing.storeAddon, taxBehavior },
          },
        })}
      />
    );

    expect(screen.getByText(expectedCopy)).toBeInTheDocument();
  });

  test('defers mixed tax treatment to Checkout', () => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({
          pricing: {
            groupBase: { ...pricing.groupBase, taxBehavior: 'inclusive' },
            storeAddon: { ...pricing.storeAddon, taxBehavior: 'unspecified' },
          },
        })}
      />
    );

    expect(
      screen.getByText('税額はStripe Checkoutで確定します。')
    ).toBeInTheDocument();
  });

  test('shows only the trial end date while trialing', () => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({
          subscription: {
            ...activeSubscription,
            billingState: 'trialing',
            stripeStatus: 'trialing',
            trialEnd: '2026-09-08T08:29:00.000Z',
          },
        })}
      />
    );

    expect(screen.getByText('トライアル終了')).toBeInTheDocument();
    expect(screen.queryByText('次回更新日')).not.toBeInTheDocument();
    expect(screen.queryByText('初回30日無料')).not.toBeInTheDocument();
  });

  test('shows only the scheduled usage end date for cancellation', () => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({
          subscription: {
            ...activeSubscription,
            billingState: 'cancel_scheduled',
            cancelAtPeriodEnd: true,
          },
        })}
      />
    );

    expect(screen.getByText('利用終了予定')).toBeInTheDocument();
    expect(screen.queryByText('次回更新日')).not.toBeInTheDocument();
  });

  test('hides checkout and offers a refresh while checkout is pending', () => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({
          subscription: {
            ...activeSubscription,
            billingState: 'checkout_pending',
            stripeStatus: 'none',
          },
        })}
      />
    );

    expect(
      screen.getByRole('button', { name: '契約状態を更新' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Group Starterを申し込む' })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/重複したお申し込みを防ぐ/)).toBeInTheDocument();
  });

  test('directs payment-required contracts to the portal', () => {
    render(
      <AdminBillingPageClient
        snapshot={createSnapshot({
          subscription: {
            ...activeSubscription,
            billingState: 'past_due_locked',
            stripeStatus: 'past_due',
          },
        })}
      />
    );

    expect(
      screen.getByRole('button', { name: '支払い方法を確認' })
    ).toBeEnabled();
  });

  test.each(['canceled', 'expired'] as const)(
    'allows a new application after the contract becomes %s',
    billingState => {
      render(
        <AdminBillingPageClient
          snapshot={createSnapshot({
            subscription: {
              ...activeSubscription,
              billingState,
              stripeStatus: billingState,
              trialConsumed: true,
            },
          })}
        />
      );

      expect(
        screen.getByRole('button', { name: 'Group Starterを申し込む' })
      ).toBeEnabled();
      expect(screen.queryByText('初回30日無料')).not.toBeInTheDocument();
    }
  );

  test.each([
    ['success', /お申し込みを受け付けました/],
    ['cancelled', /お申し込みは完了していません/],
  ] as const)(
    'announces the %s checkout return result',
    (checkoutResult, expectedMessage) => {
      render(
        <AdminBillingPageClient snapshot={createSnapshot({ checkoutResult })} />
      );

      const announcement = screen.getByRole('status');
      expect(announcement).toHaveAttribute('aria-live', 'polite');
      expect(announcement).toHaveTextContent(expectedMessage);
    }
  );

  test('announces checkout API errors without navigating', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: '料金設定を確認してください' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    render(<AdminBillingPageClient snapshot={createSnapshot()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Group Starterを申し込む' })
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        '料金設定を確認してください'
      )
    );
  });
});
