import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { ChevronLeft, Info, AlertTriangle, CheckCircle } from 'lucide-react';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  variant?: 'default' | 'medical' | 'admin' | 'patient' | 'emergency';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  breadcrumb?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  showBackButton?: boolean;
  onBack?: () => void;
  status?: 'info' | 'warning' | 'success' | 'error';
  statusMessage?: string;
}

const headerVariants = {
  variant: {
    default: 'rounded-medical border border-border bg-card',
    medical: 'border-b border-medical-blue-200 bg-medical-blue-50',
    admin: 'border-b border-admin-200 bg-admin-50',
    patient: 'border-b border-blue-200 bg-blue-50',
    emergency: 'border-b border-red-200 bg-red-50 border-l-4 border-l-red-500',
  },
  priority: {
    low: '',
    medium: 'border-l-2 border-l-blue-400',
    high: 'border-l-4 border-l-orange-500',
    urgent: 'border-l-4 border-l-red-500 animate-pulse-soft',
  },
};

const statusIcons = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  error: AlertTriangle,
};

const statusStyles = {
  info: 'text-blue-600',
  warning: 'text-yellow-600',
  success: 'text-green-600',
  error: 'text-red-600',
};

export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  (
    {
      className,
      title,
      description,
      variant = 'default',
      priority,
      breadcrumb,
      actions,
      showBackButton = false,
      onBack,
      status,
      statusMessage,
      ...props
    },
    ref
  ) => {
    const StatusIcon = status ? statusIcons[status] : null;

    return (
      <div
        ref={ref}
        className={cn(
          // 基本スタイル (Atlassian Design準拠)
          'px-6 py-4 space-y-4',
          // バリアント適用
          headerVariants.variant[variant],
          // 優先度適用
          priority && headerVariants.priority[priority],
          className
        )}
        data-variant={variant}
        data-priority={priority}
        {...props}
      >
        {/* ブレッドクラム */}
        {breadcrumb && breadcrumb.length > 0 && (
          <nav
            aria-label='breadcrumb'
            className='flex items-center space-x-2 text-sm text-muted-foreground'
          >
            {breadcrumb.map((item, index) => (
              <React.Fragment key={index}>
                {index > 0 && (
                  <span className='text-muted-foreground/60'>/</span>
                )}
                {item.href ? (
                  <a
                    href={item.href}
                    className='hover:text-foreground transition-colors'
                    aria-current={
                      index === breadcrumb.length - 1 ? 'page' : undefined
                    }
                  >
                    {item.label}
                  </a>
                ) : (
                  <span
                    className={cn(
                      index === breadcrumb.length - 1
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground'
                    )}
                    aria-current={
                      index === breadcrumb.length - 1 ? 'page' : undefined
                    }
                  >
                    {item.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        {/* メインヘッダー */}
        <div className='flex items-center justify-between'>
          <div className='flex items-center space-x-4 min-w-0 flex-1'>
            {/* 戻るボタン */}
            {showBackButton && (
              <Button
                variant='ghost'
                size='sm'
                onClick={onBack}
                className='flex-shrink-0'
                aria-label='前のページに戻る'
              >
                <ChevronLeft className='w-4 h-4' />
              </Button>
            )}

            {/* タイトルセクション */}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center space-x-2'>
                <h1
                  className={cn(
                    'text-2xl font-semibold text-foreground truncate',
                    variant === 'emergency' && 'text-red-900 font-bold'
                  )}
                >
                  {title}
                </h1>
                {priority === 'urgent' && (
                  <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800'>
                    緊急
                  </span>
                )}
              </div>

              {description && (
                <p className='mt-1 text-sm text-muted-foreground line-clamp-2'>
                  {description}
                </p>
              )}

              {/* ステータスメッセージ */}
              {status && statusMessage && StatusIcon && (
                <div
                  className={cn(
                    'flex items-center space-x-1 mt-2',
                    statusStyles[status]
                  )}
                >
                  <StatusIcon className='w-4 h-4' />
                  <span className='text-sm font-medium'>{statusMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* アクションボタン */}
          {actions && (
            <div className='flex-shrink-0 ml-4'>
              <div className='flex items-center space-x-2'>{actions}</div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

PageHeader.displayName = 'PageHeader';
