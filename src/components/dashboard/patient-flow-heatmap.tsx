'use client';

import React, { useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { HeatmapPoint } from '@/types/api';

interface PatientFlowHeatmapProps {
  data?: HeatmapPoint[];
}

const DAYS_OF_WEEK = ['月', '火', '水', '木', '金', '土', '日'] as const;
const HOURS_OF_DAY = Array.from({ length: 24 }, (_, index) => index);

type HeatmapMatrix = Record<number, Record<number, number>>;

function normalizeDayIndex(dayIndex: number) {
  return (dayIndex + 6) % 7; // API(Sun=0) -> UI(Mon=0)
}

function getColorForCongestion(value: number) {
  // 非常に薄い緑からアクセントカラーの緑 (#10b981) へ補間
  const r1 = 224;
  const g1 = 255;
  const b1 = 224;
  const r2 = 16;
  const g2 = 185;
  const b2 = 129;

  const r = Math.round(r1 + (r2 - r1) * (value / 100));
  const g = Math.round(g1 + (g2 - g1) * (value / 100));
  const b = Math.round(b1 + (b2 - b1) * (value / 100));

  return `rgb(${r}, ${g}, ${b})`;
}

const PatientFlowHeatmap: React.FC<PatientFlowHeatmapProps> = ({ data }) => {
  const hasData = data && data.length > 0;

  // APIデータを曜日×時間帯のマトリクスに変換
  const { normalizedMatrix, visitCountMatrix } = useMemo(() => {
    const empty = {
      normalizedMatrix: {} as HeatmapMatrix,
      visitCountMatrix: {} as HeatmapMatrix,
    };

    if (!hasData) return empty;

    const normalized: HeatmapMatrix = {};
    const visitCounts: HeatmapMatrix = {};
    let maxVisits = 0;

    // 最大来院数を計算（正規化用）
    data.forEach(point => {
      if (point.visit_count > maxVisits) {
        maxVisits = point.visit_count;
      }
    });

    // マトリクスに変換
    data.forEach(point => {
      const dayIndex = normalizeDayIndex(point.day_of_week);
      const hour = point.hour_of_day;

      if (!normalized[dayIndex]) {
        normalized[dayIndex] = {};
      }
      if (!visitCounts[dayIndex]) {
        visitCounts[dayIndex] = {};
      }

      visitCounts[dayIndex][hour] = point.visit_count;
      // 来院数を0-100の範囲に正規化
      normalized[dayIndex][hour] =
        maxVisits > 0 ? Math.round((point.visit_count / maxVisits) * 100) : 0;
    });

    return {
      normalizedMatrix: normalized,
      visitCountMatrix: visitCounts,
    };
  }, [data, hasData]);

  return (
    <Card className='w-full bg-card text-foreground'>
      <CardHeader className='bg-card'>
        <CardTitle className='bg-card text-foreground'>
          時間帯別混雑状況ヒートマップ
        </CardTitle>
        <CardDescription className='bg-card text-muted-foreground'>
          曜日と時間帯ごとの来院パターンを視覚化します。
        </CardDescription>
      </CardHeader>
      <CardContent className='bg-card p-4'>
        {!hasData ? (
          <div className='flex items-center justify-center h-64 text-muted-foreground'>
            データがありません
          </div>
        ) : (
          <div className='flex flex-col space-y-4'>
            {/* ヒートマップ本体 */}
            <div className='overflow-x-auto'>
              <div className='grid grid-cols-[auto_repeat(24,_minmax(0,_1fr))] gap-1 p-2 min-w-[960px]'>
                {/* 時間帯ヘッダー */}
                <div className='col-span-1'></div>
                {HOURS_OF_DAY.map(hour => (
                  <div
                    key={hour}
                    className='text-center font-semibold text-sm text-foreground'
                  >
                    {hour}:00
                  </div>
                ))}
                {/* 各曜日と時間帯のセル */}
                {DAYS_OF_WEEK.map((day, dayIndex) => (
                  <React.Fragment key={day}>
                    <div className='font-semibold text-sm py-2 text-foreground flex items-center justify-center'>
                      {day}
                    </div>
                    {HOURS_OF_DAY.map(hour => {
                      const normalizedValue =
                        normalizedMatrix[dayIndex]?.[hour] || 0;
                      const visitCount =
                        visitCountMatrix[dayIndex]?.[hour] || 0;
                      const backgroundColor =
                        getColorForCongestion(normalizedValue);
                      return (
                        <div
                          key={`${day}-${hour}`}
                          data-testid='heatmap-cell'
                          className='relative h-12 flex items-center justify-center text-xs text-foreground border border-border group cursor-pointer'
                          style={{ backgroundColor }}
                        >
                          {/* ホバーで詳細情報表示 */}
                          <span className='opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded bg-black bg-opacity-70 text-white absolute z-10 whitespace-nowrap pointer-events-none'>
                            {`${day} ${hour}:00: ${visitCount}名`}
                          </span>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className='flex justify-end items-center gap-2 text-sm text-foreground'>
              <div
                className='w-4 h-4 border border-gray-200'
                style={{ backgroundColor: getColorForCongestion(0) }}
              ></div>
              <span>少</span>
              <div
                className='w-4 h-4 border border-gray-200'
                style={{ backgroundColor: getColorForCongestion(50) }}
              ></div>
              <span>中</span>
              <div
                className='w-4 h-4 border border-gray-200'
                style={{ backgroundColor: getColorForCongestion(100) }}
              ></div>
              <span>多</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PatientFlowHeatmap;
