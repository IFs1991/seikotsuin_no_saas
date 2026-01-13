'use client';

import React, { useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { ConversionStage } from '@/types/api';

interface ConversionFunnelProps {
  stages?: ConversionStage[];
}

const ConversionFunnel: React.FC<ConversionFunnelProps> = ({ stages }) => {
  const hasData = stages && stages.length > 0;

  // 先頭ステージを100%として転換率を計算
  const stagesWithRates = useMemo(() => {
    if (!hasData) return [];

    const baseValue = stages[0].value;
    if (baseValue === 0) return stages.map(s => ({ ...s, percentage: 0 }));

    return stages.map(stage => ({
      ...stage,
      percentage: Math.round((stage.value / baseValue) * 100),
    }));
  }, [stages, hasData]);

  // ステージのカラーを決定（インデックスによる）
  const getStageColor = (index: number, _total: number) => {
    // グラデーション: 濃い青 → 緑
    const colors = ['#1e3a8a', '#2563eb', '#10b981', '#059669', '#047857'];
    return colors[Math.min(index, colors.length - 1)];
  };

  return (
    <Card className='w-full bg-card text-[#111827] dark:text-[#f9fafb]'>
      <CardHeader className='bg-card border-b border-gray-200 dark:border-gray-700 pb-4'>
        <CardTitle className='text-center text-2xl font-bold text-[#1e3a8a] dark:text-[#10b981]'>
          新患→再診転換ファネル
        </CardTitle>
        <CardDescription className='text-center text-gray-600 dark:text-gray-400 mt-2'>
          患者フローと各段階の転換率を視覚化します。
        </CardDescription>
      </CardHeader>
      <CardContent className='bg-card p-6'>
        {!hasData ? (
          <div className='flex items-center justify-center h-64 text-gray-500 dark:text-gray-400'>
            データがありません
          </div>
        ) : (
          <div className='flex flex-col items-center space-y-3'>
            {stagesWithRates.map((stage, index) => (
              <div
                key={stage.name}
                data-testid='funnel-stage'
                className='relative w-full max-w-[700px] rounded-md overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md'
                style={{
                  width: `${Math.max(100 - index * 15, 40)}%`,
                  backgroundColor: getStageColor(index, stagesWithRates.length),
                  minHeight: '60px',
                }}
              >
                <div className='flex justify-between items-center p-3 text-white font-semibold'>
                  <span className='text-lg'>{stage.name}</span>
                  <span className='text-xl'>
                    {stage.value.toLocaleString()}人
                  </span>
                </div>
                {/* 転換率表示 */}
                <div
                  className='absolute top-1/2 left-full -translate-y-1/2 ml-4 text-[#111827] dark:text-[#f9fafb] text-sm font-medium whitespace-nowrap'
                  data-testid='conversion-rate'
                >
                  <span className='text-[#10b981] dark:text-[#10b981] font-bold'>
                    {stage.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ConversionFunnel;
