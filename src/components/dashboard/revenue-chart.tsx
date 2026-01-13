'use client';

import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { RevenueChartPoint } from '@/types/api';

interface RevenueChartProps {
  data?: RevenueChartPoint[];
}

const RevenueChart: React.FC<RevenueChartProps> = ({ data }) => {
  const hasData = data && data.length > 0;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    });
  };

  return (
    <Card className='w-full bg-card'>
      <CardHeader className='bg-card'>
        <CardTitle className='bg-card text-gray-900 dark:text-gray-100'>
          収益トレンド
        </CardTitle>
        <CardDescription className='bg-card text-gray-600 dark:text-gray-400'>
          日次の収益推移を表示します（総売上・保険診療・自費診療）。
        </CardDescription>
      </CardHeader>
      <CardContent className='bg-card'>
        {!hasData ? (
          <div className='flex items-center justify-center h-64 text-gray-500 dark:text-gray-400'>
            データがありません
          </div>
        ) : (
          <div className='w-full h-80'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart
                data={data}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
                <XAxis
                  dataKey='name'
                  tickFormatter={formatDate}
                  stroke='#6b7280'
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={formatCurrency}
                  stroke='#6b7280'
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(label: string) => `日付: ${label}`}
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type='monotone'
                  dataKey='総売上'
                  stroke='#1e3a8a'
                  strokeWidth={2}
                  dot={{ fill: '#1e3a8a', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type='monotone'
                  dataKey='保険診療'
                  stroke='#10b981'
                  strokeWidth={2}
                  dot={{ fill: '#10b981', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type='monotone'
                  dataKey='自費診療'
                  stroke='#f59e0b'
                  strokeWidth={2}
                  dot={{ fill: '#f59e0b', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RevenueChart;
