/**
 * セッション管理ページ
 * ユーザーが自分のセッションとセキュリティを管理するためのメインページ
 */

import React from 'react';
import { createClient } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { SessionManager } from '@/components/session/SessionManager';
import type { Database } from '@/types/supabase';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type SessionProfile = Pick<ProfileRow, 'clinic_id' | 'role'>;

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
  const profileResponse = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  const profile = profileResponse.data as SessionProfile | null;

  if (profileResponse.error || !profile) {
    redirect('/admin/login?error=profile_not_found');
  }

  if (!profile.clinic_id) {
    redirect('/admin/login?error=clinic_not_assigned');
  }

  const displayName =
    (typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : null) ??
    user.email ??
    'ログインユーザー';

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
            <p>ログインユーザー: {displayName}</p>
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
