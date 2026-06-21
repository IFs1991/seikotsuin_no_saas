'use client';

import { useState } from 'react';
import { Calculator, Clock3, Coins, RotateCcw } from 'lucide-react';
import { createCtaLink } from './tiramisu-landing-links';

type ReductionScenarioId = 'conservative' | 'standard' | 'active';

interface ReductionScenario {
  id: ReductionScenarioId;
  label: string;
  rate: number;
  description: string;
}

interface CalculatorInputs {
  storeCount: number;
  dailyReportMinutesPerStore: number;
  weeklyAggregationHours: number;
  monthlyMeetingHours: number;
  hourlyCost: number;
  businessDays: number;
  scenarioId: ReductionScenarioId;
}

interface CalculatorResult {
  monthlyHours: number;
  monthlySavedHours: number;
  annualSavedHours: number;
  monthlyCostImpact: number;
}

const scenarios: ReductionScenario[] = [
  {
    id: 'conservative',
    label: '控えめ',
    rate: 0.2,
    description: 'まず日報確認と集計の一部を整理する想定',
  },
  {
    id: 'standard',
    label: '標準',
    rate: 0.35,
    description: '店舗比較と会議資料作成まで日常利用する想定',
  },
  {
    id: 'active',
    label: '積極活用',
    rate: 0.5,
    description: '本部、院長、エリア管理者が毎週活用する想定',
  },
];

const initialInputs: CalculatorInputs = {
  storeCount: 8,
  dailyReportMinutesPerStore: 12,
  weeklyAggregationHours: 5,
  monthlyMeetingHours: 10,
  hourlyCost: 3000,
  businessDays: 22,
  scenarioId: 'standard',
};

const demoCta = createCtaLink('この削減余地を相談する', 'demo');

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function formatHours(value: number): string {
  return `${value.toLocaleString('ja-JP', {
    maximumFractionDigits: 1,
  })}時間`;
}

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString('ja-JP')}円`;
}

function calculateResult(inputs: CalculatorInputs): CalculatorResult {
  const selectedScenario =
    scenarios.find(scenario => scenario.id === inputs.scenarioId) ??
    scenarios[1];
  const monthlyHours =
    (inputs.storeCount *
      inputs.dailyReportMinutesPerStore *
      inputs.businessDays) /
      60 +
    inputs.weeklyAggregationHours * 4 +
    inputs.monthlyMeetingHours;
  const monthlySavedHours = monthlyHours * selectedScenario.rate;
  return {
    monthlyHours,
    monthlySavedHours,
    annualSavedHours: monthlySavedHours * 12,
    monthlyCostImpact: monthlySavedHours * inputs.hourlyCost,
  };
}

export function TiramisuRoiCalculator() {
  const [inputs, setInputs] = useState<CalculatorInputs>(initialInputs);

  const result = calculateResult(inputs);
  const selectedScenario =
    scenarios.find(scenario => scenario.id === inputs.scenarioId) ??
    scenarios[1];

  function updateNumberInput(
    key: keyof Omit<CalculatorInputs, 'scenarioId'>,
    value: string,
    min: number,
    max: number
  ) {
    const numericValue = Number(value);
    setInputs(current => ({
      ...current,
      [key]: clampNumber(numericValue, min, max),
    }));
  }

  return (
    <section id='roi' className='bg-white py-20'>
      <div className='mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'>
        <div className='mb-10 max-w-3xl space-y-4'>
          <div className='inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800'>
            <Calculator className='h-4 w-4' aria-hidden='true' />
            本部業務削減シミュレーター
          </div>
          <h2 className='text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl'>
            月額費用を値下げではなく、戻る時間と本部負荷で判断する。
          </h2>
          <p className='text-base leading-8 text-slate-600'>
            店舗数、日報確認、集計、会議資料作成にかかる時間から、
            本部業務の削減余地を簡易試算します。入力値は保存せず、外部APIにも送信しません。
          </p>
        </div>

        <div className='grid gap-6 lg:grid-cols-[1fr_0.9fr]'>
          <div className='rounded-lg border border-slate-200 bg-slate-50 p-5 sm:p-6'>
            <div className='grid gap-5 sm:grid-cols-2'>
              <label className='grid gap-2 text-sm font-semibold text-slate-700'>
                店舗数
                <input
                  suppressHydrationWarning
                  type='number'
                  min={1}
                  max={80}
                  value={inputs.storeCount}
                  onChange={event =>
                    updateNumberInput('storeCount', event.target.value, 1, 80)
                  }
                  className='min-h-12 rounded-lg border-slate-300 text-base'
                />
              </label>
              <label className='grid gap-2 text-sm font-semibold text-slate-700'>
                月間営業日数
                <input
                  suppressHydrationWarning
                  type='number'
                  min={1}
                  max={31}
                  value={inputs.businessDays}
                  onChange={event =>
                    updateNumberInput('businessDays', event.target.value, 1, 31)
                  }
                  className='min-h-12 rounded-lg border-slate-300 text-base'
                />
              </label>
              <label className='grid gap-2 text-sm font-semibold text-slate-700'>
                1店舗あたり日報確認時間 / 日（分）
                <input
                  suppressHydrationWarning
                  type='number'
                  min={0}
                  max={180}
                  value={inputs.dailyReportMinutesPerStore}
                  onChange={event =>
                    updateNumberInput(
                      'dailyReportMinutesPerStore',
                      event.target.value,
                      0,
                      180
                    )
                  }
                  className='min-h-12 rounded-lg border-slate-300 text-base'
                />
              </label>
              <label className='grid gap-2 text-sm font-semibold text-slate-700'>
                売上・患者数集計時間 / 週（時間）
                <input
                  suppressHydrationWarning
                  type='number'
                  min={0}
                  max={80}
                  value={inputs.weeklyAggregationHours}
                  onChange={event =>
                    updateNumberInput(
                      'weeklyAggregationHours',
                      event.target.value,
                      0,
                      80
                    )
                  }
                  className='min-h-12 rounded-lg border-slate-300 text-base'
                />
              </label>
              <label className='grid gap-2 text-sm font-semibold text-slate-700'>
                店舗比較・会議資料作成時間 / 月（時間）
                <input
                  suppressHydrationWarning
                  type='number'
                  min={0}
                  max={160}
                  value={inputs.monthlyMeetingHours}
                  onChange={event =>
                    updateNumberInput(
                      'monthlyMeetingHours',
                      event.target.value,
                      0,
                      160
                    )
                  }
                  className='min-h-12 rounded-lg border-slate-300 text-base'
                />
              </label>
              <label className='grid gap-2 text-sm font-semibold text-slate-700'>
                本部担当者の時給目安（円）
                <input
                  suppressHydrationWarning
                  type='number'
                  min={1000}
                  max={20000}
                  step={500}
                  value={inputs.hourlyCost}
                  onChange={event =>
                    updateNumberInput(
                      'hourlyCost',
                      event.target.value,
                      1000,
                      20000
                    )
                  }
                  className='min-h-12 rounded-lg border-slate-300 text-base'
                />
              </label>
            </div>

            <div className='mt-6'>
              <p className='mb-3 text-sm font-semibold text-slate-700'>
                削減シナリオ
              </p>
              <div className='grid gap-3 sm:grid-cols-3'>
                {scenarios.map(scenario => (
                  <button
                    key={scenario.id}
                    type='button'
                    onClick={() =>
                      setInputs(current => ({
                        ...current,
                        scenarioId: scenario.id,
                      }))
                    }
                    className={
                      inputs.scenarioId === scenario.id
                        ? 'min-h-20 rounded-lg border border-emerald-700 bg-emerald-50 p-4 text-left text-emerald-950'
                        : 'min-h-20 rounded-lg border border-slate-200 bg-white p-4 text-left text-slate-700 hover:bg-slate-50'
                    }
                  >
                    <span className='block text-sm font-bold'>
                      {scenario.label}
                    </span>
                    <span className='mt-1 block text-xs leading-5'>
                      {scenario.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className='rounded-lg bg-slate-950 p-5 text-white shadow-xl shadow-slate-200 sm:p-6'>
            <div className='mb-5 flex items-center justify-between gap-4 border-b border-white/10 pb-5'>
              <div>
                <p className='text-sm font-semibold text-emerald-200'>
                  {selectedScenario.label}シナリオ
                </p>
                <h3 className='mt-1 text-2xl font-bold'>簡易試算結果</h3>
              </div>
              <button
                type='button'
                onClick={() => setInputs(initialInputs)}
                className='inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300'
                aria-label='初期値に戻す'
              >
                <RotateCcw className='h-4 w-4' aria-hidden='true' />
              </button>
            </div>

            <div className='grid gap-4'>
              <div className='rounded-lg border border-white/10 bg-white/5 p-4'>
                <div className='mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300'>
                  <Clock3 className='h-4 w-4' aria-hidden='true' />
                  現在の月間本部業務時間
                </div>
                <p className='text-3xl font-bold'>
                  {formatHours(result.monthlyHours)}
                </p>
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4'>
                  <p className='text-sm font-semibold text-emerald-100'>
                    毎月削減できる見込み
                  </p>
                  <p className='mt-2 text-2xl font-bold'>
                    {formatHours(result.monthlySavedHours)}
                  </p>
                </div>
                <div className='rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4'>
                  <p className='text-sm font-semibold text-cyan-100'>
                    年間で戻る時間
                  </p>
                  <p className='mt-2 text-2xl font-bold'>
                    {formatHours(result.annualSavedHours)}
                  </p>
                </div>
              </div>
              <div className='rounded-lg border border-amber-300/20 bg-amber-300/10 p-4'>
                <div className='mb-2 flex items-center gap-2 text-sm font-semibold text-amber-100'>
                  <Coins className='h-4 w-4' aria-hidden='true' />
                  月間の人件費換算インパクト
                </div>
                <p className='text-3xl font-bold'>
                  {formatCurrency(result.monthlyCostImpact)}
                </p>
              </div>
            </div>

            <p className='mt-5 text-sm leading-7 text-slate-300'>
              5〜10店舗規模で本部・院長の確認作業が月30時間削減される場合、
              時給3,000円換算で月90,000円相当の確認負荷を見直せます。
              結果は簡易試算であり、効果を保証するものではありません。
            </p>
            <a
              href={demoCta.href}
              target={demoCta.external ? '_blank' : undefined}
              rel={demoCta.external ? 'noreferrer' : undefined}
              className='mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'
            >
              {demoCta.label}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
