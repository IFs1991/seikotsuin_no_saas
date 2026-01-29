import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShiftOptimizer from '@/components/staff/shift-optimizer';

// フェッチのモック
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ダミーデータに含まれる名前（これらが表示されたらNG）
const DUMMY_STAFF_NAMES = ['山田 太郎', '鈴木 花子', '田中 健太', '佐藤 恵美'];
const DUMMY_PREFERENCES = ['土日休み希望', '午前中勤務希望', '週3勤務希望'];
const DUMMY_DATES = ['2024-07-20', '2024-07-21'];
const TEST_CLINIC_ID = '00000000-0000-0000-0000-0000000000a1';

// APIレスポンスのモックヘルパー
const createMockResponse = (data: object) => ({
  ok: true,
  json: () => Promise.resolve({ data }),
});

const createEmptyMockResponse = () => ({
  ok: true,
  json: () =>
    Promise.resolve({
      data: {
        shifts: [],
        preferences: [],
        forecasts: [],
        hourlyDistribution: [],
      },
    }),
});

describe('ShiftOptimizer コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('空状態の表示', () => {
    test('シフト取得APIが空配列を返す時、UIが空状態を表示する', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/staff/shifts')) {
          return Promise.resolve(createMockResponse({ shifts: [], total: 0 }));
        }
        if (url.includes('/api/staff/preferences')) {
          return Promise.resolve(
            createMockResponse({ preferences: [], total: 0 })
          );
        }
        if (url.includes('/api/staff/demand-forecast')) {
          return Promise.resolve(
            createMockResponse({ forecasts: [], hourlyDistribution: [] })
          );
        }
        return Promise.resolve(createEmptyMockResponse());
      });

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      // ローディング後、空状態メッセージが表示されることを確認
      await waitFor(
        () => {
          // ダミーデータの名前が表示されていないことを確認
          DUMMY_STAFF_NAMES.forEach(name => {
            expect(screen.queryByText(name)).not.toBeInTheDocument();
          });
        },
        { timeout: 5000 }
      );
    });

    test('需要予測データがない場合は空状態を表示する', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/staff/demand-forecast')) {
          return Promise.resolve(
            createMockResponse({ forecasts: [], hourlyDistribution: [] })
          );
        }
        if (url.includes('/api/staff/shifts')) {
          return Promise.resolve(createMockResponse({ shifts: [], total: 0 }));
        }
        if (url.includes('/api/staff/preferences')) {
          return Promise.resolve(
            createMockResponse({ preferences: [], total: 0 })
          );
        }
        return Promise.resolve(createEmptyMockResponse());
      });

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      await waitFor(
        () => {
          // ダミーの需要予測データが表示されていないことを確認
          expect(screen.queryByText('予測: 高')).not.toBeInTheDocument();
          expect(screen.queryByText('予測: 中')).not.toBeInTheDocument();
          expect(screen.queryByText('予測: 低')).not.toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    });
  });

  describe('ダミーデータの排除', () => {
    test('ダミーのスタッフ名が表示されない', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/staff/shifts')) {
          return Promise.resolve(createMockResponse({ shifts: [], total: 0 }));
        }
        if (url.includes('/api/staff/preferences')) {
          return Promise.resolve(
            createMockResponse({ preferences: [], total: 0 })
          );
        }
        if (url.includes('/api/staff/demand-forecast')) {
          return Promise.resolve(
            createMockResponse({ forecasts: [], hourlyDistribution: [] })
          );
        }
        return Promise.resolve(createEmptyMockResponse());
      });

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      await waitFor(
        () => {
          DUMMY_STAFF_NAMES.forEach(name => {
            expect(screen.queryByText(name)).not.toBeInTheDocument();
          });
        },
        { timeout: 5000 }
      );
    });

    test('ダミーの希望テキストが表示されない', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/staff/shifts')) {
          return Promise.resolve(createMockResponse({ shifts: [], total: 0 }));
        }
        if (url.includes('/api/staff/preferences')) {
          return Promise.resolve(
            createMockResponse({ preferences: [], total: 0 })
          );
        }
        if (url.includes('/api/staff/demand-forecast')) {
          return Promise.resolve(
            createMockResponse({ forecasts: [], hourlyDistribution: [] })
          );
        }
        return Promise.resolve(createEmptyMockResponse());
      });

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      await waitFor(
        () => {
          DUMMY_PREFERENCES.forEach(pref => {
            expect(screen.queryByText(pref)).not.toBeInTheDocument();
          });
        },
        { timeout: 5000 }
      );
    });

    test('ダミーの日付が表示されない', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/staff/shifts')) {
          return Promise.resolve(createMockResponse({ shifts: [], total: 0 }));
        }
        if (url.includes('/api/staff/preferences')) {
          return Promise.resolve(
            createMockResponse({ preferences: [], total: 0 })
          );
        }
        if (url.includes('/api/staff/demand-forecast')) {
          return Promise.resolve(
            createMockResponse({ forecasts: [], hourlyDistribution: [] })
          );
        }
        return Promise.resolve(createEmptyMockResponse());
      });

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      await waitFor(
        () => {
          DUMMY_DATES.forEach(date => {
            expect(
              screen.queryByText(new RegExp(date))
            ).not.toBeInTheDocument();
          });
        },
        { timeout: 5000 }
      );
    });
  });

  describe('実データの表示', () => {
    test('APIから取得したシフトデータが正しく表示される', async () => {
      const mockShifts = [
        {
          id: 'shift-1',
          staff_id: 'staff-1',
          start_time: '2025-01-15T09:00:00Z',
          end_time: '2025-01-15T18:00:00Z',
          status: 'confirmed',
          staff: { id: 'staff-1', name: '実スタッフ1' },
        },
      ];

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/staff/shifts')) {
          return Promise.resolve(
            createMockResponse({ shifts: mockShifts, total: 1 })
          );
        }
        if (url.includes('/api/staff/preferences')) {
          return Promise.resolve(
            createMockResponse({ preferences: [], total: 0 })
          );
        }
        if (url.includes('/api/staff/demand-forecast')) {
          return Promise.resolve(
            createMockResponse({ forecasts: [], hourlyDistribution: [] })
          );
        }
        return Promise.resolve(createEmptyMockResponse());
      });

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      await waitFor(
        () => {
          expect(screen.getByText('実スタッフ1')).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    });

    test('APIから取得したスタッフ希望が正しく表示される', async () => {
      const mockPreferences = [
        {
          id: 'pref-1',
          staff_id: 'staff-1',
          preference_text: '実際の希望テキスト',
          staff: { id: 'staff-1', name: '実スタッフ1' },
        },
      ];

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/staff/preferences')) {
          return Promise.resolve(
            createMockResponse({ preferences: mockPreferences, total: 1 })
          );
        }
        if (url.includes('/api/staff/shifts')) {
          return Promise.resolve(createMockResponse({ shifts: [], total: 0 }));
        }
        if (url.includes('/api/staff/demand-forecast')) {
          return Promise.resolve(
            createMockResponse({ forecasts: [], hourlyDistribution: [] })
          );
        }
        return Promise.resolve(createEmptyMockResponse());
      });

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      await waitFor(
        () => {
          expect(screen.getByText(/実際の希望テキスト/)).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    });

    test('APIから取得した需要予測が正しく表示される', async () => {
      // 今日の日付を使用（JST基準）
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const mockForecasts = [
        { date: today, hour: 10, count: 5, level: 'high' },
      ];

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/staff/demand-forecast')) {
          return Promise.resolve(
            createMockResponse({
              forecasts: mockForecasts,
              hourlyDistribution: [],
            })
          );
        }
        if (url.includes('/api/staff/shifts')) {
          return Promise.resolve(createMockResponse({ shifts: [], total: 0 }));
        }
        if (url.includes('/api/staff/preferences')) {
          return Promise.resolve(
            createMockResponse({ preferences: [], total: 0 })
          );
        }
        return Promise.resolve(createEmptyMockResponse());
      });

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      // ローディングが終わるまで待機してから、需要予測セクションを確認
      await waitFor(
        () => {
          expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      // 需要予測セクションが表示されることを確認
      expect(screen.getByText('需要予測')).toBeInTheDocument();
    });
  });

  describe('エラーハンドリング', () => {
    test('API失敗時は「データ取得に失敗しました」を表示', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      await waitFor(
        () => {
          expect(
            screen.getByText(/データ取得に失敗しました/)
          ).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    });

    test('APIが500エラーを返した場合もエラーメッセージを表示', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal Server Error' }),
        })
      );

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      // ローディングが終わるまで待機
      await waitFor(
        () => {
          expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      // エラーメッセージが表示されることを確認（CardTitleとCardDescriptionの両方に表示される）
      const errorElements = screen.getAllByText(/データ取得に失敗しました/);
      expect(errorElements.length).toBeGreaterThan(0);
    });
  });

  describe('ローディング状態', () => {
    test('データ取得中はローディング表示がされる', async () => {
      // 遅延レスポンスをシミュレート
      mockFetch.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve(createEmptyMockResponse());
            }, 1000);
          })
      );

      render(<ShiftOptimizer clinicId={TEST_CLINIC_ID} />);

      // ローディング中の表示を確認
      expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
    });
  });
});
