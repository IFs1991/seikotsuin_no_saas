import React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';
import { Input } from './input';

export interface FormFieldProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'children'
> {
  label: string;
  required?: boolean;
  error?: string;
  help?: string;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  children?: React.ReactNode;
  inputProps?: React.ComponentProps<typeof Input>;
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      label,
      required = false,
      error,
      help,
      className,
      labelClassName,
      inputClassName,
      children,
      inputProps,
      ...props
    },
    ref
  ) => {
    const fieldId = React.useId();
    const errorId = React.useId();
    const helpId = React.useId();

    return (
      <div ref={ref} className={cn('space-y-2', className)} {...props}>
        <Label
          htmlFor={fieldId}
          variant={required ? 'required' : 'medical'}
          className={cn('block', labelClassName)}
        >
          {label}
        </Label>

        {children ? (
          React.isValidElement(children) ? (
            React.cloneElement(
              children as React.ReactElement<{
                id?: string;
                'aria-describedby'?: string;
                'aria-invalid'?: string;
              }>,
              {
                id: fieldId,
                'aria-describedby':
                  cn(
                    error ? errorId : undefined,
                    help ? helpId : undefined
                  ).trim() || undefined,
                'aria-invalid': error ? 'true' : undefined,
              }
            )
          ) : (
            children
          )
        ) : (
          <Input
            id={fieldId}
            variant='medical'
            inputSize='touch'
            aria-describedby={
              cn(
                error ? errorId : undefined,
                help ? helpId : undefined
              ).trim() || undefined
            }
            aria-invalid={error ? 'true' : undefined}
            className={cn(
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
              inputClassName
            )}
            {...inputProps}
          />
        )}

        {help && !error && (
          <p id={helpId} className='text-sm text-gray-600'>
            {help}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            className='text-sm text-red-600 font-medium'
            role='alert'
            aria-live='polite'
          >
            ⚠ {error}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';
