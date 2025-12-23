'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-blue-600 text-white border-transparent',
  secondary: 'bg-gray-100 text-gray-800 border-gray-200',
  destructive: 'bg-red-600 text-white border-transparent',
  outline: 'bg-transparent text-gray-800 border-gray-300',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';
