'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboarding } from '@/hooks/useOnboarding';
import {
  OnboardingProgress,
  ProfileStep,
  ClinicStep,
  InvitesStep,
  SeedStep,
  CompletedStep,
} from '@/components/onboarding';

export default function OnboardingPage() {
  const router = useRouter();
  const {
    status,
    isLoading,
    error,
    updateProfile,
    createClinic,
    inviteStaff,
    seedMaster,
    skipCurrentStep,
    redirectToDashboard,
  } = useOnboarding();

  // 認証エラー時はログインページへリダイレクト
  useEffect(() => {
    if (error === '認証が必要です') {
      router.push('/admin/login?redirect=/onboarding');
    }
  }, [error, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg max-w-md">
            <h2 className="text-lg font-medium text-red-800 mb-2">エラーが発生しました</h2>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const currentStep = status?.current_step || 'profile';

  const renderStep = () => {
    switch (currentStep) {
      case 'profile':
        return <ProfileStep onSubmit={updateProfile} />;
      case 'clinic':
        return <ClinicStep onSubmit={createClinic} />;
      case 'invites':
        return <InvitesStep onSubmit={inviteStaff} onSkip={skipCurrentStep} />;
      case 'seed':
        return <SeedStep onSubmit={seedMaster} />;
      case 'completed':
        return <CompletedStep onContinue={redirectToDashboard} />;
      default:
        return <ProfileStep onSubmit={updateProfile} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            クリニックセットアップ
          </h1>
          <p className="mt-2 text-gray-600">
            初期設定を完了して、システムを使い始めましょう
          </p>
        </div>

        {/* 進捗インジケータ */}
        {currentStep !== 'completed' && (
          <div className="mb-8">
            <OnboardingProgress currentStep={currentStep} />
          </div>
        )}

        {/* ステップコンテンツ */}
        <div className="mb-8">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
