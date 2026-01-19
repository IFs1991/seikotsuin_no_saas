/**
 * 予約登録ルートのテスト
 * - /reservations/register は /reservations?view=register にリダイレクトする
 */

import { redirect } from 'next/navigation';

// next/navigationをモック
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

// リダイレクト専用ページをインポート
import ReservationRegisterPage from '@/app/reservations/register/page';

const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

describe('ReservationRegisterPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('リダイレクト動作', () => {
    test('/reservations?view=register にリダイレクトされる', () => {
      // 注：redirect()はNext.jsで例外をスローするため、try-catchでラップ
      try {
        ReservationRegisterPage();
      } catch {
        // redirect throws NEXT_REDIRECT error
      }

      expect(mockRedirect).toHaveBeenCalledWith('/reservations?view=register');
    });

    test('リダイレクトは1回だけ呼ばれる', () => {
      try {
        ReservationRegisterPage();
      } catch {
        // redirect throws NEXT_REDIRECT error
      }

      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });
  });
});
