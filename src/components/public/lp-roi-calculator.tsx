'use client';

import { useState } from 'react';
import { ArrowRight, Clock3, Coins, RotateCcw } from 'lucide-react';
import { createCtaLink } from './lp-links';

// 本部業務削減シミュレーター。入力値は保存せず、外部APIにも送信しない簡易試算機。
type ScenarioId = 'conservative' | 'standard' | 'active';

interface Scenario {
  id: ScenarioId;
  label: string;
  rate: number;
  description: string;
}

interface Inputs {
  storeCount: number;
  dailyReportMinutesPerStore: number;
  weeklyAggregationHours: number;
  monthlyMeetingHours: number;
  hourlyCost: number;
  businessDays: number;
  scenarioId: ScenarioId;
}

const scenarios: Scenario[] = [
  { id: 'conservative', label: '控えめ', rate: 0.2, description: '日報確認と集計の一部を整理する想定' },
  { id: 'standard', label: '標準', rate: 0.35, description: '店舗比較と会議資料作成まで日常利用する想定' },
  { id: 'active', label: '積極活用', rate: 0.5, description: '本部・院長・エリア管理者が毎週活用する想定' },
];

const initialInputs: Inputs = {
  storeCount: 8,
  dailyReportMinutesPerStore: 12,
  weeklyAggregationHours: 5,
  monthlyMeetingHours: 10,
  hourlyCost: 3000,
  businessDays: 22,
  scenarioId: 'standard',
};

const demoCta = createCtaLink('この削減余地を自院で試す', 'demo');

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

const fmtHours = (v: number) => `${v.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}時間`;
const fmtYen = (v: number) => `¥${Math.round(v).toLocaleString('ja-JP')}`;

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step = 1, suffix, onChange }: SliderProps) {
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-3'>
        <span className='text-[13px] font-bold text-[#1A1A1A]'>{label}</span>
        <span className='font-mono text-[14px] font-bold text-[#2B3A3F]'>
          {value.toLocaleString('ja-JP')}
          {suffix}
        </span>
      </div>
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        aria-label={label}
        className='w-full accent-[#C4956C]'
      />
    </div>
  );
}

export function LpRoiCalculator() {
  const [inputs, setInputs] = useState<Inputs>(initialInputs);

  const scenario = scenarios.find(s => s.id === inputs.scenarioId) ?? scenarios[1];
  const monthlyHours =
    (inputs.storeCount * inputs.dailyReportMinutesPerStore * inputs.businessDays) / 60 +
    inputs.weeklyAggregationHours * 4 +
    inputs.monthlyMeetingHours;
  const monthlySaved = monthlyHours * scenario.rate;
  const annualSaved = monthlySaved * 12;
  const costImpact = monthlySaved * inputs.hourlyCost;

  const update = (key: keyof Omit<Inputs, 'scenarioId'>) => (value: number) =>
    setInputs(current => ({ ...current, [key]: value }));

  return (
    <div className='grid gap-6 lg:grid-cols-[1.05fr_0.95fr]'>
      {/* 入力 */}
      <div className='rounded-[12px] border border-[#E8E4DE] bg-[#F3EFE8] p-6 sm:p-8'>
        <div className='grid gap-6 sm:grid-cols-2'>
          <Slider
            label='店舗数'
            value={inputs.storeCount}
            min={1}
            max={40}
            suffix='店舗'
            onChange={update('storeCount')}
          />
          <Slider
            label='月の営業日数'
            value={inputs.businessDays}
            min={12}
            max={31}
            suffix='日'
            onChange={update('businessDays')}
          />
          <Slider
            label='1店舗あたり日報確認 / 日'
            value={inputs.dailyReportMinutesPerStore}
            min={0}
            max={60}
            suffix='分'
            onChange={update('dailyReportMinutesPerStore')}
          />
          <Slider
            label='売上・患者数集計 / 週'
            value={inputs.weeklyAggregationHours}
            min={0}
            max={40}
            suffix='時間'
            onChange={update('weeklyAggregationHours')}
          />
          <Slider
            label='店舗比較・会議資料作成 / 月'
            value={inputs.monthlyMeetingHours}
            min={0}
            max={80}
            suffix='時間'
            onChange={update('monthlyMeetingHours')}
          />
          <Slider
            label='本部担当者の時給目安'
            value={inputs.hourlyCost}
            min={1000}
            max={10000}
            step={500}
            suffix='円'
            onChange={update('hourlyCost')}
          />
        </div>

        <div className='mt-8'>
          <p className='mb-3 text-[13px] font-bold text-[#1A1A1A]'>削減シナリオ</p>
          <div className='grid gap-2 sm:grid-cols-3'>
            {scenarios.map(s => {
              const isActive = inputs.scenarioId === s.id;
              return (
                <button
                  key={s.id}
                  type='button'
                  onClick={() => setInputs(current => ({ ...current, scenarioId: s.id }))}
                  aria-pressed={isActive}
                  className={`min-h-20 rounded-[8px] border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4956C] ${
                    isActive
                      ? 'border-[#C4956C] bg-[#C4956C]/10 text-[#1A1A1A]'
                      : 'border-[#E8E4DE] bg-white text-[#595959] hover:border-[#C4956C]/50'
                  }`}
                >
                  <span className='block text-[13px] font-bold'>
                    {s.label}
                    <span className='ml-1 font-mono text-[11px] font-normal'>
                      {Math.round(s.rate * 100)}%
                    </span>
                  </span>
                  <span className='mt-1 block text-[11px] leading-[1.6]'>{s.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 結果 */}
      <div className='rounded-[12px] bg-[#2B3A3F] p-6 text-white shadow-[0_24px_60px_-32px_rgba(43,58,63,0.6)] sm:p-8'>
        <div className='mb-6 flex items-center justify-between gap-4 border-b border-white/10 pb-5'>
          <div>
            <p className='font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/50'>
              Estimated Impact
            </p>
            <h3 className='mt-1 font-serif-jp text-[22px] font-bold'>
              {scenario.label}シナリオの試算
            </h3>
          </div>
          <button
            type='button'
            onClick={() => setInputs(initialInputs)}
            aria-label='初期値に戻す'
            className='flex h-10 w-10 items-center justify-center rounded-[8px] border border-white/20 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8B87A]'
          >
            <RotateCcw className='h-4 w-4' aria-hidden='true' />
          </button>
        </div>

        <div className='space-y-4'>
          <div className='rounded-[10px] border border-white/10 bg-white/5 p-4'>
            <p className='mb-2 flex items-center gap-2 text-[13px] font-semibold text-white/60'>
              <Clock3 className='h-4 w-4' aria-hidden='true' />
              現在の月間本部業務時間
            </p>
            <p className='font-mono text-[34px] font-bold leading-none'>{fmtHours(monthlyHours)}</p>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='rounded-[10px] border border-[#E8B87A]/30 bg-[#E8B87A]/10 p-4'>
              <p className='text-[12px] font-semibold text-[#E8B87A]'>毎月削減できる見込み</p>
              <p className='mt-2 font-mono text-[26px] font-bold leading-none text-[#E8B87A]'>
                {fmtHours(monthlySaved)}
              </p>
            </div>
            <div className='rounded-[10px] border border-white/10 bg-white/5 p-4'>
              <p className='text-[12px] font-semibold text-white/60'>年間で戻る時間</p>
              <p className='mt-2 font-mono text-[26px] font-bold leading-none'>
                {fmtHours(annualSaved)}
              </p>
            </div>
          </div>
          <div className='rounded-[10px] border border-white/10 bg-white/5 p-4'>
            <p className='mb-2 flex items-center gap-2 text-[13px] font-semibold text-white/60'>
              <Coins className='h-4 w-4' aria-hidden='true' />
              月間の人件費換算インパクト
            </p>
            <p className='font-mono text-[34px] font-bold leading-none text-[#E8B87A]'>
              {fmtYen(costImpact)}
            </p>
          </div>
        </div>

        <p className='mt-5 text-[12px] leading-[1.8] text-white/55'>
          ※ LP上の簡易試算です。実際の効果は店舗の運用状況・予約率・単価・活用度によって変わり、効果を保証するものではありません。
        </p>

        <a
          href={demoCta.href}
          target={demoCta.external ? '_blank' : undefined}
          rel={demoCta.external ? 'noreferrer' : undefined}
          className='mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#C4956C] px-5 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#b3855d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8B87A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B3A3F]'
        >
          {demoCta.label}
          <ArrowRight className='h-4 w-4' aria-hidden='true' />
        </a>
      </div>
    </div>
  );
}
