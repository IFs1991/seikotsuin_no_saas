/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RevenuePage from '@/app/revenue/page';
import { useRevenue } from '@/hooks/useRevenue';
import { useUserProfile } from '@/hooks/useUserProfile';

// Mock the custom hooks
jest.mock('@/hooks/useRevenue');
jest.mock('@/hooks/useUserProfile');

const mockUseRevenue = useRevenue as jest.MockedFunction<typeof useRevenue>;
const mockUseUserProfile = useUserProfile as jest.MockedFunction<typeof useUserProfile>;

// Mock data
const mockClinicId = '123e4567-e89b-12d3-a456-426614174000';

const mockRevenueData = {
  dailyRevenue: 150000,
  weeklyRevenue: 980000,
  monthlyRevenue: 4200000,
  insuranceRevenue: 2520000,
  selfPayRevenue: 1680000,
  menuRanking: [
    { menu: '整体', revenue: 1200000, count: 120 },
    { menu: 'マッサージ', revenue: 800000, count: 160 },
    { menu: '鍼灸', revenue: 600000, count: 60 },
  ],
  hourlyRevenue: 'ピーク: 14:00-16:00',
  dailyRevenueByDayOfWeek: 'ピーク: 金曜日',
  lastYearRevenue: 3800000,
  growthRate: '+10.5%',
  revenueForecast: 4500000,
  costAnalysis: '35%',
  staffRevenueContribution: '田中: 28%, 佐藤: 25%',
  loading: false,
  error: null,
};

const mockUserProfile = {
  profile: {
    id: 'user-1',
    email: 'test@example.com',
    role: 'manager',
    clinicId: mockClinicId,
    isActive: true,
    isAdmin: false,
  },
  loading: false,
  error: null,
};

describe('RevenuePage', () => {
  beforeEach(() => {
    mockUseUserProfile.mockReturnValue(mockUserProfile);
    mockUseRevenue.mockReturnValue(mockRevenueData);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('正常系', () => {
    test('should render revenue page with all sections', () => {
      render(<RevenuePage />);

      expect(screen.getByText('収益トレンド')).toBeInTheDocument();
      expect(screen.getByText('保険診療 vs 自費診療')).toBeInTheDocument();
      expect(
        screen.getByText('施術メニュー別収益ランキング')
      ).toBeInTheDocument();
      expect(
        screen.getByText('時間帯別・曜日別収益パターン')
      ).toBeInTheDocument();
      expect(screen.getByText('前年同期比較と成長率')).toBeInTheDocument();
      expect(screen.getByText('収益予測とシミュレーション')).toBeInTheDocument();
      expect(screen.getByText('コスト分析')).toBeInTheDocument();
      expect(screen.getByText('施術者別収益貢献度')).toBeInTheDocument();
    });

    test('should display insurance and self-pay revenue', () => {
      render(<RevenuePage />);

      expect(screen.getByText('保険診療:')).toBeInTheDocument();
      expect(screen.getByText('2,520,000')).toBeInTheDocument();
      expect(screen.getByText('自費診療:')).toBeInTheDocument();
      expect(screen.getByText('1,680,000')).toBeInTheDocument();
    });

    test('should display menu ranking', () => {
      render(<RevenuePage />);

      expect(screen.getByText('整体')).toBeInTheDocument();
      expect(screen.getByText('1,200,000')).toBeInTheDocument();
      expect(screen.getByText('マッサージ')).toBeInTheDocument();
      expect(screen.getByText('800,000')).toBeInTheDocument();
      expect(screen.getByText('鍼灸')).toBeInTheDocument();
      expect(screen.getByText('600,000')).toBeInTheDocument();
    });

    test('should display hourly and daily patterns', () => {
      render(<RevenuePage />);

      expect(screen.getByText('時間帯別収益:')).toBeInTheDocument();
      expect(screen.getByText('ピーク: 14:00-16:00')).toBeInTheDocument();
      expect(screen.getByText('曜日別収益:')).toBeInTheDocument();
      expect(screen.getByText('ピーク: 金曜日')).toBeInTheDocument();
    });

    test('should display year-over-year comparison', () => {
      render(<RevenuePage />);

      expect(screen.getByText('前年同期売上:')).toBeInTheDocument();
      expect(screen.getByText('3,800,000')).toBeInTheDocument();
      expect(screen.getByText('成長率:')).toBeInTheDocument();
      expect(screen.getByText('+10.5%')).toBeInTheDocument();
    });

    test('should display revenue forecast', () => {
      render(<RevenuePage />);

      expect(screen.getByText('予測収益:')).toBeInTheDocument();
      expect(screen.getByText('4,500,000')).toBeInTheDocument();
    });

    test('should display cost analysis', () => {
      render(<RevenuePage />);

      expect(screen.getByText('人件費率:')).toBeInTheDocument();
      expect(screen.getByText('35%')).toBeInTheDocument();
    });

    test('should display staff revenue contribution', () => {
      render(<RevenuePage />);

      expect(screen.getByText('貢献度:')).toBeInTheDocument();
      expect(screen.getByText('田中: 28%, 佐藤: 25%')).toBeInTheDocument();
    });

    test('should call useRevenue with clinicId from profile', () => {
      render(<RevenuePage />);

      expect(mockUseRevenue).toHaveBeenCalledWith(mockClinicId);
    });
  });

  describe('ローディング状態', () => {
    test('should display loading state when profile is loading', () => {
      mockUseUserProfile.mockReturnValue({
        profile: null,
        loading: true,
        error: null,
      });

      render(<RevenuePage />);

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    test('should display loading state when revenue data is loading', () => {
      mockUseRevenue.mockReturnValue({
        ...mockRevenueData,
        loading: true,
      });

      render(<RevenuePage />);

      expect(screen.getByText('収益データを読み込み中...')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    test('should display error when profile fetch fails', () => {
      mockUseUserProfile.mockReturnValue({
        profile: null,
        loading: false,
        error: '認証が必要です',
      });

      render(<RevenuePage />);

      expect(screen.getByText('エラー: 認証が必要です')).toBeInTheDocument();
    });

    test('should display error when revenue fetch fails', () => {
      mockUseRevenue.mockReturnValue({
        ...mockRevenueData,
        loading: false,
        error: '収益データの取得に失敗しました',
      });

      render(<RevenuePage />);

      expect(screen.getByText('エラー: 収益データの取得に失敗しました')).toBeInTheDocument();
    });

    test('should display message when clinicId is not set', () => {
      mockUseUserProfile.mockReturnValue({
        profile: {
          id: 'user-1',
          email: 'test@example.com',
          role: 'manager',
          clinicId: null,
          isActive: true,
          isAdmin: false,
        },
        loading: false,
        error: null,
      });

      render(<RevenuePage />);

      expect(screen.getByText('店舗情報が設定されていません')).toBeInTheDocument();
    });
  });

  describe('空データの表示', () => {
    test('should display empty state for menu ranking', () => {
      mockUseRevenue.mockReturnValue({
        ...mockRevenueData,
        menuRanking: [],
      });

      render(<RevenuePage />);

      expect(screen.getByText('データがありません')).toBeInTheDocument();
    });
  });
});
