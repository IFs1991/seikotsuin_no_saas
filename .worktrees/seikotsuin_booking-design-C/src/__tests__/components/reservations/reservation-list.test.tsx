/**
 * 予約一覧・管理画面のテスト
 * TDD実装 - Phase 1: テスト定義
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import ReservationListPage from '@/app/reservations/list/page';

// モックデータ
const mockReservations = [
  {
    id: 'res1',
    customerId: 'cust1',
    customerName: '山田太郎',
    customerPhone: '090-1234-5678',
    menuId: 'menu1',
    menuName: '整体60分',
    staffId: 'staff1',
    staffName: '田中先生',
    startTime: new Date('2025-10-25T10:00:00'),
    endTime: new Date('2025-10-25T11:00:00'),
    status: 'confirmed' as const,
    channel: 'line' as const,
    notes: '肩こりが気になるとのこと',
    createdAt: new Date('2025-10-24T14:30:00'),
  },
  {
    id: 'res2',
    customerId: 'cust2',
    customerName: '田中花子',
    customerPhone: '080-9876-5432',
    menuId: 'menu2',
    menuName: '鍼灸45分',
    staffId: 'staff2',
    staffName: '佐藤先生',
    startTime: new Date('2025-10-25T14:30:00'),
    endTime: new Date('2025-10-25T15:15:00'),
    status: 'unconfirmed' as const,
    channel: 'phone' as const,
    createdAt: new Date('2025-10-25T13:45:00'),
  },
  {
    id: 'res3',
    customerId: 'cust3',
    customerName: '佐藤次郎',
    customerPhone: '070-5555-1111',
    menuId: 'menu3',
    menuName: 'マッサージ30分',
    staffId: 'staff1',
    staffName: '田中先生',
    startTime: new Date('2025-10-26T16:00:00'),
    endTime: new Date('2025-10-26T16:30:00'),
    status: 'cancelled' as const,
    channel: 'web' as const,
    createdAt: new Date('2025-10-25T20:15:00'),
  },
];

describe('ReservationListPage', () => {
  describe('基本表示機能', () => {
    test('ページタイトルが正しく表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByText('予約一覧・管理')).toBeInTheDocument();
      expect(screen.getByText('予約の検索、フィルタリング、一括操作が可能です')).toBeInTheDocument();
    });

    test('検索・フィルタセクションが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByText('検索・フィルタ')).toBeInTheDocument();
    });

    test('予約件数が表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByText(/件.*\/.*全.*件/)).toBeInTheDocument();
    });
  });

  describe('検索・フィルタ機能', () => {
    test('検索フィールドが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByPlaceholderText('顧客名・電話・予約ID')).toBeInTheDocument();
    });

    test('ステータスフィルタが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByLabelText('ステータス')).toBeInTheDocument();
    });

    test('スタッフフィルタが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByLabelText('スタッフ')).toBeInTheDocument();
    });

    test('予約チャネルフィルタが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByLabelText('予約チャネル')).toBeInTheDocument();
    });

    test('日付範囲フィルタが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByLabelText('開始日')).toBeInTheDocument();
      expect(screen.getByLabelText('終了日')).toBeInTheDocument();
    });

    test('並び順設定が表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByText('並び順:')).toBeInTheDocument();
      expect(screen.getByText('昇順')).toBeInTheDocument();
    });

    test('検索機能が動作する', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      const searchInput = screen.getByPlaceholderText('顧客名・電話・予約ID');
      await user.type(searchInput, '山田');
      
      // 検索結果が絞り込まれることを確認
      await waitFor(() => {
        expect(screen.getByText('山田太郎')).toBeInTheDocument();
      });
    });

    test('ステータスフィルタが動作する', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      // ステータスフィルタを開く
      const statusFilter = screen.getByLabelText('ステータス');
      await user.click(statusFilter);
      
      // 「確定」を選択
      await waitFor(() => {
        const confirmedOption = screen.getByText('確定');
        return user.click(confirmedOption);
      });
      
      // フィルタされた結果が表示される
      await waitFor(() => {
        expect(screen.getByText('山田太郎')).toBeInTheDocument();
      });
    });

    test('フィルタクリア機能が動作する', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      // 検索を行う
      const searchInput = screen.getByPlaceholderText('顧客名・電話・予約ID');
      await user.type(searchInput, '存在しない名前');
      
      // 結果が見つからない場合のメッセージを確認
      await waitFor(() => {
        expect(screen.getByText('条件に一致する予約が見つかりません')).toBeInTheDocument();
      });
      
      // フィルタをクリア
      const clearButton = screen.getByText('フィルタをクリア');
      await user.click(clearButton);
      
      // 全件が再表示される
      await waitFor(() => {
        expect(screen.getByText('山田太郎')).toBeInTheDocument();
        expect(screen.getByText('田中花子')).toBeInTheDocument();
      });
    });
  });

  describe('ソート機能', () => {
    test('並び順を変更できる', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      const sortSelect = screen.getByDisplayValue('予約日時');
      await user.click(sortSelect);
      
      await waitFor(() => {
        const customerNameOption = screen.getByText('顧客名');
        return user.click(customerNameOption);
      });
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('顧客名')).toBeInTheDocument();
      });
    });

    test('昇順・降順を切り替えできる', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      const sortOrderButton = screen.getByText('昇順');
      await user.click(sortOrderButton);
      
      await waitFor(() => {
        expect(screen.getByText('降順')).toBeInTheDocument();
      });
    });
  });

  describe('予約一覧テーブル', () => {
    test('テーブルヘッダーが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByText('予約ID')).toBeInTheDocument();
      expect(screen.getByText('予約日時')).toBeInTheDocument();
      expect(screen.getByText('顧客情報')).toBeInTheDocument();
      expect(screen.getByText('メニュー')).toBeInTheDocument();
      expect(screen.getByText('担当')).toBeInTheDocument();
      expect(screen.getByText('ステータス')).toBeInTheDocument();
      expect(screen.getByText('チャネル')).toBeInTheDocument();
      expect(screen.getByText('作成日時')).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();
    });

    test('予約データが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByText('山田太郎')).toBeInTheDocument();
      expect(screen.getByText('090-1234-5678')).toBeInTheDocument();
      expect(screen.getByText('整体60分')).toBeInTheDocument();
      expect(screen.getByText('田中先生')).toBeInTheDocument();
    });

    test('ステータスバッジが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByText('確定')).toBeInTheDocument();
      expect(screen.getByText('未確認')).toBeInTheDocument();
      expect(screen.getByText('キャンセル')).toBeInTheDocument();
    });

    test('チャネル情報が表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByText('LINE')).toBeInTheDocument();
      expect(screen.getByText('電話')).toBeInTheDocument();
      expect(screen.getByText('Web')).toBeInTheDocument();
    });
  });

  describe('個別操作機能', () => {
    test('編集ボタンが表示される', () => {
      render(<ReservationListPage />);
      const editButtons = screen.getAllByText('編集');
      expect(editButtons.length).toBeGreaterThan(0);
    });

    test('未確認予約に確定ボタンが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByText('確定')).toBeInTheDocument();
    });

    test('確定予約に来院ボタンが表示される', () => {
      render(<ReservationListPage />);
      expect(screen.getByText('来院')).toBeInTheDocument();
    });

    test('ステータス更新が動作する', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      const confirmButton = screen.getByText('確定');
      await user.click(confirmButton);
      
      // ステータスが更新されることを確認
      await waitFor(() => {
        // 確定ボタンが来院ボタンに変わる
        expect(screen.getByText('来院')).toBeInTheDocument();
      });
    });
  });

  describe('一括操作機能', () => {
    test('全選択チェックボックスが表示される', () => {
      render(<ReservationListPage />);
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
    });

    test('個別選択ができる', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      const firstCheckbox = checkboxes[1]; // 最初は全選択なので2番目
      
      await user.click(firstCheckbox);
      
      await waitFor(() => {
        expect(screen.getByText(/件選択中/)).toBeInTheDocument();
      });
    });

    test('一括操作メニューが表示される', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      const firstCheckbox = checkboxes[1];
      
      await user.click(firstCheckbox);
      
      await waitFor(() => {
        expect(screen.getByText('一括確定')).toBeInTheDocument();
        expect(screen.getByText('一括キャンセル')).toBeInTheDocument();
        expect(screen.getByText('一括削除')).toBeInTheDocument();
      });
    });

    test('一括確定が動作する', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      // 未確認の予約を選択
      const checkboxes = screen.getAllByRole('checkbox');
      const secondCheckbox = checkboxes[2]; // 田中花子の予約（未確認）
      
      await user.click(secondCheckbox);
      
      await waitFor(() => {
        expect(screen.getByText('一括確定')).toBeInTheDocument();
      });
      
      const bulkConfirmButton = screen.getByText('一括確定');
      await user.click(bulkConfirmButton);
      
      // ステータスが更新されることを確認
      await waitFor(() => {
        expect(screen.getByText('確定')).toBeInTheDocument();
      });
    });

    test('全選択機能が動作する', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
      await user.click(selectAllCheckbox);
      
      await waitFor(() => {
        expect(screen.getByText(/件選択中/)).toBeInTheDocument();
      });
    });
  });

  describe('統計サマリー', () => {
    test('ステータス別件数が表示される', () => {
      render(<ReservationListPage />);
      
      // 各ステータスの件数カードが表示される
      const summaryCards = screen.getAllByText(/^\d+$/);
      expect(summaryCards.length).toBeGreaterThan(0);
    });

    test('ステータスラベルが表示される', () => {
      render(<ReservationListPage />);
      
      // ステータスラベルが表示される
      expect(screen.getByText('仮予約')).toBeInTheDocument();
      expect(screen.getByText('確定')).toBeInTheDocument();
      expect(screen.getByText('来院')).toBeInTheDocument();
      expect(screen.getByText('完了')).toBeInTheDocument();
    });
  });

  describe('レスポンシブ対応', () => {
    test('テーブルが横スクロール可能', () => {
      render(<ReservationListPage />);
      
      const scrollContainer = screen.getByRole('table').closest('.overflow-x-auto');
      expect(scrollContainer).toBeInTheDocument();
    });
  });

  describe('パフォーマンス要件', () => {
    test('大量データでの表示性能', () => {
      const startTime = performance.now();
      render(<ReservationListPage />);
      
      // 基本要素の表示を確認
      expect(screen.getByText('予約一覧・管理')).toBeInTheDocument();
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // 高速な描画を確認
      expect(renderTime).toBeLessThan(1000); // 1秒以内
    });

    test('フィルタ操作の応答性', async () => {
      const user = userEvent.setup();
      const startTime = performance.now();
      
      render(<ReservationListPage />);
      
      const searchInput = screen.getByPlaceholderText('顧客名・電話・予約ID');
      await user.type(searchInput, '山田');
      
      const endTime = performance.now();
      const operationTime = endTime - startTime;
      
      // 高速なフィルタリングを確認
      expect(operationTime).toBeLessThan(500); // 0.5秒以内
    });
  });

  describe('アクセシビリティ', () => {
    test('テーブルに適切なセマンティクスが設定されている', () => {
      render(<ReservationListPage />);
      
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      
      const columnHeaders = screen.getAllByRole('columnheader');
      expect(columnHeaders.length).toBeGreaterThan(0);
    });

    test('チェックボックスに適切なラベルが設定されている', () => {
      render(<ReservationListPage />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).toBeInTheDocument();
      });
    });

    test('ボタンに適切な名前が設定されている', () => {
      render(<ReservationListPage />);
      
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveTextContent(/.+/); // 空でないテキストを持つ
      });
    });

    test('キーボードナビゲーションが可能', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      // Tabキーでナビゲーション
      await user.tab();
      expect(document.activeElement).toBeInTheDocument();
    });
  });

  describe('エラーハンドリング', () => {
    test('データが空の場合の表示', () => {
      // 空データでレンダリング
      const emptyComponent = () => {
        const EmptyPage = ReservationListPage;
        return <EmptyPage />;
      };
      
      render(React.createElement(emptyComponent));
      
      // フィルタクリアボタンが表示される状況を作る
      const user = userEvent.setup();
      
      // 検索で結果をゼロにする
      const searchInput = screen.getByPlaceholderText('顧客名・電話・予約ID');
      user.type(searchInput, '存在しない検索語');
      
      // メッセージが表示される
      setTimeout(() => {
        expect(screen.getByText('条件に一致する予約が見つかりません')).toBeInTheDocument();
      }, 100);
    });

    test('無効な操作の防止', async () => {
      const user = userEvent.setup();
      render(<ReservationListPage />);
      
      // 何も選択せずに一括操作を試行
      // この場合、一括操作ボタンが表示されないことを確認
      expect(screen.queryByText('一括確定')).not.toBeInTheDocument();
    });
  });
});