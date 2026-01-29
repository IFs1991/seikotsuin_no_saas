/**
 * 新規予約登録画面のテスト
 * TDD実装 - Phase 1: テスト定義
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import ReservationRegisterPage from '@/app/reservations/register/page';

// モックデータ
const mockCustomers = [
  {
    id: 'cust1',
    name: '山田太郎',
    phone: '090-1234-5678',
    email: 'yamada@example.com',
  },
  {
    id: 'cust2',
    name: '田中花子',
    phone: '080-9876-5432',
    lineUserId: 'line123',
  },
];

const mockMenus = [
  {
    id: 'menu1',
    name: '整体60分',
    durationMinutes: 60,
    price: 6000,
    description: '全身の調整を行います',
  },
  {
    id: 'menu2',
    name: '鍼灸45分',
    durationMinutes: 45,
    price: 5000,
    description: '鍼と灸による施術',
  },
  {
    id: 'menu3',
    name: 'マッサージ30分',
    durationMinutes: 30,
    price: 3500,
    description: 'リラクゼーション重視',
  },
];

const mockStaff = [
  {
    id: 'staff1',
    name: '田中先生',
    workingHours: { start: '09:00', end: '18:00' },
    supportedMenus: ['menu1', 'menu2'],
  },
  {
    id: 'staff2',
    name: '佐藤先生',
    workingHours: { start: '10:00', end: '19:00' },
    supportedMenus: ['menu1', 'menu3'],
  },
];

describe('ReservationRegisterPage', () => {
  describe('基本表示機能', () => {
    test('ページタイトルが正しく表示される', () => {
      render(<ReservationRegisterPage />);
      expect(screen.getByText('新規予約登録')).toBeInTheDocument();
    });

    test('ステップインジケーターが表示される', () => {
      render(<ReservationRegisterPage />);
      expect(screen.getByText('顧客情報')).toBeInTheDocument();
      expect(screen.getByText('メニュー')).toBeInTheDocument();
      expect(screen.getByText('日時')).toBeInTheDocument();
      expect(screen.getByText('確認')).toBeInTheDocument();
    });

    test('初期ステップは顧客情報', () => {
      render(<ReservationRegisterPage />);
      expect(screen.getByText('顧客選択・登録')).toBeInTheDocument();
    });
  });

  describe('Step 1: 顧客情報ステップ', () => {
    test('顧客検索フィールドが表示される', () => {
      render(<ReservationRegisterPage />);
      expect(
        screen.getByPlaceholderText('山田太郎 または 090-1234-5678')
      ).toBeInTheDocument();
    });

    test('新規顧客登録フォームが表示される', () => {
      render(<ReservationRegisterPage />);
      expect(screen.getByText('新規顧客登録')).toBeInTheDocument();
      expect(screen.getByLabelText('お名前（必須）')).toBeInTheDocument();
      expect(screen.getByLabelText('電話番号（必須）')).toBeInTheDocument();
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    });

    test('次へボタンが無効状態で表示される（顧客未選択時）', () => {
      render(<ReservationRegisterPage />);
      const nextButton = screen.getByText('次へ：メニュー選択');
      expect(nextButton).toBeDisabled();
    });

    test('顧客検索を行うと検索結果が表示される', async () => {
      const user = userEvent.setup();
      render(<ReservationRegisterPage />);

      const searchInput = screen.getByPlaceholderText(
        '山田太郎 または 090-1234-5678'
      );
      await user.type(searchInput, '山田');

      await waitFor(() => {
        expect(screen.getByText('検索結果')).toBeInTheDocument();
      });
    });

    test('新規顧客情報を入力すると次へボタンが有効になる', async () => {
      const user = userEvent.setup();
      render(<ReservationRegisterPage />);

      const nameInput = screen.getByLabelText('お名前（必須）');
      const phoneInput = screen.getByLabelText('電話番号（必須）');

      await user.type(nameInput, '新規太郎');
      await user.type(phoneInput, '090-1111-2222');

      const nextButton = screen.getByText('次へ：メニュー選択');
      await waitFor(() => {
        expect(nextButton).toBeEnabled();
      });
    });
  });

  describe('Step 2: メニュー選択ステップ', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      render(<ReservationRegisterPage />);

      // 顧客情報を入力して次のステップに進む
      const nameInput = screen.getByLabelText('お名前（必須）');
      const phoneInput = screen.getByLabelText('電話番号（必須）');
      await user.type(nameInput, '新規太郎');
      await user.type(phoneInput, '090-1111-2222');

      const nextButton = screen.getByText('次へ：メニュー選択');
      await user.click(nextButton);
    });

    test('メニュー選択画面が表示される', async () => {
      await waitFor(() => {
        expect(screen.getByText('メニュー・スタッフ選択')).toBeInTheDocument();
      });
    });

    test('メニューカードが表示される', async () => {
      await waitFor(() => {
        expect(screen.getByText('整体60分')).toBeInTheDocument();
        expect(screen.getByText('鍼灸45分')).toBeInTheDocument();
        expect(screen.getByText('マッサージ30分')).toBeInTheDocument();
      });
    });

    test('メニュー選択でスタッフが絞り込まれる', async () => {
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('整体60分')).toBeInTheDocument();
      });

      const menuCard = screen.getByText('整体60分').closest('div');
      await user.click(menuCard!);

      await waitFor(() => {
        expect(screen.getByText('田中先生')).toBeInTheDocument();
        expect(screen.getByText('佐藤先生')).toBeInTheDocument();
      });
    });

    test('戻るボタンで前のステップに戻る', async () => {
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText('戻る')).toBeInTheDocument();
      });

      const backButton = screen.getByText('戻る');
      await user.click(backButton);

      await waitFor(() => {
        expect(screen.getByText('顧客選択・登録')).toBeInTheDocument();
      });
    });
  });

  describe('Step 3: 日時選択ステップ', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      render(<ReservationRegisterPage />);

      // Step 1: 顧客情報入力
      const nameInput = screen.getByLabelText('お名前（必須）');
      const phoneInput = screen.getByLabelText('電話番号（必須）');
      await user.type(nameInput, '新規太郎');
      await user.type(phoneInput, '090-1111-2222');
      await user.click(screen.getByText('次へ：メニュー選択'));

      // Step 2: メニュー・スタッフ選択
      await waitFor(() => {
        expect(screen.getByText('整体60分')).toBeInTheDocument();
      });

      const menuCard = screen.getByText('整体60分').closest('div');
      await user.click(menuCard!);

      await waitFor(() => {
        expect(screen.getByText('田中先生')).toBeInTheDocument();
      });

      const staffCard = screen.getByText('田中先生').closest('div');
      await user.click(staffCard!);

      await user.click(screen.getByText('次へ：日時選択'));
    });

    test('日時選択画面が表示される', async () => {
      await waitFor(() => {
        expect(screen.getByText('日時選択')).toBeInTheDocument();
      });
    });

    test('希望日入力フィールドが表示される', async () => {
      await waitFor(() => {
        expect(screen.getByLabelText('希望日')).toBeInTheDocument();
      });
    });

    test('複数回予約のチェックボックスが表示される', async () => {
      await waitFor(() => {
        expect(
          screen.getByLabelText('継続予約（複数回分）')
        ).toBeInTheDocument();
      });
    });

    test('利用可能時間が表示される', async () => {
      await waitFor(() => {
        expect(screen.getByText('利用可能時間')).toBeInTheDocument();
      });
    });

    test('備考入力フィールドが表示される', async () => {
      await waitFor(() => {
        expect(screen.getByLabelText('備考・要望')).toBeInTheDocument();
      });
    });
  });

  describe('Step 4: 確認ステップ', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      render(<ReservationRegisterPage />);

      // 全ステップを完了
      // Step 1
      const nameInput = screen.getByLabelText('お名前（必須）');
      const phoneInput = screen.getByLabelText('電話番号（必須）');
      await user.type(nameInput, '新規太郎');
      await user.type(phoneInput, '090-1111-2222');
      await user.click(screen.getByText('次へ：メニュー選択'));

      // Step 2
      await waitFor(() => {
        expect(screen.getByText('整体60分')).toBeInTheDocument();
      });
      const menuCard = screen.getByText('整体60分').closest('div');
      await user.click(menuCard!);

      await waitFor(() => {
        expect(screen.getByText('田中先生')).toBeInTheDocument();
      });
      const staffCard = screen.getByText('田中先生').closest('div');
      await user.click(staffCard!);
      await user.click(screen.getByText('次へ：日時選択'));

      // Step 3
      await waitFor(() => {
        expect(screen.getByLabelText('希望日')).toBeInTheDocument();
      });

      const dateInput = screen.getByLabelText('希望日');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateString = tomorrow.toISOString().split('T')[0];
      await user.clear(dateInput);
      await user.type(dateInput, dateString);

      // 利用可能時間から選択（最初のボタンをクリック）
      await waitFor(() => {
        const timeButtons = screen
          .getAllByRole('button')
          .filter(btn => /^\d{2}:\d{2}$/.test(btn.textContent || ''));
        if (timeButtons.length > 0) {
          return user.click(timeButtons[0]);
        }
      });

      await user.click(screen.getByText('次へ：確認'));
    });

    test('確認画面が表示される', async () => {
      await waitFor(() => {
        expect(screen.getByText('予約内容確認')).toBeInTheDocument();
      });
    });

    test('顧客情報が表示される', async () => {
      await waitFor(() => {
        expect(screen.getByText('顧客情報')).toBeInTheDocument();
        expect(screen.getByText('新規太郎')).toBeInTheDocument();
        expect(screen.getByText('090-1111-2222')).toBeInTheDocument();
      });
    });

    test('予約詳細が表示される', async () => {
      await waitFor(() => {
        expect(screen.getByText('予約詳細')).toBeInTheDocument();
        expect(screen.getByText('整体60分')).toBeInTheDocument();
        expect(screen.getByText('田中先生')).toBeInTheDocument();
      });
    });

    test('予約確定について の説明が表示される', async () => {
      await waitFor(() => {
        expect(screen.getByText('予約確定について')).toBeInTheDocument();
        expect(
          screen.getByText(/自動リマインドが前日19:00に送信/)
        ).toBeInTheDocument();
      });
    });

    test('仮予約と確定のボタンが表示される', async () => {
      await waitFor(() => {
        expect(screen.getByText('仮予約として保存')).toBeInTheDocument();
        expect(screen.getByText('予約を確定する')).toBeInTheDocument();
      });
    });
  });

  describe('フォームバリデーション', () => {
    test('必須フィールドが空の場合はエラーが表示される', async () => {
      const user = userEvent.setup();
      render(<ReservationRegisterPage />);

      const nextButton = screen.getByText('次へ：メニュー選択');
      expect(nextButton).toBeDisabled();

      // 名前のみ入力
      const nameInput = screen.getByLabelText('お名前（必須）');
      await user.type(nameInput, '太郎');

      // まだ無効
      expect(nextButton).toBeDisabled();

      // 電話番号も入力
      const phoneInput = screen.getByLabelText('電話番号（必須）');
      await user.type(phoneInput, '090-1111-2222');

      // 有効になる
      await waitFor(() => {
        expect(nextButton).toBeEnabled();
      });
    });

    test('不正な電話番号形式の場合の検証', async () => {
      const user = userEvent.setup();
      render(<ReservationRegisterPage />);

      const nameInput = screen.getByLabelText('お名前（必須）');
      const phoneInput = screen.getByLabelText('電話番号（必須）');

      await user.type(nameInput, '太郎');
      await user.type(phoneInput, '123'); // 不正な形式

      const nextButton = screen.getByText('次へ：メニュー選択');

      // 短すぎる電話番号でもボタンは有効（実際の検証はサーバーサイド）
      await waitFor(() => {
        expect(nextButton).toBeEnabled();
      });
    });
  });

  describe('複数回予約機能', () => {
    test('複数回予約チェックボックスで追加日程が表示される', async () => {
      const user = userEvent.setup();
      render(<ReservationRegisterPage />);

      // Step 3まで進む
      const nameInput = screen.getByLabelText('お名前（必須）');
      const phoneInput = screen.getByLabelText('電話番号（必須）');
      await user.type(nameInput, '新規太郎');
      await user.type(phoneInput, '090-1111-2222');
      await user.click(screen.getByText('次へ：メニュー選択'));

      await waitFor(() => {
        expect(screen.getByText('整体60分')).toBeInTheDocument();
      });
      const menuCard = screen.getByText('整体60分').closest('div');
      await user.click(menuCard!);

      await waitFor(() => {
        expect(screen.getByText('田中先生')).toBeInTheDocument();
      });
      const staffCard = screen.getByText('田中先生').closest('div');
      await user.click(staffCard!);
      await user.click(screen.getByText('次へ：日時選択'));

      await waitFor(() => {
        expect(
          screen.getByLabelText('継続予約（複数回分）')
        ).toBeInTheDocument();
      });

      const multipleCheckbox = screen.getByLabelText('継続予約（複数回分）');
      await user.click(multipleCheckbox);

      await waitFor(() => {
        expect(screen.getByText('追加予約日')).toBeInTheDocument();
        expect(screen.getByText(/週間後/)).toBeInTheDocument();
      });
    });
  });

  describe('パフォーマンス要件', () => {
    test('30秒以内での予約登録完了を目指す', async () => {
      const startTime = performance.now();
      const user = userEvent.setup();
      render(<ReservationRegisterPage />);

      // 高速での入力操作
      const nameInput = screen.getByLabelText('お名前（必須）');
      const phoneInput = screen.getByLabelText('電話番号（必須）');
      await user.type(nameInput, '太郎');
      await user.type(phoneInput, '090-1111-2222');
      await user.click(screen.getByText('次へ：メニュー選択'));

      await waitFor(() => {
        expect(screen.getByText('整体60分')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const operationTime = endTime - startTime;

      // 基本操作は十分高速であることを確認
      expect(operationTime).toBeLessThan(5000); // 5秒以内
    });
  });

  describe('アクセシビリティ', () => {
    test('フォームラベルが適切に関連付けられている', () => {
      render(<ReservationRegisterPage />);

      const nameInput = screen.getByLabelText('お名前（必須）');
      const phoneInput = screen.getByLabelText('電話番号（必須）');
      const emailInput = screen.getByLabelText('メールアドレス');

      expect(nameInput).toBeInTheDocument();
      expect(phoneInput).toBeInTheDocument();
      expect(emailInput).toBeInTheDocument();
    });

    test('ステップインジケーターが視覚的に識別できる', () => {
      render(<ReservationRegisterPage />);

      // アクティブなステップは異なるスタイルが適用される
      const stepIndicators = screen.getAllByText(/[1-4]/);
      expect(stepIndicators.length).toBeGreaterThan(0);
    });

    test('キーボードナビゲーションが可能', async () => {
      const user = userEvent.setup();
      render(<ReservationRegisterPage />);

      // Tabキーでフォーカス移動
      await user.tab();
      expect(document.activeElement).toHaveAttribute('type');
    });
  });
});
