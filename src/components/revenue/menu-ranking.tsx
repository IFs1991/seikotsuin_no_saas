'use client';

import React, { useState, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { MenuRanking as MenuRankingType } from '@/types/api';

interface MenuRankingProps {
  data?: MenuRankingType[];
}

const MenuRanking: React.FC<MenuRankingProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState('graph');

  const hasData = data && data.length > 0;

  // 売上降順でソート
  const sortedData = useMemo(() => {
    if (!hasData) return [];
    return [...data].sort((a, b) => b.total_revenue - a.total_revenue);
  }, [data, hasData]);

  const formatCurrency = (value: number) => {
    return value.toLocaleString('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    });
  };

  return (
    <Card className='w-full bg-card text-foreground'>
      <CardHeader className='bg-card'>
        <CardTitle className='text-center text-2xl font-bold text-primary-600 dark:text-medical-green-500'>
          施術メニュー別収益ランキング
        </CardTitle>
        <CardDescription className='text-center text-muted-foreground'>
          各施術メニューの売上と利用回数を表示します。
        </CardDescription>
      </CardHeader>
      <CardContent className='bg-card p-6'>
        {!hasData ? (
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            データがありません
          </div>
        ) : (
          <>
            <div className='flex justify-end mb-4'>
              <Button className='bg-primary-600 text-white hover:bg-primary-600/90 dark:bg-medical-green-500 dark:hover:bg-medical-green-500/90'>
                エクスポート
              </Button>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className='w-full'
            >
              <TabsList className='grid w-full grid-cols-2 bg-muted'>
                <TabsTrigger
                  value='graph'
                  className='data-[state=active]:bg-primary-600 data-[state=active]:text-white dark:data-[state=active]:bg-medical-green-500 dark:data-[state=active]:text-white'
                >
                  グラフ
                </TabsTrigger>
                <TabsTrigger
                  value='table'
                  className='data-[state=active]:bg-primary-600 data-[state=active]:text-white dark:data-[state=active]:bg-medical-green-500 dark:data-[state=active]:text-white'
                >
                  テーブル
                </TabsTrigger>
              </TabsList>
              <TabsContent value='graph' className='mt-4'>
                <div className='h-80'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart
                      data={sortedData}
                      layout='vertical'
                      margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
                      <XAxis
                        type='number'
                        tickFormatter={formatCurrency}
                        stroke='#6b7280'
                        fontSize={12}
                      />
                      <YAxis
                        type='category'
                        dataKey='menu_name'
                        stroke='#6b7280'
                        fontSize={12}
                        width={90}
                      />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label: string) => label}
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar
                        dataKey='total_revenue'
                        fill='#1e3a8a'
                        radius={[0, 4, 4, 0]}
                        name='売上'
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
              <TabsContent value='table' className='mt-4'>
                <div className='overflow-x-auto'>
                  <table className='min-w-full bg-background border border-border rounded-md'>
                    <thead>
                      <tr className='bg-muted text-left text-sm font-medium text-foreground'>
                        <th className='py-2 px-4 border-b border-border'>
                          ランキング
                        </th>
                        <th className='py-2 px-4 border-b border-border'>
                          メニュー名
                        </th>
                        <th className='py-2 px-4 border-b border-border text-right'>
                          売上
                        </th>
                        <th className='py-2 px-4 border-b border-border text-right'>
                          利用回数
                        </th>
                        <th className='py-2 px-4 border-b border-border text-right'>
                          平均単価
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedData.map((menu, index) => (
                        <tr
                          key={menu.menu_id || index}
                          data-testid='menu-ranking-item'
                          className='hover:bg-gray-50 dark:hover:bg-muted'
                        >
                          <td className='py-2 px-4 border-b border-border'>
                            {index + 1}
                          </td>
                          <td className='py-2 px-4 border-b border-border'>
                            {menu.menu_name}
                          </td>
                          <td className='py-2 px-4 border-b border-border text-right'>
                            {formatCurrency(menu.total_revenue)}
                          </td>
                          <td className='py-2 px-4 border-b border-border text-right'>
                            {menu.transaction_count.toLocaleString()}回
                          </td>
                          <td className='py-2 px-4 border-b border-border text-right'>
                            {menu.transaction_count > 0
                              ? formatCurrency(
                                  Math.round(
                                    menu.total_revenue / menu.transaction_count
                                  )
                                )
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MenuRanking;
