'use client';

import { useState } from 'react';
import { Brain, MousePointerClick } from 'lucide-react';
import { aiScenarios } from './lp-content';

// 選択肢クリック式のAIデモ。自由入力はなく、実APIや患者データにはアクセスしない。
// 「分析イメージ」を体験として伝えることに振り切っている。
export function LpAiShowcase() {
  const [activeId, setActiveId] = useState(aiScenarios[0].id);
  const active =
    aiScenarios.find(scene => scene.id === activeId) ?? aiScenarios[0];
  const ActiveIcon = active.icon;

  return (
    <div className='grid gap-6 lg:grid-cols-[0.85fr_1.15fr]'>
      {/* 質問の選択 */}
      <div className='rounded-[10px] border border-[#E8E4DE] bg-white p-4 shadow-[0_18px_50px_-32px_rgba(43,58,63,0.4)] sm:p-5'>
        <p className='mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#595959]'>
          本部確認の質問候補
        </p>
        <div className='grid gap-2'>
          {aiScenarios.map(scene => {
            const Icon = scene.icon;
            const isActive = scene.id === activeId;
            return (
              <button
                key={scene.id}
                type='button'
                onClick={() => setActiveId(scene.id)}
                aria-pressed={isActive}
                className={`flex min-h-12 items-center gap-3 rounded-[8px] border px-4 py-3 text-left text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4956C] focus-visible:ring-offset-2 ${
                  isActive
                    ? 'border-[#C4956C] bg-[#C4956C]/8 text-[#1A1A1A]'
                    : 'border-[#E8E4DE] bg-[#FAF8F5] text-[#595959] hover:border-[#C4956C]/50 hover:text-[#1A1A1A]'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] ${
                    isActive
                      ? 'bg-[#C4956C] text-white'
                      : 'bg-white text-[#2B3A3F]'
                  }`}
                >
                  <Icon className='h-4 w-4' aria-hidden='true' />
                </span>
                {scene.question}
                <MousePointerClick
                  className={`ml-auto h-4 w-4 shrink-0 ${isActive ? 'text-[#C4956C]' : 'text-[#C4956C]/40'}`}
                  aria-hidden='true'
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* 回答の表示（チャットUI風） */}
      <div className='flex flex-col rounded-[10px] border border-[#E8E4DE] bg-white p-5 shadow-[0_18px_50px_-32px_rgba(43,58,63,0.45)] sm:p-7'>
        <div className='flex items-center gap-3 border-b border-[#E8E4DE] pb-4'>
          <div className='flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#C4956C] to-[#2B3A3F]'>
            <Brain className='h-5 w-5 text-white' aria-hidden='true' />
          </div>
          <div>
            <p className='text-[13px] font-bold text-[#1A1A1A]'>Tiramisu AI</p>
            <p className='font-mono text-[11px] text-[#595959]'>
              選択肢クリック式の分析イメージ
            </p>
          </div>
          <span className='ml-auto rounded-full bg-[#C4956C]/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#C4956C]'>
            {active.tag}
          </span>
        </div>

        {/* ユーザー発話 */}
        <div className='mt-5 flex justify-end'>
          <div className='max-w-[85%] rounded-[12px] rounded-tr-sm bg-[#2B3A3F] px-4 py-2.5 text-[13px] leading-[1.7] text-white'>
            {active.question}
          </div>
        </div>

        {/* AI応答 */}
        <div className='mt-3 flex gap-3'>
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#C4956C] to-[#2B3A3F]'>
            <ActiveIcon className='h-4 w-4 text-white' aria-hidden='true' />
          </div>
          <div className='max-w-[88%] rounded-[12px] rounded-tl-sm border border-[#E8E4DE] bg-[#FAF8F5] px-4 py-3'>
            <p className='mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#C4956C]'>
              分析イメージ
            </p>
            <p className='text-[13px] leading-[1.85] text-[#1A1A1A]'>
              {active.answer}
            </p>
          </div>
        </div>

        <p className='mt-5 border-t border-[#E8E4DE] pt-4 font-mono text-[11px] italic leading-[1.7] text-[#595959]'>
          ※
          表示はLP上の分析イメージです。患者データ・予約データにはアクセスせず、医療判断や売上改善を保証するものではありません。
        </p>
      </div>
    </div>
  );
}
