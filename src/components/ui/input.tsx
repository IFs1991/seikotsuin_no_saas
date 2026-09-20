import React from 'react';
import { cnApp } from './app-theme';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?:
    | 'default'
    | 'medical'
    | 'patient'
    | 'admin'
    | 'clinical'
    | 'emergency'
    | 'search';
  inputSize?: 'sm' | 'default' | 'lg' | 'touch' | 'clinical';
  state?: 'default' | 'error' | 'success' | 'warning';
  medical?: boolean;
}

const inputVariants = {
  variant: {
    default: 'border-input bg-background',

    // 医療系バリアント (Atlassian Design準拠)
    medical:
      'border-gray-300 bg-white focus:border-medical-blue-600 focus:ring-medical-blue-500 focus:ring-1',
    patient:
      'border-blue-200 bg-blue-50 focus:border-blue-500 focus:ring-blue-400 focus:ring-1',
    admin:
      'border-admin-300 bg-admin-50 focus:border-admin-600 focus:ring-admin-500 focus:ring-1',
    clinical:
      'border-medical-green-200 bg-medical-green-50 focus:border-medical-green-600 focus:ring-medical-green-500 focus:ring-1',
    emergency:
      'border-red-300 bg-red-50 focus:border-red-600 focus:ring-red-500 focus:ring-2 font-medium',
    search:
      'border-gray-300 bg-gray-50 focus:border-primary-500 focus:ring-primary-500 focus:ring-1 pl-10',
  },
  size: {
    sm: 'h-9 px-3 py-1 text-sm',
    default: 'h-10 px-3 py-2 text-sm',
    lg: 'h-12 px-4 py-3 text-base',
    touch: 'h-12 min-w-12 px-4 py-2 text-base', // WCAG 2.2 タッチターゲット対応
    clinical: 'h-11 px-4 py-3 text-base', // 医療現場での操作性重視
  },
  state: {
    default: '',
    error:
      'border-red-500 bg-red-50 text-red-900 focus:border-red-600 focus:ring-red-500',
    success:
      'border-green-500 bg-green-50 text-green-900 focus:border-green-600 focus:ring-green-500',
    warning:
      'border-yellow-500 bg-yellow-50 text-yellow-900 focus:border-yellow-600 focus:ring-yellow-500',
  },
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      variant = 'default',
      inputSize = 'default',
      state = 'default',
      medical = false,
      ...props
    },
    ref
  ) => {
    return (
      <input
        type={type}
        className={cnApp(
          className,
          // 基本スタイル + Atlassian Design準拠
          'flex w-full rounded-medical ring-offset-background',
          // アニメーション・トランジション (医療現場配慮)
          'transition-all duration-200 ease-out',
          // ファイル入力スタイル
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          // プレースホルダー (医療データ入力支援)
          'placeholder:text-muted-foreground placeholder:font-normal',
          // フォーカス管理 (WCAG 2.2対応・医療現場配慮)
          'focus-visible:outline-none focus-visible:ring-offset-2',
          // フォーカス時の要素隠れ防止
          'focus:z-10 focus-no-obscure',
          // 無効化状態 (医療安全性配慮)
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-100',
          // 読み取り専用状態
          'read-only:bg-gray-50 read-only:cursor-default',
          // ホバー効果 (インタラクション向上)
          'hover:shadow-medical',
          // バリアント適用
          inputVariants.variant[variant],
          inputVariants.size[inputSize],
          // 状態適用
          inputVariants.state[state],
          // 医療特化スタイル
          medical && 'border-2 focus:ring-2',
          'app:border app:border-input app:bg-surface-raised app:text-foreground app:text-base app:md:text-sm app:min-h-11 app:md:min-h-10 app:transition-colors app:hover:border-ring app:focus:border-ring app:focus:ring-2 app:focus:ring-ring app:focus:ring-offset-2 app:focus:ring-offset-background app:read-only:bg-surface-soft app:read-only:text-foreground app:disabled:bg-disabled app:disabled:text-text-disabled app:disabled:opacity-100 app:disabled:shadow-none app:aria-[invalid=true]:border-destructive app:aria-[invalid=true]:focus:ring-destructive',
          state === 'success' &&
            'app:border-success app:focus:border-success app:focus:ring-success',
          state === 'warning' &&
            'app:border-warning app:focus:border-warning app:focus:ring-warning'
        )}
        ref={ref}
        // アクセシビリティ属性 (医療従事者支援)
        aria-invalid={state === 'error'}
        data-variant={variant}
        data-state={state}
        data-medical={medical}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
