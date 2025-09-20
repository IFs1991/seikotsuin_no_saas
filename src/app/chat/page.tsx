'use client';

import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ChatPage: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(true);

  return (
    <div className='flex flex-col items-center min-h-screen bg-[#f9fafb] dark:bg-[#1a1a1a] p-6'>
      <div className='w-full max-w-3xl'>
        <Card className='bg-[#ffffff] dark:bg-[#2d2d2d]'>
          <CardHeader>
            <div className='flex justify-between items-center'>
              <CardTitle className='text-[#111827] dark:text-[#e5e7eb]'>
                インテリジェントチャット
              </CardTitle>
              <div className='flex items-center gap-2'>
                <span className='text-sm text-[#4b5563] dark:text-[#9ca3af]'>
                  {isEnabled ? 'オン' : 'オフ'}
                </span>
                <Button
                  variant={isEnabled ? 'default' : 'outline'}
                  onClick={() => setIsEnabled(!isEnabled)}
                  className={`${
                    isEnabled ? 'bg-[#1e3a8a]' : 'bg-[#e5e7eb]'
                  } transition-colors`}
                >
                  {isEnabled ? '有効' : '無効'}
                </Button>
              </div>
            </div>
            <CardDescription className='text-[#4b5563] dark:text-[#9ca3af]'>
              AIを活用した経営相談・データ分析が可能です
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className='space-y-4'>
              <div className='flex gap-2 overflow-x-auto pb-2'>
                <Button variant='outline' className='whitespace-nowrap'>
                  売上分析について
                </Button>
                <Button variant='outline' className='whitespace-nowrap'>
                  患者動向
                </Button>
                <Button variant='outline' className='whitespace-nowrap'>
                  スタッフ評価
                </Button>
                <Button variant='outline' className='whitespace-nowrap'>
                  経営アドバイス
                </Button>
              </div>

              <div className='h-[500px] bg-[#f3f4f6] dark:bg-[#374151] rounded-lg p-4 overflow-y-auto'>
                {isEnabled ? (
                  <div className='space-y-4'>
                    <div className='flex justify-end'>
                      <div className='bg-[#1e3a8a] text-white rounded-lg p-3 max-w-[80%]'>
                        今月の売上傾向を分析してください
                      </div>
                    </div>
                    <div className='flex justify-start'>
                      <div className='bg-white dark:bg-[#4b5563] rounded-lg p-3 max-w-[80%]'>
                        今月の売上データを分析しました：
                        <ul className='list-disc list-inside mt-2'>
                          <li>前月比 +15%の成長</li>
                          <li>自費診療の割合が増加傾向</li>
                          <li>新規患者からのリピート率が向上</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className='flex items-center justify-center h-full text-[#6b7280]'>
                    チャットを有効にしてください
                  </div>
                )}
              </div>

              <div className='flex gap-2'>
                <Input
                  placeholder='メッセージを入力...'
                  disabled={!isEnabled}
                  className='bg-white dark:bg-[#374151]'
                />
                <Button disabled={!isEnabled} className='bg-[#1e3a8a]'>
                  送信
                </Button>
                <Button
                  variant='outline'
                  disabled={!isEnabled}
                  className='bg-white dark:bg-[#374151]'
                >
                  音声入力
                </Button>
              </div>
            </div>
          </CardContent>

          <CardFooter className='flex justify-between'>
            <Button variant='outline' className='bg-white dark:bg-[#374151]'>
              履歴を検索
            </Button>
            <Button variant='outline' className='bg-white dark:bg-[#374151]'>
              エクスポート
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default ChatPage;
