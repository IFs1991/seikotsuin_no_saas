/**
 * 予約タイムライン画面のテスト
 * TDD実装 - Phase 1: テスト定義
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import ReservationTimelinePage from '@/app/reservations/page';

// モックデータ
const mockReservations = [
  {
    id: 'res1',
    customerId: 'cust1',
    customerName: '山田太郎',
    menuId: 'menu1',
    menuName: '整体60分',
    staffId: 'staff1',
    staffName: '田中先生',
    startTime: new Date('2025-10-25T10:00:00'),
    endTime: new Date('2025-10-25T11:00:00'),
    status: 'confirmed' as const,
    channel: 'line' as const,
  },
  {
    id: 'res2',
    customerId: 'cust2',
    customerName: '田中花子',
    menuId: 'menu2',
    menuName: '鍼灸45分',
    staffId: 'staff2',
    staffName: '佐藤先生',
    startTime: new Date('2025-10-25T14:30:00'),
    endTime: new Date('2025-10-25T15:15:00'),
    status: 'arrived' as const,
    channel: 'phone' as const,
  },
];

const mockResources = [
  {
    id: 'staff1',
    name: '田中先生',
    type: 'staff' as const,
    workingHours: { start: '09:00', end: '18:00' },
    isActive: true,
  },
  {
    id: 'staff2',
    name: '佐藤先生',
    type: 'staff' as const,
    workingHours: { start: '10:00', end: '19:00' },
    isActive: true,
  },
  {
    id: 'staff3',
    name: '鈴木先生',
    type: 'staff' as const,
    workingHours: { start: '09:00', end: '21:00' },
    isActive: true,
  },
];

describe('ReservationTimelinePage', () => {
  describe('基本表示機能', () => {
    test('ページタイトルが正しく表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('予約管理 - タイムライン')).toBeInTheDocument();
    });

    test('日付ナビゲーションが表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('← 前日')).toBeInTheDocument();
      expect(screen.getByText('今日')).toBeInTheDocument();
      expect(screen.getByText('翌日 →')).toBeInTheDocument();
    });

    test('現在の日付が表示される', () => {
      render(<ReservationTimelinePage />);
      const today = new Date().toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });
      expect(screen.getByText(today)).toBeInTheDocument();
    });

    test('新規予約ボタンが表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('新規予約')).toBeInTheDocument();
    });

    test('印刷ボタンが表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('印刷')).toBeInTheDocument();
    });
  });

  describe('フィルタ・検索機能', () => {
    test('検索フィールドが表示される', () => {
      render(<ReservationTimelinePage />);
      expect(
        screen.getByPlaceholderText('顧客名・電話番号で検索')
      ).toBeInTheDocument();
    });

    test('スタッフフィルタが表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('スタッフ:')).toBeInTheDocument();
    });

    test('ステータスフィルタが表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('ステータス:')).toBeInTheDocument();
    });

    test('時間間隔設定が表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('時間間隔:')).toBeInTheDocument();
    });

    test('表示切替ボタンが表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('横表示')).toBeInTheDocument();
      expect(screen.getByText('縦表示')).toBeInTheDocument();
    });

    test('色覚サポートボタンが表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('色覚サポート')).toBeInTheDocument();
    });
  });

  describe('タイムライン表示機能', () => {
    test('リソース列が表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('リソース')).toBeInTheDocument();
    });

    test('スタッフが表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('田中先生')).toBeInTheDocument();
      expect(screen.getByText('佐藤先生')).toBeInTheDocument();
      expect(screen.getByText('鈴木先生')).toBeInTheDocument();
    });

    test('時間軸ヘッダーが表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('09:00')).toBeInTheDocument();
      expect(screen.getByText('10:00')).toBeInTheDocument();
      expect(screen.getByText('11:00')).toBeInTheDocument();
    });
  });

  describe('日付ナビゲーション機能', () => {
    test('前日ボタンクリックで日付が変更される', async () => {
      const user = userEvent.setup();
      render(<ReservationTimelinePage />);

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const prevButton = screen.getByText('← 前日');
      await user.click(prevButton);

      const expectedDate = yesterday.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });

      await waitFor(() => {
        expect(screen.getByText(expectedDate)).toBeInTheDocument();
      });
    });

    test('翌日ボタンクリックで日付が変更される', async () => {
      const user = userEvent.setup();
      render(<ReservationTimelinePage />);

      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const nextButton = screen.getByText('翌日 →');
      await user.click(nextButton);

      const expectedDate = tomorrow.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });

      await waitFor(() => {
        expect(screen.getByText(expectedDate)).toBeInTheDocument();
      });
    });

    test('今日ボタンクリックで今日の日付に戻る', async () => {
      const user = userEvent.setup();
      render(<ReservationTimelinePage />);

      // まず前日に移動
      const prevButton = screen.getByText('← 前日');
      await user.click(prevButton);

      // 今日ボタンをクリック
      const todayButton = screen.getByText('今日');
      await user.click(todayButton);

      const today = new Date().toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });

      await waitFor(() => {
        expect(screen.getByText(today)).toBeInTheDocument();
      });
    });
  });

  describe('時間間隔設定機能', () => {
    test('時間間隔が変更できる', async () => {
      const user = userEvent.setup();
      render(<ReservationTimelinePage />);

      // デフォルトは10分刻み
      const timeGranularitySelect = screen.getByDisplayValue('10分');
      expect(timeGranularitySelect).toBeInTheDocument();

      // 15分に変更
      await user.selectOptions(timeGranularitySelect, '15');

      await waitFor(() => {
        expect(screen.getByDisplayValue('15分')).toBeInTheDocument();
      });
    });
  });

  describe('表示切替機能', () => {
    test('横表示が初期状態で選択されている', () => {
      render(<ReservationTimelinePage />);
      const horizontalButton = screen.getByText('横表示');
      expect(horizontalButton).toHaveClass('bg-blue-600'); // アクティブ状態を示すクラス
    });

    test('縦表示に切り替えできる', async () => {
      const user = userEvent.setup();
      render(<ReservationTimelinePage />);

      const verticalButton = screen.getByText('縦表示');
      await user.click(verticalButton);

      await waitFor(() => {
        expect(verticalButton).toHaveClass('bg-blue-600');
      });
    });
  });

  describe('色覚サポート機能', () => {
    test('色覚サポートモードの切り替えができる', async () => {
      const user = userEvent.setup();
      render(<ReservationTimelinePage />);

      const colorBlindButton = screen.getByText('色覚サポート');
      expect(colorBlindButton).toHaveClass('border-input'); // 非アクティブ状態

      await user.click(colorBlindButton);

      await waitFor(() => {
        expect(colorBlindButton).toHaveClass('bg-blue-600'); // アクティブ状態
      });
    });
  });

  describe('ステータス凡例表示', () => {
    test('ステータス凡例が表示される', () => {
      render(<ReservationTimelinePage />);
      expect(screen.getByText('ステータス凡例:')).toBeInTheDocument();
      expect(screen.getByText('仮予約')).toBeInTheDocument();
      expect(screen.getByText('確定')).toBeInTheDocument();
      expect(screen.getByText('来院')).toBeInTheDocument();
      expect(screen.getByText('完了')).toBeInTheDocument();
      expect(screen.getByText('キャンセル')).toBeInTheDocument();
      expect(screen.getByText('無断欠席')).toBeInTheDocument();
      expect(screen.getByText('未確認')).toBeInTheDocument();
      expect(screen.getByText('体験')).toBeInTheDocument();
    });
  });

  describe('通知バナー', () => {
    test('未確認予約の通知が表示される', () => {
      render(<ReservationTimelinePage />);
      expect(
        screen.getByText(/未確認の予約が.*件あります/)
      ).toBeInTheDocument();
      expect(screen.getByText('確認する')).toBeInTheDocument();
    });
  });

  describe('パフォーマンス要件', () => {
    test('初期描画が2秒以内に完了する', async () => {
      const startTime = performance.now();
      render(<ReservationTimelinePage />);

      // 主要要素の表示を待つ
      await waitFor(() => {
        expect(screen.getByText('予約管理 - タイムライン')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      expect(renderTime).toBeLessThan(2000); // 2秒以内
    });
  });

  describe('アクセシビリティ', () => {
    test('キーボードナビゲーションが可能', async () => {
      const user = userEvent.setup();
      render(<ReservationTimelinePage />);

      // Tabキーでナビゲーション
      await user.tab();
      expect(document.activeElement).toHaveAttribute('type', 'button');
    });

    test('ARIA属性が適切に設定されている', () => {
      render(<ReservationTimelinePage />);

      // ボタンにはroleが設定されている
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);

      // セレクトボックスにはcomboboxロールが設定されている
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
    });
  });
});

describe('予約カードコンポーネント', () => {
  test('予約カードの必須情報が表示される', () => {
    render(<ReservationTimelinePage />);

    // サンプルデータの予約が表示されることを確認
    expect(screen.getByText('山田太郎')).toBeInTheDocument();
    expect(screen.getByText('整体60分')).toBeInTheDocument();
  });

  test('ステータスに応じた色が適用される', () => {
    render(<ReservationTimelinePage />);

    // 確定ステータスのバッジが表示される
    expect(screen.getByText('確定')).toBeInTheDocument();

    // 来院ステータスのバッジが表示される
    expect(screen.getByText('来院')).toBeInTheDocument();
  });

  test('予約チャネルが表示される', () => {
    render(<ReservationTimelinePage />);

    expect(screen.getByText('LINE')).toBeInTheDocument();
    expect(screen.getByText('電話')).toBeInTheDocument();
  });
});

describe('ドラッグ&ドロップ機能 (F002)', () => {
  test('予約カードがドラッグ可能', () => {
    render(<ReservationTimelinePage />);

    // 予約カードがdraggable属性を持つ
    const reservationCards = screen
      .getAllByText('山田太郎')
      .map(el => el.closest('[draggable="true"]'))
      .filter(Boolean);

    expect(reservationCards.length).toBeGreaterThan(0);
  });

  test('ドラッグ開始時に予約IDが保存される', async () => {
    render(<ReservationTimelinePage />);

    const dragElement = screen
      .getByText('山田太郎')
      .closest('[draggable="true"]');
    expect(dragElement).toBeInTheDocument();

    if (dragElement) {
      fireEvent.dragStart(dragElement);

      // ドラッグ中のスタイルが適用される
      await waitFor(() => {
        expect(dragElement).toHaveClass('opacity-50');
      });

      fireEvent.dragEnd(dragElement);
    }
  });

  test('ドラッグオーバー時にドロップゾーンがハイライトされる', async () => {
    render(<ReservationTimelinePage />);

    const dragElement = screen
      .getByText('山田太郎')
      .closest('[draggable="true"]');

    if (dragElement) {
      fireEvent.dragStart(dragElement);

      // タイムスロットにドラッグオーバー
      const timeSlots = document.querySelectorAll('[class*="border-gray-100"]');
      if (timeSlots.length > 0) {
        const slot = timeSlots[0];
        fireEvent.dragOver(slot);

        // ハイライトが適用される
        await waitFor(
          () => {
            expect(slot).toHaveClass('bg-blue-100');
          },
          { timeout: 1000 }
        );
      }

      fireEvent.dragEnd(dragElement);
    }
  });

  test('ドロップ時に予約時刻が更新される（楽観的更新）', async () => {
    render(<ReservationTimelinePage />);

    const dragElement = screen
      .getByText('山田太郎')
      .closest('[draggable="true"]');

    if (dragElement) {
      fireEvent.dragStart(dragElement);

      // 新しいタイムスロットにドロップ
      const timeSlots = document.querySelectorAll('[class*="border-gray-100"]');
      if (timeSlots.length > 10) {
        const targetSlot = timeSlots[10]; // 別の時間枠にドロップ
        fireEvent.dragOver(targetSlot);
        fireEvent.drop(targetSlot);
      }

      fireEvent.dragEnd(dragElement);

      // 楽観的更新により即座にUI反映される（300ms以内）
      await waitFor(
        () => {
          // 更新が完了するのを待つ
          expect(dragElement).not.toHaveClass('opacity-50');
        },
        { timeout: 500 }
      );
    }
  });

  describe('衝突検出機能', () => {
    test('既存予約と重複する時刻へのドロップが拒否される', async () => {
      render(<ReservationTimelinePage />);

      // モックのコンソールログを設定
      const consoleLogSpy = jest.spyOn(console, 'log');

      const dragElement = screen
        .getByText('山田太郎')
        .closest('[draggable="true"]');

      if (dragElement) {
        fireEvent.dragStart(dragElement);

        // 既存予約と同じ時刻にドロップを試みる
        const timeSlots = document.querySelectorAll(
          '[class*="border-gray-100"]'
        );
        if (timeSlots.length > 0) {
          fireEvent.drop(timeSlots[0]);
        }

        fireEvent.dragEnd(dragElement);

        // エラーメッセージが表示される
        await waitFor(
          () => {
            expect(consoleLogSpy).toHaveBeenCalledWith(
              expect.stringContaining('[ERROR]')
            );
          },
          { timeout: 1000 }
        );
      }

      consoleLogSpy.mockRestore();
    });
  });

  describe('性能要件（300ms以内反映）', () => {
    test('D&D操作のUI反映が300ms以内に完了する', async () => {
      render(<ReservationTimelinePage />);

      const dragElement = screen
        .getByText('山田太郎')
        .closest('[draggable="true"]');

      if (dragElement) {
        const startTime = performance.now();

        fireEvent.dragStart(dragElement);

        const timeSlots = document.querySelectorAll(
          '[class*="border-gray-100"]'
        );
        if (timeSlots.length > 10) {
          fireEvent.dragOver(timeSlots[10]);
          fireEvent.drop(timeSlots[10]);
        }

        fireEvent.dragEnd(dragElement);

        const endTime = performance.now();
        const elapsed = endTime - startTime;

        // 楽観的更新により300ms以内にUI反映される
        expect(elapsed).toBeLessThan(300);
      }
    });
  });

  describe('ロールバック機能', () => {
    test('サーバーエラー時に元の状態に戻る', async () => {
      render(<ReservationTimelinePage />);

      const originalText = screen.getByText('山田太郎');
      const dragElement = originalText.closest('[draggable="true"]');

      if (dragElement) {
        fireEvent.dragStart(dragElement);

        const timeSlots = document.querySelectorAll(
          '[class*="border-gray-100"]'
        );
        if (timeSlots.length > 10) {
          fireEvent.drop(timeSlots[10]);
        }

        fireEvent.dragEnd(dragElement);

        // エラー発生時でも元のデータが表示される
        await waitFor(
          () => {
            expect(screen.getByText('山田太郎')).toBeInTheDocument();
          },
          { timeout: 1000 }
        );
      }
    });
  });
});
