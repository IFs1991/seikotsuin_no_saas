/** @jest-environment jsdom */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { TenantAddDialog } from '@/components/admin/tenant-add-dialog';
import type { ClinicSummary, CreateClinicResult } from '@/lib/admin/tenants';
import type { TenantAddPreview } from '@/lib/billing/tenant-add-preview';

const parentClinic: ClinicSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '本部',
  is_active: true,
  parent_id: null,
  clinic_type: 'hq',
};

const baseCapacityPreview: TenantAddPreview = {
  status: 'base_capacity',
  canCreate: true,
  activeStoreCount: 3,
  afterStoreCount: 4,
  includedStoreCount: 5,
  contractedExtraStoreQuantity: 0,
  contractedStoreLimit: 5,
};

const paidIncreasePreview: TenantAddPreview = {
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
};

function createResult(
  overrides: Partial<CreateClinicResult> = {}
): CreateClinicResult {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: '新宿西口院',
    is_active: true,
    parent_id: parentClinic.id,
    parent_name: parentClinic.name,
    clinic_type: 'child',
    billing_activation_status: 'active',
    billing_activation_result: { status: 'activated' },
    ...overrides,
  };
}

function renderDialog(input?: {
  preview?: TenantAddPreview;
  onPreview?: jest.MockedFunction<
    (parentId: string) => Promise<TenantAddPreview>
  >;
  onCreate?: jest.MockedFunction<
    Parameters<typeof TenantAddDialog>[0]['onCreate']
  >;
  onCreated?: jest.MockedFunction<
    Parameters<typeof TenantAddDialog>[0]['onCreated']
  >;
  onPollClinic?: jest.MockedFunction<
    Parameters<typeof TenantAddDialog>[0]['onPollClinic']
  >;
  parentOptions?: ClinicSummary[];
}) {
  const onPreview =
    input?.onPreview ??
    jest.fn(async () => input?.preview ?? baseCapacityPreview);
  const onCreate = input?.onCreate ?? jest.fn(async () => createResult());
  const onCreated = input?.onCreated ?? jest.fn(async () => undefined);
  const onPollClinic =
    input?.onPollClinic ?? jest.fn(async () => createResult());
  const onOpenChange = jest.fn();

  render(
    <TenantAddDialog
      open
      parentOptions={input?.parentOptions ?? [parentClinic]}
      parentOptionsLoading={false}
      requestError={null}
      onOpenChange={onOpenChange}
      onPreview={onPreview}
      onCreate={onCreate}
      onCreated={onCreated}
      onPollClinic={onPollClinic}
    />
  );

  return {
    onPreview,
    onCreate,
    onCreated,
    onPollClinic,
    onOpenChange,
  };
}

function fillRequiredDetails() {
  fireEvent.change(screen.getByLabelText(/店舗名/), {
    target: { value: '新宿西口院' },
  });
}

function StatefulDialogHarness({
  onCreate = jest.fn(async () => createResult()),
}: {
  onCreate?: Parameters<typeof TenantAddDialog>[0]['onCreate'];
}) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button type='button' onClick={() => setOpen(true)}>
        ダイアログを再度開く
      </button>
      <TenantAddDialog
        open={open}
        parentOptions={[parentClinic]}
        parentOptionsLoading={false}
        requestError={null}
        onOpenChange={setOpen}
        onPreview={async () => baseCapacityPreview}
        onCreate={onCreate}
        onCreated={async () => undefined}
        onPollClinic={async () => createResult()}
      />
    </>
  );
}

beforeAll(() => {
  Element.prototype.hasPointerCapture =
    Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.setPointerCapture =
    Element.prototype.setPointerCapture ?? (() => undefined);
  Element.prototype.releasePointerCapture =
    Element.prototype.releasePointerCapture ?? (() => undefined);
  Element.prototype.scrollIntoView =
    Element.prototype.scrollIntoView ?? (() => undefined);
});

describe('TenantAddDialog', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('2段階で確認し、戻っても入力を保持してから店舗を追加する', async () => {
    const { onPreview, onCreate, onCreated } = renderDialog();

    expect(screen.getByText('この本部の配下へ追加します')).toBeInTheDocument();
    expect(screen.getByLabelText(/店舗名/)).toBeRequired();
    fillRequiredDetails();
    fireEvent.change(screen.getByLabelText('住所（任意）'), {
      target: { value: '東京都新宿区' },
    });
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));

    await screen.findByText('基本料金内で追加できます');
    expect(onPreview).toHaveBeenCalledWith(parentClinic.id);
    expect(screen.getByText('4店舗')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(screen.getByLabelText(/店舗名/)).toHaveValue('新宿西口院');
    expect(screen.getByLabelText('住所（任意）')).toHaveValue('東京都新宿区');
    await waitFor(() => expect(screen.getByLabelText(/店舗名/)).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    await screen.findByText('基本料金内で追加できます');
    fireEvent.click(screen.getByRole('button', { name: '店舗を追加' }));

    await screen.findByText('店舗を追加しました');
    expect(
      screen.getByRole('heading', { name: '店舗追加の結果' })
    ).toHaveFocus();
    expect(onCreate).toHaveBeenCalledWith({
      name: '新宿西口院',
      address: '東京都新宿区',
      phone_number: undefined,
      is_active: true,
      parent_id: parentClinic.id,
      billing_confirmation: undefined,
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('link', { name: '店舗管理者を設定' })
    ).toHaveAttribute(
      'href',
      '/admin/users?clinic_id=22222222-2222-4222-8222-222222222222'
    );
  });

  it('追加料金の確認を事前選択せず、確認前の作成を拒否する', async () => {
    const { onCreate } = renderDialog({ preview: paidIncreasePreview });

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));

    await screen.findByText('追加料金が発生します');
    expect(screen.getAllByText('￥8,000 / 月')).toHaveLength(2);
    expect(screen.getByText('￥86,000 / 月')).toBeInTheDocument();
    expect(screen.getByText('税額は請求時に確定')).toBeInTheDocument();

    const confirmation = screen.getByRole('checkbox', {
      name: /月額増分と追加後の標準月額見込み/,
    });
    expect(confirmation).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '店舗を追加' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText('追加料金を確認してください')).toBeInTheDocument();
    expect(confirmation).toHaveFocus();

    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole('button', { name: '店舗を追加' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_confirmation: {
          acknowledged_paid_increase: true,
          active_store_count: 5,
          target_paid_extra_store_quantity: 1,
          store_addon_unit_amount: 8_000,
          monthly_increase: 8_000,
          standard_monthly_total: 86_000,
        },
      })
    );
  });

  it('料金を確定できない場合は追加を無効化し契約画面へ案内する', async () => {
    renderDialog({
      preview: {
        status: 'blocked',
        canCreate: false,
        reason: 'pricing_unavailable',
        activeStoreCount: 5,
        afterStoreCount: 6,
        includedStoreCount: 5,
        contractedExtraStoreQuantity: 0,
        contractedStoreLimit: 5,
      },
    });

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));

    await screen.findByText('料金情報を確認できません');
    expect(screen.getByRole('button', { name: '店舗を追加' })).toBeDisabled();
    expect(
      screen.getByRole('link', { name: '契約・料金を確認' })
    ).toHaveAttribute('href', '/admin/billing');
  });

  it('条件確認APIの失敗時も入力を保持する', async () => {
    const onPreview = jest.fn(async () => {
      throw new Error('preview failed');
    });
    renderDialog({ onPreview });

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));

    await screen.findByText(/店舗追加の条件を確認できませんでした/);
    expect(screen.getByLabelText(/店舗名/)).toHaveValue('新宿西口院');
  });

  it('明示キャンセル後に遅れて返った料金確認結果を破棄する', async () => {
    let resolvePreview: ((preview: TenantAddPreview) => void) | undefined;
    const previewPromise = new Promise<TenantAddPreview>(resolve => {
      resolvePreview = resolve;
    });
    const onPreview = jest.fn(() => previewPromise);
    const { onOpenChange } = renderDialog({ onPreview });

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await act(async () => {
      resolvePreview?.(baseCapacityPreview);
      await previewPromise;
    });

    expect(
      screen.queryByText('基本料金内で追加できます')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/店舗名/)).toHaveValue('');
  });

  it('料金確認中に親本部を変更した場合は古い結果を破棄する', async () => {
    const user = userEvent.setup();
    const secondParent = {
      ...parentClinic,
      id: '33333333-3333-4333-8333-333333333333',
      name: '第二本部',
    };
    let resolveFirstPreview: ((preview: TenantAddPreview) => void) | undefined;
    const firstPreviewPromise = new Promise<TenantAddPreview>(resolve => {
      resolveFirstPreview = resolve;
    });
    const onPreview = jest.fn(
      async (_parentId: string): Promise<TenantAddPreview> =>
        baseCapacityPreview
    );
    onPreview.mockImplementationOnce(() => firstPreviewPromise);
    renderDialog({
      onPreview,
      parentOptions: [parentClinic, secondParent],
    });

    fireEvent.change(screen.getByLabelText(/店舗名/), {
      target: { value: '新宿西口院' },
    });
    await user.click(screen.getByLabelText(/親本部/));
    await user.click(await screen.findByRole('option', { name: '本部' }));
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    await waitFor(() =>
      expect(onPreview).toHaveBeenCalledWith(parentClinic.id)
    );

    await user.click(screen.getByLabelText(/親本部/));
    await user.click(await screen.findByRole('option', { name: '第二本部' }));

    await act(async () => {
      resolveFirstPreview?.(baseCapacityPreview);
      await firstPreviewPromise;
    });
    expect(
      screen.queryByText('基本料金内で追加できます')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    await screen.findByText('基本料金内で追加できます');
    expect(onPreview).toHaveBeenLastCalledWith(secondParent.id);
  });

  it('複数本部がある場合は親本部を必須にする', async () => {
    renderDialog({
      parentOptions: [
        parentClinic,
        {
          ...parentClinic,
          id: '33333333-3333-4333-8333-333333333333',
          name: '第二本部',
        },
      ],
    });

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));

    expect(
      await screen.findByText('親本部を選択してください')
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/親本部/)).toHaveFocus();
  });

  it('入力エラーへフォーカスし、確認画面の見出しへ移動する', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    expect(screen.getByLabelText(/店舗名/)).toHaveFocus();

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    const reviewHeading = await screen.findByRole('heading', {
      name: '作成内容',
    });
    expect(reviewHeading).toHaveFocus();
  });

  it('Xで閉じた下書きを保持し、明示キャンセル後だけ初期化する', async () => {
    render(<StatefulDialogHarness />);

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'ダイアログを再度開く' })
    );
    expect(screen.getByLabelText(/店舗名/)).toHaveValue('新宿西口院');

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'ダイアログを再度開く' })
    );
    expect(screen.getByLabelText(/店舗名/)).toHaveValue('');
  });

  it('Webhook待ちを2秒間隔で確認し、有効化後は管理者設定へ進める', async () => {
    jest.useFakeTimers();
    const pendingResult = createResult({
      is_active: false,
      billing_activation_status: 'pending_billing',
      billing_activation_result: { status: 'pending_webhook' },
    });
    const onCreate = jest.fn(async () => pendingResult);
    const onPollClinic = jest.fn(async () =>
      createResult({ billing_activation_result: null })
    );
    renderDialog({ onCreate, onPollClinic });

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    await screen.findByText('基本料金内で追加できます');
    fireEvent.click(screen.getByRole('button', { name: '店舗を追加' }));
    await screen.findByText('契約情報を同期しています');

    await act(async () => {
      jest.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    await waitFor(() => expect(onPollClinic).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('店舗を追加しました')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '店舗管理者を設定' })
    ).toBeInTheDocument();
  });

  it('有効化失敗時は内部コードを見せず契約画面へ案内する', async () => {
    const failedResult = createResult({
      is_active: false,
      billing_activation_status: 'billing_failed',
      billing_activation_result: {
        status: 'billing_failed',
        error_code: 'internal_only_code',
      },
    });
    renderDialog({ onCreate: jest.fn(async () => failedResult) });

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    await screen.findByText('基本料金内で追加できます');
    fireEvent.click(screen.getByRole('button', { name: '店舗を追加' }));

    expect(
      await screen.findByText('店舗は作成済みですが、有効化できませんでした')
    ).toBeInTheDocument();
    expect(screen.queryByText('internal_only_code')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '契約・料金を確認' })
    ).toHaveAttribute('href', '/admin/billing');
    expect(
      screen.queryByRole('link', { name: '店舗管理者を設定' })
    ).not.toBeInTheDocument();
  });

  it('30秒で同期確認を終え、重複作成せずバックグラウンド待ちへ移る', async () => {
    jest.useFakeTimers();
    const pendingResult = createResult({
      is_active: false,
      billing_activation_status: 'pending_billing',
      billing_activation_result: { status: 'pending_capacity' },
    });
    const onCreate = jest.fn(async () => pendingResult);
    const onPollClinic = jest.fn(async () => pendingResult);
    renderDialog({ onCreate, onPollClinic });

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    await screen.findByText('基本料金内で追加できます');
    fireEvent.click(screen.getByRole('button', { name: '店舗を追加' }));
    await screen.findByText('契約数量の反映を待っています');

    for (let attempt = 0; attempt < 15; attempt += 1) {
      await act(async () => {
        jest.advanceTimersByTime(2_000);
        await Promise.resolve();
      });
    }

    expect(
      await screen.findByText('バックグラウンドで同期を続けています')
    ).toBeInTheDocument();
    expect(onPollClinic).toHaveBeenCalledTimes(15);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('同期確認APIが応答しなくても30秒で待機表示へ移る', async () => {
    jest.useFakeTimers();
    const pendingResult = createResult({
      is_active: false,
      billing_activation_status: 'pending_billing',
      billing_activation_result: { status: 'pending_webhook' },
    });
    const onPollClinic = jest.fn(
      () => new Promise<ClinicSummary | null>(() => undefined)
    );
    renderDialog({
      onCreate: jest.fn(async () => pendingResult),
      onPollClinic,
    });

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    await screen.findByText('基本料金内で追加できます');
    fireEvent.click(screen.getByRole('button', { name: '店舗を追加' }));
    await screen.findByText('契約情報を同期しています');

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(onPollClinic).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('バックグラウンドで同期を続けています')
    ).toBeInTheDocument();
  });

  it('送信中の連続操作でも作成APIを一度だけ呼ぶ', async () => {
    let resolveCreate:
      | ((result: CreateClinicResult | null) => void)
      | undefined;
    const createPromise = new Promise<CreateClinicResult | null>(resolve => {
      resolveCreate = resolve;
    });
    const onCreate = jest.fn(() => createPromise);
    renderDialog({ onCreate });

    fillRequiredDetails();
    fireEvent.click(screen.getByRole('button', { name: '追加内容を確認' }));
    await screen.findByText('基本料金内で追加できます');

    const createButton = screen.getByRole('button', { name: '店舗を追加' });
    fireEvent.click(createButton);
    fireEvent.click(createButton);
    expect(onCreate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate?.(createResult());
      await createPromise;
    });
    expect(await screen.findByText('店舗を追加しました')).toBeInTheDocument();
  });
});
