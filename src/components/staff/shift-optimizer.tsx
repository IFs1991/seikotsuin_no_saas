import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

const ShiftOptimizer: React.FC = () => {
  // ダミーデータ
  const dummyShifts = [
    {
      id: 's1',
      staff: '山田 太郎',
      date: '2024-07-20',
      time: '09:00-18:00',
      status: '提案中',
    },
    {
      id: 's2',
      staff: '鈴木 花子',
      date: '2024-07-20',
      time: '10:00-19:00',
      status: '承認済み',
    },
    {
      id: 's3',
      staff: '田中 健太',
      date: '2024-07-21',
      time: '09:00-18:00',
      status: '提案中',
    },
    {
      id: 's4',
      staff: '佐藤 恵美',
      date: '2024-07-21',
      time: '11:00-20:00',
      status: '希望反映',
    },
  ];

  const dummyStaffPreferences = [
    { staff: '山田 太郎', preference: '土日休み希望' },
    { staff: '鈴木 花子', preference: '午前中勤務希望' },
    { staff: '田中 健太', preference: '週3勤務希望' },
  ];

  const dummyDemandForecast = [
    { date: '2024-07-20', time: '10:00-13:00', forecast: '高' },
    { date: '2024-07-20', time: '14:00-17:00', forecast: '中' },
    { date: '2024-07-21', time: '09:00-12:00', forecast: '高' },
    { date: '2024-07-21', time: '13:00-16:00', forecast: '低' },
  ];

  const [selectedDate, setSelectedDate] = useState<string>('2024-07-20');

  // 簡易的なカレンダー表示のためのデータ
  const daysInMonth = Array.from({ length: 31 }, (_, i) => i + 1);
  const currentMonth = '7月';
  const currentYear = '2024年';

  const totalCost = 1250000; // ダミーの総人件費

  return (
    <div className='flex justify-center py-8 bg-white dark:bg-gray-800 text-[#111827] dark:text-[#f9fafb]'>
      <Card className='w-full max-w-4xl bg-card shadow-lg rounded-lg'>
        <CardHeader className='bg-card border-b border-gray-200 dark:border-gray-700 pb-4'>
          <CardTitle className='text-2xl font-bold text-center text-[#1e3a8a] dark:text-[#10b981]'>
            シフト最適化提案
          </CardTitle>
          <CardDescription className='text-center text-gray-600 dark:text-gray-400 mt-2'>
            AIによる最適なシフト提案と、カレンダー上での直感的な編集・管理が可能です。
          </CardDescription>
        </CardHeader>
        <CardContent className='bg-card p-6 space-y-8'>
          {/* AIによるシフト提案表示 */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              AIによるシフト提案
            </h3>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {dummyShifts.map(shift => (
                <div
                  key={shift.id}
                  className='p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700'
                >
                  <p className='font-medium text-[#111827] dark:text-[#f9fafb]'>
                    {shift.staff}
                  </p>
                  <p className='text-sm text-gray-600 dark:text-gray-400'>
                    {shift.date} {shift.time}
                  </p>
                  <p
                    className={`text-sm font-semibold ${shift.status === '承認済み' ? 'text-[#10b981]' : 'text-orange-500'}`}
                  >
                    ステータス: {shift.status}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* カレンダービュー */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              カレンダービュー
            </h3>
            <div className='flex justify-between items-center mb-4'>
              <Button className='bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'>
                前月
              </Button>
              <span className='text-lg font-medium text-[#111827] dark:text-[#f9fafb]'>
                {currentYear} {currentMonth}
              </span>
              <Button className='bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'>
                翌月
              </Button>
            </div>
            <div className='grid grid-cols-7 gap-1 text-center text-sm'>
              {['日', '月', '火', '水', '木', '金', '土'].map(day => (
                <div
                  key={day}
                  className='font-bold text-[#1e3a8a] dark:text-[#10b981]'
                >
                  {day}
                </div>
              ))}
              {/* 月初めの空白セル */}
              {Array.from({ length: 6 }, (_, i) => (
                <div key={`empty-start-${i}`} className='p-2'></div>
              ))}
              {daysInMonth.map(day => (
                <button
                  key={day}
                  type='button'
                  aria-label={`日付 ${day} を選択`}
                  className={`p-2 border border-gray-200 dark:border-gray-700 rounded-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${day === parseInt(selectedDate.split('-')[2]) ? 'bg-[#1e3a8a] text-white dark:bg-[#10b981]' : 'bg-gray-50 dark:bg-gray-700 text-[#111827] dark:text-[#f9fafb]'}
                    hover:bg-gray-200 dark:hover:bg-gray-600`}
                  onClick={() =>
                    setSelectedDate(`2024-07-${day < 10 ? '0' + day : day}`)
                  }
                >
                  {day}
                  {dummyShifts
                    .filter(
                      s => s.date === `2024-07-${day < 10 ? '0' + day : day}`
                    )
                    .map(s => (
                      <div
                        key={s.id}
                        className='text-xs mt-1 truncate text-gray-700 dark:text-gray-200'
                      >
                        {s.staff.split(' ')[0]}
                      </div>
                    ))}
                </button>
              ))}
            </div>
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* ドラッグ&ドロップ編集 (概念的な表示) */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              シフト編集
            </h3>
            <div className='p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-md text-center text-gray-500 dark:text-gray-400'>
              <p>シフトをドラッグ&ドロップで直感的に編集できます。</p>
              <p className='text-sm mt-2'>
                （このエリアでシフトアイテムを移動・調整）
              </p>
            </div>
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* 需要予測オーバーレイ */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              需要予測
            </h3>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {dummyDemandForecast.map((demand, index) => (
                <div
                  key={index}
                  className='p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700'
                >
                  <p className='font-medium text-[#111827] dark:text-[#f9fafb]'>
                    {demand.date} {demand.time}
                  </p>
                  <p
                    className={`text-sm font-semibold ${demand.forecast === '高' ? 'text-red-500' : demand.forecast === '中' ? 'text-yellow-500' : 'text-[#10b981]'}`}
                  >
                    予測: {demand.forecast}
                  </p>
                </div>
              ))}
            </div>
            <p className='text-sm text-gray-600 dark:text-gray-400 mt-2'>
              需要予測に基づいて、最適な人員配置を提案します。
            </p>
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* スタッフ希望の反映 */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              スタッフ希望
            </h3>
            <ul className='list-disc list-inside text-[#111827] dark:text-[#f9fafb] space-y-1'>
              {dummyStaffPreferences.map((pref, index) => (
                <li key={index}>
                  {pref.staff}: {pref.preference}
                </li>
              ))}
            </ul>
            <p className='text-sm text-gray-600 dark:text-gray-400 mt-2'>
              スタッフの希望を考慮し、公平かつ効率的なシフトを生成します。
            </p>
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* コスト計算 */}
          <div>
            <h3 className='text-xl font-semibold mb-4 text-[#1e3a8a] dark:text-[#10b981]'>
              コスト計算
            </h3>
            <p className='text-2xl font-bold text-[#111827] dark:text-[#f9fafb]'>
              総人件費予測:{' '}
              <span className='text-[#10b981]'>
                {totalCost.toLocaleString()}
              </span>
            </p>
            <p className='text-sm text-gray-600 dark:text-gray-400 mt-2'>
              提案されたシフトに基づく人件費をリアルタイムで計算します。
            </p>
          </div>

          <Separator className='bg-gray-200 dark:bg-gray-700' />

          {/* 承認フロー & 通知機能 */}
          <div className='flex flex-col md:flex-row justify-between items-center gap-4'>
            <div className='flex items-center space-x-2'>
              <CheckCircle className='h-6 w-6 text-[#10b981]' />
              <span className='text-lg font-medium text-[#111827] dark:text-[#f9fafb]'>
                承認ステータス: <span className='text-orange-500'>未承認</span>
              </span>
            </div>
            <Button className='bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white dark:bg-[#10b981] dark:hover:bg-[#10b981]/90'>
              シフトを承認
            </Button>
            <Button
              variant='outline'
              className='border-[#1e3a8a] text-[#1e3a8a] hover:bg-gray-100 dark:border-[#10b981] dark:text-[#10b981] dark:hover:bg-gray-700'
            >
              スタッフへ通知
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ShiftOptimizer;
