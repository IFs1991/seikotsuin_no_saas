import {
  buildTenantAddPreview,
  type TenantAddPriceSnapshot,
  type TenantAddSubscriptionSnapshot,
} from '@/lib/billing/tenant-add-preview';

const subscription: TenantAddSubscriptionSnapshot = {
  planCode: 'group',
  billingState: 'active',
  includedStoreQuantity: 5,
  paidExtraStoreQuantity: 0,
  canIncreaseStripeQuantity: true,
};

const prices: TenantAddPriceSnapshot = {
  groupBase: {
    currency: 'jpy',
    unitAmount: 78_000,
    interval: 'month',
    taxBehavior: 'unspecified',
  },
  storeAddon: {
    currency: 'jpy',
    unitAmount: 8_000,
    interval: 'month',
    taxBehavior: 'unspecified',
  },
};

describe('buildTenantAddPreview', () => {
  it.each([
    [3, 4],
    [4, 5],
  ])(
    '%i店舗では追加後%i店舗を基本料金内として返す',
    (activeStoreCount, afterStoreCount) => {
      expect(
        buildTenantAddPreview({
          billingGuardEnabled: true,
          activeStoreCount,
          subscription,
        })
      ).toEqual({
        status: 'base_capacity',
        canCreate: true,
        activeStoreCount,
        afterStoreCount,
        includedStoreCount: 5,
        contractedExtraStoreQuantity: 0,
        contractedStoreLimit: 5,
      });
    }
  );

  it('6店舗目の追加料金と追加後の標準月額を安全な表示値だけで返す', () => {
    const preview = buildTenantAddPreview({
      billingGuardEnabled: true,
      activeStoreCount: 5,
      subscription,
      prices,
    });

    expect(preview).toEqual({
      status: 'paid_quantity_increase',
      canCreate: true,
      activeStoreCount: 5,
      afterStoreCount: 6,
      includedStoreCount: 5,
      contractedExtraStoreQuantity: 0,
      contractedStoreLimit: 5,
      pricing: {
        currency: 'jpy',
        interval: 'month',
        taxBehavior: 'unspecified',
        storeAddonUnitAmount: 8_000,
        quantityIncrease: 1,
        monthlyIncrease: 8_000,
        standardMonthlyTotal: 86_000,
      },
    });

    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain('price_');
    expect(serialized).not.toContain('cus_');
    expect(serialized).not.toContain('sub_');
    expect(serialized).not.toContain('secret');
  });

  it('複数の追加店舗でも今回必要な数量差分だけを算出する', () => {
    const preview = buildTenantAddPreview({
      billingGuardEnabled: true,
      activeStoreCount: 7,
      subscription: {
        ...subscription,
        paidExtraStoreQuantity: 2,
      },
      prices,
    });

    expect(preview.status).toBe('paid_quantity_increase');
    if (preview.status !== 'paid_quantity_increase') {
      throw new Error('Expected paid quantity increase preview');
    }

    expect(preview.pricing).toEqual(
      expect.objectContaining({
        quantityIncrease: 1,
        monthlyIncrease: 8_000,
        standardMonthlyTotal: 102_000,
      })
    );
  });

  it('契約済みの追加店舗枠内なら新しい料金確認を要求しない', () => {
    expect(
      buildTenantAddPreview({
        billingGuardEnabled: true,
        activeStoreCount: 5,
        subscription: {
          ...subscription,
          paidExtraStoreQuantity: 2,
        },
      })
    ).toEqual(
      expect.objectContaining({
        status: 'existing_paid_capacity',
        canCreate: true,
        afterStoreCount: 6,
        contractedStoreLimit: 7,
      })
    );
  });

  it.each([
    [null, 'subscription_missing'],
    [
      { ...subscription, planCode: 'single_clinic' as const },
      'group_plan_required',
    ],
    [
      { ...subscription, billingState: 'past_due_locked' as const },
      'billing_state_unavailable',
    ],
  ])('契約条件を満たさない場合はfail-closedにする', (candidate, reason) => {
    expect(
      buildTenantAddPreview({
        billingGuardEnabled: true,
        activeStoreCount: 3,
        subscription: candidate,
      })
    ).toEqual(
      expect.objectContaining({
        status: 'blocked',
        canCreate: false,
        reason,
      })
    );
  });

  it('現在店舗数に対して契約数量が不足している場合は追加を止める', () => {
    expect(
      buildTenantAddPreview({
        billingGuardEnabled: true,
        activeStoreCount: 6,
        subscription,
        prices,
      })
    ).toEqual(
      expect.objectContaining({
        status: 'blocked',
        canCreate: false,
        reason: 'quantity_sync_pending',
      })
    );
  });

  it('前の店舗追加処理が未解決なら新しい追加を止める', () => {
    expect(
      buildTenantAddPreview({
        billingGuardEnabled: true,
        activeStoreCount: 5,
        unresolvedActivationCount: 1,
        subscription,
        prices,
      })
    ).toEqual(
      expect.objectContaining({
        status: 'blocked',
        canCreate: false,
        reason: 'activation_pending',
      })
    );
  });

  it('有料追加で料金を取得できない場合は推測せず追加を止める', () => {
    expect(
      buildTenantAddPreview({
        billingGuardEnabled: true,
        activeStoreCount: 5,
        subscription,
      })
    ).toEqual(
      expect.objectContaining({
        status: 'blocked',
        canCreate: false,
        reason: 'pricing_unavailable',
      })
    );
  });

  it('Stripe契約数量の更新先がない有料追加を止める', () => {
    expect(
      buildTenantAddPreview({
        billingGuardEnabled: true,
        activeStoreCount: 5,
        subscription: {
          ...subscription,
          canIncreaseStripeQuantity: false,
        },
        prices,
      })
    ).toEqual(
      expect.objectContaining({
        status: 'blocked',
        canCreate: false,
        reason: 'quantity_update_unavailable',
      })
    );
  });

  it('契約ガード無効時はStripe情報を参照せず作成可能とする', () => {
    expect(
      buildTenantAddPreview({
        billingGuardEnabled: false,
        activeStoreCount: 3,
        subscription: null,
      })
    ).toEqual({
      status: 'billing_disabled',
      canCreate: true,
      activeStoreCount: 3,
      afterStoreCount: 4,
      includedStoreCount: 0,
      contractedExtraStoreQuantity: 0,
      contractedStoreLimit: 0,
    });
  });

  it('不正な店舗数を拒否する', () => {
    expect(() =>
      buildTenantAddPreview({
        billingGuardEnabled: true,
        activeStoreCount: -1,
        subscription,
      })
    ).toThrow('activeStoreCount must be a non-negative integer');
  });
});
