import React from 'react';
import { render, screen } from '@testing-library/react';
import ConversionFunnel from '@/components/patients/conversion-funnel';
import { ConversionStage } from '@/types/api';

describe('ConversionFunnel', () => {
  const mockStages: ConversionStage[] = [
    { name: '初回来院', value: 100 },
    { name: '2回目来院', value: 80 },
    { name: '継続通院', value: 50 },
  ];

  it('should render funnel when stages are provided', () => {
    render(<ConversionFunnel stages={mockStages} />);
    
    expect(screen.getByText('新患→再診転換ファネル')).toBeInTheDocument();
  });

  it('should display funnel stages with data-testid', () => {
    render(<ConversionFunnel stages={mockStages} />);
    
    const stages = screen.getAllByTestId('funnel-stage');
    expect(stages.length).toBe(3);
  });

  it('should display stage names from API data', () => {
    render(<ConversionFunnel stages={mockStages} />);
    
    expect(screen.getByText('初回来院')).toBeInTheDocument();
    expect(screen.getByText('2回目来院')).toBeInTheDocument();
    expect(screen.getByText('継続通院')).toBeInTheDocument();
  });

  it('should calculate conversion rate with first stage as 100%', () => {
    render(<ConversionFunnel stages={mockStages} />);
    
    // 転換率が表示される
    const rates = screen.getAllByTestId('conversion-rate');
    expect(rates.length).toBeGreaterThan(0);
    
    // 80人 / 100人 = 80%
    expect(screen.getByText(/80%/)).toBeInTheDocument();
    // 50人 / 100人 = 50%（先頭基準）
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it('should show empty state when stages is empty', () => {
    render(<ConversionFunnel stages={[]} />);
    
    expect(screen.getByText('データがありません')).toBeInTheDocument();
  });

  it('should show empty state when stages is undefined', () => {
    render(<ConversionFunnel stages={undefined} />);
    
    expect(screen.getByText('データがありません')).toBeInTheDocument();
  });

  it('should not use hardcoded mock data', () => {
    // 空データでレンダリング
    render(<ConversionFunnel stages={[]} />);
    
    // ハードコードされたモックデータが表示されない
    expect(screen.queryByText('新患')).not.toBeInTheDocument();
    expect(screen.queryByText('1000人')).not.toBeInTheDocument();
  });

  it('should handle single stage', () => {
    const singleStage: ConversionStage[] = [
      { name: '初回来院', value: 100 },
    ];
    
    render(<ConversionFunnel stages={singleStage} />);
    
    expect(screen.getByText('初回来院')).toBeInTheDocument();
    // 単一ステージでは100%のみ
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
