'use client';

import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PatientFlowHeatmap: React.FC = () => {
  const daysOfWeek = ['月', '火', '水', '木', '金', '土', '日'];
  const hoursOfDay = Array.from({ length: 10 }, (_, i) => `${9 + i}:00`); // 9:00 - 18:00

  // ダミーデータ：混雑度 (0-100)
  const congestionData: { [key: string]: { [key: string]: number } } = {
    月: {
      '9:00': 30,
      '10:00': 45,
      '11:00': 60,
      '12:00': 75,
      '13:00': 50,
      '14:00': 40,
      '15:00': 55,
      '16:00': 70,
      '17:00': 85,
      '18:00': 90,
    },
    火: {
      '9:00': 25,
      '10:00': 40,
      '11:00': 55,
      '12:00': 70,
      '13:00': 45,
      '14:00': 35,
      '15:00': 50,
      '16:00': 65,
      '17:00': 80,
      '18:00': 85,
    },
    水: {
      '9:00': 35,
      '10:00': 50,
      '11:00': 65,
      '12:00': 80,
      '13:00': 55,
      '14:00': 45,
      '15:00': 60,
      '16:00': 75,
      '17:00': 90,
      '18:00': 95,
    },
    木: {
      '9:00': 20,
      '10:00': 35,
      '11:00': 50,
      '12:00': 65,
      '13:00': 40,
      '14:00': 30,
      '15:00': 45,
      '16:00': 60,
      '17:00': 75,
      '18:00': 80,
    },
    金: {
      '9:00': 40,
      '10:00': 55,
      '11:00': 70,
      '12:00': 85,
      '13:00': 60,
      '14:00': 50,
      '15:00': 65,
      '16:00': 80,
      '17:00': 95,
      '18:00': 100,
    },
    土: {
      '9:00': 50,
      '10:00': 65,
      '11:00': 80,
      '12:00': 95,
      '13:00': 70,
      '14:00': 60,
      '15:00': 75,
      '16:00': 90,
      '17:00': 100,
      '18:00': 90,
    },
    日: {
      '9:00': 45,
      '10:00': 60,
      '11:00': 75,
      '12:00': 90,
      '13:00': 65,
      '14:00': 55,
      '15:00': 70,
      '16:00': 85,
      '17:00': 95,
      '18:00': 85,
    },
  };

  const getColorForCongestion = (value: number) => {
    // 非常に薄い緑からアクセントカラーの緑 (#10b981) へ補間
    const r1 = 224,
      g1 = 255,
      b1 = 224; // 非常に薄い緑 (e0ffe0)
    const r2 = 16,
      g2 = 185,
      b2 = 129; // アクセント緑 (10b981)

    const r = Math.round(r1 + (r2 - r1) * (value / 100));
    const g = Math.round(g1 + (g2 - g1) * (value / 100));
    const b = Math.round(b1 + (b2 - b1) * (value / 100));

    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <Card className='w-full bg-card text-[#111827] dark:text-[#f9fafb]'>
      <CardHeader className='bg-card'>
        <CardTitle className='bg-card text-[#111827] dark:text-[#f9fafb]'>
          時間帯別混雑状況ヒートマップ
        </CardTitle>
        <CardDescription className='bg-card text-[#111827] dark:text-[#f9fafb]'>
          曜日と時間帯ごとの混雑度を視覚化します。
        </CardDescription>
      </CardHeader>
      <CardContent className='bg-card p-4'>
        <div className='flex flex-col space-y-4'>
          {/* フィルタリングと比較機能のプレースホルダー */}
          <div className='flex flex-wrap gap-4 items-center'>
            <div className='flex items-center gap-2'>
              <Label
                htmlFor='date-range'
                className='text-[#111827] dark:text-[#f9fafb]'
              >
                期間選択:
              </Label>
              <Input
                id='date-range'
                type='date'
                className='w-auto bg-white dark:bg-gray-700 text-[#111827] dark:text-[#f9fafb] border border-gray-300 dark:border-gray-600'
              />
            </div>
            <Button className='bg-[#1e3a8a] text-white hover:bg-[#1e3a8a]/90'>
              過去データと比較
            </Button>
            <Button className='bg-[#1e3a8a] text-white hover:bg-[#1e3a8a]/90'>
              CSVエクスポート
            </Button>
            <Button className='bg-[#1e3a8a] text-white hover:bg-[#1e3a8a]/90'>
              画像エクスポート
            </Button>
          </div>

          {/* ヒートマップ本体 */}
          <div className='overflow-x-auto'>
            <div className='grid grid-cols-[auto_repeat(10,_minmax(0,_1fr))] gap-1 p-2 min-w-[600px]'>
              {/* 時間帯ヘッダー */}
              <div className='col-span-1'></div> {/* 配置のための空セル */}
              {hoursOfDay.map((hour, index) => (
                <div
                  key={index}
                  className='text-center font-semibold text-sm text-[#111827] dark:text-[#f9fafb]'
                >
                  {hour}
                </div>
              ))}
              {/* 各曜日と時間帯のセル */}
              {daysOfWeek.map((day, _dayIndex) => (
                <React.Fragment key={day}>
                  <div className='font-semibold text-sm py-2 text-[#111827] dark:text-[#f9fafb] flex items-center justify-center'>
                    {day}
                  </div>
                  {hoursOfDay.map((hour, _hourIndex) => {
                    const congestionValue = congestionData[day]?.[hour] || 0;
                    const backgroundColor =
                      getColorForCongestion(congestionValue);
                    return (
                      <div
                        key={`${day}-${hour}`}
                        className='relative h-12 flex items-center justify-center text-xs text-[#111827] dark:text-[#f9fafb] border border-gray-200 dark:border-gray-700 group'
                        style={{ backgroundColor }}
                      >
                        {/* ホバーで詳細情報表示 */}
                        <span className='opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded bg-black bg-opacity-70 text-white absolute z-10 whitespace-nowrap pointer-events-none'>
                          {`${day} ${hour}: 混雑度 ${congestionValue}%`}
                        </span>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className='flex justify-end items-center gap-2 text-sm text-[#111827] dark:text-[#f9fafb]'>
            <div
              className='w-4 h-4'
              style={{ backgroundColor: getColorForCongestion(0) }}
            ></div>
            <span>低</span>
            <div
              className='w-4 h-4'
              style={{ backgroundColor: getColorForCongestion(50) }}
            ></div>
            <span>中</span>
            <div
              className='w-4 h-4'
              style={{ backgroundColor: getColorForCongestion(100) }}
            ></div>
            <span>高</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PatientFlowHeatmap;
