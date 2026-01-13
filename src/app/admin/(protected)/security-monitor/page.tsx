/**
 * セキュリティモニタリングダッシュボード
 * Phase 3 M3: 監査ログ・セキュリティイベント可視化
 * 更新: セキュリティ監視運用_MVP仕様書対応
 * DOD-09: useUserProfileContext経由でclinic_id取得（直接Supabaseアクセス排除）
 */

'use client';

import React from 'react';
import { SecurityDashboard } from '@/components/admin/SecurityDashboard';
import { Shield, Activity } from 'lucide-react';
import { useUserProfileContext } from '@/providers/user-profile-context';

export default function SecurityMonitorPage() {
  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useUserProfileContext();

  const clinicId = profile?.clinicId ?? null;

  if (profileLoading) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <Activity className='w-8 h-8 animate-spin text-blue-500' />
        <span className='ml-2 text-gray-600'>読み込み中...</span>
      </div>
    );
  }

  if (profileError || !clinicId) {
    return (
      <div className='container mx-auto p-6'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center'>
            <Shield className='w-16 h-16 text-gray-400 mx-auto mb-4' />
            <h2 className='text-xl font-semibold text-gray-700 mb-2'>
              {profileError || 'アクセス権限がありません'}
            </h2>
            <p className='text-gray-500'>
              セキュリティモニタリングを表示するには、管理者としてログインしてください。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto p-6'>
      <SecurityDashboard clinicId={clinicId} />
    </div>
  );
}
