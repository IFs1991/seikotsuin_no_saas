import React from 'react';
import { render, screen } from '@testing-library/react';
import RevenueChart from '@/components/dashboard/revenue-chart';
import { RevenueChartPoint } from '@/types/api';

// Rechartsモック
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div className='recharts-responsive-container'>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='line-chart'>{children}</div>
  ),
  Line: ({ dataKey }: { dataKey: string }) => (
    <div className='recharts-line' data-testid={`line-${dataKey}`} />
  ),
  XAxis: () => <div data-testid='x-axis' />,
  YAxis: () => <div data-testid='y-axis' />,
  CartesianGrid: () => <div data-testid='grid' />,
  Tooltip: () => <div data-testid='tooltip' />,
  Legend: () => <div data-testid='legend' />,
}));

describe('RevenueChart', () => {
  const mockData: RevenueChartPoint[] = [
    { name: '2024-01-01', 総売上: 100000, 保険診療: 60000, 自費診療: 40000 },
    { name: '2024-01-02', 総売上: 120000, 保険診療: 70000, 自費診療: 50000 },
    { name: '2024-01-03', 総売上: 90000, 保険診療: 50000, 自費診療: 40000 },
  ];

  it('should render chart when data is provided', () => {
    render(<RevenueChart data={mockData} />);

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByText('収益トレンド')).toBeInTheDocument();
  });

  it('should render 3 lines for 総売上, 保険診療, 自費診療', () => {
    render(<RevenueChart data={mockData} />);

    expect(screen.getByTestId('line-総売上')).toBeInTheDocument();
    expect(screen.getByTestId('line-保険診療')).toBeInTheDocument();
    expect(screen.getByTestId('line-自費診療')).toBeInTheDocument();
  });

  it('should show empty state when data is empty', () => {
    render(<RevenueChart data={[]} />);

    expect(screen.getByText('データがありません')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });

  it('should show empty state when data is undefined', () => {
    render(<RevenueChart data={undefined} />);

    expect(screen.getByText('データがありません')).toBeInTheDocument();
  });

  it('should not contain mock placeholder text', () => {
    render(<RevenueChart data={mockData} />);

    expect(screen.queryByText('Chart Placeholder')).not.toBeInTheDocument();
    expect(screen.queryByText(/Insurance Data:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Self-Pay Data:/)).not.toBeInTheDocument();
  });
});
