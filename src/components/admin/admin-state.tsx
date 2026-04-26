import { memo, type ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AdminStateVariant = 'loading' | 'empty' | 'error';

const STATE_ICON = {
  loading: Loader2,
  empty: Inbox,
  error: AlertCircle,
} as const;

const STATE_ICON_CLASS: Record<AdminStateVariant, string> = {
  loading: 'text-blue-500',
  empty: 'text-slate-400',
  error: 'text-red-500',
};

interface AdminStateProps {
  variant: AdminStateVariant;
  title: string;
  description?: ReactNode;
  actionLabel?: string;
  className?: string;
  onAction?: () => void;
}

function AdminStateComponent({
  variant,
  title,
  description,
  actionLabel,
  className,
  onAction,
}: AdminStateProps) {
  const Icon = STATE_ICON[variant];

  return (
    <div
      className={cn(
        'flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center dark:border-slate-700',
        className
      )}
    >
      <Icon
        className={cn(
          'mb-3 h-8 w-8',
          variant === 'loading' && 'animate-spin',
          STATE_ICON_CLASS[variant]
        )}
        aria-hidden='true'
      />
      <p className='text-sm font-medium text-slate-900 dark:text-slate-100'>
        {title}
      </p>
      {description && (
        <div className='mt-1 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400'>
          {description}
        </div>
      )}
      {actionLabel && onAction && (
        <Button
          type='button'
          variant='outline'
          className='mt-4'
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export const AdminState = memo(AdminStateComponent);
