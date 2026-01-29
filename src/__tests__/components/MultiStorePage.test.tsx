/** @jest-environment jsdom */

/**
 * Multi-Store Page Component Tests - TDD for 多店舗分析 MVP
 *
 * 仕様:
 * - src/app/multi-store/page.tsx
 * - HQ向けに多店舗KPI比較を提供
 * - モックを排除し、実データで表示
 *
 * 受け入れ基準:
 * - 実データで比較が表示される
 * - HQ以外はアクセス不可（admin/clinic_admin のみ許可）
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// useMultiStore フックをモック
const mockFetchClinicsWithKPI = jest.fn();
const mockSortByRevenue = jest.fn();
const mockSortByPatients = jest.fn();
const mockSortByPerformance = jest.fn();

const mockUseMultiStoreReturn = {
  clinics: [],
  loading: false,
  error: null,
  fetchClinicsWithKPI: mockFetchClinicsWithKPI,
  sortByRevenue: mockSortByRevenue,
  sortByPatients: mockSortByPatients,
  sortByPerformance: mockSortByPerformance,
  totalRevenue: 0,
  totalPatients: 0,
  averagePerformanceScore: null,
};

jest.mock('@/hooks/useMultiStore', () => ({
  useMultiStore: jest.fn(() => mockUseMultiStoreReturn),
  __esModule: true,
  default: jest.fn(() => mockUseMultiStoreReturn),
}));

import MultiStorePage from '@/app/multi-store/page';
import { useMultiStore } from '@/hooks/useMultiStore';

const mockUseMultiStore = useMultiStore as jest.MockedFunction<
  typeof useMultiStore
>;

describe('MultiStorePage Component', () => {
  const mockClinicData = [
    {
      id: 'clinic-1',
      name: 'テストクリニック1',
      address: '東京都渋谷区',
      phone_number: '03-1234-5678',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      kpi: {
        revenue: 500000,
        patients: 150,
        staff_performance_score: 4.5,
      },
    },
    {
      id: 'clinic-2',
      name: 'テストクリニック2',
      address: '大阪府大阪市',
      phone_number: '06-1234-5678',
      is_active: true,
      created_at: '2024-01-02T00:00:00Z',
      kpi: {
        revenue: 300000,
        patients: 100,
        staff_performance_score: 4.2,
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMultiStore.mockReturnValue({
      ...mockUseMultiStoreReturn,
    });
  });

  describe('初期表示', () => {
    it('ページタイトルが表示される', () => {
      render(<MultiStorePage />);

      expect(
        screen.getByRole('heading', { name: /多店舗分析/i })
      ).toBeInTheDocument();
    });

    it('初回レンダリング時にデータを取得する', () => {
      render(<MultiStorePage />);

      expect(mockFetchClinicsWithKPI).toHaveBeenCalledTimes(1);
    });

    it('ローディング中はスピナーが表示される', () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        loading: true,
      });

      render(<MultiStorePage />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('クリニック一覧表示', () => {
    it('クリニック名が表示される', () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: mockClinicData,
        totalRevenue: 800000,
        totalPatients: 250,
        averagePerformanceScore: 4.35,
      });

      render(<MultiStorePage />);

      expect(screen.getByText('テストクリニック1')).toBeInTheDocument();
      expect(screen.getByText('テストクリニック2')).toBeInTheDocument();
    });

    it('収益データが表示される', () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: mockClinicData,
        totalRevenue: 800000,
        totalPatients: 250,
        averagePerformanceScore: 4.35,
      });

      render(<MultiStorePage />);

      // 収益金額が表示されること
      expect(screen.getByText(/500,000/)).toBeInTheDocument();
      expect(screen.getByText(/300,000/)).toBeInTheDocument();
    });

    it('患者数が表示される', () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: mockClinicData,
        totalRevenue: 800000,
        totalPatients: 250,
        averagePerformanceScore: 4.35,
      });

      render(<MultiStorePage />);

      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('スタッフパフォーマンススコアが表示される', () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: mockClinicData,
        totalRevenue: 800000,
        totalPatients: 250,
        averagePerformanceScore: 4.35,
      });

      render(<MultiStorePage />);

      expect(screen.getByText('4.5')).toBeInTheDocument();
      expect(screen.getByText('4.2')).toBeInTheDocument();
    });
  });

  describe('サマリーカード', () => {
    it('合計収益が表示される', () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: mockClinicData,
        totalRevenue: 800000,
        totalPatients: 250,
        averagePerformanceScore: 4.35,
      });

      render(<MultiStorePage />);

      expect(screen.getByTestId('total-revenue')).toHaveTextContent('800,000');
    });

    it('合計患者数が表示される', () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: mockClinicData,
        totalRevenue: 800000,
        totalPatients: 250,
        averagePerformanceScore: 4.35,
      });

      render(<MultiStorePage />);

      expect(screen.getByTestId('total-patients')).toHaveTextContent('250');
    });

    it('平均パフォーマンススコアが表示される', () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: mockClinicData,
        totalRevenue: 800000,
        totalPatients: 250,
        averagePerformanceScore: 4.35,
      });

      render(<MultiStorePage />);

      expect(screen.getByTestId('average-performance')).toHaveTextContent(
        '4.35'
      );
    });
  });

  describe('ソート機能', () => {
    it('収益ヘッダークリックでソートが呼ばれる', async () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: mockClinicData,
        totalRevenue: 800000,
        totalPatients: 250,
        averagePerformanceScore: 4.35,
      });

      const user = userEvent.setup();
      render(<MultiStorePage />);

      const revenueHeader = screen.getByRole('button', { name: /収益/i });
      await user.click(revenueHeader);

      expect(mockSortByRevenue).toHaveBeenCalledWith('desc');
    });

    it('患者数ヘッダークリックでソートが呼ばれる', async () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: mockClinicData,
        totalRevenue: 800000,
        totalPatients: 250,
        averagePerformanceScore: 4.35,
      });

      const user = userEvent.setup();
      render(<MultiStorePage />);

      const patientsHeader = screen.getByRole('button', { name: /患者数/i });
      await user.click(patientsHeader);

      expect(mockSortByPatients).toHaveBeenCalledWith('desc');
    });

    it('パフォーマンスヘッダークリックでソートが呼ばれる', async () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: mockClinicData,
        totalRevenue: 800000,
        totalPatients: 250,
        averagePerformanceScore: 4.35,
      });

      const user = userEvent.setup();
      render(<MultiStorePage />);

      const performanceHeader = screen.getByRole('button', {
        name: /パフォーマンス/i,
      });
      await user.click(performanceHeader);

      expect(mockSortByPerformance).toHaveBeenCalledWith('desc');
    });
  });

  describe('エラー表示', () => {
    it('エラー時にエラーメッセージが表示される', () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        error: '権限がありません',
      });

      render(<MultiStorePage />);

      expect(screen.getByText('権限がありません')).toBeInTheDocument();
    });
  });

  describe('空データ時', () => {
    it('クリニックがない場合はメッセージを表示', () => {
      mockUseMultiStore.mockReturnValue({
        ...mockUseMultiStoreReturn,
        clinics: [],
        loading: false,
      });

      render(<MultiStorePage />);

      expect(
        screen.getByText(/クリニックデータがありません/i)
      ).toBeInTheDocument();
    });
  });
});
