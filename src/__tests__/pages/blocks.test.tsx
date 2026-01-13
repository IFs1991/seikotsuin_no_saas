/** @jest-environment jsdom */

/**
 * Blocks Page Tests - TDD for 認証コンテキスト連携 MVP
 *
 * 仕様:
 * - src/app/blocks/page.tsx で createdBy は profile.userId を使用
 * - sampleResources を廃止し、/api/resources?clinic_id=... から取得
 * - clinicId が無い場合は新規作成を不可にする
 *
 * 受け入れ基準:
 * - resource取得が /api/resources?clinic_id=... で呼ばれる
 * - createBlock の payload に createdBy=profile.userId
 * - ハードコードされた createdBy: 'current-user-id' が削除されている
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// BlockServiceをモック
const mockCreateBlock = jest.fn();
const mockGetBlocksByDateRange = jest.fn();
const mockDeleteBlock = jest.fn();

jest.mock('@/lib/services/block-service', () => ({
  BlockService: jest.fn().mockImplementation(() => ({
    createBlock: mockCreateBlock,
    getBlocksByDateRange: mockGetBlocksByDateRange,
    deleteBlock: mockDeleteBlock,
  })),
}));

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
    mockGetBlocksByDateRange.mockResolvedValue([]);
    mockCreateBlock.mockResolvedValue({ id: 'new-block-id' });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockResources }),
    });
  });

  describe('基本レンダリング', () => {
    it('販売停止設定ページがレンダリングされる', async () => {
      const { container } = render(<BlockManagementPage />);

      // h1要素を特定して確認
      expect(screen.getByRole('heading', { level: 1, name: /販売停止設定.*F008/i })).toBeInTheDocument();
    });

    it('新規作成ボタンが表示される', async () => {
      const { container } = render(<BlockManagementPage />);

      expect(screen.getByRole('button', { name: /新規作成/i })).toBeInTheDocument();
    });
  });

  /**
   * 認証コンテキスト連携テスト
   * - createdBy が profile.userId から取得される
   * - ハードコードされた 'current-user-id' が使われていない
   */
  describe('認証コンテキスト連携 - createdBy', () => {
    it('createBlock の payload に profile.userId が使用される', async () => {
      const user = userEvent.setup();
      const testUserId = 'auth-context-user-id-xyz';
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, id: testUserId },
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
        expect(mockCreateBlock).toHaveBeenCalled();
      });

      const payload = mockCreateBlock.mock.calls[0][0];
      expect(payload.createdBy).toBe(testUserId);
    });

    it('createdBy に "current-user-id" がハードコードされていない', async () => {
      const user = userEvent.setup();
      const testUserId = 'real-user-from-profile';
      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, id: testUserId, clinicId: 'test-clinic' },
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
        expect(mockCreateBlock).toHaveBeenCalled();
      });

      const payload = mockCreateBlock.mock.calls[0][0];
      expect(payload.createdBy).toBe(testUserId);
      expect(payload.createdBy).not.toBe('current-user-id');
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
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: apiResources }),
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

      expect(screen.getByText(/管理者に権限割当を依頼してください/i)).toBeInTheDocument();
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

      expect(screen.getByText(/プロフィール取得に失敗しました/i)).toBeInTheDocument();
    });

    it('リソース取得エラー時は空状態と再読み込み導線を表示', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      render(<BlockManagementPage />);

      await waitFor(() => {
        expect(screen.getByText(/リソースの取得に失敗しました/i)).toBeInTheDocument();
      });
    });
  });

  /**
   * 販売停止作成フローテスト
   */
  describe('販売停止作成フロー', () => {
    it('販売停止作成時に createdBy が profile.id で送信される', async () => {
      const user = userEvent.setup();
      const testUserId = 'create-block-user-id';
      const testClinicId = 'create-block-clinic-id';

      mockUseUserProfileContext.mockReturnValue({
        profile: { ...mockProfile, id: testUserId, clinicId: testClinicId },
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
        expect(mockCreateBlock).toHaveBeenCalled();
      });

      const payload = mockCreateBlock.mock.calls[0][0];
      expect(payload.createdBy).toBe(testUserId);
    });
  });
});
