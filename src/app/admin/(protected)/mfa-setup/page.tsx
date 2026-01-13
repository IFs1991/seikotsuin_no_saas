/**
 * MFA設定ページ
 * Phase 3B: MFA設定専用管理画面
 * 認証コンテキスト連携 MVP: profile から userId/clinicId/role を取得
 * @spec docs/stabilization/spec-auth-role-alignment-v0.1.md
 */

'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MFADashboard } from '@/components/mfa/MFADashboard';
import { Card } from '@/components/ui/card';
import { Shield, Info } from 'lucide-react';
import { useUserProfileContext } from '@/providers/user-profile-context';
import { ADMIN_UI_ROLES, type Role } from '@/lib/constants/roles';

export default function MFASetupPage() {
  const router = useRouter();

  // 認証コンテキストからプロフィールを取得
  const { profile, loading, error } = useUserProfileContext();

  // プロフィールから値を取得
  const userId = profile?.id ?? '';
  const clinicId = profile?.clinicId ?? '';
  const role = profile?.role ?? '';

  // isAdmin は role 判定で決定
  const isAdmin = ADMIN_UI_ROLES.has(role as Role);

  // clinicId未割当フラグ
  const isClinicAssigned = Boolean(clinicId);

  // 権限チェック: admin / clinic_admin 以外は unauthorized へ遷移
  useEffect(() => {
    if (!loading && profile) {
      if (!ADMIN_UI_ROLES.has((profile.role ?? '') as Role)) {
        router.push('/unauthorized');
      }
    } else if (!loading && !profile) {
      // プロフィールがnullの場合も unauthorized へ
      router.push('/unauthorized');
    }
  }, [loading, profile, router]);

  // プロフィール読み込み中
  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-screen bg-gray-50'>
        <div className='text-gray-600'>読み込み中...</div>
      </div>
    );
  }

  // プロフィール取得エラー
  if (error) {
    return (
      <div className='flex items-center justify-center min-h-screen bg-gray-50'>
        <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
          <p className='text-red-600'>{error}</p>
        </div>
      </div>
    );
  }

  // 権限がない場合は何も表示しない（遷移中）
  if (!profile || !ADMIN_UI_ROLES.has((profile.role ?? '') as Role)) {
    return null;
  }

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* ヘッダー */}
      <div className='bg-white border-b'>
        <div className='max-w-4xl mx-auto px-4 py-6'>
          <div className='flex items-center space-x-3'>
            <div className='w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center'>
              <Shield className='w-6 h-6 text-blue-600' />
            </div>
            <div>
              <h1 className='text-2xl font-bold text-gray-900'>
                多要素認証（MFA）設定
              </h1>
              <p className='text-gray-600'>
                アカウントのセキュリティを強化しましょう
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className='max-w-4xl mx-auto px-4 py-8'>
        {/* clinicId未割当時の案内メッセージ */}
        {!isClinicAssigned && (
          <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4'>
            <p className='text-yellow-700'>
              クリニックが割り当てられていません。管理者に権限割当を依頼してください。
            </p>
          </div>
        )}

        {/* 情報カード */}
        <Card className='p-6 mb-8 border-blue-200 bg-blue-50'>
          <div className='flex items-start space-x-3'>
            <Info className='w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5' />
            <div>
              <h3 className='font-medium text-blue-900 mb-2'>
                多要素認証（MFA）について
              </h3>
              <p className='text-blue-800 mb-3'>
                MFAは、パスワードに加えて追加の認証要素を要求することで、アカウントのセキュリティを大幅に向上させます。
              </p>
              <ul className='text-sm text-blue-800 space-y-1'>
                <li>• 不正アクセスのリスクを99.9%削減</li>
                <li>• フィッシング攻撃やパスワード漏洩からの保護</li>
                <li>• 医療データへの不正アクセス防止</li>
                <li>• 業界標準のセキュリティ要件を満たす</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* MFA管理ダッシュボード */}
        <MFADashboard
          userId={userId}
          clinicId={clinicId}
          isAdmin={isAdmin}
          data-testid='mfa-dashboard'
        />
      </div>
    </div>
  );
}
