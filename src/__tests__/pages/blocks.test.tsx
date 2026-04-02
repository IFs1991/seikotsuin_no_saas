/** @jest-environment jsdom */

/**
 * Blocks Page Tests - TDD for 認証コンテキスト連携 MVP
 *
 * 仕様:
 * - src/app/blocks/page.tsx は `/api/blocks` / `/api/resources` を利用する
 * - sampleResources を廃止し、/api/resources?clinic_id=... から取得
 * - clinicId が無い場合は新規作成を不可にする
 *
 * 受け入れ基準:
 * - resource取得が /api/resources?clinic_id=... で呼ばれる
 * - createBlock は `/api/blocks` に POST される
 * - ハードコードされた createdBy: 'current-user-id' が送信されない
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// fetchをモック（リソース取得用）
const mockFetch = jest.fn();
global.fetch = mockFetch;

// useUserProfileContextをモック
const mockProfile = {
  id: 'test-user-id-12345',
  email: 'test@example.com',
  role: 'admin',
  clinicId: 'test-clinic-id-67890',
  isActive: true,
  isAdmin: true,
};

const mockUseUserProfileContext = jest.fn(() => ({
  profile: mockProfile,
  loading: false,
  error: null,
}));

jest.mock('@/providers/user-profile-context', () => ({
  useUserProfileContext: () => mockUseUserProfileContext(),
}));

// confirmをモック
global.confirm = jest.fn(() => true);
global.alert = jest.fn();

import BlockManagementPage from '@/app/blocks/page';

describe('BlockManagementPage Component', () => {
  const mockResources = [
    { id: 'staff-1', name: '田中先生', type: 'staff' },
    { id: 'staff-2', name: '佐藤先生', type: 'staff' },
    { id: 'room-1', name: '施術室A', type: 'room' },
  ];
  const TEST_DATE = '2025-01-10';

  const fillRequiredBlockFields = (container: HTMLElement) => {
    const dateInputs = Array.from(
      container.querySelectorAll('input[type="date"]')
    ) as HTMLInputElement[];
    const timeInputs = Array.from(
      container.querySelectorAll('input[type="time"]')
    ) as HTMLInputElement[];

    if (dateInputs.length < 2 || timeInputs.length < 2) {
      throw new Error('必要な日時入力が見つかりません');
    }

    fireEvent.change(dateInputs[0], { target: { value: TEST_DATE } });
    fireEvent.change(timeInputs[0], { target: { value: '09:00' } });
    fireEvent.change(dateInputs[1], { target: { value: TEST_DATE } });
    fireEvent.change(timeInputs[1], { target: { value: '10:00' } });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUserProfileContext.mockReturnValue({
      profile: mockProfile,
      loading: false,
      error: null,
    });
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/resources?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: mockResources }),
        });
      }

      if (url.includes('/api/blocks?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        });
      }

      if (url === '/api/blocks' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { id: 'new-block-id' },
            }),
        });
      }

      if (url.startsWith('/api/blocks?id=') && method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { deleted: true } }),
        });
      }

      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });
    });
  });

  describe('基本レンダリング', () => {
    it('販売停止設定ページがレンダリングされる', async () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: null },
        loading: false,
        error: null,
      });

      render(<BlockManagementPage />);

      // h1要素を特定して確認
      expect(
        screen.getByRole('heading', { level: 1, name: /販売停止設定.*F008/i })
      ).toBeInTheDocument();
    });

    it('新規作成ボタンが表示される', async () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: null },
        loading: false,
        error: null,
      });

      render(<BlockManagementPage />);

      expect(
        screen.getByRole('button', { name: /新規作成/i })
      ).toBeInTheDocument();
    });
  });

  /**
   * API POST 契約テスト
   * - `/api/blocks` にPOSTされる
   * - client payload に current-user-id が埋め込まれない
   */
  describe('認証コンテキスト連携 - blocks POST', () => {
    it('createBlock は /api/blocks にPOSTされる', async () => {
      const user = userEvent.setup();
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, id: 'auth-context-user-id-xyz' },
        loading: false,
        error: null,
      });

      const { container } = render(<BlockManagementPage />);

      // 新規作成フォームを開く
      const createButton = screen.getByRole('button', { name: /新規作成/i });
      await user.click(createButton);

      // リソースを選択
      await waitFor(() => {
        expect(screen.getByText('田中先生')).toBeInTheDocument();
      });
      await user.click(screen.getByText('田中先生'));

      // 日時を入力
      fillRequiredBlockFields(container);

      // 保存ボタンをクリック
      const saveButton = screen.getByRole('button', { name: /設定を保存/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/blocks',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });

    it('POST payload に "current-user-id" がハードコードされていない', async () => {
      const user = userEvent.setup();
      mockUseUserProfileContext.mockReturnValue({
        profile: {
          ...mockProfile,
          id: 'real-user-from-profile',
          clinicId: 'test-clinic',
        },
        loading: false,
        error: null,
      });

      const { container } = render(<BlockManagementPage />);

      const createButton = screen.getByRole('button', { name: /新規作成/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('田中先生')).toBeInTheDocument();
      });
      await user.click(screen.getByText('田中先生'));

      fillRequiredBlockFields(container);

      const saveButton = screen.getByRole('button', { name: /設定を保存/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/blocks',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });

      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => url === '/api/blocks' && init?.method === 'POST'
      );
      const requestBody = JSON.parse(postCall?.[1]?.body as string);

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /設定を保存/i })
        ).not.toBeInTheDocument();
      });

      expect(requestBody.createdBy).toBeUndefined();
      expect(JSON.stringify(requestBody)).not.toContain('current-user-id');
    });
  });

  /**
   * リソース取得テスト
   * - sampleResources を使用せず API から取得
   * - /api/resources?clinic_id=... で呼ばれる
   */
  describe('認証コンテキスト連携 - リソース取得', () => {
    it('リソースが /api/resources?clinic_id=... から取得される', async () => {
      const testClinicId = 'api-clinic-id-abc';
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: testClinicId },
        loading: false,
        error: null,
      });

      const { container } = render(<BlockManagementPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/resources?clinic_id=${testClinicId}`),
          expect.any(Object)
        );
      });
    });

    it('sampleResources がハードコードされていない（APIから取得したリソースを表示）', async () => {
      const user = userEvent.setup();
      const apiResources = [
        { id: 'api-staff-1', name: 'APIスタッフA', type: 'staff' },
        { id: 'api-room-1', name: 'API施術室A', type: 'room' },
      ];
      mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/api/resources?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: apiResources }),
          });
        }

        if (url.includes('/api/blocks?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [] }),
          });
        }

        if (url === '/api/blocks' && method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { id: 'new-block-id' } }),
          });
        }

        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
        });
      });

      const { container } = render(<BlockManagementPage />);

      // 新規作成フォームを開く
      const createButton = screen.getByRole('button', { name: /新規作成/i });
      await user.click(createButton);

      // APIから取得したリソースが表示される
      await waitFor(() => {
        expect(screen.getByText('APIスタッフA')).toBeInTheDocument();
        expect(screen.getByText('API施術室A')).toBeInTheDocument();
      });

      // ハードコードされたリソースが表示されない
      expect(screen.queryByText('田中先生')).not.toBeInTheDocument();
      expect(screen.queryByText('佐藤先生')).not.toBeInTheDocument();
    });
  });

  /**
   * clinicId 未割当テスト
   */
  describe('clinicId 未割当', () => {
    it('clinicId が null の場合、新規作成ボタンが disabled になる', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: null },
        loading: false,
        error: null,
      });

      const { container } = render(<BlockManagementPage />);

      const createButton = screen.getByRole('button', { name: /新規作成/i });
      expect(createButton).toBeDisabled();
    });

    it('clinicId が null の場合、権限割当の案内が表示される', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: null },
        loading: false,
        error: null,
      });

      const { container } = render(<BlockManagementPage />);

      expect(
        screen.getByText(/管理者に権限割当を依頼してください/i)
      ).toBeInTheDocument();
    });

    it('clinicId が null の場合、リソース取得APIが呼ばれない', async () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, clinicId: null },
        loading: false,
        error: null,
      });

      render(<BlockManagementPage />);

      // APIが呼ばれないことを確認
      await waitFor(() => {
        expect(mockFetch).not.toHaveBeenCalledWith(
          expect.stringContaining('/api/resources'),
          expect.any(Object)
        );
      });
    });
  });

  /**
   * ローディング・エラー状態テスト
   */
  describe('ローディング・エラー状態', () => {
    it('プロフィール読み込み中はローディング表示', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: null,
        loading: true,
        error: null,
      });

      render(<BlockManagementPage />);

      expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
    });

    it('プロフィール取得エラー時はエラー表示', () => {
      mockUseUserProfileContext.mockReturnValue({
        profile: null,
        loading: false,
        error: 'プロフィール取得に失敗しました',
      });

      render(<BlockManagementPage />);

      expect(
        screen.getByText(/プロフィール取得に失敗しました/i)
      ).toBeInTheDocument();
    });

    it('リソース取得エラー時は空状態と再読み込み導線を表示', async () => {
      mockFetch.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/resources?')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
          });
        }

        if (url.includes('/api/blocks?')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [] }),
          });
        }

        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
        });
      });

      render(<BlockManagementPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/リソースの取得に失敗しました/i)
        ).toBeInTheDocument();
      });
    });
  });

  /**
   * 販売停止作成フローテスト
   */
  describe('販売停止作成フロー', () => {
    it('販売停止作成時に API へ必要な block payload が送信される', async () => {
      const user = userEvent.setup();
      const testClinicId = 'create-block-clinic-id';

      mockUseUserProfileContext.mockReturnValue({
        profile: {
          ...mockProfile,
          id: 'create-block-user-id',
          clinicId: testClinicId,
        },
        loading: false,
        error: null,
      });

      const { container } = render(<BlockManagementPage />);

      // 新規作成フォームを開く
      const createButton = screen.getByRole('button', { name: /新規作成/i });
      await user.click(createButton);

      // リソースを選択（APIから取得したリソースをクリック）
      await waitFor(() => {
        expect(screen.getByText('田中先生')).toBeInTheDocument();
      });
      await user.click(screen.getByText('田中先生'));

      // 日時を入力（input[type="date"] と input[type="time"]）
      fillRequiredBlockFields(container);

      const saveButton = screen.getByRole('button', { name: /設定を保存/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/blocks',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });

      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => url === '/api/blocks' && init?.method === 'POST'
      );
      const payload = JSON.parse(postCall?.[1]?.body as string);

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /設定を保存/i })
        ).not.toBeInTheDocument();
      });

      expect(payload).toMatchObject({
        resourceId: 'staff-1',
        reason: '',
      });
      expect(payload.startTime).toContain(TEST_DATE);
      expect(payload.endTime).toContain(TEST_DATE);
      expect(Number.isNaN(new Date(payload.startTime).getTime())).toBe(false);
      expect(Number.isNaN(new Date(payload.endTime).getTime())).toBe(false);
      expect(payload.createdBy).toBeUndefined();
    });
  });
});
