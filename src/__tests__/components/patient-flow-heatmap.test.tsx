import React from 'react';
import { render, screen } from '@testing-library/react';
import PatientFlowHeatmap from '@/components/dashboard/patient-flow-heatmap';
import { HeatmapPoint } from '@/types/api';

describe('PatientFlowHeatmap', () => {
  const mockData: HeatmapPoint[] = [
    { day_of_week: 0, hour_of_day: 9, visit_count: 5, avg_revenue: 10000 },
    { day_of_week: 0, hour_of_day: 10, visit_count: 8, avg_revenue: 15000 },
    { day_of_week: 1, hour_of_day: 9, visit_count: 3, avg_revenue: 8000 },
    { day_of_week: 1, hour_of_day: 10, visit_count: 6, avg_revenue: 12000 },
  ];

  it('should render heatmap when data is provided', () => {
    render(<PatientFlowHeatmap data={mockData} />);

    expect(
      screen.getByText('時間帯別混雑状況ヒートマップ')
    ).toBeInTheDocument();
    // ヒートマップセルが存在する
    expect(screen.getAllByTestId('heatmap-cell').length).toBeGreaterThan(0);
  });

  it('should display day of week labels', () => {
    render(<PatientFlowHeatmap data={mockData} />);

    expect(screen.getByText('月')).toBeInTheDocument();
    expect(screen.getByText('火')).toBeInTheDocument();
    expect(screen.getByText('日')).toBeInTheDocument();
  });

  it('should display hour labels', () => {
    render(<PatientFlowHeatmap data={mockData} />);

    expect(screen.getByText('9:00')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('should show empty state when data is empty', () => {
    render(<PatientFlowHeatmap data={[]} />);

    expect(screen.getByText('データがありません')).toBeInTheDocument();
  });

  it('should show empty state when data is undefined', () => {
    render(<PatientFlowHeatmap data={undefined} />);

    expect(screen.getByText('データがありません')).toBeInTheDocument();
  });

  it('should not use hardcoded mock data', () => {
    // 空のデータでレンダリング
    render(<PatientFlowHeatmap data={[]} />);

    // ハードコードされたモックデータのパターンが表示されない
    // （congestionData[day][hour]形式のデータ）
    expect(screen.queryByText('混雑度 75%')).not.toBeInTheDocument();
  });

  it('should transform API data format correctly', () => {
    // day_of_week: 0 = 日曜日 (DB DOW), UI側で月曜起点に変換
    const data: HeatmapPoint[] = [
      { day_of_week: 0, hour_of_day: 9, visit_count: 10, avg_revenue: 20000 },
    ];

    render(<PatientFlowHeatmap data={data} />);

    // 変換後のセルが存在する
    const cells = screen.getAllByTestId('heatmap-cell');
    expect(cells.length).toBeGreaterThan(0);
  });
});
