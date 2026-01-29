'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import type { ClinicFormData, ClinicCreateResponse } from '@/types/onboarding';

interface ClinicStepProps {
  onSubmit: (data: ClinicFormData) => Promise<ClinicCreateResponse>;
}

export function ClinicStep({ onSubmit }: ClinicStepProps) {
  const [formData, setFormData] = useState<ClinicFormData>({
    name: '',
    address: '',
    phone_number: '',
    opening_date: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'クリニック名は必須です';
    } else if (formData.name.length > 255) {
      newErrors.name = 'クリニック名は255文字以内で入力してください';
    }

    if (formData.address && formData.address.length > 500) {
      newErrors.address = '住所は500文字以内で入力してください';
    }

    if (formData.phone_number && formData.phone_number.length > 20) {
      newErrors.phone_number = '電話番号は20文字以内で入力してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await onSubmit(formData);
      if (!result.success) {
        setApiError(result.error || 'エラーが発生しました');
      }
    } catch {
      setApiError('予期しないエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className='w-full max-w-lg mx-auto'>
      <CardHeader>
        <CardTitle>クリニック情報の入力</CardTitle>
        <CardDescription>
          クリニックの基本情報を登録してください。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className='space-y-6'>
          <FormField label='クリニック名' required error={errors.name}>
            <Input
              type='text'
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder='〇〇整骨院'
              disabled={isSubmitting}
            />
          </FormField>

          <FormField label='住所' error={errors.address}>
            <Input
              type='text'
              value={formData.address || ''}
              onChange={e =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder='東京都渋谷区〇〇1-2-3'
              disabled={isSubmitting}
            />
          </FormField>

          <FormField label='電話番号' error={errors.phone_number}>
            <Input
              type='tel'
              value={formData.phone_number || ''}
              onChange={e =>
                setFormData({ ...formData, phone_number: e.target.value })
              }
              placeholder='03-1234-5678'
              disabled={isSubmitting}
            />
          </FormField>

          <FormField label='開院日' error={errors.opening_date}>
            <Input
              type='date'
              value={formData.opening_date || ''}
              onChange={e =>
                setFormData({ ...formData, opening_date: e.target.value })
              }
              disabled={isSubmitting}
            />
          </FormField>

          {apiError && (
            <div className='p-3 bg-red-50 border border-red-200 rounded-md'>
              <p className='text-sm text-red-600'>{apiError}</p>
            </div>
          )}

          <Button type='submit' className='w-full' disabled={isSubmitting}>
            {isSubmitting ? '作成中...' : '次へ進む'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
