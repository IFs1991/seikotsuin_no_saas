/**
 * セッション管理ページ
 * ユーザーが自分のセッションとセキュリティを管理するためのメインページ
 */

import React from 'react';
import {
  createClient,
  getCurrentUser,
  getUserAccessContext,
} from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { SessionManager } from '@/components/session/SessionManager';
import { withAuthorityUnavailableRedirect } from '@/lib/auth/authority-unavailable';

export default async function SessionManagementPage() {
  const supabase = await createClient();

  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect('/admin/login?redirectTo=/admin/session-management');
  }

  const accessContext = await withAuthorityUnavailableRedirect(() =>
    getUserAccessContext(user.id, supabase, { user })
  );
  if (!accessContext.permissions || !accessContext.isActive) {
    redirect('/unauthorized');
  }

  const clinicId =
    accessContext.clinicId ??
    accessContext.permissions.clinic_scope_ids?.[0] ??
    null;
  if (!clinicId || !accessContext.normalizedRole) {
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
            <p>権限: {accessContext.normalizedRole}</p>
          </div>
        </div>
      </div>

      {/* セッションマネージャーコンポーネント */}
      <SessionManager
        userId={user.id}
        clinicId={clinicId}
        userRole={accessContext.normalizedRole}
      />
    </div>
  );
}

// メタデータ設定
export const metadata = {
  title: 'セッション管理 | 整骨院管理SaaS',
  description: 'アクティブなセッションとセキュリティ設定を管理',
};
