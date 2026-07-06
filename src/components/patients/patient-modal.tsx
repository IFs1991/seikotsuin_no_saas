'use client';

import React, { memo, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Patient } from '@/hooks/usePatientsList';
import { logger } from '@/lib/logger';

interface PatientFormData {
  name: string;
  phone: string;
  email: string;
  notes: string;
  customAttributes?: Record<string, unknown>;
}

interface PatientFormState {
  name: string;
  phone: string;
  email: string;
  notes: string;
  customAttributesInput: string;
}

interface FormErrors {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  customAttributesInput?: string;
}

interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PatientFormData) => Promise<void>;
  patient?: Patient | null;
  mode: 'create' | 'edit';
}

const NAME_MAX_LENGTH = 255;
const PHONE_MAX_LENGTH = 32;
const EMAIL_MAX_LENGTH = 255;
const NOTES_MAX_LENGTH = 2000;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function PatientModalComponent({
  isOpen,
  onClose,
  onSave,
  patient,
  mode,
}: PatientModalProps) {
  const [formData, setFormData] = useState<PatientFormState>({
    name: '',
    phone: '',
    email: '',
    notes: '',
    customAttributesInput: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 編集モードの場合、患者データをフォームに反映
  useEffect(() => {
    if (mode === 'edit' && patient) {
      setFormData({
        name: patient.name,
        phone: patient.phone,
        email: patient.email ?? '',
        notes: patient.notes ?? '',
        customAttributesInput: patient.customAttributes
          ? JSON.stringify(patient.customAttributes, null, 2)
          : '',
      });
    } else if (mode === 'create') {
      setFormData({
        name: '',
        phone: '',
        email: '',
        notes: '',
        customAttributesInput: '',
      });
    }
    setErrors({});
  }, [mode, patient, isOpen]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    const name = formData.name.trim();
    const phone = formData.phone.trim();
    const email = formData.email.trim();
    const notes = formData.notes.trim();

    if (!name) {
      newErrors.name = '氏名は必須です';
    } else if (name.length > NAME_MAX_LENGTH) {
      newErrors.name = '氏名は255文字以内で入力してください';
    }

    if (!phone) {
      newErrors.phone = '電話番号は必須です';
    } else if (phone.length > PHONE_MAX_LENGTH) {
      newErrors.phone = '電話番号は32文字以内で入力してください';
    }

    if (email.length > EMAIL_MAX_LENGTH) {
      newErrors.email = 'メールアドレスは255文字以内で入力してください';
    } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'メールアドレスの形式が正しくありません';
    }

    if (notes.length > NOTES_MAX_LENGTH) {
      newErrors.notes = 'メモは2000文字以内で入力してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const parseCustomAttributesInput = (): {
    value?: Record<string, unknown>;
    error?: string;
  } => {
    const raw = formData.customAttributesInput.trim();
    if (!raw) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isJsonObject(parsed)) {
        return {
          error:
            'JSON\u306f\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u306e\u307f\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u3059',
        };
      }
      return { value: parsed };
    } catch {
      return {
        error:
          'JSON\u5f62\u5f0f\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093',
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const customAttributesResult = parseCustomAttributesInput();
    if (customAttributesResult.error) {
      setErrors(prev => ({
        ...prev,
        customAttributesInput: customAttributesResult.error,
      }));
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        notes: formData.notes.trim(),
        customAttributes: customAttributesResult.value,
      });
      onClose();
    } catch (error) {
      logger.error('保存に失敗しました', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // 入力時にエラーをクリア
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const title = mode === 'create' ? '患者新規登録' : '患者情報編集';
  const submitLabel = mode === 'create' ? '登録' : '保存';

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? '新しい患者を登録します。氏名と電話番号は必須です。'
              : '患者情報を編集します。'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className='grid gap-4 py-4'>
            {/* 氏名 */}
            <div className='grid gap-2'>
              <Label htmlFor='name'>
                氏名 <span className='text-red-500'>*</span>
              </Label>
              <Input
                id='name'
                name='name'
                value={formData.name}
                onChange={handleChange}
                placeholder='山田 太郎'
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && (
                <p className='text-sm text-red-500'>{errors.name}</p>
              )}
            </div>

            {/* 電話番号 */}
            <div className='grid gap-2'>
              <Label htmlFor='phone'>
                電話番号 <span className='text-red-500'>*</span>
              </Label>
              <Input
                id='phone'
                name='phone'
                value={formData.phone}
                onChange={handleChange}
                placeholder='090-1234-5678'
                className={errors.phone ? 'border-red-500' : ''}
              />
              {errors.phone && (
                <p className='text-sm text-red-500'>{errors.phone}</p>
              )}
            </div>

            {/* メールアドレス */}
            <div className='grid gap-2'>
              <Label htmlFor='email'>メールアドレス</Label>
              <Input
                id='email'
                name='email'
                type='email'
                value={formData.email}
                onChange={handleChange}
                placeholder='example@email.com'
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && (
                <p className='text-sm text-red-500'>{errors.email}</p>
              )}
            </div>

            {/* メモ */}
            <div className='grid gap-2'>
              <Label htmlFor='notes'>メモ</Label>
              <Textarea
                id='notes'
                name='notes'
                value={formData.notes}
                onChange={handleChange}
                placeholder='特記事項があれば入力してください'
                className={errors.notes ? 'border-red-500' : ''}
                rows={3}
              />
              {errors.notes && (
                <p className='text-sm text-red-500'>{errors.notes}</p>
              )}
            </div>
            {/* Custom Attributes (JSON) */}
            <div className='grid gap-2'>
              <Label htmlFor='customAttributesInput'>
                {'\u30ab\u30b9\u30bf\u30e0\u5c5e\u6027 (JSON)'}
              </Label>
              <Textarea
                id='customAttributesInput'
                name='customAttributesInput'
                value={formData.customAttributesInput}
                onChange={handleChange}
                placeholder='{"symptom":"\u8170\u75db","visitReason":"\u518d\u8a3a"}'
                className={errors.customAttributesInput ? 'border-red-500' : ''}
                rows={4}
              />
              {errors.customAttributesInput && (
                <p className='text-sm text-red-500'>
                  {errors.customAttributesInput}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={onClose}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
            <Button type='submit' disabled={isSubmitting}>
              {isSubmitting ? '処理中...' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const PatientModal = memo(PatientModalComponent);
PatientModal.displayName = 'PatientModal';
