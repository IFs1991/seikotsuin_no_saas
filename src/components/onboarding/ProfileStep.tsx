'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { ProfileFormData, ProfileUpdateResponse } from '@/types/onboarding';

interface ProfileStepProps {
  onSubmit: (data: ProfileFormData) => Promise<ProfileUpdateResponse>;
}

export function ProfileStep({ onSubmit }: ProfileStepProps) {
  const [formData, setFormData] = useState<ProfileFormData>({
    full_name: '',
    phone_number: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.full_name.trim()) {
      newErrors.full_name = '氏名は必須です';
    } else if (formData.full_name.length > 255) {
      newErrors.full_name = '氏名は255文字以内で入力してください';
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
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>管理者情報の入力</CardTitle>
        <CardDescription>
          まずはあなたの基本情報を入力してください。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <FormField
            label="氏名"
            required
            error={errors.full_name}
          >
            <Input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="山田 太郎"
              disabled={isSubmitting}
            />
          </FormField>

          <FormField
            label="電話番号"
            error={errors.phone_number}
            help="任意入力です"
          >
            <Input
              type="tel"
              value={formData.phone_number || ''}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              placeholder="090-1234-5678"
              disabled={isSubmitting}
            />
          </FormField>

          {apiError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{apiError}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? '保存中...' : '次へ進む'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
