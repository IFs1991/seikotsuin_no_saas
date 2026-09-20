'use client';

import * as React from 'react';
import { cnApp } from './app-theme';

const TabsContext = React.createContext<{
  value: string;
  setValue: (value: string) => void;
  baseId: string;
} | null>(null);

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role='tablist'
    className={cnApp(
      className,
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground app:h-auto app:min-h-12 app:md:min-h-10'
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, onClick, onKeyDown, ...props }, ref) => {
  const context = React.useContext(TabsContext);
  const isActive = context?.value === value;

  return (
    <button
      ref={ref}
      type='button'
      role='tab'
      id={`${context?.baseId}-tab-${value}`}
      aria-controls={`${context?.baseId}-panel-${value}`}
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      className={cnApp(
        className,
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        isActive && 'bg-background text-foreground shadow-sm',
        'app:transition-colors app:hover:bg-surface-muted app:min-h-11 app:md:min-h-8',
        isActive &&
          'app:bg-selected app:text-selected-foreground app:font-semibold app:shadow-surface'
      )}
      {...props}
      onClick={event => {
        onClick?.(event);
        if (!event.defaultPrevented) context?.setValue(value);
      }}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const list = event.currentTarget.closest('[role="tablist"]');
        const tabs = Array.from(
          list?.querySelectorAll<HTMLButtonElement>(
            '[role="tab"]:not(:disabled)'
          ) ?? []
        );
        const current = tabs.indexOf(event.currentTarget);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : event.key === 'ArrowRight'
                ? (current + 1) % tabs.length
                : event.key === 'ArrowLeft'
                  ? (current - 1 + tabs.length) % tabs.length
                  : null;
        if (next === null) return;
        event.preventDefault();
        tabs[next]?.focus();
        tabs[next]?.click();
      }}
    />
  );
});
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, ...props }, ref) => {
  const context = React.useContext(TabsContext);

  if (context?.value !== value) {
    return null;
  }

  return (
    <div
      ref={ref}
      role='tabpanel'
      id={`${context?.baseId}-panel-${value}`}
      aria-labelledby={`${context?.baseId}-tab-${value}`}
      tabIndex={0}
      className={cnApp(
        className,
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
      {...props}
    />
  );
});
TabsContent.displayName = 'TabsContent';

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      className,
      defaultValue = '',
      value: controlledValue,
      onValueChange,
      children,
      ...props
    },
    ref
  ) => {
    const [uncontrolledValue, setUncontrolledValue] =
      React.useState(defaultValue);
    const baseId = React.useId();
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : uncontrolledValue;

    const setValue = React.useCallback(
      (nextValue: string) => {
        if (!isControlled) {
          setUncontrolledValue(nextValue);
        }
        onValueChange?.(nextValue);
      },
      [isControlled, onValueChange]
    );

    React.useEffect(() => {
      if (!isControlled) {
        setUncontrolledValue(defaultValue);
      }
    }, [defaultValue, isControlled]);

    return (
      <TabsContext.Provider value={{ value, setValue, baseId }}>
        <div ref={ref} className={cnApp(className, 'w-full')} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = 'Tabs';

export { Tabs, TabsList, TabsTrigger, TabsContent };
