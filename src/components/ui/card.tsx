import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 
    | 'default' 
    | 'medical' 
    | 'dashboard' 
    | 'patient' 
    | 'admin'
    | 'emergency'
    | 'clinical'
    | 'report'
    | 'security'
    | 'analytics';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  interactive?: boolean;
  elevation?: 'none' | 'low' | 'medium' | 'high';
}

const cardVariants = {
  variant: {
    default: 'rounded-lg border bg-card text-card-foreground shadow-sm',
    
    // 医療系バリアント (Atlassian Design準拠)
    medical: 'rounded-medical border border-gray-300 bg-white shadow-medical text-gray-900',
    dashboard:
      'rounded-medical border border-gray-200 bg-white shadow-medical hover:shadow-medical-lg transition-all duration-200',
    patient: 'rounded-medical border border-blue-200 bg-blue-50 shadow-medical text-blue-900',
    
    // 管理者・緊急時バリアント
    admin: 'rounded-medical border border-admin-200 bg-admin-50 shadow-medical text-admin-900',
    emergency: 'rounded-medical border-l-4 border-l-red-500 border border-red-200 bg-red-50 shadow-medical-lg text-red-900',
    
    // 機能別バリアント
    clinical: 'rounded-medical border border-medical-blue-200 bg-medical-blue-50 shadow-medical text-medical-blue-900',
    report: 'rounded-medical border border-green-200 bg-green-50 shadow-medical text-green-900',
    security: 'rounded-medical border border-yellow-200 bg-yellow-50 shadow-medical text-yellow-900',
    analytics: 'rounded-medical border border-purple-200 bg-purple-50 shadow-medical text-purple-900',
  },
  elevation: {
    none: 'shadow-none',
    low: 'shadow-medical',
    medium: 'shadow-medical-lg',
    high: 'shadow-2xl shadow-gray-400/20',
  },
  interactive: {
    true: 'cursor-pointer hover:scale-[1.01] hover:shadow-medical-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2',
    false: '',
  },
  priority: {
    urgent: 'animate-pulse-soft ring-2 ring-red-300 ring-opacity-50',
    high: 'border-l-4 border-l-orange-500',
    medium: 'border-l-2 border-l-blue-400',
    low: '',
  },
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ 
    className, 
    variant = 'default', 
    priority, 
    interactive = false, 
    elevation = 'low',
    ...props 
  }, ref) => (
    <div
      ref={ref}
      className={cn(
        // 基本バリアントスタイル
        cardVariants.variant[variant],
        // 影の深さ
        cardVariants.elevation[elevation],
        // インタラクティブ要素
        cardVariants.interactive[interactive.toString() as keyof typeof cardVariants.interactive],
        // 優先度スタイル
        priority && cardVariants.priority[priority],
        className
      )}
      // アクセシビリティ属性
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      data-priority={priority}
      data-interactive={interactive}
      {...props}
    />
  )
);
Card.displayName = 'Card';

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

export const CardTitle = React.forwardRef<HTMLParagraphElement, CardTitleProps>(
  ({ className, children, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'text-2xl font-semibold leading-none tracking-tight',
        className
      )}
      {...props}
    >
      {children}
    </h3>
  )
);
CardTitle.displayName = 'CardTitle';

export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  CardDescriptionProps
>(({ className, children, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  >
    {children}
  </p>
));
CardDescription.displayName = 'CardDescription';

export type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';
