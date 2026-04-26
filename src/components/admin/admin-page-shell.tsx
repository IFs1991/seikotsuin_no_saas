import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AdminPageShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

function AdminPageShellComponent({
  title,
  description,
  children,
  className,
  contentClassName,
}: AdminPageShellProps) {
  return (
    <main
      className={cn(
        'min-h-screen bg-white p-4 dark:bg-gray-800 sm:p-6',
        className
      )}
    >
      <div className={cn('mx-auto max-w-6xl space-y-6', contentClassName)}>
        <header className='space-y-1'>
          <h1 className='text-2xl font-bold text-slate-950 dark:text-slate-50'>
            {title}
          </h1>
          {description && (
            <p className='max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300'>
              {description}
            </p>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}

export const AdminPageShell = memo(AdminPageShellComponent);
