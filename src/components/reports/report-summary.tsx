import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const ReportSummary: React.FC = () => {
  return (
    <div className='w-full bg-white dark:bg-gray-800 flex justify-center pt-4'>
      <Card className='w-full max-w-2xl bg-card'>
        <CardHeader className='bg-card'>
          <CardTitle className='text-lg font-semibold bg-card'>
            本日の日報サマリー
          </CardTitle>
          <CardDescription className='text-sm text-gray-500 bg-card'>
            本日の施術に関する情報をまとめたものです。
          </CardDescription>
        </CardHeader>
        <CardContent className='bg-card'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {/* 本日の施術件数・売上表示 */}
            <div className='bg-gray-100 dark:bg-gray-700 p-4 rounded-md'>
              <h3 className='text-md font-semibold text-gray-800 dark:text-gray-200'>
                本日の施術件数
              </h3>
              <p className='text-2xl font-bold text-blue-600 dark:text-blue-400'>
                50 件
              </p>
              <h3 className='text-md font-semibold text-gray-800 dark:text-gray-200 mt-2'>
                本日の売上
              </h3>
              <p className='text-2xl font-bold text-green-600 dark:text-green-400'>
                ¥150,000
              </p>
            </div>

            {/* 施術者別パフォーマンス */}
            <div className='bg-gray-100 dark:bg-gray-700 p-4 rounded-md'>
              <h3 className='text-md font-semibold text-gray-800 dark:text-gray-200'>
                施術者別パフォーマンス
              </h3>
              <ul className='list-disc pl-5 mt-2'>
                <li className='text-gray-700 dark:text-gray-300'>田中：15件</li>
                <li className='text-gray-700 dark:text-gray-300'>山田：20件</li>
                <li className='text-gray-700 dark:text-gray-300'>佐藤：15件</li>
              </ul>
            </div>

            {/* メニュー別集計 */}
            <div className='bg-gray-100 dark:bg-gray-700 p-4 rounded-md'>
              <h3 className='text-md font-semibold text-gray-800 dark:text-gray-200'>
                メニュー別集計
              </h3>
              <ul className='list-disc pl-5 mt-2'>
                <li className='text-gray-700 dark:text-gray-300'>整体：25件</li>
                <li className='text-gray-700 dark:text-gray-300'>
                  マッサージ：15件
                </li>
                <li className='text-gray-700 dark:text-gray-300'>鍼灸：10件</li>
              </ul>
            </div>

            {/* 時間帯別グラフ（仮） */}
            <div className='bg-gray-100 dark:bg-gray-700 p-4 rounded-md'>
              <h3 className='text-md font-semibold text-gray-800 dark:text-gray-200'>
                時間帯別グラフ
              </h3>
              <p className='text-gray-700 dark:text-gray-300'>
                （グラフのイメージ）
              </p>
            </div>
          </div>

          {/* 前日比較 */}
          <div className='mt-6 bg-gray-100 dark:bg-gray-700 p-4 rounded-md'>
            <h3 className='text-md font-semibold text-gray-800 dark:text-gray-200'>
              前日比較
            </h3>
            <p className='text-gray-700 dark:text-gray-300'>売上：+10%</p>
            <p className='text-gray-700 dark:text-gray-300'>施術件数：+5件</p>
          </div>

          {/* 編集・削除機能（ボタンのイメージ） */}
          <div className='mt-6 flex justify-end'>
            <Button className='mr-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded'>
              編集
            </Button>
            <Button className='bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded'>
              削除
            </Button>
          </div>

          {/* 承認ステータス表示 */}
          <div className='mt-6'>
            <p className='text-sm text-gray-500'>承認ステータス：承認済み</p>
          </div>

          {/* 印刷・PDF出力（ボタンのイメージ） */}
          <div className='mt-6 flex justify-end'>
            <Button className='bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded'>
              印刷・PDF出力
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportSummary;
