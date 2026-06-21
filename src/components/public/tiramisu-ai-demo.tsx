'use client';

import { useState } from 'react';
import { Bot, MessageSquareText, MousePointerClick } from 'lucide-react';

type DemoQuestionId =
  | 'sales-drop'
  | 'cancellation'
  | 'staff-improvement'
  | 'open-slots'
  | 'monthly-report';

interface DemoQuestion {
  id: DemoQuestionId;
  label: string;
}

interface DemoAnswer {
  headline: string;
  body: string;
  nextAction: string;
}

const questions: DemoQuestion[] = [
  { id: 'sales-drop', label: '昨日の売上が落ちた理由を確認したい' },
  { id: 'cancellation', label: 'キャンセル率が高い店舗を見たい' },
  { id: 'staff-improvement', label: 'スタッフ別の改善ポイントを知りたい' },
  { id: 'open-slots', label: '予約枠の空き状況を確認したい' },
  { id: 'monthly-report', label: '今月の本部レポートを要約したい' },
];

const answers: Record<DemoQuestionId, DemoAnswer[]> = {
  'sales-drop': [
    {
      headline: '分析イメージ: 午後帯の予約枠と再来率を確認',
      body: '売上低下の要因を、店舗別の患者数、単価、キャンセル、午後帯の空き枠に分けて確認する想定です。',
      nextAction:
        '前日比だけで判断せず、曜日差と天候、スタッフ配置も合わせて見る流れを提案します。',
    },
  ],
  cancellation: [
    {
      headline: '分析イメージ: 店舗別キャンセル率の差分を抽出',
      body: 'キャンセル率が高い店舗を並べ、時間帯、担当者、予約経路ごとの偏りを確認する想定です。',
      nextAction:
        '前日リマインド、予約間隔、次回予約時の説明を見直す店舗候補を整理します。',
    },
  ],
  'staff-improvement': [
    {
      headline: '分析イメージ: スタッフ別の行動指標を比較',
      body: '担当患者数、次回予約率、物販提案、リピート率などを店舗内平均と比較して確認する想定です。',
      nextAction:
        '個人評価ではなく、育成テーマと好調スタッフの運用共有に使う前提で整理します。',
    },
  ],
  'open-slots': [
    {
      headline: '分析イメージ: 空き枠の集中時間を確認',
      body: '店舗ごとの空き枠が午前、午後、夕方のどこに偏っているかを確認する想定です。',
      nextAction:
        'LINE配信、再来促進、シフト調整の候補時間を本部と院長で共有します。',
    },
  ],
  'monthly-report': [
    {
      headline: '分析イメージ: 本部会議向けに要点を整理',
      body: '店舗別の売上、患者数、キャンセル率、スタッフ稼働の変化を要約する想定です。',
      nextAction:
        '好調店舗の再現ポイントと、確認が必要な店舗の論点を分けて提示します。',
    },
  ],
};

export function TiramisuAiDemo() {
  const [selectedId, setSelectedId] = useState<DemoQuestionId>('sales-drop');

  const selectedAnswer = answers[selectedId][0];

  return (
    <section id='ai-demo' className='bg-slate-950 py-20 text-white'>
      <div className='mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8'>
        <div className='space-y-5'>
          <div className='inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-sm font-medium text-cyan-100'>
            <Bot className='h-4 w-4' aria-hidden='true' />
            AI分析支援のイメージ
          </div>
          <h2 className='text-3xl font-bold leading-tight text-white sm:text-4xl'>
            自然言語で店舗データを確認する体験を、まずはモックで伝えます。
          </h2>
          <p className='text-base leading-8 text-slate-300'>
            このデモは選択肢クリック式です。自由入力欄は置かず、Gemini、
            OpenAI、Supabase、問い合わせAPIなどの実APIは呼びません。
          </p>
          <p className='rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-300'>
            表示内容は分析イメージであり、患者データや予約データにはアクセスしません。
            医療判断や売上改善を保証するものではありません。
          </p>
        </div>

        <div className='rounded-lg border border-white/10 bg-white p-4 text-slate-950 shadow-2xl shadow-cyan-950/30 sm:p-6'>
          <div className='mb-5 flex items-center gap-3 border-b border-slate-200 pb-4'>
            <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white'>
              <MessageSquareText className='h-5 w-5' aria-hidden='true' />
            </div>
            <div>
              <p className='text-sm font-semibold text-slate-500'>
                Mock AI Demo
              </p>
              <p className='text-lg font-bold'>本部確認の質問候補</p>
            </div>
          </div>

          <div className='grid gap-2'>
            {questions.map(question => (
              <button
                key={question.id}
                type='button'
                onClick={() => setSelectedId(question.id)}
                className={`flex min-h-12 items-center gap-2 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 ${
                  selectedId === question.id
                    ? 'border-cyan-700 bg-cyan-50 text-cyan-950'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <MousePointerClick
                  className='h-4 w-4 shrink-0'
                  aria-hidden='true'
                />
                {question.label}
              </button>
            ))}
          </div>

          <div className='mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5'>
            <p className='mb-2 text-xs font-semibold uppercase text-cyan-700'>
              分析イメージ
            </p>
            <h3 className='text-lg font-bold text-slate-950'>
              {selectedAnswer.headline}
            </h3>
            <p className='mt-3 text-sm leading-7 text-slate-700'>
              {selectedAnswer.body}
            </p>
            <p className='mt-3 rounded-lg bg-white p-3 text-sm leading-7 text-slate-700'>
              {selectedAnswer.nextAction}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
