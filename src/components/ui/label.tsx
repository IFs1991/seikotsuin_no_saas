import React from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {
  variant?: 'default' | 'medical' | 'required';
  size?: 'default' | 'sm' | 'lg';
}

const labelVariants = {
  variant: {
    default: "text-gray-700",
    medical: "text-gray-900 font-semibold",
    required: "text-gray-900 font-semibold after:content-['*'] after:text-red-500 after:ml-1",
  },
  size: {
    default: "text-sm",
    sm: "text-xs",
    lg: "text-base",
  },
};

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        // 基本スタイル
        "font-medium leading-none select-none",
        // 無効化状態対応
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        // バリアント適用
        labelVariants.variant[variant],
        labelVariants.size[size],
        className
      )}
      {...props}
    />
  )
);
Label.displayName = "Label";