import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RevenuePage from '@/app/revenue/page';
import { useRevenue } from '@/hooks/useRevenue';

// Mock the custom hook
jest.mock('@/hooks/useRevenue');
const mockUseRevenue = useRevenue as jest.MockedFunction<typeof useRevenue>;

// Mock data
const mockRevenueData = {
  dailyRevenue: 150000,
  weeklyRevenue: 980000,
  monthlyRevenue: 4200000,
  insuranceRevenue: 2520000,
  selfPayRevenue: 1680000,
  menuRanking: [
    { menu: '整体', revenue: 1200000, count: 120 },
    { menu: 'マッサージ', revenue: 800000, count: 160 },
    { menu: '鍼灸', revenue: 600000, count: 60 }
  ],
  hourlyRevenue: 'ピーク: 14:00-16:00',
  dailyRevenueByDayOfWeek: 'ピーク: 金曜日',
  lastYearRevenue: 3800000,
  growthRate: '+10.5%',
  revenueForecast: 4500000,
  costAnalysis: '35%',
  staffRevenueContribution: '田中: 28%, 佐藤: 25%'
};

describe('RevenuePage', () => {
  beforeEach(() => {
    mockUseRevenue.mockReturnValue(mockRevenueData);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render revenue page with all sections', () => {
    render(<RevenuePage />);

    expect(screen.getByText('収益トレンド')).toBeInTheDocument();
    expect(screen.getByText('保険診療 vs 自費診療')).toBeInTheDocument();
    expect(screen.getByText('施術メニュー別収益ランキング')).toBeInTheDocument();
    expect(screen.getByText('時間帯別・曜日別収益パターン')).toBeInTheDocument();
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
    expect(screen.getByText('¥1,200,000')).toBeInTheDocument();
    expect(screen.getByText('マッサージ')).toBeInTheDocument();
    expect(screen.getByText('¥800,000')).toBeInTheDocument();
    expect(screen.getByText('鍼灸')).toBeInTheDocument();
    expect(screen.getByText('¥600,000')).toBeInTheDocument();
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
});