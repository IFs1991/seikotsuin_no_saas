'use client';

import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const StoreComparisonChart: React.FC = () => {
  const [selectedKpi, setSelectedKpi] = useState('売上');
  const [selectedPeriod, setSelectedPeriod] = useState('月次');
  const [selectedGrouping, setSelectedGrouping] = useState('なし');

  // ダミーデータ
  const stores = [
    {
      id: 'storeA',
      name: '新宿院',
      sales: 1200000,
      patients: 150,
      satisfaction: 4.8,
    },
    {
      id: 'storeB',
      name: '渋谷院',
      sales: 1100000,
      patients: 140,
      satisfaction: 4.7,
    },
    {
      id: 'storeC',
      name: '池袋院',
      sales: 1300000,
      patients: 160,
      satisfaction: 4.9,
    },
    {
      id: 'storeD',
      name: '横浜院',
      sales: 950000,
      patients: 110,
      satisfaction: 4.5,
    },
    {
      id: 'storeE',
      name: '大阪院',
      sales: 1050000,
      patients: 130,
      satisfaction: 4.6,
    },
  ];

  const kpiOptions = [
    { value: '売上', label: '売上' },
    { value: '患者数', label: '患者数' },
    { value: '満足度', label: '満足度' },
  ];

  const periodOptions = [
    { value: '日次', label: '日次' },
    { value: '週次', label: '週次' },
    { value: '月次', label: '月次' },
    { value: '年次', label: '年次' },
  ];

  const groupingOptions = [
    { value: 'なし', label: 'なし' },
    { value: 'エリア別', label: 'エリア別' },
    { value: '規模別', label: '規模別' },
  ];

  // KPIに基づいてデータをソート
  const sortedStores = [...stores].sort((a, b) => {
    if (selectedKpi === '売上') return b.sales - a.sales;
    if (selectedKpi === '患者数') return b.patients - a.patients;
    if (selectedKpi === '満足度') return b.satisfaction - a.satisfaction;
    return 0;
  });

  // ベンチマークラインの計算 (ここでは平均値とする)
  const calculateAverage = (kpi: string) => {
    if (stores.length === 0) return 0;
    const sum = stores.reduce((acc, store) => {
      if (kpi === '売上') return acc + store.sales;
      if (kpi === '患者数') return acc + store.patients;
      if (kpi === '満足度') return acc + store.satisfaction;
      return acc;
    }, 0);
    return sum / stores.length;
  };

  const benchmarkValue = calculateAverage(selectedKpi);

  return (
    <div className='min-h-screen p-8 bg-[#f9fafb] dark:bg-gray-800 flex justify-center'>
      <Card className='w-full max-w-4xl bg-card text-[#111827] dark:text-white shadow-lg rounded-lg'>
        <CardHeader className='bg-card border-b border-gray-200 dark:border-gray-700 p-6'>
          <CardTitle className='text-2xl font-bold text-center text-[#1e3a8a] dark:text-[#10b981]'>
            店舗間比較分析
          </CardTitle>
          <CardDescription className='text-center text-gray-600 dark:text-gray-300 mt-2'>
            複数店舗のパフォーマンスをKPI、期間、グルーピングで比較分析します。
          </CardDescription>
        </CardHeader>
        <CardContent className='bg-card p-6 space-y-6'>
          <div className='flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0 md:space-x-4'>
            {/* KPI選択 */}
            <div className='flex-1 w-full'>
              <Label
                htmlFor='kpi-select'
                className='text-sm font-medium text-[#111827] dark:text-white mb-2 block'
              >
                KPI選択
              </Label>
              <Tabs
                value={selectedKpi}
                onValueChange={setSelectedKpi}
                className='w-full'
              >
                <TabsList className='grid w-full grid-cols-3 bg-gray-100 dark:bg-gray-700'>
                  {kpiOptions.map(option => (
                    <TabsTrigger
                      key={option.value}
                      value={option.value}
                      className='data-[state=active]:bg-[#1e3a8a] data-[state=active]:text-white dark:data-[state=active]:bg-[#10b981] dark:data-[state=active]:text-gray-900 text-[#111827] dark:text-white'
                    >
                      {option.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* 期間選択 */}
            <div className='flex-1 w-full'>
              <Label
                htmlFor='period-select'
                className='text-sm font-medium text-[#111827] dark:text-white mb-2 block'
              >
                期間選択
              </Label>
              <RadioGroup
                value={selectedPeriod}
                onValueChange={setSelectedPeriod}
                className='flex space-x-4 justify-around bg-gray-100 dark:bg-gray-700 p-2 rounded-md'
              >
                {periodOptions.map(option => (
                  <div
                    key={option.value}
                    className='flex items-center space-x-2'
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={`period-${option.value}`}
                      className='text-[#1e3a8a] dark:text-[#10b981] border-[#1e3a8a] dark:border-[#10b981]'
                    />
                    <Label
                      htmlFor={`period-${option.value}`}
                      className='text-[#111827] dark:text-white'
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          {/* 店舗グルーピング */}
          <div className='w-full'>
            <Label
              htmlFor='grouping-select'
              className='text-sm font-medium text-[#111827] dark:text-white mb-2 block'
            >
              店舗グルーピング
            </Label>
            <select
              id='grouping-select'
              value={selectedGrouping}
              onChange={e => setSelectedGrouping(e.target.value)}
              className='w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-[#111827] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] dark:focus:ring-[#10b981]'
            >
              {groupingOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <Separator className='my-6 bg-gray-200 dark:bg-gray-700' />

          {/* チャート表示エリア (簡易的な棒グラフで表現) */}
          <div className='bg-gray-50 dark:bg-gray-700 p-4 rounded-md shadow-inner h-80 flex flex-col justify-end relative overflow-hidden'>
            <h3 className='text-lg font-semibold text-[#1e3a8a] dark:text-[#10b981] mb-4 text-center'>
              {selectedKpi} {selectedPeriod} 店舗別比較
            </h3>
            <div className='absolute top-4 right-4 text-sm text-gray-500 dark:text-gray-400'>
              <span className='inline-block w-3 h-3 rounded-full bg-[#1e3a8a] dark:bg-[#10b981] mr-1'></span>{' '}
              店舗データ
              <span className='inline-block w-3 h-3 rounded-full bg-red-500 mr-1 ml-3'></span>{' '}
              ベンチマーク
            </div>

            {/* ベンチマークライン */}
            <div
              className='absolute left-0 right-0 border-t-2 border-dashed border-red-500 text-red-500 text-xs text-center'
              style={{
                bottom: `${(benchmarkValue / (selectedKpi === '売上' ? 1500000 : selectedKpi === '患者数' ? 200 : 5)) * 100}%`,
              }}
            >
              ベンチマーク (
              {benchmarkValue.toFixed(selectedKpi === '満足度' ? 1 : 0)})
            </div>

            <div className='flex items-end justify-around h-full'>
              {sortedStores.map(store => {
                let value = 0;
                if (selectedKpi === '売上') value = store.sales;
                if (selectedKpi === '患者数') value = store.patients;
                if (selectedKpi === '満足度') value = store.satisfaction;

                // スケール調整 (最大値を基準に高さを計算)
                const maxValue =
                  selectedKpi === '売上'
                    ? 1500000
                    : selectedKpi === '患者数'
                      ? 200
                      : 5; // 仮の最大値
                const barHeight = (value / maxValue) * 100;

                // 統計的有意差の簡易的な表示 (例: ベンチマークより20%以上高い/低い場合)
                const isSignificant =
                  Math.abs(value - benchmarkValue) / benchmarkValue > 0.2;
                const significanceColor = isSignificant
                  ? value > benchmarkValue
                    ? 'border-green-500'
                    : 'border-orange-500'
                  : '';

                return (
                  <div
                    key={store.id}
                    className='flex flex-col items-center mx-2'
                  >
                    <div
                      className={`w-10 bg-[#1e3a8a] dark:bg-[#10b981] rounded-t-sm transition-all duration-300 ease-out ${significanceColor} border-b-2`}
                      style={{ height: `${barHeight}%` }}
                      title={`${store.name}: ${value.toLocaleString()}`}
                    ></div>
                    <span className='text-xs mt-1 text-[#111827] dark:text-white'>
                      {store.name}
                    </span>
                    <span className='text-xs text-gray-500 dark:text-gray-400'>
                      {selectedKpi === '売上'
                        ? `¥${value.toLocaleString()}`
                        : value.toFixed(selectedKpi === '満足度' ? 1 : 0)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className='text-sm text-gray-500 dark:text-gray-400 mt-4 text-center'>
              {/* 統計的有意差の表示説明 */}
              <p className='mt-2'>
                <span className='inline-block w-3 h-3 border-b-2 border-green-500 mr-1'></span>{' '}
                ベンチマークより有意に高い
                <span className='inline-block w-3 h-3 border-b-2 border-orange-500 mr-1 ml-3'></span>{' '}
                ベンチマークより有意に低い
              </p>
            </div>
          </div>

          {/* データエクスポートボタン */}
          <div className='flex justify-end mt-6'>
            <Button className='bg-[#1e3a8a] hover:bg-[#10b981] text-white dark:bg-[#10b981] dark:hover:bg-[#1e3a8a] px-6 py-2 rounded-md shadow-md transition-colors duration-200'>
              データエクスポート
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StoreComparisonChart;
