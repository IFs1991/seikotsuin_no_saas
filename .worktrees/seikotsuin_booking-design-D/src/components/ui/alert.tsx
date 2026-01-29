'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { type VariantProps } from 'class-variance-authority';

const cva = (base: string, options?: any) => {
  return ({ ...args }: any) => {
    const variant =
      args.variant || options?.defaultVariants?.variant || 'default';
    const variantClass = options?.variants?.variant?.[variant] || '';
    return `${base} ${variantClass}`;
  };
};

const alertVariants = cva(
  'relative w-full rounded-medical border p-4 transition-all duration-200 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground border-gray-200',
        destructive:
          'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
        warning:
          'border-yellow-500/50 text-yellow-900 bg-yellow-50 dark:border-yellow-500 dark:text-yellow-100 dark:bg-yellow-950 [&>svg]:text-yellow-600',
        success:
          'border-green-500/50 text-green-900 bg-green-50 dark:border-green-500 dark:text-green-100 dark:bg-green-950 [&>svg]:text-green-600',

        // 医療特化バリアント (Atlassian Design準拠)
        'medical-info':
          'bg-medical-blue-50 border-medical-blue-200 text-medical-blue-900 shadow-medical [&>svg]:text-medical-blue-600',
        'medical-success':
          'bg-medical-green-50 border-medical-green-200 text-medical-green-900 shadow-medical [&>svg]:text-medical-green-600',
        'medical-warning':
          'bg-yellow-50 border-yellow-200 text-yellow-900 shadow-medical [&>svg]:text-yellow-600',
        'medical-error':
          'bg-red-50 border-red-200 text-red-900 shadow-medical [&>svg]:text-red-600',
        'medical-urgent':
          'bg-red-100 border-red-300 text-red-950 shadow-medical-lg border-l-4 border-l-red-500 animate-pulse-soft [&>svg]:text-red-700',

        // 管理者・患者別バリアント
        'admin-info':
          'bg-admin-50 border-admin-200 text-admin-900 shadow-medical [&>svg]:text-admin-600',
        'admin-warning':
          'bg-admin-100 border-admin-300 text-admin-950 shadow-medical border-l-4 border-l-admin-500 [&>svg]:text-admin-700',
        'patient-info':
          'bg-blue-50 border-blue-200 text-blue-900 shadow-medical [&>svg]:text-blue-600',
        'patient-gentle':
          'bg-blue-25 border-blue-100 text-blue-800 shadow-medical [&>svg]:text-blue-500',

        // セキュリティ・システム関連
        'security-warning':
          'bg-yellow-100 border-yellow-300 text-yellow-950 shadow-medical-lg border-l-4 border-l-yellow-500 [&>svg]:text-yellow-700',
        'security-critical':
          'bg-red-100 border-red-400 text-red-950 shadow-medical-lg border-l-4 border-l-red-600 animate-pulse-soft [&>svg]:text-red-800',
        'system-maintenance':
          'bg-purple-50 border-purple-200 text-purple-900 shadow-medical [&>svg]:text-purple-600',
        'system-update':
          'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-medical [&>svg]:text-indigo-600',
      },
      priority: {
        low: '',
        medium: 'border-l-2',
        high: 'border-l-4 shadow-medical-lg',
        urgent:
          'border-l-4 shadow-medical-lg ring-2 ring-red-300 ring-opacity-50',
      },
    },
    defaultVariants: {
      variant: 'default',
      priority: 'low',
    },
  }
);

interface AlertProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  dismissible?: boolean;
  onDismiss?: () => void;
  autoHideDuration?: number;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      className,
      variant,
      priority,
      dismissible = false,
      onDismiss,
      autoHideDuration,
      children,
      ...props
    },
    ref
  ) => {
    const [isVisible, setIsVisible] = React.useState(true);

    // 自動非表示機能
    React.useEffect(() => {
      if (autoHideDuration && autoHideDuration > 0) {
        const timer = setTimeout(() => {
          setIsVisible(false);
          onDismiss?.();
        }, autoHideDuration);

        return () => clearTimeout(timer);
      }
    }, [autoHideDuration, onDismiss]);

    if (!isVisible) return null;

    const handleDismiss = () => {
      setIsVisible(false);
      onDismiss?.();
    };

    return (
      <div
        ref={ref}
        role='alert'
        className={cn(
          alertVariants({ variant, priority }),
          dismissible && 'pr-10',
          className
        )}
        data-variant={variant}
        data-priority={priority}
        data-dismissible={dismissible}
        {...props}
      >
        {children}

        {/* 閉じるボタン (dismissible時) */}
        {dismissible && (
          <button
            type='button'
            onClick={handleDismiss}
            className='absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors'
            aria-label='アラートを閉じる'
          >
            <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 20 20'>
              <path
                fillRule='evenodd'
                d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z'
                clipRule='evenodd'
              />
            </svg>
          </button>
        )}
      </div>
    );
  }
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
