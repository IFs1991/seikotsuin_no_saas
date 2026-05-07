import React, { useMemo } from 'react';
import { AlertCircle, CalendarCheck, Users } from 'lucide-react';
import type { Appointment } from '../types';
import { summarizeAppointments } from '../utils/view';

interface Props {
  appointments: Appointment[];
  resourceCount: number;
  onOpenCancelledAppointments?: () => void;
}

const SummaryItemComponent = ({
  label,
  value,
  tone = 'text-gray-900',
  onClick,
}: {
  label: string;
  value: number;
  tone?: string;
  onClick?: () => void;
}) => {
  const className =
    'min-w-[88px] rounded border border-gray-200 bg-white px-3 py-2 text-left transition-colors';
  const content = (
    <>
      <div className='text-[11px] font-medium text-gray-500'>{label}</div>
      <div className={`mt-0.5 text-lg font-bold leading-none ${tone}`}>
        {value}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type='button'
        className={`${className} hover:border-sky-300 hover:bg-sky-50`}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
};

const SummaryItem = React.memo(SummaryItemComponent);

const DaySummaryComponent: React.FC<Props> = ({
  appointments,
  resourceCount,
  onOpenCancelledAppointments,
}) => {
  const summary = useMemo(
    () => summarizeAppointments(appointments),
    [appointments]
  );

  return (
    <section
      className='border-b border-gray-200 bg-gray-50 px-4 py-3'
      aria-label='当日の予約サマリ'
    >
      <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
        <div className='flex items-center gap-2 text-sm font-semibold text-gray-700'>
          <CalendarCheck className='h-4 w-4 text-sky-600' />
          当日サマリ
        </div>

        <div className='flex gap-2 overflow-x-auto pb-1 xl:pb-0'>
          <SummaryItem label='総予約' value={summary.total} />
          <SummaryItem
            label='有効予約'
            value={summary.active}
            tone='text-sky-700'
          />
          <SummaryItem
            label='未確定'
            value={summary.unconfirmed}
            tone='text-orange-700'
          />
          <SummaryItem
            label='来院済み'
            value={summary.arrived}
            tone='text-indigo-700'
          />
          <SummaryItem
            label='完了'
            value={summary.completed}
            tone='text-emerald-700'
          />
          <SummaryItem
            label='取消/不来院'
            value={summary.cancelled}
            tone='text-gray-600'
            onClick={onOpenCancelledAppointments}
          />
          <div className='min-w-[128px] rounded border border-gray-200 bg-white px-3 py-2'>
            <div className='flex items-center gap-1 text-[11px] font-medium text-gray-500'>
              <Users className='h-3.5 w-3.5' />
              表示リソース
            </div>
            <div className='mt-0.5 text-lg font-bold leading-none text-gray-900'>
              {summary.assignedResources}/{resourceCount}
            </div>
          </div>
        </div>
      </div>

      {appointments.length === 0 && (
        <div className='mt-2 flex items-center gap-2 text-xs text-gray-500'>
          <AlertCircle className='h-3.5 w-3.5' />
          この日に表示できる予約はありません。
        </div>
      )}
    </section>
  );
};

export const DaySummary = React.memo(DaySummaryComponent);
