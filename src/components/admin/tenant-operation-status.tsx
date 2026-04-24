'use client';

import { memo } from 'react';
import { Switch } from '@/components/ui/switch';
import { formatClinicOperationStatus } from '@/lib/admin/tenants';
import { cn } from '@/lib/utils';

const ACTIVE_BADGE_CLASS =
  'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800';
const INACTIVE_BADGE_CLASS =
  'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';

interface TenantOperationStatusControlProps {
  id: string;
  isActive: boolean;
  onChange: (isActive: boolean) => void;
}

function TenantOperationStatusControlComponent({
  id,
  isActive,
  onChange,
}: TenantOperationStatusControlProps) {
  const descriptionId = `${id}-description`;

  return (
    <div className='rounded-lg border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/30'>
      <div className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <label
            htmlFor={id}
            className='text-sm font-medium text-slate-900 dark:text-slate-100'
          >
            テナント運用状態
          </label>
          <p
            id={descriptionId}
            className='text-xs leading-relaxed text-slate-600 dark:text-slate-300'
          >
            運用中にすると店舗選択・予約・分析などの対象になります。停止中は新規利用対象から外れます。
          </p>
        </div>
        <Switch
          id={id}
          checked={isActive}
          aria-describedby={descriptionId}
          onCheckedChange={onChange}
        />
      </div>
      <div className='mt-3 text-sm font-semibold text-blue-800 dark:text-blue-200'>
        現在: {formatClinicOperationStatus(isActive)}
      </div>
    </div>
  );
}

interface TenantOperationStatusBadgeProps {
  isActive: boolean;
  className?: string;
}

function TenantOperationStatusBadgeComponent({
  isActive,
  className,
}: TenantOperationStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
        isActive ? ACTIVE_BADGE_CLASS : INACTIVE_BADGE_CLASS,
        className
      )}
    >
      {formatClinicOperationStatus(isActive)}
    </span>
  );
}

export const TenantOperationStatusControl = memo(
  TenantOperationStatusControlComponent
);
export const TenantOperationStatusBadge = memo(
  TenantOperationStatusBadgeComponent
);
