/**
 * 予約一覧ルートのテスト
 * - /reservations/list は /reservations?view=list にリダイレクトする
 */

import { redirect } from 'next/navigation';

// next/navigationをモック
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

// リダイレクト専用ページをインポート
import ReservationListPage from '@/app/reservations/list/page';

const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

describe('ReservationListPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('リダイレクト動作', () => {
    test('/reservations?view=list にリダイレクトされる', () => {
      // 注：redirect()はNext.jsで例外をスローするため、try-catchでラップ
      try {
        ReservationListPage();
      } catch {
        // redirect throws NEXT_REDIRECT error
      }

      expect(mockRedirect).toHaveBeenCalledWith('/reservations?view=list');
    });

    test('リダイレクトは1回だけ呼ばれる', () => {
      try {
        ReservationListPage();
      } catch {
        // redirect throws NEXT_REDIRECT error
      }

      expect(mockRedirect).toHaveBeenCalledTimes(1);
    });
  });
});
