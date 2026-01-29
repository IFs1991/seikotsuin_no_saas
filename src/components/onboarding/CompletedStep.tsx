'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

interface CompletedStepProps {
  onContinue: () => void;
}

export function CompletedStep({ onContinue }: CompletedStepProps) {
  return (
    <Card className='w-full max-w-lg mx-auto text-center'>
      <CardHeader>
        <div className='mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4'>
          <svg
            className='w-8 h-8 text-green-600'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M5 13l4 4L19 7'
            />
          </svg>
        </div>
        <CardTitle>セットアップ完了!</CardTitle>
        <CardDescription>クリニックの初期設定が完了しました。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-6'>
          <div className='p-4 bg-gray-50 rounded-lg text-left'>
            <h4 className='font-medium text-gray-900 mb-2'>次のステップ</h4>
            <ul className='text-sm text-gray-600 space-y-2'>
              <li className='flex items-start gap-2'>
                <span className='text-green-500 mt-0.5'>✓</span>
                <span>ダッシュボードで予約や患者情報を管理</span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-green-500 mt-0.5'>✓</span>
                <span>設定画面でより詳細な設定が可能</span>
              </li>
              <li className='flex items-start gap-2'>
                <span className='text-green-500 mt-0.5'>✓</span>
                <span>招待したスタッフが参加するのを待つ</span>
              </li>
            </ul>
          </div>

          <Button
            type='button'
            className='w-full'
            size='lg'
            onClick={onContinue}
          >
            ダッシュボードへ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
