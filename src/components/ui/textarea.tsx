import * as React from 'react';
import { cnApp } from './app-theme';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cnApp(
          className,
          'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          'app:bg-surface-raised app:text-foreground app:text-base app:md:text-sm app:hover:border-ring app:read-only:bg-surface-soft app:read-only:text-foreground app:disabled:bg-disabled app:disabled:text-text-disabled app:disabled:opacity-100 app:aria-[invalid=true]:border-destructive app:aria-[invalid=true]:focus-visible:ring-destructive'
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
