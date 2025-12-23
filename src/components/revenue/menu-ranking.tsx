import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const MenuRanking: React.FC = () => {
  const [activeTab, setActiveTab] = useState('graph');

  // モックデータ
  const mockMenuData = [
    {
      id: 1,
      name: '全身調整',
      revenue: 1200000,
      usage: 500,
      unitPrice: 2400,
      prevPeriod: 1100000,
    },
    {
      id: 2,
      name: '骨盤矯正',
      revenue: 950000,
      usage: 400,
      unitPrice: 2375,
      prevPeriod: 980000,
    },
    {
      id: 3,
      name: '鍼治療',
      revenue: 780000,
      usage: 300,
      unitPrice: 2600,
      prevPeriod: 700000,
    },
    {
      id: 4,
      name: '電気治療',
      revenue: 620000,
      usage: 600,
      unitPrice: 1033,
      prevPeriod: 650000,
    },
    {
      id: 5,
      name: '部分マッサージ',
      revenue: 500000,
      usage: 800,
      unitPrice: 625,
      prevPeriod: 480000,
    },
  ];

  return (
    <div className='flex justify-center py-8 bg-white dark:bg-gray-800 min-h-screen'>
      <Card className='w-full max-w-4xl bg-card text-[#111827] dark:text-[#f9fafb]'>
        <CardHeader className='bg-card'>
          <CardTitle className='text-center text-2xl font-bold text-[#1e3a8a] dark:text-[#10b981]'>
            施術メニュー別収益ランキング
          </CardTitle>
          <CardDescription className='text-center text-gray-600 dark:text-gray-400'>
            各施術メニューの売上、利用回数、単価、前期比較を表示します。
          </CardDescription>
        </CardHeader>
        <CardContent className='bg-card p-6'>
          <div className='flex justify-between items-center mb-4'>
            <div className='flex space-x-2'>
              <Button className='bg-[#1e3a8a] text-white hover:bg-[#1e3a8a]/90 dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'>
                期間選択
              </Button>
              <Button className='bg-[#1e3a8a] text-white hover:bg-[#1e3a8a]/90 dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'>
                施術者別内訳
              </Button>
            </div>
            <Button className='bg-[#1e3a8a] text-white hover:bg-[#1e3a8a]/90 dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'>
              エクスポート
            </Button>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className='w-full'
          >
            <TabsList className='grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-700'>
              <TabsTrigger
                value='graph'
                className='data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white dark:data-[state=active]:bg-[#10b981] dark:data-[state=active]:text-white'
              >
                グラフ
              </TabsTrigger>
              <TabsTrigger
                value='table'
                className='data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white dark:data-[state=active]:bg-[#10b981] dark:data-[state=active]:text-white'
              >
                テーブル
              </TabsTrigger>
            </TabsList>
            <TabsContent value='graph' className='mt-4'>
              <div className='h-80 bg-gray-50 dark:bg-gray-700 flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'>
                グラフ表示エリア (実装予定)
                {/* ここにチャートコンポーネントを配置 */}
              </div>
            </TabsContent>
            <TabsContent value='table' className='mt-4'>
              <div className='overflow-x-auto'>
                <table className='min-w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md'>
                  <thead>
                    <tr className='bg-gray-100 dark:bg-gray-700 text-left text-sm font-medium text-gray-700 dark:text-gray-300'>
                      <th className='py-2 px-4 border-b border-gray-200 dark:border-gray-700'>
                        ランキング
                      </th>
                      <th className='py-2 px-4 border-b border-gray-200 dark:border-gray-700'>
                        メニュー名
                      </th>
                      <th className='py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-right'>
                        売上
                      </th>
                      <th className='py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-right'>
                        利用回数
                      </th>
                      <th className='py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-right'>
                        単価
                      </th>
                      <th className='py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-right'>
                        前期比較
                      </th>
                      <th className='py-2 px-4 border-b border-gray-200 dark:border-gray-700'></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockMenuData
                      .sort((a, b) => b.revenue - a.revenue)
                      .map((menu, index) => (
                        <tr
                          key={menu.id}
                          className='hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        >
                          <td className='py-2 px-4 border-b border-gray-200 dark:border-gray-700'>
                            {index + 1}
                          </td>
                          <td className='py-2 px-4 border-b border-gray-200 dark:border-gray-700'>
                            {menu.name}
                          </td>
                          <td className='py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-right'>
                            {menu.revenue.toLocaleString()}
                          </td>
                          <td className='py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-right'>
                            {menu.usage.toLocaleString()}回
                          </td>
                          <td className='py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-right'>
                            {menu.unitPrice.toLocaleString()}
                          </td>
                          <td className='py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-right'>
                            <span
                              className={
                                menu.revenue > menu.prevPeriod
                                  ? 'text-[#10b981]'
                                  : 'text-red-500'
                              }
                            >
                              {(
                                ((menu.revenue - menu.prevPeriod) /
                                  menu.prevPeriod) *
                                100
                              ).toFixed(1)}
                              %
                            </span>
                          </td>
                          <td className='py-2 px-4 border-b border-gray-200 dark:border-gray-700 text-center'>
                            <Button
                              variant='ghost'
                              className='text-[#1e3a8a] hover:bg-gray-200 dark:text-[#10b981] dark:hover:bg-gray-600'
                            >
                              詳細
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default MenuRanking;
