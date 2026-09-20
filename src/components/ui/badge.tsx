'use client';

import React from 'react';
import { cnApp } from './app-theme';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'bg-blue-600 text-white border-transparent app:bg-primary app:text-primary-foreground',
  secondary:
    'bg-gray-100 text-gray-800 border-gray-200 app:bg-secondary app:text-secondary-foreground app:border-border',
  destructive:
    'bg-red-600 text-white border-transparent app:bg-destructive-soft app:text-destructive app:border-destructive',
  outline:
    'bg-transparent text-gray-800 border-gray-300 app:text-foreground app:border-input',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cnApp(
        className,
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        variantClasses[variant]
      )}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';
