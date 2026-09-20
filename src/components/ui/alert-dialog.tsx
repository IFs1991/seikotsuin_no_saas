'use client';

import * as React from 'react';
import { cnApp } from './app-theme';

interface AlertDialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(
  null
);

interface AlertDialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const AlertDialog: React.FC<AlertDialogProps> = ({
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
    <AlertDialogContext.Provider value={{ open, setOpen }}>
      {children}
    </AlertDialogContext.Provider>
  );
};

const AlertDialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, children, asChild = false, ...props }, ref) => {
  const context = React.useContext(AlertDialogContext);

  if (!context) {
    throw new Error('AlertDialogTrigger must be used within AlertDialog');
  }

  if (
    asChild &&
    React.isValidElement<
      React.ButtonHTMLAttributes<HTMLButtonElement> &
        React.RefAttributes<HTMLButtonElement>
    >(children)
  ) {
    const child = children;
    return React.cloneElement(child, {
      ...props,
      ref,
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
        context.setOpen(true);
        child.props?.onClick?.(e);
      },
    });
  }

  return (
    <button
      ref={ref}
      type='button'
      className={className}
      onClick={() => context.setOpen(true)}
      {...props}
    >
      {children}
    </button>
  );
});
AlertDialogTrigger.displayName = 'AlertDialogTrigger';

const AlertDialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(AlertDialogContext);

  if (!context) {
    throw new Error('AlertDialogContent must be used within AlertDialog');
  }

  if (!context.open) {
    return null;
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      {/* Backdrop */}
      <button
        type='button'
        aria-label='ダイアログを閉じる'
        className='fixed inset-0 bg-black bg-opacity-50'
        onClick={() => context.setOpen(false)}
      />
      {/* Content */}
      <div
        ref={ref}
        className={cnApp(
          className,
          'relative z-50 w-full max-w-lg rounded-lg bg-white p-6 shadow-lg app:bg-popover app:text-popover-foreground app:border app:border-border app:shadow-dialog app:max-h-[calc(100dvh-2rem)] app:overflow-y-auto'
        )}
        {...props}
      />
    </div>
  );
});
AlertDialogContent.displayName = 'AlertDialogContent';

const AlertDialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cnApp(className, 'mb-4')} {...props} />
));
AlertDialogHeader.displayName = 'AlertDialogHeader';

const AlertDialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cnApp(className, 'flex justify-end space-x-2 pt-4')}
    {...props}
  />
));
AlertDialogFooter.displayName = 'AlertDialogFooter';

const AlertDialogTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role='heading'
    aria-level={2}
    className={cnApp(
      className,
      'text-lg font-semibold text-gray-900 app:text-foreground'
    )}
    {...props}
  />
));
AlertDialogTitle.displayName = 'AlertDialogTitle';

const AlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cnApp(
      className,
      'text-sm text-gray-600 app:text-muted-foreground'
    )}
    {...props}
  />
));
AlertDialogDescription.displayName = 'AlertDialogDescription';

const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(AlertDialogContext);

  return (
    <button
      ref={ref}
      type='button'
      className={cnApp(
        className,
        'inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 app:bg-destructive app:text-destructive-foreground app:hover:bg-destructive/90 app:focus:ring-ring focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2'
      )}
      onClick={e => {
        props.onClick?.(e);
        context?.setOpen(false);
      }}
      {...props}
    />
  );
});
AlertDialogAction.displayName = 'AlertDialogAction';

const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(AlertDialogContext);

  return (
    <button
      ref={ref}
      type='button'
      className={cnApp(
        className,
        'inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 app:bg-secondary app:text-secondary-foreground app:border-input app:hover:bg-surface-muted app:focus:ring-ring focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
      )}
      onClick={e => {
        props.onClick?.(e);
        context?.setOpen(false);
      }}
      {...props}
    />
  );
});
AlertDialogCancel.displayName = 'AlertDialogCancel';

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
