'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { AdminMessage } from './AdminMessage';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  BOOKING_FORM_QUESTION_TYPES,
  BOOKING_FORM_STANDARD_FIELD_KEYS,
  DEFAULT_BOOKING_FORM_SETTINGS,
  isSafePublicLinkUrl,
  sanitizeBookingFormSettings,
  type BookingFormConsent,
  type BookingFormQuestion,
  type BookingFormQuestionType,
  type BookingFormSettings as BookingFormSettingsData,
  type BookingFormStandardFieldKey,
} from '@/lib/booking-form/settings';

const PublicBookingFormPreview = dynamic(
  () =>
    import('@/app/(public)/booking/[clinic_id]/page').then(
      module => module.PublicBookingForm
    ),
  {
    ssr: false,
    loading: () => (
      <div className='flex min-h-80 items-center justify-center text-sm text-gray-600'>
        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
        予約フォームを読み込み中...
      </div>
    ),
  }
);

const FIELD_LABELS: Record<BookingFormStandardFieldKey, string> = {
  nameKana: 'ふりがな',
  phone: '電話番号',
  email: 'メールアドレス',
  birthDate: '生年月日',
  gender: '性別',
  notes: '相談内容・メモ',
};

const QUESTION_TYPE_LABELS: Record<BookingFormQuestionType, string> = {
  text: 'テキスト',
  textarea: '長文',
  select: '単一選択',
  multiselect: '複数選択',
  boolean: 'はい/いいえ',
};

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}`;
}

function reorder<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const current = next[index];
  const target = next[nextIndex];
  next[index] = target;
  next[nextIndex] = current;
  return next;
}

function normalizeQuestionOrder(
  questions: BookingFormQuestion[]
): BookingFormQuestion[] {
  return questions.map((question, index) => ({
    ...question,
    sortOrder: index + 1,
  }));
}

export function BookingFormSettings({
  clinicId: selectedClinicId,
}: {
  clinicId?: string | null;
}) {
  const { profile, loading: profileLoading } = useUserProfile();
  const clinicId = selectedClinicId ?? profile?.clinicId;
  const { data, updateData, loadingState, handleSave, isInitialized } =
    useAdminSettings<BookingFormSettingsData>(
      DEFAULT_BOOKING_FORM_SETTINGS,
      clinicId
        ? {
            clinicId,
            category: 'booking_form',
            autoLoad: true,
          }
        : undefined
    );
  const [localValidationError, setLocalValidationError] = useState<
    string | null
  >(null);

  const orderedQuestions = useMemo(
    () =>
      [...data.questions].sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }
        return left.id.localeCompare(right.id);
      }),
    [data.questions]
  );
  const previewSettings = useMemo(
    () => sanitizeBookingFormSettings(data),
    [data]
  );
  const invalidConsentLinkLabels = useMemo(
    () =>
      data.consents
        .filter(consent => {
          const linkUrl = consent.linkUrl?.trim();
          return Boolean(linkUrl && !isSafePublicLinkUrl(linkUrl));
        })
        .map(consent => consent.label.trim() || consent.id),
    [data.consents]
  );

  const updateQuestion = useCallback(
    (questionId: string, updates: Partial<BookingFormQuestion>) => {
      updateData(prev => ({
        ...prev,
        questions: prev.questions.map(question =>
          question.id === questionId ? { ...question, ...updates } : question
        ),
      }));
    },
    [updateData]
  );

  const updateConsent = useCallback(
    (consentId: string, updates: Partial<BookingFormConsent>) => {
      if ('linkUrl' in updates) {
        setLocalValidationError(null);
      }
      updateData(prev => ({
        ...prev,
        consents: prev.consents.map(consent =>
          consent.id === consentId ? { ...consent, ...updates } : consent
        ),
      }));
    },
    [updateData]
  );

  const saveSettings = useCallback(async () => {
    if (invalidConsentLinkLabels.length > 0) {
      setLocalValidationError(
        `同意欄URLは相対パスまたはhttps URLで入力してください: ${invalidConsentLinkLabels.join(
          '、'
        )}`
      );
      return;
    }

    setLocalValidationError(null);
    await handleSave();
  }, [handleSave, invalidConsentLinkLabels]);

  if (profileLoading || !isInitialized) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
        <span className='ml-2 text-gray-600'>設定を読み込み中...</span>
      </div>
    );
  }

  const addQuestion = () => {
    updateData(prev => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          id: createId('q'),
          label: '新しい質問',
          type: 'text',
          options: [],
          required: false,
          active: true,
          sortOrder: prev.questions.length + 1,
        },
      ],
    }));
  };

  const removeQuestion = (questionId: string) => {
    updateData(prev => ({
      ...prev,
      questions: normalizeQuestionOrder(
        prev.questions.filter(question => question.id !== questionId)
      ),
    }));
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    updateData(prev => ({
      ...prev,
      questions: normalizeQuestionOrder(
        reorder(orderedQuestions, index, direction)
      ),
    }));
  };

  const addConsent = () => {
    updateData(prev => ({
      ...prev,
      consents: [
        ...prev.consents,
        {
          id: createId('c'),
          label: '同意事項',
          required: true,
          linkUrl: '',
        },
      ],
    }));
  };

  const removeConsent = (consentId: string) => {
    updateData(prev => ({
      ...prev,
      consents: prev.consents.filter(consent => consent.id !== consentId),
    }));
  };

  return (
    <div className='space-y-6'>
      {loadingState.error && (
        <AdminMessage message={loadingState.error} type='error' />
      )}
      {localValidationError && (
        <AdminMessage message={localValidationError} type='error' />
      )}
      {loadingState.savedMessage &&
        !loadingState.error &&
        !localValidationError && (
          <AdminMessage message={loadingState.savedMessage} type='success' />
        )}
      {!clinicId && (
        <AdminMessage message='対象クリニックを選択してください' type='error' />
      )}

      <Card>
        <CardHeader>
          <CardTitle className='text-xl'>標準項目</CardTitle>
          <CardDescription>
            氏名は常に必須です。その他の項目は表示と必須を切り替えできます。
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-gray-200 p-3 text-sm'>
            <span className='font-medium text-gray-800'>氏名</span>
            <span className='text-gray-500'>表示</span>
            <span className='text-gray-500'>必須</span>
          </div>
          {BOOKING_FORM_STANDARD_FIELD_KEYS.map(key => {
            const setting = data.fields[key];
            return (
              <div
                key={key}
                className='grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-gray-200 p-3'
              >
                <span className='text-sm font-medium text-gray-800'>
                  {FIELD_LABELS[key]}
                </span>
                <input
                  type='checkbox'
                  checked={setting.enabled}
                  onChange={event =>
                    updateData(prev => ({
                      ...prev,
                      fields: {
                        ...prev.fields,
                        [key]: {
                          ...prev.fields[key],
                          enabled: event.target.checked,
                          required: event.target.checked
                            ? prev.fields[key].required
                            : false,
                        },
                      },
                    }))
                  }
                />
                <input
                  type='checkbox'
                  checked={setting.required}
                  disabled={!setting.enabled}
                  onChange={event =>
                    updateData(prev => ({
                      ...prev,
                      fields: {
                        ...prev.fields,
                        [key]: {
                          ...prev.fields[key],
                          required: event.target.checked,
                        },
                      },
                    }))
                  }
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-xl'>担当者選択</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className='min-h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm'
            value={data.staffSelection}
            onChange={event =>
              updateData({
                staffSelection: event.target
                  .value as BookingFormSettingsData['staffSelection'],
              })
            }
          >
            <option value='optional'>指名なしと担当者選択を表示</option>
            <option value='required'>担当者選択を必須にする</option>
            <option value='hidden'>担当者選択を表示しない</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <CardTitle className='text-xl'>カスタム質問</CardTitle>
              <CardDescription>
                最大20件。選択肢はカンマ区切りで最大20択です。
              </CardDescription>
            </div>
            <Button
              type='button'
              variant='outline'
              onClick={addQuestion}
              disabled={data.questions.length >= 20}
            >
              <Plus className='mr-2 h-4 w-4' />
              追加
            </Button>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {orderedQuestions.length === 0 && (
            <div className='rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500'>
              カスタム質問は未設定です。
            </div>
          )}
          {orderedQuestions.map((question, index) => (
            <div
              key={question.id}
              className='space-y-3 rounded-md border border-gray-200 p-4'
            >
              <div className='grid gap-3 md:grid-cols-[1fr_12rem]'>
                <Input
                  value={question.label}
                  maxLength={100}
                  onChange={event =>
                    updateQuestion(question.id, { label: event.target.value })
                  }
                />
                <select
                  className='min-h-10 rounded-md border border-gray-300 bg-white px-3 text-sm'
                  value={question.type}
                  onChange={event =>
                    updateQuestion(question.id, {
                      type: event.target.value as BookingFormQuestionType,
                      options:
                        event.target.value === 'select' ||
                        event.target.value === 'multiselect'
                          ? question.options
                          : [],
                    })
                  }
                >
                  {BOOKING_FORM_QUESTION_TYPES.map(type => (
                    <option key={type} value={type}>
                      {QUESTION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              {(question.type === 'select' ||
                question.type === 'multiselect') && (
                <Input
                  value={question.options.join(',')}
                  placeholder='紹介, Web検索, LINE'
                  onChange={event =>
                    updateQuestion(question.id, {
                      options: event.target.value
                        .split(',')
                        .map(option => option.trim())
                        .filter(option => option.length > 0)
                        .slice(0, 20),
                    })
                  }
                />
              )}
              <div className='flex flex-wrap items-center gap-4 text-sm'>
                <label className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={question.required}
                    onChange={event =>
                      updateQuestion(question.id, {
                        required: event.target.checked,
                      })
                    }
                  />
                  必須
                </label>
                <label className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={question.active}
                    onChange={event =>
                      updateQuestion(question.id, {
                        active: event.target.checked,
                      })
                    }
                  />
                  公開
                </label>
                <div className='ml-auto flex items-center gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => moveQuestion(index, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUp className='h-4 w-4' />
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => moveQuestion(index, 1)}
                    disabled={index === orderedQuestions.length - 1}
                  >
                    <ArrowDown className='h-4 w-4' />
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => removeQuestion(question.id)}
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <CardTitle className='text-xl'>同意欄・完了メッセージ</CardTitle>
              <CardDescription>
                公開フォームの確認前に表示する同意欄と完了画面の文言です。
              </CardDescription>
            </div>
            <Button type='button' variant='outline' onClick={addConsent}>
              <Plus className='mr-2 h-4 w-4' />
              同意欄追加
            </Button>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {data.consents.map(consent => (
            <div
              key={consent.id}
              className='grid gap-3 rounded-md border border-gray-200 p-4 md:grid-cols-[1fr_14rem_auto_auto]'
            >
              <Input
                value={consent.label}
                maxLength={100}
                onChange={event =>
                  updateConsent(consent.id, { label: event.target.value })
                }
              />
              <Input
                value={consent.linkUrl ?? ''}
                placeholder='/privacy'
                aria-invalid={
                  Boolean(
                    consent.linkUrl?.trim() &&
                    !isSafePublicLinkUrl(consent.linkUrl)
                  ) || undefined
                }
                onChange={event =>
                  updateConsent(consent.id, { linkUrl: event.target.value })
                }
              />
              <label className='flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  checked={consent.required}
                  onChange={event =>
                    updateConsent(consent.id, {
                      required: event.target.checked,
                    })
                  }
                />
                必須
              </label>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => removeConsent(consent.id)}
              >
                <Trash2 className='h-4 w-4' />
              </Button>
            </div>
          ))}
          <Textarea
            value={data.completionMessage}
            maxLength={500}
            rows={3}
            placeholder='予約完了画面に表示する院独自メッセージ'
            onChange={event =>
              updateData({ completionMessage: event.target.value })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-xl'>プレビュー</CardTitle>
          <CardDescription>
            プレビューモードでは予約送信は無効です。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='max-h-[720px] overflow-y-auto rounded-md border border-gray-200 bg-gray-50'>
            {clinicId ? (
              <PublicBookingFormPreview
                clinicId={clinicId}
                embedded
                previewMode
                bookingFormOverride={previewSettings}
              />
            ) : (
              <div className='p-6 text-sm text-gray-500'>
                対象クリニックを選択してください。
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className='flex justify-end border-t border-gray-200 pt-6'>
        <Button
          type='button'
          data-testid='save-booking-form-settings-button'
          onClick={() => {
            void saveSettings();
          }}
          disabled={loadingState.isLoading || !clinicId}
        >
          {loadingState.isLoading ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <Save className='mr-2 h-4 w-4' />
          )}
          {loadingState.isLoading ? '保存中...' : '設定を保存'}
        </Button>
      </div>
    </div>
  );
}
