import Link from 'next/link';
import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type AdminScopeNoticeItem = {
  label: string;
  description: string;
};

type AdminScopeNoticeAction = {
  href: string;
  label: string;
};

interface AdminScopeNoticeProps {
  title: string;
  items: readonly AdminScopeNoticeItem[];
  action?: AdminScopeNoticeAction;
  children?: ReactNode;
  className?: string;
  description?: string;
}

function AdminScopeNoticeComponent({
  title,
  items,
  action,
  children,
  className,
  description,
}: AdminScopeNoticeProps) {
  const hasActionArea = Boolean(action || children);

  return (
    <section
      aria-label={title}
      className={cn(
        'rounded-xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-slate-700 shadow-sm dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-slate-200',
        className
      )}
    >
      <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
        <div className='space-y-3'>
          <div>
            <h2 className='text-base font-semibold text-slate-950 dark:text-slate-50'>
              {title}
            </h2>
            {description && (
              <p className='mt-1 leading-6 text-slate-600 dark:text-slate-300'>
                {description}
              </p>
            )}
          </div>
          <div className='grid gap-3 md:grid-cols-3'>
            {items.map(item => (
              <div key={item.label} className='space-y-1'>
                <div className='font-medium text-slate-950 dark:text-slate-50'>
                  {item.label}
                </div>
                <p className='leading-6'>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
        {hasActionArea && (
          <div className='flex shrink-0 flex-wrap gap-2'>
            {action && (
              <Link
                href={action.href}
                className='inline-flex h-9 items-center justify-center rounded-medical border border-sky-200 bg-white px-3 text-sm font-medium text-sky-700 shadow-sm transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900'
              >
                {action.label}
              </Link>
            )}
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

export const AdminScopeNotice = memo(AdminScopeNoticeComponent);
