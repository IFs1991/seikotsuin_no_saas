'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  OnboardingStep,
  OnboardingStatusResponse,
  ProfileFormData,
  ProfileUpdateResponse,
  ClinicFormData,
  ClinicCreateResponse,
  InvitesFormData,
  InvitesResponse,
  SeedFormData,
  SeedResponse,
} from '@/types/onboarding';

interface OnboardingState {
  status: OnboardingStatusResponse['data'] | null;
  isLoading: boolean;
  error: string | null;
}

export function useOnboarding() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>({
    status: null,
    isLoading: true,
    error: null,
  });

  // stale closure対策: 最新のステータスを参照
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  // ステータス取得
  const fetchStatus = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const res = await fetch('/api/onboarding/status', {
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 401) {
          setState(prev => ({
            ...prev,
            error: '認証が必要です',
            status: null,
          }));
          return;
        }
        throw new Error('ステータス取得に失敗しました');
      }

      const json: OnboardingStatusResponse = await res.json();

      if (json.success && json.data) {
        setState(prev => ({ ...prev, status: json.data ?? null, error: null }));
      } else {
        setState(prev => ({
          ...prev,
          error: json.error || 'エラーが発生しました',
        }));
      }
    } catch (err) {
      console.error('useOnboarding fetchStatus error:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // プロフィール更新
  const updateProfile = useCallback(
    async (data: ProfileFormData): Promise<ProfileUpdateResponse> => {
      try {
        const res = await fetch('/api/onboarding/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        const json: ProfileUpdateResponse = await res.json();

        if (json.success && json.data) {
          setState(prev => ({
            ...prev,
            status: prev.status
              ? { ...prev.status, current_step: json.data!.next_step }
              : null,
          }));
        }

        return json;
      } catch (err) {
        console.error('updateProfile error:', err);
        return {
          success: false,
          error:
            err instanceof Error
              ? err.message
              : 'プロフィール更新に失敗しました',
        };
      }
    },
    []
  );

  // クリニック作成
  const createClinic = useCallback(
    async (data: ClinicFormData): Promise<ClinicCreateResponse> => {
      try {
        const res = await fetch('/api/onboarding/clinic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        const json: ClinicCreateResponse = await res.json();

        if (json.success && json.data) {
          setState(prev => ({
            ...prev,
            status: prev.status
              ? {
                  ...prev.status,
                  current_step: json.data!.next_step,
                  clinic_id: json.data!.clinic_id,
                }
              : null,
          }));
        }

        return json;
      } catch (err) {
        console.error('createClinic error:', err);
        return {
          success: false,
          error:
            err instanceof Error ? err.message : 'クリニック作成に失敗しました',
        };
      }
    },
    []
  );

  // スタッフ招待
  const inviteStaff = useCallback(
    async (data: InvitesFormData): Promise<InvitesResponse> => {
      try {
        const res = await fetch('/api/onboarding/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        const json: InvitesResponse = await res.json();

        if (json.success && json.data) {
          setState(prev => ({
            ...prev,
            status: prev.status
              ? { ...prev.status, current_step: json.data!.next_step }
              : null,
          }));
        }

        return json;
      } catch (err) {
        console.error('inviteStaff error:', err);
        return {
          success: false,
          error:
            err instanceof Error ? err.message : 'スタッフ招待に失敗しました',
        };
      }
    },
    []
  );

  // 初期マスタ投入
  const seedMaster = useCallback(
    async (data: SeedFormData): Promise<SeedResponse> => {
      try {
        const res = await fetch('/api/onboarding/seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        const json: SeedResponse = await res.json();

        if (json.success && json.data?.completed) {
          setState(prev => ({
            ...prev,
            status: prev.status
              ? { ...prev.status, current_step: 'completed', completed: true }
              : null,
          }));
        }

        return json;
      } catch (err) {
        console.error('seedMaster error:', err);
        return {
          success: false,
          error:
            err instanceof Error ? err.message : '初期マスタ投入に失敗しました',
        };
      }
    },
    []
  );

  // ステップへ移動（UI用）
  const goToStep = useCallback((step: OnboardingStep) => {
    setState(prev => ({
      ...prev,
      status: prev.status ? { ...prev.status, current_step: step } : null,
    }));
  }, []);

  // 現在のステップをスキップ
  const skipCurrentStep = useCallback(async () => {
    // refを使用して最新の値を参照
    const currentStep = statusRef.current?.current_step;

    if (currentStep === 'invites') {
      // 招待ステップはスキップ可能
      const result = await inviteStaff({ invites: [] });
      return result;
    }

    // 他のステップはスキップ不可
    throw new Error('このステップはスキップできません');
  }, [inviteStaff]);

  // 完了時のリダイレクト
  const redirectToDashboard = useCallback(() => {
    router.push('/dashboard');
  }, [router]);

  // 初回マウント時にステータス取得
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // 完了時に自動リダイレクト
  useEffect(() => {
    if (state.status?.completed) {
      redirectToDashboard();
    }
  }, [state.status?.completed, redirectToDashboard]);

  return {
    // 状態
    status: state.status,
    isLoading: state.isLoading,
    error: state.error,

    // アクション
    fetchStatus,
    updateProfile,
    createClinic,
    inviteStaff,
    seedMaster,

    // ナビゲーション
    goToStep,
    skipCurrentStep,
    redirectToDashboard,
  };
}
