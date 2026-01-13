import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MenuRanking from '@/components/revenue/menu-ranking';
import { MenuRanking as MenuRankingType } from '@/types/api';

// Rechartsモック
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div className="recharts-responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

describe('MenuRanking', () => {
  const mockData: MenuRankingType[] = [
    { menu_id: '1', menu_name: '骨盤矯正', total_revenue: 500000, transaction_count: 100 },
    { menu_id: '2', menu_name: '鍼治療', total_revenue: 300000, transaction_count: 80 },
    { menu_id: '3', menu_name: 'マッサージ', total_revenue: 200000, transaction_count: 60 },
  ];

  it('should render menu ranking when data is provided', () => {
    render(<MenuRanking data={mockData} />);
    
    expect(screen.getByText('施術メニュー別収益ランキング')).toBeInTheDocument();
  });

  it('should display menu items with data-testid in table view', async () => {
    const user = userEvent.setup();
    render(<MenuRanking data={mockData} />);
    
    // テーブルタブに切り替え
    const tableTab = screen.getByText('テーブル');
    await user.click(tableTab);
    
    const items = screen.getAllByTestId('menu-ranking-item');
    expect(items.length).toBe(3);
  });

  it('should display menu names from API data in table view', async () => {
    const user = userEvent.setup();
    render(<MenuRanking data={mockData} />);
    
    // テーブルタブに切り替え
    const tableTab = screen.getByText('テーブル');
    await user.click(tableTab);
    
    expect(screen.getByText('骨盤矯正')).toBeInTheDocument();
    expect(screen.getByText('鍼治療')).toBeInTheDocument();
    expect(screen.getByText('マッサージ')).toBeInTheDocument();
  });

  it('should sort by revenue descending in table view', async () => {
    const user = userEvent.setup();
    const unsortedData: MenuRankingType[] = [
      { menu_id: '1', menu_name: 'メニューA', total_revenue: 100000, transaction_count: 10 },
      { menu_id: '2', menu_name: 'メニューB', total_revenue: 500000, transaction_count: 50 },
      { menu_id: '3', menu_name: 'メニューC', total_revenue: 300000, transaction_count: 30 },
    ];
    
    render(<MenuRanking data={unsortedData} />);
    
    // テーブルタブに切り替え
    const tableTab = screen.getByText('テーブル');
    await user.click(tableTab);
    
    const items = screen.getAllByTestId('menu-ranking-item');
    // 最初のアイテムが最高売上
    expect(items[0]).toHaveTextContent('メニューB');
  });

  it('should show empty state when data is empty', () => {
    render(<MenuRanking data={[]} />);
    
    expect(screen.getByText('データがありません')).toBeInTheDocument();
  });

  it('should show empty state when data is undefined', () => {
    render(<MenuRanking data={undefined} />);
    
    expect(screen.getByText('データがありません')).toBeInTheDocument();
  });

  it('should not use hardcoded mock data', () => {
    // 空データでレンダリング
    render(<MenuRanking data={[]} />);
    
    // ハードコードのモックデータが表示されない
    expect(screen.queryByText('全身調整')).not.toBeInTheDocument();
    expect(screen.queryByText('骨盤矯正')).not.toBeInTheDocument();
  });

  it('should switch between graph and table view', async () => {
    const user = userEvent.setup();
    render(<MenuRanking data={mockData} />);
    
    // テーブルタブをクリック
    const tableTab = screen.getByText('テーブル');
    await user.click(tableTab);
    
    // テーブルが表示される
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('メニュー名')).toBeInTheDocument();
    expect(screen.getByText('売上')).toBeInTheDocument();
  });
});
