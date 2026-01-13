'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { InvitesFormData, InvitesResponse, StaffInvite, StaffRole } from '@/types/onboarding';
import { ROLE_LABELS } from '@/types/onboarding';

interface InvitesStepProps {
  onSubmit: (data: InvitesFormData) => Promise<InvitesResponse>;
  onSkip: () => Promise<unknown>;
}

// オンボーディングで選択可能なロール（adminは自分なので除外）
const AVAILABLE_ROLES: StaffRole[] = ['clinic_admin', 'therapist', 'staff', 'manager'];

export function InvitesStep({ onSubmit, onSkip }: InvitesStepProps) {
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('staff');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddInvite = () => {
    setEmailError(null);

    if (!newEmail.trim()) {
      setEmailError('メールアドレスを入力してください');
      return;
    }

    if (!validateEmail(newEmail)) {
      setEmailError('有効なメールアドレスを入力してください');
      return;
    }

    if (invites.some((i) => i.email === newEmail)) {
      setEmailError('このメールアドレスは既に追加されています');
      return;
    }

    setInvites([...invites, { email: newEmail, role: newRole }]);
    setNewEmail('');
    setNewRole('staff');
  };

  const handleRemoveInvite = (email: string) => {
    setInvites(invites.filter((i) => i.email !== email));
  };

  const handleSubmit = async () => {
    setApiError(null);
    setIsSubmitting(true);

    try {
      const result = await onSubmit({ invites });
      if (!result.success) {
        setApiError(result.error || 'エラーが発生しました');
      }
    } catch {
      setApiError('予期しないエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setApiError(null);
    setIsSubmitting(true);

    try {
      await onSkip();
    } catch {
      setApiError('予期しないエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>スタッフを招待</CardTitle>
        <CardDescription>
          一緒に働くスタッフを招待しましょう。後からでも追加できます。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* 招待フォーム */}
          <div className="space-y-4">
            <FormField label="メールアドレス" error={emailError ?? undefined}>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="staff@example.com"
                disabled={isSubmitting}
              />
            </FormField>

            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  役割
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as StaffRole)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSubmitting}
                >
                  {AVAILABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddInvite}
                disabled={isSubmitting}
              >
                追加
              </Button>
            </div>
          </div>

          {/* 招待リスト */}
          {invites.length > 0 && (
            <div className="border rounded-md divide-y">
              {invites.map((invite) => (
                <div
                  key={invite.email}
                  className="flex items-center justify-between p-3"
                >
                  <div>
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-sm text-gray-500">
                      {ROLE_LABELS[invite.role]}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveInvite(invite.email)}
                    disabled={isSubmitting}
                  >
                    削除
                  </Button>
                </div>
              ))}
            </div>
          )}

          {apiError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{apiError}</p>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleSkip}
              disabled={isSubmitting}
            >
              スキップ
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleSubmit}
              disabled={isSubmitting || invites.length === 0}
            >
              {isSubmitting ? '送信中...' : `${invites.length}名を招待`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
