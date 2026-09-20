import { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { cn } from '@/lib/utils';

/** Keep existing caller utilities authoritative over app-scoped defaults. */
export function cnApp(
  className: string | undefined,
  ...defaults: ClassValue[]
) {
  const classes = cn(...defaults)
    .split(/\s+/)
    .filter(token => {
      if (!className || !token.startsWith('app:')) return true;
      const unscoped = token.slice('app:'.length);
      // Compare equivalent utility groups without changing the emitted classes.
      // This also preserves local hover, size and semantic status overrides.
      return twMerge(unscoped, className).split(/\s+/).includes(unscoped);
    });
  return cn(classes, className);
}
