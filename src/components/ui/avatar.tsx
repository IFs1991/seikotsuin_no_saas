'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type AvatarProps = React.HTMLAttributes<HTMLDivElement>;

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-200 text-gray-600 items-center justify-center',
        className
      )}
      {...props}
    />
  )
);
Avatar.displayName = 'Avatar';

export type AvatarFallbackProps = React.HTMLAttributes<HTMLSpanElement>;

export const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  AvatarFallbackProps
>(({ className, ...props }, ref) => (
  <span ref={ref} className={cn('text-sm font-medium', className)} {...props} />
));
AvatarFallback.displayName = 'AvatarFallback';

export type AvatarImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

export const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, ...props }, ref) => (
    <img
      ref={ref}
      className={cn('aspect-square h-full w-full object-cover', className)}
      {...props}
    />
  )
);
AvatarImage.displayName = 'AvatarImage';
