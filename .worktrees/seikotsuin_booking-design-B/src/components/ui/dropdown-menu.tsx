'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownMenuContext =
  React.createContext<DropdownMenuContextValue | null>(null);

interface DropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({
  children,
  open: controlledOpen,
  onOpenChange,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className='relative inline-block text-left'>{children}</div>
    </DropdownMenuContext.Provider>
  );
};

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, children, asChild = false, ...props }, ref) => {
  const context = React.useContext(DropdownMenuContext);

  if (!context) {
    throw new Error('DropdownMenuTrigger must be used within DropdownMenu');
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...props,
      ref,
      onClick: (e: React.MouseEvent) => {
        context.setOpen(!context.open);
        children.props.onClick?.(e);
      },
    });
  }

  return (
    <button
      ref={ref}
      type='button'
      className={cn(
        'inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
        className
      )}
      onClick={() => context.setOpen(!context.open)}
      {...props}
    >
      {children}
    </button>
  );
});
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
  }
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => {
  const context = React.useContext(DropdownMenuContext);

  if (!context) {
    throw new Error('DropdownMenuContent must be used within DropdownMenu');
  }

  if (!context.open) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={cn(
        'absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none',
        align === 'start' && 'left-0 right-auto',
        align === 'center' && 'left-1/2 -translate-x-1/2',
        className
      )}
      style={{ marginTop: sideOffset }}
      {...props}
    />
  );
});
DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean }
>(({ className, disabled = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer',
      disabled && 'opacity-50 pointer-events-none cursor-not-allowed',
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('my-1 h-px bg-gray-200', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-4 py-2 text-sm font-semibold text-gray-900', className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
};
