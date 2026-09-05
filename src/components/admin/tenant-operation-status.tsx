'use client';

import { memo } from 'react';
import { AdminStatusBadge } from '@/components/admin/admin-status-badge';
import { Switch } from '@/components/ui/switch';
import {
  formatClinicOperationStatus,
  type ClinicSummary,
} from '@/lib/admin/tenants';

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
    <AdminStatusBadge
      label={formatClinicOperationStatus(isActive)}
      tone={isActive ? 'active' : 'inactive'}
      className={className}
    />
  );
}

function TenantLifecycleStatusBadgeComponent({
  clinic,
}: {
  clinic: Pick<ClinicSummary, 'is_active' | 'billing_activation_status'>;
}) {
  if (clinic.billing_activation_status === 'pending_billing') {
    return <AdminStatusBadge label='契約反映待ち' tone='pending' />;
  }

  if (clinic.billing_activation_status === 'billing_failed') {
    return <AdminStatusBadge label='有効化に失敗' tone='error' />;
  }

  return <TenantOperationStatusBadge isActive={clinic.is_active} />;
}

export const TenantOperationStatusControl = memo(
  TenantOperationStatusControlComponent
);
export const TenantOperationStatusBadge = memo(
  TenantOperationStatusBadgeComponent
);
export const TenantLifecycleStatusBadge = memo(
  TenantLifecycleStatusBadgeComponent
);
