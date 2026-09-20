import React from 'react';
import { cnApp } from './app-theme';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
    | 'medical-primary'
    | 'medical-urgent'
    | 'admin-primary'
    | 'admin-secondary'
    | 'patient-primary';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'touch' | 'emergency';
}

const buttonVariants = {
  variant: {
    default:
      'bg-primary text-primary-foreground hover:bg-primary/90 app:hover:bg-primary-hover',
    destructive:
      'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    outline:
      'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',

    // 医療系専用バリアント (WCAG 2.2対応 + Atlassian Design準拠)
    'medical-primary':
      'bg-medical-blue-600 hover:bg-medical-blue-700 text-white border-0 shadow-medical app:bg-primary app:text-primary-foreground app:hover:bg-primary-hover',
    'medical-urgent':
      'bg-red-600 hover:bg-red-700 text-white border-0 font-semibold shadow-medical animate-pulse-soft app:bg-destructive app:text-destructive-foreground app:hover:bg-destructive/90 app:animate-none',

    // 管理者専用バリアント
    'admin-primary':
      'bg-admin-600 hover:bg-admin-700 text-white border-0 shadow-medical app:bg-primary app:text-primary-foreground app:hover:bg-primary-hover',
    'admin-secondary':
      'bg-admin-100 hover:bg-admin-200 text-admin-800 border border-admin-300 shadow-medical app:bg-secondary app:text-secondary-foreground app:border-input app:hover:bg-surface-muted',

    // 患者向けバリアント（温かみのある色調）
    'patient-primary':
      'bg-blue-500 hover:bg-blue-600 text-white border-0 shadow-medical app:bg-primary app:text-primary-foreground app:hover:bg-primary-hover',
  },
  size: {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-md px-3',
    lg: 'h-11 rounded-md px-8',
    icon: 'h-10 w-10',
    // WCAG 2.2 タッチターゲット対応
    touch: 'h-12 min-w-12 px-4 py-2',
    emergency: 'h-14 min-w-14 px-6 py-3 text-lg font-semibold',
  },
};

export function buttonClassName({
  className,
  variant = 'default',
  size = 'default',
}: Pick<ButtonProps, 'className' | 'variant' | 'size'> = {}) {
  return cnApp(
    className,
    // 基本スタイル + WCAG 2.2対応 + Atlassian Design準拠
    'inline-flex items-center justify-center whitespace-nowrap rounded-medical text-sm font-medium ring-offset-background',
    // アニメーション・トランジション (Atlassian Motion準拠)
    'transition-all duration-200 ease-out',
    // フォーカス管理 (キーボード操作対応・医療現場配慮)
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
    // 無効化状態 (医療安全性配慮)
    'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
    // フォーカス時の要素隠れ防止 (WCAG 2.2 基準 2.4.11)
    'focus:z-10 focus-no-obscure',
    // ホバー効果 (医療現場での視認性向上)
    'hover:shadow-medical-lg hover:transform hover:scale-[1.02]',
    // アクティブ状態
    'active:transform active:scale-[0.98]',
    // App-only polish keeps public booking/login variants visually compatible.
    'app:transition-colors app:duration-150 app:focus-visible:ring-ring app:hover:scale-100 app:hover:shadow-none app:active:scale-100 app:active:brightness-95 app:disabled:opacity-100 app:disabled:bg-disabled app:disabled:text-text-disabled app:disabled:shadow-none app:aria-[busy=true]:cursor-wait',
    buttonVariants.variant[variant],
    buttonVariants.size[size]
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={buttonClassName({ className, variant, size })}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
