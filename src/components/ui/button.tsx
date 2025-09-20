import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
    | 'medical-primary'
    | 'medical-urgent'
    | 'medical-success';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'touch';
}

const buttonVariants = {
  variant: {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    destructive:
      'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    outline:
      'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
    // 医療系専用バリアント (WCAG 2.2対応)
    'medical-primary':
      'bg-primary-600 hover:bg-primary-700 text-white border-0',
    'medical-urgent':
      'bg-red-600 hover:bg-red-700 text-white border-0 font-semibold',
    'medical-success':
      'bg-emerald-600 hover:bg-emerald-700 text-white border-0',
  },
  size: {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-md px-3',
    lg: 'h-11 rounded-md px-8',
    icon: 'h-10 w-10',
    // WCAG 2.2 タッチターゲット対応
    touch: 'h-touch-min min-w-touch-min px-4 py-2',
  },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          // 基本スタイル + WCAG 2.2対応
          'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors',
          // フォーカス管理 (キーボード操作対応)
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // 無効化状態
          'disabled:pointer-events-none disabled:opacity-50',
          // フォーカス時の要素隠れ防止 (WCAG 2.2 基準 2.4.11)
          'focus-no-obscure',
          buttonVariants.variant[variant],
          buttonVariants.size[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
