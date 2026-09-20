import React from 'react';
import { cnApp } from './app-theme';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

const cardVariants = {
  interactive: {
    true: 'cursor-pointer hover:scale-[1.01] hover:shadow-medical-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 app:hover:scale-100 app:hover:shadow-surface app:hover:border-input app:hover:bg-surface-soft app:focus:ring-ring app:ring-offset-background app:transition-colors',
    false: '',
  },
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive = false, onKeyDown, ...props }, ref) => (
    <div
      ref={ref}
      className={cnApp(
        className,
        'rounded-lg border bg-card text-card-foreground shadow-sm app:shadow-surface',
        cardVariants.interactive[
          interactive.toString() as keyof typeof cardVariants.interactive
        ]
      )}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      data-interactive={interactive}
      {...props}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (
          interactive &&
          !event.defaultPrevented &&
          event.target === event.currentTarget &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    />
  )
);
Card.displayName = 'Card';

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cnApp(className, 'flex flex-col space-y-1.5 p-6')}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

export const CardTitle = React.forwardRef<HTMLParagraphElement, CardTitleProps>(
  ({ className, children, ...props }, ref) => (
    <h3
      ref={ref}
      className={cnApp(
        className,
        'text-2xl font-semibold leading-none tracking-tight app:text-base app:leading-snug app:tracking-normal'
      )}
      {...props}
    >
      {children}
    </h3>
  )
);
CardTitle.displayName = 'CardTitle';

export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  CardDescriptionProps
>(({ className, children, ...props }, ref) => (
  <p
    ref={ref}
    className={cnApp(className, 'text-sm text-muted-foreground')}
    {...props}
  >
    {children}
  </p>
));
CardDescription.displayName = 'CardDescription';

export type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cnApp(className, 'p-6 pt-0')} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cnApp(className, 'flex items-center p-6 pt-0')}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';
