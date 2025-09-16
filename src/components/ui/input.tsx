import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'medical' | 'search';
  inputSize?: 'default' | 'sm' | 'lg' | 'touch';
}

const inputVariants = {
  variant: {
    default: "border-input bg-background",
    medical: "border-gray-300 bg-white focus:border-primary-500 focus:ring-primary-500",
    search: "border-gray-300 bg-gray-50 focus:border-primary-500 focus:ring-primary-500 pl-10",
  },
  size: {
    default: "h-10 px-3 py-2 text-sm",
    sm: "h-9 px-3 py-1 text-sm",
    lg: "h-12 px-4 py-3 text-base",
    touch: "h-touch-min px-4 py-2 text-base", // WCAG 2.2 タッチターゲット対応
  },
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = 'default', inputSize = 'default', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // 基本スタイル
          "flex w-full rounded-md ring-offset-background transition-colors",
          // ファイル入力スタイル
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          // プレースホルダー
          "placeholder:text-muted-foreground",
          // フォーカス管理 (WCAG 2.2対応)
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          // フォーカス時の要素隠れ防止
          "focus-no-obscure",
          // 無効化状態
          "disabled:cursor-not-allowed disabled:opacity-50",
          // バリアント適用
          inputVariants.variant[variant],
          inputVariants.size[inputSize],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";