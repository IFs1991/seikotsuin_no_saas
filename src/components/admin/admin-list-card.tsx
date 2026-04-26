'use client';

import { memo, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface AdminListCardProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
  filters?: ReactNode;
  searchId?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

function AdminListCardComponent({
  title,
  children,
  actions,
  className,
  contentClassName,
  filters,
  searchId,
  searchPlaceholder = '検索',
  searchValue,
  onSearchChange,
}: AdminListCardProps) {
  const hasToolbar = Boolean(onSearchChange || filters || actions);

  return (
    <Card className={className}>
      <CardHeader className='space-y-3'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <CardTitle className='text-lg font-semibold'>{title}</CardTitle>
          {actions}
        </div>
        {hasToolbar && (
          <div className='flex flex-wrap items-center gap-3'>
            {onSearchChange && (
              <div className='relative w-full max-w-xs'>
                <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
                <Input
                  id={searchId}
                  value={searchValue ?? ''}
                  onChange={event => onSearchChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  className='pl-9'
                />
              </div>
            )}
            {filters}
          </div>
        )}
      </CardHeader>
      <CardContent className={cn('overflow-x-auto', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

export const AdminListCard = memo(AdminListCardComponent);
