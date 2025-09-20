/**
 * セッション管理ページ
 * ユーザーが自分のセッションとセキュリティを管理するためのメインページ
 */

import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SessionManager } from '@/components/session/SessionManager';

export default async function SessionManagementPage() {
  const supabase = await createClient();

  // ユーザー認証確認
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/admin/login?redirectTo=/admin/session-management');
  }

  // ユーザープロファイル取得
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role, full_name')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    redirect('/admin/login?error=profile_not_found');
  }

  return (
    <div className='container mx-auto px-4 py-8 max-w-6xl'>
      {/* ページヘッダー */}
      <div className='mb-8'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-3xl font-bold text-gray-900'>セッション管理</h1>
            <p className='text-gray-600 mt-2'>
              アクティブなセッションとセキュリティ設定を管理します
            </p>
          </div>

          <div className='text-right text-sm text-gray-500'>
            <p>ログインユーザー: {profile.full_name}</p>
            <p>権限: {profile.role}</p>
          </div>
        </div>
      </div>

      {/* セッションマネージャーコンポーネント */}
      <SessionManager
        userId={user.id}
        clinicId={profile.clinic_id}
        userRole={profile.role}
      />
    </div>
  );
}

// メタデータ設定
export const metadata = {
  title: 'セッション管理 | 整骨院管理SaaS',
  description: 'アクティブなセッションとセキュリティ設定を管理',
};
