import { memo } from 'react';
import { cn } from '@/lib/utils';

type AdminStatusTone =
  | 'active'
  | 'inactive'
  | 'pending'
  | 'error'
  | 'suspended'
  | 'info';

const STATUS_TONE_CLASS: Record<AdminStatusTone, string> = {
  active:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800',
  inactive:
    'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-muted dark:text-muted-foreground dark:ring-slate-700',
  pending:
    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800',
  error:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-800',
  suspended:
    'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-800',
  info: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-800',
};

interface AdminStatusBadgeProps {
  label: string;
  tone: AdminStatusTone;
  className?: string;
}

function AdminStatusBadgeComponent({
  label,
  tone,
  className,
}: AdminStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
        STATUS_TONE_CLASS[tone],
        className
      )}
    >
      {label}
    </span>
  );
}

export const AdminStatusBadge = memo(AdminStatusBadgeComponent);
