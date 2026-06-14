'use client';

import { memo, type ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type AdminAccountCreateFieldsProps = {
  className?: string;
  fullName: string;
  email: string;
  password: string;
  fullNameInputId: string;
  emailInputId: string;
  passwordInputId: string;
  fullNamePlaceholder?: string;
  emailPlaceholder?: string;
  passwordPlaceholder?: string;
  passwordHelpText?: string;
  onFullNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEmailChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export const AdminAccountCreateFields = memo(function AdminAccountCreateFields({
  className,
  fullName,
  email,
  password,
  fullNameInputId,
  emailInputId,
  passwordInputId,
  fullNamePlaceholder = '例: 山田 太郎',
  emailPlaceholder = 'user@example.com',
  passwordPlaceholder = '英大文字・小文字・数字・記号を含む',
  passwordHelpText,
  onFullNameChange,
  onEmailChange,
  onPasswordChange,
}: AdminAccountCreateFieldsProps) {
  return (
    <div className={cn('grid gap-4 md:grid-cols-2', className)}>
      <div className='space-y-2'>
        <label htmlFor={fullNameInputId} className='text-sm font-medium'>
          氏名
        </label>
        <Input
          id={fullNameInputId}
          value={fullName}
          onChange={onFullNameChange}
          placeholder={fullNamePlaceholder}
          autoComplete='name'
        />
      </div>
      <div className='space-y-2'>
        <label htmlFor={emailInputId} className='text-sm font-medium'>
          ログインメールアドレス
        </label>
        <Input
          id={emailInputId}
          type='email'
          value={email}
          onChange={onEmailChange}
          placeholder={emailPlaceholder}
          autoComplete='email'
        />
      </div>
      <div className='space-y-2'>
        <label htmlFor={passwordInputId} className='text-sm font-medium'>
          初期パスワード
        </label>
        <Input
          id={passwordInputId}
          type='password'
          value={password}
          onChange={onPasswordChange}
          placeholder={passwordPlaceholder}
          autoComplete='new-password'
        />
        {passwordHelpText && (
          <p className='text-xs text-muted-foreground'>{passwordHelpText}</p>
        )}
      </div>
    </div>
  );
});

AdminAccountCreateFields.displayName = 'AdminAccountCreateFields';
