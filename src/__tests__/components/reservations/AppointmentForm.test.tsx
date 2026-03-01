/** @jest-environment jsdom */
/**
 * AppointmentForm コンポーネントのテスト
 *
 * 対象: 2-2 フィールド順序変更 & 2-3 Option A カラーUI削除
 * TDD: t-wada 流 - 失敗するテストから始める
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppointmentForm } from '@/app/reservations/components/AppointmentForm';
import type { MenuItem, SchedulerResource } from '@/app/reservations/types';

// API モック
jest.mock('@/app/reservations/api', () => ({
  fetchCustomers: jest.fn().mockResolvedValue([]),
  createCustomer: jest
    .fn()
    .mockResolvedValue({ id: 'customer-1', name: '山田 太郎' }),
  createReservation: jest.fn().mockResolvedValue({
    id: 'reservation-1',
    status: 'unconfirmed',
  }),
}));

// モック参照（三角測量テストで status を変更するため）
const { createReservation } = jest.requireMock('@/app/reservations/api') as {
  createReservation: jest.Mock;
};

afterEach(() => {
  jest.clearAllMocks();
  // デフォルトの戻り値に戻す（三角測量テストが変更した場合の復元）
  createReservation.mockResolvedValue({
    id: 'reservation-1',
    status: 'unconfirmed',
  });
});

const mockResources: SchedulerResource[] = [
  { id: 'resource-1', name: '田中 花子', type: 'staff' },
];

const mockMenus: MenuItem[] = [
  {
    id: 'menu-1',
    name: '全身矯正',
    durationMinutes: 60,
    price: 5000,
    options: [],
  },
];

const mockAppointments = [] as any[];

const renderForm = (
  overrides?: Partial<Parameters<typeof AppointmentForm>[0]>
) => {
  const defaultProps = {
    clinicId: 'clinic-1',
    resources: mockResources,
    menus: mockMenus,
    onSuccess: jest.fn(),
    onCancel: jest.fn(),
    appointments: mockAppointments,
  };
  return render(<AppointmentForm {...defaultProps} {...overrides} />);
};

/**
 * DOM上で要素 a が要素 b より前に現れるか検証するヘルパー
 * Node.compareDocumentPosition を使用（ラベルと入力どちらにも使用可）
 */
const isBeforeInDocument = (a: Node, b: Node): boolean =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/**
 * ラベルテキストに対応する最近傍の入力要素（input/select/textarea）を返すヘルパー
 */
const getInputNearLabel = (labelText: string): HTMLElement | null => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(l => l.textContent?.trim() === labelText);
  if (!label) return null;
  const container = label.closest('div');
  return container?.querySelector('input, select, textarea') ?? null;
};

// ─────────────────────────────────────────────────────────────
// 2-2: フィールド順序テスト
// 推奨順: 来店日 → 開始時間 → 担当・設備 → メニュー+オプション → 電話番号 → お名前 → カスタム属性
// ─────────────────────────────────────────────────────────────
describe('2-2: フォームフィールド順序', () => {
  it('来店日フィールドが電話番号フィールドより前に表示される', () => {
    renderForm();
    const dateInput = document.querySelector(
      'input[type="date"]'
    ) as HTMLElement;
    const phoneInput = screen.getByPlaceholderText('090-1234-5678');

    expect(dateInput).toBeInTheDocument();
    expect(phoneInput).toBeInTheDocument();
    expect(isBeforeInDocument(dateInput, phoneInput)).toBe(true);
  });

  it('開始時間フィールドが電話番号フィールドより前に表示される', () => {
    renderForm();
    // 開始時間の時入力 (number, min=9, max=23)
    const startHourInput = document.querySelector(
      'input[type="number"][min="9"][max="23"]'
    ) as HTMLElement;
    const phoneInput = screen.getByPlaceholderText('090-1234-5678');

    expect(startHourInput).toBeInTheDocument();
    expect(isBeforeInDocument(startHourInput, phoneInput)).toBe(true);
  });

  it('担当・設備セレクトボックスが電話番号フィールドより前に表示される', () => {
    renderForm();
    const staffSelect = getInputNearLabel('担当・設備');
    const phoneInput = screen.getByPlaceholderText('090-1234-5678');

    expect(staffSelect).toBeInTheDocument();
    expect(isBeforeInDocument(staffSelect!, phoneInput)).toBe(true);
  });

  it('メニューセレクトボックスが電話番号フィールドより前に表示される', () => {
    renderForm();
    const menuSelect = getInputNearLabel('メニュー');
    const phoneInput = screen.getByPlaceholderText('090-1234-5678');

    expect(menuSelect).toBeInTheDocument();
    expect(isBeforeInDocument(menuSelect!, phoneInput)).toBe(true);
  });

  it('電話番号フィールドが姓フィールドより前に表示される', () => {
    renderForm();
    const phoneInput = screen.getByPlaceholderText('090-1234-5678');
    const lastNameInput = screen.getByPlaceholderText('姓 (例: 山田)');

    expect(isBeforeInDocument(phoneInput, lastNameInput)).toBe(true);
  });

  it('お名前フィールドがカスタム属性（主な症状）フィールドより前に表示される', () => {
    renderForm();
    const lastNameInput = screen.getByPlaceholderText('姓 (例: 山田)');
    const symptomInput = screen.getByPlaceholderText('例: 肩こり');

    expect(isBeforeInDocument(lastNameInput, symptomInput)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// セルフレビュー修正1: mt-4 スペーシング不整合
// ─────────────────────────────────────────────────────────────
describe('セルフレビュー修正1: スペーシング整合性', () => {
  it('電話番号フィールドのコンテナが余分な mt-4 クラスを持たない（space-y-6 で統一）', () => {
    renderForm();
    const phoneInput = screen.getByPlaceholderText('090-1234-5678');
    // 電話番号 input の親 div が mt-4 を持つと他セクションとスペーシングが不整合になる
    expect(phoneInput.parentElement?.className).not.toContain('mt-4');
  });
});

// ─────────────────────────────────────────────────────────────
// 2-3 Option A: カラーUI削除テスト
// ─────────────────────────────────────────────────────────────
describe('2-3 Option A: カラー選択UI削除', () => {
  it('カラーラベルセクションがフォーム内に存在しない', () => {
    renderForm();
    expect(screen.queryByText('カラーラベル')).not.toBeInTheDocument();
  });

  it('カラー選択用の丸ボタンが存在しない', () => {
    renderForm();
    // カラーボタンは w-8 h-8 rounded-full で識別できる
    const colorButtons = document.querySelectorAll('.w-8.h-8.rounded-full');
    expect(colorButtons).toHaveLength(0);
  });

  it('フォーム送信後 onSuccess に渡される color が statusToColor 由来の orange になる', async () => {
    const onSuccess = jest.fn();
    renderForm({ onSuccess });

    // 必須フィールドを埋める
    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2026-02-22' },
    });
    fireEvent.change(screen.getByPlaceholderText('090-1234-5678'), {
      target: { value: '090-1234-5678' },
    });
    fireEvent.change(screen.getByPlaceholderText('姓 (例: 山田)'), {
      target: { value: '山田' },
    });
    fireEvent.change(screen.getByPlaceholderText('名 (例: 太郎)'), {
      target: { value: '太郎' },
    });

    const form = screen
      .getByRole('button', { name: '登録する' })
      .closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    const calledWith = onSuccess.mock.calls[0][0];
    // DB の status デフォルトは 'unconfirmed' → statusToColor → 'orange'
    expect(calledWith.color).toBe('orange');
  });

  it('フォーム送信後 onSuccess に渡される status が unconfirmed になる', async () => {
    const onSuccess = jest.fn();
    renderForm({ onSuccess });

    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2026-02-22' },
    });
    fireEvent.change(screen.getByPlaceholderText('090-1234-5678'), {
      target: { value: '090-1234-5678' },
    });
    fireEvent.change(screen.getByPlaceholderText('姓 (例: 山田)'), {
      target: { value: '山田' },
    });
    fireEvent.change(screen.getByPlaceholderText('名 (例: 太郎)'), {
      target: { value: '太郎' },
    });

    const form = screen
      .getByRole('button', { name: '登録する' })
      .closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    const calledWith = onSuccess.mock.calls[0][0];
    expect(calledWith.status).toBe('unconfirmed');
  });

  // ── 三角測量: API が confirmed を返すケース ──
  it('三角測量: API が status=confirmed を返した場合 color が blue になる', async () => {
    // DB が confirmed ステータスで登録済みの予約を返す状況を想定
    createReservation.mockResolvedValue({
      id: 'reservation-2',
      status: 'confirmed',
    });

    const onSuccess = jest.fn();
    renderForm({ onSuccess });

    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: '2026-02-22' },
    });
    fireEvent.change(screen.getByPlaceholderText('090-1234-5678'), {
      target: { value: '090-9999-0000' },
    });
    fireEvent.change(screen.getByPlaceholderText('姓 (例: 山田)'), {
      target: { value: '鈴木' },
    });
    fireEvent.change(screen.getByPlaceholderText('名 (例: 太郎)'), {
      target: { value: '一郎' },
    });

    const form = screen
      .getByRole('button', { name: '登録する' })
      .closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    const calledWith = onSuccess.mock.calls[0][0];
    // statusToColor('confirmed') = 'blue'
    expect(calledWith.color).toBe('blue');
    expect(calledWith.status).toBe('confirmed');
  });
});
